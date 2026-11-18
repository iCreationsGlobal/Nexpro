import { describe, it, expect } from 'vitest';
import {DEFAULT_LABEL_SETTINGS as defaults,labelGeometry,paginateLabels,labelDocument,shortLabelName,savedLabelName,autoLabelName,labelTextFor} from '../../utils/productLabels';
describe('product sticker printing',()=>{
 it('makes one correctly sized page per roll sticker',()=>{
   expect(labelGeometry(defaults)).toMatchObject({pageWidth:40,pageHeight:30,capacity:1});
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
   expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('₵ 0.00');expect(html).toContain('size:40mm 30mm');
 });
 it('price-only labels exclude barcode artwork and test batches can reset skipped slots',()=>{
   const html=labelDocument([{name:'A',sellingPrice:12,quantity:1}],{...defaults,design:'price'});
   expect(html).not.toContain('<img');expect(paginateLabels([{quantity:1}],{...defaults,start:0})).toHaveLength(1);
 });
 it('prints the short sticker name on at most two lines that start at the beginning, never the description',()=>{
   const html=labelDocument([{name:'Black long dress with puff sleeves',labelName:'Black long dress XL',description:'Party wear',sellingPrice:120,barcode:'2012345678903',image:'data:image/svg+xml,x',quantity:1}],defaults);
   expect(html).toContain('<div class="name">Black long dress XL</div>');
   expect(html).not.toContain('puff sleeves');expect(html).not.toContain('Party wear');
   // The name box is as wide as the sticker (so long names end in "…" instead of losing their start) and wraps to two lines.
   expect(html).toMatch(/\.name\{width:100%[^}]*-webkit-line-clamp:2/);
   expect(html).not.toMatch(/\.name\{[^}]*white-space:nowrap/);
   // The barcode fills the sticker's width.
   expect(html).toContain('.code img{display:block;width:100%;height:100%}');
 });
});

describe('short sticker names',()=>{
 it.each([
   ['Black long dress with puff sleeves, perfect for parties. Size XL','Black long dress XL'],
   ['Mini short dress for ladies, size XL, available in black','Black Mini short dress XL'],
   ['Luminous Body Splash 250ml','Luminous Body Splash 250ml'],
   ['Beautiful Elegant Ankara Gown - Size 12','Ankara Gown Size 12'],
   ['Plus size dress in red','Red Plus size dress'],
   ['Shea butter 2.5kg tub','Shea butter tub 2.5kg'],
   ['Soap','Soap'],
 ])('%s → %s',(name,expected)=>{
   expect(shortLabelName(name)).toBe(expected);
 });
 it('keeps sizes and the variant name at the end when the name is too long',()=>{
   const name=shortLabelName('Ladies Black Long Sleeve Maxi Dress Elegant Party Wear Size XL');
   expect(name.length).toBeLessThanOrEqual(40);expect(name.endsWith(' XL')).toBe(true);expect(name.startsWith('Ladies Black')).toBe(true);
   expect(shortLabelName('Short dress with frills',{suffix:'Black / XL'})).toBe('Short dress Black XL');
 });
 it('uses a saved sticker name over the automatic one, and a typed one over both',()=>{
   expect(savedLabelName({name:'A',labelName:' Dress XL '})).toBe('Dress XL');
   expect(savedLabelName({variantId:'v1',metadata:{labelName:'Gown M'}})).toBe('Gown M');
   expect(savedLabelName({name:'A',labelName:'Old',savedLabelName:''})).toBe('');
   const variant={variantId:'v1',name:'Long dress with belt — XL',baseName:'Long dress with belt',baseLabelName:'',variantName:'XL'};
   expect(autoLabelName(variant)).toBe('Long dress XL');
   expect(labelTextFor({...variant,metadata:{labelName:'Belted dress XL'}})).toBe('Belted dress XL');
   expect(labelTextFor({...variant,labelText:'  Typed  '})).toBe('Typed');
   expect(labelTextFor({...variant,labelText:'  '})).toBe('Long dress XL');
 });
});
