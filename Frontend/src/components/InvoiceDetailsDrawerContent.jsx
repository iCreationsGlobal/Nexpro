import { useState, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import {
  Briefcase,
  CalendarRange,
  Package,
  CircleDollarSign,
  Info,
  Mail,
  Phone,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import DrawerSectionCard from './DrawerSectionCard';
import StatusChip from './StatusChip';
import { cn } from '@/lib/utils';
import { getInvoiceTaxDisplay } from '../utils/invoiceTaxDisplay';
import { getDisplayPaymentNote } from '../utils/paymentNotes';
import { resolveInvoiceDocumentContext } from '../utils/invoiceDocumentContext';

const ITEMS_PREVIEW_COUNT = 3;

const isCancelledInvoice = (invoice) => Boolean(
  String(invoice?.status || '').toLowerCase() === 'cancelled' ||
  invoice?.cancelledAt ||
  invoice?.canceledAt ||
  invoice?.isCancelled ||
  invoice?.isCanceled ||
  invoice?.metadata?.cancelled ||
  invoice?.metadata?.canceled
);

const getInvoiceDisplayStatus = (invoice) => (
  isCancelledInvoice(invoice) ? 'cancelled' : invoice?.status
);

/**
 * Label/value row for invoice detail drawer section cards.
 */
function DrawerFieldRow({ label, children, className, valueClassName }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0',
        className
      )}
    >
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className={cn('min-w-0 text-right text-sm font-medium text-foreground', valueClassName)}>
        {children}
      </div>
    </div>
  );
}

