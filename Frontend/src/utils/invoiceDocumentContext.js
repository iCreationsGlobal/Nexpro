import dayjs from 'dayjs';

const formatInvoiceDate = (value) => {
  if (!value) return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('MMMM D, YYYY') : '';
};

const resolveSourceType = (invoice) => {
  const metadata = invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
  const raw = String(invoice?.sourceType || '').toLowerCase();
  if (raw === 'rental' || metadata.generatedFrom === 'rental' || metadata.rentalId) return 'rental';
  if (raw === 'sale' || invoice?.saleId || invoice?.sale?.saleNumber) return 'sale';
  if (raw === 'quote' || invoice?.quoteId) return 'quote';
  if (raw === 'prescription' || invoice?.prescriptionId) return 'prescription';
  if (raw === 'job' || invoice?.jobId || invoice?.job?.jobNumber) return 'job';
  return raw || null;
};

const resolveRentalDetails = (invoice) => {
  const metadata = invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
  const startDate = metadata.startDate || metadata.rentalStartDate || invoice?.rental?.startDate || null;
  const endDate = metadata.endDate || metadata.rentalEndDate || invoice?.rental?.endDate || null;
  const durationDays = Number(
    metadata.rentalDurationDays
    || invoice?.rental?.rentalDurationDays
    || 0
  );
  const startLabel = formatInvoiceDate(startDate);
  const endLabel = formatInvoiceDate(endDate);
  const periodLabel = startLabel && endLabel
    ? `${startLabel} – ${endLabel}`
    : startLabel || endLabel || '';

  return {
    startDate,
    endDate,
    durationDays: Number.isFinite(durationDays) && durationDays > 0 ? durationDays : null,
    periodLabel,
  };
};

/**
 * Invoice print/drawer layout by source — job fields only on job invoices.
 * @param {object} [invoice]
 * @param {{ businessType?: string }} [options]
 * @returns {{
 *   sourceType: string|null,
 *   showJobDetails: boolean,
 *   showProductCode: boolean,
 *   showRentalDetails: boolean,
 *   showSaleDetails: boolean,
 *   hasSourceDetails: boolean,
 *   sourceDetailsTitle: string|null,
 *   rentalDetails: object,
 *   saleNumber: string|null,
 *   quantityColumnLabel: string,
 * }}
 */
export function resolveInvoiceDocumentContext(invoice, { businessType } = {}) {
  const sourceType = resolveSourceType(invoice);
  const inferredFromBusiness = !sourceType && businessType === 'rental' ? 'rental' : sourceType;
  const effectiveSource = inferredFromBusiness;
  const hasJob = Boolean(invoice?.job?.jobNumber || invoice?.job?.title);
  const isRental = effectiveSource === 'rental';
  const isJob = effectiveSource === 'job' && hasJob;
  const isSale = effectiveSource === 'sale';
  const saleNumber = invoice?.sale?.saleNumber || invoice?.saleNumber || null;
  const rentalDetails = resolveRentalDetails(invoice);
  const showRentalDetails = isRental && Boolean(
    rentalDetails.periodLabel || rentalDetails.durationDays
  );
  const showSaleDetails = isSale && Boolean(saleNumber);

  return {
    sourceType: effectiveSource,
    showJobDetails: isJob,
    showProductCode: !isRental && !isJob && effectiveSource !== 'quote',
    showRentalDetails,
    showSaleDetails,
    hasSourceDetails: isJob || showRentalDetails || showSaleDetails,
    sourceDetailsTitle: isJob
      ? 'Job Details'
      : showRentalDetails
        ? 'Rental Details'
        : showSaleDetails
          ? 'Sale Details'
          : null,
    rentalDetails,
    saleNumber,
    quantityColumnLabel: isRental ? 'Days' : 'QTY',
  };
}
