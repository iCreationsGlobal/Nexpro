import { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { useSmartSearch } from '../context/SmartSearchContext';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS, QUERY_CACHE } from '../constants';
import { usePagedList } from '../hooks/usePagedList';
// Removed Ant Design imports - using shadcn/ui only
import PhoneNumberInput from '../components/PhoneNumberInput';
import {
  Plus,
  Users,
  FilePlus,
  Upload as UploadIcon,
  Building2,
  Currency,
  History,
  Mail,
  Phone,
  Loader2,
  Filter,
  RefreshCw,
  UserCheck,
  Pencil
} from 'lucide-react';
import dayjs from 'dayjs';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import employeeService from '../services/employeeService';
import customDropdownService from '../services/customDropdownService';
import { showSuccess, showError, showWarning } from '../utils/toast';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { numberInputValue, handleNumberChange, numberOrEmptySchema } from '../utils/formUtils';
import ActionColumn from '../components/ActionColumn';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DashboardTable from '../components/DashboardTable';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import DetailsDrawer from '../components/DetailsDrawer';
import MobileFormDialog from '../components/MobileFormDialog';
import DrawerSectionCard from '../components/DrawerSectionCard';
import FileUpload from '../components/FileUpload';
import FilePreview from '../components/FilePreview';
import { API_BASE_URL } from '../services/api';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { DatePicker } from '@/components/ui/date-picker';
import { Timeline, TimelineItem, TimelineIndicator, TimelineContent, TimelineTitle, TimelineDescription, TimelineTime } from '@/components/ui/timeline';
import { Steps, Step } from '@/components/ui/steps';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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



const employmentTypes = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'national_service', label: 'National Service' }
];

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'probation', label: 'Probation' },
  { value: 'terminated', label: 'Terminated' }
];

const historyChangeTypes = [
  { value: 'leave', label: 'Leave' },
  { value: 'sick_leave', label: 'Sick Leave' },
  { value: 'absent', label: 'Absent' },
  { value: 'bad_behaviour', label: 'Bad Behaviour' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'demotion', label: 'Demotion' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'warning', label: 'Warning' },
  { value: 'commendation', label: 'Commendation' },
  { value: 'training', label: 'Training' },
  { value: 'note', label: 'General Note' }
];

const ghanaBanks = [
  'Absa Bank Ghana',
  'Access Bank Ghana',
  'Agricultural Development Bank (ADB)',
  'CalBank',
  'Ecobank Ghana',
  'Fidelity Bank Ghana',
  'GCB Bank',
  'Guarantee Trust Bank (GTBank)',
  'National Investment Bank (NIB)',
  'Prudential Bank',
  'Stanbic Bank Ghana',
  'Standard Chartered Bank Ghana',
  'Societe Generale Ghana',
  'United Bank for Africa (UBA)',
  'Zenith Bank Ghana',
  'Mobile Money',
  'Other'
];

const relationshipOptions = [
  'Spouse',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Grandparent',
  'Uncle',
  'Aunt',
  'Cousin',
  'Friend',
  'Guardian'
];

// Helper function to resolve file URLs (handles base64, relative paths, and absolute URLs)
const resolveFileUrl = (url) => {
  if (!url) return '';
  // Base64 data URLs (data:image/png;base64,...)
  if (url.startsWith('data:')) return url;
  // Absolute URLs (http:// or https://)
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Relative paths - prepend API base URL
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  // Return as-is for other cases
  return url;
};

