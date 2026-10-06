import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BulkProductImagesDialog from '../../components/BulkProductImagesDialog';
import productService from '../../services/productService';

vi.mock('../../utils/fileUtils', () => ({ resolveImageUrl: (value) => value || '' }));
vi.mock('../../utils/compressProductImage', () => ({
  PRODUCT_IMAGE_ACCEPT: 'image/*',
  PRODUCT_IMAGE_MAX_INPUT_BYTES: 40 * 1024 * 1024,
  isProductImageFile: (file) => /\.(jpe?g|png|webp|heic)$/i.test(file.name),
  compressProductImageFile: async (file) => file,
}));
vi.mock('../../services/productService', () => ({
  default: {
    getProductImageIndex: vi.fn(),
    uploadProductImage: vi.fn(),
    setProductImages: vi.fn(),
  },
}));

const catalog = [
  { id: 'p1', name: 'Bel Aqua 500ml', productCode: '00001', imageUrl: null, storeImages: {}, liveOnStore: false },
  { id: 'p2', name: 'Coca-Cola 350ml', productCode: '00002', imageUrl: '/old.jpg', storeImages: {}, liveOnStore: true },
];
const photo = (name) => new File(['x'], name, { type: 'image/jpeg' });

const addPhotos = async (names) => {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: names.map(photo) } });
  await screen.findByText('Matched products');
};

describe('BulkProductImagesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
    globalThis.URL.revokeObjectURL = vi.fn();
    productService.getProductImageIndex.mockResolvedValue(catalog);
    productService.uploadProductImage.mockImplementation(async (file) => ({ data: { imageUrl: `/uploads/${file.name}` } }));
    productService.setProductImages.mockResolvedValue({});
  });

  it('matches by name, lets staff assign an unknown photo, and saves each product once', async () => {
    const onSaved = vi.fn();
    render(<BulkProductImagesDialog open onOpenChange={vi.fn()} onSaved={onSaved} />);
    await waitFor(() => expect(productService.getProductImageIndex).toHaveBeenCalled());

    await addPhotos(['00001.jpg', '00001-B.jpg', '00002.jpg', 'IMG_1234.jpg', 'notes.txt']);

    expect(screen.getByText('Bel Aqua 500ml')).toBeInTheDocument();
    expect(screen.getByText('IMG_1234.jpg')).toBeInTheDocument();
    // Coca-Cola already has a main photo, so it is kept by default and the live-store question appears only when there is something to save.
    expect(screen.getByText('Replace photos products already have')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Find product'), { target: { value: 'coca' } });
    fireEvent.click(screen.getByRole('button', { name: /Coca-Cola 350ml/ }));
    expect(screen.queryByText('IMG_1234.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('Update photos on the online store too')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save photos (2)' }));
    await screen.findByText('Saved photos for 2 products.');

    expect(productService.setProductImages).toHaveBeenCalledWith(
      'p1',
      { A: '/uploads/00001.jpg', B: '/uploads/00001-B.jpg' },
      { updateLiveListing: false },
    );
    expect(productService.setProductImages).toHaveBeenCalledWith('p2', { B: '/uploads/IMG_1234.jpg' }, { updateLiveListing: false });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('lists products that failed so they can be retried', async () => {
    productService.setProductImages.mockRejectedValueOnce(new Error('Network down'));
    render(<BulkProductImagesDialog open onOpenChange={vi.fn()} />);
    await waitFor(() => expect(productService.getProductImageIndex).toHaveBeenCalled());

    await addPhotos(['00001.jpg']);
    fireEvent.click(screen.getByRole('button', { name: 'Save photos (1)' }));

    expect(await screen.findByText('Bel Aqua 500ml: Network down')).toBeInTheDocument();
    expect(screen.getByText('Saved photos for 0 products.')).toBeInTheDocument();
  });
});
