import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import BulkProductLabels from '../../components/BulkProductLabels';
import productService from '../../services/productService';
vi.mock('../../services/productService',()=>({default:{getProducts:vi.fn(),getProductVariants:vi.fn(),getProductById:vi.fn(),updateProduct:vi.fn(),updateProductVariant:vi.fn()}}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children})=><div>{children}</div>,DialogContent:({children})=><div>{children}</div>,DialogHeader:({children})=><div>{children}</div>,DialogTitle:({children})=><h1>{children}</h1>,DialogBody:({children})=><div>{children}</div>}));
vi.mock('../../hooks/usePOSConfig', () => ({ useScanningEnabled: () => ({ scanningEnabled: true }) }));
it('retains selections across catalog pages and previews price labels without changing products',async()=>{
 productService.getProducts.mockImplementation(async({page})=>({data:[{id:String(page),name:page===1?'Soap':'Tea',sellingPrice:page===1?0:12}],pagination:{total:26}}));
 render(<BulkProductLabels shopId="shop-a" profileKey="test-label-profile" onClose={()=>{}}/>);
 fireEvent.click(await screen.findByRole('checkbox',{name:'Soap'}));
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 fireEvent.click(await screen.findByRole('checkbox',{name:'Tea'}));
 expect(screen.getByText(/2 selected · 2 labels/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Continue'}));
 fireEvent.change(screen.getByLabelText('Design'),{target:{value:'price'}});
 fireEvent.click(screen.getByRole('button',{name:'Preview labels'}));
 await waitFor(()=>expect(screen.getByTitle('Sticker print preview').getAttribute('srcdoc')).toContain('₵ 0.00'));
 expect(screen.getByTitle('Sticker print preview').getAttribute('srcdoc')).toContain('Tea');
 expect(productService.updateProduct).not.toHaveBeenCalled();
 expect(productService.getProducts).toHaveBeenCalledWith(expect.objectContaining({shopId:'shop-a', sort:'name_asc'}));
});

it('reorders the catalog and printed labels by price', async () => {
 productService.getProducts.mockImplementation(async ({ sort }) => ({
  data: sort === 'price_desc'
   ? [{ id: 'tea', name: 'Tea', sellingPrice: 12 }, { id: 'soap', name: 'Soap', sellingPrice: 1 }]
   : [{ id: 'soap', name: 'Soap', sellingPrice: 1 }, { id: 'tea', name: 'Tea', sellingPrice: 12 }],
  pagination: { total: 2 },
 }));
 render(<BulkProductLabels shopId="shop-a" profileKey="test-label-profile" onClose={() => {}} />);
 fireEvent.change(await screen.findByLabelText('Sort by'), { target: { value: 'price_desc' } });
 await waitFor(() => {
  expect(productService.getProducts).toHaveBeenCalledWith(expect.objectContaining({ sort: 'price_desc' }));
  expect(screen.getAllByRole('checkbox')[0].closest('label')?.textContent).toMatch(/Tea/);
 });
 fireEvent.click(screen.getByRole('checkbox', { name: 'Soap' }));
 fireEvent.click(screen.getByRole('checkbox', { name: 'Tea' }));
 fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
 fireEvent.change(screen.getByLabelText('Design'), { target: { value: 'price' } });
 fireEvent.click(screen.getByRole('button', { name: 'Preview labels' }));
 await waitFor(() => {
  const doc = screen.getByTitle('Sticker print preview').getAttribute('srcdoc') || '';
  expect(doc.indexOf('Tea')).toBeGreaterThan(-1);
  expect(doc.indexOf('Tea')).toBeLessThan(doc.indexOf('Soap'));
 });
});

it('prints a short sticker name with a full-width barcode and remembers a typed name', async () => {
 productService.updateProduct.mockReset();
 productService.updateProduct.mockResolvedValue({ data: { id: 'dress' } });
 productService.getProducts.mockResolvedValue({
  data: [{ id: 'dress', name: 'Black long dress with puff sleeves, perfect for parties. Size XL', sellingPrice: 150, barcode: '2012345678903' },
   { id: 'splash', name: 'Luminous Body Splash 250ml', sellingPrice: 30, barcode: '6034000181142', labelName: 'Luminous Splash' }],
  pagination: { total: 2 },
 });
 render(<BulkProductLabels shopId="shop-a" profileKey="test-label-profile-2" onClose={() => {}} />);
 fireEvent.click(await screen.findByRole('checkbox', { name: /Black long dress/ }));
 fireEvent.click(screen.getByRole('checkbox', { name: /Luminous Body Splash/ }));
 fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
 const dressName = screen.getByLabelText(/Sticker name for Black long dress/);
 expect(dressName).toHaveValue('Black long dress XL');
 expect(screen.getByLabelText(/Sticker name for Luminous/)).toHaveValue('Luminous Splash');
 fireEvent.change(dressName, { target: { value: 'Long dress XL' } });
 fireEvent.click(screen.getByRole('button', { name: 'Preview labels' }));
 await waitFor(() => expect(screen.getByTitle('Sticker print preview').getAttribute('srcdoc')).toContain('data:image/svg+xml'));
 const doc = screen.getByTitle('Sticker print preview').getAttribute('srcdoc');
 expect(doc).toContain('<div class="name">Long dress XL</div>');
 expect(doc).toContain('<div class="name">Luminous Splash</div>');
 expect(doc).not.toContain('puff sleeves');
 expect(doc).toContain('size:40mm 30mm');
 expect(productService.updateProduct).toHaveBeenCalledTimes(1);
 expect(productService.updateProduct).toHaveBeenCalledWith('dress', { labelName: 'Long dress XL' });
});

const labelCount = () => ((screen.getByTitle('Sticker print preview').getAttribute('srcdoc') || '').match(/<article class="label/g) || []).length;

it('opens sizes and colours by themselves, with copies set to this shop\'s stock', async () => {
 productService.getProducts.mockReset();
 productService.getProducts.mockResolvedValue({
  data: [{ id: 'gown', name: 'Gown', sellingPrice: 100, hasVariants: true, quantityOnHand: 23,
   variants: [{ id: 'm', name: 'M', sellingPrice: 120, quantityOnHand: 20, labelName: 'Gown M' }, { id: 'l', name: 'L', quantityOnHand: 3 }, { id: 'old', name: 'XS', quantityOnHand: 9, isActive: false }] }],
  pagination: { total: 1 },
 });
 render(<BulkProductLabels shopId="shop-a" profileKey="test-label-profile-3" onClose={() => {}} />);
 expect(await screen.findByRole('checkbox', { name: 'Gown — M' })).toBeTruthy();
 expect(screen.queryByRole('button', { name: /Choose variants/ })).toBeNull();
 expect(screen.queryByRole('checkbox', { name: 'Gown — XS' })).toBeNull();
 expect(screen.getByLabelText('Copies of Gown — M')).toHaveValue(20);
 expect(screen.getByLabelText('Copies of Gown — L')).toHaveValue(3);
 expect(productService.getProducts).toHaveBeenCalledWith(expect.objectContaining({ shopId: 'shop-a', includeVariants: true }));

 // The product's own tick box ticks every size, then none.
 fireEvent.click(screen.getByRole('checkbox', { name: 'Gown' }));
 expect(screen.getByText(/2 selected · 23 labels/)).toBeTruthy();
 fireEvent.click(screen.getByRole('checkbox', { name: 'Gown' }));
 expect(screen.getByText(/0 selected · 0 labels/)).toBeTruthy();
 fireEvent.click(screen.getByRole('checkbox', { name: 'Gown — L' }));
 expect(screen.getByRole('checkbox', { name: 'Gown' }).indeterminate).toBe(true);
 fireEvent.click(screen.getByRole('checkbox', { name: 'Gown' }));
 expect(screen.getByText(/2 selected · 23 labels/)).toBeTruthy();

 fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
 expect(screen.getByLabelText('Sticker name for Gown — M')).toHaveValue('Gown M');
 fireEvent.change(screen.getByLabelText('Design'), { target: { value: 'price' } });
 fireEvent.click(screen.getByRole('button', { name: 'Preview labels' }));
 await waitFor(() => expect(labelCount()).toBe(23));
 const doc = screen.getByTitle('Sticker print preview').getAttribute('srcdoc');
 expect(doc).toContain('<div class="name">Gown M</div>');
 expect(doc).toContain('₵ 120.00');
 expect(productService.getProductVariants).not.toHaveBeenCalled();
});

it('prints one sticker per piece in stock, and one for products whose stock is not counted', async () => {
 productService.getProducts.mockReset();
 productService.getProducts.mockResolvedValue({
  data: [{ id: 'soap', name: 'Soap', sellingPrice: 5, quantityOnHand: 20 }, { id: 'bag', name: 'Bag', sellingPrice: 50, trackStock: false }, { id: 'pen', name: 'Pen', sellingPrice: 2, quantityOnHand: 0 }],
  pagination: { total: 3 },
 });
 render(<BulkProductLabels shopId="shop-a" profileKey="test-label-profile-4" onClose={() => {}} />);
 await screen.findByRole('checkbox', { name: 'Soap' });
 fireEvent.click(screen.getByRole('button', { name: 'Select this page' }));
 expect(screen.getByText(/3 selected · 22 labels/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
 fireEvent.change(screen.getByLabelText('Design'), { target: { value: 'price' } });
 fireEvent.click(screen.getByRole('button', { name: 'Preview labels' }));
 await waitFor(() => expect(labelCount()).toBe(22));
});
