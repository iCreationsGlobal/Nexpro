/**
 * ABS product support knowledge for Ayebia (how-to and navigation).
 * Injected into the AI system prompt so answers stay accurate and on-brand.
 */

const COMMON = `
## Ayebia — product support (all business types)
- Introduce yourself only as "Ayebia" when needed.
- Dashboard: view revenue, expenses, profit, comparisons, quick actions, and AI insight.
- Customers: add/edit customers, search, view history. Mobile: Customers tab. Web: Customers in sidebar.
- Settings / Workspace: update business profile, logo, tax, payment methods, team (web), shop/branch (multi-shop).
- Notifications: bell icon opens alerts and activity.
- Ask Ayebia / Chat: business questions, summaries, predictions (estimates), how-to help, draft customer messages.

## Invoices
- Create: Invoices → New invoice, pick customer, add line items, save.
- Send: open invoice → Send (email if configured).
- Record payment: open invoice → Record Payment, enter amount and method.
- Outstanding: filter by unpaid/partial; use receivables data in answers when available.

## Expenses
- Add: Expenses → Add expense, category, amount, date, optional receipt.
- Review: filter by date/category; compare to revenue on Dashboard or Reports.

## Quotes (studio / when enabled)
- Create: Quotes → New quote, customer, line items, send or convert to job/invoice.

## Marketing (web)
- Bulk email/SMS: Marketing → choose channel, subject, message; use drafts from Ask Ayebia (Subject: line format).
`;

const RETAIL = `
## Retail shop / pharmacy
- Sales / POS: record sales at point of sale; scan products (mobile center Scan tab).
- Products: manage catalog, prices, stock, reorder levels.
- Low stock: Dashboard may show alerts; Products list shows quantity vs reorder level.
- Materials: optional inventory for supplies (Materials page).
`;

const STUDIO = `
## Studio (printing press, mechanic, barber, salon)
- Jobs: create and track jobs through statuses (new → in progress → completed).
- New job: Jobs → Create Job or mobile center action (Add Job).
- Quotes: create quotes before jobs when quote automation is enabled.
- Invoices: bill from completed jobs or standalone invoices.
`;

/**
 * @param {string} businessType
 * @returns {string}
 */
function getAssistantSupportGuide(businessType = 'printing_press') {
  const isRetail = businessType === 'shop' || businessType === 'pharmacy';
  const isStudio = ['printing_press', 'mechanic', 'barber', 'salon', 'studio'].includes(businessType);

  let guide = COMMON;
  if (isRetail) guide += RETAIL;
  if (isStudio) guide += STUDIO;

  guide += `
## Answer style for support questions
- Use short numbered steps (1. 2. 3.).
- Name the exact menu or page in ABS.
- If a feature is not available for this business type, say so and suggest the closest alternative.
`;

  return guide.trim();
}

/**
 * Page-aware hint for the model when user opened Ask AI from a specific area.
 * @param {string} [pageContext]
 * @returns {string}
 */
function getPageContextHint(pageContext) {
  const key = String(pageContext || '').trim().toLowerCase();
  const hints = {
    dashboard: 'User is on the Dashboard. Prefer summaries, trends, and quick recommendations for the selected period.',
    sales: 'User is viewing Sales. Focus on sales totals, trends, top products, and payment status.',
    invoices: 'User is viewing Invoices. Focus on outstanding balances, collections, and payment recording steps.',
    expenses: 'User is viewing Expenses. Focus on spending patterns and cost control.',
    customers: 'User is viewing Customers. Focus on customer growth, top customers, and follow-up ideas.',
    products: 'User is viewing Products. Focus on stock levels, bestsellers, and restock priorities.',
    jobs: 'User is viewing Jobs. Focus on pipeline, due dates, and job workflow.',
    reports: 'User is viewing Reports. Focus on interpretation of metrics, not raw export steps.',
    marketing: 'User is in Marketing. Focus on campaign drafts and ABS Marketing workflow.',
  };
  return hints[key] || '';
}

module.exports = {
  getAssistantSupportGuide,
  getPageContextHint,
};
