import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  DollarSign,
  ExternalLink,
  FileText,
  Filter,
  Download,
  Eye,
  Gift,
  Lightbulb,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Package,
  Pencil,
  PauseCircle,
  PlayCircle,
  Plus,
  Send,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useStudioLocationOptional } from '../context/StudioLocationContext';
import automationService from '../services/automationService';
import settingsService from '../services/settingsService';
import whatsappService from '../services/whatsappService';
import {
  ACTION_TYPE_OPTIONS,
  ALL_BRANCHES_VALUE,
  FREQUENCY_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  THRESHOLD_MODE_OPTIONS,
  TRIGGER_OPTIONS,
  MESSAGING_ACTION_TYPES,
  STAFF_RECIPIENT_TYPE_OPTIONS,
  STAFF_ROLE_OPTIONS,
  actionRowsFromConfig,
  buildRulePayloadFromForm,
  buildTestContextFromForm,
  buildTestRecipientContext,
  conditionFormFromConfig,
  defaultActionFormRow,
  defaultTriggerForm,
  formatPlaceholderHint,
  isInternalStaffTrigger,
  isStickyTrigger,
  resolveAutomationBranchLabel,
  supportsSendAfter,
  usesDailySchedule,
  DELAY_MINUTES_PRESETS,
  mergeTriggerForm,
  parseJsonObject,
  prefillActionRows,
  ruleHasMessagingActions,
  scheduleFormFromConfig,
  defaultFrequencyForTrigger,
  defaultDelayMinutesForTrigger,
  formatScheduleTimeDisplay,
  getEventTimingCopy,
  getReviewAdditionalSettingsLines,
  getWhatHappensNextTiming,
  triggerLabel,
  findDuplicateAutomationRule,
  describeAutomationDuplicateConflict,
} from '../utils/automationForm';
import {
  filterTriggerOptionsForTenant,
  isTriggerAllowedForTenant,
  resolveBusinessType,
} from '../utils/automationBusinessType';
import {
  buildDeliveryMatrix,
  buildWhatsAppStatusByMessageId,
  CHANNEL_ORDER,
} from '../utils/automationDelivery';
import { handleApiError, showError, showSuccess, showWarning } from '../utils/toast';
import { WHATSAPP_TEMPLATES, parametersTextFromTemplate } from '../constants/whatsappTemplates';
import AutomationTestRecipientDialog from '../components/automations/AutomationTestRecipientDialog';
import MessagePreview from '../components/automations/MessagePreview';
import { useScopedWorkspaceName } from '../hooks/useScopedWorkspaceName';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import StatusChip from '@/components/StatusChip';

const CARD_BORDER = { border: '1px solid #e5e7eb' };

const MAX_ACTIONS = 5;
const DEFAULT_TASK_AUTOMATION = {
  leadFollowUpToTask: true,
  invoiceOverdueToTask: false,
  quoteNoResponseToTask: false,
  lowStockToTask: false,
  quoteNoResponseDays: 3,
};

function createInitialBuilder() {
  const triggerType = 'invoice_due_in_days';
  return {
    name: '',
    triggerType,
    triggerForm: defaultTriggerForm(triggerType),
    conditionForm: conditionFormFromConfig({}, {}, triggerType),
    actionRows: [defaultActionFormRow('create_task', triggerType)],
    // null = applies to all branches (default for new rules).
    shopId: null,
    studioLocationId: null,
  };
}

const INITIAL_RAW_JSON = {
  triggerConfig: '{}',
  conditionConfig: '{}',
  actionConfig: '{"actions":[]}',
  scheduleConfig: '{}',
};

const RULE_STATUS_OPTIONS = [
  { value: 'all', label: 'All status' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'failed', label: 'Failed' },
];

const RULE_SORT_OPTIONS = [
  { value: 'recent', label: 'Sort' },
  { value: 'name', label: 'Name' },
  { value: 'success', label: 'Success rate' },
  { value: 'lastRun', label: 'Last run' },
];

