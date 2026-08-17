/**
 * Client-side tax math — mirrors Backend/utils/taxCalculation.js (discount before tax).
 * Used for POS display; server recomputes on sale create.
 */

function getEffectiveTaxRatePercent(config = {}) {
  const levies = Array.isArray(config.levies) ? config.levies : [];
  const active = levies.filter((l) => l && l.enabled !== false && (parseFloat(l.ratePercent) || 0) > 0);
  if (active.length > 0) {
    return active.reduce((sum, l) => sum + (parseFloat(l.ratePercent) || 0), 0);
  }
  const rate = parseFloat(config.defaultRatePercent);
  return Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0;
}

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
      lineResults
    };
  }

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
  const subtotal = round2(prepared.reduce((s, p) => s + p.qty * p.price, 0));

  return {
    subtotal,
    discount: round2(lineDiscountSum + cartDisc),
    lineDiscountSum: round2(lineDiscountSum),
    cartDiscount: cartDisc,
    netTaxable: exclusiveTotal,
    taxAmount,
    total: netAfterCart,
    lineResults
  };
}

export { computeDocumentTax, getEffectiveTaxRatePercent };
