import { useState, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useResponsive } from '../hooks/useResponsive';
import { useDeviceMode } from '../hooks/useDeviceMode';
import { usePagedList } from '../hooks/usePagedList';
import { useCurrency } from '../hooks/useCurrency';
// Removed Ant Design imports - using shadcn/ui only
import { Plus, RefreshCw, Loader2, Currency, Calendar, Users, FileText } from 'lucide-react';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import payrollService from '../services/payrollService';
import employeeService from '../services/employeeService';
import { showSuccess, showError } from '../utils/toast';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';

const payrollRunSchema = z.object({
  periodStart: z.date({ required_error: 'Period start is required' }),
  periodEnd: z.date({ required_error: 'Period end is required' }),
  payDate: z.date({ required_error: 'Pay date is required' }),
  employeeIds: z.array(z.string()).min(1, 'Select at least one employee'),
});
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DashboardTable from '../components/DashboardTable';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import DetailsDrawer from '../components/DetailsDrawer';
import MobileFormDialog from '../components/MobileFormDialog';
import DrawerSectionCard from '../components/DrawerSectionCard';
import ActionColumn from '../components/ActionColumn';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

/** Payroll runs in one list response (`{ data, count }`). */
const payrollRunRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

const Payroll = () => {
  const { formatAmount } = useCurrency();
  const queryClient = useQueryClient();
  const { isMobile } = useResponsive();
  const { isAppShell } = useDeviceMode();
  const [runModalVisible, setRunModalVisible] = useState(false);
  const [refreshingPayroll, setRefreshingPayroll] = useState(false);
  const [viewingRun, setViewingRun] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [entriesPagination, setEntriesPagination] = useState({
    current: 1,
    pageSize: 20,
  });

  const form = useForm({
    resolver: zodResolver(payrollRunSchema),
    defaultValues: {
      periodStart: dayjs().startOf('month').toDate(),
      periodEnd: dayjs().endOf('month').toDate(),
      payDate: dayjs().endOf('month').toDate(),
      employeeIds: [],
    },
  });

  // Desktop: one request with the server's default page, paged in the table below, as before.
  const runsQuery = useQuery({
    queryKey: ['payrollRuns'],
    queryFn: () => payrollService.getRuns(),
    enabled: !isAppShell,
  });

  // Phones and tablets: every payroll run, loaded as you scroll.
  const shellRuns = usePagedList({
    queryKey: (params) => ['payrollRuns', params],
    fetchPage: (params) => payrollService.getRuns(params),
    getRows: payrollRunRowsFromResponse,
    getTotal: (response) => response?.count,
    enabled: isAppShell,
  });

  const employeesQuery = useQuery({
    queryKey: ['employees', 'payroll'],
    queryFn: () => employeeService.getEmployees({ status: 'active', limit: 1000 })
  });

  const createRunMutation = useMutation({
    mutationFn: payrollService.createRun,
    onSuccess: () => {
      showSuccess('Payroll run created');
      queryClient.invalidateQueries({ queryKey: ['payrollRuns'] });
      setRunModalVisible(false);
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to create payroll run');
    }
  });

  const postRunMutation = useMutation({
    mutationFn: (id) => payrollService.postRun(id),
    onSuccess: (response) => {
      const run = response.data || response;
      showSuccess('Payroll run posted');
      queryClient.invalidateQueries({ queryKey: ['payrollRuns'] });
      setViewingRun(run);
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to post payroll run');
    }
  });

  const runs = isAppShell ? shellRuns.rows : (runsQuery.data?.data || []);
  // The stats cards cover the first page in both layouts (desktop only asks for that page).
  const runsForStats = useMemo(
    () => (isAppShell ? payrollRunRowsFromResponse(shellRuns.response) : runs),
    [isAppShell, shellRuns.response, runs],
  );
  const employees = employeesQuery.data?.data || [];

  const handleViewRun = useCallback((record) => {
    setViewingRun(record);
    setDrawerVisible(true);
    payrollService.getRun(record.id)
      .then((response) => {
        const data = response?.data || response;
        setViewingRun((prev) => (prev?.id === record.id ? data : prev));
      })
      .catch(() => showError(null, 'Failed to load payroll run'));
  }, []);

  const handlePostRun = useCallback((id) => {
    postRunMutation.mutate(id);
  }, [postRunMutation]);

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'period',
      label: 'Period',
      render: (_, record) => <span className="text-foreground">{`${dayjs(record?.periodStart).format('MMM DD')} - ${dayjs(record?.periodEnd).format('MMM DD, YYYY')}`}</span>
    },
    {
      key: 'payDate',
      label: 'Pay Date',
      render: (_, record) => <span className="text-foreground">{record?.payDate ? dayjs(record.payDate).format('MMM DD, YYYY') : '—'}</span>
    },
    {
      key: 'totalEmployees',
      label: 'Employees',
      render: (_, record) => <span className="text-foreground">{record?.totalEmployees || 0}</span>
    },
    {
      key: 'totalGross',
      label: 'Gross',
      render: (_, record) => <span className="text-foreground font-medium">{formatAmount(record?.totalGross)}</span>
    },
    {
      key: 'totalNet',
      label: 'Net',
      render: (_, record) => <span className="text-foreground font-medium">{formatAmount(record?.totalNet)}</span>
    },
    {
      key: 'status',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => <StatusChip status={record?.status} />
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          record={record}
          onView={handleViewRun}
        />
      )
    }
  ], [handleViewRun]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalRuns = runsForStats.length;
    const thisMonth = runsForStats.filter(run => {
      const runDate = dayjs(run.payDate);
      return runDate.month() === dayjs().month() && runDate.year() === dayjs().year();
    }).length;
    const employeesPaid = runsForStats.reduce((sum, run) => sum + (run.totalEmployees || 0), 0);
    const totalAmount = runsForStats.reduce((sum, run) => sum + parseFloat(run.totalNet || 0), 0);
    
    return {
      totals: {
        totalRuns,
        thisMonth,
        employeesPaid,
        totalAmount
      }
    };
  }, [runsForStats]);

  const handleOpenRunModal = async () => {
    await employeesQuery.refetch();
    const list = employeesQuery.data?.data || [];
    const ids = list.map((emp) => String(emp.id));
    form.reset({
      periodStart: dayjs().startOf('month').toDate(),
      periodEnd: dayjs().endOf('month').toDate(),
      payDate: dayjs().endOf('month').toDate(),
      employeeIds: ids,
    });
    setRunModalVisible(true);
  };

  const onSubmitRun = (values) => {
    const payload = {
      periodStart: dayjs(values.periodStart).format('YYYY-MM-DD'),
      periodEnd: dayjs(values.periodEnd).format('YYYY-MM-DD'),
      payDate: dayjs(values.payDate).format('YYYY-MM-DD'),
      employeeIds: (values.employeeIds || []).map((id) => String(id)),
    };
    createRunMutation.mutate(payload);
  };

  // Helper function to render table from columns and dataSource
  const renderTable = (columns, dataSource, rowKey = 'id', options = {}) => {
    const { pagination: tablePagination, summary, onPaginationChange } = options;
    const pageSize = tablePagination?.pageSize || pagination.pageSize;
    const current = tablePagination?.current || pagination.current;
    const total = tablePagination?.total || dataSource?.length || 0;
    const setPaginationFn = onPaginationChange || setPagination;
    
    const startIndex = (current - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = dataSource?.slice(startIndex, endIndex) || [];

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead 
                  key={col.key || col.dataIndex} 
                  style={{ width: col.width, textAlign: col.align }}
                  className={col.fixed === 'left' ? 'sticky left-0 bg-background z-10' : ''}
                >
                  {col.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  No data available
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((record) => (
                <TableRow key={record[rowKey]}>
                  {columns.map((col) => {
                    const value = col.dataIndex 
                      ? (Array.isArray(col.dataIndex) 
                          ? col.dataIndex.reduce((obj, key) => obj?.[key], record)
                          : record[col.dataIndex])
                      : null;
                    const renderedValue = col.render ? col.render(value, record) : value;
                    return (
                      <TableCell 
                        key={col.key || col.dataIndex}
                        style={{ textAlign: col.align }}
                        className={col.fixed === 'left' ? 'sticky left-0 bg-background z-10' : col.fixed === 'right' ? 'sticky right-0 bg-background z-10' : ''}
                      >
                        {renderedValue}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
          {summary && (
            <TableFooter>
              <TableRow>
                {summary(paginatedData)}
              </TableRow>
            </TableFooter>
          )}
        </Table>
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(endIndex, total)} of {total} entries
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaginationFn(prev => ({ ...prev, current: prev.current - 1 }))}
                disabled={current === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaginationFn(prev => ({ ...prev, current: prev.current + 1 }))}
                disabled={current >= Math.ceil(total / pageSize)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Paginate runs (phones and tablets show every loaded run instead)
  const paginatedRuns = useMemo(() => {
    if (isAppShell) return runs;
    const start = (pagination.current - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return runs.slice(start, end);
  }, [isAppShell, runs, pagination.current, pagination.pageSize]);

  // Drawer tabs for payroll run details
  const drawerTabs = useMemo(() => {
    if (!viewingRun) return [];

    return [
      {
        key: 'overview',
        label: 'Overview',
        content: (
          <DrawerSectionCard title="Run overview">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Period">
                {dayjs(viewingRun.periodStart).format('MMM DD, YYYY')} - {dayjs(viewingRun.periodEnd).format('MMM DD, YYYY')}
              </DescriptionItem>
              <DescriptionItem label="Pay Date">{dayjs(viewingRun.payDate).format('MMM DD, YYYY')}</DescriptionItem>
              <DescriptionItem label="Status">
                <StatusChip status={viewingRun.status} />
              </DescriptionItem>
              <DescriptionItem label="Total Employees">{viewingRun.totalEmployees}</DescriptionItem>
              <DescriptionItem label="Total Gross">
                <strong className="text-base">{formatAmount(viewingRun.totalGross)}</strong>
              </DescriptionItem>
              <DescriptionItem label="Total Tax">
                {formatAmount(viewingRun.totalTax)}
              </DescriptionItem>
              <DescriptionItem label="Total Net">
                <strong className="text-base text-green-600">{formatAmount(viewingRun.totalNet)}</strong>
              </DescriptionItem>
              {viewingRun.notes && (
                <DescriptionItem label="Notes">{viewingRun.notes}</DescriptionItem>
              )}
            </Descriptions>
          </DrawerSectionCard>
        )
      },
      {
        key: 'entries',
        label: 'Employee Entries',
        content: (
          <DrawerSectionCard title="Employee entries">
            {renderTable([
              {
                title: 'Employee',
                key: 'employee',
                fixed: 'left',
                width: 200,
                render: (_, entry) => (
                  <div>
                    <strong>{entry.employee?.firstName} {entry.employee?.lastName}</strong>
                    <br />
                    <span className="text-muted-foreground text-xs">
                      {entry.employee?.jobTitle || '—'} • {entry.employee?.department || '—'}
                    </span>
                  </div>
                )
              },
              {
                title: 'Gross Pay',
                dataIndex: 'grossPay',
                key: 'gross',
                align: 'right',
                width: 120,
                render: (value) => <strong>{formatAmount(value)}</strong>
              },
              {
                title: 'Allowances',
                key: 'allowances',
                align: 'right',
                width: 150,
                render: (_, entry) => {
                  const totalAllowances = (entry.allowances || []).reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
                  return totalAllowances > 0 ? (
                    <span className="text-green-600">+ {formatAmount(totalAllowances)}</span>
                  ) : (
                    <span className="text-muted-foreground">{formatAmount(0)}</span>
                  );
                }
              },
              {
                title: 'Deductions',
                key: 'deductions',
                align: 'right',
                width: 150,
                render: (_, entry) => {
                  const totalDeductions = (entry.deductions || []).reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
                  return totalDeductions > 0 ? (
                    <span className="text-red-600">-{formatAmount(totalDeductions)}</span>
                  ) : (
                    <span className="text-muted-foreground">{formatAmount(0)}</span>
                  );
                }
              },
              {
                title: 'Taxes',
                key: 'taxes',
                align: 'right',
                width: 150,
                render: (_, entry) => {
                  const totalTaxes = (entry.taxes || []).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                  return totalTaxes > 0 ? (
                    <span className="text-orange-600">{formatAmount(totalTaxes)}</span>
                  ) : (
                    <span className="text-muted-foreground">{formatAmount(0)}</span>
                  );
                }
              },
              {
                title: 'Net Pay',
                dataIndex: 'netPay',
                key: 'net',
                align: 'right',
                width: 120,
                fixed: 'right',
                render: (value) => (
                  <strong className="text-base text-green-600">
                    {formatAmount(value)}
                  </strong>
                )
              }
            ], viewingRun.entries || [], 'id', {
              pagination: {
                current: entriesPagination.current,
                pageSize: entriesPagination.pageSize,
                total: (viewingRun.entries || []).length,
              },
              onPaginationChange: setEntriesPagination,
              summary: (pageData) => {
                const totalGross = pageData.reduce((sum, entry) => sum + parseFloat(entry.grossPay || 0), 0);
                const totalNet = pageData.reduce((sum, entry) => sum + parseFloat(entry.netPay || 0), 0);
                const totalTaxes = pageData.reduce((sum, entry) => {
                  return sum + (entry.taxes || []).reduce((taxSum, t) => taxSum + parseFloat(t.amount || 0), 0);
                }, 0);
                
                return (
                  <>
                    <TableCell colSpan={1}>
                      <strong>Total ({pageData.length} employees)</strong>
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <strong>{formatAmount(totalGross)}</strong>
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <strong className="text-orange-600">{formatAmount(totalTaxes)}</strong>
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <strong className="text-base text-green-600">
                        {formatAmount(totalNet)}
                      </strong>
                    </TableCell>
                  </>
                );
              }
            })}
          </DrawerSectionCard>
        )
      }
    ];
  }, [viewingRun, entriesPagination]);

  const payrollEmptyState = useMemo(() => getEmptyStateProps(EMPTY_STATES.PAYROLL), []);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Payroll"
          subText="Generate payroll runs, review summaries, and post to the ledger."
        />
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                onClick={async () => {
                  setRefreshingPayroll(true);
                  await queryClient.invalidateQueries({ queryKey: ['payrollRuns'] });
                  setRefreshingPayroll(false);
                }}
                disabled={refreshingPayroll}
                size={isMobile ? "icon" : "default"}
              >
                {refreshingPayroll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh payroll runs</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleOpenRunModal}
                disabled={employeesQuery.isLoading}
              >
                {employeesQuery.isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Generate Payroll Run
              </Button>
            </TooltipTrigger>
            <TooltipContent>Generate a new payroll run</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardStatsCard
          tooltip="Total payroll runs generated"
          title="Total Runs"
          value={summaryStats?.totals?.totalRuns || 0}
          icon={FileText}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          tooltip="Payroll runs this month"
          title="This Month"
          value={summaryStats?.totals?.thisMonth || 0}
          icon={Calendar}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#3b82f6"
        />
        <DashboardStatsCard
          tooltip="Total employees paid across all runs"
          title="Employees Paid"
          value={summaryStats?.totals?.employeesPaid || 0}
          icon={Users}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
        <DashboardStatsCard
          tooltip="Total payroll amount paid"
          title="Total Amount"
          value={summaryStats?.totals?.totalAmount || 0}
          icon={Currency}
          iconBgColor="rgba(249, 115, 22, 0.1)"
          iconColor="#f97316"
        />
      </div>

      {/* Main Content Area */}
      <DashboardTable
        data={paginatedRuns}
        columns={tableColumns}
        loading={isAppShell ? shellRuns.isLoading : runsQuery.isLoading}
        title={null}
        emptyState={payrollEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination(newPagination);
        }}
        externalPagination={{
          current: pagination.current,
          total: runs.length
        }}
        infinite={shellRuns.infinite}
      />

      <MobileFormDialog
        open={runModalVisible}
        onOpenChange={(open) => {
          if (!open) setRunModalVisible(false);
        }}
        title="Generate Payroll Run"
        description="Create a new payroll run for selected employees"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRunModalVisible(false)}>
              Cancel
            </Button>
            <Button form="payroll-run-form" type="submit" loading={createRunMutation.isLoading}>
              Generate Payroll Run
            </Button>
          </>
        }
      >
          <Form {...form}>
            <form id="payroll-run-form" onSubmit={form.handleSubmit(onSubmitRun)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="periodStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period Start</FormLabel>
                      <FormControl>
                        <DatePicker
                          date={field.value}
                          onDateChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="periodEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period End</FormLabel>
                      <FormControl>
                        <DatePicker
                          date={field.value}
                          onDateChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="payDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pay Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        date={field.value}
                          onDateChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employeeIds"
                render={({ field }) => {
                  const selectedIds = (field.value || []).map((id) => String(id));
                  return (
                    <FormItem>
                      <FormLabel>Employees</FormLabel>
                      <FormControl>
                        <div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium">
                              Select employees ({selectedIds.length} selected)
                            </Label>
                            {employees.length > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => field.onChange(employees.map((e) => String(e.id)))}
                              >
                                Select All
                              </Button>
                            )}
                          </div>
                          {employeesQuery.isLoading ? (
                            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading employees...
                            </div>
                          ) : employees.length === 0 ? (
                            <p className="py-4 text-muted-foreground text-sm">
                              No active employees found. Add employees on the Employees page first.
                            </p>
                          ) : (
                            employees.map((emp) => {
                              const idStr = String(emp.id);
                              const isChecked = selectedIds.includes(idStr);
                              return (
                                <div key={emp.id} className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    id={`emp-${emp.id}`}
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      const next = checked === true
                                        ? [...selectedIds, idStr]
                                        : selectedIds.filter((id) => id !== idStr);
                                      field.onChange(next);
                                    }}
                                    className="h-4 w-4 rounded-md border-2 border-gray-300 data-[state=checked]:bg-brand data-[state=checked]:border-brand data-[state=checked]:text-white focus-visible:ring-brand focus-visible:ring-2 focus-visible:ring-offset-2 transition-all duration-200 hover:border-brand"
                                  />
                                  <label
                                    htmlFor={`emp-${emp.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {emp.firstName} {emp.lastName} — {emp.jobTitle || '—'}
                                  </label>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </form>
          </Form>
      </MobileFormDialog>

      <DetailsDrawer
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setViewingRun(null);
        }}
        title={viewingRun ? `Payroll Run - ${dayjs(viewingRun.periodStart).format('MMM DD')} to ${dayjs(viewingRun.periodEnd).format('MMM DD, YYYY')}` : 'Payroll Run Details'}
        width={900}
        showActions={true}
        tabs={drawerTabs}
        extraActions={
          viewingRun
            ? [
                {
                  key: 'cancel',
                  label: 'Cancel',
                  variant: 'outline',
                  onClick: () => {
                    setDrawerVisible(false);
                    setViewingRun(null);
                  }
                },
                {
                  key: 'post',
                  label: 'Post Payroll Run',
                  variant: 'default',
                  icon: <Loader2 className={`h-4 w-4 ${postRunMutation.isLoading ? 'animate-spin' : ''}`} />,
                  onClick: () => handlePostRun(viewingRun.id),
                  disabled: postRunMutation.isLoading || viewingRun.status === 'approved' || viewingRun.status === 'paid'
                }
              ]
            : []
        }
      />
    </div>
  );
};

export default Payroll;





