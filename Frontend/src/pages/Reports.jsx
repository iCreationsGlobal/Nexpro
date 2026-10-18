import { useSimpleMode } from '../hooks/useSimpleMode';
import SimpleReports from '../components/simple/SimpleReports';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { REPORT_CHART_COLORS as COLORS, createReportSchema, getBusinessTerminology } from './reports/reportConstants';
import { useSmartSearch } from '../context/SmartSearchContext';
import { showSuccess, showError, showWarning, showLoading } from '../utils/toast';
import { loadHtml2Pdf } from '../utils/chunkLoadError';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DetailSkeleton from '../components/DetailSkeleton';
import { Skeleton } from '../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import ReportsTableWithCards from '../components/ReportsTableWithCards';
import { Button as ShadcnButton } from '../components/ui/button';
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Input as ShadcnInput } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { DateRangePicker, DATE_RANGE_PRESET_OPTIONS } from '@/components/ui/date-range-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import {
  Download,
  BarChart3,
  Currency,
  ShoppingCart,
  FileText,
  Zap,
  Eye,
  Users,
  XCircle,
  CheckCircle,
  Plus,
  ChevronDown,
  Search,
  SlidersHorizontal,
  MoreVertical,
  Trash2,
  Loader2,
} from 'lucide-react';
import reportService from '../services/reportService';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useResponsive } from '../hooks/useResponsive';
import { SEARCH_PLACEHOLDERS } from '../constants';
import { STUDIO_LIKE_TYPES } from '../constants/studioLikeTypes';
import { getPreviousPeriod } from '../utils/periodComparison';
import { calculateDateRange, getGroupByForFilter } from '../utils/dateRangePresets';
import { formatPeriodLabel } from '../utils/formatPeriodLabel';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { getSearchNoResultsEmptyStateProps } from '../utils/searchEmptyState';
import { formatAmount } from '../utils/formatNumber';
import dayjs from 'dayjs';
import { RechartsModuleProvider, useRechartsModule } from '@/components/charts/RechartsModuleContext';
import ReportsOverviewDashboard from './reports/overview/ReportsOverviewDashboard';
import { getReportsOverviewFetchPlan } from './reports/overview/reportsOverviewFetchPlan';
import RentalReportsOverview from './reports/rental/RentalReportsOverview';
import SmartReportDetail from './reports/smart-report/SmartReportDetail';
import WelcomeSection from '../components/WelcomeSection';
import ComplianceIntroBanner from './compliance/ComplianceIntroBanner';
import { buildSmartReportSnapshot } from './reports/smart-report/buildSmartReportSnapshot';
import {
  getDefaultSmartReportTypeSelection,
  getSmartReportTabMeta,
  getSmartReportTypeOptionsGrouped,
  resolveSmartReportTabs,
} from './reports/smart-report/smartReportTypeUtils';

/** Reports stuck in processing longer than this are marked failed on load. */
const SMART_REPORT_PROCESSING_STALE_MS = 15 * 60 * 1000;

/** Dispatched after saved reports are written to localStorage. */
const SAVED_REPORTS_UPDATED_EVENT = 'shopwise-saved-reports-updated';

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isCloseAmount = (a, b) => {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left === 0 && right === 0) return true;
  return Math.abs(left - right) <= Math.max(1, Math.max(Math.abs(left), Math.abs(right)) * 0.05);
};

/**
 * @param {string|null} storageKey
 * @returns {Array}
 */
function readSavedReportsFromStorage(storageKey) {
  if (!storageKey) return [];
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to read saved reports from localStorage:', e);
    return [];
  }
}

/**
 * @param {string|null} storageKey
 * @param {Array} reports
 */
function writeSavedReportsToStorage(storageKey, reports) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(reports));
    window.dispatchEvent(new CustomEvent(SAVED_REPORTS_UPDATED_EVENT, {
      detail: { storageKey },
    }));
  } catch (e) {
    console.warn('Failed to persist saved reports:', e);
  }
}

/**
 * Patch one saved report in localStorage by id.
 * @param {string|null} storageKey
 * @param {string|number} reportId
 * @param {(report: object) => object} updater
 * @returns {Array|null} Updated list, or null if report id was not found
 */
function patchSavedReportInStorage(storageKey, reportId, updater) {
  if (!storageKey) return null;
  const normalizedId = String(reportId);
  const list = readSavedReportsFromStorage(storageKey);
  let found = false;
  const next = list.map((report) => {
    if (String(report.id) !== normalizedId) return report;
    found = true;
    return updater(report);
  });
  if (!found) return null;
  writeSavedReportsToStorage(storageKey, next);
  return next;
}

/**
 * Resolve date range for smart report generation from selected page filter.
 * @param {Object} config - Report form values plus selected date metadata
 * @param {Array} fallbackRange - Page date filter range [dayjs, dayjs]
 * @returns {[import('dayjs').Dayjs, import('dayjs').Dayjs]}
 */
function resolveSmartReportDateRange(config, fallbackRange) {
  if (config?.startDate && config?.endDate) {
    return [dayjs(config.startDate).startOf('day'), dayjs(config.endDate).endOf('day')];
  }

  if (fallbackRange?.[0] && fallbackRange?.[1]) {
    return [dayjs(fallbackRange[0]).startOf('day'), dayjs(fallbackRange[1]).endOf('day')];
  }

  const now = dayjs();
  return [now.startOf('month'), now.endOf('month')];
}

/**
 * Infer Smart Report period type from selected filter/range.
 * @param {string} filterType
 * @param {[import('dayjs').Dayjs, import('dayjs').Dayjs]} range
 * @returns {'day'|'week'|'month'|'custom'}
 */
function getSmartReportPeriodType(filterType, range) {
  if (['today', 'yesterday'].includes(filterType)) return 'day';
  if (['thisWeek', 'lastWeek'].includes(filterType)) return 'week';
  if (['thisMonth', 'lastMonth', 'specificMonth'].includes(filterType)) return 'month';

  const [start, end] = range || [];
  if (start && end) {
    const rangeStart = dayjs(start);
    const rangeEnd = dayjs(end);
    if (rangeStart.isSame(rangeEnd, 'day')) return 'day';
    if (
      rangeStart.isSame(rangeStart.startOf('isoWeek'), 'day') &&
      rangeEnd.isSame(rangeStart.endOf('isoWeek'), 'day')
    ) {
      return 'week';
    }
    if (
      rangeStart.isSame(rangeStart.startOf('month'), 'day') &&
      rangeEnd.isSame(rangeStart.endOf('month'), 'day')
    ) {
      return 'month';
    }
  }

  return 'custom';
}

function formatSmartReportTypeLabel(periodType) {
  const labels = {
    day: 'Daily',
    week: 'Weekly',
    month: 'Monthly',
    custom: 'Custom',
  };
  return labels[periodType] || 'Custom';
}

function getSmartReportTitleForPeriod(filterType, range) {
  return `Smart report for ${formatPeriodLabel(filterType, range)}`;
}

/**
 * Normalize saved reports: mark long-running processing entries as failed.
 * @param {Array} reports
 * @returns {Array}
 */
function normalizeSavedReports(reports) {
  if (!Array.isArray(reports)) return [];
  const now = Date.now();
  return reports.map((report) => {
    if (report.status !== 'processing') return report;
    const createdAt = report.generatedAt ? new Date(report.generatedAt).getTime() : 0;
    if (!createdAt || now - createdAt <= SMART_REPORT_PROCESSING_STALE_MS) return report;
    return { ...report, status: 'failed' };
  });
}

function ReportsInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const { activeTenant, user } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const { activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { isMobile } = useResponsive();
  const rc = useRechartsModule();

  // Declare first so it's never in TDZ when used below
  const [generatedReport, setGeneratedReport] = useState(null);

  const businessType = activeTenant?.businessType || 'printing_press';
  const metadata = activeTenant?.metadata || {};
  const isStudio = useMemo(
    () => STUDIO_LIKE_TYPES.includes(businessType) || businessType === 'studio',
    [businessType]
  );
  const isPrintingPress = businessType === 'printing_press';
  const isShop = businessType === 'shop';
  const isPharmacy = businessType === 'pharmacy';
  const isRental = businessType === 'rental';
  const smartReportTypeContext = useMemo(
    () => ({ isShop, isPharmacy, isStudio, isRental }),
    [isShop, isPharmacy, isStudio, isRental]
  );
  const isRestaurant =
    isShop &&
    ((metadata?.businessSubType || metadata?.shopType) === 'restaurant');
  const terminology = useMemo(
    () =>
      getBusinessTerminology(businessType, {
        ...metadata,
        shopType: metadata?.shopType || metadata?.businessSubType || null,
      }),
    [businessType, metadata]
  );

  // Compact empty state padding for restaurant (many empty sections when no data)
  const emptyStateClass = isRestaurant ? 'py-3 text-sm text-muted-foreground' : 'py-6 text-muted-foreground';
  const emptyStateClassLarge = isRestaurant ? 'py-4 text-sm text-muted-foreground' : 'py-10 text-muted-foreground';
  const emptyStateClassXL = isRestaurant ? 'py-6 text-sm text-muted-foreground' : 'py-16 text-muted-foreground';

  // Determine which view to show based on route (Overview, Smart Report, Compliance statements)
  const isSmartReport = location.pathname === '/reports/smart-report';
  const isCompliance =
    location.pathname === '/reports/compliance'
    || location.pathname === '/compliance/statements';
  const isOverview = !isSmartReport && !isCompliance;
  const showSmartReportList = isSmartReport && !generatedReport;

  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('revenue');
  const [dateFilter, setDateFilter] = useState('thisMonth'); // 'today', 'yesterday', 'thisWeek', etc.
  const [dateRange, setDateRange] = useState(() => calculateDateRange('thisMonth'));
  const [specificMonth, setSpecificMonth] = useState(dayjs().format('YYYY-MM'));
  const [specificYear, setSpecificYear] = useState(String(dayjs().year()));
  const [reportData, setReportData] = useState(null);
  const [groupBy, setGroupBy] = useState('day');

  const [overviewStats, setOverviewStats] = useState(null);
  const [overviewDownloading, setOverviewDownloading] = useState(false);
  const [createReportModalVisible, setCreateReportModalVisible] = useState(false);
  const reportConfigForm = useForm({
    resolver: zodResolver(createReportSchema),
    defaultValues: {
      reportTitle: getSmartReportTitleForPeriod('thisMonth', calculateDateRange('thisMonth')),
    },
  });
  const [selectedReportTypes, setSelectedReportTypes] = useState(() =>
    getDefaultSmartReportTypeSelection({ isShop: false, isPharmacy: false, isStudio: false, isRental: false })
  );
  const [reportDateFilter, setReportDateFilter] = useState('last6months');

  // Compliance statements view
  const [complianceStatementType, setComplianceStatementType] = useState('income-expenditure');
  const [complianceData, setComplianceData] = useState(null);
  const [complianceSource, setComplianceSource] = useState(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError] = useState(null);
  const compliancePrintRef = useRef(null);

  useEffect(() => {
    if (
      location.pathname === '/compliance/statements'
      || location.pathname === '/reports/compliance'
    ) {
      setComplianceStatementType((prev) => (prev === 'vat' ? 'income-expenditure' : prev));
    }
  }, [location.pathname]);

  useEffect(() => {
    setPageSearchConfig({ scope: 'reports', placeholder: SEARCH_PLACEHOLDERS.REPORTS });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  // Update date range when filter changes.
  useEffect(() => {
    if (dateFilter === 'custom') return;
    const newRange = calculateDateRange(dateFilter, dayjs(), { specificMonth, specificYear });
    setDateRange(newRange);
  }, [dateFilter, specificMonth, specificYear]);

  const [savedReports, setSavedReports] = useState([]);
  const reportsHydratedKeyRef = useRef(null);
  const generatingReportIdsRef = useRef(new Set());
  const creatingReportRef = useRef(false);
  const [isCreatingReport, setIsCreatingReport] = useState(false);

  // Storage key for saved reports (scoped by tenant)
  const reportsStorageKey = useMemo(
    () => (activeTenant?.id ? `shopwise_saved_reports_${activeTenant.id}` : null),
    [activeTenant?.id]
  );

  const persistSavedReports = useCallback((updater) => {
    setSavedReports((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (reportsStorageKey) {
        writeSavedReportsToStorage(reportsStorageKey, next);
      }
      return next;
    });
  }, [reportsStorageKey]);

  const updateSavedReportById = useCallback((reportId, updater) => {
    if (!reportsStorageKey) return;
    const next = patchSavedReportInStorage(reportsStorageKey, reportId, updater);
    if (next) {
      setSavedReports(next);
      return;
    }
    console.warn('[SmartReport] Report not found when updating status:', reportId);
  }, [reportsStorageKey]);

  const handleDeleteSavedReport = useCallback((report) => {
    if (!report) return;
    const confirmed = window.confirm(`Delete "${report.title || 'this report'}"?`);
    if (!confirmed) return;

    const reportKey = String(report.id || `${report.generatedAt}-${report.title}`);
    generatingReportIdsRef.current.delete(String(report.id));

    persistSavedReports((prev) => prev.filter((item) => {
      const itemKey = String(item.id || `${item.generatedAt}-${item.title}`);
      return itemKey !== reportKey;
    }));

    setGeneratedReport((current) => {
      if (!current) return current;
      const currentKey = String(current.id || `${current.generatedAt}-${current.title}`);
      return currentKey === reportKey ? null : current;
    });

    showSuccess('Report deleted');
  }, [persistSavedReports]);

  // Sync list when another tab/instance finishes writing reports to storage
  useEffect(() => {
    const onReportsUpdated = (event) => {
      if (event.detail?.storageKey !== reportsStorageKey) return;
      setSavedReports(normalizeSavedReports(readSavedReportsFromStorage(reportsStorageKey)));
    };
    window.addEventListener(SAVED_REPORTS_UPDATED_EVENT, onReportsUpdated);
    return () => window.removeEventListener(SAVED_REPORTS_UPDATED_EVENT, onReportsUpdated);
  }, [reportsStorageKey]);

  // Keep list in sync with localStorage while viewing Smart Report list (async generation)
  useEffect(() => {
    if (!showSmartReportList || !reportsStorageKey) return undefined;
    const syncFromStorage = () => {
      const fromStorage = normalizeSavedReports(readSavedReportsFromStorage(reportsStorageKey));
      setSavedReports((prev) => (
        JSON.stringify(prev) === JSON.stringify(fromStorage) ? prev : fromStorage
      ));
    };
    syncFromStorage();
    const intervalId = window.setInterval(syncFromStorage, 2000);
    return () => window.clearInterval(intervalId);
  }, [showSmartReportList, reportsStorageKey]);

  // Load saved reports from localStorage once per tenant (avoid clobbering in-flight generation)
  useEffect(() => {
    if (!reportsStorageKey || !activeTenant?.id) {
      reportsHydratedKeyRef.current = null;
      setSavedReports([]);
      return;
    }
    if (reportsHydratedKeyRef.current === reportsStorageKey) return;
    reportsHydratedKeyRef.current = reportsStorageKey;

    try {
      let saved = localStorage.getItem(reportsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const forTenant = Array.isArray(parsed)
          ? parsed.filter((r) => r.tenantId === activeTenant?.id || !r.tenantId)
          : [];
        const normalized = normalizeSavedReports(forTenant);
        setSavedReports(normalized);
        if (normalized.some((r, i) => r.status !== forTenant[i]?.status)) {
          localStorage.setItem(reportsStorageKey, JSON.stringify(normalized));
        }
        return;
      }
      // One-time migration from legacy key so existing reports show up
      const legacyKey = 'shopwise_saved_reports';
      const legacySaved = localStorage.getItem(legacyKey);
      if (legacySaved) {
        const parsed = JSON.parse(legacySaved);
        const list = Array.isArray(parsed) ? parsed : [];
        if (list.length > 0) {
          const migrated = normalizeSavedReports(
            list.map((r) => ({
              ...r,
              tenantId: activeTenant.id,
              businessType: r.businessType || activeTenant?.businessType || 'printing_press',
            }))
          );
          setSavedReports(migrated);
          localStorage.setItem(reportsStorageKey, JSON.stringify(migrated));
          try {
            localStorage.removeItem(legacyKey);
          } catch (_) {}
          return;
        }
      }
      setSavedReports([]);
    } catch (e) {
      console.warn('Failed to load saved reports from localStorage:', e);
      setSavedReports([]);
    }
  }, [reportsStorageKey, activeTenant?.id]);

  // Filter reports based on header search (when on Smart Report list view)
  const filteredReports = useMemo(() => {
    if (!showSmartReportList) return [];
    return savedReports.filter(report => {
      const matchesSearch = !searchValue ||
        report.title?.toLowerCase().includes(searchValue.toLowerCase()) ||
        report.generatedBy?.toLowerCase().includes(searchValue.toLowerCase());
      return matchesSearch;
    });
  }, [savedReports, searchValue, showSmartReportList]);

  useEffect(() => {
    if (!scopeReady) return;
    if (!isSmartReport && !isCompliance) {
      fetchOverviewStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeReady, dateRange, isSmartReport, isCompliance, dateFilter, activeShopId, activeStudioLocationId]);

  // Fetch compliance statements when statement type or date changes
  useEffect(() => {
    if (!scopeReady || !isCompliance || !dateRange?.[0] || !dateRange?.[1]) return;
    if (complianceStatementType === 'vat') return;
    const startDate = dateRange[0].format('YYYY-MM-DD');
    const endDate = dateRange[1].format('YYYY-MM-DD');
    let cancelled = false;

    setComplianceLoading(true);
    setComplianceError(null);
    const fetchCompliance = async () => {
      try {
        let res;
        if (complianceStatementType === 'income-expenditure') {
          res = await reportService.getIncomeExpenditureReport(startDate, endDate);
        } else if (complianceStatementType === 'profit-loss') {
          res = await reportService.getProfitLossComplianceReport(startDate, endDate);
        } else if (complianceStatementType === 'financial-position') {
          res = await reportService.getFinancialPositionReport(endDate);
        } else {
          res = await reportService.getCashFlowReport(startDate, endDate);
        }
        if (!cancelled && res?.data) {
          setComplianceData(res.data);
          setComplianceSource(res.source || null);
        }
      } catch (err) {
        if (!cancelled) {
          setComplianceError(err?.response?.data?.error || 'Failed to load report');
          setComplianceData(null);
          setComplianceSource(null);
        }
      } finally {
        if (!cancelled) setComplianceLoading(false);
      }
    };
    fetchCompliance();
    return () => { cancelled = true; };
  }, [scopeReady, isCompliance, complianceStatementType, dateRange, activeShopId, activeStudioLocationId]);

  const handleFilterChange = (filterType) => {
    setDateFilter(filterType);
  };

  const fetchOverviewStats = async () => {
    try {
      setLoading(true);
      const startDate = dateRange[0].startOf('day').format('YYYY-MM-DD');
      const endDate = dateRange[1].endOf('day').format('YYYY-MM-DD');
      const groupBy = getGroupByForFilter(dateFilter, dateRange);
      const businessType = activeTenant?.businessType || 'printing_press';
      const fetchPlan = getReportsOverviewFetchPlan({ businessType });
      const { isRental: fetchIsRental, isShopOrPharmacy, includeProductSales, fetchRentalOverview } = fetchPlan;

      const currentPeriodStart = dayjs(dateRange[0]);
      const currentPeriodEnd = dayjs(dateRange[1]);
      const previousPeriod = getPreviousPeriod(dateFilter || 'custom', [currentPeriodStart, currentPeriodEnd]);
      const comparisonLabel = previousPeriod.label || 'vs previous period';

      const [phase1Res, rentalRes] = await Promise.all([
        reportService.getOverviewPhase1(startDate, endDate, groupBy, includeProductSales).catch(() => ({ data: null })),
        fetchRentalOverview
          ? reportService.getRentalReportsOverview(startDate, endDate, groupBy).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      const rentalOverview = rentalRes?.data || null;
      const phase1 = phase1Res?.data || {};
      const revenue = phase1.revenue ?? { totalRevenue: 0, byPeriod: [], byCustomer: [] };
      const expenses = phase1.expenses ?? { totalExpenses: 0, byCategory: [], byDate: [] };
      const outstanding = phase1.outstanding ?? { totalOutstanding: 0, invoices: [] };
      const sales = phase1.sales ?? { totalJobs: 0, totalSales: 0, byCustomer: [], byStatus: [], byDate: [], byJobType: [], jobsTrendByDate: [] };
      const serviceAnalytics = phase1.serviceAnalytics ?? { totalRevenue: 0, byCategory: [], byDate: [], byCustomer: [] };
      const productSales = phase1.productSales ?? { products: [], totalRevenue: 0, totalQuantitySold: 0 };

      setOverviewStats({
        revenue,
        expenses,
        outstanding,
        sales,
        serviceAnalytics,
        productSales,
        topCustomers: [],
        extendedKpis: null,
        profitLossDetail: null,
        cashFlow: null,
        comparisonLabel,
        rental: rentalOverview,
        isRental: fetchIsRental,
        businessType,
      });
      setLoading(false);

      const [
        phase2Res,
        extendedRes,
        profitLossRes,
        cashFlowRes
      ] = await Promise.all([
        reportService.getOverviewPhase2(startDate, endDate, 5).catch(() => ({ data: null })),
        reportService.getOverviewExtendedKpis(
          startDate,
          endDate,
          previousPeriod.startDate,
          previousPeriod.endDate
        ).catch(() => ({ data: null })),
        reportService.getProfitLossReport(startDate, endDate).catch(() => ({ data: null })),
        reportService.getCashFlowReport(startDate, endDate).catch(() => ({ data: null }))
      ]);

      const phase2 = phase2Res?.data || {};
      const extendedKpis = extendedRes?.data || null;
      const profitLossRaw = profitLossRes?.data || {};
      const cashFlow = cashFlowRes?.data || null;

      const operationalRevenue = isShopOrPharmacy
        ? Math.max(
            revenue?.totalRevenue || 0,
            sales?.totalSales || 0,
            productSales?.totalRevenue || 0
          )
        : (revenue?.totalRevenue || 0);
      const operationalOperatingExpenses = toNumber(expenses?.totalExpenses);
      const operationalCogs = toNumber(extendedKpis?.current?.cogs);
      const operationalTotalExpenses = operationalOperatingExpenses + operationalCogs;
      const accountingRevenue = toNumber(profitLossRaw.revenue ?? profitLossRaw.totalRevenue);
      const profitLossSource = profitLossRes?.source || null;
      const profitLossAlignsWithCollections = !accountingRevenue || isCloseAmount(accountingRevenue, operationalRevenue);
      const hasActiveOperationalScope = Boolean(activeShopId || activeStudioLocationId);
      const useAccountingMetrics = profitLossSource === 'accounting' && !hasActiveOperationalScope;

      const totalRevenue = useAccountingMetrics
        ? toNumber(profitLossRaw.revenue ?? operationalRevenue)
        : operationalRevenue;
      const cogsValue = useAccountingMetrics
        ? toNumber(profitLossRaw.cogs)
        : operationalCogs;
      const operatingExpensesValue = useAccountingMetrics
        ? toNumber(profitLossRaw.operatingExpenses ?? (toNumber(profitLossRaw.expenses) - cogsValue))
        : operationalOperatingExpenses;
      const totalExpenses = useAccountingMetrics
        ? toNumber(profitLossRaw.expenses ?? (operatingExpensesValue + cogsValue))
        : operationalTotalExpenses;
      const grossProfitValue = useAccountingMetrics
        ? toNumber(profitLossRaw.grossProfit ?? (totalRevenue - cogsValue))
        : totalRevenue - cogsValue;
      const netProfitValue = useAccountingMetrics
        ? toNumber(profitLossRaw.netProfit ?? (totalRevenue - totalExpenses))
        : totalRevenue - totalExpenses;
      const grossMarginPct = totalRevenue > 0 ? parseFloat(((grossProfitValue / totalRevenue) * 100).toFixed(2)) : 0;
      const netMarginPct = totalRevenue > 0 ? parseFloat(((netProfitValue / totalRevenue) * 100).toFixed(2)) : 0;
      const metricSource = useAccountingMetrics ? 'accounting' : 'operational';

      const syncedExtendedKpis = extendedKpis
        ? {
            ...extendedKpis,
            current: {
              ...(extendedKpis.current || {}),
              totalRevenue,
              totalExpenses,
              operatingExpenses: operatingExpensesValue,
              cogs: cogsValue,
              netProfit: netProfitValue,
              grossProfit: grossProfitValue,
              grossProfitMargin: grossMarginPct,
              netProfitMargin: netMarginPct,
              metricSource,
              profitLossAlignsWithCollections
            }
          }
        : extendedKpis;

      setOverviewStats({
        revenue: isShopOrPharmacy && totalRevenue > (revenue?.totalRevenue || 0)
          ? { ...revenue, totalRevenue }
          : revenue,
        expenses,
        outstanding,
        sales,
        serviceAnalytics,
        productSales,
        businessType,
        isRetail: isShopOrPharmacy,
        isStudio,
        productStockSummary: phase2.productStockSummary ?? { totalStocks: 0, totalStockValue: 0, stockAvailabilityRate: 0 },
        materialsSummary: phase2.materialsSummary ?? { totalStocks: 0, totalStockValue: 0, stockAvailabilityRate: 0 },
        materialsMovements: phase2.materialsMovements ?? [],
        fastestMovingItems: phase2.fastestMovingItems ?? [],
        revenueByChannel: phase2.revenueByChannel ?? [],
        kpiSummary: phase2.kpiSummary ?? { totalRevenue: 0, totalExpenses: 0, grossProfit: 0, activeCustomers: 0, pendingInvoices: 0 },
        topCustomers: phase2.topCustomers ?? [],
        pipelineSummary: phase2.pipelineSummary ?? { activeJobs: 0, openLeads: 0, pendingInvoices: 0 },
        extendedKpis: syncedExtendedKpis,
        profitLossDetail: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          operatingExpenses: operatingExpensesValue,
          cogs: cogsValue,
          grossProfit: grossProfitValue,
          netProfit: netProfitValue,
          source: metricSource,
          accountingSource: profitLossSource,
          profitLossAlignsWithCollections
        },
        cashFlow,
        profitLoss: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          operatingExpenses: operatingExpensesValue,
          cogs: cogsValue,
          grossProfit: grossProfitValue,
          netProfit: netProfitValue,
          grossProfitMargin: grossMarginPct,
          profitMargin: netMarginPct,
          source: metricSource
        },
        revenueGrowth: extendedKpis?.comparison?.totalRevenue ?? 0,
        periodTypeLabel: comparisonLabel,
        comparisonLabel,
        rental: rentalOverview,
        isRental: fetchIsRental,
      });
    } catch (error) {
      console.error('Error fetching overview stats:', error);
      showError(null, 'Failed to load overview statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleOverviewDateRangeSelect = useCallback((range) => {
    if (!range?.from || !range?.to) return;
    setDateFilter('custom');
    setDateRange([dayjs(range.from).startOf('day'), dayjs(range.to).endOf('day')]);
  }, []);

  const handleOverviewPresetSelect = useCallback((presetKey) => {
    setDateFilter(presetKey);
  }, []);

  const handleComplianceDateRangeSelect = useCallback((range) => {
    if (!range?.from || !range?.to) return;
    setDateFilter('custom');
    setDateRange([dayjs(range.from).startOf('day'), dayjs(range.to).endOf('day')]);
  }, []);

  const handleCompliancePresetSelect = useCallback((presetKey) => {
    setDateFilter(presetKey);
  }, []);

  const handleSmartReportDateRangeSelect = useCallback((range) => {
    if (!range?.from || !range?.to) return;
    setDateFilter('custom');
    setDateRange([dayjs(range.from).startOf('day'), dayjs(range.to).endOf('day')]);
  }, []);

  const handleSmartReportPresetSelect = useCallback((presetKey) => {
    setDateFilter(presetKey);
  }, []);

  const handleOverviewCustomize = useCallback(() => {
    showWarning('Customize Dashboard will let you show or hide widgets — coming soon.');
  }, []);

  const handleOverviewDownload = useCallback(async () => {
    const dismissLoading = showLoading('Generating PDF...', 0);
    setOverviewDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      const reportElement = document.getElementById('overview-report-content');
      if (!reportElement) {
        dismissLoading();
        showError(null, 'Report content not found');
        return;
      }
      const dateSuffix = `${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}`;
      const filename = isRental
        ? `rental_reports_overview_${dateSuffix}.pdf`
        : `reports_overview_${dateSuffix}.pdf`;
      await html2pdf().set({
        margin: 10,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(reportElement).save();
      dismissLoading();
      showSuccess('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error generating overview PDF:', error);
      dismissLoading();
      showError(null, 'Failed to generate PDF');
    } finally {
      setOverviewDownloading(false);
    }
  }, [dateRange, isRental]);

  const handleOpenCreateReportModal = () => {
    const selectedRange = dateFilter === 'custom' && dateRange?.[0] && dateRange?.[1]
      ? [dayjs(dateRange[0]), dayjs(dateRange[1])]
      : calculateDateRange(dateFilter || 'thisMonth', dayjs(), { specificMonth, specificYear });
    reportConfigForm.reset({
      reportTitle: getSmartReportTitleForPeriod(dateFilter || 'custom', selectedRange),
    });
    setSelectedReportTypes(getDefaultSmartReportTypeSelection(smartReportTypeContext));
    setCreateReportModalVisible(true);
  };

  const handleCreateReport = async (values) => {
    if (creatingReportRef.current) return;

    if (selectedReportTypes.length === 0) {
      showError(null, 'Select at least one report section.');
      return;
    }

    creatingReportRef.current = true;
    setIsCreatingReport(true);

    try {
      setCreateReportModalVisible(false);
      const selectedRange = dateFilter === 'custom' && dateRange?.[0] && dateRange?.[1]
        ? [dayjs(dateRange[0]), dayjs(dateRange[1])]
        : calculateDateRange(dateFilter || 'thisMonth', dayjs(), { specificMonth, specificYear });
      const rangeStart = selectedRange[0].startOf('day');
      const rangeEnd = selectedRange[1].endOf('day');
      const periodType = getSmartReportPeriodType(dateFilter || 'custom', [rangeStart, rangeEnd]);
      const periodLabel = formatPeriodLabel(dateFilter || 'custom', [rangeStart, rangeEnd]);
      const previousPeriod = getPreviousPeriod(dateFilter || 'custom', [rangeStart, rangeEnd]);

      const reportConfig = {
        ...values,
        reportTypes: selectedReportTypes,
        generatedBy: user?.name || user?.first_name || 'System User',
        dateFilter: dateFilter || 'custom',
        periodType,
        periodLabel,
        startDate: rangeStart.format('YYYY-MM-DD'),
        endDate: rangeEnd.format('YYYY-MM-DD'),
        comparisonStartDate: previousPeriod.startDate,
        comparisonEndDate: previousPeriod.endDate,
        comparisonLabel: previousPeriod.label,
      };

      // Create a temporary report entry with "processing" status (scoped to tenant and business type)
      const tenantId = activeTenant?.id;
      const reportId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const tempReport = {
        title: reportConfig.reportTitle,
        generatedAt: new Date().toISOString(),
        generatedBy: reportConfig.generatedBy,
        reportTypes: reportConfig.reportTypes,
        status: 'processing',
        id: reportId,
        tenantId,
        businessType,
        periodType,
        period: `${rangeStart.format('MMM DD, YYYY')} to ${rangeEnd.format('MMM DD, YYYY')}`,
        periodLabel: `${formatSmartReportTypeLabel(periodType)} Report • ${periodLabel}`,
        dateFilter: dateFilter || 'custom',
        startDate: reportConfig.startDate,
        endDate: reportConfig.endDate,
        comparisonStartDate: previousPeriod.startDate,
        comparisonEndDate: previousPeriod.endDate,
        comparisonLabel: previousPeriod.label,
      };

      // Add to saved reports immediately with processing status
      generatingReportIdsRef.current.add(tempReport.id);
      persistSavedReports((prev) => {
        const startedRecently = prev.some(
          (r) =>
            r.status === 'processing'
            && r.title === tempReport.title
            && Date.now() - new Date(r.generatedAt).getTime() < 5000
        );
        if (startedRecently) return prev;
        return [tempReport, ...prev];
      });

      // Navigate to Smart Report list view
      navigate('/reports/smart-report');

      // Show success message
      showSuccess('Report generation started in the background');

      // Generate the report in the background
      generateSmartReportInBackground(reportConfig, tempReport.id, tenantId);
    } catch (error) {
      console.error('Error creating report:', error);
      showError(null, 'Failed to create report');
    } finally {
      creatingReportRef.current = false;
      setIsCreatingReport(false);
    }
  };

  const generateSmartReportInBackground = async (config, reportId, tenantId) => {
    try {
      const report = await generateSmartReport(config);

      updateSavedReportById(reportId, (existing) => ({
        ...existing,
        ...report,
        id: String(reportId),
        status: 'ready',
        tenantId,
        businessType,
      }));

      showSuccess('Report generated successfully!');
    } catch (error) {
      const failureReason =
        error?.message
        || error?.response?.data?.error
        || error?.response?.data?.message
        || 'Report generation failed';
      console.error('Error generating report:', error);
      updateSavedReportById(reportId, (existing) => ({
        ...existing,
        id: String(reportId),
        status: 'failed',
        failureReason,
      }));
      showError(null, failureReason);
    } finally {
      generatingReportIdsRef.current.delete(reportId);
    }
  };

  const generateSmartReport = async (config) => {
    try {
      const reportTypes = config.reportTypes || selectedReportTypes;
      const [rangeStart, rangeEnd] = resolveSmartReportDateRange(config, dateRange);
      const startDate = rangeStart.format('YYYY-MM-DD');
      const endDate = rangeEnd.format('YYYY-MM-DD');

      // Fetch real data for the report - conditionally fetch product/inventory data for shop/pharmacy
      const emptySales = { data: { totalSales: 0, totalJobs: 0, byJobType: [], byCustomer: [], byDate: [], byStatus: [] } };
      const emptyServiceAnalytics = { data: { totalRevenue: 0, byCategory: [], byDate: [], byCustomer: [] } };
      const fetchPromises = [
        reportService.getRevenueReport(startDate, endDate, 'day').catch(() => ({ data: { totalRevenue: 0, byPeriod: [] } })),
        reportService.getExpenseReport(startDate, endDate).catch(() => ({ data: { totalExpenses: 0, byCategory: [] } })),
        isRental
          ? Promise.resolve(emptySales)
          : reportService.getSalesReport(startDate, endDate, 'day').catch(() => emptySales),
        reportService.getOutstandingPaymentsReport(startDate, endDate).catch(() => ({ data: { totalOutstanding: 0, invoices: [] } })),
        isRental
          ? Promise.resolve(emptyServiceAnalytics)
          : reportService.getServiceAnalyticsReport(startDate, endDate).catch(() => emptyServiceAnalytics)
      ];

      // Add product sales and inventory data for shop/pharmacy
      if (isShop || isPharmacy) {
        fetchPromises.push(
          reportService.getProductSalesReport(startDate, endDate).catch(() => ({ data: { products: [], totalProducts: 0, totalRevenue: 0, totalQuantitySold: 0 } }))
        );
      } else {
        fetchPromises.push(Promise.resolve(null));
      }
      // Add prescription report for pharmacy
      if (isPharmacy) {
        fetchPromises.push(
          reportService.getPrescriptionReport(startDate, endDate).catch(() => ({ data: { byStatus: {}, totalPrescriptions: 0, prescriptionRevenue: 0, fulfillmentRate: 0, topDrugs: [] } }))
        );
      } else {
        fetchPromises.push(Promise.resolve(null));
      }
      // Phase 2: top customers, pipeline, materials (for customer-summary, pipeline, materials-summary)
      fetchPromises.push(reportService.getOverviewPhase2(startDate, endDate, 10).catch(() => ({ data: {} })));
      fetchPromises.push(
        reportService.getCashFlowReport(startDate, endDate).catch(() => ({ data: {} })),
        reportService.getProfitLossReport(startDate, endDate).catch(() => ({ data: {} })),
        reportService.getFinancialPositionReport(endDate).catch(() => ({ data: {} })),
        reportService.getRevenueByChannel(startDate, endDate).catch(() => ({ data: {} })),
        isRental
          ? reportService.getRentalSmartReport(startDate, endDate, 'day').catch(() => ({ data: null }))
          : Promise.resolve(null)
      );

      const [
        revenueData,
        expenseData,
        salesData,
        outstandingData,
        serviceAnalyticsData,
        productSalesData,
        prescriptionData,
        phase2Data,
        cashFlowData,
        profitLossData,
        financialPositionData,
        revenueByChannelData,
        rentalOverviewResult,
      ] = await Promise.all(fetchPromises);
      const rentalOverviewPayload = rentalOverviewResult?.data || rentalOverviewResult || null;
      const phase2 = phase2Data?.data || {};
      const cashFlowPayload = cashFlowData?.data || cashFlowData || {};
      const profitLossPayload = profitLossData?.data || profitLossData || {};
      const financialPositionPayload = financialPositionData?.data || financialPositionData || {};
      const revenueByChannelPayload = revenueByChannelData?.data || revenueByChannelData || {};

      const revenue = revenueData.data?.totalRevenue || 0;
      const expenses = expenseData.data?.totalExpenses || 0;

      // Cost of goods sold for this exact period, from the profit-loss report already fetched above.
      // Net profit must deduct COGS in addition to operating expenses — Revenue - COGS - OpEx —
      // otherwise product/service cost is silently dropped and profit is overstated.
      const cogs = toNumber(profitLossPayload?.cogs);
      const grossProfit = revenue - cogs;
      const profit = grossProfit - expenses;

      // Calculate previous equivalent period from the same selected filter/range.
      const comparisonFilterType = config.dateFilter || dateFilter || 'custom';
      const previousPeriodForComparison = config.comparisonStartDate && config.comparisonEndDate
        ? {
            startDate: config.comparisonStartDate,
            endDate: config.comparisonEndDate,
            label: config.comparisonLabel || 'vs previous period',
          }
        : getPreviousPeriod(comparisonFilterType, [
            rangeStart,
            rangeEnd,
          ]);
      const periodType = config.periodType || getSmartReportPeriodType(comparisonFilterType, [rangeStart, rangeEnd]);
      const selectedPeriodLabel = config.periodLabel || formatPeriodLabel(comparisonFilterType, [rangeStart, rangeEnd]);
      
      const [prevRevenueData, prevExpenseData, extendedKpisData] = await Promise.all([
        reportService.getRevenueReport(previousPeriodForComparison.startDate, previousPeriodForComparison.endDate, 'day').catch(() => ({ data: { totalRevenue: 0 } })),
        reportService.getExpenseReport(previousPeriodForComparison.startDate, previousPeriodForComparison.endDate).catch(() => ({ data: { totalExpenses: 0 } })),
        reportService.getOverviewExtendedKpis(
          startDate,
          endDate,
          previousPeriodForComparison.startDate,
          previousPeriodForComparison.endDate
        ).catch(() => ({ data: null }))
      ]);
      const phase2ForSnapshot = {
        ...phase2,
        extendedKpis: extendedKpisData?.data || phase2.extendedKpis || null,
      };

      const prevRevenue = prevRevenueData.data?.totalRevenue || 0;
      const prevExpenses = prevExpenseData.data?.totalExpenses || 0;
      // extendedKpisData.previous already computes revenue - COGS - operating expenses correctly;
      // fall back to the (COGS-less) naive calc only if that comparison data isn't available.
      const prevCogs = toNumber(extendedKpisData?.data?.previous?.cogs);
      const prevProfit = extendedKpisData?.data?.previous
        ? toNumber(extendedKpisData.data.previous.netProfit)
        : (prevRevenue - prevExpenses);

      const calculateChange = (current, previous) => {
        if (previous === 0) return current === 0 ? 0 : null;
        if (previous !== 0) return ((current - previous) / Math.abs(previous)) * 100;
        return 0;
      };

      const revenueChange = calculateChange(revenue, prevRevenue);
      const expenseChange = calculateChange(expenses, prevExpenses);
      const profitChange = calculateChange(profit, prevProfit);

      // Generate comprehensive smart report with real data (build array via push to avoid JSX parse issue)
      const reportSections = [
          {
            type: 'performance',
            title: 'Performance Summary',
            prevRevenue,
            prevExpenses,
            prevProfit,
            comparisonLabel: previousPeriodForComparison.label,
            metrics: [
              { label: isRental ? 'Collected' : 'Total Revenue', value: revenue, prevValue: prevRevenue, change: Math.abs(revenueChange), trend: revenueChange >= 0 ? 'up' : 'down', color: 'var(--color-primary)' },
              ...(isShop || isPharmacy ? [
                // Cost of Goods Sold is kept separate from Operating Expenses — it's the cost of
                // products/materials sold, not an Expenses table entry.
                { label: 'Cost of Goods Sold', value: cogs, prevValue: prevCogs, change: Math.abs(calculateChange(cogs, prevCogs) ?? 0), trend: cogs <= prevCogs ? 'down' : 'up', color: 'hsl(var(--destructive))' },
              ] : []),
              { label: 'Operating Expenses', value: expenses, prevValue: prevExpenses, change: Math.abs(expenseChange), trend: expenseChange <= 0 ? 'down' : 'up', color: expenseChange <= 0 ? 'var(--color-primary)' : 'hsl(var(--destructive))' },
              { label: 'Net Profit', value: profit, prevValue: prevProfit, change: Math.abs(profitChange), trend: profitChange >= 0 ? 'up' : 'down', color: 'var(--color-primary)' }
            ],
            note: (revenueChange > 0)
              ? `Your ${isRental ? 'collections are' : 'revenue is'} up ${revenueChange.toFixed(1)}% (${formatAmount(revenue - prevRevenue)}) from the previous period.`
              : `Your ${isRental ? 'collections are' : 'revenue is'} down ${Math.abs(revenueChange).toFixed(1)}% (${formatAmount(prevRevenue - revenue)}) from the previous period.`
          }
      ];
      const conditionalSections = reportTypes.length > 0 ? [
            ...(isShop || isPharmacy ? [{
              type: 'product-analytics',
              title: 'Product Sales',
              description: 'Sales performance by product (quantity sold, revenue, cost, and margin). Tenant-isolated.',
              data: (productSalesData?.data?.products || []).map(item => ({
                productName: item.productName || 'Unknown',
                quantitySold: parseFloat(item.quantitySold || 0),
                revenue: parseFloat(item.revenue || 0),
                cost: parseFloat(item.cost || 0),
                grossProfit: parseFloat(item.grossProfit ?? (parseFloat(item.revenue || 0) - parseFloat(item.cost || 0))),
                margin: parseFloat(item.margin || 0),
                unit: item.unit || 'pcs',
                sku: item.sku,
                currentStock: parseFloat(item.currentStock || 0),
                safetyStock: parseFloat(item.safetyStock || 0),
                isLowStock: item.isLowStock,
                isHighRisk: item.isHighRisk,
                stockPercentage: parseFloat(item.stockPercentage || 0)
              })).slice(0, 10)
            }] : []),
            ...(isShop || isPharmacy ? [{
              type: 'inventory-status',
              title: 'Materials Status',
              description: 'Current stock levels by product. Tenant-isolated.',
              data: (productSalesData?.data?.products || []).map(item => ({
                productName: item.productName || 'Unknown',
                currentStock: parseFloat(item.currentStock || 0),
                safetyStock: parseFloat(item.safetyStock || 0),
                unit: item.unit || 'pcs',
                sku: item.sku,
                isLowStock: item.isLowStock,
                isHighRisk: item.isHighRisk,
                stockPercentage: parseFloat(item.stockPercentage || 0)
              })).slice(0, 10)
            }] : []),
            // Service analytics (printing press/studio)
            ...(!isShop && !isPharmacy && !isRental ? [{
              type: 'service-analytics',
              title: terminology.analyticsTitle,
              description: terminology.analyticsDescription,
              data: (serviceAnalyticsData.data?.byCategory || salesData.data?.byJobType || []).map(item => {
                const totalRevenue = parseFloat(item.totalRevenue || item.totalSales || 0);
                const quantitySold = parseFloat(item.totalQuantity || item.jobCount || 0);
                const avgRevenue = parseFloat(item.averagePrice || 0);
                let demand = 'Low';
                if ((totalRevenue > revenue * 0.3)) demand = 'High';
                else if ((totalRevenue > revenue * 0.15)) demand = 'Medium';
                return {
                  service: item.category || item.jobType || 'Unknown',
                  quantitySold: quantitySold,
                  revenue: totalRevenue,
                  averagePrice: avgRevenue,
                  demand
                };
              }).slice(0, 5)
          }] : []),
          ...(reportTypes.includes('cost-analysis') ? [{
            type: 'cost-analysis',
            // This section only breaks down operating expenses (rent, utilities, salaries, etc.) —
            // it does not include cost of goods sold — so it's labeled accordingly rather than the
            // more generic "Cost Analysis", which could be read as covering COGS too.
            title: 'Operating Expense Analysis',
            description: 'Breakdown of operating expenses (not including cost of goods sold).',
            data: (expenseData.data?.byCategory || []).map(item => ({
              category: item.category || 'Uncategorized',
              amount: parseFloat(item.totalAmount || 0),
              percentage: expenses > 0 ? ((parseFloat(item.totalAmount || 0) / expenses) * 100) : 0
            })),
            totalCost: expenses
          }] : []),
          ...(reportTypes.includes('invoice-summary') ? [{
            type: 'invoice-summary',
            title: 'Invoice Summary',
            description: 'Breakdown of invoices and their status.',
            data: (() => {
              const invoices = outstandingData.data?.invoices || [];
              const paid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + parseFloat(inv.totalAmount || 0), 0);
              const pending = invoices.filter(inv => inv.status === 'sent' || inv.status === 'partial').reduce((sum, inv) => sum + parseFloat(inv.balance || 0), 0);
              const overdue = invoices.filter(inv => inv.status === 'overdue').reduce((sum, inv) => sum + parseFloat(inv.balance || 0), 0);
              const total = paid + pending + overdue;
              
              return [
                { status: 'Paid invoices', amount: paid, percentage: total > 0 ? (paid / total * 100) : 0 },
                { status: 'Pending payments', amount: pending, percentage: total > 0 ? (pending / total * 100) : 0 },
                { status: 'Overdue', amount: overdue, percentage: total > 0 ? (overdue / total * 100) : 0 }
              ];
            })(),
            totalInvoiced: revenue
          }] : []),
          ...(reportTypes.includes('outstanding-payments') ? [{
            type: 'outstanding-payments',
            title: 'Outstanding Payments',
            description: 'Accounts receivable and overdue amounts.',
            data: (() => {
              const inv = outstandingData.data?.invoices || [];
              const total = outstandingData.data?.totalOutstanding ?? 0;
              const overdue = inv.filter((i) => i.status === 'overdue');
              const overdueAmount = overdue.reduce((s, i) => s + parseFloat(i.balance || 0), 0);
              return { totalOutstanding: total, overdueCount: overdue.length, overdueAmount, invoices: inv.slice(0, 10) };
            })()
          }] : []),
          ...(reportTypes.includes('customer-summary') ? [{
            type: 'customer-summary',
            title: 'Customer Summary',
            description: 'Top customers by revenue in the period.',
            data: (phase2.topCustomers || revenueData.data?.byCustomer || []).slice(0, 10).map((c) => ({
              name: c.customerName || c.customer?.name || c.name || 'Unknown',
              revenue: parseFloat(c.totalRevenue || c.revenue || 0),
              count: c.jobCount || c.transactionCount || c.count || 0
            }))
          }] : []),
          ...(reportTypes.includes('sales-summary') && !isRental ? [{
            type: 'sales-summary',
            title: isStudio ? 'Jobs Summary' : 'Sales Summary',
            description: isStudio ? 'Job volume and status in the period.' : 'Sales volume and status in the period.',
            data: (() => {
              const byStatus = salesData.data?.byStatus || [];
              const byDate = salesData.data?.byDate || [];
              return {
                totalJobs: salesData.data?.totalJobs ?? 0,
                totalSales: salesData.data?.totalSales ?? 0,
                byStatus: byStatus.map((s) => ({ status: s.status || s.name, count: s.count ?? s.jobCount ?? 0, total: parseFloat(s.totalSales || s.totalAmount || 0) })),
                byDate: byDate.slice(0, 14).map((d) => ({ date: d.date, count: d.count ?? 0, total: parseFloat(d.totalSales || d.totalRevenue || 0) }))
              };
            })()
          }] : []),
          ...(isStudio && reportTypes.includes('materials-summary') ? [{
            type: 'materials-summary',
            title: 'Materials Summary',
            description: 'Movements in the selected period; stock levels are current snapshot.',
            data: {
              summary: phase2.materialsSummary || { totalStocks: 0, totalStockValue: 0, stockAvailabilityRate: 0 },
              movements: (phase2.materialsMovements || []).slice(0, 10)
            }
          }] : []),
          ...(reportTypes.includes('pipeline') && !isRental ? [{
            type: 'pipeline',
            title: 'Pipeline',
            description: 'Open pipeline (current) plus activity created in the selected period.',
            data: phase2.pipelineSummary || { activeJobs: 0, openLeads: 0, pendingInvoices: 0 }
          }] : []),
          ...(isPharmacy && reportTypes.includes('prescription-summary') && prescriptionData?.data ? [{
            type: 'prescription-summary',
            title: 'Prescription Summary',
            description: 'Prescription volume, status, and revenue.',
            data: (() => {
              const d = prescriptionData.data;
              const byStatus = d.byStatus || {};
              return [
                { status: 'Pending', count: byStatus.pending || 0 },
                { status: 'Filled', count: byStatus.filled || 0 },
                { status: 'Partially filled', count: byStatus.partially_filled || 0 },
                { status: 'Cancelled', count: byStatus.cancelled || 0 },
                { status: 'Expired', count: byStatus.expired || 0 }
              ];
            })(),
            totalPrescriptions: prescriptionData.data.totalPrescriptions || 0,
            prescriptionRevenue: prescriptionData.data.prescriptionRevenue || 0,
            fulfillmentRate: prescriptionData.data.fulfillmentRate || 0,
            topDrugs: prescriptionData.data.topDrugs || []
          }] : [])
      ] : [];
      reportSections.push(...conditionalSections);
      const mockReport = {
        title: config.reportTitle,
        durationType: periodType,
        periodType,
        dateFilter: comparisonFilterType,
        startDate,
        endDate,
        comparisonStartDate: previousPeriodForComparison.startDate,
        comparisonEndDate: previousPeriodForComparison.endDate,
        comparisonLabel: previousPeriodForComparison.label,
        generatedAt: new Date().toISOString(),
        generatedBy: config.generatedBy,
        reportTypes,
        period: `${dayjs(startDate).format('MMM DD, YYYY')} to ${dayjs(endDate).format('MMM DD, YYYY')}`,
        periodLabel: `${formatSmartReportTypeLabel(periodType)} Report • ${selectedPeriodLabel}`,
        greeting: `Hello${user?.first_name ? ` ${user.first_name}` : ''}, here is a summary of your business performance for ${selectedPeriodLabel}.`,
        sections: [],
        insights: reportSections,
        snapshot: buildSmartReportSnapshot({
          revenueData: revenueData?.data || revenueData || {},
          expenseData: expenseData?.data || expenseData || {},
          salesData: salesData?.data || salesData || {},
          outstandingData: outstandingData?.data || outstandingData || {},
          serviceAnalyticsData: serviceAnalyticsData?.data || serviceAnalyticsData || {},
          productSalesData: productSalesData?.data || productSalesData || {},
          phase2Data: phase2ForSnapshot,
          cashFlowData: cashFlowPayload,
          profitLossData: profitLossPayload,
          financialPositionData: financialPositionPayload,
          revenueByChannelData: revenueByChannelPayload,
          prescriptionData: prescriptionData?.data || null,
          comparison: {
            prevRevenue,
            prevExpenses,
            prevCogs,
            prevProfit,
            revenueChange,
            expenseChange,
            profitChange,
            label: previousPeriodForComparison.label,
            startDate,
            endDate,
            comparisonStartDate: previousPeriodForComparison.startDate,
            comparisonEndDate: previousPeriodForComparison.endDate,
          },
          isShop,
          isPharmacy,
          isStudio,
          isRental,
          rentalData: isRental ? rentalOverviewPayload : null,
          terminology,
        }),
      };

      // Return the report data instead of saving it
      return mockReport;
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  };

  const fetchReport = async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;

    try {
      setLoading(true);
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      let response;

      switch (reportType) {
        case 'revenue':
          response = await reportService.getRevenueReport(startDate, endDate, groupBy);
          break;
        case 'expenses':
          response = await reportService.getExpenseReport(startDate, endDate);
          break;
        case 'outstanding':
          response = await reportService.getOutstandingPaymentsReport(startDate, endDate);
          break;
        case 'sales':
          response = await reportService.getSalesReport(startDate, endDate, groupBy);
          break;
        case 'profit-loss':
          response = await reportService.getProfitLossReport(startDate, endDate);
          break;
        default:
          return;
      }

      setReportData(response.data);
    } catch (error) {
      console.error('Error fetching report:', error);
      showError(null, 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportData) {
      showWarning('No report data to download');
      return;
    }

    const dismissLoading = showLoading('Generating PDF...', 0);
    try {
      const html2pdf = await loadHtml2Pdf();
      const reportElement = document.getElementById('report-content');
      if (!reportElement) {
        dismissLoading();
        showError(null, 'Report content not found');
        return;
      }

      const opt = {
        margin: 10,
        filename: `${reportType}_report_${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(reportElement).save();
      
      dismissLoading();
      showSuccess('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      dismissLoading();
      showError(null, 'Failed to generate PDF');
    }
  };

  // Memoize chart data transformations for revenue report
  const revenueChartData = useMemo(() => {
    if (!reportData || reportType !== 'revenue') return { periodChartData: [], customerChartData: [], methodChartData: [] };
    
    const { byPeriod, byCustomer, byMethod } = reportData;

    return {
      periodChartData: byPeriod?.map(item => ({
        name: groupBy === 'day' 
          ? dayjs(item.date || item.date).format('MMM DD')
          : `Month ${item.month}`,
        revenue: parseFloat(item.totalRevenue || 0)
      })) || [],
      customerChartData: byCustomer?.slice(0, 10).map(item => ({
        name: item.customer?.name || 'Unknown',
        revenue: parseFloat(item.totalRevenue || 0)
      })) || [],
      methodChartData: byMethod?.map(item => ({
        name: item.paymentMethod || 'Unknown',
        value: parseFloat(item.totalRevenue || 0)
      })) || []
    };
  }, [reportData, reportType, groupBy]);

  const renderRevenueReport = () => {
    if (!reportData) return null;

    const { totalRevenue } = reportData;
    const { periodChartData, customerChartData, methodChartData } = revenueChartData;

    const customerData = [...(byCustomer || [])].sort((a, b) => parseFloat(a.totalRevenue || 0) - parseFloat(b.totalRevenue || 0));

    return (
      <div id="report-content">
        <div className="grid grid-cols-1 gap-3 md:gap-4 mb-4 md:mb-6">
          <Card>
            <CardContent className="pt-4 md:pt-6 px-4 md:px-6 pb-4 md:pb-6">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-semibold text-primary">{formatAmount(totalRevenue)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Revenue Trend</CardTitle>
              <ShadcnSelect value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">By Day</SelectItem>
                  <SelectItem value="month">By Month</SelectItem>
                </SelectContent>
              </ShadcnSelect>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={periodChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={customerChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Bar dataKey="revenue" fill="var(--color-primary)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={methodChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="var(--color-primary)"
                    dataKey="value"
                  >
                    {methodChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Details</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportsTableWithCards
                title="Customer details"
                columns={[
                  { key: 'customer', label: 'Customer', render: (_, r) => r.customer?.name || '-' },
                  { key: 'company', label: 'Company', render: (_, r) => r.customer?.company || '-' },
                  { key: 'totalRevenue', label: 'Total Revenue', render: (_, r) => formatAmount(r.totalRevenue) },
                  { key: 'paymentCount', label: 'Payments', render: (_, r) => r.paymentCount ?? '-' },
                ]}
                data={customerData.slice(0, 10)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderExpenseReport = () => {
    if (!reportData) return null;

    const { totalExpenses, byCategory, byVendor, byMethod, byDate } = reportData;

    const categoryChartData = byCategory?.map(item => ({
      name: item.category || 'Unknown',
      value: parseFloat(item.totalAmount || 0)
    })) || [];

    const vendorChartData = byVendor?.slice(0, 10).map(item => ({
      name: item.vendor?.name || 'Unknown',
      amount: parseFloat(item.totalAmount || 0)
    })) || [];

    const dateChartData = byDate?.map(item => ({
      name: dayjs(item.date).format('MMM DD'),
      amount: parseFloat(item.totalAmount || 0)
    })) || [];

    return (
      <div id="report-content">
        <div className="grid grid-cols-1 gap-3 md:gap-4 mb-4 md:mb-6">
          <Card>
            <CardContent className="pt-4 md:pt-6 px-4 md:px-6 pb-4 md:pb-6">
              <p className="text-sm text-muted-foreground">Total Expenses</p>
              <p className="text-2xl font-semibold text-red-700">{formatAmount(totalExpenses)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="var(--color-primary)"
                    dataKey="value"
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendorChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Bar dataKey="amount" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Expense Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dateChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--destructive))" strokeWidth={2} name="Expenses" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportsTableWithCards
                title="Expenses by category"
                columns={[
                  { key: 'category', label: 'Category', render: (v) => <Badge className="border-transparent bg-brand text-white hover:bg-brand-dark">{v || '—'}</Badge> },
                  { key: 'totalAmount', label: 'Amount', render: (v) => formatAmount(v) },
                  { key: 'count', label: 'Count' },
                ]}
                data={byCategory || []}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportsTableWithCards
                title="Top vendors"
                columns={[
                  { key: 'vendor', label: 'Vendor', render: (_, r) => r.vendor?.name || '-' },
                  { key: 'totalAmount', label: 'Amount', render: (v) => formatAmount(v) },
                  { key: 'count', label: 'Count' },
                ]}
                data={byVendor?.slice(0, 10) || []}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderOutstandingPaymentsReport = () => {
    if (!reportData) return null;

    const { totalOutstanding, invoices, byCustomer, agingAnalysis } = reportData;

    const customerChartData = byCustomer?.map(item => ({
      name: item.customer?.name || 'Unknown',
      amount: parseFloat(item.totalOutstanding || 0)
    })) || [];

    const agingChartData = [
      { name: 'Current', value: agingAnalysis?.current || 0 },
      { name: '1-30 Days', value: agingAnalysis?.thirtyDays || 0 },
      { name: '31-60 Days', value: agingAnalysis?.sixtyDays || 0 },
      { name: '90+ Days', value: agingAnalysis?.ninetyPlusDays || 0 },
    ];

    const invoicesList = (invoices || []).slice(0, 10);

    return (
      <div id="report-content">
        <div className="grid grid-cols-1 gap-3 md:gap-4 mb-4 md:mb-6">
          <Card>
            <CardContent className="pt-4 md:pt-6 px-4 md:px-6 pb-4 md:pb-6">
              <p className="text-sm text-muted-foreground">Total Outstanding</p>
              <p className="text-2xl font-semibold text-red-700">{formatAmount(totalOutstanding)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Outstanding by Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={customerChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Bar dataKey="amount" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Aging Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={agingChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="var(--color-primary)"
                    dataKey="value"
                  >
                    {agingChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Outstanding Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportsTableWithCards
                columns={[
                  { key: 'invoiceNumber', label: 'Invoice Number' },
                  { key: 'customer', label: 'Customer', render: (_, r) => r.customer?.name || '-' },
                  { key: 'dueDate', label: 'Due Date', render: (v) => dayjs(v).format('MMM DD, YYYY') },
                  { key: 'balance', label: 'Balance', render: (v) => formatAmount(v) },
                  { key: 'status', label: 'Status', mobileDashboardPlacement: 'headerEnd', render: (_, r) => <StatusChip status={r.status} /> },
                ]}
                data={invoicesList}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderSalesReport = () => {
    if (!reportData) return null;

    const { totalSales, byJobType, byCustomer, byDate, byStatus } = reportData;

    const jobTypeChartData = isStudio && byJobType ? byJobType.map(item => ({
      name: item.jobType || 'Unknown',
      value: parseFloat(item.totalSales || 0)
    })) : [];

    const customerChartData = byCustomer?.slice(0, 10).map(item => ({
      name: item.customer?.name || 'Unknown',
      sales: parseFloat(item.totalSales || 0)
    })) || [];

    const dateChartData = byDate?.map(item => ({
      name: dayjs(item.date).format('MMM DD'),
      sales: parseFloat(item.totalSales || 0)
    })) || [];

    return (
      <div id="report-content">
        <div className="grid grid-cols-1 gap-3 md:gap-4 mb-4 md:mb-6">
          <Card>
            <CardContent className="pt-4 md:pt-6 px-4 md:px-6 pb-4 md:pb-6">
              <p className="text-sm text-muted-foreground">{terminology.salesLabel}</p>
              <p className="text-2xl font-semibold text-primary">{formatAmount(totalSales)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {isStudio && (
            <Card>
              <CardHeader>
                <CardTitle>{terminology.salesByTypeLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={jobTypeChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="var(--color-primary)"
                      dataKey="value"
                    >
                      {jobTypeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Top Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={customerChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Bar dataKey="sales" fill="var(--color-primary)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>{terminology.trendLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dateChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="sales" stroke="var(--color-primary)" strokeWidth={2} name={terminology.revenue} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isStudio && (
            <Card>
              <CardHeader>
                <CardTitle>{terminology.salesByTypeLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <ShadcnTable className="min-w-[400px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{terminology.typeColumnLabel}</TableHead>
                      <TableHead>Total Sales</TableHead>
                      <TableHead>{terminology.countColumnLabel}</TableHead>
                      <TableHead>Avg Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(byJobType || []).map((item) => (
                      <TableRow key={item.jobType}>
                        <TableCell>{item.jobType || '-'}</TableCell>
                        <TableCell>{formatAmount(item.totalSales)}</TableCell>
                        <TableCell>{item.jobCount ?? '-'}</TableCell>
                        <TableCell>{formatAmount(item.averagePrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </ShadcnTable>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Sales by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <ShadcnTable className="min-w-[400px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Total Sales</TableHead>
                    <TableHead>{terminology.countColumnLabel}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(byStatus || []).map((item) => (
                    <TableRow key={item.status}>
                      <TableCell><StatusChip status={item.status} /></TableCell>
                      <TableCell>{formatAmount(item.totalSales)}</TableCell>
                      <TableCell>{item.jobCount ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </ShadcnTable>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Memoize profit/loss chart data
  const profitLossChartData = useMemo(() => {
    if (!reportData || reportType !== 'profit-loss') return [];
    
    const { revenue, expenses, grossProfit } = reportData;
    return [
      { name: 'Revenue', value: revenue, color: 'var(--color-primary)' },
      { name: 'Expenses', value: expenses, color: 'hsl(var(--destructive))' },
      { name: 'Profit', value: grossProfit, color: grossProfit >= 0 ? '#16a34a' : 'hsl(var(--destructive))' },
    ];
  }, [reportData, reportType]);

  const renderProfitLossReport = () => {
    if (!reportData) return null;

    const { revenue, expenses, grossProfit, profitMargin } = reportData;
    const profitData = profitLossChartData;

    return (
      <div id="report-content">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Revenue</p>
              <p className="text-2xl font-semibold text-primary">{formatAmount(revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Expenses</p>
              <p className="text-2xl font-semibold text-red-700">{formatAmount(expenses)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Gross Profit</p>
              <p className={cn("text-2xl font-semibold", grossProfit >= 0 ? "text-green-700" : "text-red-700")}>{formatAmount(grossProfit)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Profit Margin</p>
              <p className={cn("text-2xl font-semibold", profitMargin >= 0 ? "text-green-700" : "text-red-700")}>{parseFloat(profitMargin || 0).toFixed(2)}%</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={profitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => formatAmount(value)} />
                  <Bar dataKey="value" fill="var(--color-primary)">
                    {profitData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderReport = () => {
    switch (reportType) {
      case 'revenue':
        return renderRevenueReport();
      case 'expenses':
        return renderExpenseReport();
      case 'outstanding':
        return renderOutstandingPaymentsReport();
      case 'sales':
        return renderSalesReport();
      case 'profit-loss':
        return renderProfitLossReport();
      default:
        return null;
    }
  };

  const reportTypes = useMemo(() => [
    { value: 'revenue', label: 'Revenue Report', icon: <Currency className="h-4 w-4" /> },
    { value: 'expenses', label: 'Expense Report', icon: <ShoppingCart className="h-4 w-4" /> },
    { value: 'outstanding', label: 'Outstanding Payments', icon: <FileText className="h-4 w-4" /> },
    { value: 'sales', label: terminology.reportLabel, icon: <BarChart3 className="h-4 w-4" /> },
    { value: 'profit-loss', label: 'Profit & Loss', icon: <BarChart3 className="h-4 w-4" /> },
  ], [terminology.reportLabel]);

  const formatComplianceCurrency = (num) => formatAmount(num);

  const renderComplianceView = () => {
    const statementTabs = [
      { value: 'income-expenditure', label: 'Income and expenditure' },
      { value: 'profit-loss', label: 'Profit or loss' },
      { value: 'financial-position', label: 'Financial position' },
      { value: 'cashflow', label: 'Cash flows' },
    ];

    const handlePrint = () => {
      if (compliancePrintRef.current) {
        const printContent = compliancePrintRef.current.innerHTML;
        const win = window.open('', '_blank');
        win.document.write(`
          <html><head><title>Financial statements</title>
          <style>body{font-family:system-ui,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left;} th{background:#f9fafb;}</style>
          </head><body>${printContent}</body></html>`);
        win.document.close();
        win.print();
        win.close();
      }
    };

    const statementIsEmpty = (() => {
      if (!complianceData || complianceLoading) return false;
      if (complianceStatementType === 'income-expenditure') {
        return (complianceData.income?.total ?? 0) === 0 && (complianceData.expenditure?.total ?? 0) === 0;
      }
      if (complianceStatementType === 'profit-loss') {
        return (complianceData.revenue ?? 0) === 0 && (complianceData.expenses ?? 0) === 0;
      }
      if (complianceStatementType === 'cashflow') {
        return (complianceData.operating?.cashReceivedFromCustomers ?? 0) === 0
          && (complianceData.operating?.cashPaidToSuppliersAndExpenses ?? 0) === 0;
      }
      if (complianceStatementType === 'financial-position') {
        const assets = complianceData.assets?.total ?? complianceData.totalAssets ?? 0;
        const liabilities = complianceData.liabilities?.total ?? complianceData.totalLiabilities ?? 0;
        return Number(assets) === 0 && Number(liabilities) === 0;
      }
      return false;
    })();

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <WelcomeSection
            welcomeMessage="Statements"
            subText="IAS/IFRS-style statements from your accounting books for authorities and lenders."
          />
          <div className="flex flex-col sm:flex-row gap-2 shrink-0 sm:justify-end">
            <DateRangePicker
              range={dateRange?.[0] && dateRange?.[1] ? { from: dateRange[0].toDate(), to: dateRange[1].toDate() } : undefined}
              onSelect={handleComplianceDateRangeSelect}
              presets={DATE_RANGE_PRESET_OPTIONS}
              activePreset={dateFilter}
              onPresetSelect={handleCompliancePresetSelect}
              className="w-full md:w-auto md:min-w-[240px] border-border bg-card"
            />
            <ShadcnButton variant="outline" onClick={handlePrint}>
              <FileText className="h-4 w-4 mr-2" />
              Print
            </ShadcnButton>
            <ShadcnButton className="bg-brand hover:bg-brand-dark text-white" onClick={handlePrint}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </ShadcnButton>
          </div>
        </div>
        <ComplianceIntroBanner
          storageKey="statements"
          title="About these statements"
          bullets={[
            'Figures come from posted journal entries in Accounting.',
            'If totals are zero, post sales and expenses first, or widen the date range.',
            'For period VAT and GRA filing packs, use Compliance → VAT.',
          ]}
        />
        <Tabs value={complianceStatementType} onValueChange={setComplianceStatementType}>
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            {statementTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div ref={compliancePrintRef} className="mt-4 border border-border rounded-lg p-4 md:p-6 bg-card">
            {complianceSource === 'accounting' && complianceData && !statementIsEmpty && (
              <p className="text-xs text-muted-foreground mb-2">
                From Accounting — figures reflect posted journal entries and chart of accounts.
              </p>
            )}
            {complianceLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {complianceError && !complianceLoading && (
              <Alert variant="destructive">
                <AlertDescription>{complianceError}</AlertDescription>
              </Alert>
            )}
            {!complianceLoading && !complianceError && complianceData && !statementIsEmpty && complianceStatementType === 'income-expenditure' && (
              <>
                <h4 className="text-base font-semibold mb-3">Income and expenditure report (IAS/IFRS)</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Period: {dateRange?.[0]?.format('DD MMM YYYY')} to {dateRange?.[1]?.format('DD MMM YYYY')}
                </p>
                <div className="space-y-4">
                  <div>
                    <p className="font-medium">Income</p>
                    <p className="text-lg">{formatComplianceCurrency(complianceData.income?.total ?? 0)}</p>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Expenditure by category</p>
                    <ShadcnTable>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(complianceData.expenditure?.byCategory || []).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Badge className="border-transparent bg-brand text-white hover:bg-brand-dark">{row.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatComplianceCurrency(row.amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-medium">
                          <TableCell>Total expenditure</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.expenditure?.total ?? 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </ShadcnTable>
                  </div>
                  <div>
                    <p className="font-medium">Surplus / (Deficit)</p>
                    <p className="text-lg">{formatComplianceCurrency(complianceData.surplusDeficit ?? 0)}</p>
                  </div>
                  {complianceSource === 'accounting' && (complianceData.openingStockValue != null || complianceData.closingStockValue != null) && (
                    <div>
                      <p className="font-medium mb-2">Stock (from accounting)</p>
                      <p className="text-sm">Opening stock: {formatComplianceCurrency(complianceData.openingStockValue ?? 0)}</p>
                      <p className="text-sm">Closing stock: {formatComplianceCurrency(complianceData.closingStockValue ?? 0)}</p>
                    </div>
                  )}
                </div>
              </>
            )}
            {!complianceLoading && !complianceError && complianceData && !statementIsEmpty && complianceStatementType === 'profit-loss' && (
              <>
                <h4 className="text-base font-semibold mb-3">Profit or loss (IAS 1)</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Period: {dateRange?.[0]?.format('DD MMM YYYY')} to {dateRange?.[1]?.format('DD MMM YYYY')}
                </p>
                <div className="space-y-4">
                  <div>
                    <p className="font-medium">Revenue</p>
                    <p className="text-lg">{formatComplianceCurrency(complianceData.revenue ?? 0)}</p>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Expenses by category</p>
                    <ShadcnTable>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(complianceData.expensesByCategory || []).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Badge className="border-transparent bg-brand text-white hover:bg-brand-dark">{row.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatComplianceCurrency(row.amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-medium">
                          <TableCell>Total expenses</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.expenses ?? 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </ShadcnTable>
                  </div>
                  <div>
                    <p className="font-medium">Gross profit</p>
                    <p className="text-lg">{formatComplianceCurrency(complianceData.grossProfit ?? 0)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Profit margin: {(complianceData.profitMargin ?? 0).toFixed(2)}%</p>
                  {complianceSource === 'accounting' && (complianceData.openingStockValue != null || complianceData.closingStockValue != null) && (
                    <div>
                      <p className="font-medium mb-2">Stock (from accounting)</p>
                      <p className="text-sm">Opening stock: {formatComplianceCurrency(complianceData.openingStockValue ?? 0)}</p>
                      <p className="text-sm">Closing stock: {formatComplianceCurrency(complianceData.closingStockValue ?? 0)}</p>
                    </div>
                  )}
                </div>
              </>
            )}
            {!complianceLoading && !complianceError && complianceData && !statementIsEmpty && complianceStatementType === 'financial-position' && (
              <>
                <h4 className="text-base font-semibold mb-3">Statement of financial position (IAS 1)</h4>
                <p className="text-sm text-muted-foreground mb-4">As at {complianceData.asAtDate || dateRange?.[1]?.format('YYYY-MM-DD')}</p>
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-2">Assets</p>
                    <ShadcnTable>
                      <TableBody>
                        <TableRow>
                          <TableCell>Debtors (trade receivables)</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.assets?.debtors ?? complianceData.assets?.receivables ?? 0)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Product inventory</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.assets?.productInventory ?? 0)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Materials</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.assets?.materials ?? 0)}</TableCell>
                        </TableRow>
                        <TableRow className="font-medium">
                          <TableCell>Total assets</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.totalAssets ?? 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </ShadcnTable>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Liabilities</p>
                    <p className="text-sm">Total liabilities: {formatComplianceCurrency(complianceData.liabilities?.total ?? 0)}</p>
                  </div>
                  <div>
                    <p className="font-medium mb-2">Equity</p>
                    <p className="text-sm">Retained earnings: {formatComplianceCurrency(complianceData.equity?.retainedEarnings ?? 0)}</p>
                  </div>
                </div>
              </>
            )}
            {!complianceLoading && !complianceError && complianceData && !statementIsEmpty && complianceStatementType === 'cashflow' && (
              <>
                <h4 className="text-base font-semibold mb-3">Statement of cash flows (IAS 7)</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Period: {dateRange?.[0]?.format('DD MMM YYYY')} to {dateRange?.[1]?.format('DD MMM YYYY')}
                </p>
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-2">Operating activities</p>
                    <ShadcnTable>
                      <TableBody>
                        <TableRow>
                          <TableCell>Cash received from customers</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.operating?.cashReceivedFromCustomers ?? 0)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Cash paid to suppliers and expenses</TableCell>
                          <TableCell className="text-right">({formatComplianceCurrency(complianceData.operating?.cashPaidToSuppliersAndExpenses ?? 0)})</TableCell>
                        </TableRow>
                        <TableRow className="font-medium">
                          <TableCell>Net cash from operating activities</TableCell>
                          <TableCell className="text-right">{formatComplianceCurrency(complianceData.operating?.netCashFromOperatingActivities ?? 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </ShadcnTable>
                  </div>
                  <div>
                    <p className="font-medium">Net change in cash</p>
                    <p className="text-lg">{formatComplianceCurrency(complianceData.netChangeInCash ?? 0)}</p>
                  </div>
                </div>
              </>
            )}
            {!complianceLoading && !complianceError && statementIsEmpty && (
              <EmptyState
                icon="FileText"
                title="No activity in this period"
                description="These statements pull from posted journal entries. Post sales and expenses in Accounting, or choose a wider date range."
                secondaryAction={{
                  label: 'Change dates',
                  onClick: () => {
                    setDateFilter('thisYear');
                    setDateRange(calculateDateRange('thisYear'));
                  },
                }}
                primaryAction={{
                  label: 'Open Accounting',
                  onClick: () => navigate('/accounting'),
                }}
              />
            )}
            {!complianceLoading && !complianceError && !complianceData && !statementIsEmpty && (
              <p className="text-sm text-muted-foreground">Select a statement type and date range to view the report.</p>
            )}
          </div>
        </Tabs>
      </div>
    );
  };


  // Smart Report section options — ids match detail page tabs
  const reportTypeOptionsGrouped = useMemo(
    () => getSmartReportTypeOptionsGrouped(smartReportTypeContext),
    [smartReportTypeContext]
  );

  const reportTypeOptions = useMemo(
    () => reportTypeOptionsGrouped.flatMap((g) => g.options),
    [reportTypeOptionsGrouped]
  );

  if (!rc && !isOverview) {
    return (
      <div className="space-y-4 md:space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
          <span>Loading charts…</span>
        </div>
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-[320px] w-full rounded-md border border-border" />
        <Skeleton className="h-[220px] w-full rounded-md border border-border" />
      </div>
    );
  }

  const {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip: RechartsTooltip,
    Legend,
    ResponsiveContainer,
  } = rc || {};

  const renderGeneratedReports = () => {
    // Map report types to display names and icons
    const getReportTypeDisplay = (reportType) => {
      const meta = getSmartReportTabMeta(reportType, smartReportTypeContext);
      return { label: meta.label, icon: meta.icon || FileText };
    };

    const getReportTypes = (report) => {
      return resolveSmartReportTabs(report, smartReportTypeContext).map((tab) => tab.id);
    };

    // Determine status from actual status field (default to 'ready' if not set for backward compatibility)
    const getReportStatus = (report) => {
      return report.status || 'ready';
    };

    return (
      <div className={isMobile ? "space-y-4" : "space-y-6"}>
        {/* Empty State */}
        {savedReports.length === 0 && (
          <Card>
            <CardContent className={isMobile ? "p-4" : "p-8 md:p-20"}>
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h4 className="text-lg font-semibold">No Reports Created Yet</h4>
                <p className="text-muted-foreground max-w-[480px] mx-auto my-4">
                  Create custom reports with specific date ranges, report types, and configurations. These reports will be saved for future reference.
                </p>
                <ShadcnButton
                  onClick={handleOpenCreateReportModal}
                  className="bg-brand hover:bg-brand-dark text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Report
                </ShadcnButton>
              </div>
            </CardContent>
          </Card>
        )}

        {savedReports.length > 0 && filteredReports.length === 0 && searchValue.trim() && (
          <Card>
            <CardContent className={isMobile ? 'p-4' : 'p-8'}>
              <EmptyState
                {...getSearchNoResultsEmptyStateProps(searchValue, () => setSearchValue(''))}
                size="sm"
              />
            </CardContent>
          </Card>
        )}

        {/* Reports Table - table on desktop, cards on mobile */}
        {filteredReports.length > 0 && (
          isMobile ? (
            <div className="space-y-2">
              {filteredReports.map((report) => {
                const reportTypesList = getReportTypes(report);
                const status = getReportStatus(report);
                return (
                  <div key={report.id || report.generatedAt} className="border border-border rounded-lg p-4 bg-card">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{report.title}</p>
                              <p className="text-muted-foreground text-xs mt-0.5">{dayjs(report.generatedAt).format('D/MM/YYYY')}</p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <ShadcnButton
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 shrink-0 min-h-[44px] min-w-[44px]"
                                >
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </ShadcnButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => status === 'ready' && setGeneratedReport(report)}
                                  disabled={status !== 'ready'}
                                  className={status !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    showSuccess('Download feature coming soon');
                                  }}
                                  disabled={status !== 'ready'}
                                  className={status !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteSavedReport(report)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {reportTypesList.slice(0, 2).map((type, idx) => {
                              const typeDisplay = getReportTypeDisplay(type);
                              const Icon = typeDisplay.icon;
                              return (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="bg-muted text-foreground border-0 flex items-center gap-1 px-2 py-1"
                                >
                                  <Icon className="h-3 w-3" />
                                  {typeDisplay.label}
                                </Badge>
                              );
                            })}
                            {reportTypesList.length > 2 && (
                              <Badge
                                variant="secondary"
                                className="bg-muted text-muted-foreground border-0 flex items-center gap-1 px-2 py-1"
                                title={reportTypesList.slice(2).map((t) => getReportTypeDisplay(t).label).join(', ')}
                              >
                                +{reportTypesList.length - 2}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                            <span className="text-xs text-muted-foreground">{report.generatedBy}</span>
                            <Badge
                              title={status === 'failed' ? report.failureReason : undefined}
                              className={
                                status === 'ready'
                                  ? 'bg-primary/15 text-primary border-0 px-2 py-1 hover:bg-primary/15 cursor-default'
                                  : status === 'processing'
                                  ? 'bg-orange-100 text-orange-700 border-0 px-2 py-1 hover:bg-orange-100 cursor-default'
                                  : 'bg-red-100 text-red-700 border-0 px-2 py-1 hover:bg-red-100 cursor-default'
                              }
                            >
                              {status === 'ready' ? 'Ready' : status === 'processing' ? 'Processing' : 'Failed'}
                            </Badge>
                          </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card className="border border-border rounded-lg overflow-hidden">
              <CardContent className="p-0">
                <ShadcnTable className="min-w-[400px]">
                  <TableHeader>
                    <TableRow className="border-b border-border bg-muted/50">
                      <TableHead className="font-semibold text-foreground py-4 px-6">Report name</TableHead>
                      <TableHead className="font-semibold text-foreground py-4 px-6">Date created</TableHead>
                      <TableHead className="font-semibold text-foreground py-4 px-6">Type</TableHead>
                      <TableHead className="font-semibold text-foreground py-4 px-6">Created by</TableHead>
                      <TableHead className="font-semibold text-foreground py-4 px-6">Status</TableHead>
                      <TableHead className="font-semibold text-foreground py-4 px-6 w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => {
                      const reportTypesList = getReportTypes(report);
                      const status = getReportStatus(report);
                      return (
                        <TableRow key={report.id || report.generatedAt} className="border-b border-border hover:bg-muted/50">
                          <TableCell className="font-medium py-4 px-6">
                            {report.title}
                          </TableCell>
                          <TableCell className="text-muted-foreground py-4 px-6">
                            {dayjs(report.generatedAt).format('D/MM/YYYY')}
                          </TableCell>
                          <TableCell className="py-4 px-6">
                            <div className="flex flex-wrap gap-2">
                              {reportTypesList.slice(0, 2).map((type, idx) => {
                                const typeDisplay = getReportTypeDisplay(type);
                                const Icon = typeDisplay.icon;
                                return (
                                  <Badge
                                    key={idx}
                                    variant="secondary"
                                    className="bg-muted text-foreground border-0 flex items-center gap-1 px-2 py-1"
                                  >
                                    <Icon className="h-3 w-3" />
                                    {typeDisplay.label}
                                  </Badge>
                                );
                              })}
                              {reportTypesList.length > 2 && (
                                <Badge
                                  variant="secondary"
                                  className="bg-muted text-muted-foreground border-0 flex items-center gap-1 px-2 py-1"
                                  title={reportTypesList.slice(2).map((t) => getReportTypeDisplay(t).label).join(', ')}
                                >
                                  +{reportTypesList.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground py-4 px-6">{report.generatedBy}</TableCell>
                          <TableCell className="py-4 px-6">
                            <Badge
                              title={status === 'failed' ? report.failureReason : undefined}
                              className={
                                status === 'ready'
                                  ? 'bg-primary/15 text-primary border-0 px-2 py-1 hover:bg-primary/15 cursor-default'
                                  : status === 'processing'
                                  ? 'bg-orange-100 text-orange-700 border-0 px-2 py-1 hover:bg-orange-100 cursor-default'
                                  : 'bg-red-100 text-red-700 border-0 px-2 py-1 hover:bg-red-100 cursor-default'
                              }
                            >
                              {status === 'ready' ? 'Ready' : status === 'processing' ? 'Processing' : 'Failed'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4 px-6">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <ShadcnButton
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 hover:bg-muted"
                                >
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </ShadcnButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => status === 'ready' && setGeneratedReport(report)}
                                  disabled={status !== 'ready'}
                                  className={status !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    showSuccess('Download feature coming soon');
                                  }}
                                  disabled={status !== 'ready'}
                                  className={status !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteSavedReport(report)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </ShadcnTable>
              </CardContent>
            </Card>
          )
        )}
      </div>
    );
  };

  return (
    <>
      {/* Create Report Modal - shadcn Dialog + Form */}
      <Dialog open={createReportModalVisible} onOpenChange={setCreateReportModalVisible}>
        <DialogContent className="sm:max-w-[640px] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-lg font-semibold">Create report</DialogTitle>
          </DialogHeader>
          <Form {...reportConfigForm}>
            <form onSubmit={reportConfigForm.handleSubmit(handleCreateReport)} className="flex flex-col max-h-[85vh]">
              <div className="px-6 space-y-5 overflow-y-auto max-h-[60vh] min-h-0">
              <FormField
                control={reportConfigForm.control}
                name="reportTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Report title</FormLabel>
                    <FormControl>
                      <ShadcnInput placeholder="Add title" className="h-11" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Report period</Label>
                <DateRangePicker
                  range={dateRange?.[0] && dateRange?.[1] ? { from: dateRange[0].toDate(), to: dateRange[1].toDate() } : undefined}
                  onSelect={handleSmartReportDateRangeSelect}
                  presets={DATE_RANGE_PRESET_OPTIONS}
                  activePreset={dateFilter}
                  onPresetSelect={handleSmartReportPresetSelect}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Smart Report uses this selected range and compares it with the previous equivalent period.
                </p>
              </div>

              <div className="space-y-4 pt-1">
                <Label className="text-sm font-medium">Report sections</Label>
                <p className="text-xs text-muted-foreground">Selected sections appear as tabs in your Smart Report.</p>
                <div className="space-y-4">
                  {reportTypeOptionsGrouped.map((group) => (
                    <div key={group.groupLabel}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        {group.groupLabel}
                      </p>
                      <div className="space-y-2">
                        {group.options.map((type) => (
                          <div
                            key={type.value}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (selectedReportTypes.includes(type.value)) {
                                setSelectedReportTypes(selectedReportTypes.filter((t) => t !== type.value));
                              } else {
                                setSelectedReportTypes([...selectedReportTypes, type.value]);
                              }
                            }}
                            onKeyDown={(e) =>
                              e.key === 'Enter' &&
                              (document.activeElement === e.currentTarget
                                ? selectedReportTypes.includes(type.value)
                                  ? setSelectedReportTypes(selectedReportTypes.filter((t) => t !== type.value))
                                  : setSelectedReportTypes([...selectedReportTypes, type.value])
                                : null)
                            }
                            className={cn(
                              'flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-colors',
                              selectedReportTypes.includes(type.value) ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                            )}
                          >
                            <div>
                              <p className="font-medium text-sm">{type.label}</p>
                              <p className="text-xs text-muted-foreground">{type.description}</p>
                            </div>
                            <div
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2"
                              style={{
                                borderColor: selectedReportTypes.includes(type.value) ? 'var(--color-primary)' : '#d9d9d9',
                                background: selectedReportTypes.includes(type.value) ? 'var(--color-primary)' : undefined,
                              }}
                            >
                              {selectedReportTypes.includes(type.value) && (
                                <CheckCircle className="h-3 w-3 text-white" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
              <DialogFooter className="gap-2 pt-4 pb-6 px-6 flex-shrink-0 border-t border-border mt-0">
                <ShadcnButton type="button" variant="outline" size="lg" onClick={() => setCreateReportModalVisible(false)}>
                  Cancel
                </ShadcnButton>
                <ShadcnButton type="submit" size="lg" disabled={isCreatingReport} className="bg-brand hover:bg-brand-dark">
                  {isCreatingReport ? 'Creating...' : 'Create'}
                </ShadcnButton>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

    <div className="bg-background min-h-screen px-0 py-2 md:px-6 md:py-4">
      {!isOverview && !generatedReport && (
      <div className="flex flex-wrap items-center justify-between gap-3 md:gap-4 mb-3 md:mb-6 bg-card p-2 md:p-5 rounded-lg border border-border">
        <h2 className="text-2xl font-semibold">Reports & Analytics</h2>
        {showSmartReportList && (
          <div className="flex items-center gap-3">
            <DateRangePicker
              range={dateRange?.[0] && dateRange?.[1] ? { from: dateRange[0].toDate(), to: dateRange[1].toDate() } : undefined}
              onSelect={handleSmartReportDateRangeSelect}
              presets={DATE_RANGE_PRESET_OPTIONS}
              activePreset={dateFilter}
              onPresetSelect={handleSmartReportPresetSelect}
              className="w-auto min-w-[240px] border-border bg-card"
            />

            {/* Filter/Sort Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <ShadcnButton
                  variant="outline"
                  className="border-border bg-card"
                  onClick={() => {
                    // Filter/sort handler
                  }}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </ShadcnButton>
              </TooltipTrigger>
              <TooltipContent>Filter or sort reports</TooltipContent>
            </Tooltip>

            {/* All Badge with Count */}
            <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-card">
              <span className="text-sm text-foreground">All</span>
              <Badge variant="secondary" className="bg-muted text-foreground">
                {savedReports.length}
              </Badge>
            </div>

            {/* Create Report Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <ShadcnButton
                  onClick={handleOpenCreateReportModal}
                  className="bg-brand hover:bg-brand-dark text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create report
                </ShadcnButton>
              </TooltipTrigger>
              <TooltipContent>Create a new report</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
      )}

      {isMobile && showSmartReportList ? (
        <div className="mt-0">
          {renderGeneratedReports()}
        </div>
      ) : isOverview ? (
        <div className="p-2 md:p-4">
          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-10 w-full max-w-md" />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="pt-4 md:pt-6 px-4 md:px-6 pb-4 md:pb-6">
                      <Skeleton className="h-4 w-24 mb-2" />
                      <Skeleton className="h-8 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardContent className="pt-4 md:pt-6 px-4 md:px-6 pb-4 md:pb-6">
                  <TableSkeleton rows={8} cols={5} />
                </CardContent>
              </Card>
            </div>
          ) : overviewStats ? (
            <>
              <ReportsOverviewDashboard
                overviewStats={overviewStats}
                dateRange={dateRange}
                dateFilter={dateFilter}
                onDateRangeSelect={handleOverviewDateRangeSelect}
                onPresetSelect={handleOverviewPresetSelect}
                onCustomize={handleOverviewCustomize}
                onDownload={handleOverviewDownload}
                downloading={overviewDownloading}
                isShop={isShop}
                isPharmacy={isPharmacy}
                isStudio={isStudio}
                isRental={isRental}
                businessType={businessType}
              />
              {isRental && (
                <RentalReportsOverview
                  embedded
                  rentalStats={overviewStats.rental}
                  dateRange={dateRange}
                />
              )}
            </>
          ) : null}
        </div>
      ) : isCompliance ? (
        renderComplianceView()
      ) : (
        <Card className="rounded-lg border border-border">
          <CardContent className="p-0">
          {isSmartReport && generatedReport ? (
            <SmartReportDetail
              report={generatedReport}
              onBack={() => setGeneratedReport(null)}
              isStudio={isStudio}
              isShop={isShop}
              isPharmacy={isPharmacy}
              isRental={isRental}
            />
          ) : (
            <div className="p-0 md:p-6">
              {renderGeneratedReports()}
            </div>
          )}
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}

function Reports() {
  // Simple Mode: totals, best sellers and spending only (no charts or statements).
  const { isRestricted } = useSimpleMode();
  if (isRestricted) return <SimpleReports />;
  return (
    <RechartsModuleProvider>
      <ReportsInner />
    </RechartsModuleProvider>
  );
}

export default Reports;

