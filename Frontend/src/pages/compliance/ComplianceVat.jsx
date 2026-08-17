import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Info,
  Loader2,
  Percent,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import WelcomeSection from '../../components/WelcomeSection';
import DashboardStatsCard from '../../components/DashboardStatsCard';
import ComplianceIntroBanner from './ComplianceIntroBanner';
import ComplianceVatWelcome from './ComplianceVatWelcome';
import settingsService from '../../services/settingsService';
import evatService from '../../services/evatService';
import { showError } from '../../utils/toast';
import { formatDecimal, formatInteger } from '../../utils/formatNumber';

const PAGE_SIZES = [10, 25, 50];

function money(n, { parenNegative = true } = {}) {
  const v = parseFloat(n) || 0;
  if (parenNegative && v < 0) {
    return `(${formatDecimal(Math.abs(v))})`;
  }
  return formatDecimal(v);
}

/**
 * Compliance → VAT: full-page layout consistent with Invoices / Sales.
 */
export default function ComplianceVat() {
  const navigate = useNavigate();
  const [periodKey, setPeriodKey] = useState(() => dayjs().format('YYYY-MM'));
  const [taxEnabled, setTaxEnabled] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const periodOptions = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const d = dayjs().subtract(i, 'month');
        return { value: d.format('YYYY-MM'), label: d.format('MMM YYYY') };
      }),
    []
  );

  const { startDate, endDate, periodLabel } = useMemo(() => {
    const start = dayjs(`${periodKey}-01`).startOf('month');
    const end = start.endOf('month');
    return {
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
      periodLabel: start.format('MMM YYYY'),
    };
  }, [periodKey]);

  const loadOrgTax = useCallback(async () => {
    try {
      const res = await settingsService.getOrganization();
      const org = res?.data ?? res;
      setTaxEnabled(org?.tax?.enabled === true);
    } catch {
      setTaxEnabled(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await evatService.getFilingSummary(startDate, endDate);
      setData(res?.data?.data ?? res?.data ?? res ?? null);
    } catch (e) {
      showError(e, 'Failed to load VAT summary');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadOrgTax();
  }, [loadOrgTax]);

  useEffect(() => {
    setPage(1);
    if (taxEnabled === false) {
      setLoading(false);
      return;
    }
    if (taxEnabled === true) load();
  }, [load, taxEnabled]);

  const documents = data?.documents || [];
  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return documents.slice(start, start + pageSize);
  }, [documents, page, pageSize]);

  const totals = useMemo(() => {
    return documents.reduce(
      (acc, row) => {
        acc.taxable += parseFloat(row.taxable) || 0;
        acc.vat += parseFloat(row.vat) || 0;
        acc.nhil += parseFloat(row.nhil) || 0;
        acc.getfund += parseFloat(row.getfund) || 0;
        acc.totalLevy += parseFloat(row.totalLevy ?? row.tax) || 0;
        return acc;
      },
      { taxable: 0, vat: 0, nhil: 0, getfund: 0, totalLevy: 0 }
    );
  }, [documents]);

  const downloadPack = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abs-vat-filing-pack-${periodKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    if (!documents.length) return;
    const rates = data?.levyRates || {};
    const header = [
      'Date',
      'Document Type',
      'Ref',
      'Taxable Sales',
      `VAT (${rates.vat ?? ''}%)`,
      `NHIL (${rates.nhil ?? ''}%)`,
      `GETFund (${rates.getfund ?? ''}%)`,
      'Total Levy',
      'Status',
      'IRN',
    ];
    const lines = documents.map((row) =>
      [
        dayjs(row.date).format('YYYY-MM-DD'),
        row.documentType || row.type,
        row.number,
        row.taxable,
        row.vat,
        row.nhil,
        row.getfund,
        row.totalLevy ?? row.tax,
        row.stamped ? 'Stamped' : 'Not stamped',
        row.irn || '',
      ].join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abs-vat-collections-${periodKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const vatRateLabel = data?.levyRates?.vat != null ? `${data.levyRates.vat}%` : '—';
  const nhilRateLabel = data?.levyRates?.nhil != null ? `${data.levyRates.nhil}%` : '—';
  const getfundRateLabel = data?.levyRates?.getfund != null ? `${data.levyRates.getfund}%` : '—';
  const configuredSince = data?.vatConfiguredSince
    ? dayjs(data.vatConfiguredSince).format('D MMM YYYY')
    : null;
  const changePct = data?.collectedChangePct;
  const daysLeft = data?.daysUntilReturnDue;
  const dueLabel = data?.nextReturnDue
    ? dayjs(data.nextReturnDue).format('D MMM YYYY')
    : '—';

  const periodSelect = (
    <Select value={periodKey} onValueChange={setPeriodKey}>
      <SelectTrigger className="w-full sm:w-[200px] border-border bg-card">
        <SelectValue placeholder="Period" />
      </SelectTrigger>
      <SelectContent>
        {periodOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            Period: {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="VAT"
          subText="Manage your VAT settings, view collections and prepare returns."
        />
        {taxEnabled !== false && (
          <div className="flex items-center gap-2 sm:justify-end shrink-0">
            {periodSelect}
          </div>
        )}
      </div>

      {taxEnabled === false ? (
        <ComplianceVatWelcome onSetup={() => navigate('/settings/organization')} />
      ) : (
        <>
          <ComplianceIntroBanner
            storageKey="vat"
            title="How to use VAT"
            bullets={[
              'Turn on tax in Organization settings.',
              'Sell and invoice as usual — ABS tracks output VAT and levies.',
              'Export the pack for your accountant. Certified stamping is under Compliance → e-VAT.',
            ]}
          />

          {loading && !data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !loading && documents.length === 0 ? (
            <EmptyState
              icon="Receipt"
              title="No taxable documents in this period"
              description="Try another month, or make a sale / issue an invoice with tax enabled."
              secondaryAction={{
                label: 'Go to POS',
                onClick: () => navigate('/pos'),
              }}
              primaryAction={{
                label: 'Change period',
                onClick: () => setPeriodKey(dayjs().format('YYYY-MM')),
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DashboardStatsCard
                  title="VAT Status"
                  value="Configured"
                  subtitle={configuredSince ? `Since ${configuredSince}` : 'Tax enabled for this workspace'}
                  icon={Percent}
                  iconBgColor="rgba(22, 101, 52, 0.12)"
                  iconColor="#166534"
                  loading={loading}
                />
                <DashboardStatsCard
                  title="VAT Collected"
                  value={parseFloat(data?.vatCollected || 0)}
                  valuePrefix="₵ "
                  subtitle="This month"
                  trend={changePct == null ? undefined : changePct >= 0 ? 'up' : 'down'}
                  trendValue={changePct == null ? undefined : `${Math.abs(changePct)}%`}
                  icon={Wallet}
                  iconBgColor="rgba(22, 101, 52, 0.12)"
                  iconColor="#166534"
                  loading={loading}
                />
                <DashboardStatsCard
                  title="VAT Payable"
                  value={parseFloat(data?.vatPayable || 0)}
                  valuePrefix="₵ "
                  subtitle="This month"
                  icon={FileText}
                  iconBgColor="rgba(22, 101, 52, 0.12)"
                  iconColor="#166534"
                  loading={loading}
                />
                <DashboardStatsCard
                  title="Next VAT Return Due"
                  value={dueLabel}
                  subtitle={
                    typeof daysLeft === 'number'
                      ? daysLeft >= 0
                        ? `${daysLeft} days left`
                        : `${Math.abs(daysLeft)} days overdue`
                      : undefined
                  }
                  icon={CalendarDays}
                  iconBgColor="rgba(22, 101, 52, 0.12)"
                  iconColor="#166534"
                  loading={loading}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  className="text-[#166534] hover:underline"
                  onClick={() => {
                    document.getElementById('vat-collections')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  View breakdown →
                </button>
                <span className="text-muted-foreground">·</span>
                <Link to="/compliance/evat" className="text-[#166534] hover:underline">
                  View e-VAT setup →
                </Link>
              </div>

              {data?.unstampedCount > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {formatInteger(data.unstampedCount)} document
                  {data.unstampedCount === 1 ? '' : 's'} not e-VAT stamped.{' '}
                  <Link className="underline font-medium text-[#166534]" to="/compliance/evat">
                    Set up GRA e-VAT
                  </Link>
                </div>
              )}

              <div id="vat-collections" className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-border">
                  <h2 className="font-semibold">VAT collections ({periodLabel})</h2>
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton type="button" size="sm" onClick={downloadPack} disabled={!data}>
                      Download pack
                    </SecondaryButton>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-brand hover:bg-brand-dark text-white"
                      onClick={downloadCsv}
                      disabled={!documents.length}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left font-medium p-3">Date</th>
                        <th className="text-left font-medium p-3">Document Type</th>
                        <th className="text-left font-medium p-3">Ref / Invoice No.</th>
                        <th className="text-right font-medium p-3">Taxable Sales (₵)</th>
                        <th className="text-right font-medium p-3">VAT ({vatRateLabel})</th>
                        <th className="text-right font-medium p-3">NHIL ({nhilRateLabel})</th>
                        <th className="text-right font-medium p-3">GETFund ({getfundRateLabel})</th>
                        <th className="text-right font-medium p-3">Total Levy (₵)</th>
                        <th className="text-left font-medium p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr key={`${row.type}-${row.id}`} className="border-b border-border last:border-0">
                          <td className="p-3 whitespace-nowrap">{dayjs(row.date).format('DD MMM YYYY')}</td>
                          <td className="p-3">{row.documentType || row.type}</td>
                          <td className="p-3 font-medium">{row.number}</td>
                          <td className="p-3 text-right tabular-nums">{money(row.taxable)}</td>
                          <td className="p-3 text-right tabular-nums">{money(row.vat)}</td>
                          <td className="p-3 text-right tabular-nums">{money(row.nhil)}</td>
                          <td className="p-3 text-right tabular-nums">{money(row.getfund)}</td>
                          <td className="p-3 text-right tabular-nums font-medium">
                            {money(row.totalLevy ?? row.tax)}
                          </td>
                          <td className="p-3">
                            {row.stamped ? (
                              <span className="inline-flex items-center gap-1 text-[#166534]">
                                <Check className="h-3.5 w-3.5" />
                                Stamped
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Not stamped</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50 font-medium">
                        <td className="p-3" colSpan={3}>
                          Total
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {formatInteger(documents.length)} records
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{money(totals.taxable)}</td>
                        <td className="p-3 text-right tabular-nums">{money(totals.vat)}</td>
                        <td className="p-3 text-right tabular-nums">{money(totals.nhil)}</td>
                        <td className="p-3 text-right tabular-nums">{money(totals.getfund)}</td>
                        <td className="p-3 text-right tabular-nums">{money(totals.totalLevy)}</td>
                        <td className="p-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border-t border-border">
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} per page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <SecondaryButton
                      type="button"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </SecondaryButton>
                    <span className="text-sm tabular-nums min-w-[2rem] text-center">{page}</span>
                    <SecondaryButton
                      type="button"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </SecondaryButton>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                <p className="text-muted-foreground flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#166534]" />
                  {data?.disclaimer
                    || 'Amounts are based on sales and invoices in the period. Confirm before filing with GRA.'}
                </p>
                <button
                  type="button"
                  className="text-[#166534] font-medium hover:underline shrink-0 text-left sm:text-right"
                  onClick={downloadPack}
                >
                  View full report →
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
