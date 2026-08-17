import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import settingsService from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { showError, showLoading, showSuccess } from '../utils/toast';
import { STUDIO_LIKE_TYPES, QUERY_CACHE } from '../constants';
import { organizationSchema, resolveSettingsFileUrl } from '../utils/settingsUtils';

const getWorkspaceTypeDisplay = (businessType) => {
  const mapping = { shop: 'Shop', printing_press: 'Studio', pharmacy: 'Pharmacy' };
  return mapping[businessType] || 'Studio';
};

const getWorkspaceDescription = (businessType) => {
  const descriptions = {
    shop: 'Optimized for retail sales, inventory, and customer management',
    pharmacy: 'Optimized for pharmaceutical operations and inventory',
    printing_press: 'Optimized for jobs, services, quotes, and production workflows',
  };
  return descriptions[businessType] || descriptions.printing_press;
};

const getAddAnotherWorkspaceLabel = (businessType) => {
  const typeName = getWorkspaceTypeDisplay(businessType).toLowerCase();
  return `Add another ${typeName}`;
};

/**
 * Organization / business profile settings.
 * @returns {Object}
 */
export const useSettingsOrganization = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeTenant, isManager, hasFeature } = useAuth();
  const canManageOrganization = Boolean(isManager);
  const savingToastDismissRef = useRef(null);

  const [organizationLogoPreview, setOrganizationLogoPreview] = useState('');
  const [organizationEditing, setOrganizationEditing] = useState(false);
  const [organizationLogoPreviewVisible, setOrganizationLogoPreviewVisible] = useState(false);
  const [organizationLogoUploading, setOrganizationLogoUploading] = useState(false);

  const isStudioLike = useMemo(
    () => STUDIO_LIKE_TYPES.includes(activeTenant?.businessType || 'printing_press'),
    [activeTenant?.businessType]
  );

  const workspaceType = activeTenant?.businessType || 'printing_press';
  const workspaceTypeDisplay = getWorkspaceTypeDisplay(workspaceType);
  const workspaceDescription = getWorkspaceDescription(workspaceType);
  const addAnotherWorkspaceLabel = getAddAnotherWorkspaceLabel(workspaceType);

  const organizationForm = useForm({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      legalName: '',
      email: '',
      phone: '',
      website: '',
      logoUrl: '',
      invoiceFooter: '',
      paymentDetails: '',
      paymentDetailsEnabled: false,
      defaultPaymentTerms: '',
      defaultTermsAndConditions: '',
      supportEmail: '',
      currency: 'GHS',
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
      tax: {
        vatNumber: '',
        tin: '',
        ghanaCardPin: '',
        scheme: 'standard',
        enabled: false,
        defaultRatePercent: 0,
        pricesAreTaxInclusive: false,
        displayLabel: 'Tax',
        levies: [
          { code: 'vat', label: 'VAT', ratePercent: 0, enabled: true },
          { code: 'nhil', label: 'NHIL', ratePercent: 0, enabled: true },
          { code: 'getfund', label: 'GETFund', ratePercent: 0, enabled: true },
          { code: 'covid', label: 'COVID-19 HRL', ratePercent: 0, enabled: true },
        ],
        otherCharges: {
          enabled: false,
          label: 'Transaction charge',
          ratePercent: 0,
          customerBears: false,
          appliesTo: 'online_payments',
        },
      },
      shopType: '',
    },
  });

  const {
    data: organizationData,
    isLoading: loadingOrganization,
  } = useQuery({
    queryKey: ['settings', 'organization', activeTenant?.id],
    queryFn: settingsService.getOrganization,
    enabled: canManageOrganization && !!activeTenant?.id,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
    refetchOnWindowFocus: false,
  });

  const organization = organizationData?.data || {};
  const organizationRecord = organization;

  useEffect(() => {
    if (organizationData?.data) {
      const org = organizationData.data;
      organizationForm.reset({
        name: org.name || '',
        legalName: org.legalName || '',
        email: org.email || '',
        phone: org.phone || '',
        website: org.website || '',
        logoUrl: org.logoUrl || '',
        appName: org.appName || '',
        primaryColor: org.primaryColor || '',
        invoiceFooter: org.invoiceFooter || '',
        paymentDetails: org.paymentDetails || '',
        paymentDetailsEnabled: org.paymentDetailsEnabled === true,
        defaultPaymentTerms: org.defaultPaymentTerms || '',
        defaultTermsAndConditions: org.defaultTermsAndConditions || '',
        supportEmail: org.supportEmail || '',
        currency: org.currency || 'GHS',
        address: {
          line1: org.address?.line1 || '',
          line2: org.address?.line2 || '',
          city: org.address?.city || '',
          state: org.address?.state || '',
          postalCode: org.address?.postalCode || '',
          country: org.address?.country || '',
        },
        tax: {
          vatNumber: org.tax?.vatNumber || '',
          tin: org.tax?.tin || '',
          ghanaCardPin: org.tax?.ghanaCardPin || '',
          scheme: org.tax?.scheme || 'standard',
          enabled: org.tax?.enabled === true,
          defaultRatePercent: parseFloat(org.tax?.defaultRatePercent) || 0,
          pricesAreTaxInclusive: org.tax?.pricesAreTaxInclusive === true,
          displayLabel: org.tax?.displayLabel || 'Tax',
          levies: Array.isArray(org.tax?.levies) && org.tax.levies.length
            ? org.tax.levies.map((l) => ({
              code: l.code || 'levy',
              label: l.label || 'Levy',
              ratePercent: parseFloat(l.ratePercent) || 0,
              enabled: l.enabled !== false,
            }))
            : [
              { code: 'vat', label: 'VAT', ratePercent: parseFloat(org.tax?.defaultRatePercent) || 0, enabled: true },
              { code: 'nhil', label: 'NHIL', ratePercent: 0, enabled: true },
              { code: 'getfund', label: 'GETFund', ratePercent: 0, enabled: true },
              { code: 'covid', label: 'COVID-19 HRL', ratePercent: 0, enabled: true },
            ],
          otherCharges: {
            enabled: org.tax?.otherCharges?.enabled === true,
            label: org.tax?.otherCharges?.label || 'Transaction charge',
            ratePercent: parseFloat(org.tax?.otherCharges?.ratePercent) || 0,
            customerBears: org.tax?.otherCharges?.customerBears === true,
            appliesTo: org.tax?.otherCharges?.appliesTo || 'online_payments',
          },
        },
        shopType: org.shopType || '',
      });
      setOrganizationLogoPreview(org.logoUrl || '');
      setOrganizationEditing(false);
    } else {
      setOrganizationLogoPreview('');
    }
  }, [organizationData, organizationForm]);

  const dismissSavingToast = useCallback(() => {
    if (savingToastDismissRef.current) {
      savingToastDismissRef.current();
      savingToastDismissRef.current = null;
    }
  }, []);

  const updateOrganizationMutation = useMutation({
    mutationFn: settingsService.updateOrganization,
    onSuccess: (response) => {
      dismissSavingToast();
      showSuccess('Organization settings saved successfully');
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization', activeTenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      if (response?.data) {
        organizationForm.reset(response.data);
        setOrganizationLogoPreview(response.data.logoUrl || '');
      }
      setOrganizationEditing(false);
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error, 'Failed to update organization settings. Please try again.');
    },
  });

  const onOrganizationSubmit = useCallback(async (values) => {
    const payload = {
      name: values.name || '',
      legalName: values.legalName || '',
      email: values.email || '',
      phone: values.phone || '',
      website: values.website || '',
      ...(values.logoUrl && !values.logoUrl.startsWith('data:') ? { logoUrl: values.logoUrl } : {}),
      invoiceFooter: values.invoiceFooter || '',
      paymentDetails: values.paymentDetails || '',
      paymentDetailsEnabled: values.paymentDetailsEnabled === true,
      defaultPaymentTerms: values.defaultPaymentTerms || '',
      defaultTermsAndConditions: values.defaultTermsAndConditions || '',
      supportEmail: values.supportEmail || '',
      currency: values.currency || 'GHS',
      address: {
        line1: values.address?.line1 || '',
        line2: values.address?.line2 || '',
        city: values.address?.city || '',
        state: values.address?.state || '',
        postalCode: values.address?.postalCode || '',
        country: values.address?.country || '',
      },
      tax: {
        vatNumber: values.tax?.vatNumber || '',
        tin: values.tax?.tin || '',
        ghanaCardPin: values.tax?.ghanaCardPin || '',
        scheme: values.tax?.scheme || 'standard',
        enabled: values.tax?.enabled === true,
        defaultRatePercent: Number(values.tax?.defaultRatePercent) || 0,
        pricesAreTaxInclusive: values.tax?.pricesAreTaxInclusive === true,
        displayLabel: values.tax?.displayLabel || 'Tax',
        levies: Array.isArray(values.tax?.levies)
          ? values.tax.levies.map((l) => ({
            code: l.code || 'levy',
            label: l.label || 'Levy',
            ratePercent: Number(l.ratePercent) || 0,
            enabled: l.enabled !== false,
          }))
          : [],
        otherCharges: {
          enabled: values.tax?.otherCharges?.enabled === true,
          label: values.tax?.otherCharges?.label || 'Transaction charge',
          ratePercent: Number(values.tax?.otherCharges?.ratePercent) || 0,
          customerBears: values.tax?.otherCharges?.customerBears === true,
          appliesTo: values.tax?.otherCharges?.appliesTo === 'all_payments' ? 'all_payments' : 'online_payments',
        },
      },
      ...(values.shopType !== undefined ? { shopType: values.shopType || '' } : {}),
      ...(activeTenant?.plan === 'enterprise' ? {
        appName: (values.appName || '').trim() || '',
        primaryColor: (values.primaryColor || '').trim() || '',
      } : {}),
    };
    savingToastDismissRef.current = showLoading('Saving...');
    updateOrganizationMutation.mutate(payload);
  }, [activeTenant?.plan, updateOrganizationMutation]);

  const handleOrganizationLogoUpload = useCallback(async ({ file }) => {
    if (!file) return;
    setOrganizationLogoUploading(true);
    try {
      const response = await settingsService.uploadOrganizationLogo(file);
      const result = response?.data || response;
      const org = result?.data || result;
      organizationForm.setValue('logoUrl', org.logoUrl || '');
      setOrganizationLogoPreview(org.logoUrl || '');
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization', activeTenant?.id] });
      showSuccess('Organization logo updated successfully');
    } catch (error) {
      showError(error, 'Failed to upload organization logo. Please try again.');
    } finally {
      setOrganizationLogoUploading(false);
    }
  }, [activeTenant?.id, organizationForm, queryClient]);

  const startOrganizationEdit = useCallback(() => {
    organizationForm.reset(organization);
    setOrganizationLogoPreview(organization.logoUrl || '');
    setOrganizationEditing(true);
  }, [organization, organizationForm]);

  const cancelOrganizationEdit = useCallback(() => {
    organizationForm.reset(organization);
    setOrganizationLogoPreview(organization.logoUrl || '');
    setOrganizationEditing(false);
  }, [organization, organizationForm]);

  const handleAddAnotherBranch = useCallback(() => {
    if (!canManageOrganization) {
      showError(null, 'Only workspace managers can add new locations.');
      return;
    }
    if (workspaceType === 'shop') {
      if (hasFeature('shopsModule')) {
        navigate('/shops?add=1');
        return;
      }
      showError(null, 'Multi-shop management is not on your plan. Contact support to upgrade.');
      return;
    }
    if (workspaceType === 'pharmacy') {
      if (hasFeature('pharmacyOps')) {
        navigate('/pharmacies?add=1');
        return;
      }
      showError(null, 'Multi-pharmacy management is not on your plan. Contact support to upgrade.');
      return;
    }
    if (isStudioLike) {
      if (hasFeature('studioLocationsModule')) {
        navigate('/studio-locations?add=1');
        return;
      }
      showError(null, 'Multi-studio locations are not on your plan. Contact support to upgrade.');
      return;
    }
    showError(null, 'Contact support for assistance.');
  }, [canManageOrganization, workspaceType, hasFeature, isStudioLike, navigate]);

  return {
    activeTenant,
    canManageOrganization,
    hasFeature,
    organization,
    organizationRecord,
    organizationForm,
    organizationEditing,
    organizationLogoPreview,
    organizationLogoPreviewVisible,
    setOrganizationLogoPreviewVisible,
    organizationLogoUploading,
    loadingOrganization,
    workspaceType,
    workspaceTypeDisplay,
    workspaceDescription,
    addAnotherWorkspaceLabel,
    updateOrganizationMutation,
    onOrganizationSubmit,
    handleOrganizationLogoUpload,
    startOrganizationEdit,
    cancelOrganizationEdit,
    handleAddAnotherBranch,
    resolveFileUrl: resolveSettingsFileUrl,
    setOrganizationLogoPreview,
  };
};

export { organizationSchema };
