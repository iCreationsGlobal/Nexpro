import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import settingsService from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { showError, showLoading, showSuccess } from '../utils/toast';
import { QUERY_CACHE } from '../constants';

export const DEFAULT_RENTAL_SETTINGS = {
  lateChargeRatePercent: 50,
  gracePeriodValue: 0,
  gracePeriodUnit: 'hours',
  defaultDepositPercent: '',
  defaultDepositAmount: '',
  requireIdVerification: false,
  preBookingExpiryDays: '',
  dayBillingMode: 'end_of_day',
};

const normalizeDraftFromSettings = (settings = {}) => ({
  lateChargeRatePercent: settings.lateChargeRatePercent ?? DEFAULT_RENTAL_SETTINGS.lateChargeRatePercent,
  gracePeriodValue: settings.gracePeriodValue ?? DEFAULT_RENTAL_SETTINGS.gracePeriodValue,
  gracePeriodUnit: settings.gracePeriodUnit === 'days' ? 'days' : 'hours',
  defaultDepositPercent: settings.defaultDepositPercent != null ? String(settings.defaultDepositPercent) : '',
  defaultDepositAmount: settings.defaultDepositAmount != null ? String(settings.defaultDepositAmount) : '',
  requireIdVerification: settings.requireIdVerification === true,
  preBookingExpiryDays: settings.preBookingExpiryDays != null ? String(settings.preBookingExpiryDays) : '',
  dayBillingMode: settings.dayBillingMode === 'overnight' ? 'overnight' : 'end_of_day',
});

/**
 * Rental workspace settings — late fees, grace period, deposits, and pre-booking defaults.
 * @returns {Object}
 */
export const useSettingsRental = () => {
  const queryClient = useQueryClient();
  const { isManager, activeTenant } = useAuth();
  const canManageOrganization = Boolean(isManager);
  const isRentalTenant = activeTenant?.businessType === 'rental';
  const savingToastDismissRef = useRef(null);
  const [rentalSettingsEditing, setRentalSettingsEditing] = useState(false);
  const [rentalDraft, setRentalDraft] = useState(DEFAULT_RENTAL_SETTINGS);

  const dismissSavingToast = useCallback(() => {
    if (savingToastDismissRef.current) {
      savingToastDismissRef.current();
      savingToastDismissRef.current = null;
    }
  }, []);

  const { data: rentalSettingsData, isLoading: loadingRentalSettings } = useQuery({
    queryKey: ['settings', 'rental', activeTenant?.id],
    queryFn: settingsService.getRentalSettings,
    enabled: canManageOrganization && isRentalTenant,
    staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
  });

  const rentalSettings = rentalSettingsData ?? DEFAULT_RENTAL_SETTINGS;

  useEffect(() => {
    if (!canManageOrganization || !isRentalTenant || rentalSettingsEditing) return;
    if (rentalSettingsData && typeof rentalSettingsData === 'object') {
      setRentalDraft(normalizeDraftFromSettings(rentalSettingsData));
    }
  }, [rentalSettingsData, canManageOrganization, isRentalTenant, rentalSettingsEditing]);

  const updateRentalSettingsMutation = useMutation({
    mutationFn: settingsService.updateRentalSettings,
    onSuccess: async (data) => {
      dismissSavingToast();
      showSuccess('Rental settings saved');
      await queryClient.invalidateQueries({ queryKey: ['settings', 'rental'] });
      if (data && typeof data === 'object') {
        setRentalDraft(normalizeDraftFromSettings(data));
      }
      setRentalSettingsEditing(false);
    },
    onError: (error) => {
      dismissSavingToast();
      showError(error, error?.response?.data?.message || 'Failed to update rental settings');
    },
  });

  const handleRentalDraftChange = useCallback((patch) => {
    setRentalDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleResetRentalDraft = useCallback(() => {
    setRentalDraft(normalizeDraftFromSettings(rentalSettingsData || DEFAULT_RENTAL_SETTINGS));
  }, [rentalSettingsData]);

  const handleSaveRentalSettings = useCallback(() => {
    const payload = {
      lateChargeRatePercent: Number(rentalDraft.lateChargeRatePercent),
      gracePeriodValue: Number(rentalDraft.gracePeriodValue),
      gracePeriodUnit: rentalDraft.gracePeriodUnit === 'days' ? 'days' : 'hours',
      requireIdVerification: rentalDraft.requireIdVerification === true,
      dayBillingMode: rentalDraft.dayBillingMode === 'overnight' ? 'overnight' : 'end_of_day',
    };

    const depositPercent = String(rentalDraft.defaultDepositPercent ?? '').trim();
    const depositAmount = String(rentalDraft.defaultDepositAmount ?? '').trim();
    const preBookingExpiry = String(rentalDraft.preBookingExpiryDays ?? '').trim();

    payload.defaultDepositPercent = depositPercent === '' ? null : Number(depositPercent);
    payload.defaultDepositAmount = depositAmount === '' ? null : Number(depositAmount);
    payload.preBookingExpiryDays = preBookingExpiry === '' ? null : Number(preBookingExpiry);

    savingToastDismissRef.current = showLoading('Saving...');
    updateRentalSettingsMutation.mutate(payload);
  }, [rentalDraft, updateRentalSettingsMutation]);

  const startRentalEdit = useCallback(() => {
    handleResetRentalDraft();
    setRentalSettingsEditing(true);
  }, [handleResetRentalDraft]);

  const cancelRentalEdit = useCallback(() => {
    handleResetRentalDraft();
    setRentalSettingsEditing(false);
  }, [handleResetRentalDraft]);

  return {
    canManageOrganization,
    isRentalTenant,
    loadingRentalSettings,
    rentalSettings,
    rentalSettingsEditing,
    rentalDraft,
    updateRentalSettingsMutation,
    handleRentalDraftChange,
    handleSaveRentalSettings,
    startRentalEdit,
    cancelRentalEdit,
  };
};
