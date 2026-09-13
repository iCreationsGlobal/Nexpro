import { formatCurrency, formatDecimal } from '@/utils/formatCurrency';

type SaleItem = {
  name?: string;
  sku?: string;
  quantity?: number;
  unitPrice?: number;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  totalPrice?: number;
  product?: { name?: string };
};

type SaleReceiptInput = {
  saleNumber?: string;
  createdAt?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  amountPaid?: number;
  change?: number;
  paymentMethod?: string;
  customer?: { name?: string; phone?: string; email?: string };
  shop?: { name?: string; address?: string; phone?: string; email?: string };
  studioLocation?: { name?: string; address?: string; phone?: string; email?: string };
  seller?: { name?: string };
  tenantName?: string;
  items?: SaleItem[];
};

function money(value: number | string | null | undefined): string {
  return formatCurrency(value);
}

function numberValue(value: number | string | null | undefined): number {
  return typeof value === 'number' ? value : parseFloat(String(value ?? 0)) || 0;
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function titleCase(value?: string): string {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function itemQuantity(value: number | string | null | undefined): string {
  const qty = numberValue(value);
  return Number.isInteger(qty) ? String(qty) : formatDecimal(qty, 2).replace(/\.?0+$/, '');
}

/** Section divider — a standalone line, never paired with other content on the same line. */
function divider(width = 24): string {
  return '='.repeat(width);
}

/**
 * Plain-text receipt for Share sheet / WhatsApp / SMS previews.
 *
 * Each field is its own label line followed by its own value line (no
 * same-line label+value padding, no centering). Chat apps render this text
 * in a proportional font at whatever width the device/bubble gives it, so
 * fixed-width column alignment (spaces used to line up label and value)
 * breaks unpredictably — lines wrap at different points on different
 * screens and the "columns" end up jumbled. Stacking label/value on their
 * own short lines can't misalign because nothing depends on line width.
 *
 * Section dividers ("====") are still safe to use because a divider line
 * doesn't need to align with anything else — it's a fixed run of characters
 * on its own line, not a pairing that depends on matching widths.
 */
export function formatSaleReceiptText(sale: SaleReceiptInput): string {
  const lines: string[] = [];
  const business = sale.shop?.name || sale.studioLocation?.name || sale.tenantName || 'Receipt';
  const location = sale.shop || sale.studioLocation;
  const customerName = sale.customer?.name?.trim() || 'Walk-in customer';
  const subtotal = sale.subtotal ?? (sale.items || []).reduce((sum, item) => {
    const qty = numberValue(item.quantity ?? 1);
    return sum + numberValue(item.subtotal ?? qty * numberValue(item.unitPrice));
  }, 0);
  const discount = numberValue(sale.discount);
  const tax = numberValue(sale.tax);
  const total = numberValue(sale.total);
  const paid = numberValue(sale.amountPaid);
  const balance = Math.max(0, total - paid);

  const field = (label: string, value: string) => {
    lines.push(label);
    lines.push(value);
    lines.push('');
  };

  lines.push(`Hello ${customerName}, here is your receipt${business ? ` from ${business}` : ''}.`);
  lines.push('');

  lines.push(business.toUpperCase());
  if (location?.address) lines.push(location.address);
  if (location?.phone) lines.push(`Tel: ${location.phone}`);
  if (location?.email) lines.push(location.email);
  lines.push(divider());
  lines.push('SALES RECEIPT');
  lines.push(divider());
  lines.push('');

  if (sale.saleNumber) field('Receipt No.', sale.saleNumber);
  const dateText = formatDateTime(sale.createdAt);
  if (dateText) field('Date', dateText);
  if (sale.seller?.name) field('Served by', sale.seller.name);
  field('Customer', customerName);
  if (sale.customer?.phone) field('Phone', sale.customer.phone);

  lines.push(divider());
  lines.push('ITEMS');
  lines.push(divider());
  lines.push('');
  if ((sale.items || []).length === 0) {
    lines.push('No items listed');
    lines.push('');
  }
  (sale.items || []).forEach((item, index) => {
    const qty = itemQuantity(item.quantity ?? 1);
    const name = (item.name || item.product?.name || 'Item').trim();
    const unitPrice = numberValue(item.unitPrice);
    const lineTotal =
      item.total ??
      item.totalPrice ??
      numberValue(item.quantity ?? 1) * unitPrice;
    lines.push(`${index + 1}. ${name}`);
    if (item.sku) lines.push(`SKU: ${item.sku}`);
    lines.push(`${qty} x ${money(unitPrice)}`);
    lines.push(money(lineTotal));
    lines.push('');
  });

  lines.push(divider());
  field('Subtotal', money(subtotal));
  if (discount > 0) field('Discount', `-${money(discount)}`);
  if (tax > 0) field('Tax', money(tax));
  field('TOTAL', money(total));
  lines.push(divider());
  if (paid > 0) field('Paid', money(paid));
  if (balance > 0.009) field('Balance', money(balance));
  if (sale.change != null && Number(sale.change) > 0) field('Change', money(sale.change));
  if (sale.paymentMethod) field('Payment', titleCase(sale.paymentMethod));

  lines.push(divider());
  lines.push('Thank you for your purchase!');

  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}
