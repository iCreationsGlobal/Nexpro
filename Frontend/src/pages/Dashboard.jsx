import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useResponsive } from '../hooks/useResponsive';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DetailSkeleton from '../components/DetailSkeleton';
import WelcomeSection from '../components/WelcomeSection';
import DateFilterButtons from '../components/DateFilterButtons';
import DashboardStatsCards from '../components/DashboardStatsCards';
import DashboardJobsTable from '../components/DashboardJobsTable';
import { showSuccess, showError, showWarning } from '../utils/toast';
import { formatPeriodLabel } from '../utils/formatPeriodLabel';
import { buildAskAiUrl } from '../utils/buildAskAiUrl';
import { IBIS_ASK_LABEL, IBIS_NAME } from '@/constants/ibis';
import { getCoreTypeForBusinessSubType } from '@/constants/businessTypes';
import { cn } from '@/lib/utils';
import {
  Currency,
  ShoppingCart,
  FileText,
  Users,
  TrendingUp,
  TrendingDown,
  Filter,
  Calendar,
  Plus,
  Clock,
  Upload as UploadIcon,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  Inbox,
  AlertTriangle,
  Info,
  Wallet,
  UserPlus,
  Loader2,
  RefreshCw,
  Package,
  Sparkles,
  X,
} from 'lucide-react';
import { Empty } from '../components/ui/empty';
import { Skeleton } from '../components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import dashboardService from '../services/dashboardService';
import assistantService from '../services/assistantService';
import productService from '../services/productService';
import OnlineStoreOrderBanner from '../components/store/OnlineStoreOrderBanner';
import { useOnlineStoreOrderAttention } from '../hooks/useOnlineStoreOrderAttention';
import settingsService from '../services/settingsService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useDebounce } from '../hooks/useDebounce';
import { CURRENCY, QUERY_CACHE, STUDIO_LIKE_TYPES, DEBOUNCE_DELAYS, SEARCH_PLACEHOLDERS } from '../constants';
import { isPlaceholderBusinessName } from '../constants/tenantPlaceholders';
import { formatAmount } from '../utils/formatNumber';
import { queryKeys } from '../utils/queryKeys';
import { useScopedWorkspaceName } from '../hooks/useScopedWorkspaceName';
import { useDismissibleDashboardBanner } from '../hooks/useDismissibleDashboardBanner';
import { isSabitoStoreEnabled } from '../utils/sabitoStoreFeature';
import { isPricingUiEnabled } from '../utils/showPricing';
import { matchesSearchQuery } from '../utils/searchEmptyState';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';
import relativeTime from 'dayjs/plugin/relativeTime';

// Extend dayjs with plugins
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);
dayjs.extend(relativeTime);

const parseAiInsightResponse = (message = '') => {
  const trimmed = String(message || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!trimmed) return null;

  const parseJson = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.title && parsed?.body) {
        return {
          title: String(parsed.title).trim(),
          body: String(parsed.body).trim(),
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  const directJson = parseJson(trimmed);
  if (directJson) return directJson;

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const extractedJson = parseJson(jsonMatch[0]);
    if (extractedJson) return extractedJson;
  }

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => /^title:/i.test(line));
  const bodyLine = lines.find((line) => /^(body|insight):/i.test(line));
  if (titleLine && bodyLine) {
    return {
      title: titleLine.replace(/^title:\s*/i, '').trim(),
      body: bodyLine.replace(/^(body|insight):\s*/i, '').trim(),
    };
  }

  return {
    title: 'AI business insight',
    body: trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed,
  };
};

const SHARP_DASHBOARD_DECLINE_PERCENTAGE = -50;
const SIGNIFICANT_DAILY_BASELINE_PERCENTAGE = 15;

const getApiStatus = (error) => error?.response?.status;
const getApiErrorCode = (error) => error?.response?.data?.errorCode;
const getApiMessage = (error) => error?.response?.data?.message || error?.response?.data?.error;

const isSubscriptionLockedError = (error) =>
  getApiStatus(error) === 403 && getApiErrorCode(error) === 'SUBSCRIPTION_LOCKED';

const isDashboardAccessDeniedError = (error) => getApiStatus(error) === 403;

const isBillingLocked = (billingStatus) =>
  billingStatus?.canAccessApp === false ||
  billingStatus?.billingStatus === 'locked' ||
  billingStatus?.billingStatus === 'suspended';

const toFiniteNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const formatPercent = (value) => `${Math.abs(toFiniteNumber(value)).toFixed(0)}%`;

const getInclusiveDays = (startDate, endDate) => {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return 1;
  return Math.max(1, end.diff(start, 'day') + 1);
};

const getElapsedPeriodDays = (startDate, endDate) => {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  const today = dayjs().startOf('day');
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return 1;
  const effectiveEnd = today.isAfter(start) && today.isBefore(end) ? today : end;
  return Math.max(1, effectiveEnd.diff(start, 'day') + 1);
};

const calculatePercentageChange = (current, baseline) => {
  const currentValue = toFiniteNumber(current);
  const baselineValue = toFiniteNumber(baseline);
  if (baselineValue > 0) return ((currentValue - baselineValue) / baselineValue) * 100;
  if (currentValue > 0 && baselineValue <= 0) return 100;
  if (currentValue <= 0 && baselineValue > 0) return -100;
  return 0;
};