const HISTORY_STATUS_OPTIONS = [
  { value: 'all', label: 'All status' },
  { value: 'success', label: 'Successful' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
];

const HISTORY_CHANNEL_OPTIONS = [
  { value: 'all', label: 'All channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'task', label: 'Task' },
];

const HISTORY_DATE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const LOG_STATUS_OPTIONS = [
  { value: 'all', label: 'All status' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'event', label: 'Events' },
];

const LOG_LEVEL_OPTIONS = [
  { value: 'all', label: 'All levels' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

const AI_BUILDER_STATUS_OPTIONS = [
  { value: 'all', label: 'All status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'draft', label: 'Draft' },
  { value: 'failed', label: 'Failed' },
];

const AI_BUILDER_EXAMPLES = [
  {
    key: 'invoice-overdue-reminder',
    title: 'Invoice overdue reminder',
    description: 'Send WhatsApp reminder when invoice is overdue.',
    prompt: 'Send a WhatsApp reminder when an invoice is overdue by 3 days and create a task for follow up.',
    tag: 'Popular',
    Icon: MessageSquare,
    accent: 'green',
  },
  {
    key: 'new-customer-welcome',
    title: 'New customer welcome',
    description: 'Send welcome message and create a follow-up task for new customers.',
    prompt: 'Send a welcome message to new customers and create a follow-up task for the team.',
    tag: 'Popular',
    Icon: UserPlus,
    accent: 'purple',
  },
  {
    key: 'payment-received-thank-you',
    title: 'Payment received thank you',
    description: 'Send thank you message when a payment is recorded.',
    prompt: 'Send a thank you WhatsApp message when a customer payment is recorded.',
    tag: 'Popular',
    Icon: DollarSign,
    accent: 'amber',
  },
  {
    key: 'low-stock-alert',
    title: 'Low stock alert',
    description: 'Notify team when any product stock goes below minimum level.',
    prompt: 'Notify the team and create a task when any product stock goes below its reorder level.',
    Icon: Bell,
    accent: 'red',
  },
  {
    key: 'follow-up-on-leads',
    title: 'Follow up on leads',
    description: "Create follow-up task for leads that haven't been contacted in 7 days.",
    prompt: "Create a follow-up task for leads that haven't been contacted in 7 days.",
    tag: 'New',
    Icon: Calendar,
    accent: 'blue',
  },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const triggerMetaByType = {
  invoice_due_in_days: {
    title: 'Invoice due',
    description: (config = {}) => `${Number(config.daysBeforeDue ?? 0)} days before due date`,
    Icon: FileText,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  invoice_overdue: {
    title: 'Invoice overdue',
    description: (config = {}) => `${Number(config.daysAfterDue ?? 0)} days after due date`,
    Icon: FileText,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  invoice_overdue_staff: {
    title: 'Invoice overdue (staff)',
    description: (config = {}) => `${Number(config.daysAfterDue ?? 0)} days after due date`,
    Icon: FileText,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  low_stock_detected: {
    title: 'Low stock',
    description: (config = {}) =>
      config.thresholdMode === 'fixed' ? `Below ${Number(config.fixedThreshold ?? 0)} units` : 'Below reorder level',
    Icon: Package,
    color: 'text-orange-700',
    bg: 'bg-orange-50',
  },
  quote_no_response: {
    title: 'Quote no response',
    description: (config = {}) => `${Number(config.silentDays ?? 7)} days after sent`,
    Icon: Clock3,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
  },
  customer_birthday: {
    title: 'Customer birthday',
    description: () => 'On birthday',
    Icon: Gift,
    color: 'text-pink-700',
    bg: 'bg-pink-50',
  },
  customer_inactive_days: {
    title: 'Customer inactive',
    description: (config = {}) => `${Number(config.inactiveDays ?? 30)} days inactive`,
    Icon: Calendar,
    color: 'text-slate-700',
    bg: 'bg-slate-100',
  },
  payment_received: {
    title: 'Payment received',
    description: () => 'When a payment is recorded',
    Icon: DollarSign,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  review_request: {
    title: 'Review request',
    description: () => 'After job, sale, or paid invoice',
    Icon: Star,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  job_completed: {
    title: 'Job completed',
    description: () => 'When a job is marked complete',
    Icon: CheckCircle2,
    color: 'text-green-700',
    bg: 'bg-green-50',
  },
  daily_sales_summary: {
    title: 'Daily sales summary',
    description: (config = {}) => (config.summaryPeriod === 'today' ? "Today's sales" : "Yesterday's sales"),
    Icon: ClipboardList,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  task_assigned_staff: {
    title: 'Task assigned',
    description: () => 'When a task is assigned',
    Icon: ClipboardList,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  lead_assigned_staff: {
    title: 'Lead assigned',
    description: () => 'When a lead is assigned',
    Icon: UserPlus,
    color: 'text-pink-700',
    bg: 'bg-pink-50',
  },
};

const actionMetaByType = {
  create_task: { label: 'Create task', Icon: ClipboardList, color: 'text-blue-700', bg: 'bg-blue-50' },
  send_email_platform: { label: 'Email', Icon: Mail, color: 'text-purple-700', bg: 'bg-purple-50' },
  send_sms: { label: 'SMS', Icon: MessageSquare, color: 'text-slate-700', bg: 'bg-slate-100' },
  send_whatsapp: { label: 'WhatsApp', Icon: Send, color: 'text-green-700', bg: 'bg-green-50' },
};

const AUTOMATION_CREATION_STEPS = [
  { key: 'trigger', label: 'Trigger', helper: 'When this happens' },
  { key: 'conditions', label: 'Conditions', helper: 'Optional filters' },
  { key: 'actions', label: 'Actions', helper: 'What should happen' },
  { key: 'review', label: 'Review', helper: 'Confirm and activate' },
];

const TRIGGER_CARD_DETAILS = {
  invoice_due_in_days: {
    category: 'Finance',
    title: 'Invoice due',
    description: 'When an invoice is approaching due date',
    tag: 'Popular',
    Icon: Clock3,
    bg: 'bg-emerald-50',
    color: 'text-emerald-700',
  },
  invoice_overdue: {
    category: 'Finance',
    title: 'Invoice overdue',
    description: 'When an invoice becomes overdue',
    tag: 'Popular',
    Icon: Clock3,
    bg: 'bg-emerald-50',
    color: 'text-emerald-700',
  },
  low_stock_detected: {
    category: 'Inventory',
    title: 'Low stock',
    description: 'When stock falls below reorder level',
    tag: 'Popular',
    Icon: Package,
    bg: 'bg-orange-50',
    color: 'text-orange-700',
  },
  quote_no_response: {
    category: 'Sales & CRM',
    title: 'Quote no response',
    description: 'When a quote has no response',
    tag: 'Popular',
    Icon: ClipboardList,
    bg: 'bg-blue-50',
    color: 'text-blue-700',
  },
  customer_inactive_days: {
    category: 'Sales & CRM',
    title: 'Inactive customer',
    description: 'When a customer has been inactive',
    tag: 'New',
    Icon: Users,
    bg: 'bg-violet-50',
    color: 'text-violet-700',
  },
  customer_birthday: {
    category: 'Marketing',
    title: 'Customer birthday',
    description: 'On a customer birthday',
    tag: 'Popular',
    Icon: Gift,
    bg: 'bg-pink-50',
    color: 'text-pink-700',
  },
  payment_received: {
    category: 'Finance',
    title: 'Payment received',
    description: 'When a payment is recorded on an invoice',
    tag: 'Popular',
    Icon: DollarSign,
    bg: 'bg-emerald-50',
    color: 'text-emerald-700',
  },
  review_request: {
    category: 'Sales & CRM',
    title: 'Review request',
    description: 'After a job, sale, or standalone paid invoice',
    tag: 'Popular',
    Icon: Star,
    bg: 'bg-amber-50',
    color: 'text-amber-700',
  },
  job_completed: {
    category: 'General',
    title: 'Job completed',
    description: 'When a job or service is completed',
    tag: 'New',
    Icon: CheckCircle2,
    bg: 'bg-green-50',
    color: 'text-green-700',
  },
  job_created: {
    category: 'General',
    title: 'Job created',
    description: 'When a new job is created',
    tag: 'New',
    Icon: ClipboardList,
    bg: 'bg-blue-50',
    color: 'text-blue-700',
  },
  daily_sales_summary: {
    category: 'Finance',
    title: 'Daily sales summary',
    description: 'Scheduled daily recap of sales activity',
    tag: 'New',
    Icon: ClipboardList,
    bg: 'bg-blue-50',
    color: 'text-blue-700',
  },
  new_lead: {
    category: 'Sales & CRM',
    title: 'New lead',
    description: 'When a new lead is created',
    tag: 'New',
    Icon: Mail,
    bg: 'bg-pink-50',
    color: 'text-pink-700',
  },
  high_value_invoice: {
    category: 'Finance',
    title: 'High value invoice',
    description: 'When invoice is above a set amount',
    tag: 'New',
    Icon: DollarSign,
    bg: 'bg-amber-50',
    color: 'text-amber-700',
  },
  customer_created: {
    category: 'Sales & CRM',
    title: 'New customer',
    description: 'When a new customer is added',
    tag: 'New',
    Icon: Users,
    bg: 'bg-violet-50',
    color: 'text-violet-700',
  },
  lead_no_contact_days: {
    category: 'Sales & CRM',
    title: 'Lead no contact',
    description: 'When a lead has had no contact',
    tag: 'New',
    Icon: Mail,
    bg: 'bg-pink-50',
    color: 'text-pink-700',
  },
  invoice_sent: {
    category: 'Finance',
    title: 'Invoice sent',
    description: 'When an invoice is sent to a customer',
    tag: 'New',
    Icon: FileText,
    bg: 'bg-emerald-50',
    color: 'text-emerald-700',
  },
  sale_completed: {
    category: 'Finance',
    title: 'Sale completed',
    description: 'Sale receipt / order confirmation',
    tag: 'New',
    Icon: DollarSign,
    bg: 'bg-emerald-50',
    color: 'text-emerald-700',
  },
  order_created: {
    category: 'Sales & CRM',
    title: 'Order created',
    description: 'Customer alert with order tracking link',
    tag: 'New',
    Icon: Package,
    bg: 'bg-orange-50',
    color: 'text-orange-700',
  },
  low_stock_on_change: {
    category: 'Inventory',
    title: 'Low stock (real-time)',
    description: 'When stock drops to reorder level',
    tag: 'New',
    Icon: Package,
    bg: 'bg-orange-50',
    color: 'text-orange-700',
  },
  out_of_stock_detected: {
    category: 'Inventory',
    title: 'Out of stock (real-time)',
    description: 'When a product goes out of stock',
    tag: 'New',
    Icon: Package,
    bg: 'bg-red-50',
    color: 'text-red-700',
  },
  quote_sent: {
    category: 'Sales & CRM',
    title: 'Quote sent',
    description: 'When a quote is emailed to a customer',
    tag: 'New',
    Icon: ClipboardList,
    bg: 'bg-blue-50',
    color: 'text-blue-700',
  },
  job_due_in_hours: {
    category: 'General',
    title: 'Job due soon',
    description: 'Staff reminder before job due date',
    tag: 'New',
    Icon: Clock3,
    bg: 'bg-green-50',
    color: 'text-green-700',
  },
  prescription_refill_due: {
    category: 'General',
    title: 'Prescription refill',
    description: 'Pharmacy refill reminder',
    tag: 'New',
    Icon: Gift,
    bg: 'bg-violet-50',
    color: 'text-violet-700',
  },
  low_profit_margin: {
    category: 'Finance',
    title: 'Low profit margin',
    description: 'When a sale margin is too low',
    tag: 'New',
    Icon: AlertTriangle,
    bg: 'bg-red-50',
    color: 'text-red-700',
  },
};

const EXTRA_TRIGGER_CARDS = [];

const CONDITION_OPERATOR_OPTIONS = [
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'equal_to', label: 'Equal to' },
];

const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const INVOICE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

const BIRTHDAY_MATCH_OPTIONS = [
  { value: 'today', label: 'Birthday is today' },
  { value: 'this_month', label: 'Birthday is this month' },
];

const INVOICE_TRIGGER_TYPES = ['invoice_due_in_days', 'invoice_overdue', 'payment_received'];
const REVIEW_TRIGGER_TYPES = ['review_request'];
const JOB_TRIGGER_TYPES = ['job_completed', 'job_created', 'order_created'];
const CUSTOMER_TRIGGER_TYPES = ['customer_inactive_days', 'customer_birthday'];
const PRODUCT_TRIGGER_TYPES = ['low_stock_detected'];

const CONDITION_GROUPS = [
  {
    key: 'invoice',
    label: 'Invoice',
    Icon: FileText,
    rows: [
      { key: 'invoiceAmount', label: 'Invoice amount', control: 'numberComparison', operatorKey: 'invoiceAmountOperator', valueKey: 'invoiceAmountValue', placeholder: 'GHC 0.00', triggerTypes: INVOICE_TRIGGER_TYPES },
      { key: 'balanceDue', label: 'Balance due', control: 'numberComparison', operatorKey: 'balanceDueOperator', valueKey: 'balanceDueValue', placeholder: 'GHC 0.00', triggerTypes: INVOICE_TRIGGER_TYPES },
      { key: 'invoiceStatus', label: 'Invoice status', control: 'select', valueKey: 'invoiceStatus', options: INVOICE_STATUS_OPTIONS, triggerTypes: INVOICE_TRIGGER_TYPES },
      { key: 'overdueDays', label: 'Overdue days', control: 'numberComparison', operatorKey: 'overdueDaysOperator', valueKey: 'overdueDaysValue', placeholder: 'Days', triggerTypes: INVOICE_TRIGGER_TYPES },
      { key: 'hasOverdueInvoices', label: 'Has overdue invoices', control: 'yesNo', valueKey: 'hasOverdueInvoices', triggerTypes: INVOICE_TRIGGER_TYPES },
    ],
  },
  {
    key: 'customer',
    label: 'Customer',
    Icon: Users,
    rows: [
      { key: 'customerHasPhone', label: 'Customer has phone', control: 'yesNo', valueKey: 'customerHasPhone', triggerTypes: [...INVOICE_TRIGGER_TYPES, ...CUSTOMER_TRIGGER_TYPES, ...REVIEW_TRIGGER_TYPES, ...JOB_TRIGGER_TYPES, 'quote_no_response'] },
      { key: 'customerHasEmail', label: 'Customer has email', control: 'yesNo', valueKey: 'customerHasEmail', triggerTypes: [...INVOICE_TRIGGER_TYPES, ...CUSTOMER_TRIGGER_TYPES, ...REVIEW_TRIGGER_TYPES, ...JOB_TRIGGER_TYPES, 'quote_no_response'] },
      { key: 'whatsappConsent', label: 'WhatsApp consent', control: 'yesNo', valueKey: 'whatsappConsent', triggerTypes: [...INVOICE_TRIGGER_TYPES, ...CUSTOMER_TRIGGER_TYPES, ...REVIEW_TRIGGER_TYPES, ...JOB_TRIGGER_TYPES, 'quote_no_response'] },
      { key: 'smsConsent', label: 'SMS consent', control: 'yesNo', valueKey: 'smsConsent', triggerTypes: [...INVOICE_TRIGGER_TYPES, ...CUSTOMER_TRIGGER_TYPES, ...REVIEW_TRIGGER_TYPES, ...JOB_TRIGGER_TYPES, 'quote_no_response'] },
      { key: 'marketingConsent', label: 'Marketing consent', control: 'yesNo', valueKey: 'marketingConsent', triggerTypes: [...INVOICE_TRIGGER_TYPES, ...CUSTOMER_TRIGGER_TYPES, ...REVIEW_TRIGGER_TYPES, ...JOB_TRIGGER_TYPES, 'quote_no_response'] },
      { key: 'lastPurchaseOlderThanDays', label: 'Last purchase older than', control: 'number', valueKey: 'lastPurchaseOlderThanDays', suffix: 'days', triggerTypes: CUSTOMER_TRIGGER_TYPES },
      { key: 'totalSpend', label: 'Total spend', control: 'numberComparison', operatorKey: 'totalSpendOperator', valueKey: 'totalSpendValue', placeholder: 'GHC 0.00', triggerTypes: CUSTOMER_TRIGGER_TYPES },
      { key: 'birthdayMatch', label: 'Birthday', control: 'select', valueKey: 'birthdayMatch', options: BIRTHDAY_MATCH_OPTIONS, triggerTypes: CUSTOMER_TRIGGER_TYPES },
    ],
  },
  {
    key: 'payment',
    label: 'Payment',
    Icon: DollarSign,
    rows: [
      { key: 'paymentStatus', label: 'Invoice payment status', control: 'select', valueKey: 'paymentStatus', options: PAYMENT_STATUS_OPTIONS, triggerTypes: INVOICE_TRIGGER_TYPES },
      { key: 'invoiceAmount', label: 'Payment amount', control: 'numberComparison', operatorKey: 'invoiceAmountOperator', valueKey: 'invoiceAmountValue', placeholder: 'GHC 0.00', triggerTypes: ['payment_received'] },
    ],
  },
  {
    key: 'date',
    label: 'Date & time',
    Icon: Calendar,
    rows: [
      { key: 'weekdaysOnly', label: 'Only run on weekdays', control: 'toggle', valueKey: 'weekdaysOnly' },
      { key: 'runAfterTime', label: 'Earliest run time', control: 'time', valueKey: 'runAfterTime' },
      { key: 'runBeforeTime', label: 'Latest run time', control: 'time', valueKey: 'runBeforeTime' },
    ],
  },
  {
    key: 'location',
    label: 'Location',
    Icon: MapPin,
    rows: [],
    emptyMessage: 'Location filters will be available when triggers include branch or location context.',
  },
  {
    key: 'product',
    label: 'Product / Item',
    Icon: Package,
    rows: [
      { key: 'stockBelowReorderLevel', label: 'Stock below reorder level', control: 'toggle', valueKey: 'stockBelowReorderLevel', triggerTypes: PRODUCT_TRIGGER_TYPES },
      { key: 'quantity', label: 'Quantity on hand', control: 'numberComparison', operatorKey: 'quantityOperator', valueKey: 'quantityValue', placeholder: 'Quantity', triggerTypes: PRODUCT_TRIGGER_TYPES, allowedOperators: ['less_than'] },
    ],
    emptyMessage: 'Product and item filters are available when the trigger is Low stock.',
  },
  {
    key: 'other',
    label: 'Other',
    Icon: SlidersHorizontal,
    rows: [],
    emptyMessage: 'Additional filters will be added as new trigger contexts become available.',
  },
];

function getVisibleConditionGroups(triggerType) {
  return CONDITION_GROUPS.map((group) => ({
    ...group,
    rows: group.rows.filter((row) => !row.triggerTypes || row.triggerTypes.includes(triggerType)),
  }));
}

function isConditionRowEnabled(form = {}, row) {
  if (row.control === 'toggle') return form[row.valueKey] === true;
  if (row.control === 'numberComparison') return form[row.valueKey] !== '' && form[row.valueKey] != null;
  return form[row.valueKey] !== '' && form[row.valueKey] != null && form[row.valueKey] !== false;
}

function defaultConditionPatch(row) {
  if (row.control === 'toggle') return { [row.valueKey]: true };
  if (row.control === 'yesNo') return { [row.valueKey]: 'yes' };
  if (row.control === 'select') return { [row.valueKey]: row.options?.[0]?.value || '' };
  if (row.control === 'numberComparison') return { [row.operatorKey]: row.allowedOperators?.[0] || (row.operatorKey?.includes('quantity') ? 'less_than' : 'greater_than'), [row.valueKey]: '0' };
  if (row.control === 'number') return { [row.valueKey]: '1' };
  if (row.control === 'time') return { [row.valueKey]: row.key === 'runBeforeTime' ? '17:00' : '09:00' };
  return {};
}

function clearConditionPatch(row) {
  const patch = { [row.valueKey]: row.control === 'toggle' ? false : '' };
  if (row.operatorKey) patch[row.operatorKey] = row.allowedOperators?.[0] || (row.operatorKey.includes('quantity') ? 'less_than' : 'greater_than');
  return patch;
}

function conditionOperatorLabel(operator) {
  return CONDITION_OPERATOR_OPTIONS.find((option) => option.value === operator)?.label?.toLowerCase() || 'greater than';
}

function yesNoLabel(value) {
  return value === 'yes' ? 'yes' : value === 'no' ? 'no' : '';
}

function renderConditionControl(row, conditionForm, patchConditionForm) {
  if (row.control === 'numberComparison') {
    const operatorOptions = row.allowedOperators
      ? CONDITION_OPERATOR_OPTIONS.filter((option) => row.allowedOperators.includes(option.value))
      : CONDITION_OPERATOR_OPTIONS;
    const selectedOperator = operatorOptions.some((option) => option.value === conditionForm[row.operatorKey])
      ? conditionForm[row.operatorKey]
      : defaultConditionPatch(row)[row.operatorKey];
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        {operatorOptions.length === 1 ? (
          <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-slate-700">
            {operatorOptions[0].label}
          </div>
        ) : (
          <Select value={selectedOperator} onValueChange={(value) => patchConditionForm({ [row.operatorKey]: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operatorOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          type="number"
          min={row.min ?? 0}
          step="0.01"
          value={conditionForm[row.valueKey] || ''}
          onChange={(e) => patchConditionForm({ [row.operatorKey]: selectedOperator, [row.valueKey]: e.target.value })}
          placeholder={row.placeholder}
        />
      </div>
    );
  }
  if (row.control === 'number') {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="1"
          value={conditionForm[row.valueKey] || ''}
          onChange={(e) => patchConditionForm({ [row.valueKey]: e.target.value })}
          placeholder={row.placeholder || 'Optional'}
        />
        {row.suffix ? <span className="text-xs text-slate-500">{row.suffix}</span> : null}
      </div>
    );
  }
  if (row.control === 'select' || row.control === 'yesNo') {
    const options = row.control === 'yesNo' ? YES_NO_OPTIONS : row.options || [];
    return (
      <Select value={conditionForm[row.valueKey] || ''} onValueChange={(value) => patchConditionForm({ [row.valueKey]: value })}>
        <SelectTrigger>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (row.control === 'time') {
    return (
      <Input
        type="time"
        value={conditionForm[row.valueKey] || ''}
        onChange={(e) => patchConditionForm({ [row.valueKey]: e.target.value })}
      />
    );
  }
  if (row.control === 'toggle') {
    return (
      <Switch
        checked={conditionForm[row.valueKey] === true}
        onCheckedChange={(checked) => patchConditionForm({ [row.valueKey]: checked === true })}
      />
    );
  }
  return null;
}

function getRuleStatus(rule) {
  if (!rule?.enabled) return 'paused';
  if (rule?.lastRun?.status === 'failed' || rule?.derivedStatus === 'failed') return 'failed';
  return 'active';
}

function getRuleActions(rule) {
  return Array.isArray(rule?.actionConfig?.actions) ? rule.actionConfig.actions : [];
}

function getRuleDescription(rule) {
  if (rule?.metadata?.description) return rule.metadata.description;
  const actions = getRuleActions(rule);
  const primaryAction = actions[0]?.type ? actionMetaByType[actions[0].type]?.label?.toLowerCase() : 'workflow';
  return `Runs ${primaryAction || 'workflow'} when ${triggerLabel(rule?.triggerType).toLowerCase()}.`;
}

function getRuleAiSource(rule) {
  const metadata = rule?.metadata || {};
  const source = String(metadata.source || metadata.createdFrom || metadata.origin || '').toLowerCase();
  const builder = String(metadata.builder || metadata.generator || metadata.createdByType || '').toLowerCase();
  if (
    metadata.aiDraft ||
    metadata.aiGenerated ||
    metadata.generatedByAi ||
    source.includes('ai') ||
    builder.includes('ai')
  ) {
    return 'AI generated';
  }
  return 'Rule';
}

function isAiBuilderDraft(rule) {
  const metadata = rule?.metadata || {};
  return Boolean(
    metadata.aiDraft ||
    metadata.isDraft ||
    metadata.draft ||
    String(metadata.status || '').toLowerCase() === 'draft'
  );
}

function logsDateRangeParams(dateRange) {
  const now = new Date();
  if (dateRange === 'today') return { from: startOfToday().toISOString() };
  if (dateRange === '7d') {
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    return { from: date.toISOString() };
  }
  if (dateRange === '30d') {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return { from: date.toISOString() };
  }
  return {};
}

function mapApiLogEntry(entry) {
  const channel = entry?.channel || 'automation';
  const status =
    entry?.level === 'error'
      ? 'failed'
      : entry?.level === 'warning'
        ? 'skipped'
        : entry?.level === 'success'
          ? 'success'
          : 'info';
  return {
    id: entry.id,
    source: entry.whatsappEventId ? 'WhatsAppMessageEvent' : 'AutomationRun',
    relatedExecutionId: entry.runId || '',
    raw: entry.metadata,
    time: entry.time,
    level: entry.level,
    status,
    ruleId: entry.ruleId,
    ruleName: entry.ruleName || 'Automation',
    trigger: triggerLabel(entry?.metadata?.triggerContext?.triggerType || entry?.metadata?.triggerType || ''),
    message: entry.message || 'Automation log entry',
    channel,
    channels: [channel],
    durationMs: null,
    durationLabel: '-',
    logData: entry.metadata || {},
  };
}

function getAiBuilderStatus(rule) {
  if (isAiBuilderDraft(rule)) return 'draft';
  if (rule?.status === 'failed' || rule?.derivedStatus === 'failed' || rule?.lastRun?.status === 'failed') return 'failed';
  return rule?.enabled ? 'active' : 'inactive';
}

function getAiBuilderAccent(accent) {
  const classes = {
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    purple: 'border-violet-100 bg-violet-50 text-violet-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
  };
  return classes[accent] || classes.green;
}

function getTriggerDisplay(rule) {
  const meta = triggerMetaByType[rule?.triggerType];
  return {
    title: meta?.title || triggerLabel(rule?.triggerType),
    description: meta?.description ? meta.description(rule?.triggerConfig || {}) : 'When conditions match',
    Icon: meta?.Icon || Zap,
    color: meta?.color || 'text-slate-700',
    bg: meta?.bg || 'bg-slate-100',
  };
}

function getChannelDisplay(rule) {
  const actions = getRuleActions(rule);
  const firstAction = actions.find((action) => actionMetaByType[action?.type]) || actions[0];
  const meta = actionMetaByType[firstAction?.type] || actionMetaByType.create_task;
  return meta;
}

function humanizeKey(key) {
  return String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isPresentDetailValue(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return value !== false;
}

function formatDetailValue(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (Array.isArray(value)) return value.map(formatDetailValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function detailRowsFromObject(source = {}, excludedKeys = []) {
  const excluded = new Set(excludedKeys);
  return Object.entries(source)
    .filter(([key, value]) => !excluded.has(key) && isPresentDetailValue(value))
    .map(([key, value]) => ({ label: humanizeKey(key), value: formatDetailValue(value) }));
}

function getConditionDetailRows(rule) {
  return detailRowsFromObject(rule?.conditionConfig || {});
}

function getSourceMetadataRows(rule) {
  const metadata = rule?.metadata || {};
  return [
    metadata.templateName ? { label: 'Template', value: metadata.templateName } : null,
    metadata.templateId ? { label: 'Template ID', value: metadata.templateId } : null,
    metadata.source ? { label: 'Source', value: humanizeKey(metadata.source) } : null,
    metadata.createdFrom ? { label: 'Created from', value: humanizeKey(metadata.createdFrom) } : null,
    metadata.prompt ? { label: 'AI prompt', value: metadata.prompt } : null,
  ].filter(Boolean);
}

function getSuccessRate(rule, runsByRuleId) {
  const ruleRuns = runsByRuleId.get(rule?.id) || [];
  if (!ruleRuns.length) {
    return rule?.lastRun?.status === 'failed' ? 0 : null;
  }
  const successful = ruleRuns.filter((run) => run.status !== 'failed').length;
  return Math.round((successful / ruleRuns.length) * 100);
}

function formatDateTime(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day = isToday ? 'Today' : date.toDateString() === yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString();
  return `${day}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatRunOutcome(run) {
  if (!run) return 'No runs yet';
  if (run.status === 'failed') return 'Failed';
  if (run.status === 'skipped') return 'Skipped';
  return 'Completed';
}

const TAB_ITEMS = [
  { value: 'overview', label: 'Overview' },
  { value: 'rules', label: 'Rules' },
  { value: 'templates', label: 'Templates' },
  { value: 'history', label: 'History' },
  { value: 'logs', label: 'Logs' },
  { value: 'ai-builder', label: 'AI Builder' },
];

const TEMPLATE_CHANNEL_OPTIONS = [
  { value: 'all', label: 'All channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'task', label: 'Task' },
];

const TEMPLATE_DIFFICULTY_OPTIONS = [
  { value: 'all', label: 'All difficulty levels' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'advanced', label: 'Advanced' },
];

const TEMPLATE_SORT_OPTIONS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'name', label: 'A-Z' },
  { value: 'difficulty', label: 'Difficulty' },
];

const TEMPLATE_METADATA = {
  invoice_due_reminder: {
    category: 'finance_payments',
    title: 'Invoice due soon',
    description: 'Notify customers a few days before an invoice is due.',
    Icon: FileText,
    accent: 'amber',
    channels: ['email'],
    difficulty: 'easy',
  },
  overdue_invoice_reminder: {
    category: 'finance_payments',
    title: 'Invoice overdue reminder',
    description: 'Send payment reminders when invoices are overdue.',
    Icon: MessageSquare,
    accent: 'green',
    channels: ['whatsapp'],
    difficulty: 'easy',
    popular: true,
  },
  quote_follow_up: {
    category: 'sales_crm',
    title: 'Quote follow-up',
    description: 'Follow up when a quote has no response.',
    Icon: MessageSquare,
    accent: 'purple',
    channels: ['email'],
    difficulty: 'easy',
    popular: true,
  },
  low_stock_alert: {
    category: 'inventory_stock',
    title: 'Low stock alert',
    description: 'Create a task and email staff when stock reaches the reorder level.',
    Icon: Package,
    accent: 'amber',
    channels: ['email', 'task'],
    difficulty: 'easy',
    audience: 'internal',
  },
  win_back_campaign: {
    category: 'marketing',
    title: 'Win-back inactive customers',
    description: 'Reach out to inactive customers with a friendly message.',
    Icon: Mail,
    accent: 'purple',
    channels: ['email'],
    difficulty: 'medium',
  },
  birthday_greeting: {
    category: 'customer_communication',
    title: 'Birthday greeting',
    description: 'Send birthday wishes to your customers.',
    Icon: Gift,
    accent: 'pink',
    channels: ['whatsapp'],
    difficulty: 'easy',
    popular: true,
  },
  payment_received_thank_you: {
    category: 'finance_payments',
    title: 'Payment received thank you',
    description: 'Send a thank you message when a payment is recorded.',
    Icon: DollarSign,
    accent: 'green',
    channels: ['whatsapp', 'email'],
    difficulty: 'medium',
  },
  job_completed_notification: {
    category: 'operations',
    title: 'Job completed notification',
    description: 'Notify customers when a job is completed.',
    Icon: CheckCircle2,
    accent: 'green',
    channels: ['whatsapp', 'email'],
    difficulty: 'medium',
  },
  daily_sales_summary: {
    category: 'operations',
    title: 'Daily sales summary',
    description: 'Send owners and managers a daily recap of sales activity.',
    Icon: ClipboardList,
    accent: 'blue',
    channels: ['email', 'task'],
    difficulty: 'advanced',
    audience: 'internal',
  },
  review_request: {
    category: 'sales_crm',
    title: 'Review request',
    description: 'Ask customers for reviews after a successful service or sale.',
    Icon: Star,
    accent: 'amber',
    channels: ['whatsapp', 'email'],
    difficulty: 'medium',
    popular: true,
  },
  low_profit_margin_alert: {
    category: 'finance_payments',
    title: 'Low profit margin alert',
    description: 'Create an internal alert when a sale margin is too low.',
    Icon: AlertTriangle,
    accent: 'red',
    channels: ['task'],
    difficulty: 'advanced',
  },
  new_lead_notification: {
    category: 'sales_crm',
    title: 'New lead notification',
    description: 'Notify the team when a new lead is created (staff email, not the lead).',
    Icon: Mail,
    accent: 'pink',
    channels: ['email', 'task'],
    difficulty: 'easy',
    audience: 'internal',
  },
  new_lead_staff: {
    category: 'sales_crm',
    title: 'New lead — staff alert',
    description: 'Email staff about a new lead without messaging the lead.',
    Icon: Users,
    accent: 'pink',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  high_value_invoice_alert: {
    category: 'finance_payments',
    title: 'High value invoice alert',
    description: 'Alert managers when an invoice exceeds a threshold.',
    Icon: DollarSign,
    accent: 'amber',
    channels: ['email', 'task'],
    difficulty: 'medium',
    audience: 'internal',
  },
  job_assigned_staff: {
    category: 'operations',
    title: 'Job assigned — staff',
    description: 'Notify the assignee when a job is assigned or reassigned.',
    Icon: UserPlus,
    accent: 'blue',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  payment_received_staff: {
    category: 'finance_payments',
    title: 'Payment received — staff',
    description: 'Notify owners and managers when a payment is recorded.',
    Icon: DollarSign,
    accent: 'green',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  invoice_paid_staff: {
    category: 'finance_payments',
    title: 'Invoice paid — staff',
    description: 'Notify staff when an invoice is fully paid.',
    Icon: CheckCircle2,
    accent: 'green',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  invoice_overdue_staff: {
    category: 'finance_payments',
    title: 'Invoice overdue — staff',
    description: 'Notify staff when an invoice becomes overdue.',
    Icon: AlertTriangle,
    accent: 'amber',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  order_created_staff: {
    category: 'operations',
    title: 'Order created — staff',
    description: 'Notify kitchen managers and staff when an order is created.',
    Icon: Bell,
    accent: 'blue',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  order_status_staff: {
    category: 'operations',
    title: 'Order status — staff',
    description: 'Notify staff when kitchen order status changes.',
    Icon: Activity,
    accent: 'blue',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  quote_accepted_staff: {
    category: 'sales_crm',
    title: 'Quote accepted — staff',
    description: 'Notify the team when a customer accepts a quote.',
    Icon: CheckCircle2,
    accent: 'green',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  job_created_staff: {
    category: 'operations',
    title: 'Job created — staff',
    description: 'Notify managers when a new job is created.',
    Icon: ClipboardList,
    accent: 'blue',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  job_completed_staff: {
    category: 'operations',
    title: 'Job completed — staff',
    description: 'Notify managers when a job is completed.',
    Icon: CheckCircle2,
    accent: 'green',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  sale_completed_staff: {
    category: 'operations',
    title: 'Sale completed — staff',
    description: 'Optionally notify managers when a sale is completed.',
    Icon: DollarSign,
    accent: 'blue',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  lead_assigned_staff: {
    category: 'sales_crm',
    title: 'Lead assigned — staff',
    description: 'Notify the assignee when a lead is assigned.',
    Icon: UserPlus,
    accent: 'pink',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  task_assigned_staff: {
    category: 'operations',
    title: 'Task assigned — staff',
    description: 'Notify assignees when a workspace task is assigned to them.',
    Icon: ClipboardList,
    accent: 'blue',
    channels: ['email'],
    difficulty: 'easy',
    audience: 'internal',
  },
  customer_created_welcome: {
    category: 'sales_crm',
    title: 'New customer welcome',
    description: 'Welcome new customers by email or SMS.',
    Icon: Users,
    accent: 'purple',
    channels: ['email', 'sms'],
    difficulty: 'easy',
  },
  lead_no_contact_follow_up: {
    category: 'sales_crm',
    title: 'Lead follow-up',
    description: 'Follow up when a lead has had no contact.',
    Icon: Mail,
    accent: 'pink',
    channels: ['email', 'task'],
    difficulty: 'medium',
  },
  invoice_sent_notification: {
    category: 'finance_payments',
    title: 'Invoice sent',
    description: 'Notify customers when an invoice is sent.',
    Icon: FileText,
    accent: 'green',
    channels: ['whatsapp', 'email'],
    difficulty: 'medium',
  },
  sale_completed_receipt: {
    category: 'finance_payments',
    title: 'Sale receipt',
    description: 'Order confirmation when a sale is completed.',
    Icon: DollarSign,
    accent: 'green',
    channels: ['whatsapp', 'email'],
    difficulty: 'medium',
  },
  order_created_notification: {
    category: 'sales_crm',
    title: 'Order created tracking',
    description: 'SMS/email customers a tracking link when an order is created.',
    Icon: Package,
    accent: 'orange',
    channels: ['sms', 'email'],
    difficulty: 'easy',
  },
  low_stock_on_change: {
    category: 'operations',
    title: 'Low stock (real-time)',
    description: 'Email staff when stock drops after a sale or adjustment.',
    Icon: Package,
    accent: 'amber',
    channels: ['email', 'task'],
    difficulty: 'medium',
    audience: 'internal',
  },
  out_of_stock_alert: {
    category: 'operations',
    title: 'Out of stock (real-time)',
    description: 'Alert staff when a product goes out of stock.',
    Icon: Package,
    accent: 'red',
    channels: ['email', 'task', 'whatsapp'],
    difficulty: 'medium',
    audience: 'internal',
  },
  quote_sent_notification: {
    category: 'sales_crm',
    title: 'Quote sent',
    description: 'Notify customers when a quote is sent.',
    Icon: ClipboardList,
    accent: 'blue',
    channels: ['whatsapp', 'email'],
    difficulty: 'medium',
  },
  job_due_reminder: {
    category: 'operations',
    title: 'Job due soon',
    description: 'Remind the assigned team member before a job is due.',
    Icon: Clock3,
    accent: 'green',
    channels: ['task', 'email'],
    difficulty: 'medium',
    audience: 'internal',
  },
  prescription_refill_reminder: {
    category: 'operations',
    title: 'Prescription refill due',
    description: 'Pharmacy refill reminders for customers.',
    Icon: Gift,
    accent: 'purple',
    channels: ['sms', 'email'],
    difficulty: 'advanced',
  },
};

const TEMPLATE_ACCENT_CLASSES = {
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  pink: 'bg-pink-50 text-pink-700 border-pink-100',
  purple: 'bg-violet-50 text-violet-700 border-violet-100',
  red: 'bg-red-50 text-red-700 border-red-100',
};

const TEMPLATE_DIFFICULTY_RANK = { easy: 1, medium: 2, advanced: 3 };

const SUCCESS_STATUSES = new Set(['success', 'succeeded', 'completed', 'delivered', 'sent']);
const FAILURE_STATUSES = new Set(['failed', 'failure', 'error', 'errored']);

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= startOfToday();
}

function statusIsSuccessful(status) {
  return SUCCESS_STATUSES.has(String(status || '').toLowerCase());
}

function statusIsFailed(status) {
  return FAILURE_STATUSES.has(String(status || '').toLowerCase());
}

function statusIsPending(status) {
  return ['pending', 'processing', 'sending', 'ready', 'skipped'].includes(String(status || '').toLowerCase());
}

function normalizeRunStatus(status) {
  if (statusIsSuccessful(status)) return 'success';
  if (statusIsFailed(status)) return 'failed';
  if (statusIsPending(status)) return 'pending';
  return String(status || 'pending').toLowerCase();
}

function getRunActions(run) {
  return Array.isArray(run?.resultSummary?.results) ? run.resultSummary.results : [];
}

function getRunDurationMs(run) {
  if (Number.isFinite(Number(run?.durationMs))) return Number(run.durationMs);
  if (Number.isFinite(Number(run?.resultSummary?.durationMs))) return Number(run.resultSummary.durationMs);
  const startedAt = run?.startedAt ? new Date(run.startedAt).getTime() : null;
  const finishedAt = run?.finishedAt ? new Date(run.finishedAt).getTime() : null;
  if (!startedAt || !finishedAt || Number.isNaN(startedAt) || Number.isNaN(finishedAt)) return null;
  return Math.max(0, finishedAt - startedAt);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function formatTime(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const CHANNEL_COLUMN_LABELS = {
  sms: 'SMS',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

/**
 * Compact cell for one channel attempt in the delivery matrix.
 */
function DeliveryChannelCell({ cell }) {
  if (!cell) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const statusLabel = cell.success ? 'Sent' : 'Failed';
  const statusClass = cell.success ? 'text-emerald-700' : 'text-red-600';
  const waBadge =
    cell.whatsappStatus === 'read' || cell.whatsappStatus === 'delivered'
      ? cell.whatsappStatus
      : null;

  return (
    <div className="space-y-0.5">
      <p className={`text-xs font-medium ${statusClass}`}>
        {statusLabel}
        {cell.sentAt ? <span className="font-normal text-muted-foreground"> · {formatTime(cell.sentAt)}</span> : null}
      </p>
      {cell.maskedAddress ? (
        <p className="text-[11px] text-muted-foreground">{cell.maskedAddress}</p>
      ) : null}
      {cell.error ? <p className="line-clamp-2 text-[11px] text-red-600">{cell.error}</p> : null}
      {waBadge ? (
        <span className="inline-flex rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-emerald-700">
          {waBadge}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Expandable delivery detail: who received what on which channel.
 */
function DeliveryDetailPanel({ run, waStatusByMessageId, className = '' }) {
  const rows = useMemo(
    () => buildDeliveryMatrix(run, { waStatusByMessageId }),
    [run, waStatusByMessageId]
  );

  if (!rows.length) {
    return (
      <div className={`rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground ${className}`}>
        No messaging delivery details for this run.
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-lg border border-border bg-white ${className}`}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="min-w-[140px]">Recipient</TableHead>
            {CHANNEL_ORDER.map((channel) => (
              <TableHead key={channel} className="min-w-[120px]">
                {CHANNEL_COLUMN_LABELS[channel]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                <p className="text-sm font-medium text-foreground">{row.recipientName}</p>
              </TableCell>
              {CHANNEL_ORDER.map((channel) => (
                <TableCell key={channel}>
                  <DeliveryChannelCell cell={row.cells[channel]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatRelativeTime(value) {
  if (!value) return 'Not run yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not run yet';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function actionLabel(action) {
  const type = action?.type || action?.actionType || 'action';
  if (type === 'send_whatsapp') return 'WhatsApp';
  if (type === 'send_email_platform') return 'Email';
  if (type === 'send_sms') return 'SMS';
  if (type === 'create_task') return 'Task';
  return String(type).replace(/_/g, ' ');
}

function actionChannel(action) {
  const type = action?.type || action?.actionType || '';
  if (type === 'send_whatsapp' || type === 'whatsapp') return 'whatsapp';
  if (type === 'send_email_platform' || type === 'email') return 'email';
  if (type === 'send_sms' || type === 'sms') return 'sms';
  if (type === 'create_task' || type === 'task') return 'task';
  return 'automation';
}

function channelMeta(channel) {
  if (channel === 'whatsapp') return { label: 'WhatsApp', Icon: MessageSquare, className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  if (channel === 'email') return { label: 'Email', Icon: Mail, className: 'bg-violet-50 text-violet-700 border-violet-100' };
  if (channel === 'sms') return { label: 'SMS', Icon: Send, className: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (channel === 'task') return { label: 'Task', Icon: ClipboardList, className: 'bg-amber-50 text-amber-700 border-amber-100' };
  return { label: 'Automation', Icon: Zap, className: 'bg-slate-50 text-slate-700 border-slate-100' };
}

const LOG_LEVEL_META = {
  info: { label: 'Info', className: 'bg-blue-50 text-blue-700 border-blue-100' },
  success: { label: 'Success', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  warning: { label: 'Warning', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  error: { label: 'Error', className: 'bg-red-50 text-red-700 border-red-100' },
};

function logLevelForStatus(status) {
  if (statusIsFailed(status)) return 'error';
  if (statusIsSuccessful(status)) return 'success';
  if (statusIsPending(status)) return 'warning';
  return 'info';
}

function logStatusForLevel(level) {
  if (level === 'error') return 'failed';
  if (level === 'success') return 'success';
  if (level === 'warning') return 'pending';
  return 'event';
}

function LogLevelBadge({ level }) {
  const meta = LOG_LEVEL_META[level] || LOG_LEVEL_META.info;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function buildActionMessage(action, triggerContext = {}) {
  const label = actionLabel(action);
  const recipient = triggerContext.assigneeName || triggerContext.recipientName || triggerContext.customerName || triggerContext.email || triggerContext.phone;
  if (action?.error) return `${label} failed${recipient ? ` for ${recipient}` : ''}: ${action.error}`;
  if (action?.skipped || action?.reason) {
    return `${label} skipped: ${String(action.reason || 'no recipient').replace(/_/g, ' ')}`;
  }
  if (action?.messageId) return `${label} message sent${recipient ? ` to ${recipient}` : ''}`;
  if (action?.taskId) return `Task created${recipient ? ` for ${recipient}` : ''}`;
  return `${label} action completed${recipient ? ` for ${recipient}` : ''}`;
}

function buildRunMessage(run, actionCount) {
  if (statusIsFailed(run?.status)) return run?.error || 'Rule execution failed';
  if (run?.status === 'skipped') return actionCount ? 'Rule execution skipped' : 'No matching actions were executed';
  if (statusIsSuccessful(run?.status)) return actionCount ? `Rule execution completed (${actionCount} action${actionCount === 1 ? '' : 's'})` : 'Rule execution completed';
  return 'Rule execution started';
}

function getLogDate(log) {
  const date = log?.time ? new Date(log.time) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getTemplateChannels(template) {
  const metadata = TEMPLATE_METADATA[template?.key] || {};
  if (metadata.channels?.length) return metadata.channels;
  const actions = Array.isArray(template?.actionConfig?.actions) ? template.actionConfig.actions : [];
  const channels = actions
    .map((action) => {
      if (action?.type === 'send_whatsapp') return 'whatsapp';
      if (action?.type === 'send_email_platform') return 'email';
      if (action?.type === 'send_sms') return 'sms';
      if (action?.type === 'create_task') return 'task';
      return null;
    })
    .filter(Boolean);
  return channels.length ? [...new Set(channels)] : ['task'];
}

function getTemplateCard(template) {
  const metadata = TEMPLATE_METADATA[template?.key] || {};
  return {
    ...template,
    category: metadata.category || 'operations',
    title: metadata.title || template?.name || 'Automation template',
    description: metadata.description || template?.description || triggerLabel(template?.triggerType),
    Icon: metadata.Icon || Zap,
    accent: metadata.accent || 'blue',
    channels: getTemplateChannels(template),
    difficulty: metadata.difficulty || 'medium',
    popular: Boolean(metadata.popular),
  };
}

function channelLabel(channel) {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'email') return 'Email';
  if (channel === 'sms') return 'SMS';
  if (channel === 'task') return 'Task';
  return channel;
}

function TemplateChannelIcon({ channel }) {
  const Icon = channel === 'email' ? Mail : channel === 'task' ? ClipboardList : channel === 'sms' ? Send : MessageSquare;
  const className =
    channel === 'email'
      ? 'bg-violet-50 text-violet-700'
      : channel === 'task'
        ? 'bg-blue-50 text-blue-700'
        : channel === 'sms'
          ? 'bg-sky-50 text-sky-700'
          : 'bg-emerald-50 text-emerald-700';

  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${className}`} title={channelLabel(channel)}>
      <Icon className="h-3 w-3" aria-hidden />
      <span className="sr-only">{channelLabel(channel)}</span>
    </span>
  );
}

function TemplateCard({ template, onUse }) {
  const Icon = template.Icon || Zap;
  const accentClass = TEMPLATE_ACCENT_CLASSES[template.accent] || TEMPLATE_ACCENT_CLASSES.blue;
  const unavailableLabel = template.unavailableReason || (template.disabled ? 'Not available yet.' : null);

  return (
    <div className="flex h-full min-h-[236px] flex-col rounded-2xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${accentClass}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        {template.popular && (
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">Popular</span>
        )}
      </div>
      <div className="mt-4 min-h-[76px]">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{template.title}</h3>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{template.description}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {template.channels.map((channel) => (
          <TemplateChannelIcon key={channel} channel={channel} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {triggerLabel(template.triggerType)}
      </p>
      {unavailableLabel && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{unavailableLabel}</p>
      )}
      <Button
        type="button"
        variant="outline"
        className="mt-auto w-full"
        onClick={() => onUse(template)}
        disabled={template.disabled}
      >
        {template.disabled ? 'Not available' : 'Use template'}
      </Button>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, accent = 'green' }) {
  const accentClasses = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    purple: 'bg-violet-50 text-violet-700 border-violet-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  };

  return (
    <Card style={CARD_BORDER} className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl border p-2 ${accentClasses[accent] || accentClasses.green}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold leading-none text-foreground">{value}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityGlyph({ type, status }) {
  let Icon = Activity;
  let className = 'bg-slate-50 text-slate-700 border-slate-100';

  if (statusIsFailed(status)) {
    Icon = AlertTriangle;
    className = 'bg-red-50 text-red-700 border-red-100';
  } else if (type === 'send_whatsapp' || type === 'whatsapp') {
    Icon = MessageSquare;
    className = 'bg-emerald-50 text-emerald-700 border-emerald-100';
  } else if (type === 'create_task' || type === 'task') {
    Icon = ClipboardList;
    className = 'bg-violet-50 text-violet-700 border-violet-100';
  } else if (type === 'send_email_platform' || type === 'email') {
    Icon = Mail;
    className = 'bg-pink-50 text-pink-700 border-pink-100';
  } else if (type === 'low_stock_detected' || type === 'stock') {
    Icon = Package;
    className = 'bg-amber-50 text-amber-700 border-amber-100';
  } else if (type === 'send_sms') {
    Icon = Send;
    className = 'bg-blue-50 text-blue-700 border-blue-100';
  }

  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${className}`}>
      <Icon className="h-5 w-5" aria-hidden />
    </div>
  );
}

function AutomationTriggerFields({ triggerType, value, onPatch }) {
  const tf = value || {};
  const num = (v, fallback) => (v === '' || v === undefined || v === null ? fallback : Number(v));

  switch (triggerType) {
    case 'invoice_due_in_days':
      return (
        <div className="space-y-1.5">
          <Label htmlFor="auto-days-before-due">Days before due date</Label>
          <Input
            id="auto-days-before-due"
            type="number"
            min={0}
            max={365}
            value={tf.daysBeforeDue ?? ''}
            onChange={(e) => onPatch({ daysBeforeDue: e.target.value === '' ? '' : num(e.target.value, 0) })}
          />
          <p className="text-xs text-muted-foreground">0 = on the due date; 2 = two days before.</p>
        </div>
      );
    case 'invoice_overdue':
    case 'invoice_overdue_staff':
      return (
        <div className="space-y-1.5">
          <Label htmlFor="auto-days-after-due">Days after due date</Label>
          <Input
            id="auto-days-after-due"
            type="number"
            min={0}
            max={365}
            value={tf.daysAfterDue ?? ''}
            onChange={(e) => onPatch({ daysAfterDue: e.target.value === '' ? '' : num(e.target.value, 0) })}
          />
        </div>
      );
    case 'low_stock_detected':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Threshold</Label>
            <Select
              value={tf.thresholdMode === 'fixed' ? 'fixed' : 'reorder_level'}
              onValueChange={(v) => onPatch({ thresholdMode: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THRESHOLD_MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tf.thresholdMode === 'fixed' && (
            <div className="space-y-1.5">
              <Label htmlFor="auto-fixed-threshold">Minimum quantity (alert below this)</Label>
              <Input
                id="auto-fixed-threshold"
                type="number"
                min={0}
                value={tf.fixedThreshold ?? ''}
                onChange={(e) => onPatch({ fixedThreshold: e.target.value === '' ? '' : num(e.target.value, 0) })}
              />
            </div>
          )}
        </div>
      );
    case 'quote_no_response':
      return (
        <div className="space-y-1.5">
          <Label htmlFor="auto-silent-days">Days without response</Label>
          <Input
            id="auto-silent-days"
            type="number"
            min={1}
            max={365}
            value={tf.silentDays ?? ''}
            onChange={(e) => onPatch({ silentDays: e.target.value === '' ? '' : num(e.target.value, 7) })}
          />
        </div>
      );
    case 'customer_inactive_days':
      return (
        <div className="space-y-1.5">
          <Label htmlFor="auto-inactive-days">Days since last activity</Label>
          <Input
            id="auto-inactive-days"
            type="number"
            min={1}
            max={730}
            value={tf.inactiveDays ?? ''}
            onChange={(e) => onPatch({ inactiveDays: e.target.value === '' ? '' : num(e.target.value, 30) })}
          />
        </div>
      );
    case 'customer_birthday':
      return (
        <p className="text-xs text-muted-foreground">
          Runs for active customers whose date of birth matches today.
        </p>
      );
    case 'payment_received':
      return (
        <p className="text-xs text-muted-foreground">
          Runs when a payment is recorded on an invoice (partial or full). Use Send after to space this from other messages on the same event.
        </p>
      );
    case 'review_request':
      return (
        <p className="text-xs text-muted-foreground">
          Runs when a job is marked complete, a sale is completed with a customer, or a standalone invoice is fully paid.
          Defaults to Send after 1 hour so thank-you or receipt messages can go first. Cooldown still limits how often the same customer is asked.
        </p>
      );
    case 'job_completed':
      return (
        <p className="text-xs text-muted-foreground">
          Runs when a job is marked complete. Sends a customer notification (separate from review requests).
        </p>
      );
    case 'daily_sales_summary':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Sales period</Label>
            <Select
              value={tf.summaryPeriod === 'today' ? 'today' : 'yesterday'}
              onValueChange={(v) => onPatch({ summaryPeriod: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yesterday">Yesterday&apos;s sales</SelectItem>
                <SelectItem value="today">Today&apos;s sales (so far)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Runs on the automation scheduler (default every 15 minutes). Use earliest run time in conditions to send at a specific hour.
          </p>
        </div>
      );
    default:
      return null;
  }
}

/**
 * First-class repeat frequency control for sticky (condition-while-true) triggers.
 */
function AutomationFrequencyFields({ triggerType, conditionForm, onPatch }) {
  if (!isStickyTrigger(triggerType)) return null;
  const frequency = conditionForm?.frequency || 'daily';
  const intervalDays = conditionForm?.intervalDays ?? '1';

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="space-y-1.5">
        <Label>How often should this repeat?</Label>
        <Select
          value={FREQUENCY_OPTIONS.some((o) => o.value === frequency) ? frequency : 'daily'}
          onValueChange={(value) => onPatch({ frequency: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          Keeps sending while the condition is still true (e.g. invoice unpaid).
        </p>
      </div>
      {frequency === 'every_n_days' && (
        <div className="space-y-1.5">
          <Label htmlFor="auto-interval-days">Repeat every (days)</Label>
          <Input
            id="auto-interval-days"
            type="number"
            min={1}
            max={365}
            value={intervalDays}
            onChange={(e) => onPatch({ intervalDays: e.target.value === '' ? '' : String(Math.max(1, Number(e.target.value) || 1)) })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Send after (delayMinutes) for event-driven automations — hidden for sticky/scheduler triggers.
 */
function AutomationSendAfterFields({ triggerType, conditionForm, onPatch }) {
  if (!supportsSendAfter(triggerType)) return null;

  const delayMinutesNum = Number(conditionForm?.delayMinutes);
  const delayMinutes = Number.isFinite(delayMinutesNum) && delayMinutesNum >= 0
    ? Math.floor(delayMinutesNum)
    : defaultDelayMinutesForTrigger(triggerType);
  const presetMatch = DELAY_MINUTES_PRESETS.some((p) => p.value === delayMinutes);
  const selectValue = presetMatch ? String(delayMinutes) : 'custom';

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="space-y-1.5">
        <Label>Send after</Label>
        <Select
          value={selectValue}
          onValueChange={(value) => {
            if (value === 'custom') {
              onPatch({ delayMinutes: String(delayMinutes || 15) });
              return;
            }
            onPatch({ delayMinutes: String(Number(value) || 0) });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELAY_MINUTES_PRESETS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom minutes</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          Spaces this message from other automations that fire on the same event.
        </p>
      </div>
      {selectValue === 'custom' && (
        <div className="space-y-1.5">
          <Label htmlFor="auto-delay-minutes">Delay (minutes)</Label>
          <Input
            id="auto-delay-minutes"
            type="number"
            min={0}
            max={10080}
            value={conditionForm?.delayMinutes ?? String(delayMinutes)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onPatch({ delayMinutes: '' });
                return;
              }
              onPatch({ delayMinutes: String(Math.max(0, Math.min(10080, Math.floor(Number(raw) || 0)))) });
            }}
          />
        </div>
      )}
      {triggerType === 'review_request' && (
        <p className="text-xs text-slate-500">
          Tip: If you also send a payment thank-you or receipt on the same journey, keep review requests delayed (e.g. 1 hour) so customers are not messaged twice at once.
        </p>
      )}
    </div>
  );
}

function WhatsAppActionFields({ row, onPatch, placeholderHint }) {
  const r = row || {};
  const templateName = String(r.templateName || '').trim();
  const [dismissedConfigWarning, setDismissedConfigWarning] = useState(false);
  const [dismissedMetaTip, setDismissedMetaTip] = useState(false);

  const whatsappSettingsQuery = useQuery({
    queryKey: ['settings', 'whatsapp'],
    queryFn: whatsappService.getSettings,
    staleTime: 60_000,
  });
  const whatsappSettings = whatsappSettingsQuery.data?.data;
  const whatsappConfigured = Boolean(
    whatsappSettings?.enabled && whatsappSettings?.phoneNumberId
  );
  const templateCatalog = Array.isArray(whatsappSettings?.templates) && whatsappSettings.templates.length
    ? whatsappSettings.templates
    : WHATSAPP_TEMPLATES;
  const selectedCatalogTemplate = templateCatalog.find((t) => t.name === templateName);
  const showConfigWarning =
    !dismissedConfigWarning &&
    whatsappSettingsQuery.isSuccess &&
    !whatsappConfigured;
  const showMetaTip = !dismissedMetaTip && Boolean(templateName);

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      {showConfigWarning && (
        <Alert className="relative border-amber-200 bg-amber-50 pr-10 text-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
          <AlertDescription className="text-xs leading-5 text-amber-900">
            WhatsApp is not configured for this workspace. Connect it in Settings → WhatsApp before this action can send.
          </AlertDescription>
          <button
            type="button"
            className="absolute right-2 top-2 rounded-md p-1 text-amber-700 hover:bg-amber-100"
            onClick={() => setDismissedConfigWarning(true)}
            aria-label="Dismiss WhatsApp configuration warning"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Alert>
      )}
      {showMetaTip && (
        <Alert className="relative border-sky-200 bg-sky-50 pr-10 text-sky-950">
          <MessageSquare className="h-4 w-4 text-sky-700" aria-hidden />
          <AlertDescription className="text-xs leading-5 text-sky-900">
            This Meta template must be approved: <span className="font-medium">{templateName}</span>
          </AlertDescription>
          <button
            type="button"
            className="absolute right-2 top-2 rounded-md p-1 text-sky-700 hover:bg-sky-100"
            onClick={() => setDismissedMetaTip(true)}
            aria-label="Dismiss Meta template tip"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="auto-wa-template-select">Approved Meta template</Label>
        <Select
          value={selectedCatalogTemplate ? templateName : (templateName ? '__custom' : undefined)}
          onValueChange={(value) => {
            if (value === '__custom') {
              onPatch({ templateName: templateName && !templateCatalog.some((t) => t.name === templateName) ? templateName : '' });
              return;
            }
            const picked = templateCatalog.find((t) => t.name === value);
            onPatch({
              templateName: value,
              language: picked?.language || r.language || 'en',
              parametersText: parametersTextFromTemplate(picked),
            });
          }}
        >
          <SelectTrigger id="auto-wa-template-select">
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            {templateCatalog.map((template) => (
              <SelectItem key={template.name} value={template.name}>
                {template.name}
              </SelectItem>
            ))}
            <SelectItem value="__custom">Custom template name</SelectItem>
          </SelectContent>
        </Select>
        {selectedCatalogTemplate?.description ? (
          <p className="text-xs text-muted-foreground">{selectedCatalogTemplate.description}</p>
        ) : null}
      </div>
      {(!selectedCatalogTemplate || !templateName) && (
        <div className="space-y-1.5">
          <Label htmlFor="auto-wa-template">Template name</Label>
          <Input
            id="auto-wa-template"
            value={r.templateName ?? ''}
            onChange={(e) => onPatch({ templateName: e.target.value })}
            placeholder="invoice_notification"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="auto-wa-lang">Language code</Label>
        <Input
          id="auto-wa-lang"
          value={r.language ?? 'en'}
          onChange={(e) => onPatch({ language: e.target.value })}
          placeholder="en"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="auto-wa-params">Template parameters (optional)</Label>
        <Input
          id="auto-wa-params"
          value={r.parametersText ?? ''}
          onChange={(e) => onPatch({ parametersText: e.target.value })}
          placeholder="Comma-separated values"
        />
        {placeholderHint ? (
          <p className="text-xs text-muted-foreground">Available placeholders: {placeholderHint}</p>
        ) : null}
      </div>
    </div>
  );
}

function StaffRecipientFields({ row, onPatch, triggerType }) {
  const show = isInternalStaffTrigger(triggerType) || Boolean(row.recipientType);
  if (!show || !MESSAGING_ACTION_TYPES.includes(row.type)) return null;

  const recipientType = row.recipientType || '';
  const roles = Array.isArray(row.recipientRoles) ? row.recipientRoles : [];

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <Label>Staff recipients</Label>
      <Select
        value={recipientType || 'role'}
        onValueChange={(v) => onPatch({
          recipientType: v,
          recipientRoles: v === 'role' ? (roles.length ? roles : ['owner', 'manager']) : [],
          recipientUserId: v === 'user' ? (row.recipientUserId || '') : '',
        })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Who should receive this?" />
        </SelectTrigger>
        <SelectContent>
          {STAFF_RECIPIENT_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {recipientType === 'role' || (!recipientType && isInternalStaffTrigger(triggerType)) ? (
        <div className="flex flex-wrap gap-3 pt-1">
          {STAFF_ROLE_OPTIONS.map((role) => {
            const checked = roles.includes(role.value);
            return (
              <label key={role.value} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    const nextRoles = next
                      ? [...new Set([...roles, role.value])]
                      : roles.filter((r) => r !== role.value);
                    onPatch({ recipientType: 'role', recipientRoles: nextRoles });
                  }}
                />
                {role.label}
              </label>
            );
          })}
        </div>
      ) : null}
      {recipientType === 'user' ? (
        <div className="space-y-1.5">
          <Label htmlFor="auto-recipient-user">User ID</Label>
          <Input
            id="auto-recipient-user"
            value={row.recipientUserId ?? ''}
            onChange={(e) => onPatch({ recipientType: 'user', recipientUserId: e.target.value })}
            placeholder="Staff user UUID"
          />
        </div>
      ) : null}
      {recipientType === 'assignee' ? (
        <p className="text-xs text-muted-foreground">
          Sends to the job or lead assignee from the trigger context.
        </p>
      ) : null}
      {(row.type === 'send_sms' || row.type === 'send_whatsapp') ? (
        <p className="text-xs text-muted-foreground">
          SMS/WhatsApp send only when the staff member has a phone on their Employee profile; otherwise that channel is skipped.
        </p>
      ) : null}
    </div>
  );
}

function AutomationActionFields({ row, onPatch, triggerType }) {
  const r = row || {};
  const placeholderHint = triggerType && MESSAGING_ACTION_TYPES.includes(r.type)
    ? formatPlaceholderHint(triggerType)
    : '';
  const recipientBlock = (
    <StaffRecipientFields row={r} onPatch={onPatch} triggerType={triggerType} />
  );
  switch (r.type) {
    case 'create_task':
      return (
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="space-y-1.5">
            <Label htmlFor="auto-task-title">Task title</Label>
            <Input
              id="auto-task-title"
              value={r.title ?? ''}
              onChange={(e) => onPatch({ title: e.target.value })}
              placeholder="Follow up"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={r.priority || 'medium'} onValueChange={(v) => onPatch({ priority: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-task-desc">Description (optional)</Label>
            <Textarea
              id="auto-task-desc"
              rows={2}
              value={r.description ?? ''}
              onChange={(e) => onPatch({ description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-task-link">Link path (optional)</Label>
            <Input
              id="auto-task-link"
              value={r.link ?? ''}
              onChange={(e) => onPatch({ link: e.target.value })}
              placeholder="/materials"
            />
          </div>
        </div>
      );
    case 'send_email_platform':
      return (
        <div className="space-y-3 pt-2 border-t border-border">
          {recipientBlock}
          <div className="space-y-1.5">
            <Label htmlFor="auto-email-subject">Subject</Label>
            <Input
              id="auto-email-subject"
              value={r.subject ?? ''}
              onChange={(e) => onPatch({ subject: e.target.value })}
              placeholder="Invoice due soon"
            />
            {placeholderHint ? (
              <p className="text-xs text-muted-foreground">Available placeholders: {placeholderHint}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-email-body">Message</Label>
            <Textarea
              id="auto-email-body"
              rows={4}
              value={r.body ?? ''}
              onChange={(e) => onPatch({ body: e.target.value })}
              placeholder="Plain text or simple HTML supported by your email setup."
            />
            {placeholderHint ? (
              <p className="text-xs text-muted-foreground">Available placeholders: {placeholderHint}</p>
            ) : null}
          </div>
        </div>
      );
    case 'send_sms':
      return (
        <div className="space-y-3 pt-2 border-t border-border">
          {recipientBlock}
          <div className="space-y-1.5">
            <Label htmlFor="auto-sms-body">SMS message</Label>
            <Textarea
              id="auto-sms-body"
              rows={3}
              value={r.body ?? ''}
              onChange={(e) => onPatch({ body: e.target.value })}
            />
            {placeholderHint ? (
              <p className="text-xs text-muted-foreground">Available placeholders: {placeholderHint}</p>
            ) : null}
            {!isInternalStaffTrigger(triggerType) ? (
              <p className="text-xs text-muted-foreground">Requires customer phone on the record when the rule runs.</p>
            ) : null}
          </div>
        </div>
      );
    case 'send_whatsapp':
      return (
        <div className="space-y-3 pt-2 border-t border-border">
          {recipientBlock}
          <WhatsAppActionFields row={r} onPatch={onPatch} placeholderHint={placeholderHint} />
        </div>
      );
    default:
      return null;
  }
}

function getConditionLines(conditionForm = {}) {
  const lines = [];
  const amountLine = (label, operatorKey, valueKey) => {
    if (conditionForm[valueKey] !== '' && conditionForm[valueKey] != null) {
      lines.push(`${label} is ${conditionOperatorLabel(conditionForm[operatorKey])} GHC ${Number(conditionForm[valueKey] || 0).toFixed(2)}`);
    }
  };
  const numberLine = (label, operatorKey, valueKey, suffix = '') => {
    if (conditionForm[valueKey] !== '' && conditionForm[valueKey] != null) {
      lines.push(`${label} is ${conditionOperatorLabel(conditionForm[operatorKey])} ${Number(conditionForm[valueKey] || 0)}${suffix}`);
    }
  };
  const yesNoLine = (label, key) => {
    const value = yesNoLabel(conditionForm[key]);
    if (value) lines.push(`${label} is ${value}`);
  };
  amountLine('Invoice amount', 'invoiceAmountOperator', 'invoiceAmountValue');
  amountLine('Balance due', 'balanceDueOperator', 'balanceDueValue');
  if (conditionForm.invoiceStatus) lines.push(`Invoice status is ${conditionForm.invoiceStatus}`);
  if (conditionForm.paymentStatus) lines.push(`Payment status is ${conditionForm.paymentStatus.replace(/_/g, ' ')}`);
  numberLine('Overdue days', 'overdueDaysOperator', 'overdueDaysValue', ' days');
  yesNoLine('Has overdue invoices', 'hasOverdueInvoices');
  yesNoLine('Customer has phone', 'customerHasPhone');
  yesNoLine('Customer has email', 'customerHasEmail');
  yesNoLine('WhatsApp consent', 'whatsappConsent');
  yesNoLine('SMS consent', 'smsConsent');
  yesNoLine('Marketing consent', 'marketingConsent');
  if (conditionForm.lastPurchaseOlderThanDays !== '' && conditionForm.lastPurchaseOlderThanDays != null) {
    lines.push(`Last purchase is older than ${Number(conditionForm.lastPurchaseOlderThanDays || 0)} days`);
  }
  amountLine('Total spend', 'totalSpendOperator', 'totalSpendValue');
  if (conditionForm.birthdayMatch) {
    lines.push(conditionForm.birthdayMatch === 'this_month' ? 'Customer birthday is this month' : 'Customer birthday is today');
  }
  if (conditionForm.weekdaysOnly) lines.push('Runs only on weekdays');
  if (conditionForm.runAfterTime) lines.push(`Runs after ${conditionForm.runAfterTime}`);
  if (conditionForm.runBeforeTime) lines.push(`Runs before ${conditionForm.runBeforeTime}`);
  if (conditionForm.frequency === 'once') {
    lines.push('Sends once per record (does not repeat)');
  } else if (conditionForm.frequency === 'daily') {
    lines.push('Repeats daily while the condition is still true');
  } else if (conditionForm.frequency === 'weekly') {
    lines.push('Repeats weekly while the condition is still true');
  } else if (conditionForm.frequency === 'monthly') {
    lines.push('Repeats monthly while the condition is still true');
  } else if (conditionForm.frequency === 'every_n_days') {
    lines.push(`Repeats every ${Number(conditionForm.intervalDays) || 1} days while the condition is still true`);
  } else if (conditionForm.cooldownDays !== '' && conditionForm.cooldownDays != null && Number(conditionForm.cooldownDays) > 0) {
    lines.push(`Does not repeat for the same record for ${Number(conditionForm.cooldownDays)} days`);
  }
  if (conditionForm.delayMinutes !== '' && conditionForm.delayMinutes != null && Number(conditionForm.delayMinutes) > 0) {
    const mins = Number(conditionForm.delayMinutes);
    if (mins === 60) lines.push('Sends 1 hour after the event');
    else if (mins === 1440) lines.push('Sends 1 day after the event');
    else if (mins === 3) lines.push('Sends 3 minutes after the event');
    else lines.push(`Sends ${mins} minutes after the event`);
  }
  if (conditionForm.stockBelowReorderLevel) lines.push('Stock is below reorder level');
  numberLine('Quantity on hand', 'quantityOperator', 'quantityValue');
  return lines;
}

function getTriggerPreview(builder) {
  const payload = buildRulePayloadFromForm({
    name: builder.name || 'Preview',
    triggerType: builder.triggerType,
    triggerForm: builder.triggerForm,
    conditionForm: builder.conditionForm,
    actionRows: builder.actionRows,
  });
  const trigger = triggerLabel(builder.triggerType);
  const scheduleTime = formatScheduleTimeDisplay(builder.conditionForm?.runAfterTime || '09:00');
  if (builder.triggerType === 'invoice_overdue' || builder.triggerType === 'invoice_overdue_staff') {
    return `An invoice is overdue for more than ${payload.triggerConfig.daysAfterDue || 0} days at ${scheduleTime} (GMT+00:00) Accra`;
  }
  if (builder.triggerType === 'invoice_due_in_days') {
    return `An invoice is due in ${payload.triggerConfig.daysBeforeDue || 0} days at ${scheduleTime} (GMT+00:00) Accra`;
  }
  if (builder.triggerType === 'payment_received') {
    return 'A payment is recorded on an invoice';
  }
  if (builder.triggerType === 'review_request') {
    return 'A job is completed, a sale is completed, or a standalone invoice is fully paid';
  }
  if (!usesDailySchedule(builder.triggerType)) {
    return getEventTimingCopy(builder.triggerType, builder.conditionForm);
  }
  return `${trigger} matches the configured trigger settings.`;
}

function actionSummary(row = {}) {
  const type = row.type || row.actionType;
  if (type === 'send_whatsapp') return row.templateName ? `WhatsApp template "${row.templateName}"` : 'WhatsApp message to the customer';
  if (type === 'send_email_platform' || type === 'send_email') return row.subject ? `Email: ${row.subject}` : 'Email message to the customer';
  if (type === 'send_sms') return 'SMS message to the customer';
  if (type === 'create_task') return row.title ? `Task: ${row.title}` : 'Follow-up task for your team';
  return 'Automation action';
}

function actionPreviewPhrase(row = {}) {
  const type = row.type || row.actionType;
  if (type === 'send_whatsapp') {
    const templateName = String(row.templateName || '').trim();
    return templateName ? `send WhatsApp template "${templateName}"` : 'send a WhatsApp message to the customer';
  }
  if (type === 'send_email_platform' || type === 'send_email') return 'send an email';
  if (type === 'send_sms') return 'send an SMS message';
  if (type === 'create_task') return 'create a follow-up task';
  return String(type || 'run action').replace(/_/g, ' ');
}

function formatActionPreviewList(actions) {
  const parts = actions.filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'run actions';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function AutomationCreationModal({
  open,
  onOpenChange,
  builder,
  setBuilder,
  step,
  setStep,
  conditionMode,
  setConditionMode,
  selectedTriggerMeta,
  allowedTriggerOptions = TRIGGER_OPTIONS,
  patchTriggerForm,
  patchConditionForm,
  patchActionRow,
  setActionType,
  addActionRow,
  removeActionRow,
  changeTriggerType,
  handleCreateRule,
  handleRunTest,
  isSaving,
  isPreparingTest,
  editingRuleId,
  testMutation,
  businessName,
  tenantSlug,
  showBranchSelector = false,
  branchSelectValue = ALL_BRANCHES_VALUE,
  branchOptions = [],
  branchLists = { shops: [], studioLocations: [] },
  handleBranchChange,
}) {
  const stepIndex = AUTOMATION_CREATION_STEPS.findIndex((item) => item.key === step);
  const currentStepIndex = stepIndex < 0 ? 0 : stepIndex;
  const triggerCards = useMemo(() => {
    return allowedTriggerOptions.map((option) => ({
      ...option,
      ...(TRIGGER_CARD_DETAILS[option.value] || {}),
      disabled: false,
    }));
  }, [allowedTriggerOptions]);
  const selectedDetails = TRIGGER_CARD_DETAILS[builder.triggerType] || {};
  const SelectedIcon = selectedDetails.Icon || selectedTriggerMeta?.Icon || Zap;
  const hasWhatsAppAction = useMemo(
    () => (builder.actionRows || []).some((row) => row?.type === 'send_whatsapp'),
    [builder.actionRows]
  );
  const visibleConditionGroups = useMemo(() => getVisibleConditionGroups(builder.triggerType), [builder.triggerType]);
  const conditionLines = useMemo(() => getConditionLines(builder.conditionForm), [builder.conditionForm]);
  const whatHappensNextTiming = useMemo(
    () => getWhatHappensNextTiming(builder.triggerType, builder.conditionForm),
    [builder.triggerType, builder.conditionForm]
  );
  const activeConditionCount = conditionLines.length;
  const primaryLabel =
    step === 'trigger'
      ? 'Next: Conditions'
      : step === 'conditions'
        ? 'Next: Actions'
        : step === 'actions'
          ? 'Next: Review'
          : editingRuleId
            ? 'Save changes'
            : 'Create and activate';
  const goNext = () => {
    if (step === 'trigger') setStep('conditions');
    else if (step === 'conditions') setStep('actions');
    else if (step === 'actions') setStep('review');
    else handleCreateRule({ enabled: true });
  };
  const goPrevious = () => {
    if (step === 'conditions') setStep('trigger');
    else if (step === 'actions') setStep('conditions');
    else if (step === 'review') setStep('actions');
  };

  const stepSummary = (item, index) => {
    if (item.key === 'trigger' && index < currentStepIndex) return selectedDetails.title || triggerLabel(builder.triggerType);
    if (item.key === 'conditions' && index < currentStepIndex) return activeConditionCount ? `${activeConditionCount} conditions` : 'No conditions';
    if (item.key === 'actions' && index < currentStepIndex) {
      return `${builder.actionRows.length} ${builder.actionRows.length === 1 ? 'action' : 'actions'}`;
    }
    return item.helper;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-auto overflow-hidden border-slate-200 bg-slate-50 p-0 sm:top-2 sm:h-auto sm:max-h-[calc(100vh-1rem)] sm:w-[min(1200px,96vw)] sm:max-w-none sm:rounded-2xl"
        style={{ '--modal-w': 'min(1200px,96vw)', '--modal-min-h': '0px', '--modal-max-h': 'calc(100vh - 1rem)' }}
      >
        <DialogHeader className="border-b border-slate-200 bg-white px-5 py-3 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                <Bot className="h-7 w-7" aria-hidden />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight text-slate-950">Create automation</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500">
                  Build a rule that runs automatically and saves you time.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="bg-slate-50">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              {AUTOMATION_CREATION_STEPS.map((item, index) => {
                const complete = index < currentStepIndex;
                const active = index === currentStepIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="flex items-center gap-3 text-left"
                    onClick={() => setStep(item.key)}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                        complete
                          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                          : active
                            ? 'border-[#166534] bg-[#166534] text-white'
                            : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {complete ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${active || complete ? 'text-[#166534]' : 'text-slate-700'}`}>{item.label}</span>
                      <span className="block truncate text-xs text-slate-500">{stepSummary(item, index)}</span>
                    </span>
                    {index < AUTOMATION_CREATION_STEPS.length - 1 && (
                      <span className={`hidden h-0.5 flex-1 rounded-full lg:block ${index < currentStepIndex ? 'bg-[#166534]' : 'bg-slate-200'}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {step === 'trigger' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Choose a trigger</CardTitle>
                      <CardDescription>This is the event that starts your automation.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1 md:grid-cols-2 lg:max-h-[520px]">
                          {triggerCards.map((item) => {
                            const Icon = item.Icon || Zap;
                            const selected = item.value === builder.triggerType;
                            return (
                              <button
                                key={item.value}
                                type="button"
                                disabled={item.disabled}
                                className={`rounded-xl border p-4 text-left transition ${
                                  selected
                                    ? 'border-[#166534] bg-emerald-50/40'
                                    : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/20'
                                } ${item.disabled ? 'opacity-60' : ''}`}
                                onClick={() => !item.disabled && changeTriggerType(item.value)}
                              >
                                <div className="flex items-start gap-3">
                                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.bg || 'bg-slate-100'}`}>
                                    <Icon className={`h-5 w-5 ${item.color || 'text-slate-700'}`} aria-hidden />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-start justify-between gap-2">
                                      <span className="font-semibold text-slate-950">{item.title || item.label}</span>
                                      {selected && <CheckCircle2 className="h-4 w-4 text-[#166534]" aria-hidden />}
                                    </span>
                                    <span className="mt-1 block text-xs text-slate-500">{item.description || item.hint}</span>
                                    {item.tag && <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#166534]">{item.tag}</span>}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      <button type="button" className="text-xs font-medium text-[#166534]">
                        Can't find what you need? Suggest a trigger <ArrowRight className="inline h-3 w-3" aria-hidden />
                      </button>
                    </CardContent>
                  </Card>

                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                      <div>
                        <CardTitle className="text-base">Selected trigger</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="flex items-start gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selectedDetails.bg || 'bg-emerald-50'}`}>
                          <SelectedIcon className={`h-5 w-5 ${selectedDetails.color || 'text-emerald-700'}`} aria-hidden />
                        </span>
                        <div>
                          <p className="font-semibold text-slate-950">{selectedDetails.title || triggerLabel(builder.triggerType)}</p>
                          <p className="text-xs text-slate-500">{selectedTriggerMeta?.hint || selectedDetails.description}</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="automation-modal-name">Automation name</Label>
                        <Input
                          id="automation-modal-name"
                          value={builder.name}
                          onChange={(e) => setBuilder((b) => ({ ...b, name: e.target.value }))}
                          placeholder="e.g. Invoice overdue reminder"
                        />
                      </div>
                      {showBranchSelector && (
                        <div className="space-y-1.5">
                          <Label htmlFor="automation-modal-branch">Branch</Label>
                          <Select value={branchSelectValue} onValueChange={handleBranchChange}>
                            <SelectTrigger id="automation-modal-branch">
                              <SelectValue placeholder="All branches" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ALL_BRANCHES_VALUE}>All branches</SelectItem>
                              {branchOptions.map((branch) => (
                                <SelectItem key={branch.id} value={branch.id}>
                                  {branch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-slate-500">
                            {branchSelectValue === ALL_BRANCHES_VALUE
                              ? 'This automation runs for every branch.'
                              : 'This automation only runs for the selected branch.'}
                          </p>
                        </div>
                      )}
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-950">Trigger settings</p>
                        <AutomationTriggerFields triggerType={builder.triggerType} value={builder.triggerForm} onPatch={patchTriggerForm} />
                        <AutomationFrequencyFields
                          triggerType={builder.triggerType}
                          conditionForm={builder.conditionForm}
                          onPatch={patchConditionForm}
                        />
                        <AutomationSendAfterFields
                          triggerType={builder.triggerType}
                          conditionForm={builder.conditionForm}
                          onPatch={patchConditionForm}
                        />
                        {usesDailySchedule(builder.triggerType) ? (
                          <>
                            <div className="space-y-1.5">
                              <Label>Trigger time</Label>
                              <Select
                                value={formatScheduleTimeDisplay(builder.conditionForm?.runAfterTime || '09:00')}
                                onValueChange={() => {}}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={formatScheduleTimeDisplay(builder.conditionForm?.runAfterTime || '09:00')}>
                                    {formatScheduleTimeDisplay(builder.conditionForm?.runAfterTime || '09:00')}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-slate-500">Time of day to check and trigger this automation. Set earliest run time under Conditions for a different hour.</p>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Time zone</Label>
                              <Select value="GMT+00:00 Accra" onValueChange={() => {}}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="GMT+00:00 Accra">(GMT+00:00) Accra</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-slate-500">Time zone for the trigger schedule.</p>
                            </div>
                          </>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                        <p className="text-sm font-semibold text-slate-950">Trigger preview</p>
                        <div className="mt-3 flex gap-3 text-sm">
                          <Clock3 className="mt-0.5 h-4 w-4 text-[#166534]" aria-hidden />
                          <p>
                            <span className="block text-slate-600">This rule will trigger when:</span>
                            <span className="font-semibold text-slate-950">{getTriggerPreview(builder)}</span>
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className={`grid gap-4 ${hasWhatsAppAction ? 'md:grid-cols-2' : ''}`}>
                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-emerald-700">
                          <Lightbulb className="h-4 w-4" aria-hidden />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">Need inspiration?</p>
                          <p className="text-xs text-slate-500">Check out our pre-built templates to get started quickly.</p>
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setStep('review')}>
                        View templates
                      </Button>
                    </CardContent>
                  </Card>
                  {hasWhatsAppAction && (
                    <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                      <CardContent className="flex items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3">
                          <span className="rounded-xl border border-violet-100 bg-violet-50 p-2 text-violet-700">
                            <MessageSquare className="h-4 w-4" aria-hidden />
                          </span>
                          <div>
                            <p className="text-sm font-semibold">Using WhatsApp?</p>
                            <p className="text-xs text-slate-500">Make sure you have approved templates for your messages.</p>
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm">
                          Manage templates
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {step === 'conditions' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Add conditions (optional)</CardTitle>
                      <CardDescription>Add filters to narrow down when this automation should run.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                          {['All conditions', 'Condition groups'].map((mode) => (
                            <Button
                              key={mode}
                              type="button"
                              variant={conditionMode === mode ? 'default' : 'outline'}
                              className={conditionMode === mode ? 'bg-emerald-50 text-[#166534] hover:bg-emerald-100' : 'bg-white'}
                              onClick={() => setConditionMode(mode)}
                            >
                              {mode}
                            </Button>
                          ))}
                        </div>
                        <div className="w-full sm:w-[200px]">
                          <Select value="all" onValueChange={() => {}}>
                            <SelectTrigger>
                              <SelectValue placeholder="Filter by category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Filter by category</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {visibleConditionGroups.map((group, index) => {
                          const GroupIcon = group.Icon;
                          return (
                            <Collapsible key={group.key} defaultOpen={index === 0}>
                              <div className="rounded-xl border border-slate-200">
                                <CollapsibleTrigger asChild>
                                  <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                                      <GroupIcon className="h-4 w-4 text-[#166534]" aria-hidden />
                                      {group.label}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                                  </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  {group.rows.length ? (
                                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                                      {group.rows.map((row) => {
                                        const enabled = isConditionRowEnabled(builder.conditionForm, row);
                                        return (
                                          <div key={row.key} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(160px,1fr)_minmax(220px,1fr)] md:items-center">
                                            <label className="flex items-center gap-3 text-sm text-slate-700">
                                              <Checkbox
                                                checked={enabled}
                                                disabled={row.disabled}
                                                onCheckedChange={(checked) => {
                                                  patchConditionForm(checked ? defaultConditionPatch(row) : clearConditionPatch(row));
                                                }}
                                              />
                                              {row.label}
                                            </label>
                                            {renderConditionControl(row, builder.conditionForm, patchConditionForm)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                                      {group.emptyMessage || 'More filters for this category are coming soon.'}
                                    </div>
                                  )}
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                      <div>
                        <CardTitle className="text-base">Conditions summary</CardTitle>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setBuilder((b) => ({ ...b, conditionForm: conditionFormFromConfig({}, {}, b.triggerType) }))}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                        Clear all
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-xl border border-slate-200 p-6 text-center">
                        {conditionLines.length ? (
                          <div className="space-y-2 text-left">
                            {conditionLines.map((line) => (
                              <div key={line} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-slate-700">
                                {line}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <Filter className="mx-auto h-6 w-6 text-slate-400" aria-hidden />
                            <p className="mt-3 text-sm font-medium text-slate-700">No conditions added</p>
                            <p className="mt-1 text-xs text-slate-500">This rule will run for all records that match the trigger.</p>
                          </>
                        )}
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                        <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <Lightbulb className="h-4 w-4 text-[#166534]" aria-hidden />
                          Tip
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Adding conditions helps you target the right records and reduce unnecessary actions.</p>
                      </div>
                      <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                        <p className="font-semibold text-slate-950">Rule preview</p>
                        <div className="space-y-4">
                          <div className="flex gap-3">
                            <Clock3 className="mt-1 h-4 w-4 text-slate-500" aria-hidden />
                            <div className="text-sm">
                              <p className="font-semibold">Trigger</p>
                              <p className="text-slate-500">{getTriggerPreview(builder)}</p>
                            </div>
                          </div>
                          <div className="rounded-xl bg-emerald-50 p-3">
                            <p className="text-sm font-semibold text-slate-950">Conditions</p>
                            <p className="mt-1 text-xs text-slate-600">{conditionLines.length ? conditionLines.join(' and ') : 'No additional conditions. This rule will run for all records that match the trigger.'}</p>
                          </div>
                          <div className="flex gap-3">
                            <Zap className="mt-1 h-4 w-4 text-slate-500" aria-hidden />
                            <div className="text-sm">
                              <p className="font-semibold">Actions</p>
                              <p className="text-slate-500">You'll define actions in the next step.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {step === 'actions' && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Choose actions</CardTitle>
                    <CardDescription>Select what should happen after the trigger and conditions match.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      {ACTION_TYPE_OPTIONS.map((option) => {
                        const meta = actionMetaByType[option.value] || actionMetaByType.create_task;
                        const Icon = meta.Icon;
                        const selected = builder.actionRows.some((row) => row.type === option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`rounded-xl border p-4 text-left ${selected ? 'border-[#166534] bg-emerald-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                            onClick={() => setActionType(0, option.value)}
                          >
                            <div className="flex items-start gap-3">
                              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}>
                                <Icon className={`h-5 w-5 ${meta.color}`} aria-hidden />
                              </span>
                              <span>
                                <span className="font-semibold text-slate-950">{option.label}</span>
                                <span className="mt-1 block text-xs text-slate-500">
                                  {option.value === 'send_whatsapp'
                                    ? 'Send a WhatsApp template message.'
                                    : option.value === 'send_sms'
                                      ? 'Send a short text message.'
                                      : option.value === 'send_email_platform'
                                        ? 'Send a platform email.'
                                        : 'Create a task for your team.'}
                                </span>
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-3">
                      {builder.actionRows.map((row, index) => {
                        const meta = actionMetaByType[row.type] || actionMetaByType.create_task;
                        const Icon = meta.Icon;
                        return (
                          <div key={index} className="rounded-xl border border-slate-200 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.bg}`}>
                                  <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden />
                                </span>
                                <div>
                                  <Label>Action {index + 1}</Label>
                                  <p className="text-xs text-slate-500">{meta.label}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Select value={row.type} onValueChange={(value) => setActionType(index, value)}>
                                  <SelectTrigger className="w-[210px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ACTION_TYPE_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {builder.actionRows.length > 1 && (
                                  <Button type="button" variant="outline" size="icon" onClick={() => removeActionRow(index)}>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <AutomationActionFields row={row} triggerType={builder.triggerType} onPatch={(patch) => patchActionRow(index, patch)} />
                          </div>
                        );
                      })}
                    </div>
                    <Button type="button" variant="outline" className="bg-white" onClick={addActionRow} disabled={builder.actionRows.length >= MAX_ACTIONS}>
                      <Plus className="mr-2 h-4 w-4" aria-hidden />
                      Add another action
                    </Button>
                  </CardContent>
                </Card>

                <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Actions summary</CardTitle>
                    <CardDescription>{builder.actionRows.length} configured action{builder.actionRows.length === 1 ? '' : 's'}.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {builder.actionRows.map((row, index) => {
                        const meta = actionMetaByType[row.type] || actionMetaByType.create_task;
                        const Icon = meta.Icon;
                        return (
                          <div key={index} className="flex gap-3 rounded-xl border border-slate-200 p-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}>
                              <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{meta.label}</p>
                              <p className="text-xs text-slate-500">{actionSummary(row)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <MessagePreview builder={builder} businessName={businessName} tenantSlug={tenantSlug} />
                    {builder.triggerType === 'review_request' && !tenantSlug?.trim() && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-semibold">Review link not configured</p>
                        <p className="mt-1 text-amber-800">
                          Save your workspace organization settings so your public review URL is available at{' '}
                          <span className="font-mono text-xs">/review/your-slug</span>. Messages using{' '}
                          <span className="font-mono text-xs">{'{{reviewLink}}'}</span> will be empty until then.
                        </p>
                      </div>
                    )}
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-sm font-semibold text-slate-950">Rule preview</p>
                      <p className="mt-2 text-sm text-slate-600">{ruleSummaryFromParts(builder, conditionLines)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {step === 'review' && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Review your automation</CardTitle>
                    <CardDescription>Please review all details before activating this automation.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      {
                        key: 'trigger',
                        title: 'Trigger',
                        Icon: Clock3,
                        step: 'trigger',
                        lines: [
                          selectedDetails.title || triggerLabel(builder.triggerType),
                          getTriggerPreview(builder),
                          ...(showBranchSelector ? [`Branch: ${resolveAutomationBranchLabel(builder, branchLists)}`] : []),
                        ],
                      },
                      { key: 'conditions', title: 'Conditions', Icon: Filter, step: 'conditions', lines: conditionLines.length ? [`${conditionLines.length} conditions`, ...conditionLines] : ['No additional conditions'] },
                      { key: 'actions', title: 'Actions', Icon: Zap, step: 'actions', lines: [`${builder.actionRows.length} actions`, ...builder.actionRows.map(actionSummary)] },
                      { key: 'settings', title: 'Additional settings', Icon: SlidersHorizontal, step: 'trigger', lines: getReviewAdditionalSettingsLines(builder.triggerType, builder.conditionForm) },
                    ].map((section) => {
                      const SectionIcon = section.Icon;
                      return (
                        <div key={section.key} className="flex gap-4 rounded-xl border border-slate-200 p-4">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-[#166534]">
                            <SectionIcon className="h-5 w-5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-semibold text-slate-950">{section.title}</p>
                              <Button type="button" variant="outline" size="sm" className="bg-white" onClick={() => setStep(section.step)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden />
                                Edit
                              </Button>
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-slate-600">
                              {section.lines.map((line, lineIndex) => (
                                <p key={`${section.key}-${line}`}>{lineIndex === 0 ? <span className="font-semibold text-slate-950">{line}</span> : `• ${line}`}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                      <div>
                        <CardTitle className="text-base">Automation summary</CardTitle>
                        <CardDescription>This rule will run automatically when {triggerLabel(builder.triggerType).toLowerCase()}.</CardDescription>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-[#166534]">Ready to activate</span>
                    </CardHeader>
                    <CardContent className="grid grid-cols-3 gap-3 text-center">
                      {[
                        ['Saves time', 'Automates follow-ups and task creation', Clock3],
                        ['Improves cash flow', 'Helps recover overdue payments faster', Activity],
                        ['Better customer experience', 'Timely reminders and follow-ups', Users],
                      ].map(([title, text, Icon]) => (
                        <div key={title} className="rounded-xl border border-slate-100 p-3">
                          <Icon className="mx-auto h-5 w-5 text-[#166534]" aria-hidden />
                          <p className="mt-2 text-xs font-semibold text-slate-950">{title}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{text}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Test your automation</CardTitle>
                      <CardDescription>Run a test to make sure this automation works as expected.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Test with a sample record</p>
                        <p className="text-xs text-slate-500">
                          {ruleHasMessagingActions(builder.actionRows)
                            ? 'Choose a real recipient when testing SMS, WhatsApp, or email actions.'
                            : editingRuleId
                              ? 'We will simulate the trigger and run all actions.'
                              : 'We will save a disabled draft first, then run the test.'}
                        </p>
                      </div>
                      <Button type="button" variant="outline" className="bg-white" disabled={isSaving || isPreparingTest || testMutation.isPending || !builder.name.trim()} onClick={handleRunTest}>
                        {isPreparingTest || testMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                        Run test
                      </Button>
                    </CardContent>
                  </Card>
                  <Card style={CARD_BORDER} className="rounded-2xl bg-white">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">What happens next?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {[
                        ['Automation will be active immediately', 'This rule starts running as soon as you activate it.', PlayCircle],
                        [whatHappensNextTiming.title, whatHappensNextTiming.text, Clock3],
                        ["You'll get notified if something fails", "We'll alert you if any action doesn't complete successfully.", Bell],
                      ].map(([title, text, Icon]) => (
                        <div key={title} className="flex gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-[#166534]">
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{title}</p>
                            <p className="text-xs text-slate-500">{text}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <Button type="button" variant="outline" className="bg-white" onClick={goPrevious} disabled={step === 'trigger'}>
                <ChevronLeft className="mr-2 h-4 w-4" aria-hidden />
                Previous: {step === 'conditions' ? 'Trigger' : step === 'actions' ? 'Conditions' : 'Actions'}
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" variant="outline" className="bg-white" onClick={() => handleCreateRule({ enabled: false })} disabled={isSaving || !builder.name.trim()}>
                  Save draft
                </Button>
                <Button type="button" className="bg-[#166534] hover:bg-[#14532d]" onClick={goNext} disabled={isSaving || (step === 'review' && !builder.name.trim())}>
                  {isSaving && step === 'review' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                  {primaryLabel}
                  {step !== 'review' && <ArrowRight className="ml-2 h-4 w-4" aria-hidden />}
                </Button>
              </div>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ruleSummaryFromParts(builder, conditionLines) {
  const actions = builder.actionRows.map(actionPreviewPhrase);
  return `When "${triggerLabel(builder.triggerType)}"${conditionLines.length ? ` if ${conditionLines.join(' and ')}` : ''}, then ${formatActionPreviewList(actions)}.`;
}

function AutomationRuleDetailsDrawer({
  rule,
  open,
  onOpenChange,
  onEdit,
  onTest,
  onToggle,
  onDelete,
  onViewRuns,
  testInProgress,
  toggleInProgress,
  deleteInProgress,
  waStatusByMessageId = {},
}) {
  const actions = rule ? getRuleActions(rule) : [];
  const TriggerIcon = rule?.triggerDisplay?.Icon || Zap;
  const ChannelIcon = rule?.channelDisplay?.Icon || Zap;
  const conditionRows = rule ? getConditionDetailRows(rule) : [];
  const metadataRows = rule ? getSourceMetadataRows(rule) : [];
  const recentRuns = rule?.recentRuns || [];
  const totalRuns = rule?.totalRuns ?? recentRuns.length;
  const [expandedRunIds, setExpandedRunIds] = useState(() => new Set());

  const toggleRunExpand = useCallback((runId) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) setExpandedRunIds(new Set());
  }, [open, rule?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden sm:w-[min(92vw,720px)] sm:max-w-[min(92vw,720px)]"
        style={{ top: 8, bottom: 8, right: 8, height: 'calc(100dvh - 16px)', borderRadius: 8 }}
      >
        <SheetHeader className="border-b border-border pb-4 pr-10">
          <div className="flex items-start gap-3 text-left">
            <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${rule?.channelDisplay?.bg || 'bg-slate-100'}`}>
              <ChannelIcon className={`h-5 w-5 ${rule?.channelDisplay?.color || 'text-slate-700'}`} aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <SheetTitle className="text-xl">{rule?.name || 'Automation rule'}</SheetTitle>
              <SheetDescription>{rule?.description || 'View automation rule details and recent activity.'}</SheetDescription>
              {rule && (
                <div className="flex flex-wrap items-center gap-2">
                  {!rule.businessTypeCompatible ? (
                    <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Not for your business type
                    </span>
                  ) : (
                    <StatusChip
                      status={rule.status}
                      className={rule.status === 'active' ? 'border-green-100 bg-green-50 text-green-700' : ''}
                    />
                  )}
                  <span className="rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {rule.enabled ? 'Enabled' : 'Paused'}
                  </span>
                  {rule.branchLabel && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {rule.branchLabel}
                    </span>
                  )}
                  <span className="rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {getRuleAiSource(rule)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </SheetHeader>

        {rule ? (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto py-5 pr-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last run</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatDateTime(rule.lastRunTime)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{rule.lastRunOutcome}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Success rate</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{rule.successRate == null ? '-' : `${rule.successRate}%`}</p>
                  {rule.successRate != null && <Progress value={rule.successRate} className="mt-2 h-1.5 bg-muted [&>div]:bg-[#166534]" />}
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total runs</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{totalRuns.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Recent execution data</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-sm font-semibold text-foreground">Trigger</p>
                <div className="mt-3 flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${rule.triggerDisplay.bg}`}>
                    <TriggerIcon className={`h-4 w-4 ${rule.triggerDisplay.color}`} aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{rule.triggerDisplay.title}</p>
                    <p className="text-sm text-muted-foreground">{rule.triggerDisplay.description}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-sm font-semibold text-foreground">Conditions</p>
                {conditionRows.length ? (
                  <dl className="mt-3 grid gap-2">
                    {conditionRows.map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
                        <dt className="text-sm text-muted-foreground">{row.label}</dt>
                        <dd className="max-w-[60%] text-right text-sm font-medium text-foreground">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No extra conditions. This rule runs whenever the trigger matches.</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-sm font-semibold text-foreground">Actions and channels</p>
                <div className="mt-3 space-y-2">
                  {actions.length ? (
                    actions.map((action, index) => {
                      const meta = actionMetaByType[action?.type] || actionMetaByType.create_task;
                      const ActionIcon = meta.Icon;
                      const detailRows = detailRowsFromObject(action, ['type']);
                      return (
                        <div key={`${action?.type || 'action'}-${index}`} className="rounded-lg border border-border bg-muted/20 p-3">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
                              <ActionIcon className={`h-4 w-4 ${meta.color}`} aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{meta.label}</p>
                              {detailRows.length ? (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {detailRows.map((row) => `${row.label}: ${row.value}`).join(' · ')}
                                </p>
                              ) : (
                                <p className="mt-1 text-xs text-muted-foreground">{actionLabel(action)} action</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No configured actions.</p>
                  )}
                </div>
              </div>

              {metadataRows.length > 0 && (
                <div className="rounded-xl border border-border bg-white p-4">
                  <p className="text-sm font-semibold text-foreground">Template and source</p>
                  <dl className="mt-3 grid gap-2">
                    {metadataRows.map((row) => (
                      <div key={row.label} className="rounded-lg bg-muted/20 px-3 py-2">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row.label}</dt>
                        <dd className="mt-1 break-words text-sm text-foreground">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">Recent run history</p>
                  <span className="text-xs text-muted-foreground">{recentRuns.length} shown</span>
                </div>
                <div className="mt-3 space-y-2">
                  {recentRuns.length ? (
                    recentRuns.map((run) => {
                      const durationMs = getRunDurationMs(run);
                      const actionCount = getRunActions(run).length || actions.length;
                      const expanded = expandedRunIds.has(run.id);
                      return (
                        <div key={run.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-start gap-2 text-left"
                              onClick={() => toggleRunExpand(run.id)}
                              aria-expanded={expanded}
                              aria-label={expanded ? 'Collapse delivery details' : 'Expand delivery details'}
                            >
                              <ChevronDown
                                className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                                aria-hidden
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{buildRunMessage(run, actionCount)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(run.finishedAt || run.createdAt || run.startedAt)}</p>
                              </div>
                            </button>
                            <StatusChip status={normalizeRunStatus(run.status)} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">Duration: {formatDuration(durationMs)}</p>
                          {expanded ? (
                            <DeliveryDetailPanel
                              run={run}
                              waStatusByMessageId={waStatusByMessageId}
                              className="mt-3"
                            />
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No runs recorded for this rule yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline">
                    <MoreVertical className="mr-2 h-4 w-4" aria-hidden />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(rule)}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onToggle(rule)}
                    disabled={toggleInProgress || (!rule.enabled && rule.businessTypeCompatible === false)}
                  >
                    {toggleInProgress ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : rule.enabled ? (
                      <PauseCircle className="mr-2 h-4 w-4" aria-hidden />
                    ) : (
                      <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    {rule.enabled ? 'Pause rule' : 'Activate rule'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onViewRuns(rule)}>
                    <Activity className="mr-2 h-4 w-4" aria-hidden />
                    View runs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onSelect={() => onDelete(rule)}
                    disabled={deleteInProgress}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" className="bg-brand hover:bg-brand-dark" onClick={() => onTest(rule)} disabled={testInProgress}>
                {testInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <PlayCircle className="mr-2 h-4 w-4" aria-hidden />}
                Run
              </Button>
            </div>
          </>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">Select an automation rule to view details.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Automations() {
  const { activeTenantId, activeTenant } = useAuth();
  const shopContext = useShopOptional();
  const studioLocationContext = useStudioLocationOptional();
  const isShopWorkspace = !!shopContext?.isShopWorkspace;
  const isStudioWorkspace = !!studioLocationContext?.isStudioWorkspace;
  const shopBranches = shopContext?.shops || [];
  const studioLocationBranches = studioLocationContext?.locations || [];
  const branchLists = useMemo(
    () => ({ shops: shopBranches, studioLocations: studioLocationBranches }),
    [shopBranches, studioLocationBranches]
  );
  const queryClient = useQueryClient();
  const [builder, setBuilder] = useState(createInitialBuilder);
  const [builderModalOpen, setBuilderModalOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState('trigger');
  const [conditionMode, setConditionMode] = useState('All conditions');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [useJsonOverride, setUseJsonOverride] = useState(false);
  const [rawJson, setRawJson] = useState(INITIAL_RAW_JSON);
  const [taskAutomationDraft, setTaskAutomationDraft] = useState(DEFAULT_TASK_AUTOMATION);
  const [editingRuleId, setEditingRuleId] = useState('');
  const editingRuleIdRef = useRef(editingRuleId);
  editingRuleIdRef.current = editingRuleId;
  const [aiInstruction, setAiInstruction] = useState('');
  const [activeTab, setActiveTab] = useState('rules');
  const [templateChannel, setTemplateChannel] = useState('all');
  const [templateDifficulty, setTemplateDifficulty] = useState('all');
  const [templateSort, setTemplateSort] = useState('popular');
  const [ruleStatusFilter, setRuleStatusFilter] = useState('all');
  const [ruleSort, setRuleSort] = useState('recent');
  const [ruleBranchFilter, setRuleBranchFilter] = useState('any');
  const [rulesPageSize, setRulesPageSize] = useState(10);
  const [rulesPage, setRulesPage] = useState(1);
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyChannelFilter, setHistoryChannelFilter] = useState('all');
  const [historyDateRange, setHistoryDateRange] = useState('all');
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState(() => new Set());
  const [logRuleFilter, setLogRuleFilter] = useState('all');
  const [logStatusFilter, setLogStatusFilter] = useState('all');
  const [logLevelFilter, setLogLevelFilter] = useState('all');
  const [logChannelFilter, setLogChannelFilter] = useState('all');
  const [logDateRange, setLogDateRange] = useState('7d');
  const [logsPageSize, setLogsPageSize] = useState(10);
  const [logsPage, setLogsPage] = useState(1);
  const [selectedLogId, setSelectedLogId] = useState('');
  const [aiBuilderStatusFilter, setAiBuilderStatusFilter] = useState('all');
  const [aiBuilderPageSize, setAiBuilderPageSize] = useState(10);
  const [aiBuilderPage, setAiBuilderPage] = useState(1);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiDraftMetadata, setAiDraftMetadata] = useState(null);
  const [viewingRuleId, setViewingRuleId] = useState('');
  const [isPreparingTest, setIsPreparingTest] = useState(false);
  const [testRecipientDialogOpen, setTestRecipientDialogOpen] = useState(false);
  const [pendingTestRun, setPendingTestRun] = useState(null);
  useEffect(() => {
    if (useJsonOverride) setAdvancedOpen(true);
  }, [useJsonOverride]);

  const businessType = resolveBusinessType(activeTenant?.businessType);
  const shopType =
    activeTenant?.metadata?.shopType || activeTenant?.metadata?.businessSubType || null;

  const templatesQuery = useQuery({
    queryKey: ['automations', 'templates', activeTenantId, businessType, shopType],
    queryFn: () => automationService.getTemplates(),
    enabled: !!activeTenantId,
  });
  const rulesQuery = useQuery({
    queryKey: ['automations', 'rules', activeTenantId],
    queryFn: () => automationService.getRules(),
    enabled: !!activeTenantId,
  });
  const runsQuery = useQuery({
    queryKey: ['automations', 'runs', activeTenantId, selectedRuleId],
    queryFn: async () => {
      const response = await automationService.getRuns(selectedRuleId ? { ruleId: selectedRuleId, limit: 200 } : { limit: 200 });
      return { data: automationService.unwrapAutomationRuns(response).runs };
    },
    enabled: !!activeTenantId,
  });
  const allRunsQuery = useQuery({
    queryKey: ['automations', 'runs', activeTenantId, 'all', 200],
    queryFn: async () => {
      const response = await automationService.getRuns({ page: 1, limit: 200 });
      return { data: automationService.unwrapAutomationRuns(response).runs };
    },
    enabled: !!activeTenantId,
  });
  const overviewQuery = useQuery({
    queryKey: ['automations', 'overview', activeTenantId],
    queryFn: () => automationService.getOverview(),
    enabled: !!activeTenantId,
  });
  const logsApiQuery = useQuery({
    queryKey: [
      'automations',
      'logs',
      activeTenantId,
      logRuleFilter,
      logStatusFilter,
      logLevelFilter,
      logChannelFilter,
      logDateRange,
      logsPage,
      logsPageSize,
    ],
    queryFn: () =>
      automationService.getLogs({
        page: logsPage,
        limit: logsPageSize,
        ruleId: logRuleFilter !== 'all' ? logRuleFilter : undefined,
        status: logStatusFilter !== 'all' ? logStatusFilter : undefined,
        level: logLevelFilter !== 'all' ? logLevelFilter : undefined,
        channel: logChannelFilter !== 'all' ? logChannelFilter : undefined,
        ...logsDateRangeParams(logDateRange),
      }),
    enabled: !!activeTenantId && activeTab === 'logs',
  });
  const suggestionsQuery = useQuery({
    queryKey: ['automations', 'suggestions', activeTenantId],
    queryFn: () => automationService.getSuggestions(),
    enabled: !!activeTenantId,
  });
  const whatsAppEventsQuery = useQuery({
    queryKey: ['automations', 'whatsapp-events', activeTenantId, 200],
    queryFn: () => automationService.getWhatsAppEvents({ limit: 200 }),
    enabled: !!activeTenantId,
  });
  // Prefetch so WhatsApp action tips can read cached settings immediately.
  useQuery({
    queryKey: ['settings', 'whatsapp'],
    queryFn: whatsappService.getSettings,
    enabled: !!activeTenantId,
    staleTime: 60_000,
  });
  const organizationQuery = useQuery({
    queryKey: ['settings', 'organization', activeTenantId],
    queryFn: () => settingsService.getOrganizationSettings(),
    enabled: !!activeTenantId,
  });

  const templates = templatesQuery.data?.data || [];
  const rules = rulesQuery.data?.data || [];
  const runs = runsQuery.data?.data || [];
  const allRuns = allRunsQuery.data?.data || [];
  const overview = overviewQuery.data?.data || null;
  const serverLogs = logsApiQuery.data?.data || null;
  const organization = organizationQuery.data?.data ?? organizationQuery.data ?? {};
  const businessName = useScopedWorkspaceName(organization?.name);
  const tenantSlug = activeTenant?.slug || '';
  const suggestions = suggestionsQuery.data?.data || [];
  const whatsAppEvents = whatsAppEventsQuery.data?.data || [];
  const waStatusByMessageId = useMemo(
    () => buildWhatsAppStatusByMessageId(whatsAppEvents),
    [whatsAppEvents]
  );

  const toggleHistoryExpand = useCallback((runId) => {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const allowedTriggerOptions = useMemo(
    () => filterTriggerOptionsForTenant(TRIGGER_OPTIONS, activeTenant),
    [activeTenant]
  );

  const templateCards = useMemo(() => templates.map(getTemplateCard), [templates]);

  const filteredTemplateCards = useMemo(() => {
    const filtered = templateCards.filter((template) => {
      const matchesChannel = templateChannel === 'all' || template.channels.includes(templateChannel);
      const matchesDifficulty = templateDifficulty === 'all' || template.difficulty === templateDifficulty;
      return matchesChannel && matchesDifficulty;
    });

    return [...filtered].sort((a, b) => {
      if (templateSort === 'name') return String(a.title || '').localeCompare(String(b.title || ''));
      if (templateSort === 'difficulty') {
        return (TEMPLATE_DIFFICULTY_RANK[a.difficulty] || 99) - (TEMPLATE_DIFFICULTY_RANK[b.difficulty] || 99);
      }
      return Number(b.popular) - Number(a.popular) || String(a.title || '').localeCompare(String(b.title || ''));
    });
  }, [templateCards, templateChannel, templateDifficulty, templateSort]);

  const ruleNameById = useMemo(() => {
    const m = new Map();
    for (const r of rules) {
      if (r?.id) m.set(r.id, r.name || 'Rule');
    }
    return m;
  }, [rules]);

  const ruleById = useMemo(() => {
    const m = new Map();
    for (const r of rules) {
      if (r?.id) m.set(r.id, r);
    }
    return m;
  }, [rules]);

  const runsByRuleId = useMemo(() => {
    const m = new Map();
    for (const run of allRuns) {
      if (!run?.ruleId) continue;
      const list = m.get(run.ruleId) || [];
      list.push(run);
      m.set(run.ruleId, list);
    }
    return m;
  }, [allRuns]);

  const ruleRows = useMemo(() => {
    return rules.map((rule) => {
      const status = getRuleStatus(rule);
      const actions = getRuleActions(rule);
      const successRate = getSuccessRate(rule, runsByRuleId);
      const businessTypeCompatible = isTriggerAllowedForTenant(rule.triggerType, activeTenant);
      return {
        ...rule,
        status,
        actions,
        actionCount: actions.length,
        description: getRuleDescription(rule),
        triggerDisplay: getTriggerDisplay(rule),
        channelDisplay: getChannelDisplay(rule),
        successRate,
        totalRuns: runsByRuleId.get(rule.id)?.length || 0,
        recentRuns: (runsByRuleId.get(rule.id) || []).slice(0, 5),
        lastRunTime: rule?.lastRun?.createdAt || null,
        lastRunOutcome: formatRunOutcome(rule?.lastRun),
        businessTypeCompatible,
        branchLabel: resolveAutomationBranchLabel(rule, branchLists),
      };
    });
  }, [rules, runsByRuleId, activeTenant, branchLists]);

  const aiBuilderRows = useMemo(() => {
    const rows = ruleRows.map((rule) => ({
      ...rule,
      aiSourceTag: getRuleAiSource(rule),
      aiStatus: getAiBuilderStatus(rule),
    }));
    const aiRows = rows.filter((rule) => rule.aiSourceTag === 'AI generated');
    return aiRows.length ? aiRows : rows;
  }, [ruleRows]);

  const filteredAiBuilderRows = useMemo(() => {
    const filtered = aiBuilderRows.filter((rule) => {
      const matchesStatus = aiBuilderStatusFilter === 'all' || rule.aiStatus === aiBuilderStatusFilter;
      return matchesStatus;
    });
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
  }, [aiBuilderRows, aiBuilderStatusFilter]);

  const aiBuilderTotalPages = Math.max(1, Math.ceil(filteredAiBuilderRows.length / aiBuilderPageSize));
  const visibleAiBuilderRows = useMemo(() => {
    const start = (aiBuilderPage - 1) * aiBuilderPageSize;
    return filteredAiBuilderRows.slice(start, start + aiBuilderPageSize);
  }, [aiBuilderPage, aiBuilderPageSize, filteredAiBuilderRows]);
  const aiBuilderRangeStart = filteredAiBuilderRows.length ? (aiBuilderPage - 1) * aiBuilderPageSize + 1 : 0;
  const aiBuilderRangeEnd = Math.min(aiBuilderPage * aiBuilderPageSize, filteredAiBuilderRows.length);
  const hasAiTaggedRules = aiBuilderRows.some((rule) => rule.aiSourceTag === 'AI generated');

  useEffect(() => {
    setAiBuilderPage(1);
  }, [aiBuilderStatusFilter, aiBuilderPageSize]);

  useEffect(() => {
    setAiBuilderPage((page) => Math.min(page, aiBuilderTotalPages));
  }, [aiBuilderTotalPages]);

  const rulesStats = useMemo(() => {
    const active = ruleRows.filter((rule) => rule.status === 'active').length;
    const failed = ruleRows.filter((rule) => rule.status === 'failed').length;
    const successfulRuns = allRuns.filter((run) => run.status !== 'failed').length;
    const successRate = allRuns.length ? Math.round((successfulRuns / allRuns.length) * 100) : 0;
    return [
      { label: 'Active rules', value: active, helper: active ? 'Ready to run' : 'No active rules', Icon: PlayCircle, color: 'text-green-700', bg: 'bg-green-50' },
      { label: 'Failed rules', value: failed, helper: failed ? 'Needs attention' : 'No failures', Icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50' },
      { label: 'Total executions', value: allRuns.length.toLocaleString(), helper: allRuns.length ? 'Latest recorded runs' : 'No executions yet', Icon: Zap, color: 'text-purple-700', bg: 'bg-purple-50' },
      { label: 'Success rate', value: `${successRate}%`, helper: allRuns.length ? 'From recent runs' : 'No run data yet', Icon: CheckCircle2, color: 'text-blue-700', bg: 'bg-blue-50' },
    ];
  }, [allRuns, ruleRows]);

  const filteredRuleRows = useMemo(() => {
    const filtered = ruleRows.filter((rule) => {
      const matchesStatus = ruleStatusFilter === 'all' || rule.status === ruleStatusFilter;
      const matchesBranch =
        ruleBranchFilter === 'any' ||
        (ruleBranchFilter === ALL_BRANCHES_VALUE
          ? !rule.shopId && !rule.studioLocationId
          : rule.shopId === ruleBranchFilter || rule.studioLocationId === ruleBranchFilter);
      return matchesStatus && matchesBranch;
    });

    return [...filtered].sort((a, b) => {
      if (ruleSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      if (ruleSort === 'success') return (b.successRate ?? -1) - (a.successRate ?? -1);
      if (ruleSort === 'lastRun') return new Date(b.lastRunTime || 0).getTime() - new Date(a.lastRunTime || 0).getTime();
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    });
  }, [ruleRows, ruleSort, ruleStatusFilter, ruleBranchFilter]);

  const rulesTotalPages = Math.max(1, Math.ceil(filteredRuleRows.length / rulesPageSize));
  const visibleRuleRows = useMemo(() => {
    const start = (rulesPage - 1) * rulesPageSize;
    return filteredRuleRows.slice(start, start + rulesPageSize);
  }, [filteredRuleRows, rulesPage, rulesPageSize]);
  const ruleRangeStart = filteredRuleRows.length ? (rulesPage - 1) * rulesPageSize + 1 : 0;
  const ruleRangeEnd = Math.min(rulesPage * rulesPageSize, filteredRuleRows.length);
  const viewingRule = useMemo(
    () => ruleRows.find((rule) => rule.id === viewingRuleId) || null,
    [ruleRows, viewingRuleId]
  );

  useEffect(() => {
    setRulesPage(1);
  }, [ruleStatusFilter, ruleSort, ruleBranchFilter, rulesPageSize]);

  useEffect(() => {
    setRulesPage((page) => Math.min(page, rulesTotalPages));
  }, [rulesTotalPages]);

  const historyRows = useMemo(() => {
    const sourceRuns = selectedRuleId ? runs : allRuns;
    return sourceRuns.map((run) => {
      const rule = ruleById.get(run?.ruleId);
      const triggerContext = run?.triggerContext || {};
      const runActions = getRunActions(run);
      const configuredActions = getRuleActions(rule);
      const actions = runActions.length ? runActions : configuredActions;
      const channels = Array.from(new Set((actions.length ? actions : [{ type: 'automation' }]).map(actionChannel)));
      const durationMs = getRunDurationMs(run);
      const recordParts = [
        triggerContext.invoiceNumber,
        triggerContext.quoteNumber,
        triggerContext.productName ? triggerContext.sku || triggerContext.productId : null,
        triggerContext.dealId,
        triggerContext.subjectKey,
      ].filter(Boolean);
      const recipientName =
        triggerContext.assigneeName ||
        triggerContext.recipientName ||
        triggerContext.customerName ||
        triggerContext.companyName ||
        triggerContext.productName ||
        triggerContext.recipientName ||
        (triggerContext.scheduler ? 'Dashboard' : 'Record');

      return {
        id: run.id,
        raw: run,
        createdAt: run.createdAt || run.startedAt,
        ruleId: run.ruleId,
        ruleName: rule?.name || ruleNameById.get(run?.ruleId) || 'Automation run',
        trigger: triggerLabel(rule?.triggerType || triggerContext.triggerType || 'manual_test'),
        recipientName,
        recordLabel: recordParts[0] || triggerContext.email || triggerContext.phone || (triggerContext.scheduler ? 'Internal' : ''),
        channels,
        status: normalizeRunStatus(run?.status),
        durationMs,
        durationLabel: formatDuration(durationMs),
        error: run?.error,
      };
    });
  }, [allRuns, ruleById, ruleNameById, runs, selectedRuleId]);

  const filteredHistoryRows = useMemo(() => {
    const now = new Date();
    const dateCutoff = (() => {
      if (historyDateRange === 'today') return startOfToday();
      if (historyDateRange === '7d') {
        const date = new Date(now);
        date.setDate(date.getDate() - 7);
        return date;
      }
      if (historyDateRange === '30d') {
        const date = new Date(now);
        date.setDate(date.getDate() - 30);
        return date;
      }
      return null;
    })();

    return historyRows.filter((row) => {
      const createdAt = row.createdAt ? new Date(row.createdAt) : null;
      const matchesRule = !selectedRuleId || row.ruleId === selectedRuleId;
      const matchesStatus = historyStatusFilter === 'all' || row.status === historyStatusFilter;
      const matchesChannel = historyChannelFilter === 'all' || row.channels.includes(historyChannelFilter);
      const matchesDate =
        !dateCutoff ||
        (createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= dateCutoff);
      return matchesRule && matchesStatus && matchesChannel && matchesDate;
    });
  }, [historyChannelFilter, historyDateRange, historyRows, historyStatusFilter, selectedRuleId]);

  const historyStats = useMemo(() => {
    const successful = filteredHistoryRows.filter((row) => row.status === 'success').length;
    const failed = filteredHistoryRows.filter((row) => row.status === 'failed').length;
    const pending = filteredHistoryRows.filter((row) => row.status === 'pending').length;
    const durations = filteredHistoryRows
      .map((row) => row.durationMs)
      .filter((value) => Number.isFinite(value));
    const avgDuration = durations.length
      ? durations.reduce((total, value) => total + value, 0) / durations.length
      : null;

    return {
      total: filteredHistoryRows.length,
      successful,
      failed,
      pending,
      successRate: filteredHistoryRows.length ? Math.round((successful / filteredHistoryRows.length) * 100) : 0,
      failureRate: filteredHistoryRows.length ? Math.round((failed / filteredHistoryRows.length) * 100) : 0,
      pendingRate: filteredHistoryRows.length ? Math.round((pending / filteredHistoryRows.length) * 100) : 0,
      avgDurationLabel: formatDuration(avgDuration),
    };
  }, [filteredHistoryRows]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryRows.length / historyPageSize));
  const visibleHistoryRows = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredHistoryRows.slice(start, start + historyPageSize);
  }, [filteredHistoryRows, historyPage, historyPageSize]);
  const historyRangeStart = filteredHistoryRows.length ? (historyPage - 1) * historyPageSize + 1 : 0;
  const historyRangeEnd = Math.min(historyPage * historyPageSize, filteredHistoryRows.length);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyStatusFilter, historyChannelFilter, historyDateRange, selectedRuleId, historyPageSize]);

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyTotalPages));
  }, [historyTotalPages]);

  const exportHistory = useCallback(() => {
    const headers = ['Time', 'Rule name', 'Trigger', 'Recipient / Record', 'Channel', 'Status', 'Duration', 'Error'];
    const csvRows = filteredHistoryRows.map((row) => [
      formatDateTime(row.createdAt),
      row.ruleName,
      row.trigger,
      [row.recipientName, row.recordLabel].filter(Boolean).join(' - '),
      row.channels.map((channel) => channelMeta(channel).label).join(', '),
      row.status,
      row.durationLabel,
      row.error || '',
    ]);
    const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `automation-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredHistoryRows]);

  const logRows = useMemo(() => {
    if (serverLogs?.logs) {
      return serverLogs.logs.map(mapApiLogEntry);
    }

    const runLogs = allRuns.flatMap((run) => {
      const rule = ruleById.get(run?.ruleId);
      const triggerContext = run?.triggerContext || {};
      const actions = getRunActions(run);
      const configuredActions = getRuleActions(rule);
      const runChannels = Array.from(
        new Set((actions.length ? actions : configuredActions).map(actionChannel).filter(Boolean))
      );
      const fallbackChannel = runChannels[0] || 'automation';
      const durationMs = getRunDurationMs(run);
      const ruleName = rule?.name || ruleNameById.get(run?.ruleId) || 'Automation run';
      const trigger = triggerLabel(rule?.triggerType || triggerContext.triggerType || 'manual_test');
      const startedLog = {
        id: `run-${run.id}-started`,
        source: 'AutomationRun',
        relatedExecutionId: run.id,
        raw: run,
        time: run.startedAt || run.createdAt,
        level: 'info',
        status: 'event',
        ruleId: run.ruleId,
        ruleName,
        trigger,
        message: 'Rule execution started',
        channel: fallbackChannel,
        channels: runChannels.length ? runChannels : [fallbackChannel],
        durationMs: null,
        durationLabel: '-',
        logData: {
          id: `${run.id}:started`,
          source: 'AutomationRun',
          runId: run.id,
          status: 'started',
          triggerContext,
          startedAt: run.startedAt,
        },
      };
      const runLevel = logLevelForStatus(run?.status);
      const outcomeLog = {
        id: `run-${run.id}-outcome`,
        source: 'AutomationRun',
        relatedExecutionId: run.id,
        raw: run,
        time: run.finishedAt || run.createdAt || run.startedAt,
        level: runLevel,
        status: normalizeRunStatus(run?.status),
        ruleId: run.ruleId,
        ruleName,
        trigger,
        message: buildRunMessage(run, actions.length),
        channel: fallbackChannel,
        channels: runChannels.length ? runChannels : [fallbackChannel],
        durationMs,
        durationLabel: formatDuration(durationMs),
        logData: {
          id: `${run.id}:outcome`,
          source: 'AutomationRun',
          runId: run.id,
          status: run.status,
          triggerContext,
          resultSummary: run.resultSummary,
          error: run.error,
        },
      };

      const actionLogs = actions.map((action, index) => {
        const channel = actionChannel(action);
        const level = action?.success === false
          ? 'error'
          : (action?.skipped || action?.reason)
            ? 'warning'
            : 'success';
        return {
          id: `run-${run.id}-action-${index}`,
          source: 'AutomationRun.action',
          relatedExecutionId: run.id,
          raw: action,
          time: run.finishedAt || run.createdAt || run.startedAt,
          level,
          status: logStatusForLevel(level),
          ruleId: run.ruleId,
          ruleName,
          trigger,
          message: buildActionMessage(action, triggerContext),
          channel,
          channels: [channel],
          durationMs,
          durationLabel: formatDuration(durationMs),
          logData: {
            id: `${run.id}:action:${index}`,
            source: 'AutomationRun.resultSummary.results',
            runId: run.id,
            ruleId: run.ruleId,
            action,
            triggerContext,
          },
        };
      });

      return [startedLog, outcomeLog, ...actionLogs];
    });

    const eventLogs = whatsAppEvents.map((event) => {
      const metadata = event?.metadata || {};
      const ruleId = metadata.automationRuleId || metadata.ruleId || '';
      const level = event?.error ? 'error' : logLevelForStatus(event?.status || event?.eventType);
      const phone = event?.recipientPhone || event?.senderPhone || metadata.phone || '';
      const eventName = event?.templateName || event?.eventType || 'WhatsApp event';
      return {
        id: `wa-${event.id}`,
        source: 'WhatsAppMessageEvent',
        relatedExecutionId: metadata.automationRunId || '',
        raw: event,
        time: event.occurredAt || event.createdAt,
        level,
        status: event?.error ? 'failed' : normalizeRunStatus(event?.status || event?.eventType || 'event'),
        ruleId,
        ruleName: ruleNameById.get(ruleId) || 'WhatsApp message event',
        trigger: triggerLabel(metadata.triggerType || 'whatsapp_event'),
        message: event?.error
          ? `WhatsApp ${eventName} failed${phone ? ` for ${phone}` : ''}: ${event.error}`
          : `WhatsApp ${eventName}${event?.status ? ` ${event.status}` : ' recorded'}${phone ? ` for ${phone}` : ''}`,
        channel: 'whatsapp',
        channels: ['whatsapp'],
        durationMs: null,
        durationLabel: '-',
        logData: {
          id: event.id,
          source: 'WhatsAppMessageEvent',
          messageId: event.messageId,
          direction: event.direction,
          eventType: event.eventType,
          status: event.status,
          templateName: event.templateName,
          payload: event.payload,
          metadata,
          error: event.error,
        },
      };
    });

    return [...runLogs, ...eventLogs].sort(
      (a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()
    );
  }, [allRuns, ruleById, ruleNameById, serverLogs, whatsAppEvents]);

  const filteredLogRows = useMemo(() => {
    if (serverLogs?.logs) return logRows;
    const now = new Date();
    const dateCutoff = (() => {
      if (logDateRange === 'today') return startOfToday();
      if (logDateRange === '7d') {
        const date = new Date(now);
        date.setDate(date.getDate() - 7);
        return date;
      }
      if (logDateRange === '30d') {
        const date = new Date(now);
        date.setDate(date.getDate() - 30);
        return date;
      }
      return null;
    })();

    return logRows.filter((row) => {
      const createdAt = getLogDate(row);
      const matchesRule = logRuleFilter === 'all' || row.ruleId === logRuleFilter;
      const matchesStatus = logStatusFilter === 'all' || row.status === logStatusFilter;
      const matchesLevel = logLevelFilter === 'all' || row.level === logLevelFilter;
      const matchesChannel = logChannelFilter === 'all' || row.channels.includes(logChannelFilter);
      const matchesDate = !dateCutoff || (createdAt && createdAt >= dateCutoff);
      return matchesRule && matchesStatus && matchesLevel && matchesChannel && matchesDate;
    });
  }, [logChannelFilter, logDateRange, logLevelFilter, logRows, logRuleFilter, logStatusFilter]);

  const logStats = useMemo(() => {
    const total = filteredLogRows.length;
    const countLevel = (level) => filteredLogRows.filter((row) => row.level === level).length;
    const pct = (count) => (total ? `${Math.round((count / total) * 100)}%` : '0%');
    const info = countLevel('info');
    const success = countLevel('success');
    const warning = countLevel('warning');
    const error = countLevel('error');
    return { total, info, success, warning, error, pct };
  }, [filteredLogRows]);

  const logsTotalPages = serverLogs?.totalPages ?? Math.max(1, Math.ceil(filteredLogRows.length / logsPageSize));
  const visibleLogRows = useMemo(() => {
    if (serverLogs?.logs) return logRows;
    const start = (logsPage - 1) * logsPageSize;
    return filteredLogRows.slice(start, start + logsPageSize);
  }, [filteredLogRows, logRows, logsPage, logsPageSize, serverLogs]);
  const logsRangeStart = serverLogs?.total
    ? (serverLogs.total ? (logsPage - 1) * logsPageSize + 1 : 0)
    : (filteredLogRows.length ? (logsPage - 1) * logsPageSize + 1 : 0);
  const logsRangeEnd = serverLogs?.total
    ? Math.min(logsPage * logsPageSize, serverLogs.total)
    : Math.min(logsPage * logsPageSize, filteredLogRows.length);
  const selectedLog = useMemo(
    () => filteredLogRows.find((row) => row.id === selectedLogId) || filteredLogRows[0] || null,
    [filteredLogRows, selectedLogId]
  );
  const selectedLogJson = useMemo(() => (selectedLog ? JSON.stringify(selectedLog.logData, null, 2) : ''), [selectedLog]);

  useEffect(() => {
    setLogsPage(1);
  }, [logRuleFilter, logStatusFilter, logLevelFilter, logChannelFilter, logDateRange, logsPageSize]);

  useEffect(() => {
    setLogsPage((page) => Math.min(page, logsTotalPages));
  }, [logsTotalPages]);

  useEffect(() => {
    if (selectedLogId && filteredLogRows.some((row) => row.id === selectedLogId)) return;
    setSelectedLogId(filteredLogRows[0]?.id || '');
  }, [filteredLogRows, selectedLogId]);

  const exportLogs = useCallback(() => {
    const headers = ['Time', 'Level', 'Status', 'Rule name', 'Trigger', 'Message', 'Channel', 'Duration', 'Log ID', 'Execution ID'];
    const csvRows = filteredLogRows.map((row) => [
      formatDateTime(row.time),
      LOG_LEVEL_META[row.level]?.label || row.level,
      row.status,
      row.ruleName,
      row.trigger,
      row.message,
      row.channels.map((channel) => channelMeta(channel).label).join(', '),
      row.durationLabel,
      row.id,
      row.relatedExecutionId || '',
    ]);
    const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `automation-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredLogRows]);

  const copySelectedLog = useCallback(async () => {
    if (!selectedLogJson) return;
    try {
      await navigator.clipboard.writeText(selectedLogJson);
      showSuccess('Log copied');
    } catch {
      showError('Could not copy log');
    }
  }, [selectedLogJson]);

  const automationStats = useMemo(() => {
    if (overview) {
      return {
        activeAutomations: overview.activeRulesCount ?? 0,
        runsToday: overview.runsToday ?? 0,
        messagesSentToday: overview.messagesSentToday ?? 0,
        tasksCreatedToday: overview.tasksCreatedToday ?? 0,
      };
    }

    const todayRuns = runs.filter((run) => isToday(run?.createdAt));
    const taskActionsToday = todayRuns.reduce(
      (count, run) => count + getRunActions(run).filter((action) => action?.type === 'create_task' && action?.success !== false).length,
      0
    );
    const messageActionsToday = todayRuns.reduce(
      (count, run) =>
        count +
        getRunActions(run).filter(
          (action) =>
            ['send_whatsapp', 'send_email_platform', 'send_sms'].includes(action?.type)
            && action?.success !== false
            && !action?.skipped
        ).length,
      0
    );
    const whatsappSentToday = whatsAppEvents.filter(
      (event) => isToday(event?.createdAt) && String(event?.direction || '').toLowerCase() !== 'inbound'
    ).length;

    return {
      activeAutomations: rules.filter((rule) => rule.enabled).length,
      runsToday: todayRuns.length,
      messagesSentToday: Math.max(messageActionsToday, whatsappSentToday),
      tasksCreatedToday: taskActionsToday,
    };
  }, [overview, rules, runs, whatsAppEvents]);

  const recentActivity = useMemo(() => {
    if (overview?.recentActivity?.length) {
      return overview.recentActivity.slice(0, 5).map((item) => ({
        id: item.id,
        type: item.channel === 'whatsapp' ? 'whatsapp' : 'automation',
        title: item.title,
        subtitle: item.subtitle,
        status: item.status,
        createdAt: item.time,
      }));
    }

    const runActivity = runs.map((run) => {
      const firstAction = getRunActions(run)[0];
      const ruleName = ruleNameById.get(run?.ruleId) || 'Automation run';
      return {
        id: `run-${run.id}`,
        type: firstAction?.type || 'automation',
        title: statusIsFailed(run?.status) ? `${ruleName} failed` : `${ruleName} ran`,
        subtitle: firstAction ? `${actionLabel(firstAction)} workflow` : triggerLabel(run?.triggerType || ''),
        status: run?.status || 'success',
        createdAt: run?.createdAt,
      };
    });
    const eventActivity = whatsAppEvents.map((event) => ({
      id: `wa-${event.id}`,
      type: 'whatsapp',
      title: event?.templateName ? `${event.templateName} message ${event?.status || 'event'}` : 'WhatsApp message event',
      subtitle: [event?.direction, event?.eventType, event?.messageId].filter(Boolean).join(' · '),
      status: event?.status || event?.eventType || 'event',
      createdAt: event?.createdAt,
    }));

    return [...runActivity, ...eventActivity]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 5);
  }, [overview, runs, ruleNameById, whatsAppEvents]);

  const topAutomations = useMemo(() => {
    if (overview?.topPerformingRules?.length) {
      return overview.topPerformingRules.slice(0, 4).map((item) => ({
        id: item.ruleId,
        name: item.ruleName,
        channel: triggerLabel(item.channel),
        rate: item.successRate,
        type: item.channel,
        count: item.runsCount,
      }));
    }

    return rules
      .map((rule) => {
        const ruleRuns = runs.filter((run) => run.ruleId === rule.id);
        const successes = ruleRuns.filter((run) => statusIsSuccessful(run?.status || 'success')).length;
        const rate = ruleRuns.length ? Math.round((successes / ruleRuns.length) * 100) : rule.enabled ? 100 : 0;
        return {
          id: rule.id,
          name: rule.name || 'Automation',
          channel: triggerLabel(rule.triggerType),
          rate,
          type: rule.triggerType,
          count: ruleRuns.length,
        };
      })
      .sort((a, b) => b.rate - a.rate || b.count - a.count)
      .slice(0, 4);
  }, [overview, rules, runs]);

  const systemHealthMessage = overview?.systemHealth?.message || 'All systems operational';
  const systemHealthIsDegraded = overview?.systemHealth?.status === 'degraded';

  const lastCheckedAt = useMemo(() => {
    if (overview?.systemHealth?.schedulerLastRunAt) {
      return formatRelativeTime(overview.systemHealth.schedulerLastRunAt);
    }

    const latest = [...runs, ...whatsAppEvents]
      .map((item) => item?.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    return formatRelativeTime(latest);
  }, [overview, runs, whatsAppEvents]);

  useEffect(() => {
    const cfg = organization?.taskAutomation || {};
    setTaskAutomationDraft({
      leadFollowUpToTask: cfg?.leadFollowUpToTask !== false,
      invoiceOverdueToTask: cfg?.invoiceOverdueToTask === true,
      quoteNoResponseToTask: cfg?.quoteNoResponseToTask === true,
      lowStockToTask: cfg?.lowStockToTask === true,
      quoteNoResponseDays: Number.parseInt(cfg?.quoteNoResponseDays, 10) || 3,
    });
  }, [organization?.taskAutomation]);

  const createMutation = useMutation({
    mutationFn: (payload) => automationService.createRule(payload),
    onSuccess: (response) => {
      const enabled = response?.data?.enabled !== false;
      showSuccess(enabled ? 'Automation rule created' : 'Automation draft saved');
      setBuilder(createInitialBuilder());
      setEditingRuleId('');
      setUseJsonOverride(false);
      setRawJson(INITIAL_RAW_JSON);
      setAdvancedOpen(false);
      setAiPromptOpen(false);
      setAiDraftMetadata(null);
      setBuilderModalOpen(false);
      setBuilderStep('trigger');
      queryClient.invalidateQueries({ queryKey: ['automations', 'rules'] });
    },
    onError: (error) => handleApiError(error, { context: 'Create automation rule' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => automationService.updateRule(id, payload),
    onSuccess: () => {
      showSuccess('Automation rule updated');
      setBuilder(createInitialBuilder());
      setEditingRuleId('');
      setUseJsonOverride(false);
      setRawJson(INITIAL_RAW_JSON);
      setAdvancedOpen(false);
      setAiPromptOpen(false);
      setAiDraftMetadata(null);
      setBuilderModalOpen(false);
      setBuilderStep('trigger');
      queryClient.invalidateQueries({ queryKey: ['automations', 'rules'] });
    },
    onError: (error) => handleApiError(error, { context: 'Update automation rule' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => automationService.deleteRule(id),
    onSuccess: () => {
      showSuccess('Automation rule deleted');
      queryClient.invalidateQueries({ queryKey: ['automations', 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['automations', 'runs'] });
    },
    onError: (error) => handleApiError(error, { context: 'Delete automation rule' }),
  });

  const draftMutation = useMutation({
    mutationFn: (instruction) => automationService.draftRule(instruction),
    onSuccess: (response, instruction) => {
      const draft = response?.data || {};
      setBuilder({
        name: draft.name || '',
        triggerType: draft.triggerType || 'invoice_due_in_days',
        triggerForm: mergeTriggerForm(draft.triggerType || 'invoice_due_in_days', draft.triggerConfig || {}),
        conditionForm: conditionFormFromConfig(draft.conditionConfig || {}, draft.scheduleConfig || {}, draft.triggerType || 'invoice_due_in_days'),
        actionRows: actionRowsFromConfig(draft.actionConfig),
        shopId: null,
        studioLocationId: null,
      });
      setUseJsonOverride(false);
      setEditingRuleId('');
      setAdvancedOpen(true);
      setRawJson({
        triggerConfig: JSON.stringify(draft.triggerConfig || {}, null, 2),
        conditionConfig: JSON.stringify(draft.conditionConfig || {}, null, 2),
        actionConfig: JSON.stringify(draft.actionConfig || { actions: [] }, null, 2),
        scheduleConfig: JSON.stringify(draft.scheduleConfig || { cooldownHours: 24 }, null, 2),
      });
      setAiPromptOpen(true);
      setAiDraftMetadata({
        source: 'ai-builder',
        aiDraft: true,
        aiGenerated: true,
        prompt: String(instruction || aiInstruction).trim(),
        description: draft.description || '',
        draftedAt: new Date().toISOString(),
      });
      showSuccess('AI draft created. Review before saving or enabling.');
      setBuilderStep('review');
      setBuilderModalOpen(true);
    },
    onError: (error) => handleApiError(error, { context: 'Draft automation rule' }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => automationService.toggleRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', 'rules'] });
    },
    onError: (error) => handleApiError(error, { context: 'Toggle automation rule' }),
  });

  const testMutation = useMutation({
    mutationFn: (variables) => {
      const id = typeof variables === 'string' ? variables : variables?.id;
      const triggerContext = typeof variables === 'string' ? {} : variables?.triggerContext || {};
      if (!id) throw new Error('Automation rule ID is required to run a test.');
      return automationService.testRule(id, triggerContext, { force: true });
    },
    onSuccess: () => {
      showSuccess('Test run created');
      queryClient.invalidateQueries({ queryKey: ['automations', 'runs'] });
      queryClient.invalidateQueries({ queryKey: ['automations', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['automations', 'logs'] });
      queryClient.invalidateQueries({ queryKey: ['automations', 'whatsapp-events'] });
    },
    onError: (error) => handleApiError(error, { context: 'Test automation rule' }),
  });
  const saveTaskAutomationMutation = useMutation({
    mutationFn: (payload) => settingsService.updateOrganization({ taskAutomation: payload }),
    onSuccess: () => {
      showSuccess('Task automations updated');
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
    },
    onError: (error) => handleApiError(error, { context: 'Update task automations' }),
  });

  const applyTemplate = useCallback((t) => {
    const tt = t.triggerType || 'invoice_due_in_days';
    setBuilder({
      name: t.name || '',
      triggerType: tt,
      triggerForm: mergeTriggerForm(tt, t.triggerConfig || {}),
      conditionForm: conditionFormFromConfig(t.conditionConfig || {}, t.scheduleConfig || {}, t.triggerType),
      actionRows: actionRowsFromConfig(t.actionConfig),
      shopId: null,
      studioLocationId: null,
    });
    setUseJsonOverride(false);
    setEditingRuleId('');
    setAdvancedOpen(false);
    setAiPromptOpen(true);
    setAiDraftMetadata(null);
    setBuilderStep('review');
    setBuilderModalOpen(true);
  }, []);

  const handleUseTemplate = useCallback(
    (template) => {
      applyTemplate(template);
    },
    [applyTemplate]
  );

  const openAiDraftFlow = useCallback((prompt = '') => {
    if (prompt) setAiInstruction(prompt);
    setAiPromptOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById('ai-builder-draft-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('ai-builder-prompt')?.focus();
    });
  }, []);

  const handleStartWithAi = useCallback(() => {
    openAiDraftFlow();
  }, [openAiDraftFlow]);

  const handleHowItWorks = useCallback(() => {
    document.getElementById('ai-builder-examples')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleUseAiExample = useCallback(
    (example) => {
      setAiInstruction(example.prompt);
      setAiPromptOpen(true);
      setActiveTab('ai-builder');
      draftMutation.mutate(example.prompt);
      window.requestAnimationFrame(() => {
        document.getElementById('ai-builder-draft-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [draftMutation]
  );

  const editRule = useCallback((rule) => {
    const tt = rule.triggerType || 'invoice_due_in_days';
    const ruleId = rule?.id != null ? String(rule.id) : '';
    setEditingRuleId(ruleId);
    editingRuleIdRef.current = ruleId;
    setBuilder({
      name: rule.name || '',
      triggerType: tt,
      triggerForm: mergeTriggerForm(tt, rule.triggerConfig || {}),
      conditionForm: conditionFormFromConfig(rule.conditionConfig || {}, rule.scheduleConfig || {}, rule.triggerType),
      actionRows: actionRowsFromConfig(rule.actionConfig),
      shopId: rule.shopId || null,
      studioLocationId: rule.studioLocationId || null,
    });
    setRawJson({
      triggerConfig: JSON.stringify(rule.triggerConfig || {}, null, 2),
      conditionConfig: JSON.stringify(rule.conditionConfig || {}, null, 2),
      actionConfig: JSON.stringify(rule.actionConfig || { actions: [] }, null, 2),
      scheduleConfig: JSON.stringify(rule.scheduleConfig || {}, null, 2),
    });
    setUseJsonOverride(false);
    setAdvancedOpen(false);
    setAiPromptOpen(true);
    setAiDraftMetadata(null);
    setBuilderStep('review');
    setBuilderModalOpen(true);
  }, []);

  const handleViewRuleEdit = useCallback(
    (rule) => {
      setViewingRuleId('');
      editRule(rule);
    },
    [editRule]
  );

  const handleViewRuleTest = useCallback(
    (rule) => {
      const actionRows = actionRowsFromConfig(rule.actionConfig);
      if (ruleHasMessagingActions(actionRows)) {
        setPendingTestRun({
          source: 'rule',
          ruleId: rule.id,
          triggerType: rule.triggerType || '',
          actionRows,
          baseContext: { manualTest: true, test: true, triggerType: rule.triggerType || '' },
        });
        setTestRecipientDialogOpen(true);
        return;
      }
      testMutation.mutate(rule.id);
    },
    [testMutation]
  );

  const handleViewRuleToggle = useCallback(
    (rule) => {
      toggleMutation.mutate(rule.id);
    },
    [toggleMutation]
  );

  const handleViewRuleDelete = useCallback(
    (rule) => {
      if (!window.confirm(`Delete automation rule "${rule.name}"?`)) return;
      deleteMutation.mutate(rule.id);
      setViewingRuleId('');
    },
    [deleteMutation]
  );

  const handleViewRuleRuns = useCallback((rule) => {
    setSelectedRuleId((id) => (id === rule.id ? '' : rule.id));
    setActiveTab('history');
    setViewingRuleId('');
  }, []);

  const patchTriggerForm = useCallback((patch) => {
    setBuilder((b) => ({ ...b, triggerForm: { ...b.triggerForm, ...patch } }));
  }, []);

  const patchConditionForm = useCallback((patch) => {
    setBuilder((b) => ({ ...b, conditionForm: { ...b.conditionForm, ...patch } }));
  }, []);

  const patchActionRow = useCallback((index, patch) => {
    setBuilder((b) => {
      const actionRows = b.actionRows.map((row, i) => (i === index ? { ...row, ...patch } : row));
      return { ...b, actionRows };
    });
  }, []);

  const changeTriggerType = useCallback((triggerType) => {
    const defaultFrequency = defaultFrequencyForTrigger(triggerType);
    const scheduleSeed = defaultFrequency
      ? { frequency: defaultFrequency }
      : supportsSendAfter(triggerType)
        ? { delayMinutes: defaultDelayMinutesForTrigger(triggerType) }
        : {};
    setBuilder((b) => ({
      ...b,
      triggerType,
      triggerForm: defaultTriggerForm(triggerType),
      conditionForm: {
        ...b.conditionForm,
        ...scheduleFormFromConfig(scheduleSeed, triggerType),
      },
      actionRows: prefillActionRows(b.actionRows, triggerType),
    }));
  }, []);

  /**
   * Update which branch (shop or studio location) the rule applies to.
   * @param {string} value - a shop id, studio location id, or ALL_BRANCHES_VALUE
   */
  const handleBranchChange = useCallback(
    (value) => {
      if (value === ALL_BRANCHES_VALUE) {
        setBuilder((b) => ({ ...b, shopId: null, studioLocationId: null }));
        return;
      }
      if (isShopWorkspace) {
        setBuilder((b) => ({ ...b, shopId: value, studioLocationId: null }));
      } else if (isStudioWorkspace) {
        setBuilder((b) => ({ ...b, shopId: null, studioLocationId: value }));
      }
    },
    [isShopWorkspace, isStudioWorkspace]
  );

  const branchSelectValue = builder.shopId || builder.studioLocationId || ALL_BRANCHES_VALUE;
  const branchOptions = isShopWorkspace ? shopBranches : isStudioWorkspace ? studioLocationBranches : [];
  const showBranchSelector = (isShopWorkspace || isStudioWorkspace) && branchOptions.length > 0;

  const setActionType = useCallback((index, type) => {
    setBuilder((b) => {
      const next = [...b.actionRows];
      next[index] = defaultActionFormRow(type, b.triggerType);
      return { ...b, actionRows: next };
    });
  }, []);

  const addActionRow = useCallback(() => {
    setBuilder((b) => {
      if (b.actionRows.length >= MAX_ACTIONS) return b;
      return { ...b, actionRows: [...b.actionRows, defaultActionFormRow('create_task', b.triggerType)] };
    });
  }, []);

  const removeActionRow = useCallback((index) => {
    setBuilder((b) => {
      if (b.actionRows.length <= 1) return b;
      return { ...b, actionRows: b.actionRows.filter((_, i) => i !== index) };
    });
  }, []);

  const openCreateAutomationModal = useCallback(() => {
    setBuilder(createInitialBuilder());
    setEditingRuleId('');
    setUseJsonOverride(false);
    setRawJson(INITIAL_RAW_JSON);
    setAdvancedOpen(false);
    setAiDraftMetadata(null);
    setBuilderStep('trigger');
    setBuilderModalOpen(true);
  }, []);

  const syncRawJsonFromForm = useCallback(() => {
    const payload = buildRulePayloadFromForm({
      name: builder.name || 'Preview',
      triggerType: builder.triggerType,
      triggerForm: builder.triggerForm,
      conditionForm: builder.conditionForm,
      actionRows: builder.actionRows,
    });
    setRawJson({
      triggerConfig: JSON.stringify(payload.triggerConfig, null, 2),
      conditionConfig: JSON.stringify(payload.conditionConfig, null, 2),
      actionConfig: JSON.stringify(payload.actionConfig, null, 2),
      scheduleConfig: JSON.stringify(payload.scheduleConfig, null, 2),
    });
  }, [builder]);

  const handleToggleJsonOverride = useCallback(
    (checked) => {
      if (checked) {
        syncRawJsonFromForm();
      }
      setUseJsonOverride(checked);
      if (checked) setAdvancedOpen(true);
    },
    [syncRawJsonFromForm]
  );

  const ruleSummary = useMemo(() => {
    if (useJsonOverride) return 'Using raw JSON — review the Advanced section before saving.';
    try {
      const p = buildRulePayloadFromForm({
        name: builder.name || '…',
        triggerType: builder.triggerType,
        triggerForm: builder.triggerForm,
        conditionForm: builder.conditionForm,
        actionRows: builder.actionRows,
      });
      const when = triggerLabel(builder.triggerType);
      const cond = getConditionLines(builder.conditionForm);
      const condStr = cond.length ? ` if ${cond.join(' and ')}` : '';
      const acts = (p.actionConfig.actions || []).map((a) => a.type?.replace(/_/g, ' ') || 'action');
      return `When “${when}”${condStr}, then: ${acts.join(', ') || 'nothing'}.`;
    } catch {
      return '';
    }
  }, [builder, useJsonOverride]);

  const buildAutomationPayloadFromCurrentForm = useCallback((enabled = true) => {
    const name = builder.name.trim();
    if (!name) {
      throw new Error('Enter a rule name.');
    }

    if (useJsonOverride) {
      const triggerConfig = parseJsonObject(rawJson.triggerConfig, 'Trigger config');
      const conditionConfig = parseJsonObject(rawJson.conditionConfig, 'Condition config');
      const actionConfig = parseJsonObject(rawJson.actionConfig, 'Action config');
      const scheduleConfig = parseJsonObject(rawJson.scheduleConfig, 'Schedule config');
      if (!Array.isArray(actionConfig.actions)) {
        throw new Error('Action config must include an "actions" array.');
      }
      const payload = {
        name,
        triggerType: builder.triggerType,
        triggerConfig,
        conditionConfig,
        actionConfig,
        scheduleConfig,
        enabled,
        shopId: builder.shopId || null,
        studioLocationId: builder.studioLocationId || null,
      };
      if (!editingRuleId && aiDraftMetadata) {
        payload.metadata = aiDraftMetadata;
      }
      return payload;
    }

    const payload = buildRulePayloadFromForm({
      name,
      triggerType: builder.triggerType,
      triggerForm: builder.triggerForm,
      conditionForm: builder.conditionForm,
      actionRows: builder.actionRows,
    });
    payload.enabled = enabled;
    payload.shopId = builder.shopId || null;
    payload.studioLocationId = builder.studioLocationId || null;
    if (!editingRuleId && aiDraftMetadata) {
      payload.metadata = aiDraftMetadata;
    }
    return payload;
  }, [aiDraftMetadata, builder, editingRuleId, rawJson, useJsonOverride]);

  const handleCreateRule = useCallback((options = {}) => {
    const enabled = options.enabled !== false;
    const currentEditingRuleId = editingRuleIdRef.current || editingRuleId;
    let payload;
    try {
      payload = buildAutomationPayloadFromCurrentForm(enabled);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Invalid automation rule');
      return;
    }

    // Create-only client guard. On edit, skip the local uniqueness toast and PATCH;
    // the API excludes the current rule id from the duplicate check.
    if (!currentEditingRuleId) {
      const duplicate = findDuplicateAutomationRule(rules, payload);
      if (duplicate) {
        showWarning(describeAutomationDuplicateConflict(duplicate, payload));
        return;
      }
      createMutation.mutate(payload);
      return;
    }

    updateMutation.mutate({ id: currentEditingRuleId, payload });
  }, [buildAutomationPayloadFromCurrentForm, createMutation, editingRuleId, rules, updateMutation]);

  const handleRunTest = useCallback(async () => {
    let payload;
    try {
      payload = buildAutomationPayloadFromCurrentForm(false);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Invalid automation rule');
      return;
    }

    const triggerContext = buildTestContextFromForm({
      name: builder.name,
      triggerType: builder.triggerType,
      triggerForm: builder.triggerForm,
      conditionForm: builder.conditionForm,
      actionRows: builder.actionRows,
    });

    if (ruleHasMessagingActions(builder.actionRows)) {
      setPendingTestRun({
        source: 'builder',
        editingRuleId,
        triggerType: builder.triggerType,
        actionRows: builder.actionRows,
        baseContext: triggerContext,
      });
      setTestRecipientDialogOpen(true);
      return;
    }

    if (editingRuleId) {
      testMutation.mutate({ id: editingRuleId, triggerContext });
      return;
    }

    setIsPreparingTest(true);
    let createdRuleId = '';
    try {
      const response = await automationService.createRule(payload);
      const createdRule = response?.data || {};
      createdRuleId = createdRule.id || '';
      if (!createdRuleId) {
        throw new Error('Draft saved but no automation ID was returned.');
      }
      setEditingRuleId(createdRuleId);
      queryClient.invalidateQueries({ queryKey: ['automations', 'rules'] });
      showSuccess('Automation draft saved. Running test.');
    } catch (error) {
      handleApiError(error, { context: 'Save automation draft for test' });
      setIsPreparingTest(false);
      return;
    }

    try {
      await testMutation.mutateAsync({ id: createdRuleId, triggerContext });
    } catch {
      // onError handles the user-facing toast.
    } finally {
      setIsPreparingTest(false);
    }
  }, [buildAutomationPayloadFromCurrentForm, builder, editingRuleId, queryClient, testMutation]);

  const executePendingTestRun = useCallback(async (recipient) => {
    if (!pendingTestRun) return;

    const recipientContext = buildTestRecipientContext(pendingTestRun.baseContext || {}, recipient);

    try {
      if (pendingTestRun.source === 'builder') {
        if (pendingTestRun.editingRuleId) {
          testMutation.mutate({ id: pendingTestRun.editingRuleId, triggerContext: recipientContext });
          return;
        }

        let payload;
        try {
          payload = buildAutomationPayloadFromCurrentForm(false);
        } catch (error) {
          showError(error instanceof Error ? error.message : 'Invalid automation rule');
          return;
        }

        setIsPreparingTest(true);
        let createdRuleId = '';
        try {
          const response = await automationService.createRule(payload);
          const createdRule = response?.data || {};
          createdRuleId = createdRule.id || '';
          if (!createdRuleId) {
            throw new Error('Draft saved but no automation ID was returned.');
          }
          setEditingRuleId(createdRuleId);
          queryClient.invalidateQueries({ queryKey: ['automations', 'rules'] });
          showSuccess('Automation draft saved. Running test.');
        } catch (error) {
          handleApiError(error, { context: 'Save automation draft for test' });
          return;
        } finally {
          setIsPreparingTest(false);
        }

        try {
          await testMutation.mutateAsync({ id: createdRuleId, triggerContext: recipientContext });
        } catch {
          // onError handles the user-facing toast.
        }
        return;
      }

      if (pendingTestRun.source === 'rule') {
        testMutation.mutate({ id: pendingTestRun.ruleId, triggerContext: recipientContext });
      }
    } finally {
      setTestRecipientDialogOpen(false);
      setPendingTestRun(null);
    }
  }, [pendingTestRun, buildAutomationPayloadFromCurrentForm, queryClient, testMutation]);

  const selectedTriggerMeta = useMemo(
    () =>
      allowedTriggerOptions.find((o) => o.value === builder.triggerType) ||
      TRIGGER_OPTIONS.find((o) => o.value === builder.triggerType),
    [allowedTriggerOptions, builder.triggerType]
  );
  const taskAutomationDirty = useMemo(() => {
    const cfg = organization?.taskAutomation || {};
    const baseline = {
      leadFollowUpToTask: cfg?.leadFollowUpToTask !== false,
      invoiceOverdueToTask: cfg?.invoiceOverdueToTask === true,
      quoteNoResponseToTask: cfg?.quoteNoResponseToTask === true,
      lowStockToTask: cfg?.lowStockToTask === true,
      quoteNoResponseDays: Number.parseInt(cfg?.quoteNoResponseDays, 10) || 3,
    };
    return JSON.stringify(taskAutomationDraft) !== JSON.stringify(baseline);
  }, [organization?.taskAutomation, taskAutomationDraft]);

  return (
    <div className="w-full space-y-5 md:space-y-6">
      <AutomationTestRecipientDialog
        open={testRecipientDialogOpen}
        onOpenChange={(open) => {
          setTestRecipientDialogOpen(open);
          if (!open) setPendingTestRun(null);
        }}
        triggerType={pendingTestRun?.triggerType || ''}
        actionRows={pendingTestRun?.actionRows || []}
        isSubmitting={testMutation.isPending || isPreparingTest}
        onConfirm={executePendingTestRun}
      />
      <AutomationCreationModal
        open={builderModalOpen}
        onOpenChange={setBuilderModalOpen}
        builder={builder}
        setBuilder={setBuilder}
        step={builderStep}
        setStep={setBuilderStep}
        conditionMode={conditionMode}
        setConditionMode={setConditionMode}
        selectedTriggerMeta={selectedTriggerMeta}
        allowedTriggerOptions={allowedTriggerOptions}
        patchTriggerForm={patchTriggerForm}
        patchConditionForm={patchConditionForm}
        patchActionRow={patchActionRow}
        setActionType={setActionType}
        addActionRow={addActionRow}
        removeActionRow={removeActionRow}
        changeTriggerType={changeTriggerType}
        handleCreateRule={handleCreateRule}
        handleRunTest={handleRunTest}
        isSaving={createMutation.isPending || updateMutation.isPending}
        isPreparingTest={isPreparingTest}
        editingRuleId={editingRuleId}
        testMutation={testMutation}
        businessName={businessName}
        tenantSlug={tenantSlug}
        showBranchSelector={showBranchSelector}
        branchSelectValue={branchSelectValue}
        branchOptions={branchOptions}
        branchLists={branchLists}
        handleBranchChange={handleBranchChange}
      />
      <AutomationRuleDetailsDrawer
        open={Boolean(viewingRuleId)}
        onOpenChange={(open) => {
          if (!open) setViewingRuleId('');
        }}
        rule={viewingRule}
        onEdit={handleViewRuleEdit}
        onTest={handleViewRuleTest}
        onToggle={handleViewRuleToggle}
        onDelete={handleViewRuleDelete}
        onViewRuns={handleViewRuleRuns}
        testInProgress={testMutation.isPending}
        toggleInProgress={toggleMutation.isPending}
        deleteInProgress={deleteMutation.isPending}
        waStatusByMessageId={waStatusByMessageId}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
            <Bot className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Automations</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              Create, manage and monitor rules that run your business automatically
            </p>
          </div>
        </div>

        <Button type="button" className="w-full bg-[#166534] hover:bg-[#14532d] sm:w-auto" onClick={openCreateAutomationModal}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Create automation
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto border-b border-border">
          <TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">
            {TAB_ITEMS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-xs font-medium text-muted-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-brand md:text-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Bot}
              label="Active automations"
              value={automationStats.activeAutomations}
              note={`${rules.length} total rules`}
              accent="green"
            />
            <StatCard
              icon={PlayCircle}
              label="Runs today"
              value={automationStats.runsToday}
              note={selectedRuleId ? 'Filtered by selected rule' : 'Across all workflows'}
              accent="blue"
            />
            <StatCard
              icon={MessageSquare}
              label="Messages sent today"
              value={automationStats.messagesSentToday}
              note="WhatsApp, email, SMS"
              accent="purple"
            />
            <StatCard
              icon={ClipboardList}
              label="Tasks created today"
              value={automationStats.tasksCreatedToday}
              note="Across all workflows"
              accent="blue"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card style={CARD_BORDER} className="rounded-2xl">
              <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Recent activity</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab('history')}>
                  View all
                </Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {(overviewQuery.isLoading || runsQuery.isLoading || whatsAppEventsQuery.isLoading) && (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading activity…
                  </div>
                )}
                {!overviewQuery.isLoading && !runsQuery.isLoading && !whatsAppEventsQuery.isLoading && recentActivity.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No automation activity yet.</p>
                  </div>
                )}
                {!overviewQuery.isLoading &&
                  !runsQuery.isLoading &&
                  !whatsAppEventsQuery.isLoading &&
                  recentActivity.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center"
                    >
                      <ActivityGlyph type={item.type} status={item.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle || 'Automation activity'}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <StatusChip status={item.status || 'event'} />
                        <p className="w-16 text-right text-xs text-muted-foreground">{formatTime(item.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                <button
                  type="button"
                  className="mx-auto mt-3 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setActiveTab('history')}
                >
                  View all activity
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card style={CARD_BORDER} className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Top performing automations</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab('rules')}>
                    View all
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rulesQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Loading automations…
                    </div>
                  )}
                  {!rulesQuery.isLoading && topAutomations.length === 0 && (
                    <p className="text-sm text-muted-foreground">Create rules to see performance here.</p>
                  )}
                  {!rulesQuery.isLoading &&
                    topAutomations.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                        <ActivityGlyph type={item.type} status="success" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.channel}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-emerald-700">{item.rate}%</p>
                          <p className="text-[11px] text-muted-foreground">Success rate</p>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>

              <Card style={CARD_BORDER} className="rounded-2xl">
                <CardContent className="flex items-start gap-3 p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">System health</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rulesQuery.isError || overviewQuery.isError || runsQuery.isError || whatsAppEventsQuery.isError
                        ? 'Some automation data could not be loaded'
                        : systemHealthMessage}
                    </p>
                    <p className={`mt-1 text-xs ${systemHealthIsDegraded ? 'text-amber-700' : 'text-muted-foreground'}`}>
                      {systemHealthIsDegraded ? 'Scheduler attention recommended' : `Last checked ${lastCheckedAt}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {rulesStats.map((stat) => {
              const StatIcon = stat.Icon;
              return (
                <Card key={stat.label} style={CARD_BORDER} className="rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
                        <StatIcon className={`h-5 w-5 ${stat.color}`} aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                        <p className="mt-1 text-2xl font-bold leading-none text-foreground">{stat.value}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">{stat.helper}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-5">
            <Card style={CARD_BORDER} className="hidden rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{editingRuleId ? 'Edit rule' : 'Create rule'}</CardTitle>
                <CardDescription>Trigger options below update automatically when you change the trigger type.</CardDescription>
              </CardHeader>
              <CardContent className="max-w-none space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="automation-rule-name">Rule name</Label>
                  <Input
                    id="automation-rule-name"
                    value={builder.name}
                    onChange={(e) => setBuilder((b) => ({ ...b, name: e.target.value }))}
                    placeholder="e.g. Invoice due reminder"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>When this happens (trigger)</Label>
                  <Select
                    value={builder.triggerType}
                    onValueChange={changeTriggerType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedTriggerOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTriggerMeta?.hint && !useJsonOverride && (
                    <p className="text-xs text-muted-foreground">{selectedTriggerMeta.hint}</p>
                  )}
                </div>

                {!useJsonOverride && (
                  <>
                    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                      <p className="text-sm font-medium text-foreground">Trigger settings</p>
                      <AutomationTriggerFields
                        triggerType={builder.triggerType}
                        value={builder.triggerForm}
                        onPatch={patchTriggerForm}
                      />
                      <AutomationFrequencyFields
                        triggerType={builder.triggerType}
                        conditionForm={builder.conditionForm}
                        onPatch={patchConditionForm}
                      />
                      <AutomationSendAfterFields
                        triggerType={builder.triggerType}
                        conditionForm={builder.conditionForm}
                        onPatch={patchConditionForm}
                      />
                    </div>

                    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                      <p className="text-sm font-medium text-foreground">Conditions (optional)</p>
                      <div className="space-y-1.5">
                        <Label htmlFor="auto-min-amount">Minimum invoice amount (optional)</Label>
                        <Input
                          id="auto-min-amount"
                          type="number"
                          min={0}
                          step="0.01"
                          value={builder.conditionForm.minInvoiceAmount}
                          onChange={(e) => patchConditionForm({ minInvoiceAmount: e.target.value })}
                          placeholder="Leave empty to skip"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="auto-weekdays" className="font-normal">
                          Only on weekdays (optional)
                        </Label>
                        <Switch
                          id="auto-weekdays"
                          checked={builder.conditionForm.weekdaysOnly}
                          onCheckedChange={(v) => patchConditionForm({ weekdaysOnly: v })}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Then do this</p>
                      {builder.actionRows.map((row, index) => (
                        <div key={index} className="space-y-2 rounded-md border border-border p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <Label>Action {index + 1}</Label>
                              <Select value={row.type} onValueChange={(v) => setActionType(index, v)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ACTION_TYPE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {builder.actionRows.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => removeActionRow(index)}
                              >
                                <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                                Remove
                              </Button>
                            )}
                          </div>
                          <AutomationActionFields row={row} triggerType={builder.triggerType} onPatch={(p) => patchActionRow(index, p)} />
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={addActionRow}
                        disabled={builder.actionRows.length >= MAX_ACTIONS}
                      >
                        <Plus className="mr-1 h-4 w-4" aria-hidden />
                        Add another action
                      </Button>
                    </div>

                    <div className="rounded-md border border-dashed border-border bg-background px-3 py-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</p>
                      <p className="mt-1 text-sm text-foreground">{ruleSummary}</p>
                    </div>
                  </>
                )}

                {useJsonOverride && (
                  <p className="text-sm text-muted-foreground">
                    Visual builder is off. Edit JSON in Advanced — rule name and trigger type above are still saved with the
                    rule.
                  </p>
                )}

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between font-normal">
                      <span>Advanced</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-3">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div>
                        <Label htmlFor="auto-json-override" className="font-medium">
                          Edit as raw JSON
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          For power users. Turns off the visual builder until you turn this off.
                        </p>
                      </div>
                      <Switch id="auto-json-override" checked={useJsonOverride} onCheckedChange={handleToggleJsonOverride} />
                    </div>
                    {useJsonOverride && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="raw-trigger">Trigger config (JSON)</Label>
                          <Textarea
                            id="raw-trigger"
                            className="font-mono text-xs"
                            rows={4}
                            spellCheck={false}
                            value={rawJson.triggerConfig}
                            onChange={(e) => setRawJson((r) => ({ ...r, triggerConfig: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="raw-condition">Condition config (JSON)</Label>
                          <Textarea
                            id="raw-condition"
                            className="font-mono text-xs"
                            rows={3}
                            spellCheck={false}
                            value={rawJson.conditionConfig}
                            onChange={(e) => setRawJson((r) => ({ ...r, conditionConfig: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="raw-action">Action config (JSON)</Label>
                          <Textarea
                            id="raw-action"
                            className="font-mono text-xs"
                            rows={8}
                            spellCheck={false}
                            value={rawJson.actionConfig}
                            onChange={(e) => setRawJson((r) => ({ ...r, actionConfig: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="raw-schedule">Schedule config (JSON) (optional)</Label>
                          <Textarea
                            id="raw-schedule"
                            className="font-mono text-xs"
                            rows={2}
                            spellCheck={false}
                            value={rawJson.scheduleConfig}
                            onChange={(e) => setRawJson((r) => ({ ...r, scheduleConfig: e.target.value }))}
                          />
                        </div>
                      </>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex justify-end pt-1">
                  {editingRuleId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mr-2"
                      onClick={() => {
                        setEditingRuleId('');
                        setBuilder(createInitialBuilder());
                        setRawJson(INITIAL_RAW_JSON);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={handleCreateRule}
                    className="bg-brand hover:bg-brand-dark"
                    disabled={createMutation.isPending || updateMutation.isPending || !builder.name.trim()}
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : editingRuleId ? (
                      'Save changes'
                    ) : (
                      'Create rule'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card style={CARD_BORDER} className="rounded-2xl">
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <CardTitle className="text-base">Automation rules</CardTitle>
                    <CardDescription>Manage all your automation rules and workflows.</CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button type="button" variant="outline" className="justify-start">
                      <Filter className="mr-2 h-4 w-4" aria-hidden />
                      Filter
                    </Button>
                    <Select value={ruleStatusFilter} onValueChange={setRuleStatusFilter}>
                      <SelectTrigger className="sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {showBranchSelector && (
                      <Select value={ruleBranchFilter} onValueChange={setRuleBranchFilter}>
                        <SelectTrigger className="sm:w-40">
                          <MapPin className="mr-2 h-4 w-4" aria-hidden />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All rules</SelectItem>
                          <SelectItem value={ALL_BRANCHES_VALUE}>All branches</SelectItem>
                          {branchOptions.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Select value={ruleSort} onValueChange={setRuleSort}>
                      <SelectTrigger className="sm:w-32">
                        <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_SORT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {rulesQuery.isLoading && (
                  <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading rules...
                  </div>
                )}
                {!rulesQuery.isLoading && filteredRuleRows.length === 0 && (
                  <div className="mx-4 mb-4 rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">No automation rules found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create a blank rule, use a template, or adjust your filters.
                    </p>
                  </div>
                )}
                {!rulesQuery.isLoading && filteredRuleRows.length > 0 && (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="min-w-[260px]">Rule name</TableHead>
                          <TableHead className="min-w-[180px]">Trigger</TableHead>
                          {showBranchSelector && <TableHead className="min-w-[140px]">Branch</TableHead>}
                          <TableHead>Actions</TableHead>
                          <TableHead>Channel</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="min-w-[160px]">Last run</TableHead>
                          <TableHead className="min-w-[150px]">Success rate</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRuleRows.map((rule) => {
                          const TriggerIcon = rule.triggerDisplay.Icon;
                          const ChannelIcon = rule.channelDisplay.Icon;
                          return (
                            <TableRow key={rule.id}>
                              <TableCell>
                                <div className="flex items-start gap-3">
                                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${rule.channelDisplay.bg}`}>
                                    <ChannelIcon className={`h-5 w-5 ${rule.channelDisplay.color}`} aria-hidden />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-foreground">{rule.name}</p>
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{rule.description}</p>
                                    {!rule.businessTypeCompatible && (
                                      <p className="mt-1 text-xs font-medium text-amber-700">Not for your business type</p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-start gap-2">
                                  <TriggerIcon className={`mt-0.5 h-4 w-4 ${rule.triggerDisplay.color}`} aria-hidden />
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{rule.triggerDisplay.title}</p>
                                    <p className="text-xs text-muted-foreground">{rule.triggerDisplay.description}</p>
                                  </div>
                                </div>
                              </TableCell>
                              {showBranchSelector && (
                                <TableCell>
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                                    <MapPin className="h-3 w-3" aria-hidden />
                                    {rule.branchLabel}
                                  </span>
                                </TableCell>
                              )}
                              <TableCell>
                                <div className="flex items-center gap-1.5 text-sm text-foreground">
                                  <Zap className="h-4 w-4 text-muted-foreground" aria-hidden />
                                  {rule.actionCount || 0} {rule.actionCount === 1 ? 'action' : 'actions'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${rule.channelDisplay.bg}`}>
                                  <ChannelIcon className={`h-4 w-4 ${rule.channelDisplay.color}`} aria-hidden />
                                </div>
                              </TableCell>
                              <TableCell>
                                {!rule.businessTypeCompatible ? (
                                  <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                                    Not for your business type
                                  </span>
                                ) : (
                                  <StatusChip
                                    status={rule.status}
                                    className={rule.status === 'active' ? 'border-green-100 bg-green-50 text-green-700' : ''}
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium text-foreground">{formatDateTime(rule.lastRunTime)}</p>
                                <p className="text-xs text-muted-foreground">{rule.lastRunOutcome}</p>
                              </TableCell>
                              <TableCell>
                                {rule.successRate == null ? (
                                  <span className="text-sm text-muted-foreground">-</span>
                                ) : (
                                  <div className="space-y-1.5">
                                    <p className="text-sm font-medium text-foreground">{rule.successRate}%</p>
                                    <Progress
                                      value={rule.successRate}
                                      className={`h-1.5 bg-muted ${rule.status === 'failed' ? '[&>div]:bg-red-600' : '[&>div]:bg-[#166534]'}`}
                                    />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    type="button"
                                    onClick={() => setViewingRuleId(rule.id)}
                                    aria-label={`View ${rule.name}`}
                                  >
                                    <Eye className="h-4 w-4" aria-hidden />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <span>Show</span>
                        <Select value={String(rulesPageSize)} onValueChange={(value) => setRulesPageSize(Number(value))}>
                          <SelectTrigger className="h-9 w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <p>
                        Showing {ruleRangeStart} to {ruleRangeEnd} of {filteredRuleRows.length} rules
                      </p>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setRulesPage((page) => Math.max(1, page - 1))}
                          disabled={rulesPage <= 1}
                        >
                          Previous
                        </Button>
                        {Array.from({ length: Math.min(4, rulesTotalPages) }, (_, index) => index + 1).map((page) => (
                          <Button
                            key={page}
                            type="button"
                            variant={rulesPage === page ? 'outline' : 'ghost'}
                            size="sm"
                            className={rulesPage === page ? 'border-border text-foreground' : ''}
                            onClick={() => setRulesPage(page)}
                          >
                            {page}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setRulesPage((page) => Math.min(rulesTotalPages, page + 1))}
                          disabled={rulesPage >= rulesTotalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-5">
          <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-2xl">
                <Select value={templateChannel} onValueChange={setTemplateChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CHANNEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={templateDifficulty} onValueChange={setTemplateDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_DIFFICULTY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={templateSort} onValueChange={setTemplateSort}>
                  <SelectTrigger>
                    <SlidersHorizontal className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={() => setActiveTab('ai-builder')}>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                Generate with AI
              </Button>
            </div>

            {templatesQuery.isLoading && (
              <Card style={CARD_BORDER} className="rounded-2xl">
                <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading templates...
                </CardContent>
              </Card>
            )}

            {!templatesQuery.isLoading && templates.length === 0 && (
              <Card style={CARD_BORDER} className="rounded-2xl">
                <CardContent className="p-6 text-sm text-muted-foreground">No templates yet.</CardContent>
              </Card>
            )}

            {!templatesQuery.isLoading && templates.length > 0 && filteredTemplateCards.length === 0 && (
              <Card style={CARD_BORDER} className="rounded-2xl">
                <CardContent className="p-6 text-sm text-muted-foreground">No templates match your filters.</CardContent>
              </Card>
            )}

            {!templatesQuery.isLoading && filteredTemplateCards.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredTemplateCards.map((template) => (
                  <TemplateCard key={template.key} template={template} onUse={handleUseTemplate} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[150px_150px_160px_190px_110px]">
            <Select value={selectedRuleId || 'all'} onValueChange={(value) => setSelectedRuleId(value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All rules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name || 'Rule'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HISTORY_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={historyChannelFilter} onValueChange={setHistoryChannelFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HISTORY_CHANNEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={historyDateRange} onValueChange={setHistoryDateRange}>
              <SelectTrigger>
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HISTORY_DATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={exportHistory} disabled={filteredHistoryRows.length === 0}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Export
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon={Activity}
              label="Total executions"
              value={historyStats.total.toLocaleString()}
              note={selectedRuleId ? 'For selected rule' : 'Matching filters'}
              accent="green"
            />
            <StatCard
              icon={CheckCircle2}
              label="Successful"
              value={historyStats.successful.toLocaleString()}
              note={`${historyStats.successRate}% success rate`}
              accent="green"
            />
            <StatCard
              icon={AlertTriangle}
              label="Failed"
              value={historyStats.failed.toLocaleString()}
              note={`${historyStats.failureRate}% failure rate`}
              accent="red"
            />
            <StatCard
              icon={Clock3}
              label="Pending"
              value={historyStats.pending.toLocaleString()}
              note={`${historyStats.pendingRate}% pending`}
              accent="amber"
            />
            <StatCard
              icon={Zap}
              label="Avg. execution time"
              value={historyStats.avgDurationLabel}
              note={historyStats.total ? 'From completed runs' : 'No duration data'}
              accent="purple"
            />
          </div>

          <Card style={CARD_BORDER} className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Execution history</CardTitle>
              <CardDescription>
                {selectedRuleId ? `Runs for: ${ruleNameById.get(selectedRuleId) || 'selected rule'}` : 'Latest runs for this workspace.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(runsQuery.isLoading || allRunsQuery.isLoading) && (
                <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading runs...
                </div>
              )}
              {!runsQuery.isLoading && !allRunsQuery.isLoading && filteredHistoryRows.length === 0 && (
                <div className="mx-4 mb-4 rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">No execution history found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enable a rule and use <span className="font-medium text-foreground">Test</span>, wait for a scheduled trigger,
                    or adjust your filters.
                  </p>
                </div>
              )}
              {!runsQuery.isLoading && !allRunsQuery.isLoading && filteredHistoryRows.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="min-w-[190px]">Time</TableHead>
                          <TableHead className="min-w-[210px]">Rule name</TableHead>
                          <TableHead className="min-w-[160px]">Trigger</TableHead>
                          <TableHead className="min-w-[210px]">Recipient / Record</TableHead>
                          <TableHead>Channel</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleHistoryRows.map((row) => {
                          const expanded = expandedHistoryIds.has(row.id);
                          return (
                            <Fragment key={row.id}>
                              <TableRow>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground"
                                      aria-label={expanded ? `Collapse ${row.ruleName}` : `Expand ${row.ruleName}`}
                                      aria-expanded={expanded}
                                      onClick={() => toggleHistoryExpand(row.id)}
                                    >
                                      <ChevronDown
                                        className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                        aria-hidden
                                      />
                                    </Button>
                                    <div>
                                      <p className="text-sm font-medium text-foreground">{formatDateTime(row.createdAt)}</p>
                                      <p className="text-xs text-muted-foreground">{formatRelativeTime(row.createdAt)}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <p className="font-medium text-foreground">{row.ruleName}</p>
                                  {row.error && <p className="mt-1 line-clamp-1 text-xs text-red-600">{row.error}</p>}
                                </TableCell>
                                <TableCell>
                                  <p className="text-sm text-foreground">{row.trigger}</p>
                                </TableCell>
                                <TableCell>
                                  <p className="text-sm font-medium text-foreground">{row.recipientName}</p>
                                  {row.recordLabel && <p className="mt-1 text-xs text-muted-foreground">{row.recordLabel}</p>}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    {row.channels.map((channel) => {
                                      const meta = channelMeta(channel);
                                      const ChannelIcon = meta.Icon;
                                      return (
                                        <span
                                          key={channel}
                                          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${meta.className}`}
                                          title={meta.label}
                                        >
                                          <ChannelIcon className="h-3.5 w-3.5" aria-hidden />
                                        </span>
                                      );
                                    })}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <StatusChip status={row.status} />
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm font-medium text-foreground">{row.durationLabel}</span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      aria-label={`View delivery details for ${row.ruleName}`}
                                      onClick={() => toggleHistoryExpand(row.id)}
                                    >
                                      <Eye className="h-4 w-4" aria-hidden />
                                    </Button>
                                    <Button type="button" variant="outline" size="icon" aria-label={`More actions for ${row.ruleName}`}>
                                      <MoreVertical className="h-4 w-4" aria-hidden />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {expanded ? (
                                <TableRow className="hover:bg-transparent">
                                  <TableCell colSpan={8} className="bg-muted/20 px-4 py-3">
                                    <DeliveryDetailPanel
                                      run={row.raw}
                                      waStatusByMessageId={waStatusByMessageId}
                                    />
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
                    <p>
                      Showing {historyRangeStart} to {historyRangeEnd} of {filteredHistoryRows.length} results
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                      <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <Select value={String(historyPageSize)} onValueChange={(value) => setHistoryPageSize(Number(value))}>
                          <SelectTrigger className="h-9 w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                          disabled={historyPage <= 1}
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden />
                        </Button>
                        {Array.from({ length: Math.min(3, historyTotalPages) }, (_, index) => index + 1).map((page) => (
                          <Button
                            key={page}
                            type="button"
                            variant={historyPage === page ? 'outline' : 'ghost'}
                            size="sm"
                            className={historyPage === page ? 'border-border text-foreground' : ''}
                            onClick={() => setHistoryPage(page)}
                          >
                            {page}
                          </Button>
                        ))}
                        {historyTotalPages > 3 && <span className="px-2 text-xs text-muted-foreground">...</span>}
                        {historyTotalPages > 3 && (
                          <Button
                            type="button"
                            variant={historyPage === historyTotalPages ? 'outline' : 'ghost'}
                            size="sm"
                            className={historyPage === historyTotalPages ? 'border-border text-foreground' : ''}
                            onClick={() => setHistoryPage(historyTotalPages)}
                          >
                            {historyTotalPages}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                          disabled={historyPage >= historyTotalPages}
                          aria-label="Next page"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[150px_150px_150px_160px_190px_130px]">
            <Select value={logRuleFilter} onValueChange={setLogRuleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All rules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name || 'Rule'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logLevelFilter} onValueChange={setLogLevelFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_LEVEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logChannelFilter} onValueChange={setLogChannelFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HISTORY_CHANNEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logDateRange} onValueChange={setLogDateRange}>
              <SelectTrigger>
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HISTORY_DATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={exportLogs} disabled={filteredLogRows.length === 0}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Export logs
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon={ClipboardList}
              label="Total log entries"
              value={logStats.total.toLocaleString()}
              note={logDateRange === 'all' ? 'Matching filters' : 'Selected date range'}
              accent="green"
            />
            <StatCard
              icon={Activity}
              label="Info"
              value={logStats.info.toLocaleString()}
              note={`${logStats.pct(logStats.info)} of logs`}
              accent="blue"
            />
            <StatCard
              icon={CheckCircle2}
              label="Success"
              value={logStats.success.toLocaleString()}
              note={`${logStats.pct(logStats.success)} of logs`}
              accent="green"
            />
            <StatCard
              icon={AlertTriangle}
              label="Warnings"
              value={logStats.warning.toLocaleString()}
              note={`${logStats.pct(logStats.warning)} of logs`}
              accent="amber"
            />
            <StatCard
              icon={AlertTriangle}
              label="Errors"
              value={logStats.error.toLocaleString()}
              note={`${logStats.pct(logStats.error)} of logs`}
              accent="red"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card style={CARD_BORDER} className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Automation logs</CardTitle>
                <CardDescription>
                  Derived from recent automation runs and WhatsApp message events.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {(logsApiQuery.isLoading || allRunsQuery.isLoading || whatsAppEventsQuery.isLoading) && (
                  <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading logs...
                  </div>
                )}
                {!logsApiQuery.isLoading && !allRunsQuery.isLoading && !whatsAppEventsQuery.isLoading && filteredLogRows.length === 0 && (
                  <div className="mx-4 mb-4 rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">No logs found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Run an automation, send a WhatsApp message, or adjust your filters.
                    </p>
                  </div>
                )}
                {!logsApiQuery.isLoading && !allRunsQuery.isLoading && !whatsAppEventsQuery.isLoading && filteredLogRows.length > 0 && (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="min-w-[170px]">Time</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead className="min-w-[190px]">Rule name</TableHead>
                            <TableHead className="min-w-[260px]">Message</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead className="text-right">Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleLogRows.map((row) => {
                            const meta = channelMeta(row.channel);
                            const ChannelIcon = meta.Icon;
                            return (
                              <TableRow
                                key={row.id}
                                className={selectedLog?.id === row.id ? 'bg-emerald-50/40 hover:bg-emerald-50/40' : ''}
                              >
                                <TableCell>
                                  <p className="text-sm font-medium text-foreground">{formatDateTime(row.time)}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(row.time)}</p>
                                </TableCell>
                                <TableCell>
                                  <LogLevelBadge level={row.level} />
                                </TableCell>
                                <TableCell>
                                  <p className="font-medium text-foreground">{row.ruleName}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{row.trigger}</p>
                                </TableCell>
                                <TableCell>
                                  <p className="line-clamp-2 text-sm text-foreground">{row.message}</p>
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${meta.className}`}
                                    title={meta.label}
                                  >
                                    <ChannelIcon className="h-3.5 w-3.5" aria-hidden />
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-end">
                                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedLogId(row.id)}>
                                      View
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
                      <p>
                        Showing {logsRangeStart} to {logsRangeEnd} of {filteredLogRows.length} logs
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <div className="flex items-center gap-2">
                          <span>Rows per page</span>
                          <Select value={String(logsPageSize)} onValueChange={(value) => setLogsPageSize(Number(value))}>
                            <SelectTrigger className="h-9 w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAGE_SIZE_OPTIONS.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                  {size}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLogsPage((page) => Math.max(1, page - 1))}
                            disabled={logsPage <= 1}
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden />
                          </Button>
                          {Array.from({ length: Math.min(3, logsTotalPages) }, (_, index) => index + 1).map((page) => (
                            <Button
                              key={page}
                              type="button"
                              variant={logsPage === page ? 'outline' : 'ghost'}
                              size="sm"
                              className={logsPage === page ? 'border-border text-foreground' : ''}
                              onClick={() => setLogsPage(page)}
                            >
                              {page}
                            </Button>
                          ))}
                          {logsTotalPages > 3 && <span className="px-2 text-xs text-muted-foreground">...</span>}
                          {logsTotalPages > 3 && (
                            <Button
                              type="button"
                              variant={logsPage === logsTotalPages ? 'outline' : 'ghost'}
                              size="sm"
                              className={logsPage === logsTotalPages ? 'border-border text-foreground' : ''}
                              onClick={() => setLogsPage(logsTotalPages)}
                            >
                              {logsTotalPages}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLogsPage((page) => Math.min(logsTotalPages, page + 1))}
                            disabled={logsPage >= logsTotalPages}
                            aria-label="Next page"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card style={CARD_BORDER} className="rounded-2xl">
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                <div>
                  <CardTitle className="text-base">Log details</CardTitle>
                  <CardDescription>
                    {selectedLog ? `${LOG_LEVEL_META[selectedLog.level]?.label || 'Info'} · ${formatDateTime(selectedLog.time)}` : 'Select a row to inspect it.'}
                  </CardDescription>
                </div>
                {selectedLog && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedLogId('')} aria-label="Clear selected log">
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedLog && <p className="text-sm text-muted-foreground">No log selected.</p>}
                {selectedLog && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <LogLevelBadge level={selectedLog.level} />
                      <StatusChip status={selectedLog.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Rule name</p>
                        <p className="mt-1 font-medium text-foreground">{selectedLog.ruleName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Trigger</p>
                        <p className="mt-1 font-medium text-foreground">{selectedLog.trigger}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Message</p>
                        <p className="mt-1 font-medium text-foreground">{selectedLog.message}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Channel</p>
                        <p className="mt-1 font-medium text-foreground">{channelMeta(selectedLog.channel).label}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="mt-1 font-medium text-foreground">{selectedLog.durationLabel}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Log ID</p>
                        <p className="mt-1 break-all font-mono text-xs text-foreground">{selectedLog.id}</p>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Log data</p>
                      <pre className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                        {selectedLogJson}
                      </pre>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Related execution</p>
                      {selectedLog.relatedExecutionId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedLog.ruleId) setSelectedRuleId(selectedLog.ruleId);
                            setActiveTab('history');
                          }}
                        >
                          View in history
                          <ExternalLink className="ml-2 h-4 w-4" aria-hidden />
                        </Button>
                      ) : (
                        <p className="text-sm text-muted-foreground">No linked automation run.</p>
                      )}
                    </div>
                    <div className="flex justify-start">
                      <Button type="button" variant="outline" size="sm" onClick={copySelectedLog}>
                        <Copy className="mr-2 h-4 w-4" aria-hidden />
                        Copy log
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai-builder" className="mt-5 space-y-5">
          <Card style={CARD_BORDER} className="overflow-hidden rounded-2xl bg-emerald-50/30">
            <CardContent className="grid gap-6 p-5 md:p-7 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-center">
              <div className="max-w-2xl">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-background text-emerald-700">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Build automations with AI</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  Describe what you want to automate in plain language. Our AI will create the rule, conditions, and
                  actions for you to review before saving.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button type="button" className="bg-[#166534] hover:bg-[#14532d]" onClick={handleStartWithAi}>
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                    Start with AI
                  </Button>
                  <Button type="button" variant="outline" className="bg-background" onClick={handleHowItWorks}>
                    <Eye className="mr-2 h-4 w-4" aria-hidden />
                    How it works
                  </Button>
                </div>
              </div>
              <div className="relative min-h-[220px] rounded-2xl border border-emerald-100 bg-background p-4">
                <div className="absolute -left-6 top-10 hidden rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-foreground xl:block">
                  When an invoice is overdue
                  <br />
                  for 3 days, send a WhatsApp
                  <br />
                  reminder and create a task.
                </div>
                <div className="ml-auto max-w-[280px] rounded-2xl border border-border bg-background p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">AI generated automation</p>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                  </div>
                  {[
                    ['Trigger', 'Invoice overdue for 3 days', Clock3],
                    ['Condition', '2 conditions', Filter],
                    ['Actions', 'Send WhatsApp message, Create task', Zap],
                  ].map(([label, value, Icon]) => (
                    <div key={label} className="flex gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <section id="ai-builder-examples" className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Try with an example</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select an example below to see how AI can build it for you.
                </p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Scroll examples left"
                  onClick={() => document.getElementById('ai-builder-example-row')?.scrollBy({ left: -320, behavior: 'smooth' })}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Scroll examples right"
                  onClick={() => document.getElementById('ai-builder-example-row')?.scrollBy({ left: 320, behavior: 'smooth' })}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div id="ai-builder-example-row" className="flex gap-4 overflow-x-auto pb-2">
              {AI_BUILDER_EXAMPLES.map((example) => {
                const ExampleIcon = example.Icon;
                return (
                  <button
                    key={example.key}
                    type="button"
                    className="flex min-h-[168px] w-[230px] shrink-0 flex-col rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50/30 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleUseAiExample(example)}
                    disabled={draftMutation.isPending}
                  >
                    <span className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border ${getAiBuilderAccent(example.accent)}`}>
                      <ExampleIcon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold text-foreground">{example.title}</span>
                    <span className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{example.description}</span>
                    {example.tag && (
                      <span
                        className={`mt-auto w-fit rounded-full px-2 py-1 text-[11px] font-medium ${
                          example.tag === 'New' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {example.tag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <Card style={CARD_BORDER} className="rounded-2xl">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="text-base">Your AI generated automations</CardTitle>
                  <CardDescription>
                    {hasAiTaggedRules
                      ? 'Automations created with the help of AI.'
                      : 'Showing automation rules while AI source metadata is not available yet.'}
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={aiBuilderStatusFilter} onValueChange={setAiBuilderStatusFilter}>
                    <SelectTrigger className="sm:w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_BUILDER_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {rulesQuery.isLoading && (
                <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading automations...
                </div>
              )}
              {!rulesQuery.isLoading && filteredAiBuilderRows.length === 0 && (
                <div className="mx-4 mb-4 rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">No AI generated automations found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start with AI or adjust your status filter.
                  </p>
                </div>
              )}
              {!rulesQuery.isLoading && filteredAiBuilderRows.length > 0 && (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="min-w-[260px]">Name</TableHead>
                        <TableHead className="min-w-[280px]">Description</TableHead>
                        <TableHead className="min-w-[150px]">Created on</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="min-w-[180px]">Last modified</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleAiBuilderRows.map((rule) => {
                        const ChannelIcon = rule.channelDisplay.Icon;
                        return (
                          <TableRow key={rule.id} className={rule.aiStatus === 'draft' ? 'bg-muted/20' : ''}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${rule.channelDisplay.bg}`}>
                                  <ChannelIcon className={`h-5 w-5 ${rule.channelDisplay.color}`} aria-hidden />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground">{rule.name}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{rule.aiSourceTag}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="line-clamp-2 text-sm text-muted-foreground">{rule.description}</p>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDateTime(rule.createdAt)}</TableCell>
                            <TableCell>
                              <StatusChip
                                status={rule.aiStatus}
                                className={
                                  rule.aiStatus === 'active'
                                    ? 'border-green-100 bg-green-50 text-green-700'
                                    : rule.aiStatus === 'draft'
                                      ? 'border-blue-100 bg-blue-50 text-blue-700'
                                      : ''
                                }
                              />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDateTime(rule.updatedAt)}</TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="outline" type="button" aria-label={`More actions for ${rule.name}`}>
                                      <MoreVertical className="h-4 w-4" aria-hidden />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => editRule(rule)}>
                                      <Pencil className="mr-2 h-4 w-4" aria-hidden />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => toggleMutation.mutate(rule.id)} disabled={isAiBuilderDraft(rule)}>
                                      {rule.enabled ? (
                                        <PauseCircle className="mr-2 h-4 w-4" aria-hidden />
                                      ) : (
                                        <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
                                      )}
                                      {rule.enabled ? 'Pause rule' : 'Activate rule'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        setSelectedRuleId((id) => (id === rule.id ? '' : rule.id));
                                        setActiveTab('history');
                                      }}
                                    >
                                      <Activity className="mr-2 h-4 w-4" aria-hidden />
                                      View runs
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600"
                                      onSelect={() => {
                                        if (window.confirm(`Delete automation rule "${rule.name}"?`)) {
                                          deleteMutation.mutate(rule.id);
                                        }
                                      }}
                                      disabled={deleteMutation.isPending}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>
                      Showing {aiBuilderRangeStart} to {aiBuilderRangeEnd} of {filteredAiBuilderRows.length} results
                    </p>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <Select value={String(aiBuilderPageSize)} onValueChange={(value) => setAiBuilderPageSize(Number(value))}>
                          <SelectTrigger className="h-9 w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setAiBuilderPage((page) => Math.max(1, page - 1))}
                          disabled={aiBuilderPage <= 1}
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button type="button" size="sm" className="h-9 bg-[#166534] px-3 hover:bg-[#14532d]">
                          {aiBuilderPage}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setAiBuilderPage((page) => Math.min(aiBuilderTotalPages, page + 1))}
                          disabled={aiBuilderPage >= aiBuilderTotalPages}
                          aria-label="Next page"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {aiPromptOpen && (
            <div id="ai-builder-draft-panel" className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Card style={CARD_BORDER} className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" aria-hidden />
                    AI-assisted draft
                  </CardTitle>
                  <CardDescription>
                    Describe the automation you want. AI only fills the form; you still review and save it.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    id="ai-builder-prompt"
                    rows={3}
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    placeholder="Example: Send a transactional WhatsApp payment reminder when an invoice is overdue."
                  />
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion) => (
                        <Button
                          key={suggestion.key}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAiInstruction(suggestion.prompt)}
                        >
                          {suggestion.title}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => draftMutation.mutate(aiInstruction.trim())}
                      disabled={!aiInstruction.trim() || draftMutation.isPending}
                    >
                      {draftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Draft rule'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

            <Card style={CARD_BORDER} className="hidden rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{editingRuleId ? 'Edit rule' : 'Create rule'}</CardTitle>
                <CardDescription>Review AI drafts, templates, or build a rule manually before saving.</CardDescription>
              </CardHeader>
              <CardContent className="max-w-none space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="automation-rule-name-ai">Rule name</Label>
                  <Input
                    id="automation-rule-name-ai"
                    value={builder.name}
                    onChange={(e) => setBuilder((b) => ({ ...b, name: e.target.value }))}
                    placeholder="e.g. Invoice due reminder"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>When this happens (trigger)</Label>
                  <Select
                    value={builder.triggerType}
                    onValueChange={changeTriggerType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedTriggerOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTriggerMeta?.hint && <p className="text-xs text-muted-foreground">{selectedTriggerMeta.hint}</p>}
                </div>

                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium text-foreground">Trigger settings</p>
                  <AutomationTriggerFields triggerType={builder.triggerType} value={builder.triggerForm} onPatch={patchTriggerForm} />
                  <AutomationFrequencyFields
                    triggerType={builder.triggerType}
                    conditionForm={builder.conditionForm}
                    onPatch={patchConditionForm}
                  />
                  <AutomationSendAfterFields
                    triggerType={builder.triggerType}
                    conditionForm={builder.conditionForm}
                    onPatch={patchConditionForm}
                  />
                </div>

                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium text-foreground">Conditions (optional)</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="auto-min-amount-ai">Minimum invoice amount (optional)</Label>
                    <Input
                      id="auto-min-amount-ai"
                      type="number"
                      min={0}
                      step="0.01"
                      value={builder.conditionForm.minInvoiceAmount}
                      onChange={(e) => patchConditionForm({ minInvoiceAmount: e.target.value })}
                      placeholder="Leave empty to skip"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="auto-weekdays-ai" className="font-normal">
                      Only on weekdays (optional)
                    </Label>
                    <Switch
                      id="auto-weekdays-ai"
                      checked={builder.conditionForm.weekdaysOnly}
                      onCheckedChange={(v) => patchConditionForm({ weekdaysOnly: v })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Then do this</p>
                  {builder.actionRows.map((row, index) => (
                    <div key={index} className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Label>Action {index + 1}</Label>
                          <Select value={row.type} onValueChange={(v) => setActionType(index, v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTION_TYPE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {builder.actionRows.length > 1 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => removeActionRow(index)}>
                            <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                            Remove
                          </Button>
                        )}
                      </div>
                      <AutomationActionFields row={row} triggerType={builder.triggerType} onPatch={(p) => patchActionRow(index, p)} />
                    </div>
                  ))}
                  <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={addActionRow} disabled={builder.actionRows.length >= MAX_ACTIONS}>
                    <Plus className="mr-1 h-4 w-4" aria-hidden />
                    Add another action
                  </Button>
                </div>

                <div className="rounded-md border border-dashed border-border bg-background px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</p>
                  <p className="mt-1 text-sm text-foreground">{ruleSummary}</p>
                </div>

                <div className="flex justify-end pt-1">
                  {editingRuleId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mr-2"
                      onClick={() => {
                        setEditingRuleId('');
                        setBuilder(createInitialBuilder());
                        setRawJson(INITIAL_RAW_JSON);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={handleCreateRule}
                    className="bg-[#166534] hover:bg-[#14532d]"
                    disabled={createMutation.isPending || updateMutation.isPending || !builder.name.trim()}
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : editingRuleId ? (
                      'Save changes'
                    ) : (
                      'Create rule'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
