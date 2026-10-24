/**
 * The page the person has open, as Lynk AI should know it ("this invoice"): the path, the page's name, and the
 * record it opened when the address says so (?openInvoiceId=…, /expenses?open=…).
 * @param {{ pathname: string, search: string }} location
 * @returns {{ path: string, title?: string, record?: { type: string, id: string } }}
 */
export function pageFromLocation(location) {
  const params = new URLSearchParams(location.search || '');
  const path = `${location.pathname}${location.search || ''}`.slice(0, 300);
  const title = typeof document !== 'undefined' ? document.title.replace(/\s*[|·-]\s*ABS.*$/i, '').trim().slice(0, 200) : '';
  let record = null;
  if (location.pathname.startsWith('/invoices') && params.get('openInvoiceId')) record = { type: 'invoice', id: params.get('openInvoiceId') };
  else if (location.pathname.startsWith('/expenses') && params.get('open')) record = { type: 'expense', id: params.get('open') };
  return { path, ...(title ? { title } : {}), ...(record ? { record } : {}) };
}

/** An address inside ABS that Lynk may move the page to (never another site). */
export const isAbsPath = (path) => typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('..');
