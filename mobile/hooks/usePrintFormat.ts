import { useQuery } from '@tanstack/react-query';
import { settingsService } from '@/services/settings';
import { QUERY_STALE } from '@/utils/queryInvalidation';
import type { InvoicePrintFormat } from '@/utils/printableInvoiceHtml';

const VALID_FORMATS: InvoicePrintFormat[] = ['a4', 'thermal_58', 'thermal_80'];

/**
 * The workspace's saved invoice/receipt paper format (Settings → Invoices & Receipts on web).
 * Same `pos-config` setting web already uses, so both platforms print the same width.
 */
export function usePrintFormat() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'pos-config'],
    queryFn: () => settingsService.getPOSConfig(),
    staleTime: QUERY_STALE.LIST,
  });

  const rawFormat = (data as { print?: { format?: string } } | null)?.print?.format;
  const printFormat: InvoicePrintFormat = VALID_FORMATS.includes(rawFormat as InvoicePrintFormat)
    ? (rawFormat as InvoicePrintFormat)
    : 'a4';

  return { printFormat, isLoading };
}
