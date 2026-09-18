import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {vi,it,expect} from 'vitest';
import ReceiveStockModal from '../../components/ReceiveStockModal';
import productService from '../../services/productService';
vi.mock('../../hooks/usePOSConfig',()=>({useScanningEnabled:()=>({scanningEnabled:false})}));
vi.mock('../../utils/toast',()=>({showError:vi.fn(),showSuccess:vi.fn()}));
vi.mock('../../services/productService',()=>({default:{getProducts:vi.fn(),getProductByBarcode:vi.fn(),getProductById:vi.fn(),getProductVariants:vi.fn(),adjustStock:vi.fn()}}));
it('selects a scanned product instead of opening the focused picker when camera is disabled',async()=>{
 const product={id:'p1',name:'Scanned soap',barcode:'123456789012',quantityOnHand:4};
 productService.getProducts.mockResolvedValue({data:[product]});
 productService.getProductByBarcode.mockResolvedValue({data:product});
 productService.getProductById.mockResolvedValue({data:product});
 productService.getProductVariants.mockResolvedValue({data:[]});
 render(<ReceiveStockModal open onClose={()=>{}}/>);
 const picker=screen.getByLabelText('Scan or search products');
 picker.focus();
 let tick=10000;
 const clock=vi.spyOn(Date,'now').mockImplementation(()=>tick+=10);
 try{
  for(const key of product.barcode)fireEvent.keyDown(picker,{key});
  const suffix=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
  fireEvent(picker,suffix);
  expect(suffix.defaultPrevented).toBe(true);
 }finally{clock.mockRestore();}
 await waitFor(()=>expect(screen.getByLabelText('Quantity received for Scanned soap')).toBeTruthy());
 expect(productService.getProductByBarcode).toHaveBeenCalledExactlyOnceWith(product.barcode);
 expect(screen.getByText('Scanned soap')).toBeTruthy();
 expect(screen.getByLabelText('Scan or search products')).toBeTruthy();
 expect(productService.adjustStock).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Quantity received for Scanned soap'),{target:{value:'12'}});
 productService.adjustStock.mockResolvedValue({success:true});
 fireEvent.click(screen.getByRole('button',{name:'Receive all stock'}));
 await waitFor(()=>expect(productService.adjustStock).toHaveBeenCalledWith('p1',12,'delta','Receive stock',{type:'receive'}));
});
it('merges repeated scans and retains only unsaved rows after a partial failure',async()=>{
 vi.clearAllMocks();
 productService.getProducts.mockResolvedValue({data:[]});
 productService.getProductByBarcode.mockImplementation(async code=>({data:{id:code,name:`Item ${code}`,quantityOnHand:2}}));
 productService.adjustStock.mockResolvedValueOnce({success:true}).mockRejectedValueOnce(new Error('Unavailable'));
 render(<ReceiveStockModal open onClose={()=>{}}/>);
 const scan=async code=>{
  fireEvent.change(screen.getByLabelText('Scan or search products'),{target:{value:code}});
  fireEvent.click(screen.getByRole('button',{name:'Look up barcode'}));
  await waitFor(()=>expect(screen.getByLabelText('Scan or search products').value).toBe(''));
 };
 await scan('111');await scan('111');await scan('222');
 expect(productService.getProductByBarcode).toHaveBeenCalledTimes(2);
 expect(screen.getByLabelText('Quantity received for Item 111').value).toBe('2');
 expect(productService.adjustStock).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Receive all stock'}));
 await screen.findByRole('alert');
 expect(screen.queryByLabelText('Quantity received for Item 111')).toBeNull();
 expect(screen.getByLabelText('Quantity received for Item 222')).toBeTruthy();
 expect(productService.adjustStock).toHaveBeenCalledTimes(2);
});
