import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import whatsappService from '../services/whatsappService';
import { useAuth } from '../context/AuthContext';
import { showError, showLoading, showSuccess } from '../utils/toast';
import { whatsappSchema } from '../utils/settingsUtils';

/**
 * WhatsApp settings state and mutations (extracted from Settings.jsx).
 * @returns {Object}
 */
export const useSettingsWhatsApp = () => {
  const queryClient = useQueryClient();
  const { isManager } = useAuth();
  const canManageOrganization = Boolean(isManager);
  const savingToastDismissRef = useRef(null);
  const [whatsappTemplateLearnMoreOpen, setWhatsappTemplateLearnMoreOpen] = useState(false);
  const [whatsappEditing, setWhatsappEditing] = useState(false);

  const whatsappForm = useForm({
    resolver: zodResolver(whatsappSchema),
    defaultValues: {
      enabled: false,
      phoneNumberId: '',
      accessToken: '',
      businessAccountId: '',
      webhookVerifyToken: '',
      templateNamespace: '',
    },
  });

  const { data: whatsappData, isLoading: loadingWhatsApp } = useQuery({
    queryKey: ['settings', 'whatsapp'],
    queryFn: whatsappService.getSettings,
    enabled: canManageOrganization,
  });

  useEffect(() => {
    if (whatsappData?.data && canManageOrganization) {
      whatsappForm.reset({
        enabled: whatsappData.data.enabled || false,
        phoneNumberId: whatsappData.data.phoneNumberId || '',
        accessToken: whatsappData.data.accessToken === '***' ? '' : (whatsappData.data.accessToken || ''),
        businessAccountId: whatsappData.data.businessAccountId || '',
        webhookVerifyToken: whatsappData.data.webhookVerifyToken || '',
        templateNamespace: whatsappData.data.templateNamespace || '',
      });
    }
  }, [whatsappData, whatsappForm, canManageOrganization]);

  const dismissSavingToast = useCallback(() => {
    if (savingToastDismissRef.current) {
      savingToastDismissRef.current();
      savingToastDismissRef.current = null;
    }
  }, []);

  const updateWhatsAppMutation = useMutation({
    mutationFn: whatsappService.updateSettings,
    onSuccess: () => {
      dismissSavingToast();
      showSuccess('WhatsApp settings saved successfully');
      setWhatsappEditing(false);
      queryClient.invalidateQueries({ queryKey: ['settings', 'whatsapp'] });
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error, error?.response?.data?.message || 'Failed to update WhatsApp settings');
    },
  });

  const testWhatsAppMutation = useMutation({
    mutationFn: ({ accessToken, phoneNumberId }) => whatsappService.testConnection(accessToken, phoneNumberId),
    onSuccess: () => showSuccess('WhatsApp connection test successful!'),
    onError: (error) => {
      showError(error, error?.response?.data?.error || error?.response?.data?.message || 'Connection test failed');
    },
  });

  const getWhatsAppTestConfig = useCallback((values) => {
    const hasStoredToken = whatsappData?.data?.accessTokenConfigured === true;
    if (!values?.phoneNumberId?.trim()) {
      showError(null, 'Please provide Phone Number ID to test connection');
      return null;
    }
    if (!values?.accessToken?.trim() && !hasStoredToken) {
      showError(null, 'Please provide Access Token or save WhatsApp settings with a token first');
      return null;
    }
    return {
      accessToken: values.accessToken?.trim() || '',
      phoneNumberId: values.phoneNumberId.trim(),
    };
  }, [whatsappData?.data?.accessTokenConfigured]);

  const handleTestWhatsApp = useCallback(() => {
    const config = getWhatsAppTestConfig(whatsappForm.getValues());
    if (config) testWhatsAppMutation.mutate(config);
  }, [getWhatsAppTestConfig, whatsappForm, testWhatsAppMutation]);

  const handleWhatsAppEnabledChange = useCallback((checked, fieldOnChange) => {
    if (!checked) {
      fieldOnChange(false);
      return;
    }
    const config = getWhatsAppTestConfig(whatsappForm.getValues());
    if (!config) return;
    testWhatsAppMutation
      .mutateAsync(config)
      .then(() => {
        fieldOnChange(true);
        showSuccess('Connection verified. WhatsApp is enabled.');
      })
      .catch(() => {});
  }, [getWhatsAppTestConfig, testWhatsAppMutation]);

  const onWhatsAppSubmit = useCallback(async (values) => {
    savingToastDismissRef.current = showLoading('Saving...');
    updateWhatsAppMutation.mutate({
      enabled: values.enabled || false,
      phoneNumberId: values.phoneNumberId || '',
      accessToken: values.accessToken || '',
      businessAccountId: values.businessAccountId || '',
      webhookVerifyToken: values.webhookVerifyToken || '',
      templateNamespace: values.templateNamespace || '',
    });
  }, [updateWhatsAppMutation]);

  const resetWhatsAppForm = useCallback(() => {
    if (whatsappData?.data) {
      whatsappForm.reset({
        enabled: whatsappData.data.enabled || false,
        phoneNumberId: whatsappData.data.phoneNumberId || '',
        accessToken: '',
        businessAccountId: whatsappData.data.businessAccountId || '',
        webhookVerifyToken: whatsappData.data.webhookVerifyToken || '',
        templateNamespace: whatsappData.data.templateNamespace || '',
      });
    } else {
      whatsappForm.reset();
    }
  }, [whatsappData, whatsappForm]);

  const cancelWhatsAppEdit = useCallback(() => {
    resetWhatsAppForm();
    setWhatsappEditing(false);
  }, [resetWhatsAppForm]);

  const whatsappSaved = Boolean(
    whatsappData?.data?.phoneNumberId || whatsappData?.data?.accessTokenConfigured
  );
  const showWhatsAppSummary = whatsappSaved && !whatsappEditing;

  return {
    canManageOrganization,
    whatsappForm,
    whatsappData,
    loadingWhatsApp,
    onWhatsAppSubmit,
    handleTestWhatsApp,
    handleWhatsAppEnabledChange,
    updateWhatsAppMutation,
    testWhatsAppMutation,
    whatsappTemplateLearnMoreOpen,
    setWhatsappTemplateLearnMoreOpen,
    resetWhatsAppForm,
    whatsappEditing,
    setWhatsappEditing,
    cancelWhatsAppEdit,
    whatsappSaved,
    showWhatsAppSummary,
  };
};
