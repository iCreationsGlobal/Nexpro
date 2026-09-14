import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { useScanningEnabled } from '../../hooks/usePOSConfig';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));
vi.mock('../../services/settingsService', () => ({ default: { getPOSConfig: vi.fn() } }));

describe('POS hardware scanner configuration', () => {
  it('allows physical scanning when optional scan mode is off', () => {
    useQuery.mockReturnValue({ data: { data: { scanning: { enabled: false } } }, isLoading: false });
    const { result } = renderHook(() => useScanningEnabled());
    expect(result.current.scanningEnabled).toBe(false);
    expect(result.current.allowExternalScanner).toBe(true);
  });
  it('respects an explicit external scanner opt-out', () => {
    useQuery.mockReturnValue({ data: { data: { scanning: { enabled: true, allowExternalScanner: false } } }, isLoading: false });
    const { result } = renderHook(() => useScanningEnabled());
    expect(result.current.scanningEnabled).toBe(true);
    expect(result.current.allowExternalScanner).toBe(false);
  });
});