const buildHealthMetric = ({ current, comparisonMetric, currentDays, baselineDays, lowerIsBetter = false }) => {
  const currentValue = toFiniteNumber(current);
  const previousValue = toFiniteNumber(comparisonMetric?.previous);
  const currentDailyAverage = currentValue / Math.max(1, currentDays);
  const baselineDailyAverage = previousValue / Math.max(1, baselineDays);
  const dailyAverageChangePercentage = calculatePercentageChange(currentDailyAverage, baselineDailyAverage);
  const isAboveDailyBaseline = dailyAverageChangePercentage >= SIGNIFICANT_DAILY_BASELINE_PERCENTAGE;
  const isBelowDailyBaseline = dailyAverageChangePercentage <= -SIGNIFICANT_DAILY_BASELINE_PERCENTAGE;

  return {
    current: currentValue,
    previous: previousValue,
    totalChangePercentage: toFiniteNumber(comparisonMetric?.percentage),
    currentDailyAverage,
    baselineDailyAverage,
    dailyAverageChangePercentage,
    hasBaseline: previousValue > 0 || baselineDailyAverage > 0,
    isHealthy: lowerIsBetter ? isBelowDailyBaseline : isAboveDailyBaseline,
    isUnhealthy: lowerIsBetter ? isAboveDailyBaseline : isBelowDailyBaseline,
  };
};

const buildFallbackInsight = ({ businessHealthContext }) => {
  const {
    metrics,
    lowStockCount,
    isRetail,
    isProfitable,
    profitMargin,
    comparisonLabel,
  } = businessHealthContext;

  if (metrics.profit.current < 0 && metrics.revenue.current > 0) {
    return {
      title: 'Costs are outpacing revenue',
      body: metrics.profit.hasBaseline
        ? `Profit is below its ${comparisonLabel} baseline. Review spending and protect higher-margin sales.`
        : 'Expenses are higher than revenue for this period. Review spending and push higher-margin sales.',
    };
  }

  if (metrics.revenue.isUnhealthy && metrics.profit.isUnhealthy) {
    return {
      title: 'Performance is below baseline',
      body: `Revenue and profit are below recent averages. Check sales activity before increasing spend.`,
    };
  }

  if (metrics.expenses.isUnhealthy && profitMargin < 10) {
    return {
      title: 'Expenses are running high',
      body: `Spending is ${formatPercent(metrics.expenses.dailyAverageChangePercentage)} above average while margin is tight.`,
    };
  }

  if (lowStockCount > 0 && isRetail) {
    return {
      title: 'Stock needs attention',
      body: `${lowStockCount} item${lowStockCount === 1 ? ' is' : 's are'} low on stock. Restock priority products first.`,
    };
  }

  if (metrics.revenue.isHealthy && metrics.profit.current > 0) {
    return {
      title: 'Business is ahead of average',
      body: `Revenue is ${formatPercent(metrics.revenue.dailyAverageChangePercentage)} above its recent daily average with positive profit.`,
    };
  }

  if (metrics.revenue.current > 0 && isProfitable) {
    return {
      title: 'Business is steady',
      body: 'Revenue is covering expenses for this period. Keep comparing sales, costs, and customer activity.',
    };
  }

  return {
    title: 'Your dashboard is ready',
    body: `Ask ${IBIS_NAME} to explain trends, collections, stock, or next steps for this period.`,
  };
};

const buildBusinessHealthOverrideInsight = ({ businessHealthContext }) => {
  const {
    metrics,
    periodLabel,
    comparisonLabel,
    isProfitable,
    profitMargin,
  } = businessHealthContext;

  if (!metrics.revenue.hasBaseline && !metrics.profit.hasBaseline) return null;

  const revenuePercentage = metrics.revenue.totalChangePercentage;
  const profitPercentage = metrics.profit.totalChangePercentage;
  const profitDownSharply = profitPercentage <= SHARP_DASHBOARD_DECLINE_PERCENTAGE;
  const revenueDownSharply = revenuePercentage <= SHARP_DASHBOARD_DECLINE_PERCENTAGE;

  if (!profitDownSharply && !revenueDownSharply) return null;

  if (isProfitable && profitMargin >= 10 && !metrics.revenue.isUnhealthy && !metrics.profit.isUnhealthy) {
    return {
      title: 'Drop needs context',
      body: `${periodLabel} totals are lower ${comparisonLabel}, but daily averages and profit still look healthy.`,
    };
  }

  const metric = profitDownSharply ? 'profit' : 'revenue';
  const metricContext = profitDownSharply ? metrics.profit : metrics.revenue;
  const percentage = Math.abs(profitDownSharply ? profitPercentage : revenuePercentage);

  if (!metricContext.isUnhealthy && isProfitable) {
    return {
      title: `${profitDownSharply ? 'Profit' : 'Revenue'} is lower`,
      body: `${periodLabel} ${metric} is down ${percentage}% ${comparisonLabel}, but average pace is not sharply below baseline.`,
    };
  }

  return {
    title: `${profitDownSharply ? 'Profit' : 'Revenue'} below baseline`,
    body: `${periodLabel} ${metric} is down ${percentage}% ${comparisonLabel} and below its recent daily average.`,
  };
};

