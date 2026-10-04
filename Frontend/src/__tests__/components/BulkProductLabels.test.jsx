import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import BulkProductLabels from '../../components/BulkProductLabels';
import productService from '../../services/productService';
vi.mock('../../services/productService',()=>({default:{getProducts:vi.fn(),getProductVariants:vi.fn(),getProductById:vi.fn(),updateProduct:vi.fn()}}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children})=><div>{children}</div>,DialogContent:({children})=><div>{children}</div>,DialogHeader:({children})=><div>{children}</div>,DialogTitle:({children})=><h1>{children}</h1>,DialogBody:({children})=><div>{children}</div>}));
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