const EmployeeForm = ({ currentStep, form, savingDepartment, setSavingDepartment, savingJobTitle, setSavingJobTitle, savingBank, setSavingBank, isModalOpen }) => {
  const [customRelationships, setCustomRelationships] = useState([]);
  const [showRelationshipOtherInputs, setShowRelationshipOtherInputs] = useState({});
  const [relationshipOtherValues, setRelationshipOtherValues] = useState({});
  const [customBanks, setCustomBanks] = useState([]);
  const [showBankOtherInput, setShowBankOtherInput] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [showDepartmentCreateInput, setShowDepartmentCreateInput] = useState(false);
  const [newDepartmentValue, setNewDepartmentValue] = useState('');
  const [jobTitles, setJobTitles] = useState([]);
  const [showJobTitleCreateInput, setShowJobTitleCreateInput] = useState(false);
  const [newJobTitleValue, setNewJobTitleValue] = useState('');

  // Load custom relationships, banks, departments, and job titles on mount and when modal opens
  useEffect(() => {
    const loadCustomOptions = async () => {
      try {
        const [relationships, banks, depts, titles] = await Promise.all([
          customDropdownService.getCustomOptions('employee_relationship'),
          customDropdownService.getCustomOptions('employee_bank'),
          customDropdownService.getCustomOptions('department'),
          customDropdownService.getCustomOptions('job_title')
        ]);
        setCustomRelationships(relationships || []);
        setCustomBanks(banks || []);
        setDepartments(depts || []);
        setJobTitles(titles || []);
      } catch (error) {
        console.error('Failed to load custom options:', error);
      }
    };
    loadCustomOptions();
  }, [isModalOpen]);

  // Handle relationship change (including "Other")
  const handleRelationshipChange = (value, fieldPath) => {
    if (value === '__OTHER__') {
      setShowRelationshipOtherInputs(prev => ({ ...prev, [fieldPath]: true }));
    } else {
      setShowRelationshipOtherInputs(prev => {
        const newState = { ...prev };
        delete newState[fieldPath];
        return newState;
      });
    }
  };

  // Save custom relationship
  const handleSaveCustomRelationship = async (customValue, fieldPath) => {
    if (!customValue || !customValue.trim()) {
      showWarning('Please enter a relationship name');
      return;
    }

    try {
      const saved = await customDropdownService.saveCustomOption('employee_relationship', customValue.trim());
      if (saved) {
        // Add to custom relationships
        setCustomRelationships(prev => {
          if (prev.find(r => r.value === saved.value)) {
            return prev;
          }
          return [...prev, saved];
        });
        
        // Set the value in the form
        form.setValue(fieldPath, saved.value);
        
        // Clear the "Other" input
        setShowRelationshipOtherInputs(prev => {
          const newState = { ...prev };
          delete newState[fieldPath];
          return newState;
        });
        setRelationshipOtherValues(prev => {
          const newState = { ...prev };
          delete newState[fieldPath];
          return newState;
        });
        
        showSuccess(`"${saved.label}" added to relationships`);
      }
    } catch (error) {
      showError(error, error.response?.data?.error || 'Failed to save custom relationship');
    }
  };

  // Get merged relationship options
  const getMergedRelationshipOptions = () => {
    const merged = [...relationshipOptions];
    customRelationships.forEach(rel => {
      if (!merged.includes(rel.value)) {
        merged.push(rel.value);
      }
    });
    return merged;
  };

  // Get merged bank options
  const getMergedBankOptions = () => {
    const merged = [...ghanaBanks.filter(b => b !== 'Other')];
    customBanks.forEach(bank => {
      if (!merged.includes(bank.value)) {
        merged.push(bank.value);
      }
    });
    return merged;
  };

  // Handle department change (including "Create Department")
  const handleDepartmentChange = (value) => {
    if (value === '__CREATE__') {
      setShowDepartmentCreateInput(true);
    } else {
      setShowDepartmentCreateInput(false);
    }
  };

  // Save custom department
  const handleSaveCustomDepartment = async () => {
    if (!newDepartmentValue || !newDepartmentValue.trim()) {
      showWarning('Please enter a department name');
      return;
    }

    try {
      setSavingDepartment?.(true);
      const saved = await customDropdownService.saveCustomOption('department', newDepartmentValue.trim());
      if (saved) {
        // Add new department to dropdown immediately so user can select it
        setDepartments((prev) => {
          if (prev.find((d) => d.value === saved.value)) return prev;
          return [...prev, { value: saved.value, label: saved.label || saved.value }];
        });
        form.setValue('department', saved.value);
        setShowDepartmentCreateInput(false);
        setNewDepartmentValue('');
        showSuccess(`"${saved.label}" department added`);
      }
    } catch (error) {
      showError(error, error.response?.data?.error || 'Failed to save department');
    } finally {
      setSavingDepartment?.(false);
    }
  };

  // Handle job title change (including "Create Job Title")
  const handleJobTitleChange = (value) => {
    if (value === '__CREATE__') {
      setShowJobTitleCreateInput(true);
    } else {
      setShowJobTitleCreateInput(false);
    }
  };

  // Save custom job title
  const handleSaveCustomJobTitle = async () => {
    if (!newJobTitleValue || !newJobTitleValue.trim()) {
      showWarning('Please enter a job title');
      return;
    }

    try {
      setSavingJobTitle(true);
      const saved = await customDropdownService.saveCustomOption('job_title', newJobTitleValue.trim());
      if (saved) {
        setJobTitles(prev => {
          if (prev.find(t => t.value === saved.value)) {
            return prev;
          }
          return [...prev, saved];
        });
        
        form.setValue('jobTitle', saved.value);
        setShowJobTitleCreateInput(false);
        setNewJobTitleValue('');
        showSuccess(`"${saved.label}" job title added`);
      }
    } catch (error) {
      showError(error, error.response?.data?.error || 'Failed to save job title');
    } finally {
      setSavingJobTitle(false);
    }
  };

  // Handle bank change (including "Other")
  const handleBankChange = (value) => {
    if (value === '__OTHER__') {
      setShowBankOtherInput(true);
    } else {
      setShowBankOtherInput(false);
    }
  };

  // Save custom bank
  const handleSaveCustomBank = async (customValue) => {
    if (!customValue || !customValue.trim()) {
      showWarning('Please enter a bank name');
      return;
    }

    try {
      setSavingBank(true);
      const saved = await customDropdownService.saveCustomOption('employee_bank', customValue.trim());
      if (saved) {
        setCustomBanks(prev => {
          if (prev.find(b => b.value === saved.value)) {
            return prev;
          }
          return [...prev, saved];
        });
        
        form.setValue('bankName', saved.value);
        setShowBankOtherInput(false);
        form.setValue('customBankName', undefined);
        showSuccess(`"${saved.label}" added to banks`);
      }
    } catch (error) {
      showError(error, error.response?.data?.error || 'Failed to save custom bank');
    }
  };

  return (
    <>
    {currentStep === 0 && (
      <>
        <Separator className="my-4" />
        <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input placeholder="First Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input placeholder="Last Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (optional)</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="email@company.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone (optional)</FormLabel>
                <FormControl>
                  <PhoneNumberInput placeholder="Enter phone number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator className="my-4" />
        <h3 className="text-lg font-semibold mb-4">Employment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department (optional)</FormLabel>
                <Select value={field.value} onValueChange={(value) => {
                  if (value === '__CREATE__') {
                    handleDepartmentChange('__CREATE__');
                  } else {
                    handleDepartmentChange(value);
                    field.onChange(value);
                  }
                }}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select or create department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.value} value={dept.value}>
                        {dept.label}
                      </SelectItem>
                    ))}
                    <Separator className="my-2" />
                    <SelectItem value="__CREATE__" onSelect={(e) => {
                      e.preventDefault();
                      setShowDepartmentCreateInput(true);
                    }}>
                      <span className="flex items-center">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Department
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="jobTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job Title (optional)</FormLabel>
                <Select value={field.value} onValueChange={(value) => {
                  if (value === '__CREATE__') {
                    handleJobTitleChange('__CREATE__');
                  } else {
                    handleJobTitleChange(value);
                    field.onChange(value);
                  }
                }}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select or create job title" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {jobTitles.map((title) => (
                      <SelectItem key={title.value} value={title.value}>
                        {title.label}
                      </SelectItem>
                    ))}
                    <Separator className="my-2" />
                    <SelectItem value="__CREATE__" onSelect={(e) => {
                      e.preventDefault();
                      setShowJobTitleCreateInput(true);
                    }}>
                      <Button variant="ghost" className="w-full justify-start" onClick={(e) => {
                        e.preventDefault();
                        setShowJobTitleCreateInput(true);
                      }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Job Title
                      </Button>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {showDepartmentCreateInput && (
          <div className="mb-4">
            <Label>New Department Name</Label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Enter department name"
                value={newDepartmentValue}
                onChange={(e) => setNewDepartmentValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveCustomDepartment();
                  }
                }}
                autoFocus
                className="flex-1"
              />
              <Button type="button" onClick={handleSaveCustomDepartment} loading={savingDepartment}>
                Save
              </Button>
            </div>
          </div>
        )}
        {showJobTitleCreateInput && (
          <div className="mb-4">
            <Label>New Job Title</Label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Enter job title"
                value={newJobTitleValue}
                onChange={(e) => setNewJobTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveCustomJobTitle();
                  }
                }}
                autoFocus
                className="flex-1"
              />
              <Button type="button" onClick={handleSaveCustomJobTitle} loading={savingJobTitle}>
                Save
              </Button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="employmentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employment Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {employmentTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="hireDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hire Date (optional)</FormLabel>
                <FormControl>
                  <DatePicker
                    date={field.value ? (dayjs.isDayjs(field.value) ? field.value.toDate() : new Date(field.value)) : undefined}
                    onDateChange={(date) => {
                      field.onChange(date ? dayjs(date) : null);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Separator className="my-4" />
        <h3 className="text-lg font-semibold mb-4">Compensation</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="salaryType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="salary">Salary</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="commission">Commission</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="salaryAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base Amount</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10">GHS</span>
                    <Input
                      type="number"
                      className="w-full pl-16"
                      min={0}
                      step="0.01"
                      value={numberInputValue(field.value)}
                      onChange={(e) => handleNumberChange(e, field.onChange)}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="payFrequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pay Frequency</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bankName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bank / Wallet (optional)</FormLabel>
                <Select 
                  value={field.value} 
                  onValueChange={(value) => {
                    if (value === '__OTHER__') {
                      handleBankChange('__OTHER__');
                    } else {
                      handleBankChange(value);
                      field.onChange(value);
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank or mobile money" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {getMergedBankOptions().map((bank) => (
                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                    ))}
                    <SelectItem value="__OTHER__">Other (specify)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {showBankOtherInput && (
          <div className="mb-4">
            <Label>Enter Bank Name</Label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="e.g., New Bank, Credit Union"
                value={form.getValues('customBankName') || ''}
                onChange={(e) => form.setValue('customBankName', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveCustomBank(form.getValues('customBankName'));
                  }
                }}
                className="flex-1"
              />
              <Button onClick={() => handleSaveCustomBank(form.getValues('customBankName'))} loading={savingBank}>
                Save
              </Button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="bankAccountName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Name (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Account Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bankAccountNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account / Momo Number (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Account or Mobile Money Number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </>
    )}

    {currentStep === 1 && (
      <>
        <Separator className="my-4" />
        <h3 className="text-lg font-semibold mb-4">Emergency & Next of Kin</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="emergencyContact.name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Emergency Contact Name (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Full Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="emergencyContact.phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Emergency Contact Phone (optional)</FormLabel>
                <FormControl>
                  <PhoneNumberInput placeholder="Enter phone" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="nextOfKin.name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Next of Kin Name (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Full Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nextOfKin.phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Next of Kin Phone (optional)</FormLabel>
                <FormControl>
                  <PhoneNumberInput placeholder="Enter phone" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </>
    )}
  </>
  );
};

