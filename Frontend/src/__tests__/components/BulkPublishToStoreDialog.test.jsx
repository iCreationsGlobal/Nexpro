import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BulkPublishToStoreDialog from '../../components/BulkPublishToStoreDialog';
import productService from '../../services/productService';

vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: (value) => value || '' }));
vi.mock('../../services/productService', () => ({
  default: {
    getProductImageIndex: vi.fn(),
    bulkPublishToStore: vi.fn(),
  },
}));

const catalog = [
  { id: 'p1', name: 'Bel Aqua 500ml', productCode: '00001', imageUrl: '/a.jpg', sellingPrice: 5, storeImages: { B: '/b.jpg' }, liveOnStore: false },
  { id: 'p2', name: 'Coca-Cola 350ml', productCode: '00002', imageUrl: '/c.jpg', sellingPrice: 8, storeImages: {}, liveOnStore: true },
  { id: 'p3', name: 'Fanta 350ml', productCode: '00003', imageUrl: null, sellingPrice: 8, storeImages: {}, liveOnStore: false },
  { id: 'p4', name: 'Sprite 350ml', productCode: '00004', imageUrl: '/s.jpg', sellingPrice: 0, storeImages: {}, liveOnStore: false },
];

describe('BulkPublishToStoreDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productService.getProductImageIndex.mockResolvedValue(catalog);
    productService.bulkPublishToStore.mockImplementation(async (ids) => ({
      data: { published: ids.map((id) => ({ id })), skipped: [] },
    }));
  });

  it('hides live products by default, blocks products without a photo or price, and publishes the selection', async () => {
    const onPublished = vi.fn();
    render(<BulkPublishToStoreDialog open onOpenChange={vi.fn()} onPublished={onPublished} />);
    await screen.findByText('Bel Aqua 500ml');

    expect(screen.queryByText('Coca-Cola 350ml')).not.toBeInTheDocument();
    expect(screen.getByText('No photo')).toBeInTheDocument();
    expect(screen.getByText('No price')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Fanta 350ml')).toBeDisabled();
    expect(screen.getByText('2 photos', { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Select all 1 shown'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1 product' }));

    await screen.findByText('1 product published to your store.');
    expect(productService.bulkPublishToStore).toHaveBeenCalledWith(['p1']);
    expect(onPublished).toHaveBeenCalledOnce();
  });

  it('pre-selects products handed over from the photo upload and reports what the server skipped', async () => {
    productService.bulkPublishToStore.mockResolvedValue({
      data: { published: [{ id: 'p1' }], skipped: [{ id: 'p2', name: 'Coca-Cola 350ml', reason: 'Listing title is required before publishing' }] },
    });
    render(<BulkPublishToStoreDialog open onOpenChange={vi.fn()} initialSelectedIds={['p1', 'p2']} />);
    await screen.findByText('Bel Aqua 500ml');
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));

    fireEvent.click(screen.getByRole('button', { name: 'Publish 2 products' }));

    await screen.findByText('1 not published');
    expect(screen.getByText('Coca-Cola 350ml: Listing title is required before publishing')).toBeInTheDocument();
    await waitFor(() => expect(productService.bulkPublishToStore).toHaveBeenCalledWith(['p1', 'p2']));
  });
});
