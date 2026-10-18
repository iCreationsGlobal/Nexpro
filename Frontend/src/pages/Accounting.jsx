import { useMemo, useState, useRef, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../hooks/useCurrency';
import { useResponsive } from '../hooks/useResponsive';
import { useDeviceMode } from '../hooks/useDeviceMode';
import { usePagedList } from '../hooks/usePagedList';
import { showSuccess, showError } from '../utils/toast';
// Removed Ant Design imports - using shadcn/ui only
import { Plus, RefreshCw, Eye, Loader2, MinusCircle, BookOpen, FileText, Calculator, TrendingUp, Trash2, PlusCircle, Repeat, Play, Pause, CalendarClock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import accountingService from '../services/accountingService';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatusChip from '../components/StatusChip';
import { Separator } from '@/components/ui/separator';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import TableSkeleton from '../components/TableSkeleton';
import DashboardTable from '../components/DashboardTable';
import MobileFormDialog from '../components/MobileFormDialog';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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
import { numberInputValue, handleNumberChange, numberOrEmptySchema } from '../utils/formUtils';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';

const accountSchema = z.object({
  code: z.string().min(1, 'Account code is required'),
  name: z.string().min(1, 'Account name is required'),
  type: z.enum(['asset', 'liability', 'equity', 'income', 'expense', 'cogs', 'other']),
  category: z.string().optional(),
  description: z.string().optional(),
});

const journalLineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  debit: numberOrEmptySchema(z),
  credit: numberOrEmptySchema(z),
  description: z.string().optional(),
}).refine((data) => (data.debit > 0 && data.credit === 0) || (data.debit === 0 && data.credit > 0), {
  message: 'Either debit or credit must be greater than 0, but not both',
  path: ['debit'],
});

const journalEntrySchema = z.object({
  date: z.date({ required_error: 'Date is required' }),
  reference: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  lines: z.array(journalLineSchema).min(2, 'At least 2 journal lines required'),
}).refine((data) => {
  const totalDebits = data.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredits = data.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  return Math.abs(totalDebits - totalCredits) < 0.01; // Allow small floating point differences
}, {
  message: 'Total debits must equal total credits',
  path: ['lines'],
});

const recurringJournalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  templateType: z.enum(['recurring_journal', 'prepaid_expense']),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  interval: z.coerce.number().min(1, 'Interval must be at least 1'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  debitAccountId: z.string().min(1, 'Debit account is required'),
  creditAccountId: z.string().min(1, 'Credit account is required'),
  startDate: z.date({ required_error: 'Start date is required' }),
  endDate: z.date().optional().nullable(),
  autoPost: z.boolean().default(true),
}).refine((data) => data.debitAccountId !== data.creditAccountId, {
  message: 'Debit and credit accounts must be different',
  path: ['creditAccountId'],
});

const accountTypeLabels = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expense',
  cogs: 'Cost of Goods Sold',
  other: 'Other'
};

const PREPAID_DEBIT_TYPES = ['expense', 'cogs'];
const PREPAID_CREDIT_TYPES = ['asset'];

/** Categories shown in the Category dropdown, keyed by account type */
const accountCategoriesByType = {
  asset: [
    { value: 'Current Assets', label: 'Current Assets' },
    { value: 'Fixed Assets', label: 'Fixed Assets' },
  ],
  liability: [
    { value: 'Current Liabilities', label: 'Current Liabilities' },
    { value: 'Long-term Liabilities', label: 'Long-term Liabilities' },
  ],
  equity: [
    { value: 'Equity', label: 'Equity' },
  ],
  income: [
    { value: 'Operating Revenue', label: 'Operating Revenue' },
    { value: 'Other Income', label: 'Other Income' },
  ],
  expense: [
    { value: 'Operating Expenses', label: 'Operating Expenses' },
    { value: 'Other Expenses', label: 'Other Expenses' },
  ],
  cogs: [
    { value: 'Cost of Goods Sold', label: 'Cost of Goods Sold' },
    { value: 'Materials', label: 'Materials' },
    { value: 'Labor', label: 'Labor' },
  ],
  other: [
    { value: 'Other', label: 'Other' },
  ],
};

/** Journal entries in one list response (`{ data, count }`). */
const journalRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

