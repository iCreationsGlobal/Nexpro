import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import emailService from '../services/emailService';
import settingsService from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { showError, showLoading, showSuccess } from '../utils/toast';
import { emailSchema, getEmailFormValues } from '../utils/settingsUtils';

/**
 * Email provider settings state and mutations (extracted from Settings.jsx).
 * @returns {Object}
 */
export const useSettingsEmail = () => {
  const queryClient = useQueryClient();
  const { isManager, activeTenant } = useAuth();
  const canManageOrganization = Boolean(isManager);
  const savingToastDismissRef = useRef(null);
  const [emailEditing, setEmailEditing] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  const emailForm = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: getEmailFormValues(null, {}),
  });

  const { data: emailData, isLoading: loadingEmail } = useQuery({
    queryKey: ['settings', 'email'],
    queryFn: emailService.getSettings,
    enabled: canManageOrganization,
  });

  const { data: organizationData } = useQuery({
    queryKey: ['settings', 'organization', activeTenant?.id],
    queryFn: settingsService.getOrganization,
    enabled: canManageOrganization && !!activeTenant?.id,
  });

  useEffect(() => {
    if (emailData?.data && canManageOrganization) {
      const org = organizationData?.data ?? organizationData ?? {};
      emailForm.reset(getEmailFormValues(emailData.data, org));
    }
  }, [emailData, organizationData, emailForm, canManageOrganization]);

  const dismissSavingToast = useCallback(() => {
    if (savingToastDismissRef.current) {
      savingToastDismissRef.current();
      savingToastDismissRef.current = null;
    }
  }, []);

  const updateEmailMutation = useMutation({
    mutationFn: emailService.updateSettings,
    onSuccess: () => {
      dismissSavingToast();
      showSuccess('Email settings saved successfully');
      setEmailEditing(false);
      queryClient.invalidateQueries({ queryKey: ['settings', 'email'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'notification-channels'] });
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error, error?.response?.data?.message || 'Failed to update Email settings');
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: (config) => emailService.testConnection(config),
    onSuccess: () => showSuccess('Email connection test successful!'),
    onError: (error) => {
      showError(error, error?.response?.data?.error || error?.response?.data?.message || 'Connection test failed');
    },
  });

  const getEmailTestConfig = useCallback((values) => {
    const provider = values?.provider || 'smtp';
    let config = { provider };
    if (provider === 'smtp') {
      if (!values?.smtpHost?.trim() || !values?.smtpUser?.trim() || !values?.smtpPassword) {
        showError(null, 'Please provide SMTP Host, User, and Password to test connection');
        return null;
      }
      config = {
        ...config,
        smtpHost: values.smtpHost.trim(),
        smtpPort: values.smtpPort || 587,
        smtpUser: values.smtpUser.trim(),
        smtpPassword: values.smtpPassword,
        smtpRejectUnauthorized: values.smtpRejectUnauthorized !== false,
      };
    } else if (provider === 'sendgrid') {
      if (!values?.sendgridApiKey?.trim()) {
        showError(null, 'Please provide SendGrid API Key to test connection');
        return null;
      }
      config = { ...config, sendgridApiKey: values.sendgridApiKey.trim() };
    } else if (provider === 'ses') {
      if (!values?.sesAccessKeyId?.trim() || !values?.sesSecretAccessKey) {
        showError(null, 'Please provide AWS SES Access Key ID and Secret Access Key to test connection');
        return null;
      }
      config = {
        ...config,
        sesAccessKeyId: values.sesAccessKeyId.trim(),
        sesSecretAccessKey: values.sesSecretAccessKey,
        sesRegion: values.sesRegion || 'us-east-1',
        sesHost: values.sesHost?.trim(),
      };
    } else if (provider === 'resend') {
      if (!values?.resendApiKey?.trim()) {
        showError(null, 'Please provide a Resend API Key to test connection');
        return null;
      }
      config = { ...config, resendApiKey: values.resendApiKey.trim(), fromEmail: values.fromEmail?.trim() };
    }
    return config;
  }, []);

  const handleTestEmail = useCallback(() => {
    const config = getEmailTestConfig(emailForm.getValues());
    if (config) testEmailMutation.mutate(config);
  }, [getEmailTestConfig, emailForm, testEmailMutation]);

  const handleEmailEnabledChange = useCallback((checked, fieldOnChange) => {
    if (!checked) {
      fieldOnChange(false);
      return;
    }
    const config = getEmailTestConfig(emailForm.getValues());
    if (!config) return;
    testEmailMutation
      .mutateAsync(config)
      .then(() => {
        fieldOnChange(true);
        showSuccess('Connection verified. Your email provider is enabled.');
      })
      .catch(() => {});
  }, [getEmailTestConfig, testEmailMutation]);

  const onEmailSubmit = useCallback(async (values) => {
    savingToastDismissRef.current = showLoading('Saving...');
    updateEmailMutation.mutate({ ...values });
  }, [updateEmailMutation]);

  const emailDataLoaded = emailData?.data;
  const emailPlatformInfo = emailData?.data?.platformEmail;
  const emailMode = emailData?.data?.emailMode;
  const hasOwnEmailConfigured = !!(emailDataLoaded?.enabled && (emailDataLoaded?.fromEmail || emailDataLoaded?.smtpHost || emailDataLoaded?.sendgridApiKey || emailDataLoaded?.sesAccessKeyId || emailDataLoaded?.resendApiKey));
  const ownEmailToggleOn = emailForm.watch('enabled');
  const ownEmailActive = emailMode === 'own' || (emailMode == null && hasOwnEmailConfigured);
  const switchingToOwnEmail = ownEmailToggleOn && !ownEmailActive;
  const platformEmailActive = Boolean(emailPlatformInfo) && (emailMode === 'platform' || (emailMode == null && !hasOwnEmailConfigured)) && !switchingToOwnEmail;
  const noEmailAvailable = emailMode === 'none' && !emailPlatformInfo;
  const showEmailSummary = ownEmailActive && !emailEditing;

  const resetEmailForm = useCallback(() => {
    const org = organizationData?.data ?? organizationData ?? {};
    emailForm.reset(getEmailFormValues(emailData?.data, org, { clearSecrets: true }));
  }, [emailData, organizationData, emailForm]);

  return {
    canManageOrganization,
    emailForm,
    emailData,
    loadingEmail,
    emailEditing,
    setEmailEditing,
    showSmtpPassword,
    setShowSmtpPassword,
    onEmailSubmit,
    handleTestEmail,
    handleEmailEnabledChange,
    updateEmailMutation,
    testEmailMutation,
    emailDataLoaded,
    emailPlatformInfo,
    ownEmailActive,
    switchingToOwnEmail,
    platformEmailActive,
    noEmailAvailable,
    showEmailSummary,
    resetEmailForm,
    organizationData,
  };
};
