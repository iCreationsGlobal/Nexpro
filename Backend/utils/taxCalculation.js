const { getEffectiveTaxRatePercent } = require('./taxConfig');

/**
 * Split a tax total across enabled levies by rate share.
 * @param {number} taxAmount
 * @param {Array<{ code: string, label: string, ratePercent: number, enabled?: boolean }>} levies
 * @param {number} rate
 * @returns {Array<{ code: string, label: string, ratePercent: number, amount: number }>}
 */
function allocateLevyAmounts(taxAmount, levies, rate) {
  const round2 = (x) => Math.round(parseFloat(x) * 100) / 100;
  const active = (Array.isArray(levies) ? levies : []).filter(
    (l) => l && l.enabled !== false && (parseFloat(l.ratePercent) || 0) > 0
  );
  if (active.length === 0 || taxAmount <= 0 || rate <= 0) {
    return active.map((l) => ({
      code: l.code,
      label: l.label,
      ratePercent: parseFloat(l.ratePercent) || 0,
      amount: 0,
    }));
  }
  let allocated = 0;
  return active.map((l, idx) => {
    const levyRate = parseFloat(l.ratePercent) || 0;
    let amount;
    if (idx === active.length - 1) {
      amount = round2(taxAmount - allocated);
    } else {
      amount = round2(taxAmount * (levyRate / rate));
      allocated += amount;
    }
    return {
      code: l.code,
      label: l.label,
      ratePercent: levyRate,
      amount,
    };
  });
}

/**
 * Tenant tax math — discount before tax.
 *
 * Supports Ghana multi-levy via config.levies (summed into effective rate).
 *
 * @param {object} params
 * @param {Array<{ quantity: number, unitPrice: number, discount?: number }>} params.lines
 * @param {number} [params.cartDiscount]
 * @param {{ enabled: boolean, defaultRatePercent: number, pricesAreTaxInclusive: boolean, levies?: Array }} params.config
 * @returns {{ subtotal: number, discount: number, lineDiscountSum: number, cartDiscount: number, netTaxable: number, taxAmount: number, total: number, appliedRatePercent: number, levies: Array, lineResults: Array<{ exclusive: number, tax: number, gross: number }> }}
 */
