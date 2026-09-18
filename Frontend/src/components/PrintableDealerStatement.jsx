import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { Phone, Mail } from 'lucide-react';
import { API_BASE_URL } from '../services/api';

const formatAddress = (address) => {
  if (!address) return '';
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean);
  return parts.join('\n');
};

const getPrintStyles = (printConfig) => {
  const format = printConfig?.format || 'a4';
  const isThermal = format === 'thermal_58' || format === 'thermal_80';
  const showLogo = printConfig?.showLogo !== false;
  const fontSize = isThermal ? 'small' : (printConfig?.fontSize || 'normal');
  const titleSize = fontSize === 'small' ? '14px' : '28px';
  const bodySize = fontSize === 'small' ? '10px' : '12px';
  return { isThermal, showLogo, titleSize, bodySize };
};

/**
 * Format statement period — full calendar months read as "June 2026".
 * @param {string|Date|null} startDate
 * @param {string|Date|null} endDate
 * @returns {string}
 */
const formatStatementPeriod = (startDate, endDate) => {
  if (!startDate && !endDate) return dayjs().format('MMMM YYYY');

  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : dayjs();

  if (
    start
    && start.isSame(end, 'month')
    && start.date() === 1
    && end.date() === end.endOf('month').date()
  ) {
    return start.format('MMMM YYYY');
  }

  const periodStart = start ? start.format('DD MMM YYYY') : 'Beginning';
  const periodEnd = end.format('DD MMM YYYY');
  return `${periodStart} – ${periodEnd}`;
};

const SummaryMetric = ({ label, value, highlight = false }) => (
  <div className="border border-[#e5e7eb] rounded-lg p-4">
    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
    <div
      className="text-lg font-semibold"
      style={highlight ? { color: '#166534' } : undefined}
    >
      {value}
    </div>
  </div>
);

