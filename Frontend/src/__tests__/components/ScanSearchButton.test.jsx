import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ScanSearchButton from '../../components/ScanSearchButton';
import SmartSearchField from '../../components/layout/SmartSearchField';
import { useScanningEnabled } from '../../hooks/usePOSConfig';
import { useSmartSearch } from '../../context/SmartSearchContext';
import { showError } from '../../utils/toast';

vi.mock('../../hooks/usePOSConfig', () => ({ useScanningEnabled: vi.fn(() => ({ scanningEnabled: true })) }));
vi.mock('../../utils/toast', () => ({ showError: vi.fn() }));
vi.mock('../../context/SmartSearchContext', () => ({ useSmartSearch: vi.fn() }));
// The camera itself: a stand-in that "scans" what its test button says.
vi.mock('../../components/pos/POSProductSearch', () => ({
  QRCodeScanner: ({ onScan, onClose }) => (
    <div role="dialog">
      <button type="button" onClick={() => { onScan('6034000181142'); onClose(); }}>scan barcode</button>
      <button type="button" onClick={() => { onScan('{"name":"Gown M","barcode":"2012345678903"}'); onClose(); }}>scan QR label</button>
      <button type="button" onClick={() => { onScan('{"name":"Gown"}'); onClose(); }}>scan QR without barcode</button>
    </div>
  ),
}));

describe('ScanSearchButton', () => {
  beforeEach(() => { vi.mocked(useScanningEnabled).mockReturnValue({ scanningEnabled: true }); vi.mocked(showError).mockClear(); });

  it('puts a scanned barcode, or the barcode inside one of our QR labels, in the search', async () => {
    const onCode = vi.fn();
    render(<ScanSearchButton onCode={onCode} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode to search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'scan barcode' }));
    expect(onCode).toHaveBeenLastCalledWith('6034000181142');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode to search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'scan QR label' }));
    expect(onCode).toHaveBeenLastCalledWith('2012345678903');
    fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode to search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'scan QR without barcode' }));
    expect(onCode).toHaveBeenCalledTimes(2);
    expect(showError).toHaveBeenCalledWith('That QR code has no barcode number. Scan the barcode instead.');
  });

  it('is not shown when the business has switched scanning off', () => {
    vi.mocked(useScanningEnabled).mockReturnValue({ scanningEnabled: false });
    render(<ScanSearchButton onCode={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Scan a barcode to search' })).toBeNull();
  });
});

describe('Header search camera', () => {
  beforeEach(() => { vi.mocked(useScanningEnabled).mockReturnValue({ scanningEnabled: true }); });
  const search = (pageConfig) => {
    const state = { pageConfig, placeholder: 'Search products', scope: 'products', searchValue: '', setSearchValue: vi.fn(), recentSearches: [], saveRecentSearch: vi.fn(), clearRecentSearches: vi.fn() };
    vi.mocked(useSmartSearch).mockReturnValue(state);
    return state;
  };

  it('shows the camera on pages that search products, and a scan becomes the search', async () => {
    const state = search({ scope: 'products', scan: true });
    render(<SmartSearchField />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode to search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'scan barcode' }));
    expect(state.setSearchValue).toHaveBeenCalledWith('6034000181142');
    expect(state.saveRecentSearch).toHaveBeenCalledWith('6034000181142');
  });

  it('has no camera on other pages', () => {
    search({ scope: 'customers' });
    render(<SmartSearchField />);
    expect(screen.queryByRole('button', { name: 'Scan a barcode to search' })).toBeNull();
  });
});
