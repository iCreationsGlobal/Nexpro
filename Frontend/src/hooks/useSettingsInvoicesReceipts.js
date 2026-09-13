import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import settingsService from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { showError, showLoading, showSuccess } from '../utils/toast';
import { STUDIO_LIKE_TYPES, QUERY_CACHE } from '../constants';

const posConfigSchema = z.object({
  receipt: z.object({
    mode: z.enum(['ask', 'auto_send', 'auto_print', 'auto_both']),
    channels: z.array(z.enum(['sms', 'whatsapp', 'email', 'print'])),
  }),
  print: z.object({
    format: z.enum(['a4', 'thermal_58', 'thermal_80']),
    showLogo: z.boolean().optional(),
    color: z.boolean().optional(),
    fontSize: z.enum(['normal', 'small']).optional(),
  }),
  customer: z.object({
    phoneRequired: z.boolean(),
    nameRequired: z.boolean(),
  }),
});

export const POS_MODE_LABELS = {
  ask: 'Ask staff',
  auto_send: 'Auto send',
  auto_print: 'Auto print',
  auto_both: 'Auto send + print',
};

export const POS_FORMAT_LABELS = {
  a4: 'A4 (full page)',
  thermal_58: '58mm Thermal',
  thermal_80: '80mm Thermal',
};

export const POS_CHANNEL_LABELS = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  print: 'Print',
};

/**
 * Invoices & receipts settings state (extracted from Settings.jsx Configurations).
 * @returns {Object}
 */
