import { formatCurrency } from '@/utils/formatCurrency';

/** Matches Backend PRODUCTION_FRONTEND_DEFAULT — used only when payment-link API is unavailable. */
const APP_WEB_URL = 'https://myapp.africanbusinesssuite.com';

export type InvoiceShareInput = {
  id: string;
  invoiceNumber?: string | null;
  total?: number | null;
  totalAmount?: number | null;
  balance?: number | null;
  amountPaid?: number | null;
  paidAmount?: number | null;
  status?: string | null;
  paymentToken?: string | null;
  customer?: {
    name?: string | null;
    company?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

export type InvoiceShareContent = {
  subject: string;
  message: string;
  paymentLink: string | null;
  customerName: string;
};

function getCustomerName(invoice: InvoiceShareInput): string {
  return String(invoice.customer?.name || invoice.customer?.company || 'Customer').trim();
}

function getInvoiceNumber(invoice: InvoiceShareInput): string {
  return String(invoice.invoiceNumber || invoice.id).trim();
}

function getTotalAmount(invoice: InvoiceShareInput): number {
  return Number(invoice.totalAmount ?? invoice.total ?? 0);
}

function getBalance(invoice: InvoiceShareInput): number {
  if (invoice.balance != null && Number.isFinite(Number(invoice.balance))) {
    return Math.max(0, Number(invoice.balance));
  }
  const total = getTotalAmount(invoice);
  const paid = Number(invoice.amountPaid ?? invoice.paidAmount ?? 0);
  return Math.max(0, total - paid);
}

/** Build a public pay-invoice URL from a payment token (fallback when API is unavailable). */
export function buildLocalInvoicePaymentLink(paymentToken: string): string {
  return `${APP_WEB_URL}/pay-invoice/${encodeURIComponent(paymentToken)}`;
}

/** Plain-text invoice message for WhatsApp, SMS, and email. */
export function formatInvoiceShareContent(
  invoice: InvoiceShareInput,
  paymentLink: string | null,
  businessName?: string | null
): InvoiceShareContent {
  const customerName = getCustomerName(invoice);
  const invoiceNumber = getInvoiceNumber(invoice);
  const total = getTotalAmount(invoice);
  const balance = getBalance(invoice);
  const isPaid = invoice.status === 'paid' || balance <= 0.009;
  const business = String(businessName || 'your business').trim() || 'your business';

  const subject = `Invoice ${invoiceNumber}`;
  const lines: string[] = [];

  if (isPaid) {
    lines.push(
      `Hi ${customerName}, invoice ${invoiceNumber} for ${formatCurrency(total)} from ${business} has been paid. Thank you!`
    );
  } else {
    lines.push(
      `Hi ${customerName}, invoice ${invoiceNumber} for ${formatCurrency(total)} from ${business} is ready.`
    );
    if (balance < total - 0.009) {
      lines.push(`Balance due: ${formatCurrency(balance)}.`);
    }
    if (paymentLink) {
      lines.push(`Pay here: ${paymentLink}`);
    }
  }

  return {
    subject,
    message: lines.join('\n\n'),
    paymentLink,
    customerName,
  };
}
