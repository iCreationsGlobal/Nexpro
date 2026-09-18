import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ArrowLeft, Loader2, X, Check, Camera, Search, ShoppingBag, Printer, Scissors, Car, UtensilsCrossed, Pill, Briefcase, Package, MessageCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showError, showLoading, showSuccess } from '../utils/toast';
import FileUpload from '../components/FileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '../services/api';
import { useQueryClient } from '@tanstack/react-query';
import authService from '../services/authService';
import dashboardService from '../services/dashboardService';
import ReactCountryFlag from 'react-country-flag';
import { stripLeadingTrunkZero } from '../utils/phoneUtils';
import { BUSINESS_OPTIONS, BUSINESS_GROUPS, getCoreTypeForBusinessSubType } from '@/constants/businessTypes';
import {
  PRIVACY_POLICY_URL,
  TERMS_PATH,
  TERMS_VERSION,
} from '../constants/legal';

const onboardingSchema = z.object({
  businessGroup: z.string().min(1, 'Select your business type'),
  businessSubTypes: z.array(z.string()).min(1, 'Select at least one business type'),
  companyName: z.string().min(1, 'Enter your business name'),
  companyLogo: z.any().optional(),
  companyAddress: z.string().optional().or(z.literal('')),
  industry: z.string().optional(),
  companyEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phoneCountryCode: z.string().min(1, 'Select country code'),
  companyPhone: z.string().min(1, 'Enter phone number'),
  companyWebsite: z.string().refine(
    (val) => {
      if (!val || val === '') return true;
      // Add protocol if missing
      const url = val.startsWith('http://') || val.startsWith('https://') ? val : `https://${val}`;
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Enter a valid URL' }
  ).optional().or(z.literal('')),
});

const countryCodes = [
  { code: '+233', country: 'GH', name: 'Ghana' },
  { code: '+234', country: 'NG', name: 'Nigeria' },
  { code: '+254', country: 'KE', name: 'Kenya' },
  { code: '+27', country: 'ZA', name: 'South Africa' },
  { code: '+255', country: 'TZ', name: 'Tanzania' },
  { code: '+256', country: 'UG', name: 'Uganda' },
  { code: '+250', country: 'RW', name: 'Rwanda' },
  { code: '+225', country: 'CI', name: 'Ivory Coast' },
  { code: '+212', country: 'MA', name: 'Morocco' },
  { code: '+251', country: 'ET', name: 'Ethiopia' },
  { code: '+1', country: 'US', name: 'United States' },
  { code: '+44', country: 'GB', name: 'United Kingdom' },
];

const businessTypes = [
  {
    value: 'shop',
    label: 'Shop Management',
    description: 'Point of sale, inventory, and sales management'
  },
  {
    value: 'studio',
    label: 'Studio Management',
    description: 'Manage jobs, services, quotes, and production workflows'
  },
  {
    value: 'pharmacy',
    label: 'Pharmacy Management',
    description: 'Prescription management, drug inventory, and patient records'
  },
  {
    value: 'rental',
    label: 'Rental Business',
    description: 'Hire out items, track returns, late charges, and availability'
  }
];

const Onboarding = () => {
  const navigate = useNavigate();
  const {
    activeTenant,
    refreshAuthState,
    shouldRequireOnboarding,
    loading: authLoading,
  } = useAuth();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [subTypeModalOpen, setSubTypeModalOpen] = useState(false);

  // Check if onboarding is already completed
  useEffect(() => {
    if (authLoading) return;
    if (!shouldRequireOnboarding) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, shouldRequireOnboarding, navigate]);

  const form = useForm({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      businessGroup: '',
      businessSubTypes: [],
      companyName: '',
      companyLogo: undefined,
      companyAddress: '',
      companyEmail: '',
      phoneCountryCode: '+233', // Default to Ghana, required field
      companyPhone: '',
      companyWebsite: '',
    }
  });
  

  const getBusinessGroupLabel = (group) => {
    switch (group) {
      case BUSINESS_GROUPS.RETAIL:
        return 'Retail shops';
      case BUSINESS_GROUPS.PRINT_PHOTO:
        return 'Professional services';
      case BUSINESS_GROUPS.BEAUTY:
        return 'Beauty & Grooming';
      case BUSINESS_GROUPS.AUTO:
        return 'Auto & Workshop';
      case BUSINESS_GROUPS.FOOD:
        return 'Food & Drinks';
      case BUSINESS_GROUPS.HEALTH:
        return 'Health / Pharmacy';
      case BUSINESS_GROUPS.RENTAL:
        return 'Rental';
      case BUSINESS_GROUPS.SERVICES:
      default:
        return 'Other services';
    }
  };

  const getBusinessGroupIcon = (group) => {
    switch (group) {
      case BUSINESS_GROUPS.RETAIL:
        return ShoppingBag;
      case BUSINESS_GROUPS.PRINT_PHOTO:
        return Briefcase;
      case BUSINESS_GROUPS.BEAUTY:
        return Scissors;
      case BUSINESS_GROUPS.AUTO:
        return Car;
      case BUSINESS_GROUPS.FOOD:
        return UtensilsCrossed;
      case BUSINESS_GROUPS.HEALTH:
        return Pill;
      case BUSINESS_GROUPS.RENTAL:
        return Package;
      case BUSINESS_GROUPS.SERVICES:
      default:
        return MessageCircle;
    }
  };

  const getBusinessGroupExamples = (group) => {
    switch (group) {
      case BUSINESS_GROUPS.RETAIL:
        return 'e.g. Supermarkets, provision stores, hardware shops, cosmetics shops';
      case BUSINESS_GROUPS.PRINT_PHOTO:
        return 'e.g. Printing press, photo studio, branding, software & IT services';
      case BUSINESS_GROUPS.BEAUTY:
        return 'e.g. Barbering shops, hair salons, spas and nail bars';
      case BUSINESS_GROUPS.AUTO:
        return 'e.g. Mechanic workshops, car wash and detailing';
      case BUSINESS_GROUPS.FOOD:
        return 'e.g. Restaurants, fast food joints, bakeries and pastry shops';
      case BUSINESS_GROUPS.HEALTH:
        return 'e.g. Community pharmacies, clinic or hospital pharmacies';
      case BUSINESS_GROUPS.RENTAL:
        return 'e.g. Equipment rental, event rental, vehicle rental';
      case BUSINESS_GROUPS.SERVICES:
      default:
        return 'e.g. Other professional and local services';
    }
  };

  const businessOptionsByGroup = useMemo(() => {
    const groups = {};
    BUSINESS_OPTIONS.forEach((opt) => {
      const key = opt.group || 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(opt);
    });
    return groups;
  }, []);

  const onSubmit = async (values) => {
    const fullPhone = values.phoneCountryCode
      ? `${values.phoneCountryCode} ${values.companyPhone}`
      : values.companyPhone;

    setCheckingPhone(true);
    try {
      const phoneCheckResponse = await api.post('/tenants/check-business-phone', {
        phone: fullPhone,
      });
      const phoneCheckData = phoneCheckResponse?.data ?? phoneCheckResponse;
      const exists =
        phoneCheckData?.data?.exists ??
        phoneCheckData?.exists ??
        false;

      if (exists) {
        form.setError('companyPhone', {
          type: 'manual',
          message:
            'This business phone number is already used by another workspace. Use a different phone number.',
        });
        showError(
          null,
          'This phone number is already linked to another workspace. Please use a different number to continue.'
        );
        return;
      }
    } catch (phoneError) {
      console.error('[Onboarding] Failed to pre-check business phone', phoneError);
    } finally {
      setCheckingPhone(false);
    }

    setCreatingBusiness(true);
    setLoading(true);
    const finishDismiss = showLoading('Finishing setup...');
    try {
      // Prepare form data for file upload
      const formData = new FormData();

      // Multiple sub-types can be selected now; the first pick stays the "primary" one that
      // drives businessType/shopType (everything downstream still expects a single value).
      // The full selection is sent separately so it isn't lost.
      const selectedSubTypes = Array.isArray(values.businessSubTypes) ? values.businessSubTypes : [];
      let selectedSubType = selectedSubTypes[0] || null;
      const isOther = selectedSubType === 'other';
      if (isOther && customBusinessType.trim()) {
        selectedSubType = customBusinessType.trim();
      }
      const derivedCoreType = getCoreTypeForBusinessSubType(selectedSubType);
      const existingBusinessType = activeTenant?.businessType || null;
      const effectiveBusinessType =
        existingBusinessType && existingBusinessType !== 'shop'
          ? existingBusinessType
          : derivedCoreType || 'shop';

      formData.append('businessType', effectiveBusinessType);

      // For shops, also persist a more specific shopType (sub-type) for seeding and defaults.
      if (effectiveBusinessType === 'shop' && selectedSubType) {
        formData.append('shopType', selectedSubType);
      }

      // Store selected business sub-type (everyday label) for metadata
      if (selectedSubType) {
        formData.append('businessSubType', selectedSubType);
      }
      if (selectedSubTypes.length > 0) {
        formData.append('businessSubTypes', JSON.stringify(selectedSubTypes));
      }
      if (values.companyName) formData.append('companyName', values.companyName);
      if (values.companyEmail) formData.append('companyEmail', values.companyEmail);
      // Phone is required, so always append it
      formData.append('companyPhone', fullPhone);
      if (values.companyWebsite) {
        // Add protocol if missing
        const website = values.companyWebsite.startsWith('http://') || values.companyWebsite.startsWith('https://') 
          ? values.companyWebsite 
          : `https://${values.companyWebsite}`;
        formData.append('companyWebsite', website);
      }
      if (values.companyAddress) formData.append('companyAddress', values.companyAddress);
      if (values.companyLogo) formData.append('companyLogo', values.companyLogo);
      if (requiresTermsAcceptance) {
        formData.append('acceptedTerms', 'true');
        formData.append('termsVersion', TERMS_VERSION);
      }

      // Save onboarding data to backend
      await api.post('/tenants/onboarding', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Refresh auth state so AuthContext has the latest tenant (including metadata.onboarding.completedAt)
      try {
        console.log('[Onboarding] After POST /tenants/onboarding: calling refreshAuthState, typeof=%s', typeof refreshAuthState);
        if (typeof refreshAuthState === 'function') {
          const refreshed = await refreshAuthState();
          console.log('[Onboarding] refreshAuthState done. first membership tenant.metadata.onboarding=%j', refreshed?.memberships?.[0]?.tenant?.metadata?.onboarding);
        } else {
          const body = await authService.getCurrentUser();
          const userData = body?.data ?? body;
          const memberships = userData?.tenantMemberships || [];
          authService.persistAuthPayload({
            user: userData,
            memberships: memberships,
            defaultTenantId: memberships[0]?.tenantId || null
          });
        }
      } catch (refreshError) {
        console.error('Failed to refresh user data after onboarding:', refreshError);
        // Continue with navigation even if refresh fails
      }

      // Invalidate queries to refresh tenant data and wait for them to complete
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] })
      ]);

      // Prefetch dashboard data to ensure it's ready when user lands on dashboard
      try {
        await dashboardService.getOverview();
      } catch (dashboardError) {
        const status = dashboardError?.response?.status;
        if (status !== 403) {
          console.error('Failed to prefetch dashboard data:', dashboardError);
        }
        // Continue even if prefetch fails - dashboard will load on its own
      }

      // Wait a moment for AuthContext to update
      await new Promise(resolve => setTimeout(resolve, 300));

      // Now navigate - animation will continue until dashboard is ready
      setLoading(false);
      if (finishDismiss) finishDismiss();
      showSuccess(
        effectiveBusinessType === 'rental'
          ? 'Your rental workspace is ready. Add rentable products and set daily rates to get started.'
          : 'Your workspace is ready'
      );
      console.log('[Onboarding] Navigating to /dashboard');
      navigate('/dashboard');
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to save onboarding data. Please try again.';
      if (finishDismiss) finishDismiss();
      showError(error, errorMessage);
    } finally {
      setLoading(false);
      setCreatingBusiness(false);
    }
  };

  // Skip onboarding and go to dashboard
  const handleSkip = () => {
    navigate('/dashboard');
  };

  const watchedValues = form.watch();
  
  // Conditionally include steps (account is always considered completed)
  const getTimelineSteps = () => {
    const steps = [
      { id: 'account', label: 'Create Account', completed: true },
      { id: 'businessType', label: 'Business type', completed: false },
      { id: 'businessInfo', label: 'Business Info', completed: false },
      { id: 'contactInfo', label: 'Contact Info', completed: false }
    ];
    return steps;
  };

  const timelineSteps = getTimelineSteps();

  const getSteps = () => {
    const stepsArray = [];

    stepsArray.push(
      {
        id: 'businessType',
        title: 'What type of business are you running?',
        subtitle: 'This helps us set up the right dashboard and tools for you.',
        fields: ['businessGroup']
      },
      {
        id: 'businessInfo',
        title: 'Tell us about your business',
        subtitle: 'This information will appear on your invoices and receipts.',
        fields: ['businessSubTypes', 'companyName'] // Sub-type(s) and name required; logo and address optional
      },
      {
        id: 'contactInfo',
        title: 'Contact Information',
        subtitle: 'Add your business contact details.',
        fields: ['phoneCountryCode', 'companyPhone'] // Phone is now required
      }
    );
    
    return stepsArray;
  };

  const steps = getSteps();
  const requiresTermsAcceptance = !activeTenant?.metadata?.termsAcceptance?.acceptedAt;
  
  // Adjust current step if out of bounds
  useEffect(() => {
    if (currentStep >= steps.length) {
      setCurrentStep(steps.length - 1);
    }
  }, [steps.length, currentStep]);
  
  const currentStepData = steps[currentStep] || steps[0];
  
  const watchedBusinessGroup = form.watch('businessGroup');

  useEffect(() => {
    // When business group changes, clear any previously selected sub-type(s)
    form.setValue('businessSubTypes', []);
  }, [watchedBusinessGroup, form]);

  // Search state for dropdowns
  const [countryCodeSearch, setCountryCodeSearch] = useState('');
  
  // Filter country codes based on search
  const filteredCountryCodes = countryCodes.filter(country =>
    country.code.toLowerCase().includes(countryCodeSearch.toLowerCase()) ||
    country.country.toLowerCase().includes(countryCodeSearch.toLowerCase()) ||
    country.name.toLowerCase().includes(countryCodeSearch.toLowerCase())
  );

  const canProceed = () => {
    const requiredFields = currentStepData.fields;
    
    // If no required fields, always allow proceeding
    if (requiredFields.length === 0) {
      return true;
    }
    
    // Check required fields
    const allRequiredFieldsFilled = requiredFields.every(field => {
      const value = watchedValues[field];
      return value !== undefined && value !== '';
    });
    
    // Also check form errors for the current step fields
    const stepFields = currentStepData.fields.length > 0 
      ? currentStepData.fields 
      : ['companyEmail', 'companyPhone', 'companyWebsite']; // For contact info step
    const hasErrors = stepFields.some(field => {
      return form.formState.errors[field] !== undefined;
    });

    return allRequiredFieldsFilled && !hasErrors;
  };

  const getTimelineStepStatus = (stepId) => {
    if (stepId === 'account') return 'completed';
    
    // Map stepId to currentStep index (businessType = 0, businessInfo = 1, contactInfo = 2)
    const stepIndexMap = {
      businessType: 0,
      businessInfo: 1,
      contactInfo: 2,
    };
    const stepIndex = stepIndexMap[stepId];
    
    if (stepIndex === undefined) return 'pending';
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'current';
    return 'pending';
  };

  const stepIdToIndex = { businessType: 0, businessInfo: 1, contactInfo: 2 };
  const goToStep = (stepId) => {
    const index = stepIdToIndex[stepId];
    if (typeof index === 'number' && index >= 0 && index < steps.length) {
      setCurrentStep(index);
    }
  };

  const handleNext = async () => {
    const fieldsToValidate = currentStepData.fields;
    const result = await form.trigger(fieldsToValidate);
    
    if (result) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        form.handleSubmit(onSubmit)();
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(22, 101, 52, 0.12);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--color-primary);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--color-primary-dark);
        }
        
        @keyframes blockDrop {
          0% {
            opacity: 0;
            transform: translateY(-50px) scale(0.8);
          }
          50% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @keyframes continuousBuild {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          25% {
            transform: translateY(-8px) scale(1.05);
          }
          50% {
            transform: translateY(0) scale(1);
          }
          75% {
            transform: translateY(-4px) scale(1.02);
          }
        }
        
        .building-block {
          opacity: 0;
          animation: blockDrop 0.6s ease-out forwards, continuousBuild 2.5s ease-in-out 1s infinite;
        }
        
        .building-block.block-1 { animation-delay: 0.1s, 1.1s; }
        .building-block.block-2 { animation-delay: 0.2s, 1.2s; }
        .building-block.block-3 { animation-delay: 0.3s, 1.3s; }
        .building-block.block-4 { animation-delay: 0.4s, 1.4s; }
         .building-block.block-5 { animation-delay: 0.5s, 1.5s; }
         .building-block.block-6 { animation-delay: 0.6s, 1.6s; }

         @keyframes dotBounce {
           0%, 80%, 100% { transform: translateY(0); }
           40% { transform: translateY(-4px); }
         }
         .dot-anim {
            display: inline-flex;
            gap: 2px;
            margin-left: 2px;
         }
         .dot-anim span {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: currentColor;
            animation: dotBounce 1.2s infinite ease-in-out;
         }
         .dot-anim span:nth-child(1) { animation-delay: 0s; }
         .dot-anim span:nth-child(2) { animation-delay: 0.15s; }
         .dot-anim span:nth-child(3) { animation-delay: 0.3s; }
       `}</style>
      
      {/* Creating Business Modal */}
      <Dialog open={creatingBusiness} onOpenChange={() => {}}>
        <DialogContent className="sm:w-[var(--modal-w-sm)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)] border-0 bg-card border border-border [&>button]:hidden">
          <div className="flex flex-col items-center justify-center py-8 px-6">
            <div className="mb-6">
              <div className="relative w-48 h-48 flex items-end justify-center">
                {/* Building Blocks - Stacked */}
                <div className="absolute bottom-0 flex flex-col items-center space-y-1">
                  {/* Bottom row - 3 blocks */}
                  <div className="flex space-x-1">
                    <div className="building-block block-1 w-12 h-12 bg-primary rounded-lg border border-border"></div>
                    <div className="building-block block-2 w-12 h-12 bg-lime-400 rounded-lg border border-border"></div>
                    <div className="building-block block-3 w-12 h-12 bg-primary rounded-lg border border-border"></div>
                  </div>
                  {/* Middle row - 2 blocks */}
                  <div className="flex space-x-1">
                    <div className="building-block block-4 w-12 h-12 bg-lime-400 rounded-lg border border-border"></div>
                    <div className="building-block block-5 w-12 h-12 bg-primary rounded-lg border border-border"></div>
                  </div>
                  {/* Top row - 1 block */}
                  <div className="flex">
                    <div className="building-block block-6 w-12 h-12 bg-lime-400 rounded-lg border border-border"></div>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogTitle className="text-2xl font-bold text-foreground mb-2 text-center">
              Creating Your Business
            </DialogTitle>
            <DialogDescription className="text-gray-600 text-center">
              We're setting everything up for you...
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>

    <div className="min-h-screen bg-gradient-to-br from-muted/80 via-background to-muted/50">
      {/* Welcome Message */}
      <div className="pt-8 pb-2 text-center px-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Let's set up your business
        </h1>
      </div>

      {/* Stepper row (same max-width as form card) */}
      <div className="max-w-none md:max-w-3xl mx-auto px-3 pb-3 md:px-4 md:pb-4">
        <div className="flex items-center gap-2 md:gap-3 px-4 md:px-0 md:justify-center">
          {timelineSteps.map((step, index) => {
            const status = getTimelineStepStatus(step.id);
            const isCompleted = status === 'completed';
            const isCurrent = status === 'current';
            const isClickable = step.id !== 'account' && (isCompleted || isCurrent);

            return (
              <div
                key={step.id}
                className="flex items-center gap-2 md:gap-3 flex-1 md:flex-none"
              >
                <button
                  type="button"
                  onClick={() => isClickable && goToStep(step.id)}
                  className={[
                    'flex items-center gap-2 z-10 rounded-md transition-colors',
                    isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                  ].join(' ')}
                  aria-label={`Go to ${step.label}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <div
                    className={[
                      'w-5 h-5 rounded-full flex items-center justify-center border text-[10px]',
                      isCompleted
                        ? 'bg-primary border-primary text-white'
                        : isCurrent
                        ? 'bg-card border-primary text-primary'
                        : 'bg-muted border-border text-gray-400',
                    ].join(' ')}
                  >
                    {isCompleted ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <span className="font-semibold">
                        {index + 1}
                      </span>
                    )}
                  </div>
                  <span
                    className={[
                      'hidden md:inline text-[11px] font-medium truncate',
                      isCompleted
                        ? 'text-primary'
                        : isCurrent
                        ? 'text-foreground'
                        : 'text-gray-500',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                </button>
                {index < timelineSteps.length - 1 && (
                  <div className="flex-1 md:w-10 h-px bg-border" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col md:flex-row max-w-5xl lg:max-w-7xl mx-auto px-3 md:px-8 pb-8 md:pb-16 gap-4 md:gap-8">
        {/* Main Content - Form */}
        <div className="w-full pt-0 md:pt-8">
          <div className="bg-card rounded-xl p-3 md:p-8 max-w-none md:max-w-3xl border border-border h-auto md:max-h-[calc(100vh-220px)] flex flex-col mx-auto">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                {/* Step 1: Business Type (group) */}
                {currentStepData.id === 'businessType' && (
                  <div className="space-y-6">
                    <div className="mb-8">
                      <h2 className="text-xl md:text-2xl font-bold text-foreground mb-3">
                        {currentStepData.title}
                      </h2>
                      <p className="text-base text-gray-600 font-normal">
                        {currentStepData.subtitle}
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="businessGroup"
                      render={({ field }) => {
                        const entries = Object.entries(businessOptionsByGroup).filter(
                          ([_, opts]) => opts?.length > 0 && opts[0]?.id
                        );
                        const groupKeys = entries.map(([groupKey]) => groupKey);
                        const currentValue = field.value == null ? '' : String(field.value);
                        const handleSelectIndex = (index) => {
                          if (index >= 0 && index < groupKeys.length) {
                            field.onChange(groupKeys[index]);
                          }
                        };
                        return (
                          <FormItem className="space-y-3">
                            <FormControl>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4" role="radiogroup" aria-label="Business type">
                                {entries.map(([groupKey], index) => {
                                  const IconComponent = getBusinessGroupIcon(groupKey);
                                  const isSelected = currentValue === groupKey;
                                  return (
                                    <button
                                      key={groupKey}
                                      type="button"
                                      role="radio"
                                      aria-checked={isSelected}
                                      aria-label={getBusinessGroupLabel(groupKey)}
                                      tabIndex={isSelected ? 0 : -1}
                                      onClick={() => field.onChange(groupKey)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          field.onChange(groupKey);
                                        }
                                        if (e.key === 'ArrowDown') {
                                          e.preventDefault();
                                          handleSelectIndex(
                                            index + 1 < groupKeys.length ? index + 1 : 0
                                          );
                                        }
                                        if (e.key === 'ArrowUp') {
                                          e.preventDefault();
                                          handleSelectIndex(
                                            index - 1 >= 0 ? index - 1 : groupKeys.length - 1
                                          );
                                        }
                                      }}
                                      className={`flex flex-col items-center gap-2.5 md:gap-3 cursor-pointer rounded-xl border p-4 md:p-5 text-center transition-all hover:border-primary/50 hover:bg-muted/30 ${
                                        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                                      }`}
                                    >
                                      <div
                                        className={`flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-lg ${
                                          isSelected
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground'
                                        }`}
                                      >
                                        <IconComponent className="h-5 w-5 md:h-6 md:w-6" />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="font-semibold text-sm md:text-base leading-tight">
                                          {getBusinessGroupLabel(groupKey)}
                                        </span>
                                        <p className="text-xs text-muted-foreground leading-snug">
                                          {getBusinessGroupExamples(groupKey)}
                                        </p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                )}

                {/* Step 2: Business Info (includes sub-type) */}
                {currentStepData.id === 'businessInfo' && (
                  <div className="space-y-6">
                    <div className="mb-8 text-center md:text-left">
                      <h2 className="text-xl md:text-2xl font-bold text-foreground">
                        {currentStepData.title}
                      </h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="companyLogo"
                      render={({ field: { value, onChange, ...field } }) => (
                        <FormItem className="items-center md:items-start">
                          <FormLabel className="text-gray-700 text-center md:text-left">
                            Company Logo (Optional)
                          </FormLabel>
                          <FormControl>
                            <div className="flex items-center justify-center md:justify-start gap-4">
                              <div
                                className="relative cursor-pointer"
                                role="button"
                                tabIndex={0}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    fileInputRef.current?.click();
                                  }
                                }}
                              >
                                {value ? (
                                  <div className="w-20 h-20 rounded-full border border-border overflow-hidden bg-muted">
                                    <img 
                                      src={value instanceof File ? URL.createObjectURL(value) : value} 
                                      alt="Logo preview" 
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-20 h-20 rounded-full border border-border bg-muted flex items-center justify-center">
                                    <span className="text-gray-400 text-sm">Logo</span>
                                  </div>
                                )}
                                <input
                                  id="company-logo-upload"
                                  type="file"
                                  accept="image/*"
                                  ref={fileInputRef}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      onChange(file);
                                    }
                                  }}
                                  className="hidden"
                                />
                                <div className="pointer-events-none absolute bottom-3 right-4 rounded-md border border-border bg-white/90 px-1.5 py-1.5">
                                  <Camera className="w-3 h-3 text-primary" />
                                </div>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Company Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="h-12 text-base border-border rounded-lg bg-muted text-foreground placeholder:text-gray-400 focus:border-primary focus:border focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border"
                              placeholder="Enter your company name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="companyAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Address (optional)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="h-12 text-base border-border rounded-lg bg-muted text-foreground placeholder:text-gray-400 focus:border-primary focus:border focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border"
                              placeholder="Enter your business address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="businessSubTypes"
                      render={({ field }) => {
                        const groupKey = watchedBusinessGroup;
                        const options = groupKey ? (businessOptionsByGroup[groupKey] || []) : [];
                        const hasGroup = !!groupKey && options.length > 0;
                        const selected = Array.isArray(field.value) ? field.value : [];
                        const isOtherSelected = selected.includes('other');
                        const selectedLabels = options
                          .filter((opt) => selected.includes(opt.id))
                          .map((opt) => opt.label);

                        const toggleOption = (id) => {
                          if (id === 'other') {
                            if (isOtherSelected) {
                              setCustomBusinessType('');
                              field.onChange([]);
                            } else {
                              field.onChange(['other']);
                            }
                            return;
                          }
                          const next = selected.includes(id)
                            ? selected.filter((v) => v !== id)
                            : [...selected.filter((v) => v !== 'other'), id];
                          field.onChange(next);
                        };

                        let triggerText = 'Select what best matches your business';
                        if (!hasGroup) {
                          triggerText = 'Select business type first';
                        } else if (isOtherSelected) {
                          triggerText = customBusinessType.trim() || 'Other';
                        } else if (selectedLabels.length === 1) {
                          triggerText = selectedLabels[0];
                        } else if (selectedLabels.length > 1) {
                          triggerText = `${selectedLabels[0]} +${selectedLabels.length - 1} more`;
                        }
                        const hasSelection = isOtherSelected || selectedLabels.length > 0;

                        return (
                          <FormItem className="space-y-3">
                            <FormLabel className="text-gray-700">What do you mainly do?</FormLabel>
                            <FormDescription className="text-gray-600">
                              Select everything that matches your business.
                            </FormDescription>
                            <FormControl>
                              <button
                                type="button"
                                disabled={!hasGroup}
                                onClick={() => setSubTypeModalOpen(true)}
                                className="flex h-11 w-full items-center justify-between rounded-lg border border-border bg-muted px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 focus:border-primary focus:outline-none"
                              >
                                <span className={hasSelection ? 'text-foreground truncate' : 'text-gray-400 truncate'}>
                                  {triggerText}
                                </span>
                                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground ml-2" />
                              </button>
                            </FormControl>
                            <FormMessage />

                            <Dialog open={subTypeModalOpen} onOpenChange={setSubTypeModalOpen}>
                              <DialogContent className="[--modal-w:min(640px,92vw)] [--modal-min-h:420px] [--modal-max-h:85vh]">
                                <DialogHeader>
                                  <DialogTitle>What do you mainly do?</DialogTitle>
                                  <DialogDescription>
                                    {isOtherSelected
                                      ? 'Describe your business so we can set up the right workspace.'
                                      : 'Select everything that matches your business.'}
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogBody>
                                  {isOtherSelected ? (
                                    <div className="space-y-2">
                                      <Input
                                        value={customBusinessType}
                                        onChange={(e) => setCustomBusinessType(e.target.value)}
                                        className="h-11 border-border bg-muted text-foreground placeholder:text-gray-400 focus:border-primary focus:border focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border"
                                        placeholder="e.g. freight forwarding, consulting, event planning"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => toggleOption('other')}
                                        className="text-xs font-medium text-primary hover:underline"
                                      >
                                        Choose from the list instead
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                                      {options.map((opt) => {
                                        const checked = selected.includes(opt.id);
                                        return (
                                          <label
                                            key={opt.id}
                                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                              checked ? 'bg-primary/5' : 'hover:bg-muted/40'
                                            }`}
                                          >
                                            <Checkbox
                                              checked={checked}
                                              onCheckedChange={() => toggleOption(opt.id)}
                                              className="mt-0.5"
                                            />
                                            <span className="flex-1 min-w-0">
                                              <span className="block text-sm font-semibold text-foreground">
                                                {opt.label}
                                              </span>
                                              {opt.description && (
                                                <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
                                                  {opt.description}
                                                </span>
                                              )}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </DialogBody>
                                <DialogFooter>
                                  <Button
                                    type="button"
                                    onClick={() => setSubTypeModalOpen(false)}
                                    disabled={!hasSelection}
                                  >
                                    Done
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                )}

                {/* Step 3: Contact Info */}
                {currentStepData.id === 'contactInfo' && (
                  <div className="space-y-6">
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold text-foreground">
                        {currentStepData.title}
                      </h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="companyEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Business Email (Optional)</FormLabel>
                          <FormDescription className="text-gray-600">
                            If you leave this blank, we will use your account email on invoices.
                          </FormDescription>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              className="h-12 text-base border-border rounded-lg bg-muted text-foreground placeholder:text-gray-400 focus:border-primary focus:border focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border"
                              placeholder="business@company.com"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="companyPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Business Phone</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <FormField
                                control={form.control}
                                name="phoneCountryCode"
                                render={({ field: codeField }) => (
                                  <FormItem className="w-28">
                                    <Select
                                      onValueChange={codeField.onChange}
                                      value={codeField.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="h-12 text-base border-[1px] border-border rounded-lg bg-muted text-foreground focus:border-[1px] focus:border-primary focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[1px] focus-visible:border-primary">
                                          <div className="flex items-center gap-2 flex-1">
                                            {codeField.value && (() => {
                                              const selected = countryCodes.find(c => c.code === codeField.value);
                                              if (selected) {
                                                return (
                                                  <>
                                                    <ReactCountryFlag 
                                                      countryCode={selected.country} 
                                                      svg 
                                                      style={{ width: '20px', height: '15px' }}
                                                    />
                                                    <span>{selected.code}</span>
                                                  </>
                                                );
                                              }
                                            })()}
                                            {!codeField.value && <SelectValue placeholder="Code" />}
                                          </div>
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="bg-card border-border p-0">
                                        <div className="p-2 border-b border-border sticky top-0 bg-card z-10">
                                          <div className="relative">
                                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <Input
                                              placeholder="Search country..."
                                              value={countryCodeSearch}
                                              onChange={(e) => setCountryCodeSearch(e.target.value)}
                                              className="pl-8 h-9 text-sm border-border rounded-md bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                              onClick={(e) => e.stopPropagation()}
                                              onKeyDown={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                          {filteredCountryCodes.length > 0 ? (
                                            filteredCountryCodes.map((country) => (
                                              <SelectItem 
                                                key={country.code} 
                                                value={country.code}
                                                className="!text-foreground focus:!bg-muted focus:!text-foreground hover:!bg-muted hover:!text-foreground data-[highlighted]:!bg-muted data-[highlighted]:!text-foreground cursor-pointer"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <ReactCountryFlag 
                                                    countryCode={country.country} 
                                                    svg 
                                                    style={{ width: '20px', height: '15px' }}
                                                  />
                                                  <span>{country.code} {country.name}</span>
                                                </div>
                                              </SelectItem>
                                            ))
                                          ) : (
                                            <div className="px-2 py-3 text-sm text-gray-500 text-center">No countries found</div>
                                          )}
                                        </div>
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                              <Input
                                {...field}
                                onChange={(e) => field.onChange(stripLeadingTrunkZero(e.target.value))}
                                type="tel"
                                className="h-12 text-base border-border rounded-lg bg-muted text-foreground placeholder:text-gray-400 focus:border-primary focus:border focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border flex-1"
                                placeholder="123 456 7890"
                                />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="companyWebsite"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Website (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="url"
                              className="h-12 text-base border-border rounded-lg bg-muted text-foreground placeholder:text-gray-400 focus:border-primary focus:border focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary focus-visible:border"
                              placeholder="https://www.company.com"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {requiresTermsAcceptance && (
                      <p className="text-sm leading-5 text-gray-700">
                        By continuing, you agree to our{' '}
                        <Link
                          to={TERMS_PATH}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Terms and Conditions
                        </Link>{' '}
                        and{' '}
                        <a
                          href={PRIVACY_POLICY_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Privacy Policy
                        </a>
                        .
                      </p>
                    )}
                  </div>
                )}

                </form>
              </Form>
            </div>
            
            {/* Navigation Buttons - Outside Form */}
            <div className="flex justify-between pt-6 mt-auto gap-3">
              {currentStep === 0 && !requiresTermsAcceptance ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={loading}
                  className="text-gray-600 hover:text-foreground"
                >
                  Skip for now
                </Button>
              ) : (
                <div className="hidden md:block text-sm text-muted-foreground">
                  {requiresTermsAcceptance ? 'Complete setup to continue' : null}
                </div>
              )}
              <div
                className={`flex gap-3 ${
                  currentStep > 0 ? 'w-full' : ''
                } md:w-auto`}
              >
                {currentStep > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={loading}
                    className={`border-primary text-primary bg-transparent hover:bg-transparent hover:text-primary hover:border-primary transition-colors ${
                      currentStep > 0 ? 'flex-1 md:flex-none' : ''
                    }`}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceed() || checkingPhone || creatingBusiness}
                  loading={loading && !checkingPhone}
                  className={`bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-base px-6 py-2 ${
                    currentStep > 0 ? 'flex-1 md:flex-none' : ''
                  }`}
                >
                  {currentStep === steps.length - 1 ? (
                    checkingPhone ? (
                      <span className="inline-flex items-center">
                        Checking phone
                        <span className="dot-anim">
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      </span>
                    ) : loading ? (
                      'Finishing setup...'
                    ) : (
                      'Finish setup'
                    )
                  ) : (
                    <>
                      {loading ? 'Please wait...' : 'Next'}
                      {!loading && <ArrowRight className="h-4 w-4" />}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default Onboarding;