/** Employees in one list response (`{ data: [...], count }`). */
const employeeRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

const Employees = () => {
  const queryClient = useQueryClient();
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();
  const [filters, setFilters] = useState({
    status: 'all',
    employmentType: 'all'
  });
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10
  });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [formStep, setFormStep] = useState(0);
  
  const employeeSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().optional(),
    department: z.string().optional(),
    jobTitle: z.string().optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'temporary', 'national_service']).default('full_time'),
    status: z.enum(['active', 'on_leave', 'probation', 'terminated']).default('active'),
    hireDate: z.any().optional(),
    endDate: z.any().optional(),
    salaryType: z.enum(['salary', 'hourly', 'commission']).default('salary'),
    salaryAmount: numberOrEmptySchema(z),
    payFrequency: z.enum(['monthly', 'biweekly', 'weekly', 'daily']).default('monthly'),
    bankName: z.string().optional(),
    customBankName: z.string().optional(),
    bankAccountName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    emergencyContact: z.object({
      name: z.string().optional(),
      relationship: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    }).optional(),
    nextOfKin: z.object({
      name: z.string().optional(),
      relationship: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    }).optional(),
    notes: z.string().optional(),
  });

  const form = useForm({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employmentType: 'full_time',
      status: 'active',
      salaryType: 'salary',
      payFrequency: 'monthly',
      salaryAmount: 0,
    },
  });

  // History form schema and form
  const historySchema = z.object({
    changeType: z.string().min(1, 'Change type is required'),
    effectiveDate: z.date({ required_error: 'Effective date is required' }),
    notes: z.string().optional(),
  });

  const historyForm = useForm({
    resolver: zodResolver(historySchema),
    defaultValues: {
      changeType: '',
      effectiveDate: new Date(),
      notes: '',
    },
  });
  
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [documentPreviewVisible, setDocumentPreviewVisible] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [refreshingEmployees, setRefreshingEmployees] = useState(false);
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [savingJobTitle, setSavingJobTitle] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState([]);

  const formSteps = [
    { key: 'basic', title: 'Employee Information' },
    { key: 'emergency', title: 'Emergency & Next of Kin' }
  ];

  const defaultFormValues = {
    employmentType: 'full_time',
    status: 'active',
    salaryType: 'salary',
    payFrequency: 'monthly'
  };

  useEffect(() => {
    setPageSearchConfig({ scope: 'employees', placeholder: SEARCH_PLACEHOLDERS.EMPLOYEES });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  // Load department options for table column labels (and refetch when modal opens/closes)
  useEffect(() => {
    const load = async () => {
      try {
        const depts = await customDropdownService.getCustomOptions('department');
        setDepartmentOptions(depts || []);
      } catch (error) {
        console.error('Failed to load departments:', error);
      }
    };
    load();
  }, [modalVisible]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  const employeeFilterParams = useMemo(() => {
    const params = { ...filters };
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [filters, debouncedSearch]);

  // Pages on desktop; loads as you scroll on phones and tablets.
  const employeeQuery = usePagedList({
    queryKey: (params) => ['employees', params.page, params.limit, filters, debouncedSearch],
    params: employeeFilterParams,
    fetchPage: (params) => employeeService.getEmployees(params),
    getRows: employeeRowsFromResponse,
    getTotal: (response) => Number(response?.count) || 0,
    page: pagination.current,
    pageSize: pagination.pageSize,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
  });
  const employeesInfinite = employeeQuery.infinite;

  const resetFormState = () => {
    setFormStep(0);
    form.reset(defaultFormValues);
    setEditingEmployee(null);
  };

  const fetchEmployeeDetails = async (id) => {
    setDrawerLoading(true);
    try {
      const response = await employeeService.getEmployee(id);
      const data = response?.data || response;
      setViewingEmployee((prev) => (prev?.id === id ? data : prev));
    } catch (error) {
      showError(null, 'Failed to load employee details');
    } finally {
      setDrawerLoading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: employeeService.createEmployee,
    onSuccess: () => {
      showSuccess('Employee created');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setModalVisible(false);
      resetFormState();
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to create employee');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => employeeService.updateEmployee(id, payload),
    onSuccess: (_, variables) => {
      showSuccess('Employee updated');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (viewingEmployee?.id === variables.id) {
        fetchEmployeeDetails(variables.id);
      }
      setModalVisible(false);
      resetFormState();
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to update employee');
    }
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, payload }) => employeeService.archiveEmployee(id, payload),
    onSuccess: (_, variables) => {
      showSuccess('Employee archived');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (viewingEmployee?.id === variables.id) {
        setDrawerVisible(false);
      }
    },
    onError: (error) => {
      showError(error, error?.response?.data?.message || 'Failed to archive employee');
    }
  });

  const handleOpenCreate = () => {
    resetFormState();
    setModalVisible(true);
  };

  const handleOpenEdit = (record) => {
    setFormStep(0);
    setEditingEmployee(record);
    form.reset({
      firstName: record.firstName,
      lastName: record.lastName,
      email: record.email || '',
      phone: record.phone || '',
      department: record.department || '',
      jobTitle: record.jobTitle || '',
      employmentType: record.employmentType || 'full_time',
      status: record.status || 'active',
      hireDate: record.hireDate ? dayjs(record.hireDate) : null,
      endDate: record.endDate ? dayjs(record.endDate) : null,
      salaryType: record.salaryType || 'salary',
      salaryAmount: Number(record.salaryAmount) || 0,
      payFrequency: record.payFrequency || 'monthly',
      bankName: record.bankName || '',
      customBankName: record.customBankName || '',
      bankAccountName: record.bankAccountName || '',
      bankAccountNumber: record.bankAccountNumber || '',
      emergencyContact: record.emergencyContact && typeof record.emergencyContact === 'object' ? record.emergencyContact : {},
      nextOfKin: record.nextOfKin && typeof record.nextOfKin === 'object' ? record.nextOfKin : {},
      notes: record.notes || ''
    });
    setModalVisible(true);
  };

  const onSubmit = async (values) => {
    // Ensure firstName and lastName are present and not empty
    const firstName = values.firstName?.trim();
    const lastName = values.lastName?.trim();
    
    if (!firstName || !lastName) {
      if (formStep !== 0) {
        setFormStep(0);
      }
      showError(null, 'First Name and Last Name are required');
      return;
    }

    const payload = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email?.trim() || null,
      phone: values.phone || null,
      department: values.department || null,
      jobTitle: values.jobTitle || null,
      employmentType: values.employmentType || 'full_time',
      status: values.status || 'active',
      hireDate: values.hireDate ? (dayjs.isDayjs(values.hireDate) ? values.hireDate.format('YYYY-MM-DD') : values.hireDate) : null,
      endDate: values.endDate ? (dayjs.isDayjs(values.endDate) ? values.endDate.format('YYYY-MM-DD') : values.endDate) : null,
      salaryType: values.salaryType || 'salary',
      salaryAmount: values.salaryAmount || 0,
      payFrequency: values.payFrequency || 'monthly',
      bankName: values.bankName || null,
      customBankName: values.customBankName || null,
      bankAccountName: values.bankAccountName || null,
      bankAccountNumber: values.bankAccountNumber || null,
      emergencyContact: values.emergencyContact || {},
      nextOfKin: values.nextOfKin || {},
      notes: values.notes || null
    };

    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleView = (record) => {
    setViewingEmployee(record);
    setDrawerVisible(true);
    fetchEmployeeDetails(record.id);
  };

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setViewingEmployee(null);
    setDrawerLoading(false);
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    resetFormState();
  };

  const handleNextStep = async () => {
    // Validate only fields on the current step
    if (formStep === 0) {
      // Validate step 0 required fields: firstName, lastName, salaryAmount
      const fieldsToValidate = ['firstName', 'lastName', 'salaryAmount'];
      
      // If email is provided, validate its format
      const currentValues = form.getValues();
      if (currentValues.email) {
        fieldsToValidate.push('email');
      }
      
      const isValid = await form.trigger(fieldsToValidate);
      if (!isValid) {
        return;
      }
    }
    // Step 1 has no required fields, so no validation needed
    setFormStep((prev) => Math.min(prev + 1, formSteps.length - 1));
  };

  const handlePrevStep = () => {
    setFormStep((prev) => Math.max(prev - 1, 0));
  };

  const handleUploadDocument = async ({ file }) => {
    if (!viewingEmployee) return;
    setDocumentUploading(true);
    try {
      const response = await employeeService.uploadDocument(viewingEmployee.id, file);
      const newDoc = response.data || response;
      setViewingEmployee((prev) => ({
        ...prev,
        documents: [newDoc, ...(prev.documents || [])]
      }));
      showSuccess('Document uploaded');
    } catch (error) {
      showError(error, error?.response?.data?.message || 'Failed to upload document');
    } finally {
      setDocumentUploading(false);
    }
  };

  const handleOpenDocumentPreview = (doc) => {
    setDocumentPreview(doc);
    setDocumentPreviewVisible(true);
  };

  const handleCloseDocumentPreview = () => {
    setDocumentPreviewVisible(false);
    setDocumentPreview(null);
  };

  const handleDeleteDocument = async (documentId) => {
    if (!viewingEmployee) return;
    try {
      await employeeService.deleteDocument(viewingEmployee.id, documentId);
      setViewingEmployee((prev) => ({
        ...prev,
        documents: (prev.documents || []).filter((doc) => doc.id !== documentId)
      }));
      showSuccess('Document removed');
    } catch (error) {
      showError(null, 'Failed to delete document');
    }
  };

  const handleAddHistory = async (payload) => {
    if (!viewingEmployee) return;
    try {
      const response = await employeeService.addHistory(viewingEmployee.id, payload);
      const history = response.data || response;
      setViewingEmployee((prev) => ({
        ...prev,
        history: [history, ...(prev.history || [])]
      }));
      showSuccess('History entry added');
      setHistoryDialogOpen(false);
      historyForm.reset();
    } catch (error) {
      showError(null, 'Failed to add history entry');
    }
  };

  const onSubmitHistory = async (values) => {
    await handleAddHistory({
      changeType: values.changeType,
      effectiveDate: dayjs(values.effectiveDate).format('YYYY-MM-DD'),
      notes: values.notes || null,
    });
  };

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (_, record) => (
        <div>
          <div className="font-semibold text-foreground">{`${record?.firstName || ''} ${record?.lastName || ''}`}</div>
          <div className="text-muted-foreground text-xs">{record?.jobTitle || '—'}</div>
        </div>
      )
    },
    {
      key: 'department',
      label: 'Department',
      render: (_, record) => {
        const val = record?.department;
        const label = val && departmentOptions.find((d) => d.value === val)?.label;
        return <span className="text-foreground">{label || val || '—'}</span>;
      }
    },
    {
      key: 'employmentType',
      label: 'Employment Type',
      render: (_, record) => <span className="text-foreground">{record?.employmentType?.replace('_', ' ').toUpperCase() || '—'}</span>
    },
    {
      key: 'status',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => <StatusChip status={record?.status} />
    },
    {
      key: 'hireDate',
      label: 'Hire Date',
      render: (_, record) => <span className="text-foreground">{record?.hireDate ? dayjs(record.hireDate).format('MMM DD, YYYY') : '—'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          record={record}
          onView={handleView}
          extraActions={[
            {
              key: 'edit',
              label: 'Edit',
              variant: 'secondary',
              icon: <FilePlus className="h-4 w-4" />,
              onClick: () => handleOpenEdit(record)
            }
          ]}
        />
      )
    }
  ], [handleView, departmentOptions]);

  /** Every loaded row (one page on desktop; all scrolled-in pages on phones and tablets). */
  const employees = employeeQuery.rows;
  /** The page the summary cards count (the first page on phones and tablets). */
  const summaryEmployees = useMemo(
    () => employeeRowsFromResponse(employeeQuery.response),
    [employeeQuery.response]
  );

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!Array.isArray(summaryEmployees)) {
      return {
        totals: {
          totalEmployees: 0,
          activeEmployees: 0,
          inactiveEmployees: 0,
          departments: 0
        }
      };
    }
    
    const totalEmployees = summaryEmployees.length || 0;
    const activeEmployees = summaryEmployees.filter(e => e?.status === 'active').length || 0;
    const inactiveEmployees = summaryEmployees.filter(e => e?.status === 'inactive').length || 0;
    const departments = new Set(summaryEmployees.map(e => e?.department).filter(Boolean)).size || 0;
    
    return {
      totals: {
        totalEmployees: Number(totalEmployees) || 0,
        activeEmployees: Number(activeEmployees) || 0,
        inactiveEmployees: Number(inactiveEmployees) || 0,
        departments: Number(departments) || 0
      }
    };
  }, [summaryEmployees]);

  const organization = employeeQuery.response?.organization || {};

  // Helper function to render table from columns and dataSource with server-side pagination
  const renderTable = (columns, dataSource, rowKey = 'id', options = {}) => {
    const { pagination: tablePagination, loading, onChange } = options;
    const pageSize = tablePagination?.pageSize || 10;
    const current = tablePagination?.current || 1;
    const total = tablePagination?.total || dataSource?.length || 0;
    const showPagination = tablePagination !== false && total > pageSize;

    if (loading) {
      return <TableSkeleton rows={pageSize} cols={columns.length} />;
    }

    return (
      <div className="rounded-md border">
        <Table>
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
            {dataSource.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  No data available
                </TableCell>
              </TableRow>
            ) : (
              dataSource.map((record) => (
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
        </Table>
        {showPagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {((current - 1) * pageSize) + 1} to {Math.min(current * pageSize, total)} of {total} entries
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChange && onChange({ current: current - 1, pageSize })}
                disabled={current === 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {current} of {Math.ceil(total / pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChange && onChange({ current: current + 1, pageSize })}
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


  const handleClearFilters = () => {
    setFilters({
      status: 'all',
      employmentType: 'all'
    });
    setPagination({ ...pagination, current: 1 });
  };

  const hasActiveFilters = filters.status !== 'all' || filters.employmentType !== 'all';

  // Apply client-side filtering
  const filteredEmployees = useMemo(() => {
    if (!Array.isArray(employees)) return [];
    
    let result = employees;
    
    if (filters.status !== 'all') {
      result = result.filter(e => e?.status === filters.status);
    }
    if (filters.employmentType !== 'all') {
      result = result.filter(e => e?.employmentType === filters.employmentType);
    }
    
    return result;
  }, [employees, filters]);

  // Paginate filtered employees (phones and tablets show every loaded row and load more on scroll)
  const paginatedEmployees = useMemo(() => {
    if (employeesInfinite) return filteredEmployees;
    const start = (pagination.current - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return filteredEmployees.slice(start, end);
  }, [employeesInfinite, filteredEmployees, pagination.current, pagination.pageSize]);

  const employeesCount = employeesInfinite ? employeeQuery.total : filteredEmployees.length;

  // Drawer tabs for employee details
  const drawerTabs = useMemo(() => {
    if (!viewingEmployee) return [];

    return [
      {
        key: 'overview',
        label: 'Overview',
        content: (
          <div className="space-y-6">
            <DrawerSectionCard title="Employee information">
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Name">
                  {viewingEmployee.firstName} {viewingEmployee.lastName}
                </DescriptionItem>
                <DescriptionItem label="Email">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {viewingEmployee.email || '—'}
                  </div>
                </DescriptionItem>
                <DescriptionItem label="Phone">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {viewingEmployee.phone || '—'}
                  </div>
                </DescriptionItem>
                <DescriptionItem label="Department">{viewingEmployee.department || '—'}</DescriptionItem>
                <DescriptionItem label="Job Title">{viewingEmployee.jobTitle || '—'}</DescriptionItem>
                <DescriptionItem label="Employment Type">
                  {viewingEmployee.employmentType?.replace('_', ' ').toUpperCase()}
                </DescriptionItem>
                <DescriptionItem label="Status">
                  <StatusChip status={viewingEmployee.status} />
                </DescriptionItem>
                <DescriptionItem label="Hire Date">
                  {viewingEmployee.hireDate ? dayjs(viewingEmployee.hireDate).format('MMM DD, YYYY') : '—'}
                </DescriptionItem>
                <DescriptionItem label="End Date">
                  {viewingEmployee.endDate ? dayjs(viewingEmployee.endDate).format('MMM DD, YYYY') : '—'}
                </DescriptionItem>
              </Descriptions>
            </DrawerSectionCard>
            <DrawerSectionCard title="Compensation">
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Salary Type">{viewingEmployee.salaryType?.toUpperCase()}</DescriptionItem>
                <DescriptionItem label="Base Amount">
                  ₵ {Number(viewingEmployee.salaryAmount || 0).toFixed(2)}
                </DescriptionItem>
                <DescriptionItem label="Pay Frequency">{viewingEmployee.payFrequency?.toUpperCase()}</DescriptionItem>
                <DescriptionItem label="Bank / Wallet">{viewingEmployee.bankName || '—'}</DescriptionItem>
                <DescriptionItem label="Account Name">{viewingEmployee.bankAccountName || '—'}</DescriptionItem>
                <DescriptionItem label="Account / Momo Number">{viewingEmployee.bankAccountNumber || '—'}</DescriptionItem>
              </Descriptions>
            </DrawerSectionCard>
            <DrawerSectionCard title="Emergency contact">
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Name">{viewingEmployee.emergencyContact?.name || '—'}</DescriptionItem>
                <DescriptionItem label="Relationship">{viewingEmployee.emergencyContact?.relationship || '—'}</DescriptionItem>
                <DescriptionItem label="Phone">{viewingEmployee.emergencyContact?.phone || '—'}</DescriptionItem>
                <DescriptionItem label="Email">{viewingEmployee.emergencyContact?.email || '—'}</DescriptionItem>
              </Descriptions>
            </DrawerSectionCard>
            <DrawerSectionCard title="Next of kin">
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Name">{viewingEmployee.nextOfKin?.name || '—'}</DescriptionItem>
                <DescriptionItem label="Relationship">{viewingEmployee.nextOfKin?.relationship || '—'}</DescriptionItem>
                <DescriptionItem label="Phone">{viewingEmployee.nextOfKin?.phone || '—'}</DescriptionItem>
                <DescriptionItem label="Email">{viewingEmployee.nextOfKin?.email || '—'}</DescriptionItem>
              </Descriptions>
            </DrawerSectionCard>
            {viewingEmployee.notes && (
              <DrawerSectionCard title="Notes">
                <p className="text-sm">{viewingEmployee.notes}</p>
              </DrawerSectionCard>
            )}
          </div>
        )
      },
      {
        key: 'documents',
        label: 'Documents',
        content: (
          <DrawerSectionCard title="Documents">
            <FileUpload
              onFileSelect={handleUploadDocument}
              disabled={documentUploading}
              uploading={documentUploading}
              uploadedFiles={viewingEmployee.documents || []}
              onFilePreview={handleOpenDocumentPreview}
              onFileRemove={(doc) => handleDeleteDocument(doc.id)}
              showFileList={true}
              emptyMessage="No documents uploaded yet."
            />
          </DrawerSectionCard>
        )
      },
      {
        key: 'history',
        label: 'History',
        content: (
          <DrawerSectionCard title="History">
            <div className="space-y-4">
              <Button onClick={() => setHistoryDialogOpen(true)}>
                <History className="h-4 w-4 mr-2" />
                Add History Note
              </Button>
              <Timeline>
                {(viewingEmployee.history || []).map((item, index) => {
                  const isLast = index === (viewingEmployee.history || []).length - 1;
                  const formatChangeType = (changeType) => {
                    return changeType
                      .split('_')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ');
                  };
                  return (
                    <TimelineItem key={index} isLast={isLast}>
                      <TimelineIndicator />
                      <TimelineContent>
                        <TimelineTitle className="text-foreground">{formatChangeType(item.changeType)}</TimelineTitle>
                        <TimelineTime className="text-foreground">{dayjs(item.effectiveDate).format('MMM DD, YYYY [at] h:mm A')}</TimelineTime>
                        {item.notes && <TimelineDescription className="text-foreground">{item.notes}</TimelineDescription>}
                      </TimelineContent>
                    </TimelineItem>
                  );
                })}
              </Timeline>
            </div>
          </DrawerSectionCard>
        )
      },
      {
        key: 'payroll',
        label: 'Payroll',
        content: (
          <DrawerSectionCard title="Payroll">
            {viewingEmployee.payrollEntries?.length ? (
              <div className="space-y-4">
                {viewingEmployee.payrollEntries.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="pt-6">
                      <div className="flex flex-col gap-1">
                        <strong>
                          {entry.run?.periodStart
                            ? `${dayjs(entry.run.periodStart).format('MMM DD')} - ${dayjs(entry.run.periodEnd).format('MMM DD, YYYY')}`
                            : 'Payroll Entry'}
                        </strong>
                        <p className="text-muted-foreground text-sm">
                          Pay Date: {entry.run?.payDate ? dayjs(entry.run.payDate).format('MMM DD, YYYY') : '—'} • Status:{' '}
                          {entry.run?.status ? (
                            <StatusChip status={entry.run.status} />
                          ) : (
                            <span>—</span>
                          )}
                        </p>
                        <p>
                          Gross: ₵ {parseFloat(entry.grossPay || 0).toFixed(2)} • Net:{' '}
                          <strong>₵ {parseFloat(entry.netPay || 0).toFixed(2)}</strong>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No payroll history yet.</p>
            )}
          </DrawerSectionCard>
        )
      }
    ];
  }, [viewingEmployee, documentUploading]);

  const employeesEmptyState = useMemo(
    () =>
      getEmptyStateProps(EMPTY_STATES.EMPLOYEES, {
        primary: handleOpenCreate,
      }),
    [handleOpenCreate]
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-4">
        <WelcomeSection
          welcomeMessage="Employees"
          subText="Manage your team, payroll readiness, and HR records."
        />
        <div className="flex gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setFilterDrawerOpen(true)} size={isMobile ? "icon" : "default"}>
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter employees by status or employment type</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                onClick={async () => {
                  setRefreshingEmployees(true);
                  await queryClient.invalidateQueries({ queryKey: ['employees'] });
                  setRefreshingEmployees(false);
                }}
                disabled={refreshingEmployees}
                size={isMobile ? "icon" : "default"}
              >
                {refreshingEmployees ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh employees list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleOpenCreate} className="flex-1 min-w-0 md:flex-none">
                <Plus className="h-4 w-4" />
                <span className="ml-2">New Employee</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new employee</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        <DashboardStatsCard
          tooltip="Total number of employees"
          title="Total Employees"
          value={summaryStats?.totals?.totalEmployees || 0}
          icon={Users}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          tooltip="Currently active employees"
          title="Active"
          value={summaryStats?.totals?.activeEmployees || 0}
          icon={UserCheck}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
        <DashboardStatsCard
          tooltip="Employees no longer active"
          title="Inactive"
          value={summaryStats?.totals?.inactiveEmployees || 0}
          icon={Users}
          iconBgColor="rgba(107, 114, 128, 0.1)"
          iconColor="#6b7280"
        />
        <DashboardStatsCard
          tooltip="Number of departments"
          title="Departments"
          value={summaryStats?.totals?.departments || 0}
          icon={Building2}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#3b82f6"
        />
      </div>

      {/* Main Content Area */}
      <DashboardTable
        data={paginatedEmployees}
        columns={tableColumns}
        loading={employeeQuery.isLoading}
        title={null}
        emptyState={employeesEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination(newPagination);
        }}
        externalPagination={{
          current: pagination.current,
          total: employeesCount
        }}
        infinite={employeesInfinite}
      />

      {/* Filter Drawer */}
      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[400px] md:w-[540px] overflow-y-auto"
          style={{ top: 8, bottom: 8, right: 8, height: 'calc(100dvh - 16px)', borderRadius: 8 }}
        >
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Employees</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => {
                  setFilters({ ...filters, status: value });
                  setPagination({ ...pagination, current: 1 });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Employment Type</Label>
              <Select
                value={filters.employmentType}
                onValueChange={(value) => {
                  setFilters({ ...filters, employmentType: value });
                  setPagination({ ...pagination, current: 1 });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Employment Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {employmentTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClearFilters} className="w-full">
                Clear Filters
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <MobileFormDialog
        open={modalVisible}
        onOpenChange={(open) => {
          if (!open) handleModalCancel();
        }}
        title={editingEmployee ? 'Edit Employee' : 'New Employee'}
        footer={
          <>
            {formStep > 0 && (
              <Button variant="outline" onClick={handlePrevStep}>
                Previous
              </Button>
            )}
            {formStep < formSteps.length - 1 && !editingEmployee && (
              <Button onClick={handleNextStep}>
                Next
              </Button>
            )}
            {(formStep === formSteps.length - 1 || editingEmployee) && (
              <Button
                loading={createMutation.isLoading || updateMutation.isLoading}
                onClick={form.handleSubmit(onSubmit)}
              >
                {editingEmployee ? 'Update' : 'Create'} Employee
              </Button>
            )}
          </>
        }
      >
        <Steps current={formStep} className="mb-6">
          {formSteps.map((step, index) => (
            <Step key={index} index={index} current={formStep} title={step.title} />
          ))}
        </Steps>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <EmployeeForm currentStep={formStep} form={form} savingDepartment={savingDepartment} setSavingDepartment={setSavingDepartment} savingJobTitle={savingJobTitle} setSavingJobTitle={setSavingJobTitle} savingBank={savingBank} setSavingBank={setSavingBank} isModalOpen={modalVisible} />
          </form>
        </Form>
      </MobileFormDialog>

      {drawerVisible && (
        <DetailsDrawer
          open={drawerVisible}
          onClose={handleCloseDrawer}
          title={viewingEmployee ? `${viewingEmployee.firstName} ${viewingEmployee.lastName}` : 'Employee Details'}
          width={900}
          tabs={drawerTabs}
          onEdit={viewingEmployee ? () => {
            handleOpenEdit(viewingEmployee);
            setDrawerVisible(false);
          } : null}
          onDelete={viewingEmployee ? () => {
            archiveMutation.mutate({ id: viewingEmployee.id, payload: {} });
          } : null}
          deleteConfirmText="Are you sure you want to archive this employee?"
        />
      )}

      {/* History Note Dialog */}
      <MobileFormDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        title="Add History Note"
        description="Record an event or note for this employee's history."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setHistoryDialogOpen(false);
                historyForm.reset();
              }}
            >
              Cancel
            </Button>
            <Button form="history-form" type="submit">
              Add History Note
            </Button>
          </>
        }
      >
        <Form {...historyForm}>
          <form id="history-form" onSubmit={historyForm.handleSubmit(onSubmitHistory)} className="space-y-4">
            <FormField
              control={historyForm.control}
              name="changeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {historyChangeTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={historyForm.control}
              name="effectiveDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Effective Date</FormLabel>
                  <FormControl>
                    <DatePicker
                      date={field.value ? (dayjs.isDayjs(field.value) ? field.value.toDate() : new Date(field.value)) : new Date()}
                      onDateChange={(date) => {
                        field.onChange(date ? dayjs(date) : null);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={historyForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter additional details..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </MobileFormDialog>

      <FilePreview
        open={documentPreviewVisible}
        onClose={handleCloseDocumentPreview}
        file={documentPreview ? {
          fileUrl: documentPreview.fileUrl,
          title: documentPreview.title || documentPreview.type || 'Document',
          type: documentPreview.type,
          metadata: documentPreview.metadata || {}
        } : null}
      />
    </div>
  );
};

export default Employees;


