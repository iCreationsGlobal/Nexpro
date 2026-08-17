import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import { showSuccess, showError } from '../../../utils/toast';
import SmartReportHeader from './SmartReportHeader';
import SmartReportTabBar from './SmartReportTabBar';
import SmartReportFooter from './SmartReportFooter';
import SmartReportExecutiveTab from './SmartReportExecutiveTab';
import SmartReportFinancialTab from './SmartReportFinancialTab';
import SmartReportSalesTab from './SmartReportSalesTab';
import SmartReportExpensesTab from './SmartReportExpensesTab';
import SmartReportCashFlowTab from './SmartReportCashFlowTab';
import SmartReportInventoryTab from './SmartReportInventoryTab';
import SmartReportRecommendationsTab from './SmartReportRecommendationsTab';
import SmartReportGenericTab from './SmartReportGenericTab';
import { resolveSmartReportTabs } from './smartReportTypeUtils';
import { SMART_REPORT_GENERATION_MODES } from './smartReportConstants';
import {
  formatSmartReportPeriodLabel,
  getSmartReportSnapshot,
  getTabAiSummary,
  getTabFooterLink,
} from './smartReportUtils';

/**
 * Prefer AI Insights for free-text reports when that tab exists; otherwise first tab.
 * @param {Array<{ id: string }>} tabs
 * @param {Object} report
 */
function getInitialSmartReportTab(tabs, report) {
  const preferAi =
    report?.generationMode === SMART_REPORT_GENERATION_MODES.FREE_TEXT
    && tabs.some((tab) => tab.id === 'ai-insights');
  if (preferAi) return 'ai-insights';
  return tabs[0]?.id || 'executive';
}

/**
 * Full Smart Report detail view with tabbed mockup layout.
 */
export default function SmartReportDetail({
  report,
  onBack,
  isStudio = false,
  isShop = false,
  isPharmacy = false,
}) {
  const visibleTabs = useMemo(
    () => resolveSmartReportTabs(report, { isShop, isPharmacy, isStudio }),
    [report, isShop, isPharmacy, isStudio]
  );

  const [activeTab, setActiveTab] = useState(() => getInitialSmartReportTab(visibleTabs, report));
  const [feedback, setFeedback] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const contentRef = useRef(null);
  const initializedReportIdRef = useRef(report?.id);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(getInitialSmartReportTab(visibleTabs, report));
    }
  }, [visibleTabs, activeTab, report]);

  useEffect(() => {
    const reportId = report?.id;
    if (reportId && reportId !== initializedReportIdRef.current) {
      initializedReportIdRef.current = reportId;
      setActiveTab(getInitialSmartReportTab(visibleTabs, report));
    }
  }, [report, visibleTabs]);

  const snapshot = useMemo(() => getSmartReportSnapshot(report), [report]);
  const periodLabel = useMemo(() => formatSmartReportPeriodLabel(report), [report]);
  const footerSummary = useMemo(() => getTabAiSummary(activeTab, snapshot), [activeTab, snapshot]);
  const footerLink = useMemo(() => {
    const link = getTabFooterLink(activeTab);
    if (!link?.tabId) return link;
    if (visibleTabs.some((tab) => tab.id === link.tabId)) return link;
    return null;
  }, [activeTab, visibleTabs]);

  const handleShare = useCallback(async () => {
    const text = `${report?.title || 'Smart Report'} — ${periodLabel}`;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: report?.title || 'Smart Report', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showSuccess('Report link copied to clipboard');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        showError(null, 'Could not share report');
      }
    }
  }, [report?.title, periodLabel]);

  const handleDownloadPdf = useCallback(async () => {
    if (!contentRef.current) return;
    setDownloading(true);
    try {
      const filename = `${(report?.title || 'smart-report').replace(/[^a-z0-9-_]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      await html2pdf()
        .set({
          margin: 10,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        })
        .from(contentRef.current)
        .save();
      showSuccess('PDF downloaded');
    } catch (err) {
      console.error('[SmartReport] PDF export failed:', err);
      showError(null, 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  }, [report?.title]);

  const renderTab = () => {
    const props = { snapshot, periodLabel, isStudio, isShop, isPharmacy };
    switch (activeTab) {
      case 'executive':
        return <SmartReportExecutiveTab {...props} />;
      case 'financial':
        return <SmartReportFinancialTab {...props} />;
      case 'sales':
        return <SmartReportSalesTab {...props} />;
      case 'expenses':
        return <SmartReportExpensesTab {...props} />;
      case 'cashflow':
        return <SmartReportCashFlowTab {...props} />;
      case 'inventory':
        return <SmartReportInventoryTab {...props} />;
      case 'recommendations':
        return <SmartReportRecommendationsTab {...props} />;
      case 'ai-insights':
        return <SmartReportGenericTab {...props} />;
      default:
        return <SmartReportExecutiveTab {...props} />;
    }
  };

  return (
    <div className="p-2 md:p-4">
      <div ref={contentRef}>
        <SmartReportHeader
          report={report}
          onBack={onBack}
          onShare={handleShare}
          onDownloadPdf={handleDownloadPdf}
          downloading={downloading}
        />

        <SmartReportTabBar tabs={visibleTabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="py-6">{renderTab()}</div>
      </div>

      <SmartReportFooter
        summary={footerSummary}
        feedback={feedback}
        onFeedback={setFeedback}
        seeMoreLabel={footerLink?.label}
        onSeeMore={footerLink?.tabId ? () => setActiveTab(footerLink.tabId) : undefined}
      />
    </div>
  );
}