function computeDocumentTax({ lines = [], cartDiscount = 0, config }) {
  const enabled = config?.enabled === true;
  const rate = enabled ? getEffectiveTaxRatePercent(config) : 0;
  const inclusive = config?.pricesAreTaxInclusive === true;

  const round2 = (x) => Math.round(parseFloat(x) * 100) / 100;

  let lineDiscountSum = 0;
  const prepared = (lines || []).map((line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    const disc = Math.max(0, parseFloat(line.discount) || 0);
    lineDiscountSum += disc;
    const lineGross = Math.max(0, round2(qty * price - disc));
    return { qty, price, disc, lineGross };
  });

  const sumLineGross = round2(prepared.reduce((s, p) => s + p.lineGross, 0));
  const cartDisc = Math.max(0, round2(parseFloat(cartDiscount) || 0));
  const netAfterCart = Math.max(0, round2(sumLineGross - cartDisc));

  /** @type {Array<{ exclusive: number, tax: number, gross: number }>} */
  let lineResults = [];

  if (!enabled || rate <= 0) {
    lineResults = prepared.map((p) => ({
      exclusive: p.lineGross,
      tax: 0,
      gross: p.lineGross
    }));
    const subtotal = round2(prepared.reduce((s, p) => s + p.qty * p.price, 0));
    return {
      subtotal,
      discount: round2(lineDiscountSum + cartDisc),
      lineDiscountSum: round2(lineDiscountSum),
      cartDiscount: cartDisc,
      netTaxable: netAfterCart,
      taxAmount: 0,
      total: netAfterCart,
      appliedRatePercent: 0,
      levies: [],
      lineResults
    };
  }

  if (!inclusive) {
    const preCartNet = sumLineGross;
    const taxAmount = round2(netAfterCart * (rate / 100));
    const total = round2(netAfterCart + taxAmount);
    const shareBase = preCartNet > 0 ? preCartNet : 1;
    let allocated = 0;
    lineResults = prepared.map((p, idx) => {
      const share = preCartNet > 0 ? p.lineGross / shareBase : 1 / prepared.length;
      const lineNetAfterCart = round2(netAfterCart * share);
      let lineTax = round2(taxAmount * share);
      if (idx === prepared.length - 1) {
        lineTax = round2(taxAmount - allocated);
      } else {
        allocated += lineTax;
      }
      return {
        exclusive: lineNetAfterCart,
        tax: lineTax,
        gross: lineNetAfterCart
      };
    });
    const subtotal = round2(prepared.reduce((s, p) => s + p.qty * p.price, 0));
    return {
      subtotal,
      discount: round2(lineDiscountSum + cartDisc),
      lineDiscountSum: round2(lineDiscountSum),
      cartDiscount: cartDisc,
      netTaxable: netAfterCart,
      taxAmount,
      total,
      appliedRatePercent: rate,
      levies: allocateLevyAmounts(taxAmount, config.levies, rate),
      lineResults
    };
  }

  // Inclusive: scaled line grosses (after cart), then split total into exclusive + tax once
  const sumGrossPreCart = sumLineGross;
  const factor = sumGrossPreCart > 0 ? netAfterCart / sumGrossPreCart : 0;
  const scaledGrosses = prepared.map((p) => round2(p.lineGross * factor));
  const Gtot = round2(scaledGrosses.reduce((s, g) => s + g, 0));
  const exclusiveTotal = round2(Gtot / (1 + rate / 100));
  const taxTotal = round2(Gtot - exclusiveTotal);

  let excRun = 0;
  let taxRun = 0;
  lineResults = scaledGrosses.map((g, idx) => {
    const isLast = idx === scaledGrosses.length - 1;
    if (isLast) {
      return {
        exclusive: round2(exclusiveTotal - excRun),
        tax: round2(taxTotal - taxRun),
        gross: g
      };
    }
    const share = Gtot > 0 ? g / Gtot : 1 / scaledGrosses.length;
    const ex = round2(exclusiveTotal * share);
    const tx = round2(taxTotal * share);
    excRun += ex;
    taxRun += tx;
    return { exclusive: ex, tax: tx, gross: g };
  });

  const taxAmount = taxTotal;
  const netTaxableExclusive = exclusiveTotal;
  const subtotal = round2(prepared.reduce((s, p) => s + p.qty * p.price, 0));

  return {
    subtotal,
    discount: round2(lineDiscountSum + cartDisc),
    lineDiscountSum: round2(lineDiscountSum),
    cartDiscount: cartDisc,
    netTaxable: netTaxableExclusive,
    taxAmount,
    total: netAfterCart,
    appliedRatePercent: rate,
    levies: allocateLevyAmounts(taxAmount, config.levies, rate),
    lineResults
  };
}

/**
 * Quote / invoice-style: gross line subtotal and discount total (quote discount), then tax.
 * @param {object} params
 * @param {number} params.subtotal - sum(qty*unitPrice)
 * @param {number} params.discountTotal - sum(line discounts) + quote-level discount
 * @param {{ enabled: boolean, defaultRatePercent: number, pricesAreTaxInclusive: boolean }} params.config
 * @param {number} [params.taxRateOverride] - if set, use this % instead of config default (still 0 if !enabled)
 */
function computeTotalsFromSubtotalAndDiscount({ subtotal, discountTotal, config, taxRateOverride }) {
  const lines = [
    {
      quantity: 1,
      unitPrice: parseFloat(subtotal) || 0,
      discount: Math.max(0, parseFloat(discountTotal) || 0)
    }
  ];
  const cfg = { ...config };
  if (taxRateOverride !== undefined && taxRateOverride !== null && taxRateOverride !== '') {
    const r = parseFloat(taxRateOverride);
    if (Number.isFinite(r) && r >= 0) {
      cfg.defaultRatePercent = Math.min(100, r);
    }
  }
  return computeDocumentTax({ lines, cartDiscount: 0, config: cfg });
}

