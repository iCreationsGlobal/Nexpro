type AnyRecord = Record<string, unknown>;

function formatInvoiceDate(value: unknown): string {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function resolveSourceType(invoice: AnyRecord): string | null {
  const metadata =
    invoice?.metadata && typeof invoice.metadata === 'object'
      ? (invoice.metadata as AnyRecord)
      : {};
  const raw = String(invoice?.sourceType || '').toLowerCase();
  if (raw === 'rental' || metadata.generatedFrom === 'rental' || metadata.rentalId) return 'rental';
  if (raw === 'sale' || invoice?.saleId || (invoice?.sale as AnyRecord)?.saleNumber) return 'sale';
  if (raw === 'quote' || invoice?.quoteId) return 'quote';
  if (raw === 'prescription' || invoice?.prescriptionId) return 'prescription';
  if (raw === 'job' || invoice?.jobId || (invoice?.job as AnyRecord)?.jobNumber) return 'job';
  return raw || null;
}

function resolveRentalDetails(invoice: AnyRecord) {
  const metadata =
    invoice?.metadata && typeof invoice.metadata === 'object'
      ? (invoice.metadata as AnyRecord)
      : {};
  const rental = (invoice?.rental as AnyRecord) || {};
  const startDate =
    metadata.startDate || metadata.rentalStartDate || rental.startDate || null;
  const endDate = metadata.endDate || metadata.rentalEndDate || rental.endDate || null;
  const durationDays = Number(metadata.rentalDurationDays || rental.rentalDurationDays || 0);
  const startLabel = formatInvoiceDate(startDate);
  const endLabel = formatInvoiceDate(endDate);
  const periodLabel = startLabel && endLabel ? `${startLabel} – ${endLabel}` : startLabel || endLabel || '';

  return {
    startDate,
    endDate,
    durationDays: Number.isFinite(durationDays) && durationDays > 0 ? durationDays : null,
    periodLabel,
  };
}

export function resolveInvoiceDocumentContext(
  invoice: AnyRecord,
  { businessType }: { businessType?: string } = {}
) {
  const sourceType = resolveSourceType(invoice);
  const inferredFromBusiness = !sourceType && businessType === 'rental' ? 'rental' : sourceType;
  const effectiveSource = inferredFromBusiness;
  const job = (invoice?.job as AnyRecord) || {};
  const hasJob = Boolean(job.jobNumber || job.title);
  const isRental = effectiveSource === 'rental';
  const isJob = effectiveSource === 'job' && hasJob;
  const isSale = effectiveSource === 'sale';
  const sale = (invoice?.sale as AnyRecord) || {};
  const saleNumber = String(sale.saleNumber || invoice?.saleNumber || '').trim() || null;
  const rentalDetails = resolveRentalDetails(invoice);
  const showRentalDetails = isRental && Boolean(rentalDetails.periodLabel || rentalDetails.durationDays);
  const showSaleDetails = isSale && Boolean(saleNumber);

  return {
    sourceType: effectiveSource,
    showJobDetails: isJob,
    showProductCode: !isRental && !isJob && effectiveSource !== 'quote',
    showRentalDetails,
    showSaleDetails,
    hasSourceDetails: isJob || showRentalDetails || showSaleDetails,
    rentalDetails,
    saleNumber,
    quantityColumnLabel: isRental ? 'Days' : 'QTY',
  };
}
