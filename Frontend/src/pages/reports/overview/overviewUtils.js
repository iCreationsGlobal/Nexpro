import dayjs from 'dayjs';
import { REPORT_CHART_COLORS } from '../reportConstants';
import { formatAmount } from '../../../utils/formatNumber';

export const OVERVIEW_CARD_BORDER = { border: '1px solid #e5e7eb', borderRadius: '8px' };

/**
 * Format currency for overview displays.
 * @param {number} value
 * @param {{ compact?: boolean }} options
 * @returns {string}
 */
export function formatOverviewCurrency(value, options = {}) {
  const num = Number(value) || 0;
  if (options.compact && Math.abs(num) >= 1000) {
    return `₵ ${(num / 1000).toFixed(2)}K`;
  }
  return formatAmount(num);
}

/**
 * Format percentage change for KPI badges.
 * @param {number} change
 * @returns {string}
 */
export function formatPercentChange(change) {
  const num = Number(change) || 0;
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(1)}%`;
}

/**
 * Build aligned revenue vs expenses trend series.
 * @param {Object} revenue
 * @param {Object} expenses
 * @returns {Array<{ period: string, revenue: number, expenses: number }>}
 */
export function buildRevenueExpenseTrend(revenue, expenses) {
  const revenueMap = new Map();
  (revenue?.byPeriod || []).forEach((item) => {
    const key = item.date || item.period || (item.hour ?? item.week ?? item.month);
    const label = item.date
      ? dayjs(item.date).format('MMM D')
      : item.hour !== undefined
        ? `${String(item.hour).padStart(2, '0')}:00`
        : item.week !== undefined
          ? `W${item.week}`
          : item.month !== undefined
            ? dayjs().month(item.month - 1).format('MMM')
            : String(key || '');
    revenueMap.set(String(key ?? label), {
      label,
      revenue: parseFloat(item.totalRevenue || 0)
    });
  });

  const expenseMap = new Map();
  (expenses?.byDate || []).forEach((item) => {
    const key = item.date;
    const label = dayjs(key).format('MMM D');
    expenseMap.set(String(key), {
      label,
      expenses: parseFloat(item.totalAmount || 0)
    });
  });

  const allKeys = new Set([...revenueMap.keys(), ...expenseMap.keys()]);
  if (allKeys.size === 0) return [];

  return Array.from(allKeys)
    .sort((a, b) => {
      const da = dayjs(a);
      const db = dayjs(b);
      if (da.isValid() && db.isValid()) return da.valueOf() - db.valueOf();
      return String(a).localeCompare(String(b));
    })
    .map((key) => {
      const rev = revenueMap.get(key);
      const exp = expenseMap.get(key);
      return {
        period: rev?.label || exp?.label || key,
        revenue: rev?.revenue || 0,
        expenses: exp?.expenses || 0
      };
    });
}

/**
 * Build revenue-by-category slices for donut chart.
 * @param {Object} params
 * @returns {Array<{ name: string, value: number, color: string }>}
 */
export function buildRevenueByCategory({
  totalRevenue,
  serviceAnalytics,
  productSales,
  isShop,
  isPharmacy,
  isStudio = false,
  isRental = false,
  rentalOverview = null
}) {
  const slices = [];
  let allocated = 0;

  if (isRental) {
    const hireProducts = rentalOverview?.revenue?.byProduct || [];
    hireProducts.forEach((row) => {
      const value = parseFloat(row.revenue || 0);
      if (value > 0) {
        slices.push({ name: row.productName || 'Hire', value });
        allocated += value;
      }
    });
    const remainder = Math.max(0, (totalRevenue || 0) - allocated);
    if (remainder > 0) {
      slices.push({ name: 'Invoice collections', value: remainder });
    }
    if (slices.length === 0 && totalRevenue > 0) {
      slices.push({ name: 'Collections', value: totalRevenue });
    }
    return slices.map((slice, index) => ({
      ...slice,
      color: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length]
    }));
  }

  if ((isShop || isPharmacy) && (productSales?.products || []).length > 0) {
    const productRevenue = (productSales.products || []).reduce(
      (sum, p) => sum + parseFloat(p.revenue || 0),
      0
    );
    if (productRevenue > 0) {
      slices.push({ name: isPharmacy ? 'Drugs & Products' : 'Products', value: productRevenue });
      allocated += productRevenue;
    }
  }

  const serviceCategories = serviceAnalytics?.byCategory || [];
  if (serviceCategories.length > 0) {
    serviceCategories.forEach((category) => {
      const value = parseFloat(category.totalRevenue ?? category.totalSales ?? category.revenue ?? 0);
      if (value > 0) {
        slices.push({
          name: category.category || category.jobType || (isStudio ? 'Jobs & Services' : 'Services'),
          value
        });
        allocated += value;
      }
    });
  }

  const remainder = Math.max(0, (totalRevenue || 0) - allocated);
  if (remainder > 0) {
    slices.push({ name: 'Other Income', value: remainder });
  }

  if (slices.length === 0 && totalRevenue > 0) {
    slices.push({ name: 'Revenue', value: totalRevenue });
  }

  return slices.map((slice, index) => ({
    ...slice,
    color: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length]
  }));
}

/**
 * Build sparkline data from expense byDate or revenue byPeriod.
 * @param {Array} series
 * @param {string} valueKey
 * @returns {number[]}
 */
export function buildSparklineSeries(series, valueKey = 'value') {
  if (!Array.isArray(series) || series.length === 0) return [0];
  return series.map((item) => parseFloat(item[valueKey] || item.totalRevenue || item.totalAmount || 0));
}

/**
 * Build profit sparkline from revenue and expense daily data.
 * @param {Array} trend
 * @returns {number[]}
 */
export function buildProfitSparkline(trend) {
  if (!trend?.length) return [0];
  return trend.map((d) => (d.revenue || 0) - (d.expenses || 0));
}

/**
 * Derive business health status from overview metrics.
 * @param {Object} params
 * @returns {{ status: 'good'|'warning'|'critical', message: string }}
 */
export function deriveBusinessHealth({
  netProfitMargin,
  collectionRate,
  outstanding,
  totalRevenue,
  revenueChange
}) {
  const overdueRatio = totalRevenue > 0
    ? (parseFloat(outstanding?.totalOutstanding || 0) / totalRevenue) * 100
    : 0;

  if (netProfitMargin < 0 || overdueRatio > 50) {
    return {
      status: 'critical',
      message: 'Your business needs attention — review expenses, collections, and outstanding invoices.'
    };
  }

  if (netProfitMargin < 10 || collectionRate < 80 || revenueChange < -10 || overdueRatio > 25) {
    return {
      status: 'warning',
      message: 'Some metrics need monitoring — focus on profitability and receivables this period.'
    };
  }

  return {
    status: 'good',
    message: 'Your business is performing well. Revenue, profitability, and collections look healthy for this period.'
  };
}

/**
 * Sort outstanding invoices by days overdue.
 * @param {Array} invoices
 * @param {number} limit
 * @returns {Array}
 */
export function getOverdueInvoices(invoices, limit = 5) {
  const today = dayjs().startOf('day');
  return (invoices || [])
    .map((inv) => {
      const due = inv.dueDate ? dayjs(inv.dueDate).startOf('day') : null;
      const daysOverdue = due && due.isBefore(today) ? today.diff(due, 'day') : 0;
      return {
        id: inv.id,
        customerName: inv.customer?.company || inv.customer?.name || 'Unknown',
        amount: parseFloat(inv.balance || 0),
        daysOverdue,
        dueDate: inv.dueDate
      };
    })
    .filter((inv) => inv.amount > 0 && inv.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, limit);
}