export const useSettingsInvoicesReceipts = () => {
  const queryClient = useQueryClient();
  const { activeTenant, isManager } = useAuth();
  const canManageOrganization = Boolean(isManager);
  const savingToastDismissRef = useRef(null);
  const [posConfigEditing, setPosConfigEditing] = useState(false);

  const isStudioLike = useMemo(
    () => STUDIO_LIKE_TYPES.includes(activeTenant?.businessType || 'printing_press'),
    [activeTenant?.businessType]
  );

  const posConfigForm = useForm({
    resolver: zodResolver(posConfigSchema),
    defaultValues: {
      receipt: { mode: 'ask', channels: ['sms', 'print'] },
      print: { format: 'a4', showLogo: true, color: true, fontSize: 'normal' },
      customer: { phoneRequired: false, nameRequired: false },
    },
  });

  const dismissSavingToast = useCallback(() => {
    if (savingToastDismissRef.current) {
      savingToastDismissRef.current();
      savingToastDismissRef.current = null;
    }
  }, []);

  const { data: notificationChannelsData, isLoading: loadingNotificationChannels } = useQuery({
    queryKey: ['settings', 'notification-channels'],
    queryFn: settingsService.getNotificationChannels,
    enabled: canManageOrganization,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
    refetchOnWindowFocus: false,
  });

  const { data: posConfigData, isLoading: loadingPOSConfig } = useQuery({
    queryKey: ['settings', 'pos-config'],
    queryFn: settingsService.getPOSConfig,
    enabled: canManageOrganization,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
    refetchOnWindowFocus: false,
  });

  const { data: organizationData } = useQuery({
    queryKey: ['settings', 'organization', activeTenant?.id],
    queryFn: settingsService.getOrganization,
    enabled: canManageOrganization && !!activeTenant?.id,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
    refetchOnWindowFocus: false,
  });

  const { data: quoteWorkflowData } = useQuery({
    queryKey: ['settings', 'quote-workflow'],
    queryFn: settingsService.getQuoteWorkflow,
    enabled: canManageOrganization,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
  });

  const { data: jobInvoiceData } = useQuery({
    queryKey: ['settings', 'job-invoice'],
    queryFn: settingsService.getJobInvoice,
    enabled: canManageOrganization,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
  });

  const updateCustomerNotificationPrefsMutation = useMutation({
    mutationFn: settingsService.updateCustomerNotificationPreferences,
    onSuccess: () => {
      dismissSavingToast();
      showSuccess('Auto-send preferences saved');
      queryClient.invalidateQueries({ queryKey: ['settings', 'notification-channels'] });
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error?.response?.data?.message || error?.message || 'Failed to save preferences');
    },
  });

  const updateQuoteWorkflowMutation = useMutation({
    mutationFn: settingsService.updateQuoteWorkflow,
    onSuccess: () => {
      dismissSavingToast();
      showSuccess('Quote workflow saved');
      queryClient.invalidateQueries({ queryKey: ['settings', 'quote-workflow'] });
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error?.response?.data?.message || error?.message || 'Failed to save quote workflow');
    },
  });

  const updateJobInvoiceMutation = useMutation({
    mutationFn: settingsService.updateJobInvoice,
    onSuccess: () => {
      dismissSavingToast();
      showSuccess('Job invoice settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings', 'job-invoice'] });
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error?.response?.data?.message || error?.message || 'Failed to save job invoice settings');
    },
  });

  const updatePOSConfigMutation = useMutation({
    mutationFn: settingsService.updatePOSConfig,
    onSuccess: async (response) => {
      dismissSavingToast();
      showSuccess('Configuration saved successfully');
      await queryClient.invalidateQueries({ queryKey: ['settings', 'pos-config'] });
      const data = response?.data ?? response;
      if (data) {
        posConfigForm.reset({
          receipt: { ...posConfigForm.getValues('receipt'), ...(data.receipt || {}) },
          print: { ...posConfigForm.getValues('print'), ...(data.print || {}) },
          customer: { ...posConfigForm.getValues('customer'), ...(data.customer || {}) },
        });
      }
      setPosConfigEditing(false);
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error, error?.response?.data?.message || 'Failed to update configuration');
    },
  });

  useEffect(() => {
    const config = posConfigData?.data?.data ?? posConfigData?.data;
    if (config && canManageOrganization) {
      const mode = config.receipt?.mode || 'ask';
      let channels = config.receipt?.channels || ['sms', 'print'];
      if (mode === 'auto_print') {
        channels = ['print'];
      } else if (mode === 'auto_send') {
        channels = channels.filter((c) => ['sms', 'whatsapp', 'email'].includes(c));
        if (channels.length === 0) channels = ['sms'];
      }
      posConfigForm.reset({
        receipt: { mode, channels },
        print: {
          format: config.print?.format || 'a4',
          showLogo: config.print?.showLogo !== false,
          color: config.print?.color !== false,
          fontSize: config.print?.fontSize || 'normal',
        },
        customer: {
          phoneRequired: config.customer?.phoneRequired || false,
          nameRequired: config.customer?.nameRequired || false,
        },
      });
    }
  }, [posConfigData, posConfigForm, canManageOrganization]);

  const notificationChannels = notificationChannelsData ?? {};
  const autoSendInvoice = notificationChannels.autoSendInvoiceToCustomer !== false;
  const autoSendReceipt = notificationChannels.autoSendReceiptToCustomer === true;
  const sendPaymentReminderEmail = notificationChannels.sendPaymentReminderEmail === true;
  const sendInvoicePaidConfirmationToCustomer =
    notificationChannels.sendInvoicePaidConfirmationToCustomer !== false;
  const acceptOnlinePayments = notificationChannels.acceptOnlinePayments === true;

  const quoteWorkflowOnAccept = quoteWorkflowData?.onAccept || 'record_only';
  const quoteWorkflowEnabled = isStudioLike
    ? quoteWorkflowOnAccept === 'create_job_invoice_and_send'
    : ['create_sale_invoice_and_send', 'create_job_invoice_and_send'].includes(quoteWorkflowOnAccept);

  const configData = posConfigData?.data?.data ?? posConfigData?.data;
  const organization = organizationData?.data || {};
  const organizationLogo = organization.logoUrl || '';

  const mockInvoice = useMemo(() => ({
    invoiceNumber: 'INV-2024-001',
    invoiceDate: new Date(),
    dueDate: dayjs().add(30, 'days').toDate(),
    customer: {
      name: 'Customer name',
      company: 'Company name',
      email: 'customer@example.com',
      phone: '+233 XX XXX XXXX',
      address: '123 Sample Street',
      city: 'Sample City',
      state: 'Sample State',
      zipCode: 'SAMPLE-123',
    },
    items: [
      { description: 'Sample Product/Service 1', quantity: 2, unitPrice: 100.00, total: 200.00 },
      { description: 'Sample Product/Service 2', quantity: 1, unitPrice: 150.00, total: 150.00 },
    ],
    subtotal: 350.00,
    taxRate: 12.5,
    taxAmount: 43.75,
    discountAmount: 0,
    totalAmount: 393.75,
    balance: 393.75,
    paymentTerms: organization.defaultPaymentTerms || 'Net 30',
    termsAndConditions: organization.defaultTermsAndConditions || 'Payment is due within 30 days of invoice date.',
  }), [organization.defaultPaymentTerms, organization.defaultTermsAndConditions]);

  const resetPosConfigFormFromData = useCallback(() => {
    const cfg = configData;
    if (!cfg) return;
    const mode = cfg.receipt?.mode || 'ask';
    let channels = cfg.receipt?.channels || ['sms', 'print'];
    if (mode === 'auto_print') channels = ['print'];
    else if (mode === 'auto_send') {
      channels = channels.filter((c) => ['sms', 'whatsapp', 'email'].includes(c));
      if (channels.length === 0) channels = ['sms'];
    }
    posConfigForm.reset({
      receipt: { mode, channels },
      print: {
        format: cfg.print?.format || 'a4',
        showLogo: cfg.print?.showLogo !== false,
        color: cfg.print?.color !== false,
        fontSize: cfg.print?.fontSize || 'normal',
      },
      customer: {
        phoneRequired: cfg.customer?.phoneRequired || false,
        nameRequired: cfg.customer?.nameRequired || false,
      },
    });
  }, [configData, posConfigForm]);

  const handleNotificationPrefChange = useCallback((payload) => {
    savingToastDismissRef.current = showLoading('Saving...');
    updateCustomerNotificationPrefsMutation.mutate(payload);
  }, [updateCustomerNotificationPrefsMutation]);

  const handleQuoteWorkflowChange = useCallback((checked) => {
    savingToastDismissRef.current = showLoading('Saving...');
    updateQuoteWorkflowMutation.mutate({
      onAccept: checked
        ? (isStudioLike ? 'create_job_invoice_and_send' : 'create_sale_invoice_and_send')
        : 'record_only',
    });
  }, [isStudioLike, updateQuoteWorkflowMutation]);

  const handleAutoSendInvoiceOnJobCreation = useCallback((checked) => {
    savingToastDismissRef.current = showLoading('Saving...');
    updateJobInvoiceMutation.mutate({ autoSendInvoiceOnJobCreation: checked });
  }, [updateJobInvoiceMutation]);

  const onPOSConfigSubmit = useCallback(async (values) => {
    const mode = values.receipt?.mode || 'ask';
    let channels = values.receipt?.channels || [];
    if (mode === 'auto_print') {
      channels = ['print'];
    } else if (mode === 'auto_send') {
      channels = channels.filter((c) => ['sms', 'whatsapp', 'email'].includes(c));
      if (channels.length === 0) channels = ['sms'];
    }
    const payload = {
      receipt: { ...values.receipt, mode, channels },
      print: values.print || {},
      customer: values.customer || {},
    };
    savingToastDismissRef.current = showLoading('Saving...');
    updatePOSConfigMutation.mutate(payload);
  }, [updatePOSConfigMutation]);

  return {
    canManageOrganization,
    isStudioLike,
    loadingNotificationChannels,
    loadingPOSConfig,
    autoSendInvoice,
    autoSendReceipt,
    sendPaymentReminderEmail,
    sendInvoicePaidConfirmationToCustomer,
    acceptOnlinePayments,
    quoteWorkflowEnabled,
    jobInvoiceData,
    updateQuoteWorkflowMutation,
    updateJobInvoiceMutation,
    handleQuoteWorkflowChange,
    handleAutoSendInvoiceOnJobCreation,
    updateCustomerNotificationPrefsMutation,
    handleNotificationPrefChange,
    configData,
    posConfigForm,
    posConfigEditing,
    setPosConfigEditing,
    resetPosConfigFormFromData,
    onPOSConfigSubmit,
    updatePOSConfigMutation,
    organization,
    organizationLogo,
    mockInvoice,
  };
};