const PrintableDealerStatement = ({
  statement,
  organization = {},
  printConfig = {},
  maskAmounts = false,
  hideDealerAccount = false,
  printableId = 'printable-dealer-statement',
}) => {
  const printStyles = getPrintStyles(printConfig);
  const amountDisplay = (value) => (maskAmounts ? 'XXX' : `₵ ${parseFloat(value || 0).toFixed(2)}`);

  const activityEntries = useMemo(
    () => (statement?.entries || []).filter((entry) => entry.entryType !== 'opening_balance'),
    [statement?.entries],
  );

  const transactionSummary = useMemo(() => {
    const charges = activityEntries.filter((entry) => entry.direction === 'debit');
    const payments = activityEntries.filter((entry) => entry.direction === 'credit');
    return {
      chargeCount: charges.length,
      chargeTotal: charges.reduce((sum, entry) => sum + parseFloat(entry.amount || 0), 0),
      paymentCount: payments.length,
      paymentTotal: payments.reduce((sum, entry) => sum + parseFloat(entry.amount || 0), 0),
    };
  }, [activityEntries]);

  if (!statement?.dealer) return null;

  const logoSource = organization?.logoUrl
    ? (organization.logoUrl.startsWith('data:') || organization.logoUrl.startsWith('http')
      ? organization.logoUrl
      : (API_BASE_URL
        ? `${API_BASE_URL}${organization.logoUrl.startsWith('/') ? '' : '/'}${organization.logoUrl}`
        : organization.logoUrl))
    : null;

  const companyInfo = {
    name: organization.name || 'Company name',
    phone: organization.phone || '',
    email: organization.email || '',
    address: formatAddress(organization.address),
  };

  const periodLabel = formatStatementPeriod(statement.period?.startDate, statement.period?.endDate);
  const totalCharges = statement.totals?.charges ?? statement.totals?.debits ?? 0;
  const totalPayments = statement.totals?.payments ?? statement.totals?.credits ?? 0;

  return (
    <div
      id={printableId || undefined}
      className="bg-white text-black printable-dealer-statement"
      style={{ fontFamily: 'system-ui, sans-serif', fontSize: printStyles.bodySize }}
    >
      {printableId && (
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #${printableId}, #${printableId} * { visibility: visible; }
            #${printableId} { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      )}

      <div className="p-6 max-w-[210mm] mx-auto">
        <div className="flex justify-between gap-6 border-b border-[#e5e7eb] pb-4 mb-6">
          <div>
            {printStyles.showLogo && logoSource && (
              <img src={logoSource} alt="" className="h-12 mb-3 object-contain" />
            )}
            <div className="font-semibold text-lg">{companyInfo.name}</div>
            {companyInfo.address && <div className="text-sm whitespace-pre-line mt-1">{companyInfo.address}</div>}
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
              {companyInfo.phone && (
                <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{companyInfo.phone}</span>
              )}
              {companyInfo.email && (
                <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{companyInfo.email}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: printStyles.titleSize, fontWeight: 700, color: '#166534' }}>
              ACCOUNT STATEMENT
            </div>
            <div className="text-sm mt-2 font-medium">Statement for {periodLabel}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Generated {dayjs().format('DD MMM YYYY')}
            </div>
          </div>
        </div>

        <div className={`grid gap-4 mb-6 ${hideDealerAccount ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!hideDealerAccount && (
            <div className="border border-[#e5e7eb] rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bill to</div>
              <div className="font-semibold text-base">{statement.dealer.businessName}</div>
              {statement.dealer.contactName && <div className="text-sm">{statement.dealer.contactName}</div>}
              {(statement.dealer.phone || statement.dealer.email) && (
                <div className="mt-1 space-y-1">
                  {statement.dealer.phone && (
                    <div className="text-sm flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{statement.dealer.phone}</span>
                    </div>
                  )}
                  {statement.dealer.email && (
                    <div className="text-sm flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span>{statement.dealer.email}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {!hideDealerAccount && (
            <div className="border border-[#e5e7eb] rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Account details</div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Statement period</span>
                  <span className="text-right">{periodLabel}</span>
                </div>
                {statement.dealer.creditLimit > 0 && (
                  <div className="flex justify-between gap-4 pt-1 border-t border-[#e5e7eb] mt-2">
                    <span className="text-muted-foreground">Credit limit</span>
                    <span>{amountDisplay(statement.dealer.creditLimit)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Account summary</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryMetric label="Opening balance" value={amountDisplay(statement.openingBalance)} />
            <SummaryMetric label="Total charges" value={amountDisplay(totalCharges)} />
            <SummaryMetric label="Total payments" value={amountDisplay(totalPayments)} />
            <SummaryMetric label="Closing balance" value={amountDisplay(statement.closingBalance)} highlight />
          </div>
          {hideDealerAccount && statement.dealer.creditLimit > 0 && (
            <div className="flex justify-between text-sm mt-3 px-1 text-muted-foreground">
              <span>Credit limit</span>
              <span>{amountDisplay(statement.dealer.creditLimit)}</span>
            </div>
          )}
        </div>

        {(transactionSummary.chargeCount > 0 || transactionSummary.paymentCount > 0) && (
          <div className="border border-[#e5e7eb] rounded-lg p-4 mb-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Transaction summary</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between gap-4">
                <span>Sales charged ({transactionSummary.chargeCount})</span>
                <span className="font-medium">{amountDisplay(transactionSummary.chargeTotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Payments received ({transactionSummary.paymentCount})</span>
                <span className="font-medium">{amountDisplay(transactionSummary.paymentTotal)}</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Activity this period</div>
          {activityEntries.length === 0 ? (
            <div className="border border-[#e5e7eb] rounded-lg p-4 text-sm text-muted-foreground">
              No charges or payments during this period.
            </div>
          ) : (
            <div className="border border-[#e5e7eb] rounded-lg divide-y divide-[#e5e7eb]">
              {activityEntries.map((entry) => (
                <div key={entry.id} className="flex justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{entry.description || 'Account activity'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {dayjs(entry.entryDate).format('DD MMM YYYY')}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold shrink-0 ${
                      entry.direction === 'debit' ? 'text-amber-800' : 'text-[#166534]'
                    }`}
                  >
                    {entry.direction === 'debit' ? '+' : '−'}{amountDisplay(entry.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {statement.dealer.creditTerms && (
          <div className="mt-6 text-sm border border-[#e5e7eb] rounded-lg p-4">
            <div className="font-semibold mb-1">Credit terms</div>
            <div>{statement.dealer.creditTerms}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintableDealerStatement;
