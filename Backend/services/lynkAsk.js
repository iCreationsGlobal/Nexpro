/**
 * ABS answers Lynk AI's questions about a business (Lynk's docs/plan/lynk-ai-for-apps.md, "The questions"), with its
 * own numbers: each answer comes from the same report or list ABS shows, run as the person who opened Lynk AI, in
 * their shop (tenantContext, shopContext and studioLocationContext, as on every ABS request), so Lynk never says a
 * number ABS doesn't. Lists carry `label` and `detail` (what the person sees) and `link` (where it opens in ABS, on
 * the web or in the phone app).
 */
const { Op, fn, col, literal } = require('sequelize');
const { User, Sale, Customer, Invoice } = require('../models');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { studioLocationContext } = require('../middleware/studioLocationContext');
const { getEffectiveRole } = require('../middleware/auth');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { applyShopFilter } = require('../utils/shopUtils');
const { scopedReportWhere } = require('../utils/reportScopeUtils');
const { parseReportDateRange } = require('../utils/reportDateFilter');
const { resolveBusinessType } = require('../config/businessTypes');

class AskError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const DAY = 86_400_000;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const money = (n) => `GH₵${num(n).toLocaleString('en-GH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);
const clip = (s, n = 120) => (typeof s === 'string' ? s.trim().slice(0, n) : s ?? null);
const limitOf = (q, max = 50) => Math.max(1, Math.min(max, Number(q?.limit) || 10));
const isRetail = (req) => ['shop', 'pharmacy'].includes(resolveBusinessType(req.tenant?.businessType));

/** Lynk's whole days (`to` not included) as ABS's report dates (both included). */
function datesOf(period) {
  if (!period?.from || !period?.to || !/^\d{4}-\d{2}-\d{2}$/.test(period.from) || !/^\d{4}-\d{2}-\d{2}$/.test(period.to)) return null;
  const last = new Date(new Date(`${period.to}T00:00:00Z`).getTime() - DAY).toISOString().slice(0, 10);
  return { startDate: period.from, endDate: last < period.from ? period.from : last };
}

/** Where a record opens in ABS: the web page (with its deep link where there is one) or the phone app's screen. */
const LINKS = {
  web: {
    invoice: (id) => `/invoices?openInvoiceId=${encodeURIComponent(id)}`,
    expense: (id) => `/expenses?open=${encodeURIComponent(id)}`,
    customer: () => '/customers',
    product: () => '/products',
    sale: () => '/sales',
    quote: () => '/quotes',
    job: () => '/jobs',
    products: '/products',
    customers: '/customers',
    sales: '/sales',
    invoices: '/invoices',
    expenses: '/expenses',
    reports: '/reports/overview',
  },
  app: {
    invoice: (id) => `/invoice/${encodeURIComponent(id)}`,
    expense: (id) => `/expense/${encodeURIComponent(id)}`,
    customer: (id) => `/customer/${encodeURIComponent(id)}`,
    product: (id) => `/product/${encodeURIComponent(id)}`,
    sale: (id) => `/sale/${encodeURIComponent(id)}`,
    quote: (id) => `/quote/${encodeURIComponent(id)}`,
    job: (id) => `/job/${encodeURIComponent(id)}`,
    products: '/products',
    customers: '/customers',
    sales: '/sales',
    invoices: '/invoices',
    expenses: '/expenses',
    reports: '/reports',
  },
};

/** Runs one Express middleware on a request made here; rejects with what it would have answered. */
function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    const res = {
      locals: {},
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { reject(new AskError(body?.message || body?.error || 'Not allowed', this.statusCode >= 400 ? this.statusCode : 403)); return this; },
      send(body) { reject(new AskError(typeof body === 'string' ? body : 'Not allowed', this.statusCode >= 400 ? this.statusCode : 403)); return this; },
      setHeader() {},
      set() { return this; },
    };
    Promise.resolve(middleware(req, res, (err) => (err ? reject(err) : resolve()))).catch(reject);
  });
}

/** Runs an ABS controller as if it were asked for by the person; resolves with the JSON body it sends. */
function runHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      locals: {},
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) {
        if (this.statusCode >= 400) reject(new AskError(body?.message || body?.error || 'ABS could not answer that', this.statusCode));
        else resolve(body);
        return this;
      },
      setHeader() {},
      set() { return this; },
    };
    Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve(null)))).catch(reject);
  });
}

/**
 * The person's request context, as ABS builds it on every request: their membership and role in the business, and
 * the shop (or studio location) they had open. Only owners, admins and managers.
 */
async function contextFor({ tenantId, userId, shopId = null, studioLocationId = null }) {
  const user = await User.findByPk(userId);
  if (!user || user.isActive === false) throw new AskError('That person is no longer active in ABS', 403);
  const headers = { 'x-tenant-id': String(tenantId), ...(shopId ? { 'x-shop-id': String(shopId) } : {}), ...(studioLocationId ? { 'x-studio-location-id': String(studioLocationId) } : {}) };
  const req = {
    user,
    headers,
    method: 'GET',
    baseUrl: '/api/lynk',
    path: '/ask',
    originalUrl: '/api/lynk/ask',
    url: '/ask',
    query: {},
    params: {},
    body: {},
    ip: '127.0.0.1',
    get(name) { return this.headers[String(name).toLowerCase()]; },
    header(name) { return this.headers[String(name).toLowerCase()]; },
  };
  await runMiddleware(tenantContext, req);
  await runMiddleware(shopContext, req);
  await runMiddleware(studioLocationContext, req);
  if (!['admin', 'manager'].includes(getEffectiveRole(req))) throw new AskError('Lynk AI is for owners and managers', 403);
  return req;
}

/** The same request, asking for something else (its own query and params). */
const asking = (ctx, query = {}, params = {}) => Object.assign(Object.create(Object.getPrototypeOf(ctx)), ctx, { query: { ...query }, params: { ...params } });

const controller = (name) => require(`../controllers/${name}`);

/** How many items were sold, and to how many customers: ABS's product sales report and its sales. */
async function soldCounts(ctx, dates) {
  const { getProductSalesReport } = controller('reportController');
  const [report, customersCount] = await Promise.all([
    runHandler(getProductSalesReport, asking(ctx, dates)),
    Sale.count({
      distinct: true,
      col: 'customerId',
      where: applyShopFilter(ctx, applyTenantFilter(ctx.tenantId, {
        status: 'completed',
        deletedAt: null,
        customerId: { [Op.ne]: null },
        createdAt: parseReportDateRange(dates.startDate, dates.endDate),
      })),
    }),
  ]);
  return { items_sold: num(report?.data?.totalQuantitySold), customers: num(customersCount) };
}

async function summary(ctx, q, links, client) {
  const now = datesOf(q.period);
  const before = datesOf(q.period?.previous);
  if (!now) throw new AskError('A period is needed');
  const { getOverviewExtendedKpis } = controller('reportController');
  const kpis = await runHandler(getOverviewExtendedKpis, asking(ctx, { ...now, ...(before ? { compareStartDate: before.startDate, compareEndDate: before.endDate } : {}) }));
  const salesCount = async (dates) => {
    if (!dates || !isRetail(ctx)) return null;
    const { getSales } = controller('saleController');
    const body = await runHandler(getSales, asking(ctx, { ...dates, limit: 1, page: 1 }));
    return num(body?.summary?.completedCount);
  };
  // On WhatsApp the summary also says how many items were sold, and to how many customers.
  const sold = async (dates) => (dates && client === 'whatsapp' && isRetail(ctx) ? soldCounts(ctx, dates) : {});
  const [countNow, countBefore, soldNow, soldBefore] = await Promise.all([salesCount(now), salesCount(before), sold(now), sold(before)]);
  const shape = (m, count, counts) => (m ? {
    sales_total: num(m.totalRevenue),
    ...(count !== null ? { sales_count: count } : {}),
    ...counts,
    average_sale: num(m.averageInvoiceValue),
    expenses_total: num(m.operatingExpenses),
    cost_of_goods: num(m.cogs),
    gross_profit: num(m.grossProfit),
    net_profit: num(m.netProfit),
    new_customers: num(m.newCustomers),
  } : null);
  const data = kpis?.data || {};
  return {
    period: q.period.label,
    revenue_from: data.current?.revenueSource === 'invoices' ? 'payments on invoices' : 'completed sales',
    current: shape(data.current, countNow, soldNow),
    previous: shape(data.previous, countBefore, soldBefore),
    money_owed_total: num(data.current?.totalOutstanding),
    currency: 'GHS',
    link: links.reports,
  };
}

async function topProducts(ctx, q, links) {
  const dates = datesOf(q.period);
  const { getProductSalesReport } = controller('reportController');
  const body = await runHandler(getProductSalesReport, asking(ctx, dates || {}));
  const rows = [...(body?.data?.products || [])];
  if (q.by === 'quantity') rows.sort((a, b) => num(b.quantitySold) - num(a.quantitySold));
  return {
    period: q.period?.label,
    count: rows.length,
    total_revenue: num(body?.data?.totalRevenue),
    items: rows.slice(0, limitOf(q)).map((p) => ({
      label: clip(p.productName),
      detail: `${num(p.quantitySold)} ${p.unit || 'pcs'} sold · ${money(p.revenue)}`,
      name: clip(p.productName),
      quantity: num(p.quantitySold),
      revenue: num(p.revenue),
      gross_profit: num(p.grossProfit),
      in_stock: num(p.currentStock),
      link: links.products,
    })),
    link: links.products,
  };
}

async function lowStock(ctx, q, links) {
  const { getProducts, getProductStats } = controller('productController');
  const limit = limitOf(q);
  const [out, low, stats] = await Promise.all([
    runHandler(getProducts, asking(ctx, { outOfStock: 'true', isActive: 'true', limit, page: 1 })),
    runHandler(getProducts, asking(ctx, { lowStock: 'true', isActive: 'true', limit, page: 1 })),
    getProductStats ? runHandler(getProductStats, asking(ctx, {})).catch(() => null) : null,
  ]);
  const rows = [...(out?.data || []), ...(low?.data || [])].slice(0, limit);
  const count = num(out?.count) + num(low?.count);
  return {
    count,
    out_of_stock: num(out?.count),
    ...(stats?.data ? { total_products: num(stats.data.totalProducts ?? stats.data.total) } : {}),
    items: rows.map((p) => {
      const qty = num(p.quantityOnHand);
      return {
        label: clip(p.name),
        detail: qty <= 0 ? 'Out of stock' : `${qty} ${p.unit || 'pcs'} left (reorder at ${num(p.reorderLevel)})`,
        name: clip(p.name),
        quantity: qty,
        reorder_level: num(p.reorderLevel),
        link: links.product(p.id),
      };
    }),
    link: links.products,
  };
}

/** Who owes, one row for each customer, the most owed first: the report's own totals, with their invoices. */
function owedByCustomer(data, links) {
  const invoices = data?.invoices || [];
  const rows = (data?.byCustomer || []).map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
  return rows.map((r) => {
    const theirs = invoices.filter((i) => (i.customerId || null) === (r.customerId || null));
    const name = r.customer?.name || r.customer?.company || 'A customer';
    const count = num(r.invoiceCount) || theirs.length;
    const oldest = theirs.map((i) => i.dueDate).filter(Boolean).map((d) => new Date(d)).sort((a, b) => a - b)[0] || null;
    const late = oldest && oldest.getTime() < Date.now() - DAY;
    const what = count === 1 ? theirs[0]?.invoiceNumber || '1 invoice' : `${count} invoices`;
    return {
      label: clip(name, 60),
      detail: `${money(r.totalOutstanding)} · ${what}${oldest ? ` · ${late ? 'was due' : 'due'} ${day(oldest)}` : ''}`,
      customer: clip(name, 80),
      phone: theirs[0]?.customer?.phone || null,
      amount_due: num(r.totalOutstanding),
      invoices: theirs.slice(0, 10).map((i) => i.invoiceNumber),
      due_date: oldest ? oldest.toISOString().slice(0, 10) : null,
      link: count === 1 && theirs[0] ? links.invoice(theirs[0].id) : links.invoices,
    };
  });
}

async function moneyOwed(ctx, q, links, client) {
  const { getOutstandingPaymentsReport } = controller('reportController');
  const body = await runHandler(getOutstandingPaymentsReport, asking(ctx, {}));
  const invoices = body?.data?.invoices || [];
  const today = Date.now();
  // On WhatsApp "who owes me?" is answered with people; on a screen, with the invoices to open.
  if (client === 'whatsapp') {
    const people = owedByCustomer(body?.data, links);
    return { total_amount: num(body?.data?.totalOutstanding), count: people.length, items: people.slice(0, limitOf(q)), link: links.invoices };
  }
  const daysLate = (due) => (due ? Math.floor((today - new Date(due).getTime()) / DAY) : 0);
  return {
    total_amount: num(body?.data?.totalOutstanding),
    count: invoices.length,
    overdue_count: invoices.filter((i) => daysLate(i.dueDate) > 0).length,
    items: invoices.slice(0, limitOf(q)).map((i) => {
      const late = daysLate(i.dueDate);
      const who = i.customer?.name || i.customer?.company || 'A customer';
      return {
        label: `${i.invoiceNumber} · ${clip(who, 60)}`,
        detail: `${money(i.balance)} due${late > 0 ? `, ${late} day${late === 1 ? '' : 's'} late` : i.dueDate ? `, due ${day(i.dueDate)}` : ''}`,
        number: i.invoiceNumber,
        customer: clip(who, 80),
        phone: i.customer?.phone || null,
        amount_due: num(i.balance),
        total: num(i.totalAmount),
        due_date: i.dueDate ? new Date(i.dueDate).toISOString().slice(0, 10) : null,
        days_overdue: Math.max(0, late),
        link: links.invoice(i.id),
      };
    }),
    link: links.invoices,
  };
}

/** Customers who bought before but not in `days`: by their completed sales (or paid invoices), in the person's shop. */
async function quietCustomers(ctx, q, links) {
  const days = Math.max(7, Math.min(365, Number(q.quiet_days) || 30));
  const cutoff = new Date(Date.now() - days * DAY);
  const limit = limitOf(q);
  const retail = isRetail(ctx);
  const Model = retail ? Sale : Invoice;
  const where = retail
    ? applyShopFilter(ctx, applyTenantFilter(ctx.tenantId, { status: 'completed', deletedAt: null, customerId: { [Op.ne]: null } }))
    : scopedReportWhere(ctx, { amountPaid: { [Op.gt]: 0 }, customerId: { [Op.ne]: null } });
  const at = retail ? col('Sale.createdAt') : literal('COALESCE("Invoice"."paidDate", "Invoice"."updatedAt")');
  const spent = retail ? col('Sale.total') : col('Invoice.amountPaid');
  const alias = retail ? 'Sale' : 'Invoice';
  const rows = await Model.findAll({
    attributes: ['customerId', [fn('MAX', at), 'lastAt'], [fn('SUM', spent), 'spent'], [fn('COUNT', col(`${alias}.id`)), 'times']],
    where,
    group: ['customerId'],
    having: literal(`MAX(${retail ? '"Sale"."createdAt"' : 'COALESCE("Invoice"."paidDate", "Invoice"."updatedAt")'}) < '${cutoff.toISOString()}'`),
    order: [[fn('SUM', spent), 'DESC']],
    raw: true,
  });
  const top = rows.slice(0, limit);
  const people = top.length ? await Customer.findAll({ where: { tenantId: ctx.tenantId, id: { [Op.in]: top.map((r) => r.customerId) } }, attributes: ['id', 'name', 'company', 'phone'], raw: true }) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return {
    count: rows.length,
    quiet_days: days,
    items: top.map((r) => {
      const c = byId.get(r.customerId) || {};
      const away = Math.floor((Date.now() - new Date(r.lastAt).getTime()) / DAY);
      return {
        label: clip(c.name || c.company || 'A customer', 80),
        detail: `Last bought ${away} days ago · ${money(r.spent)} in all`,
        name: clip(c.name || c.company, 80),
        phone: c.phone || null,
        total_spent: num(r.spent),
        purchases: num(r.times),
        last_purchase_at: r.lastAt ? new Date(r.lastAt).toISOString().slice(0, 10) : null,
        link: links.customer(r.customerId),
      };
    }),
    link: links.customers,
  };
}

async function customers(ctx, q, links) {
  if (q.sort === 'quiet') return quietCustomers(ctx, q, links);
  const limit = limitOf(q);
  if (q.sort === 'top' && !q.search) {
    const { getTopCustomers } = controller('reportController');
    const body = await runHandler(getTopCustomers, asking(ctx, { ...(datesOf(q.period) || {}), limit }));
    const rows = (body?.data || []).map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
    return {
      period: q.period?.label,
      count: rows.length,
      items: rows.map((r) => ({
        label: clip(r.customer?.name || r.customer?.company || 'A customer', 80),
        detail: `${money(r.totalRevenue)} · ${num(r.paymentCount)} ${isRetail(ctx) ? 'purchase' : 'payment'}${num(r.paymentCount) === 1 ? '' : 's'}`,
        name: clip(r.customer?.name || r.customer?.company, 80),
        total_spent: num(r.totalRevenue),
        purchases: num(r.paymentCount),
        link: links.customer(r.customerId),
      })),
      link: links.customers,
    };
  }
  const { getCustomers } = controller('customerController');
  const body = await runHandler(getCustomers, asking(ctx, { ...(q.search ? { search: q.search } : {}), limit, page: 1 }));
  const rows = body?.data || [];
  return {
    count: num(body?.count ?? rows.length),
    items: rows.map((c) => ({
      label: clip(c.name || c.company || 'A customer', 80),
      detail: [c.phone, c.createdAt ? `added ${day(c.createdAt)}` : null].filter(Boolean).join(' · '),
      name: clip(c.name || c.company, 80),
      phone: c.phone || null,
      email: c.email || null,
      added_at: c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : null,
      link: links.customer(c.id),
    })),
    link: links.customers,
  };
}

async function sales(ctx, q, links) {
  const limit = limitOf(q);
  if (!isRetail(ctx)) {
    // Studios and others sell by invoice: their newest invoices.
    const { getInvoices } = controller('invoiceController');
    const body = await runHandler(getInvoices, asking(ctx, { ...(q.search ? { search: q.search } : {}), limit, page: 1 }));
    const rows = body?.data || [];
    return {
      kind: 'invoices',
      count: num(body?.count ?? rows.length),
      items: rows.map((i) => ({
        label: `${i.invoiceNumber} · ${clip(i.customer?.name || 'A customer', 60)}`,
        detail: `${money(i.totalAmount)} · ${i.status}${i.invoiceDate ? ` · ${day(i.invoiceDate)}` : ''}`,
        number: i.invoiceNumber,
        customer: clip(i.customer?.name, 80),
        total: num(i.totalAmount),
        paid: num(i.amountPaid),
        status: i.status,
        at: i.invoiceDate || i.createdAt,
        link: links.invoice(i.id),
      })),
      link: links.invoices,
    };
  }
  const { getSales } = controller('saleController');
  const body = await runHandler(getSales, asking(ctx, { ...(datesOf(q.period) || {}), ...(q.search ? { search: q.search } : {}), limit, page: 1 }));
  const rows = body?.data || [];
  return {
    kind: 'sales',
    period: q.period?.label,
    count: num(body?.count ?? rows.length),
    completed_count: num(body?.summary?.completedCount),
    completed_total: num(body?.summary?.completedRevenue),
    items: rows.map((s) => ({
      label: `${s.saleNumber} · ${clip(s.customer?.name || 'Walk-in', 60)}`,
      detail: `${money(s.total)} · ${String(s.status).replace(/_/g, ' ')} · ${day(s.createdAt)}`,
      number: s.saleNumber,
      customer: clip(s.customer?.name, 80),
      total: num(s.total),
      paid: num(s.amountPaid),
      status: s.status,
      payment_method: s.paymentMethod || null,
      at: s.createdAt,
      link: links.sale(s.id),
    })),
    link: links.sales,
  };
}

async function expenses(ctx, q, links) {
  const { getExpenseReport } = controller('reportController');
  const body = await runHandler(getExpenseReport, asking(ctx, datesOf(q.period) || {}));
  const rows = (body?.data?.byCategory || []).map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
  return {
    period: q.period?.label,
    total_amount: num(body?.data?.totalExpenses),
    items: rows.slice(0, limitOf(q)).map((r) => ({ label: clip(r.category || 'Other', 60), detail: `${money(r.totalAmount)} · ${num(r.count)} expense${num(r.count) === 1 ? '' : 's'}`, category: r.category || 'Other', total: num(r.totalAmount), count: num(r.count), link: links.expenses })),
    link: links.expenses,
  };
}

async function products(ctx, q, links) {
  const { getProducts } = controller('productController');
  const body = await runHandler(getProducts, asking(ctx, { ...(q.search ? { search: q.search } : {}), isActive: 'true', limit: limitOf(q), page: 1 }));
  const rows = body?.data || [];
  return {
    count: num(body?.count ?? rows.length),
    items: rows.map((p) => ({
      label: clip(p.name),
      detail: [money(p.sellingPrice), p.trackStock === false ? null : `${num(p.quantityOnHand)} in stock`].filter(Boolean).join(' · '),
      name: clip(p.name),
      price: num(p.sellingPrice),
      ...(p.costPrice !== undefined ? { cost: num(p.costPrice) } : {}),
      stock: p.trackStock === false ? null : num(p.quantityOnHand),
      sku: p.sku || null,
      category: p.category?.name || null,
      link: links.product(p.id),
    })),
    link: links.products,
  };
}

async function find(ctx, q, links) {
  if (!q.search) throw new AskError('Words to look for are needed');
  const limit = Math.min(limitOf(q), 10);
  const [c, p, i, s] = await Promise.all([
    customers(ctx, { ...q, sort: 'recent', limit }, links).catch(() => null),
    products(ctx, { ...q, limit }, links).catch(() => null),
    runHandler(controller('invoiceController').getInvoices, asking(ctx, { search: q.search, limit, page: 1 })).catch(() => null),
    isRetail(ctx) ? runHandler(controller('saleController').getSales, asking(ctx, { search: q.search, limit, page: 1 })).catch(() => null) : null,
  ]);
  const items = [
    ...(c?.items || []).map((x) => ({ type: 'customer', label: x.label, detail: x.detail, link: x.link })),
    ...(p?.items || []).map((x) => ({ type: 'product', label: x.label, detail: x.detail, link: x.link })),
    ...(i?.data || []).map((x) => ({ type: 'invoice', label: `${x.invoiceNumber} · ${clip(x.customer?.name || 'A customer', 60)}`, detail: `${money(x.totalAmount)} · ${x.status}`, link: links.invoice(x.id) })),
    ...(s?.data || []).map((x) => ({ type: 'sale', label: `${x.saleNumber} · ${clip(x.customer?.name || 'Walk-in', 60)}`, detail: `${money(x.total)} · ${x.status}`, link: links.sale(x.id) })),
  ];
  return { count: items.length, items: items.slice(0, Math.max(limit, 10)) };
}

/** One record, for the page the person has open ("this invoice"): its main details, never long lists. */
const RECORDS = {
  invoice: { controller: 'invoiceController', handler: 'getInvoice', label: (r) => `Invoice ${r.invoiceNumber}`, fields: (r) => ({ number: r.invoiceNumber, customer: r.customer?.name, status: r.status, total: num(r.totalAmount), paid: num(r.amountPaid), balance: num(r.balance), invoice_date: r.invoiceDate, due_date: r.dueDate, items: (r.items || []).slice(0, 15).map((it) => ({ name: it.description || it.name, quantity: num(it.quantity), total: num(it.total) })) }) },
  sale: { controller: 'saleController', handler: 'getSale', label: (r) => `Sale ${r.saleNumber}`, fields: (r) => ({ number: r.saleNumber, customer: r.customer?.name || 'Walk-in', status: r.status, total: num(r.total), paid: num(r.amountPaid), payment_method: r.paymentMethod, at: r.createdAt, items: (r.items || []).slice(0, 15).map((it) => ({ name: it.name || it.product?.name, quantity: num(it.quantity), total: num(it.total) })) }) },
  customer: { controller: 'customerController', handler: 'getCustomer', label: (r) => r.name || r.company || 'Customer', fields: (r) => ({ name: r.name, company: r.company, phone: r.phone, email: r.email, added_at: r.createdAt, balance: r.balance !== undefined ? num(r.balance) : undefined }) },
  product: { controller: 'productController', handler: 'getProduct', label: (r) => r.name, fields: (r) => ({ name: r.name, sku: r.sku, price: num(r.sellingPrice), cost: r.costPrice !== undefined ? num(r.costPrice) : undefined, stock: num(r.quantityOnHand), reorder_level: num(r.reorderLevel), unit: r.unit, category: r.category?.name, variants: (r.variants || []).slice(0, 20).map((v) => ({ name: v.name, stock: num(v.quantityOnHand), price: v.sellingPrice != null ? num(v.sellingPrice) : null })) }) },
  quote: { controller: 'quoteController', handler: 'getQuote', label: (r) => `Quote ${r.quoteNumber || r.number || ''}`.trim(), fields: (r) => ({ number: r.quoteNumber || r.number, title: r.title, customer: r.customer?.name, status: r.status, total: num(r.totalAmount ?? r.total), valid_until: r.validUntil }) },
  job: { controller: 'jobController', handler: 'getJob', label: (r) => `Job ${r.jobNumber || ''} ${r.title || ''}`.trim(), fields: (r) => ({ number: r.jobNumber, title: r.title, customer: r.customer?.name, status: r.status, due_date: r.dueDate, total: r.finalPrice != null ? num(r.finalPrice) : undefined }) },
  expense: { controller: 'expenseController', handler: 'getExpense', label: (r) => `Expense ${r.expenseNumber || ''}`.trim(), fields: (r) => ({ number: r.expenseNumber, category: r.category, amount: num(r.amount), date: r.expenseDate, status: r.status, vendor: r.vendor?.name, description: clip(r.description, 300) }) },
};

async function record(ctx, q, links) {
  const kind = RECORDS[q.type];
  if (!kind || !q.id) throw new AskError('That kind of record isn\'t one ABS shows to Lynk');
  const handler = controller(kind.controller)[kind.handler];
  const body = await runHandler(handler, asking(ctx, {}, { id: q.id }));
  const raw = body?.data;
  const r = raw && typeof raw.toJSON === 'function' ? raw.toJSON() : raw;
  if (!r) throw new AskError('That record isn\'t there any more', 404);
  const fields = Object.fromEntries(Object.entries(kind.fields(r)).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return { type: q.type, label: clip(kind.label(r), 120), fields, link: links[q.type](q.id) };
}

const ANSWERS = {
  summary,
  top_products: topProducts,
  low_stock: lowStock,
  money_owed: moneyOwed,
  customers,
  sales,
  expenses,
  products,
  find,
  record,
};

/** Answers one of Lynk's questions for an ABS session (as its person, shop and device). */
async function answerQuestion({ tenantId, userId, shopId, studioLocationId, client }, question) {
  const answer = ANSWERS[question?.kind];
  if (!answer) throw new AskError(`ABS doesn't answer "${question?.kind}" questions`);
  const ctx = await contextFor({ tenantId, userId, shopId, studioLocationId });
  return answer(ctx, question, LINKS[client === 'app' ? 'app' : 'web'], client);
}

module.exports = { answerQuestion, contextFor, datesOf, AskError, LINKS, _private: { runHandler, runMiddleware, asking } };