/**
 * Quote header: gross subtotal, line discount sum, tenant tax config, optional rate override.
 * @returns {{ taxAmount: number, total: number, appliedTaxRate: number, netTaxable: number }}
 */
/**
 * When catalog prices are tax-inclusive, convert line totals to tax-exclusive for invoice storage.
 * @param {Array<{ quantity?: number, unitPrice?: number, total?: number }>} items
 * @param {number} ratePercent
 * @returns {{ items: typeof items, subtotal: number, discountTotal: number }}
 */
function convertLineItemsFromTaxInclusive(items, ratePercent) {
  const r = parseFloat(ratePercent) || 0;
  const round2 = (value) => Math.round((parseFloat(value) || 0) * 100) / 100;
  if (!Array.isArray(items) || items.length === 0) {
    return { items: items ? [...items] : [], subtotal: 0, discountTotal: 0 };
  }
  if (r <= 0) {
    const sub = items.reduce((s, it) => s + (parseFloat(it.total) || 0), 0);
    const discountTotal = items.reduce((s, it) => s + (parseFloat(it.discountAmount || it.discount || 0) || 0), 0);
    return { items: [...items], subtotal: round2(sub), discountTotal: round2(discountTotal) };
  }
  const f = 1 / (1 + r / 100);
  let subtotal = 0;
  let discountTotal = 0;
  const out = items.map((it) => {
    const qty = parseFloat(it.quantity) || 1;
    const grossUnitPrice = parseFloat(it.unitPrice) || 0;
    const grossLineSubtotal = round2(qty * grossUnitPrice);
    const providedTotal = it.total !== undefined && it.total !== null
      ? parseFloat(it.total)
      : grossLineSubtotal;
    const explicitDiscount = parseFloat(it.discountAmount || it.discount || 0) || 0;
    const derivedDiscount = Math.max(0, grossLineSubtotal - (Number.isFinite(providedTotal) ? providedTotal : grossLineSubtotal));
    const grossDiscount = explicitDiscount > 0 ? explicitDiscount : derivedDiscount;
    const exclusiveLineSubtotal = round2(grossLineSubtotal * f);
    const exclusiveDiscount = round2(grossDiscount * f);
    const total = Math.max(0, round2(exclusiveLineSubtotal - exclusiveDiscount));
    const unitPrice = qty > 0 ? round2(exclusiveLineSubtotal / qty) : exclusiveLineSubtotal;

    subtotal += exclusiveLineSubtotal;
    discountTotal += exclusiveDiscount;
    return {
      ...it,
      unitPrice,
      discountAmount: exclusiveDiscount,
      total
    };
  });
  return {
    items: out,
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal)
  };
}

function computeQuoteTaxSummary(subtotal, discountTotal, taxConfig, taxRateOverride) {
  const cfg = { ...taxConfig };
  let appliedTaxRate = 0;
  if (cfg.enabled) {
    if (taxRateOverride !== undefined && taxRateOverride !== null && taxRateOverride !== '') {
      const r = parseFloat(taxRateOverride);
      appliedTaxRate = Number.isFinite(r) ? Math.min(100, Math.max(0, r)) : cfg.defaultRatePercent;
    } else {
      appliedTaxRate = cfg.defaultRatePercent;
    }
  }
  cfg.defaultRatePercent = appliedTaxRate;
  const ct = computeTotalsFromSubtotalAndDiscount({
    subtotal,
    discountTotal,
    config: cfg,
    taxRateOverride: appliedTaxRate
  });
  return {
    taxAmount: ct.taxAmount,
    total: ct.total,
    appliedTaxRate: cfg.enabled ? appliedTaxRate : 0,
    netTaxable: ct.netTaxable
  };
}

module.exports = {
  computeDocumentTax,
  computeTotalsFromSubtotalAndDiscount,
  computeQuoteTaxSummary,
  convertLineItemsFromTaxInclusive,
  allocateLevyAmounts,
};
