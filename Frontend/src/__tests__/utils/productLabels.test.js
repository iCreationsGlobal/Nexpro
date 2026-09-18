import { describe, it, expect } from 'vitest';
import {DEFAULT_LABEL_SETTINGS as defaults,labelGeometry,paginateLabels,labelDocument} from '../../utils/productLabels';
describe('product sticker printing',()=>{
 it('makes one correctly sized page per roll sticker',()=>{
   expect(labelGeometry(defaults)).toMatchObject({pageWidth:50,pageHeight:30,capacity:1});
   expect(paginateLabels([{name:'A',quantity:3}],defaults)).toHaveLength(3);
 });
 it('preserves quantities and skipped positions on sheets',()=>{
   const s={...defaults,layout:'sheet',columns:3,start:2};
   const pages=paginateLabels([{name:'A',quantity:2},{name:'B',quantity:1}],s);
   expect(pages[0].map(x=>x?.name??null)).toEqual([null,null,'A','A','B']);
 });
 it('rejects overflowing paper and invalid dimensions',()=>{
   expect(()=>labelGeometry({...defaults,layout:'sheet',columns:5})).toThrow(/fit/);
   expect(()=>labelGeometry({...defaults,width:0})).toThrow();
   expect(()=>labelGeometry({...defaults,offsetX:'bad'})).toThrow();
 });
 it('rejects zero, fractional and excessive quantities',()=>{
   for(const quantity of [0,1.5,501]) expect(()=>paginateLabels([{quantity}],defaults)).toThrow();
   expect(()=>paginateLabels(Array(5).fill({quantity:500}),defaults)).toThrow(/2,000/);
 });
 it('escapes catalog text and keeps zero prices',()=>{
   const html=labelDocument([{name:'<script>alert(1)</script>',sellingPrice:0,barcode:'001234',quantity:1}],defaults);
   expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('₵ 0.00');expect(html).toContain('size:50mm 30mm');
 });
 it('price-only labels exclude barcode artwork and test batches can reset skipped slots',()=>{
   const html=labelDocument([{name:'A',sellingPrice:12,quantity:1}],{...defaults,design:'price'});
   expect(html).not.toContain('<img');expect(paginateLabels([{quantity:1}],{...defaults,start:0})).toHaveLength(1);
 });
});