const Accounting = () => {
  const { formatAmount } = useCurrency();
  const queryClient = useQueryClient();
  const { activeTenantId } = useAuth();
  const { isMobile } = useResponsive();
  const { isAppShell } = useDeviceMode();
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [journalModalVisible, setJournalModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountDrawerVisible, setAccountDrawerVisible] = useState(false);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState(null);
  const [journalDrawerVisible, setJournalDrawerVisible] = useState(false);
  const [journalEntryToDelete, setJournalEntryToDelete] = useState(null);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [recurringToDelete, setRecurringToDelete] = useState(null);
  /** When add-account was opened from journal line dropdown, store line index to set new account on success */
  const addAccountForJournalLineIndexRef = useRef(null);

  const accountForm = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'asset',
      category: 'Current Assets',
      description: '',
    },
  });

  const journalForm = useForm({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      date: new Date(),
      reference: '',
      description: '',
      lines: [{ accountId: '', debit: 0, credit: 0, description: '' }],
    },
  });

  const recurringForm = useForm({
    resolver: zodResolver(recurringJournalSchema),
    defaultValues: {
      name: '',
      description: '',
      templateType: 'recurring_journal',
      frequency: 'monthly',
      interval: 1,
      amount: 0,
      debitAccountId: '',
      creditAccountId: '',
      startDate: new Date(),
      endDate: null,
      autoPost: true,
    },
  });

  const { fields: journalFields, append: appendJournalLine, remove: removeJournalLine } = useFieldArray({
    control: journalForm.control,
    name: 'lines',
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountingService.getAccounts(),
    enabled: !!activeTenantId,
  });

  // Desktop: one request with the server's default page, as before.
  const journalQuery = useQuery({
    queryKey: ['journalEntries'],
    queryFn: () => accountingService.getJournalEntries(),
    enabled: !!activeTenantId && !isAppShell,
  });

  // Phones and tablets: every journal entry, loaded as you scroll.
  const shellJournal = usePagedList({
    queryKey: (params) => ['journalEntries', params],
    fetchPage: (params) => accountingService.getJournalEntries(params),
    getRows: journalRowsFromResponse,
    getTotal: (response) => response?.count,
    enabled: !!activeTenantId && isAppShell,
  });

  const trialBalanceQuery = useQuery({
    queryKey: ['trialBalance'],
    queryFn: () => accountingService.getTrialBalance(),
    enabled: !!activeTenantId,
  });

  const recurringJournalsQuery = useQuery({
    queryKey: ['recurringJournals'],
    queryFn: () => accountingService.getRecurringJournals(),
    enabled: !!activeTenantId,
  });

  const recurringRunsQuery = useQuery({
    queryKey: ['recurringJournalRuns'],
    queryFn: () => accountingService.getRecurringJournalRuns(),
    enabled: !!activeTenantId,
  });

  const createAccountMutation = useMutation({
    mutationFn: accountingService.createAccount,
    onSuccess: (response) => {
      showSuccess('Account created');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setAccountModalVisible(false);
      const lineIndex = addAccountForJournalLineIndexRef.current;
      if (lineIndex != null) {
        const account = response?.data?.data ?? response?.data ?? response;
        const newAccountId = account?.id;
        if (newAccountId) {
          journalForm.setValue(`lines.${lineIndex}.accountId`, newAccountId);
        }
        addAccountForJournalLineIndexRef.current = null;
      }
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to create account');
    }
  });

  const createJournalMutation = useMutation({
    mutationFn: accountingService.createJournalEntry,
    onSuccess: () => {
      showSuccess('Journal entry created');
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      setJournalModalVisible(false);
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to create journal entry');
    }
  });

  const postJournalMutation = useMutation({
    mutationFn: accountingService.postJournalEntry,
    onSuccess: (result) => {
      showSuccess('Journal entry posted');
      const data = result?.data ?? result;
      setSelectedJournalEntry(data);
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to post journal entry');
    }
  });

  const deleteJournalEntryMutation = useMutation({
    mutationFn: accountingService.deleteJournalEntry,
    onSuccess: () => {
      showSuccess('Journal entry deleted');
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      setJournalEntryToDelete(null);
      setJournalDrawerVisible(false);
      setSelectedJournalEntry(null);
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to delete journal entry');
    }
  });

  const createRecurringMutation = useMutation({
    mutationFn: accountingService.createRecurringJournal,
    onSuccess: () => {
      showSuccess('Recurring journal created');
      queryClient.invalidateQueries({ queryKey: ['recurringJournals'] });
      queryClient.invalidateQueries({ queryKey: ['recurringJournalRuns'] });
      setRecurringModalVisible(false);
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to create recurring journal');
    }
  });

  const updateRecurringMutation = useMutation({
    mutationFn: ({ id, payload }) => accountingService.updateRecurringJournal(id, payload),
    onSuccess: () => {
      showSuccess('Recurring journal updated');
      queryClient.invalidateQueries({ queryKey: ['recurringJournals'] });
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to update recurring journal');
    }
  });

  const deleteRecurringMutation = useMutation({
    mutationFn: accountingService.deleteRecurringJournal,
    onSuccess: () => {
      showSuccess('Recurring journal deleted');
      queryClient.invalidateQueries({ queryKey: ['recurringJournals'] });
      queryClient.invalidateQueries({ queryKey: ['recurringJournalRuns'] });
      setRecurringToDelete(null);
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to delete recurring journal');
    }
  });

  const runRecurringNowMutation = useMutation({
    mutationFn: accountingService.runRecurringJournalNow,
    onSuccess: () => {
      showSuccess('Recurring journal run completed');
      queryClient.invalidateQueries({ queryKey: ['recurringJournals'] });
      queryClient.invalidateQueries({ queryKey: ['recurringJournalRuns'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to run recurring journal');
    }
  });

  const runDueMutation = useMutation({
    mutationFn: accountingService.runDueRecurringJournals,
    onSuccess: () => {
      showSuccess('Due recurring journals processed');
      queryClient.invalidateQueries({ queryKey: ['recurringJournals'] });
      queryClient.invalidateQueries({ queryKey: ['recurringJournalRuns'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to run due recurring journals');
    }
  });

  const handleViewAccount = (account) => {
    setSelectedAccount(account);
    setAccountDrawerVisible(true);
  };

  const handleOpenAccountModal = () => {
    accountForm.reset();
    setAccountModalVisible(true);
  };

  const handleOpenJournalModal = () => {
    journalForm.reset();
    setJournalModalVisible(true);
  };
  const handleOpenRecurringModal = () => {
    recurringForm.reset();
    setRecurringModalVisible(true);
  };

  const onSubmitAccount = (data) => {
    createAccountMutation.mutate(data);
  };

  const onSubmitJournal = (data) => {
    createJournalMutation.mutate(data);
  };
  const onSubmitRecurring = (data) => {
    createRecurringMutation.mutate({
      ...data,
      startDate: dayjs(data.startDate).format('YYYY-MM-DD'),
      endDate: data.endDate ? dayjs(data.endDate).format('YYYY-MM-DD') : null,
    });
  };

  // Table columns for DashboardTable
  const accountTableColumns = useMemo(() => [
    {
      key: 'code',
      label: 'Code',
      render: (_, record) => <span className="font-medium text-foreground">{record?.code || '—'}</span>
    },
    {
      key: 'name',
      label: 'Name',
      render: (_, record) => <span className="text-foreground">{record?.name || '—'}</span>
    },
    {
      key: 'type',
      label: 'Type',
      render: (_, record) => <span className="text-foreground">{accountTypeLabels[record?.type] || record?.type || '—'}</span>
    },
    {
      key: 'category',
      label: 'Category',
      render: (_, record) => <span className="text-foreground">{record?.category || '—'}</span>
    },
    {
      key: 'isActive',
      label: 'Active',
      render: (_, record) => <StatusChip status={record?.isActive ? 'active_flag' : 'inactive_flag'} />
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleViewAccount(record)}
          >
            <Eye className="h-4 w-4 mr-2" />
            View
          </Button>
        </div>
      )
    }
  ], []);

  const handleViewJournalEntry = async (id) => {
    try {
      const response = await accountingService.getJournalEntry(id);
      setSelectedJournalEntry(response.data || response);
      setJournalDrawerVisible(true);
    } catch (error) {
      showError(null, 'Failed to load journal entry');
    }
  };

  // Helper function to render table from columns and dataSource
  const renderTable = (columns, dataSource, rowKey = 'id', options = {}) => {
    const { pagination: tablePagination, summary } = options;
    const pageSize = tablePagination?.pageSize || 10;
    const current = tablePagination?.current || 1;
    const total = tablePagination?.total || dataSource?.length || 0;
    const showPagination = tablePagination !== false && total > pageSize;
    
    const startIndex = (current - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = showPagination ? (dataSource?.slice(startIndex, endIndex) || []) : (dataSource || []);

    return (
      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead 
                  key={col.key || col.dataIndex} 
                  style={{ width: col.width, textAlign: col.align }}
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
      </div>
    );
  };

  const journalTableColumns = useMemo(() => [
    {
      key: 'entryDate',
      label: 'Date',
      render: (_, record) => <span className="text-foreground">{record?.entryDate ? dayjs(record.entryDate).format('MMM DD, YYYY') : '—'}</span>
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (_, record) => <span className="text-foreground">{record?.reference || '—'}</span>
    },
    {
      key: 'description',
      label: 'Description',
      render: (_, record) => <span className="text-foreground">{record?.description || '—'}</span>
    },
    {
      key: 'status',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => <StatusChip status={record?.status || 'draft'} />
    },
    {
      key: 'lines',
      label: 'Lines',
      render: (_, record) => {
        const lines = record?.lines || [];
        return (
          <div>
            {lines.length > 0 ? (
              <>
                {lines.slice(0, 2).map((line) => (
                  <div key={line.id} className="text-sm">
                    <strong className="text-foreground">{line.account?.code}</strong> — <span className="text-foreground">{line.account?.name}</span>{' '}
                    <span className="text-muted-foreground">
                      {line.debit > 0 ? `Debit ${formatAmount(line.debit)}` : `Credit ${formatAmount(line.credit)}`}
                    </span>
                  </div>
                ))}
                {lines.length > 2 && (
                  <span className="text-muted-foreground text-xs">
                    +{lines.length - 2} more line{lines.length - 2 > 1 ? 's' : ''}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">No lines</span>
            )}
          </div>
        );
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => {
        const isDraft = (record?.status || 'draft') === 'draft';
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewJournalEntry(record.id)}
            >
              <Eye className="h-4 w-4 mr-2" />
              View
            </Button>
            {isDraft && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setJournalEntryToDelete(record)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        );
      }
    }
  ], []);

  const trialTableColumns = useMemo(() => [
    {
      key: 'account',
      label: 'Account',
      render: (_, record) => (
        <div>
          <strong className="text-foreground">{record?.account?.code}</strong> — <span className="text-foreground">{record?.account?.name}</span>
        </div>
      )
    },
    {
      key: 'debit',
      label: 'Debit',
      render: (_, record) => <span className="text-foreground text-right">{record?.debit ? formatAmount(record.debit) : '—'}</span>
    },
    {
      key: 'credit',
      label: 'Credit',
      render: (_, record) => <span className="text-foreground text-right">{record?.credit ? formatAmount(record.credit) : '—'}</span>
    },
    {
      key: 'balance',
      label: 'Balance',
      render: (_, record) => <span className="text-foreground font-medium text-right">{formatAmount(record?.balance)}</span>
    }
  ], []);

  const recurringTableColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (_, record) => (
        <div>
          <div className="font-medium text-foreground">{record?.name || '—'}</div>
          <div className="text-xs text-muted-foreground">{record?.templateType === 'prepaid_expense' ? 'Prepaid expense' : 'Recurring journal'}</div>
        </div>
      )
    },
    {
      key: 'schedule',
      label: 'Schedule',
      render: (_, record) => <span className="text-foreground capitalize">{record?.frequency} every {record?.interval || 1}</span>
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (_, record) => <span className="text-foreground font-medium">{formatAmount(record?.amount)}</span>
    },
    {
      key: 'nextRunDate',
      label: 'Next Run',
      render: (_, record) => <span className="text-foreground">{record?.nextRunDate ? dayjs(record.nextRunDate).format('MMM DD, YYYY') : '—'}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, record) => <StatusChip status={record?.status || 'active'} />
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runRecurringNowMutation.mutate(record.id)}
            disabled={record?.status !== 'active' || runRecurringNowMutation.isLoading}
          >
            <Play className="h-4 w-4 mr-2" />
            Run now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateRecurringMutation.mutate({ id: record.id, payload: { status: record.status === 'active' ? 'paused' : 'active' } })}
            disabled={updateRecurringMutation.isLoading || record?.status === 'completed'}
          >
            {record?.status === 'active' ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {record?.status === 'active' ? 'Pause' : 'Resume'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setRecurringToDelete(record)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      )
    }
  ], [runRecurringNowMutation, updateRecurringMutation]);

  const accounts = accountsQuery.data?.data || [];
  const journalEntries = isAppShell ? shellJournal.rows : (journalQuery.data?.data || []);
  // The stats card counts the first page in both layouts (desktop only asks for that page).
  const journalEntriesForStats = useMemo(
    () => (isAppShell ? journalRowsFromResponse(shellJournal.response) : journalEntries),
    [isAppShell, shellJournal.response, journalEntries],
  );
  const trialBalance = trialBalanceQuery.data?.data || [];
  const recurringJournals = recurringJournalsQuery.data?.data || [];
  const recurringRuns = recurringRunsQuery.data?.data || [];

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalAccounts = accounts.length;
    const journalEntriesCount = journalEntriesForStats.length;
    const activeAccounts = accounts.filter(a => a.isActive).length;
    const activeRecurring = recurringJournals.filter((r) => r.status === 'active').length;
    
    return {
      totals: {
        totalAccounts,
        journalEntries: journalEntriesCount,
        activeAccounts,
        activeRecurring
      }
    };
  }, [accounts, journalEntriesForStats, recurringJournals]);

  const accountOptions = accounts.map((account) => ({
    label: `${account.code} — ${account.name}`,
    value: account.id,
    type: account.type,
  }));

  const recurringTemplateType = recurringForm.watch('templateType');
  const selectedDebitAccountId = recurringForm.watch('debitAccountId');
  const selectedCreditAccountId = recurringForm.watch('creditAccountId');

  const debitAccountOptions = useMemo(() => {
    const filtered = recurringTemplateType === 'prepaid_expense'
      ? accountOptions.filter((option) => PREPAID_DEBIT_TYPES.includes(option.type))
      : accountOptions;
    return filtered.filter((option) => option.value !== selectedCreditAccountId);
  }, [recurringTemplateType, accountOptions, selectedCreditAccountId]);

  const creditAccountOptions = useMemo(() => {
    const filtered = recurringTemplateType === 'prepaid_expense'
      ? accountOptions.filter((option) => PREPAID_CREDIT_TYPES.includes(option.type))
      : accountOptions;
    return filtered.filter((option) => option.value !== selectedDebitAccountId);
  }, [recurringTemplateType, accountOptions, selectedDebitAccountId]);

  const groupAccountOptionsByType = useCallback((options) => {
    return options.reduce((acc, option) => {
      const type = option.type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(option);
      return acc;
    }, {});
  }, []);

  const groupedDebitOptions = useMemo(
    () => groupAccountOptionsByType(debitAccountOptions),
    [debitAccountOptions, groupAccountOptionsByType]
  );

  const groupedCreditOptions = useMemo(
    () => groupAccountOptionsByType(creditAccountOptions),
    [creditAccountOptions, groupAccountOptionsByType]
  );

  const accountTypeOrder = ['asset', 'liability', 'equity', 'income', 'expense', 'cogs', 'other'];

  const renderGroupedAccountSelectOptions = useCallback((groupedOptions) => (
    accountTypeOrder
      .filter((type) => Array.isArray(groupedOptions[type]) && groupedOptions[type].length > 0)
      .map((type, groupIndex) => (
        <div key={`group-${type}`}>
          {groupIndex > 0 && <SelectSeparator />}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {accountTypeLabels[type] || type}
          </div>
          {groupedOptions[type].map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </div>
      ))
  ), []);


  const totals = useMemo(() => {
    const debit = trialBalance.reduce((sum, item) => sum + parseFloat(item.debit || 0), 0);
    const credit = trialBalance.reduce((sum, item) => sum + parseFloat(item.credit || 0), 0);
    return { debit, credit };
  }, [trialBalance]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Accounting"
          subText="Manage your chart of accounts, journal entries, and trial balance."
        />
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['accounts'] });
                queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
                queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
                queryClient.invalidateQueries({ queryKey: ['recurringJournals'] });
                queryClient.invalidateQueries({ queryKey: ['recurringJournalRuns'] });
              }} size={isMobile ? "icon" : "default"}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh accounting data</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" onClick={handleOpenAccountModal}>
                <Plus className="h-4 w-4 mr-2" />
                New Account
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new account to chart of accounts</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" onClick={handleOpenRecurringModal}>
                <Repeat className="h-4 w-4 mr-2" />
                New Recurring
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create recurring/prepaid schedule</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleOpenJournalModal}>
                <Plus className="h-4 w-4 mr-2" />
                New Journal Entry
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create a new journal entry</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => runDueMutation.mutate({})}
                disabled={runDueMutation.isLoading}
              >
                {runDueMutation.isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarClock className="h-4 w-4 mr-2" />}
                Run Due
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run all due recurring journals now</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardStatsCard
          tooltip="Total accounts in chart of accounts"
          title="Total Accounts"
          value={summaryStats?.totals?.totalAccounts || 0}
          icon={BookOpen}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          tooltip="Total journal entries recorded"
          title="Journal Entries"
          value={summaryStats?.totals?.journalEntries || 0}
          icon={FileText}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#3b82f6"
        />
        <DashboardStatsCard
          tooltip="Accounts currently in use"
          title="Active Accounts"
          value={summaryStats?.totals?.activeAccounts || 0}
          icon={TrendingUp}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
        <DashboardStatsCard
          tooltip="Active recurring and prepaid schedules"
          title="Active Recurring"
          value={summaryStats?.totals?.activeRecurring || 0}
          icon={Repeat}
          iconBgColor="rgba(249, 115, 22, 0.1)"
          iconColor="#f97316"
        />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="trial">Trial Balance</TabsTrigger>
          <TabsTrigger value="recurring">Recurring & Prepaid</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts">
          <DashboardTable
            data={accounts}
            columns={accountTableColumns}
            loading={accountsQuery.isLoading}
            title={null}
            emptyIcon={<BookOpen className="h-12 w-12 text-muted-foreground" />}
            emptyDescription="No accounts yet. Chart of accounts will be created automatically from transactions."
            pageSize={10}
            onPageChange={(newPagination) => {
              // Handle pagination if needed
            }}
            externalPagination={{
              current: 1,
              total: accounts.length
            }}
          />
        </TabsContent>
        <TabsContent value="journal">
          <DashboardTable
            data={journalEntries}
            columns={journalTableColumns}
            loading={isAppShell ? shellJournal.isLoading : journalQuery.isLoading}
            title={null}
            emptyIcon={<FileText className="h-12 w-12 text-muted-foreground" />}
            emptyDescription="No journal entries yet. Entries are created automatically from sales, expenses, and invoices."
            pageSize={10}
            onPageChange={(newPagination) => {
              // Handle pagination if needed
            }}
            externalPagination={{
              current: 1,
              total: journalEntries.length
            }}
            infinite={shellJournal.infinite}
          />
        </TabsContent>
        <TabsContent value="trial">
          <Card>
            <DashboardTable
              data={trialBalance}
              columns={trialTableColumns}
              loading={trialBalanceQuery.isLoading}
              title={null}
              emptyIcon={<Calculator className="h-12 w-12 text-muted-foreground" />}
              emptyDescription="No trial balance data yet. Data will appear after recording transactions."
              pageSize={1000}
              onPageChange={() => {}}
              externalPagination={{
                current: 1,
                total: trialBalance.length
              }}
            />
            {trialBalance.length > 0 && (
              <div className="border-t p-4">
                <div className="flex justify-between items-center">
                  <strong className="text-foreground">Total</strong>
                  <div className="flex gap-8">
                    <strong className="text-foreground">{formatAmount(totals.debit)}</strong>
                    <strong className="text-foreground">{formatAmount(totals.credit)}</strong>
                    <span className="text-foreground">—</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="recurring">
          <Card>
            <DashboardTable
              data={recurringJournals}
              columns={recurringTableColumns}
              loading={recurringJournalsQuery.isLoading}
              title={null}
              emptyIcon={<Repeat className="h-12 w-12 text-muted-foreground" />}
              emptyDescription="No recurring schedules yet. Add recurring journals or prepaid amortization schedules."
              pageSize={10}
              onPageChange={() => {}}
              externalPagination={{
                current: 1,
                total: recurringJournals.length
              }}
            />
            {recurringRuns.length > 0 && (
              <div className="border-t p-4 space-y-2">
                <h4 className="font-medium text-foreground">Recent Runs</h4>
                <div className="space-y-1">
                  {recurringRuns.slice(0, 6).map((run) => (
                    <div key={run.id} className="text-sm text-muted-foreground">
                      {dayjs(run.runDate).format('MMM DD, YYYY')} — {run.status} {run.journalEntryId ? '(journal created)' : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={accountDrawerVisible} onOpenChange={(open) => {
        if (!open) {
          setAccountDrawerVisible(false);
          setSelectedAccount(null);
        }
      }}>
        <SheetContent className="w-full sm:w-[min(92vw,620px)] sm:max-w-[min(92vw,620px)]">
          <SheetHeader>
            <SheetTitle>
              {selectedAccount
                ? `${selectedAccount.code} — ${selectedAccount.name}`
                : 'Account'}
            </SheetTitle>
            <SheetDescription className="sr-only">View account details</SheetDescription>
          </SheetHeader>
          {selectedAccount ? (
            <>
              <Descriptions column={1} className="mt-6">
                <DescriptionItem label="Code">{selectedAccount.code}</DescriptionItem>
                <DescriptionItem label="Name">{selectedAccount.name}</DescriptionItem>
                <DescriptionItem label="Type">{accountTypeLabels[selectedAccount.type] || selectedAccount.type}</DescriptionItem>
                <DescriptionItem label="Category">{selectedAccount.category || '—'}</DescriptionItem>
                <DescriptionItem label="Status">
                  <StatusChip status={selectedAccount.isActive ? 'active_flag' : 'inactive_flag'} />
                </DescriptionItem>
                <DescriptionItem label="Description">{selectedAccount.description || '—'}</DescriptionItem>
                <DescriptionItem label="Created At">
                  {selectedAccount.createdAt ? dayjs(selectedAccount.createdAt).format('MMM DD, YYYY HH:mm') : '—'}
                </DescriptionItem>
                <DescriptionItem label="Updated At">
                  {selectedAccount.updatedAt ? dayjs(selectedAccount.updatedAt).format('MMM DD, YYYY HH:mm') : '—'}
                </DescriptionItem>
              </Descriptions>
            </>
          ) : (
            <p className="text-muted-foreground mt-6">Select an account to view details.</p>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={journalDrawerVisible} onOpenChange={(open) => {
        if (!open) {
          setJournalDrawerVisible(false);
          setSelectedJournalEntry(null);
        }
      }}>
        <SheetContent className="w-full sm:w-[min(92vw,1140px)] sm:max-w-[min(92vw,1140px)]">
          <SheetHeader>
            <SheetTitle>Journal Entry Details</SheetTitle>
            <SheetDescription className="sr-only">View journal entry details</SheetDescription>
          </SheetHeader>
          {selectedJournalEntry ? (
            <>
              {(selectedJournalEntry.status || 'draft') === 'draft' && (
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={() => setJournalEntryToDelete(selectedJournalEntry)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <Button
                    onClick={() => postJournalMutation.mutate(selectedJournalEntry.id)}
                    disabled={postJournalMutation.isLoading}
                  >
                    {postJournalMutation.isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Post Entry
                  </Button>
                </div>
              )}
              <Descriptions column={2} className="mt-6 mb-6">
                <DescriptionItem label="Reference" span={2}>
                  <strong>{selectedJournalEntry.reference || '—'}</strong>
                </DescriptionItem>
                <DescriptionItem label="Date">
                  {dayjs(selectedJournalEntry.entryDate).format('MMM DD, YYYY')}
                </DescriptionItem>
                <DescriptionItem label="Status">
                  <StatusChip status={selectedJournalEntry.status || 'draft'} />
                </DescriptionItem>
                <DescriptionItem label="Source">
                  {selectedJournalEntry.source || '—'}
                </DescriptionItem>
                <DescriptionItem label="Description" span={2}>
                  {selectedJournalEntry.description || '—'}
                </DescriptionItem>
                {selectedJournalEntry.creator && (
                  <DescriptionItem label="Created By">
                    {selectedJournalEntry.creator?.name || '—'}
                  </DescriptionItem>
                )}
                {selectedJournalEntry.approver && (
                  <DescriptionItem label="Approved By">
                    {selectedJournalEntry.approver?.name || '—'}
                  </DescriptionItem>
                )}
              </Descriptions>

              <Separator className="my-6">
                <h3 className="text-lg font-semibold">Journal Entry Lines</h3>
              </Separator>

            {renderTable([
                {
                  title: 'Account',
                  key: 'account',
                  width: 300,
                  render: (_, line) => (
                    <div>
                      <strong>{line.account?.code || '—'}</strong>
                      <br />
                      <span className="text-muted-foreground text-xs">
                        {line.account?.name || '—'}
                      </span>
                    </div>
                  )
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  ellipsis: true
                },
                {
                  title: 'Debit',
                  dataIndex: 'debit',
                  key: 'debit',
                  align: 'right',
                  width: 150,
                  render: (value) => (
                    value > 0 ? (
                      <strong className="text-green-600">
                        {formatAmount(value)}
                      </strong>
                    ) : (
                      <span className="text-muted-foreground">{formatAmount(0)}</span>
                    )
                  )
                },
                {
                  title: 'Credit',
                  dataIndex: 'credit',
                  key: 'credit',
                  align: 'right',
                  width: 150,
                  render: (value) => (
                    value > 0 ? (
                      <strong className="text-red-600">
                        {formatAmount(value)}
                      </strong>
                    ) : (
                      <span className="text-muted-foreground">{formatAmount(0)}</span>
                    )
                  )
                }
              ], selectedJournalEntry.lines || [], 'id', {
                pagination: false,
                summary: (pageData) => {
                  const totalDebit = pageData.reduce((sum, line) => sum + parseFloat(line.debit || 0), 0);
                  const totalCredit = pageData.reduce((sum, line) => sum + parseFloat(line.credit || 0), 0);
                  
                  return (
                    <>
                      <TableCell colSpan={2}>
                        <strong>Total</strong>
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <strong className="text-green-600">
                          {formatAmount(totalDebit)}
                        </strong>
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <strong className="text-red-600">
                          {formatAmount(totalCredit)}
                        </strong>
                      </TableCell>
                    </>
                  );
                }
              })}
          </>
        ) : (
          <p className="text-muted-foreground mt-6">Select a journal entry to view details.</p>
        )}
        </SheetContent>
      </Sheet>

      <MobileFormDialog
        open={accountModalVisible}
        onOpenChange={(open) => {
          if (!open) {
            setAccountModalVisible(false);
            addAccountForJournalLineIndexRef.current = null;
          }
        }}
        title="New Account"
        description="Create a new chart of accounts entry"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAccountModalVisible(false)}>
              Cancel
            </Button>
            <Button form="account-form" type="submit" disabled={createAccountMutation.isLoading}>
              {createAccountMutation.isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Account
            </Button>
          </>
        }
      >
          <Form {...accountForm}>
            <form id="account-form" onSubmit={accountForm.handleSubmit(onSubmitAccount)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={accountForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Code</FormLabel>
                      <FormControl>
                        <Input placeholder="1000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={accountForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Cash at Bank" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={accountForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          const categories = accountCategoriesByType[value];
                          const firstCategory = categories?.[0]?.value ?? '';
                          accountForm.setValue('category', firstCategory);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select account type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(accountTypeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={accountForm.control}
                  name="category"
                  render={({ field }) => {
                    const selectedType = accountForm.watch('type');
                    const categoryOptions = selectedType ? (accountCategoriesByType[selectedType] ?? []) : [];
                    return (
                      <FormItem>
                        <FormLabel>Category (optional)</FormLabel>
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                          disabled={!selectedType}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={selectedType ? 'Select category' : 'Select type first'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categoryOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <FormField
                control={accountForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Optional description of the account" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
      </MobileFormDialog>

      <MobileFormDialog
        open={journalModalVisible}
        onOpenChange={(open) => {
          if (!open) setJournalModalVisible(false);
        }}
        title="New Journal Entry"
        description="Create a new journal entry with balanced debit and credit lines"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setJournalModalVisible(false)}>
              Cancel
            </Button>
            <Button form="journal-form" type="submit" loading={createJournalMutation.isLoading}>
              Create Journal Entry
            </Button>
          </>
        }
      >
          <Form {...journalForm}>
            <form id="journal-form" onSubmit={journalForm.handleSubmit(onSubmitJournal)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={journalForm.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="AUTOMATIC" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={journalForm.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <DatePicker
                          date={field.value}
                          onSelect={(date) => field.onChange(date)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={journalForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Narration" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Label>Journal Lines</Label>
                {journalFields.map((field, index) => (
                  <Card key={field.id} className="p-4">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 md:col-span-4">
                        <FormField
                          control={journalForm.control}
                          name={`lines.${index}.accountId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Account</FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={(val) => {
                                  if (val === '__add_account__') {
                                    addAccountForJournalLineIndexRef.current = index;
                                    accountForm.reset();
                                    setAccountModalVisible(true);
                                  } else {
                                    field.onChange(val);
                                  }
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {accountOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                  <SelectSeparator />
                                  <SelectItem value="__add_account__" className="text-primary font-medium">
                                    <PlusCircle className="h-4 w-4 mr-2 inline" />
                                    Add account
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <FormField
                          control={journalForm.control}
                          name={`lines.${index}.debit`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Debit</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  {...field}
                                  value={numberInputValue(field.value)}
                                  onChange={(e) => handleNumberChange(e, field.onChange)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <FormField
                          control={journalForm.control}
                          name={`lines.${index}.credit`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Credit</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  {...field}
                                  value={numberInputValue(field.value)}
                                  onChange={(e) => handleNumberChange(e, field.onChange)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-10 md:col-span-3">
                        <FormField
                          control={journalForm.control}
                          name={`lines.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Description</FormLabel>
                              <FormControl>
                                <Input placeholder="Line description" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeJournalLine(index)}
                        >
                          <MinusCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => appendJournalLine({ accountId: '', debit: 0, credit: 0, description: '' })}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              </div>
            </form>
          </Form>
      </MobileFormDialog>

      <MobileFormDialog
        open={recurringModalVisible}
        onOpenChange={(open) => {
          if (!open) setRecurringModalVisible(false);
        }}
        title="New Recurring / Prepaid Journal"
        description="Automate fixed journals or prepaid amortization"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRecurringModalVisible(false)}>
              Cancel
            </Button>
            <Button form="recurring-form" type="submit" disabled={createRecurringMutation.isLoading}>
              {createRecurringMutation.isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Schedule
            </Button>
          </>
        }
      >
        <Form {...recurringForm}>
          <form id="recurring-form" onSubmit={recurringForm.handleSubmit(onSubmitRecurring)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={recurringForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Monthly Hosting Amortization" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={recurringForm.control}
                name="templateType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="recurring_journal">Recurring Journal</SelectItem>
                        <SelectItem value="prepaid_expense">Prepaid Expense</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={recurringForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="What this automated entry is for" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={recurringForm.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={recurringForm.control}
                name="interval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Every N periods</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={recurringForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={recurringForm.control}
                name="debitAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Debit Account</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select debit account" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {renderGroupedAccountSelectOptions(groupedDebitOptions)}
                      </SelectContent>
                    </Select>
                    {recurringTemplateType === 'prepaid_expense' && (
                      <p className="text-xs text-muted-foreground">Prepaid expense debit should be an expense/COGS account.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={recurringForm.control}
                name="creditAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Account</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select credit account" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {renderGroupedAccountSelectOptions(groupedCreditOptions)}
                      </SelectContent>
                    </Select>
                    {recurringTemplateType === 'prepaid_expense' && (
                      <p className="text-xs text-muted-foreground">Prepaid expense credit should be a prepaid asset account.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={recurringForm.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <DatePicker date={field.value} onSelect={(date) => field.onChange(date)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={recurringForm.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date (optional)</FormLabel>
                    <FormControl>
                      <DatePicker date={field.value || undefined} onSelect={(date) => field.onChange(date || null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={recurringForm.control}
              name="autoPost"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <FormLabel>Auto-post journals</FormLabel>
                    <p className="text-xs text-muted-foreground">Turn off to create draft journals instead.</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </MobileFormDialog>

      <AlertDialog open={!!journalEntryToDelete} onOpenChange={(open) => !open && setJournalEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete journal entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this draft journal entry? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => journalEntryToDelete && deleteJournalEntryMutation.mutate(journalEntryToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recurringToDelete} onOpenChange={(open) => !open && setRecurringToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring journal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the schedule. Existing journal entries already created will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => recurringToDelete && deleteRecurringMutation.mutate(recurringToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Accounting;

