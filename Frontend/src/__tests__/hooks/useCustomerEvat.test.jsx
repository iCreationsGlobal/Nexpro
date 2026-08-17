import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ENABLE_EVAT_FROM_CUSTOMER_FORM, useCustomerEvat } from '../../hooks/useCustomerEvat';

vi.mock('../../services/evatService', () => ({
  default: {
    getStatus: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import evatService from '../../services/evatService';

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCustomerEvat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evatService.getStatus.mockResolvedValue({ data: { data: { enabled: false } } });
    evatService.updateSettings.mockResolvedValue({
      data: { data: { enabled: true, consentAcceptedAt: '2026-08-17T00:00:00.000Z' } },
    });
  });

  it('does not fetch status when the graEvat feature is off', async () => {
    const { result } = renderHook(
      () => useCustomerEvat({ featureEnabled: false, tenantId: 't1', isManager: true }),
      { wrapper }
    );

    expect(result.current.featureEnabled).toBe(false);
    expect(result.current.evatEnabled).toBe(false);
    expect(evatService.getStatus).not.toHaveBeenCalled();
  });

  it('turns on e-VAT with enabled and consent, without requiring an API key', async () => {
    const { result } = renderHook(
      () => useCustomerEvat({ featureEnabled: true, tenantId: 't1', isManager: true }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.evatEnabled).toBe(false);

    await act(async () => {
      result.current.turnOn();
    });

    await waitFor(() => {
      expect(evatService.updateSettings).toHaveBeenCalledWith(ENABLE_EVAT_FROM_CUSTOMER_FORM);
    });
    expect(ENABLE_EVAT_FROM_CUSTOMER_FORM).toEqual({
      enabled: true,
      consentAccepted: true,
      acceptConsent: true,
    });
    await waitFor(() => expect(result.current.evatEnabled).toBe(true));
  });

  it('does not call settings when a non-manager tries to turn on e-VAT', async () => {
    const { result } = renderHook(
      () => useCustomerEvat({ featureEnabled: true, tenantId: 't1', isManager: false }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.turnOn();
    });

    expect(evatService.updateSettings).not.toHaveBeenCalled();
  });
});