function formatCurrency(amount) {
  return `₵ ${parseFloat(amount || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '—';
  return dayjs(value).format('MMMM D, YYYY');
}

function formatPaymentMethod(value) {
  if (!value) return '—';
  return String(value)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getItemProductCode(item) {
  return String(
    item?.metadata?.productCode
      || item?.productCode
      || item?.code
      || item?.metadata?.barcode
      || item?.barcode
      || item?.sku
      || item?.metadata?.sku
      || item?.variant?.barcode
      || item?.product?.barcode
      || item?.variant?.sku
      || item?.product?.sku
      || ''
  ).trim();
}

/**
 * Mobile-first invoice details layout for DetailsDrawer (section cards per design mock).
 * @param {{ invoice: object, showJobDetails?: boolean }} props
 */
function InvoiceDetailsDrawerContent({ invoice, showJobDetails, showProductCode }) {
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const documentContext = resolveInvoiceDocumentContext(invoice);
  const displayJobDetails = showJobDetails ?? documentContext.showJobDetails;
  const displayProductCode = showProductCode ?? documentContext.showProductCode;

  const items = invoice?.items || [];
  const payments = Array.isArray(invoice?.payments) ? invoice.payments : [];
  const hasMoreItems = items.length > ITEMS_PREVIEW_COUNT;

  useEffect(() => {
    setItemsExpanded(false);
  }, [invoice?.id]);

  const toggleItemsExpanded = useCallback(() => {
    setItemsExpanded((prev) => !prev);
  }, []);

  if (!invoice) return null;

  const taxDisplay = getInvoiceTaxDisplay(invoice);
  const showTax = taxDisplay.hasTax;
  const showDiscount = taxDisplay.discountAmount > 0;

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      <DrawerSectionCard title="Overview" titleStyle="uppercase" cardVariant="white">
        <DrawerFieldRow label="Invoice Number" valueClassName="font-semibold">
          {invoice.invoiceNumber}
        </DrawerFieldRow>
        <DrawerFieldRow label="Status">
          <StatusChip status={getInvoiceDisplayStatus(invoice)} />
        </DrawerFieldRow>
        <DrawerFieldRow label="Invoice Date">{formatDate(invoice.invoiceDate)}</DrawerFieldRow>
        <DrawerFieldRow label="Due Date">{formatDate(invoice.dueDate)}</DrawerFieldRow>
        <DrawerFieldRow label="Payment Terms">{invoice.paymentTerms || '—'}</DrawerFieldRow>
      </DrawerSectionCard>

      <DrawerSectionCard title="Bill To" titleStyle="uppercase" cardVariant="white">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">{invoice.customer?.name || '—'}</p>
          {invoice.customer?.company && (
            <p className="text-sm text-foreground">{invoice.customer.company}</p>
          )}
          {invoice.customer?.email && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
              <span className="break-all">{invoice.customer.email}</span>
            </p>
          )}
          {invoice.customer?.phone && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
              <span>{invoice.customer.phone}</span>
            </p>
          )}
        </div>
      </DrawerSectionCard>

      {displayJobDetails && (invoice.job?.jobNumber || invoice.job?.title) && (
        <DrawerSectionCard
          title="Job Details"
          titleStyle="uppercase"
          cardVariant="white"
          icon={<Briefcase className="h-4 w-4 text-brand" aria-hidden />}
        >
          {invoice.job?.jobNumber && (
            <DrawerFieldRow label="Job Number" valueClassName="font-semibold">
              {invoice.job.jobNumber}
            </DrawerFieldRow>
          )}
          {invoice.job?.title && (
            <DrawerFieldRow label="Job Title">{invoice.job.title}</DrawerFieldRow>
          )}
        </DrawerSectionCard>
      )}

      {documentContext.showRentalDetails && (
        <DrawerSectionCard
          title="Rental Details"
          titleStyle="uppercase"
          cardVariant="white"
          icon={<CalendarRange className="h-4 w-4 text-brand" aria-hidden />}
        >
          {documentContext.rentalDetails.periodLabel && (
            <DrawerFieldRow label="Period">
              {documentContext.rentalDetails.periodLabel}
            </DrawerFieldRow>
          )}
          {documentContext.rentalDetails.durationDays && (
            <DrawerFieldRow label="Duration">
              {documentContext.rentalDetails.durationDays}
              {' '}
              {documentContext.rentalDetails.durationDays === 1 ? 'day' : 'days'}
            </DrawerFieldRow>
          )}
        </DrawerSectionCard>
      )}

      {documentContext.showSaleDetails && (
        <DrawerSectionCard title="Sale Details" titleStyle="uppercase" cardVariant="white">
          <DrawerFieldRow label="Sale Number" valueClassName="font-semibold">
            {documentContext.saleNumber}
          </DrawerFieldRow>
        </DrawerSectionCard>
      )}

      <DrawerSectionCard
        title="Invoice Items"
        titleStyle="uppercase"
        cardVariant="white"
        icon={<Package className="h-4 w-4 text-brand" aria-hidden />}
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {items.map((item, index) => {
                if (!itemsExpanded && hasMoreItems && index >= ITEMS_PREVIEW_COUNT) {
                  return null;
                }
                const lineTotal = parseFloat(item.total || item.unitPrice * (item.quantity || 1) || 0);
                const productCode = getItemProductCode(item);
                return (
                  <li
                    key={item.id ?? `${item.description}-${index}`}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0"
                  >
                    <div className="flex min-w-0 gap-2">
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          {item.description || item.category || 'Item'}
                        </span>
                        {displayProductCode && productCode && (
                          <span className="block truncate text-xs text-muted-foreground">
                            Code: {productCode}
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      {formatCurrency(lineTotal)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {hasMoreItems && (
              <button
                type="button"
                onClick={toggleItemsExpanded}
                className="mt-2 flex w-full items-center justify-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {itemsExpanded ? (
                  <>
                    Show less
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </>
                ) : (
                  <>
                    View All Items ({items.length})
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </>
                )}
              </button>
            )}
          </>
        )}
      </DrawerSectionCard>

      <DrawerSectionCard
        title="Payment Summary"
        titleStyle="uppercase"
        cardVariant="white"
        icon={<CircleDollarSign className="h-4 w-4 text-brand" aria-hidden />}
      >
        <DrawerFieldRow label={taxDisplay.isTaxInclusive ? 'Subtotal (net)' : 'Subtotal'}>
          {formatCurrency(taxDisplay.subtotal)}
        </DrawerFieldRow>
        {showDiscount && (
          <DrawerFieldRow label="Discount" valueClassName="text-green-600">
            -{formatCurrency(taxDisplay.discountAmount)}
          </DrawerFieldRow>
        )}
        {showTax && (
          <DrawerFieldRow label={taxDisplay.taxLabel}>{formatCurrency(taxDisplay.taxAmount)}</DrawerFieldRow>
        )}
        <DrawerFieldRow label="Amount Paid" valueClassName="font-semibold text-green-600">
          {formatCurrency(invoice.amountPaid)}
        </DrawerFieldRow>
        <DrawerFieldRow
          label="Balance Due"
          className="border-t border-gray-200 pt-3 mt-1"
          valueClassName="text-base font-bold text-orange-500"
        >
          {formatCurrency(invoice.balance)}
        </DrawerFieldRow>
      </DrawerSectionCard>

      {payments.length > 0 && (
        <DrawerSectionCard
          title="Payment History"
          titleStyle="uppercase"
          cardVariant="white"
          icon={<CircleDollarSign className="h-4 w-4 text-brand" aria-hidden />}
        >
          <ul className="divide-y divide-gray-100">
            {payments.map((payment) => {
              const note = getDisplayPaymentNote(payment);
              const rawReference = String(payment.referenceNumber || '').trim();
              const reference = rawReference.startsWith('INV-')
                ? String(payment.paymentNumber || '').trim()
                : String(rawReference || payment.paymentNumber || '').trim();

              return (
                <li key={payment.id || reference} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatPaymentMethod(payment.paymentMethod)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(payment.paymentDate)}
                        {reference ? ` • Ref: ${reference}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-green-600">
                      {formatCurrency(payment.amount)}
                    </span>
                  </div>
                  {note && (
                    <div className="rounded-md border border-gray-100 bg-muted/30 px-3 py-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Payment note
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-foreground">{note}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </DrawerSectionCard>
      )}

      <DrawerSectionCard
        title="Additional Information"
        titleStyle="uppercase"
        cardVariant="white"
        icon={<Info className="h-4 w-4 text-brand" aria-hidden />}
      >
        <DrawerFieldRow label="Notes">{invoice.notes?.trim() ? invoice.notes : '—'}</DrawerFieldRow>
        <DrawerFieldRow label="Sent Date">{formatDate(invoice.sentDate)}</DrawerFieldRow>
        <DrawerFieldRow label="Paid Date">{formatDate(invoice.paidDate)}</DrawerFieldRow>
        <DrawerFieldRow label="Created At">
          {invoice.createdAt
            ? dayjs(invoice.createdAt).format('MMMM D, YYYY h:mm A')
            : '—'}
        </DrawerFieldRow>
      </DrawerSectionCard>
    </div>
  );
}

export default InvoiceDetailsDrawerContent;