const buildStaffDashboardInsight = ({ businessHealthContext }) => {
  const {
    metrics,
    lowStockCount,
    isRetail,
    comparisonLabel,
  } = businessHealthContext;

  if (lowStockCount > 0 && isRetail) {
    return {
      title: 'Stock needs attention',
      body: `${lowStockCount} item${lowStockCount === 1 ? ' is' : 's are'} low on stock. Restock priority products first.`,
    };
  }

  if (metrics.revenue.isUnhealthy) {
    return {
      title: 'Sales are below baseline',
      body: `Revenue is below its ${comparisonLabel} baseline. Check customer activity and recent sales.`,
    };
  }

  if (metrics.revenue.isHealthy) {
    return {
      title: 'Sales are ahead',
      body: `Revenue is ${formatPercent(metrics.revenue.dailyAverageChangePercentage)} above its recent daily average.`,
    };
  }

  if (metrics.newCustomers.isHealthy) {
    return {
      title: 'Customer growth is up',
      body: `New customers are ${formatPercent(metrics.newCustomers.dailyAverageChangePercentage)} above recent averages.`,
    };
  }

  return {
    title: 'Your dashboard is ready',
    body: 'Review sales, customers, stock, and next steps for this period.',
  };
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, activeTenant, tenantRole, wasInvited, suppressAppGuidance, billingStatus } = useAuth();
  const {
    activeTenantId,
    activeShopId,
    activeStudioLocationId,
    scopeReady,
  } = useWorkspaceScope();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const [isRefetching, setIsRefetching] = useState(false);
  const { isMobile } = useResponsive();
  const initialMonthRange = useMemo(() => [dayjs().startOf('month'), dayjs().endOf('month')], []);
  const [dateRange, setDateRange] = useState(initialMonthRange);
  const [activeFilter, setActiveFilter] = useState('month');
  const [jobsPagination, setJobsPagination] = useState({ current: 1, pageSize: 5 });
  const [overviewParams, setOverviewParams] = useState(() => {
    const start = dayjs().startOf('month');
    const end = dayjs().endOf('month');
    return {
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
      filterType: 'thisMonth',
    };
  });

  const { data: overviewResponse, isLoading: overviewLoading, isError: overviewError, error: overviewQueryError, refetch: refetchOverview, isFetched: overviewFetched } = useQuery({
    queryKey: queryKeys.dashboard.overview(activeTenantId, activeShopId, activeStudioLocationId, overviewParams),
    queryFn: () => dashboardService.getOverview(overviewParams.startDate, overviewParams.endDate, overviewParams.filterType),
    enabled: scopeReady,
    staleTime: QUERY_CACHE.STALE_TIME_VOLATILE,
    refetchOnWindowFocus: true,
    // Keep dashboard figures fresh after payments/invoice changes without manual refresh.
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => !isDashboardAccessDeniedError(error) && failureCount < 1,
  });
  const overview = useMemo(
    () => (overviewResponse ? overviewResponse?.data || overviewResponse : null),
    [overviewResponse]
  );
  const loading = overviewLoading;

  const [comparisonData, setComparisonData] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const queryClient = useQueryClient();

  // Fetch organization settings (for display name, logo, etc.)
  const { data: organizationData, isPending: organizationSettingsPending } = useQuery({
    queryKey: queryKeys.settings.organization(activeTenantId),
    queryFn: () => settingsService.getOrganizationSettings(),
    enabled: !!activeTenantId,
  });

  const expectedDashboardAccessError = useMemo(
    () => isDashboardAccessDeniedError(overviewQueryError),
    [overviewQueryError]
  );

  const subscriptionLocked = useMemo(
    () => isSubscriptionLockedError(overviewQueryError) || isBillingLocked(billingStatus),
    [overviewQueryError, billingStatus]
  );

  useEffect(() => {
    if (overviewError && !expectedDashboardAccessError) {
      showError(overviewQueryError, 'Failed to load dashboard. Please try again.');
    }
  }, [overviewError, expectedDashboardAccessError, overviewQueryError]);

  const fetchDashboardData = useCallback((startDate = null, endDate = null, filterType = null) => {
    const today = dayjs();
    const sd = startDate || today.format('YYYY-MM-DD');
    const ed = endDate || today.format('YYYY-MM-DD');
    const ft = filterType || 'today';
    setOverviewParams({ startDate: sd, endDate: ed, filterType: ft });
    setIsRefetching(true);
  }, []);

  // Keep current filter in ref so pull-to-refresh uses it
  const dateFilterRef = useRef({ dateRange, activeFilter });
  dateFilterRef.current = { dateRange, activeFilter };
  const refreshWithCurrentFilter = useCallback(() => {
    const { dateRange: range, activeFilter: filter } = dateFilterRef.current;
    if (range && range[0] && range[1] && filter) {
      fetchDashboardData(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), filter);
    } else {
      fetchDashboardData();
    }
  }, [fetchDashboardData]);

  // Pull-to-refresh hook for dashboard (refetches with current date filter)
  const { isRefreshing, pullDistance, containerProps } = usePullToRefresh(
    refreshWithCurrentFilter,
    { enabled: isMobile }
  );

  useEffect(() => {
    const start = dayjs().startOf('month');
    const end = dayjs().endOf('month');
    setOverviewParams({ startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD'), filterType: 'thisMonth' });
  }, []);

  // Clear stale overview when workspace scope changes (tenant, shop, or studio location)
  useEffect(() => {
    setComparisonData(null);
  }, [activeTenantId, activeShopId, activeStudioLocationId]);

  useEffect(() => {
    if (!overview) return;
    setComparisonLoading(true);
    setComparisonData(null);
    const comparison = overview?.comparison || null;
    const id = setTimeout(() => {
      setComparisonData(comparison);
      setComparisonLoading(false);
    }, 80);
    
    return () => clearTimeout(id);
  }, [overview, activeTenantId, activeShopId, activeStudioLocationId, overviewParams.filterType]);

  useEffect(() => {
    if (!overviewLoading) setIsRefetching(false);
  }, [overviewLoading]);

  const handleDateRangeChange = useCallback((dates) => {
    setIsRefetching(true);
    setDateRange(dates);
    setActiveFilter(null);
    if (dates && dates[0] && dates[1]) {
      fetchDashboardData(dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'), 'custom');
    } else {
      fetchDashboardData();
    }
  }, [fetchDashboardData]);

  const clearFilters = useCallback(() => {
    setIsRefetching(true);
    setComparisonData(null);
    const startOfMonth = dayjs().startOf('month');
    const endOfMonth = dayjs().endOf('month');
    setDateRange([startOfMonth, endOfMonth]);
    setActiveFilter('month');
    fetchDashboardData(startOfMonth.format('YYYY-MM-DD'), endOfMonth.format('YYYY-MM-DD'), 'thisMonth');
  }, [fetchDashboardData]);

  // Quick date filter functions
  const setTodayFilter = useCallback(() => {
    setIsRefetching(true);
    const today = dayjs();
    const range = [today, today];
    setDateRange(range);
    setActiveFilter('today');
    fetchDashboardData(today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD'), 'today');
  }, [fetchDashboardData]);

  const setYesterdayFilter = useCallback(() => {
    setIsRefetching(true);
    const yesterday = dayjs().subtract(1, 'day');
    const range = [yesterday, yesterday];
    setDateRange(range);
    setActiveFilter('yesterday');
    fetchDashboardData(yesterday.format('YYYY-MM-DD'), yesterday.format('YYYY-MM-DD'), 'yesterday');
  }, [fetchDashboardData]);

  const setThisWeekFilter = useCallback(() => {
    setIsRefetching(true);
    const startOfWeek = dayjs().startOf('isoWeek');
    const endOfWeek = dayjs().endOf('isoWeek');
    const range = [startOfWeek, endOfWeek];
    setDateRange(range);
    setActiveFilter('week');
    fetchDashboardData(startOfWeek.format('YYYY-MM-DD'), endOfWeek.format('YYYY-MM-DD'), 'thisWeek');
  }, [fetchDashboardData]);

  const setThisMonthFilter = useCallback(() => {
    setIsRefetching(true);
    const startOfMonth = dayjs().startOf('month');
    const endOfMonth = dayjs().endOf('month');
    const range = [startOfMonth, endOfMonth];
    setDateRange(range);
    setActiveFilter('month');
    fetchDashboardData(startOfMonth.format('YYYY-MM-DD'), endOfMonth.format('YYYY-MM-DD'), 'thisMonth');
  }, [fetchDashboardData]);

  const setThisQuarterFilter = useCallback(() => {
    setIsRefetching(true);
    const currentQuarter = Math.floor(dayjs().month() / 3);
    const startOfQuarter = dayjs().startOf('year').add(currentQuarter * 3, 'months');
    const endOfQuarter = startOfQuarter.add(2, 'months').endOf('month');
    const range = [startOfQuarter, endOfQuarter];
    setDateRange(range);
    setActiveFilter('quarter');
    fetchDashboardData(startOfQuarter.format('YYYY-MM-DD'), endOfQuarter.format('YYYY-MM-DD'), 'thisQuarter');
  }, [fetchDashboardData]);

  const setThisYearFilter = useCallback(() => {
    setIsRefetching(true);
    const startOfYear = dayjs().startOf('year');
    const endOfYear = dayjs().endOf('year');
    const range = [startOfYear, endOfYear];
    setDateRange(range);
    setActiveFilter('year');
    fetchDashboardData(startOfYear.format('YYYY-MM-DD'), endOfYear.format('YYYY-MM-DD'), 'thisYear');
  }, [fetchDashboardData]);


  const getDueDateStatus = useCallback((dueDate) => {
    if (!dueDate) {
      return {
        color: 'default',
        label: 'No due date set',
        formatted: '—'
      };
    }

    const due = dayjs(dueDate);
    const now = dayjs();

    const formatted = due.format('MMM DD, YYYY');

    if (!due.isValid()) {
      return {
        color: 'default',
        label: 'Invalid due date',
        formatted: '—'
      };
    }

    const diffHours = due.diff(now, 'hour', true);

    if (diffHours < 0) {
      return {
        color: 'red',
        label: `Overdue ${due.fromNow()}`,
        formatted
      };
    }

    if (diffHours <= 24) {
      return {
        color: 'orange',
        label: `Due ${due.fromNow()}`,
        formatted
      };
    }

    if (diffHours <= 72) {
      return {
        color: 'green',
        label: `Due ${due.fromNow()}`,
        formatted
      };
    }

    return {
      color: 'green',
      label: `Due ${due.fromNow()}`,
      formatted
    };
  }, []);

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // Use filtered data if available, otherwise use overview data
  const displayData = useMemo(() => overview, [overview]);
  
  // Calculate pagination values (after displayData is defined)
  // For shops/pharmacies, use recent sales from shopData; otherwise use recentJobs
  const recentJobs = useMemo(() => {
    if (activeTenant?.businessType === 'shop' || activeTenant?.businessType === 'pharmacy') {
      // Transform sales data to match the expected format for the table
      const recentSales = displayData?.shopData?.recentSales || [];
      return recentSales
        .filter((sale) => sale && typeof sale === 'object' && sale.id)
        .map((sale) => {
          const cust = sale.customer;
          const custName =
            (cust && typeof cust === 'object' && (cust.name || cust.customerName)) ||
            sale.customerName ||
            null;
          return {
            id: sale.id,
            jobNumber: sale.saleNumber,
            title: formatAmount(sale.total),
            customer: custName ? { name: custName } : null,
            status: 'completed',
            createdAt: sale.createdAt,
            dueDate: null,
            paymentMethod: sale.paymentMethod,
          };
        });
    }
    return displayData?.recentJobs || [];
  }, [displayData, activeTenant?.businessType]);
  const filteredRecentJobs = useMemo(() => {
    const query = debouncedSearch.trim();
    if (!query) return recentJobs;

    return recentJobs.filter((job) => matchesSearchQuery(query, [
      job.title,
      job.jobNumber,
      job.customer?.name,
      job.customer?.customerName,
      job.customerName,
      job.paymentMethod,
    ]));
  }, [recentJobs, debouncedSearch]);
  const isDashboardSearchActive = debouncedSearch.trim().length > 0;
  const isFiltered = useMemo(() => Boolean(dateRange && dateRange[0] && dateRange[1]), [dateRange]);
  const periodLabel = useMemo(
    () => formatPeriodLabel(overviewParams.filterType || activeFilter, dateRange),
    [overviewParams.filterType, activeFilter, dateRange]
  );
  const thisMonthSummary = useMemo(() => displayData?.thisMonth || {}, [displayData]);
  const revenueValue = useMemo(() => Number(thisMonthSummary.revenue ?? 0), [thisMonthSummary.revenue]);
  const expenseValue = useMemo(() => Number(thisMonthSummary.expenses ?? 0), [thisMonthSummary.expenses]);
  const revenueTitle = useMemo(() => (isFiltered ? `${periodLabel} revenue` : "This Month's Revenue"), [isFiltered, periodLabel]);
  const expenseTitle = useMemo(() => (isFiltered ? `${periodLabel} expenses` : "This Month's Expenses"), [isFiltered, periodLabel]);
  const profitTitle = useMemo(() => (isFiltered ? `${periodLabel} profit` : "This Month's Profit"), [isFiltered, periodLabel]);
  const profitValue = useMemo(() => Number(thisMonthSummary.profit ?? (revenueValue - expenseValue)), [thisMonthSummary.profit, revenueValue, expenseValue]);
  const allTimeProfit = useMemo(() => Number(displayData?.allTime?.profit ?? ((displayData?.allTime?.revenue ?? 0) - (displayData?.allTime?.expenses ?? 0))), [displayData]);
  const thisMonthRange = useMemo(() => thisMonthSummary.range, [thisMonthSummary.range]);

  // Get business type from activeTenant (preferred) or overview response (fallback)
  const businessType = useMemo(() => activeTenant?.businessType || overview?.businessType || 'printing_press', [activeTenant?.businessType, overview?.businessType]);
  const coreBusinessType = useMemo(() => {
    if (businessType === 'shop' || businessType === 'pharmacy') return businessType;
    if (businessType && STUDIO_LIKE_TYPES.includes(businessType)) return businessType;
    const subType =
      activeTenant?.metadata?.businessSubType ||
      activeTenant?.metadata?.shopType;
    if (subType) return getCoreTypeForBusinessSubType(subType);
    return businessType;
  }, [businessType, activeTenant?.metadata?.businessSubType, activeTenant?.metadata?.shopType]);
  const isShop = useMemo(() => coreBusinessType === 'shop', [coreBusinessType]);
  const isPharmacy = useMemo(() => coreBusinessType === 'pharmacy', [coreBusinessType]);
  const isStudio = useMemo(() => STUDIO_LIKE_TYPES.includes(coreBusinessType), [coreBusinessType]);
  const isStaffShopOrPharmacy = useMemo(
    () => (isShop || isPharmacy) && tenantRole === 'staff',
    [isShop, isPharmacy, tenantRole]
  );
  const isStaff = tenantRole === 'staff';
  const canViewProfitMetrics = !isStaff;

  useEffect(() => {
    setPageSearchConfig({
      scope: 'dashboard',
      placeholder: isShop || isPharmacy ? SEARCH_PLACEHOLDERS.SALES : SEARCH_PLACEHOLDERS.JOBS,
    });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig, isShop, isPharmacy]);

  const handleClearDashboardSearch = useCallback(() => {
    setSearchValue('');
  }, [setSearchValue]);

  const {
    pendingOrderCount,
    latestOrder: latestOnlineOrder,
    showBanner: showOnlineOrderBanner,
  } = useOnlineStoreOrderAttention({
    enabled: scopeReady && isShop && isSabitoStoreEnabled(),
  });

  const { data: staffProductsRaw, isLoading: staffProductsLoading } = useQuery({
    queryKey: queryKeys.products.active(activeTenantId, activeShopId),
    queryFn: () => productService.getAllActiveProducts(),
    enabled: isPharmacy || (isShop && !!activeShopId),
    staleTime: QUERY_CACHE.STALE_TIME_VOLATILE,
    refetchOnWindowFocus: true,
  });
  const staffProducts = useMemo(
    () => (Array.isArray(staffProductsRaw) ? staffProductsRaw : (staffProductsRaw?.products ?? [])),
    [staffProductsRaw]
  );
  const hasProducts = useMemo(() => {
    if (staffProducts.length > 0) return true;
    const overviewCount = Number(displayData?.shopData?.productCount ?? displayData?.shopData?.totalInventoryItems ?? 0);
    if (overviewCount > 0) return true;
    if ((displayData?.shopData?.topProducts || []).length > 0) return true;
    return false;
  }, [staffProducts, displayData?.shopData?.productCount, displayData?.shopData?.totalInventoryItems, displayData?.shopData?.topProducts]);

  const organization = useMemo(() => organizationData?.data || {}, [organizationData]);
  
  // Check if tenant has a name (not default placeholder)
  const hasBusinessName = useMemo(() => {
    const name = activeTenant?.name;
    return !!(name && name.trim() && !isPlaceholderBusinessName(name));
  }, [activeTenant?.name]);

  const hasCompanyPhone = useMemo(() => {
    return !!(organization?.phone && String(organization.phone).trim());
  }, [organization?.phone]);

  const hasOrganizationEmail = useMemo(() => {
    return !!(organization?.email && String(organization.email).trim());
  }, [organization?.email]);

  const displayName = useScopedWorkspaceName(organization?.name);

  // Onboarding complete: metadata marker, or real workspace name + business contact (phone or org email).
  const onboardingCompleted = useMemo(() => {
    if (activeTenant?.metadata?.onboarding?.completedAt) {
      return true;
    }
    return hasBusinessName && (hasCompanyPhone || hasOrganizationEmail);
  }, [
    activeTenant?.metadata?.onboarding?.completedAt,
    hasBusinessName,
    hasCompanyPhone,
    hasOrganizationEmail,
  ]);
  
  const showSetupBanner = useMemo(() => {
    if (wasInvited) return false;
    if (suppressAppGuidance) return false;
    if (organizationSettingsPending) return false;
    return !onboardingCompleted;
  }, [wasInvited, suppressAppGuidance, organizationSettingsPending, onboardingCompleted]);
  const {
    dismissed: setupBannerDismissed,
    dismiss: dismissSetupBanner,
  } = useDismissibleDashboardBanner('setup-checklist', activeTenantId, showSetupBanner);
  const shouldShowSetupBanner = showSetupBanner && !setupBannerDismissed;

  // Welcome messages based on mode
  const welcomeMessages = useMemo(() => ({
    shop: "Welcome to ABS for Shops 👋",
    pharmacy: "Welcome to ABS for Pharmacies 👋",
    printing_press: "Welcome to ABS for Studios 👋"
  }), []);

  const welcomeMessage = useMemo(() => welcomeMessages[businessType] || welcomeMessages.printing_press, [welcomeMessages, businessType]);

  // Stock & expiry alerts (shop/pharmacy only)
  const stockAlerts = useMemo(() => displayData?.stockAlerts || null, [displayData?.stockAlerts]);
  const stockAlertsActiveCount = useMemo(() => {
    if (!stockAlerts) return 0;
    const low = (stockAlerts.lowStock || []).length;
    const exp = (stockAlerts.expiring || []).length;
    return low + exp;
  }, [stockAlerts]);
  const showStockAlerts = useMemo(() => (isShop || isPharmacy) && stockAlerts && stockAlertsActiveCount > 0, [isShop, isPharmacy, stockAlerts, stockAlertsActiveCount]);
  const dashboardAlertsActiveCount = stockAlertsActiveCount + (showOnlineOrderBanner ? pendingOrderCount : 0);
  const showDashboardAlerts = useMemo(
    () => showStockAlerts || showOnlineOrderBanner,
    [showOnlineOrderBanner, showStockAlerts]
  );

  const businessHealthContext = useMemo(() => {
    const periodDays = getInclusiveDays(overviewParams.startDate, overviewParams.endDate);
    const elapsedDays = getElapsedPeriodDays(overviewParams.startDate, overviewParams.endDate);
    const lowStockCount = (stockAlerts?.lowStock || []).length;
    const isRetail = isShop || isPharmacy;
    const metrics = {
      revenue: buildHealthMetric({
        current: revenueValue,
        comparisonMetric: comparisonData?.revenue,
        currentDays: elapsedDays,
        baselineDays: periodDays,
      }),
      expenses: buildHealthMetric({
        current: expenseValue,
        comparisonMetric: comparisonData?.expenses,
        currentDays: elapsedDays,
        baselineDays: periodDays,
        lowerIsBetter: true,
      }),
      profit: buildHealthMetric({
        current: profitValue,
        comparisonMetric: comparisonData?.profit,
        currentDays: elapsedDays,
        baselineDays: periodDays,
      }),
      newCustomers: buildHealthMetric({
        current: displayData?.summary?.newCustomers || 0,
        comparisonMetric: comparisonData?.newCustomers,
        currentDays: elapsedDays,
        baselineDays: periodDays,
      }),
    };
    const profitMargin = revenueValue > 0 ? (profitValue / revenueValue) * 100 : 0;

    return {
      periodLabel,
      comparisonLabel: comparisonData?.label || 'vs previous period',
      periodDays,
      elapsedDays,
      metrics,
      lowStockCount,
      stockAlertsActiveCount,
      isRetail,
      isProfitable: profitValue > 0,
      profitMargin,
      allTime: {
        revenue: toFiniteNumber(displayData?.allTime?.revenue),
        expenses: toFiniteNumber(displayData?.allTime?.expenses),
        profit: allTimeProfit,
      },
      totalCustomers: toFiniteNumber(displayData?.summary?.totalCustomers),
    };
  }, [
    overviewParams.startDate,
    overviewParams.endDate,
    stockAlerts?.lowStock,
    stockAlertsActiveCount,
    isShop,
    isPharmacy,
    revenueValue,
    expenseValue,
    profitValue,
    displayData?.summary?.newCustomers,
    displayData?.summary?.totalCustomers,
    displayData?.allTime?.revenue,
    displayData?.allTime?.expenses,
    allTimeProfit,
    comparisonData,
    periodLabel,
  ]);

  const fallbackDashboardInsight = useMemo(
    () => buildFallbackInsight({ businessHealthContext }),
    [businessHealthContext]
  );

  const staffDashboardInsight = useMemo(
    () => buildStaffDashboardInsight({ businessHealthContext }),
    [businessHealthContext]
  );

  const businessHealthOverrideInsight = useMemo(
    () => buildBusinessHealthOverrideInsight({ businessHealthContext }),
    [businessHealthContext]
  );

  const { data: aiDashboardInsight, isFetching: aiDashboardInsightLoading } = useQuery({
    queryKey: queryKeys.dashboard.aiInsight(activeTenantId, activeShopId, activeStudioLocationId, {
      startDate: overviewParams.startDate,
      endDate: overviewParams.endDate,
      filterType: overviewParams.filterType,
      revenueValue,
      expenseValue,
      profitValue,
      newCustomers: displayData?.summary?.newCustomers,
      lowStockCount: (stockAlerts?.lowStock || []).length,
      revenueChange: businessHealthContext.metrics.revenue.dailyAverageChangePercentage,
      expensesChange: businessHealthContext.metrics.expenses.dailyAverageChangePercentage,
      profitChange: businessHealthContext.metrics.profit.dailyAverageChangePercentage,
      newCustomersChange: businessHealthContext.metrics.newCustomers.dailyAverageChangePercentage,
      profitMargin: businessHealthContext.profitMargin,
      source: 'analysis_engine',
    }),
    queryFn: async () => {
      // Prefer owned analysis engine (performance_summary) — no Claude round-trip
      const result = await assistantService.askAnalysis('Summarize performance', {
        intent: 'performance_summary',
        pageContext: 'dashboard',
        startDate: overviewParams.startDate,
        endDate: overviewParams.endDate,
        periodLabel,
      });
      if (result?.insight?.title && result?.insight?.body) {
        return {
          title: String(result.insight.title).trim(),
          body: String(result.insight.body).trim(),
        };
      }
      return parseAiInsightResponse(result?.message || result?.answerMarkdown || '');
    },
    enabled: scopeReady && !!overview && canViewProfitMetrics,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const visibleDashboardInsight = canViewProfitMetrics
    ? businessHealthOverrideInsight || aiDashboardInsight || fallbackDashboardInsight
    : staffDashboardInsight;
  const dashboardInsightLoading = canViewProfitMetrics && !businessHealthOverrideInsight && aiDashboardInsightLoading;

  // Full-page skeletons only on initial load when we have no data yet
  if (loading && !overview) {
    return (
      <div className="space-y-4 md:space-y-6" role="status" aria-live="polite" aria-label="Loading dashboard">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <TableSkeleton rows={5} cols={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (overviewError && !overview && subscriptionLocked) {
    const errorData = overviewQueryError?.response?.data || {};
    const checkoutUrl = errorData.checkoutUrl || '/checkout';
    const showPricingUi = isPricingUiEnabled();
    const lockMessage =
      errorData.message ||
      (showPricingUi
        ? 'Your subscription needs attention before this workspace can load dashboard data.'
        : 'This workspace needs attention before dashboard data can load. Contact support for help.');

    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Wallet className="h-12 w-12 text-primary mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {showPricingUi ? 'Renew your subscription' : 'Access restricted'}
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            {lockMessage}
          </p>
          {showPricingUi ? (
            <Button
              onClick={() => {
                if (/^https?:\/\//i.test(checkoutUrl)) {
                  window.location.assign(checkoutUrl);
                  return;
                }
                navigate(checkoutUrl);
              }}
              className="bg-brand hover:bg-brand-dark text-white"
            >
              Go to billing
            </Button>
          ) : (
            <Button asChild className="bg-brand hover:bg-brand-dark text-white">
              <a href="mailto:support@africanbusinesssuite.com">Contact support</a>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (overviewError && !overview && expectedDashboardAccessError) {
    const message =
      getApiMessage(overviewQueryError) ||
      'You do not have permission to view this dashboard. Contact your workspace administrator.';

    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Dashboard access unavailable</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {message}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Actual failure (request failed) - show error state with retry, not empty dashboard
  if (overviewError && !overview) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Couldn&apos;t load dashboard</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Something went wrong loading your dashboard. This is different from having no data yet — you can try again.
          </p>
          <Button
            onClick={() => refetchOverview()}
            className="bg-brand hover:bg-brand-dark text-white"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div {...containerProps} style={{ position: 'relative' }}>
      {/* Pull-to-refresh indicator */}
      {isMobile && pullDistance > 0 && (
        <div 
          className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 transition-opacity"
          style={{
            height: `${Math.min(pullDistance, 80)}px`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          {isRefreshing ? (
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          ) : (
            <RefreshCw className="h-6 w-6 text-brand" />
          )}
        </div>
      )}
      
      {/* Unified Dashboard for all business types */}
      <>
      {/* Setup Checklist Banner */}
      {shouldShowSetupBanner && (
        <div
          data-setup-banner
          className="mb-6 rounded-lg border border-gray-200 p-4 sm:p-6"
          style={{ backgroundColor: '#060A00' }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#a3e635]">
              <Sparkles className="h-5 w-5 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-white mb-1">
                Finish setting up your business
              </h3>
              <p className="text-sm sm:text-base text-gray-300">
                Complete your business profile to get the most out of African Business Suite.
              </p>
            </div>
            <div className="flex w-full sm:w-auto items-center gap-2 mt-2 sm:mt-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-white hover:bg-white/10 hover:text-white"
                aria-label="Hide setup banner on dashboard"
                onClick={dismissSetupBanner}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => navigate('/onboarding')}
                className="flex-1 sm:flex-none shrink-0 text-foreground"
                style={{
                  backgroundColor: '#a3e635',
                  borderColor: '#a3e635',
                  color: '#000000',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#84cc16';
                  e.currentTarget.style.borderColor = '#84cc16';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#a3e635';
                  e.currentTarget.style.borderColor = '#a3e635';
                  e.currentTarget.style.color = '#000000';
                }}
              >
                Complete Setup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main dashboard content: greeting, filters, stats cards, recent activity */}
      <div className="space-y-4 md:space-y-6" data-tour="dashboard-main">
      {/* Greeting Section */}
      <WelcomeSection
        welcomeMessage={welcomeMessage}
        subText={`Here is the summary of what is happening presently at ${displayName}.`}
      />

      {/* Date Filter Buttons */}
      <DateFilterButtons
        activeFilter={activeFilter}
        onTodayClick={setTodayFilter}
        onWeekClick={setThisWeekFilter}
        onMonthClick={setThisMonthFilter}
        onYearClick={setThisYearFilter}
        onDateRangeChange={handleDateRangeChange}
        dateRange={dateRange}
        onAddClick={() => navigate(isShop || isPharmacy ? '/sales?openPOS=1' : '/jobs', { state: { openModal: true } })}
        addButtonLabel={isShop || isPharmacy ? 'New sale' : 'New job'}
      />

      {/* Non-blocking refetch indicator */}
      {isRefetching && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          <span>Updating...</span>
        </div>
      )}

      {/* KPI Cards */}
      <DashboardStatsCards
        revenueValue={revenueValue}
        expenseValue={expenseValue}
        profitValue={profitValue}
        newCustomers={displayData?.summary?.newCustomers || 0}
        isShop={isShop}
        isPharmacy={isPharmacy}
        comparisonData={comparisonData}
        comparisonLoading={comparisonLoading}
        activeFilter={activeFilter}
        loading={overviewLoading}
        showProfitCard={canViewProfitMetrics}
      />

      {canViewProfitMetrics && (
        <Card className="border border-gray-200 bg-green-50/70">
          <CardContent className="py-1 px-3 sm:px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand">
                <Sparkles className="h-5 w-5 text-white" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-brand mb-1">AI Insight</p>
                <h3 className="text-base font-semibold text-foreground">
                  {dashboardInsightLoading ? 'AI is reviewing your numbers' : visibleDashboardInsight.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dashboardInsightLoading
                    ? 'Generating a quick business insight from your latest dashboard data.'
                    : visibleDashboardInsight.body}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 bg-white"
                onClick={() =>
                  navigate(buildAskAiUrl({
                    from: 'dashboard',
                    prompt: 'Explain my dashboard insight and what I should do next.',
                    startDate: overviewParams.startDate,
                    endDate: overviewParams.endDate,
                    periodLabel,
                  }))
                }
              >
                {IBIS_ASK_LABEL}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showOnlineOrderBanner && (
        <OnlineStoreOrderBanner
          pendingOrderCount={pendingOrderCount}
          latestOrder={latestOnlineOrder}
        />
      )}

      {isShop && (displayData?.shopData?.shopBreakdown?.length ?? 0) > 0 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">
              Revenue by shop ({isFiltered ? periodLabel : 'this month'})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {displayData.shopData.shopBreakdown.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 text-sm border-b border-border/60 pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-medium truncate">{row.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    ₵ {Number(row.monthRevenue || 0).toFixed(2)}
                    {row.monthSalesCount != null ? ` · ${row.monthSalesCount} sales` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Alerts (shop/pharmacy stock plus online store orders) */}
      {showDashboardAlerts && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
              Alerts
            </CardTitle>
            <Badge variant="secondary" className="shrink-0">
              {dashboardAlertsActiveCount} active
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {showOnlineOrderBanner && (
                <li className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground font-medium truncate">
                    Sabito Store
                  </span>
                  <span className="text-emerald-700 shrink-0">
                    {pendingOrderCount === 1 ? '1 order needs attention' : `${pendingOrderCount} orders need attention`}
                  </span>
                </li>
              )}
              {(stockAlerts?.lowStock || [])
                .filter((item) => item && typeof item === 'object')
                .map((item, idx) => (
                <li key={`low-${item.id ?? idx}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground font-medium truncate">
                    {item.name ?? item.sku ?? 'Product'}
                  </span>
                  <span className="text-amber-700 shrink-0">Low stock ({Number(item.quantityOnHand)} left)</span>
                </li>
              ))}
              {(stockAlerts?.expiring || [])
                .filter((item) => item && typeof item === 'object')
                .map((item, idx) => (
                <li key={`exp-${item.id ?? idx}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground font-medium truncate">
                    {item.name ?? item.sku ?? 'Product'}
                  </span>
                  <span className="text-amber-700 shrink-0">
                    Expires in {item.daysUntilExpiry === 0 ? 'today' : item.daysUntilExpiry === 1 ? '1 day' : `${item.daysUntilExpiry} days`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2 sm:flex sm:justify-end">
              {showStockAlerts && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => navigate('/products')}
                >
                  View products
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {showOnlineOrderBanner && (
                <Button
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => navigate('/store/orders')}
                >
                  View online orders
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isStaffShopOrPharmacy ? (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick sale – tap a product to sell</h2>
          {staffProductsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="border border-gray-200">
                  <CardContent className="pt-6">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-6 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !staffProducts || staffProducts.length === 0 ? (
            <Card className="border border-gray-200">
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600">No products to sell</p>
                <p className="text-sm text-gray-500 mt-1">Add products in Products, or go to POS to search and scan.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {staffProducts.filter((p) => p && typeof p === 'object' && p.id).map((product) => {
                const quantityOnHand = Number(product.quantityOnHand);
                const isOutOfStock = product.trackStock !== false && Number.isFinite(quantityOnHand) && quantityOnHand <= 0;

                return (
                  <Card
                    key={product.id}
                    className={cn(
                      'border border-gray-200 transition-colors',
                      isOutOfStock
                        ? 'bg-muted opacity-60 cursor-not-allowed'
                        : 'cursor-pointer hover:border-green-500 hover:bg-green-50'
                    )}
                    onClick={() => {
                      if (isOutOfStock) return;
                      navigate('/pos', { state: { addProductId: product.id } });
                    }}
                  >
                    <CardContent className="p-4 flex flex-col items-center justify-center min-h-[100px]">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-2">
                        <Package className="h-5 w-5 text-gray-500" />
                      </div>
                      <p className={cn(
                        'font-medium text-center line-clamp-2 text-sm',
                        isOutOfStock ? 'text-muted-foreground' : 'text-foreground'
                      )}>
                        {product.name ?? product.sku ?? 'Product'}
                      </p>
                      <p className={cn(
                        'font-semibold text-sm mt-1',
                        isOutOfStock ? 'text-muted-foreground' : 'text-green-700'
                      )}>
                        {CURRENCY.SYMBOL} {Number(product.sellingPrice ?? 0).toFixed(CURRENCY.DECIMAL_PLACES)}
                      </p>
                      {isOutOfStock && (
                        <Badge variant="secondary" className="mt-2 text-xs">
                          Out of stock
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="mt-8">
        <div className="min-w-0" data-tour="recent-activity">
          <DashboardJobsTable
            key={debouncedSearch || 'all'}
            jobs={filteredRecentJobs}
            loading={loading}
            title={isShop || isPharmacy ? "Recent Sales" : "Jobs In Progress"}
            getDueDateStatus={getDueDateStatus}
            pageSize={jobsPagination.pageSize}
            isSalesTable={isShop || isPharmacy}
            hasProducts={hasProducts}
            productsLoading={staffProductsLoading}
            onAddProduct={(isShop || isPharmacy) ? () => navigate('/products?add=1') : undefined}
            onOpenPOS={(isShop || isPharmacy) ? () => navigate('/pos') : undefined}
            isSearchFiltered={isDashboardSearchActive && filteredRecentJobs.length === 0}
            searchQuery={debouncedSearch}
            onClearSearch={handleClearDashboardSearch}
          />
        </div>
      </div>
      )}
      </div>
      </>
    </div>
  );
};

export default Dashboard;


