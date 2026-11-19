import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ScanSearchButton from '@/components/ScanSearchButton';
import productService from '../services/productService';
import { DEFAULT_LABEL_SETTINGS, autoLabelName, barcodeAreaWidth, labelDocument, labelGeometry, labelTextFor, savedLabelName } from '../utils/productLabels';
import { barcodeFits, barcodeSvg, generateInStoreBarcode } from '../utils/barcodeImage';

const rowsOf = r => Array.isArray(r?.data) ? r.data : Array.isArray(r?.products) ? r.products : [];
const fieldClass = 'border rounded-md bg-background p-2 w-full';
const keyOf = p => `${p.variantId ? 'variant' : 'product'}:${p.variantId || p.id}`;
const MAX_COPIES = 500;

/** Pieces in stock in this shop for a product or one of its sizes or colours (null when stock isn't counted). */
const inStock = item => (item?.trackStock === false ? null : Math.max(0, Math.floor(Number(item?.quantityOnHand) || 0)));
/** One sticker for every piece in stock (at most 500), or 1 when none is counted. */
const copiesFor = item => Math.min(inStock(item) || 1, MAX_COPIES);

/**
 * The catalog page as rows. A product with sizes or colours is a heading (its tick box ticks them
 * all) with each size or colour under it, already open; the product itself isn't printed.
 */
function labelRows(products) {
  return products.flatMap(product => {
    const variants = (Array.isArray(product.variants) ? product.variants : []).filter(v => v.isActive !== false);
    if (!variants.length) return [{ ...product, hasVariants: false }];
    const children = variants.map(v => ({
      ...v, id: product.id, variantId: v.id, name: `${product.name} — ${v.name}`, baseName: product.name, baseLabelName: savedLabelName(product),
      variantName: v.name, sellingPrice: v.sellingPrice ?? product.sellingPrice, trackStock: v.trackStock ?? product.trackStock, hasVariants: false,
      savedLabelName: typeof v.labelName === 'string' ? v.labelName.trim() : typeof v.metadata?.labelName === 'string' ? v.metadata.labelName.trim() : '',
    }));
    return [{ ...product, group: children.map(keyOf) }, ...children];
  });
}

/** Price sort for the label catalog and the printed sticker order. Other keys keep the current order. */
function orderLabelItems(items, sortKey) {
  if (sortKey !== 'price_asc' && sortKey !== 'price_desc') return items;
  const direction = sortKey === 'price_desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const byPrice = (Number(a.sellingPrice) - Number(b.sellingPrice)) * direction;
    if (byPrice) return byPrice;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export default function BulkProductLabels({ onClose, shopId, profileKey, onSaved }) {
  const [step,setStep]=useState(1), [rows,setRows]=useState([]), [page,setPage]=useState(1), [hasNext,setHasNext]=useState(false);
  const [search,setSearch]=useState(''), [sort,setSort]=useState('name_asc'), [selected,setSelected]=useState({}), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [revision,setRevision]=useState(0), [documentHtml,setDocumentHtml]=useState(''), [prepared,setPrepared]=useState([]);
  const [settings,setSettings]=useState(()=>{try {return {...DEFAULT_LABEL_SETTINGS,...JSON.parse(localStorage.getItem(profileKey)||'{}')};}catch{return {...DEFAULT_LABEL_SETTINGS};}});
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(async()=>{
      setBusy(true);setError('');
      try {
        // Sizes and colours come with their products, with this shop's stock.
        const result=await productService.getProducts({page,limit:25,search,shopId,isActive:true,sort,includeVariants:true});
        if(active){const list=rowsOf(result);setRows(labelRows(list));setHasNext(result?.pagination?.total ? page*25<result.pagination.total : list.length===25);}
      }catch(e){if(active){setRows([]);setError(e.message||'Could not load products.');}}
      finally{if(active)setBusy(false);}
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[page,search,shopId,revision,sort]);
  const items=Object.values(selected), ordered=orderLabelItems(items, sort), total=items.reduce((n,p)=>n+Number(p.quantity||0),0);
  const toggle=p=>setSelected(old=>{const next={...old}, key=keyOf(p);if(next[key])delete next[key];else next[key]={...p,quantity:copiesFor(p)};return next;});
  const sizesOf=group=>rows.filter(r=>!r.group&&group.group.includes(keyOf(r)));
  // A product's tick box: all its sizes and colours, or none when they're all ticked already.
  const toggleGroup=group=>setSelected(old=>{const next={...old}, sizes=sizesOf(group);if(sizes.every(s=>next[keyOf(s)]))sizes.forEach(s=>delete next[keyOf(s)]);else sizes.forEach(s=>{next[keyOf(s)]=next[keyOf(s)]||{...s,quantity:copiesFor(s)};});return next;});
  const stockText=item=>{const n=inStock(item);return n===null?'—':String(n);};
  const setSetting=(key,value)=>{setSettings(s=>({...s,[key]:value}));setDocumentHtml('');};
  async function generateMissing(){
    setBusy(true);setError('');
    try {
      for(const item of items.filter(p=>!p.barcode)){
        const freshResult = item.variantId ? await productService.getProductVariants(item.id) : await productService.getProductById(item.id);
        const fresh = item.variantId ? rowsOf(freshResult).find(v=>v.id===item.variantId) : freshResult?.data;
        if (!fresh?.id) throw new Error(`Could not verify ${item.name}. Refresh the catalog.`);
        const barcode=fresh.barcode || generateInStoreBarcode();
        if (!fresh.barcode) {
          const saved = item.variantId ? await productService.updateProductVariant(item.variantId,{barcode}) : await productService.updateProduct(item.id,{barcode});
          if (saved?.data?.barcode !== barcode) throw new Error(`Barcode was not saved for ${item.name}. Check product-edit permissions.`);
        }
        setRows(old=>old.map(p=>keyOf(p)===keyOf(item)?{...p,barcode}:p));
        setSelected(old=>({...old,[keyOf(item)]:{...old[keyOf(item)],barcode}}));
      }
    }catch(e){setError(`Some codes could not be saved. Successfully saved codes are retained. ${e.message||''}`);}finally{setBusy(false);onSaved?.();}
  }
  // Remember sticker names that were typed, so the next print uses them. Typing the automatic name
  // back (or clearing the box) removes the saved one. Printing never waits on this succeeding.
  async function saveLabelNames(){
    const failed=[];
    for(const item of items){
      const typed=typeof item.labelText==='string'?item.labelText.trim():null;
      if(typed===null)continue;
      const target=!typed||typed===autoLabelName(item)?'':typed;
      if(target===savedLabelName(item))continue;
      try {
        if(item.variantId)await productService.updateProductVariant(item.variantId,{labelName:target});
        else await productService.updateProduct(item.id,{labelName:target});
        const key=keyOf(item);
        setSelected(old=>old[key]?{...old,[key]:{...old[key],savedLabelName:target}}:old);
        setRows(old=>old.map(p=>keyOf(p)===key?{...p,savedLabelName:target}:p));
      }catch{failed.push(item.name);}
    }
    return failed;
  }
  async function preview(){
    setBusy(true);setError('');
    try {
      labelGeometry(settings);
      if(!items.length)throw new Error('Select at least one product.');
      const code=settings.design!=='price';
      if(code&&items.some(p=>!p.barcode))throw new Error('Generate and save missing barcodes before continuing.');
      const unsaved=await saveLabelNames();
      const labels=[];
      for(const item of orderLabelItems(items, sort)){
        if(!Number.isFinite(Number(item.sellingPrice))||Number(item.sellingPrice)<0)throw new Error(`Check the selling price for ${item.name}.`);
        let image;
        if(settings.design.startsWith('qr')){
          // No parent id: barcode lookup preserves the selected variant in POS.
          const payload=JSON.stringify({name:item.name.slice(0,60),barcode:item.barcode});
          const modules=QRCode.create(payload,{errorCorrectionLevel:'M'}).modules.size+8;
          if(Math.min((Number(settings.width)-4)/2,Number(settings.height)-4)/modules<0.25) throw new Error(`The QR code for ${item.name} needs a larger sticker.`);
          image=await QRCode.toDataURL(payload,{width:400,margin:4,errorCorrectionLevel:'M'});
        }else if(code){
          const art=barcodeSvg(item.barcode);
          if(!barcodeFits(art.units,barcodeAreaWidth(settings)))throw new Error(`The barcode for ${item.name} needs a wider sticker. Increase the width or choose QR.`);
          image=art.dataUrl;
        }
        labels.push({...item,image,labelName:labelTextFor(item)});
      }
      setDocumentHtml(labelDocument(labels,settings));setPrepared(labels);setStep(3);
      if(unsaved.length)setError(`Labels are ready, but the sticker names for ${unsaved.join(', ')} were not saved for next time.`);
    }catch(e){setError(e.message||'Could not prepare labels.');}finally{setBusy(false);}
  }
  function print(test=false){
    setError('');
    const w=window.open('','_blank');
    if(!w){setError('Allow pop-ups to open the print preview.');return;}
    w.opener=null;
    w.document.open();w.document.write(test?labelDocument([{...prepared[0],quantity:1}],{...settings,start:0}):documentHtml);w.document.close();
    Promise.all(Array.from(w.document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}))).then(()=>{w.focus();w.print();});
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Generate product labels · Step {step} of 3</DialogTitle></DialogHeader><DialogBody>
    <p className="text-sm text-muted-foreground mb-4">Select products → Design stickers → Preview and print</p>
    {error&&<div role="alert" className="p-3 mb-3 rounded bg-red-50 text-red-800">{error}</div>}
    {step===1&&<>
      <label className="block">Search products<span className="relative block"><input className={`${fieldClass} pr-11`} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Name, barcode or product code" /><ScanSearchButton onCode={code=>{setSearch(code);setPage(1);}} className="absolute right-1 top-1/2 -translate-y-1/2" /></span></label>
      <label className="mt-3 block">Sort by<select className={fieldClass} value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="name_asc">Name A–Z</option><option value="price_asc">Price low–high</option><option value="price_desc">Price high–low</option></select></label>
      <div className="flex gap-3 my-3"><Button variant="outline" disabled={busy} onClick={()=>setSelected(old=>({...old,...Object.fromEntries(rows.filter(p=>!p.group).map(p=>[keyOf(p),old[keyOf(p)]||{...p,quantity:copiesFor(p)}]))}))}>Select this page</Button><Button variant="outline" onClick={()=>setSelected({})}>Clear selection</Button><Button variant="outline" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh</Button></div>
      {busy&&<p role="status">Loading…</p>}
      <p className="text-sm text-muted-foreground mb-2">Copies start at the number in stock, so ticking a product prints one sticker for each piece. Change any of them.</p>
      <div className="max-h-72 overflow-auto border rounded"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Product</th><th>In stock</th><th>Price</th><th>Copies</th></tr></thead><tbody>{rows.map(p=>{
        if(p.group){
          const sizes=sizesOf(p), ticked=sizes.filter(s=>selected[keyOf(s)]), counted=sizes.filter(s=>inStock(s)!==null);
          return <tr key={`group:${p.id}`} className="border-t bg-muted/40"><td className="p-2"><label className="flex gap-2 items-center font-medium"><input type="checkbox" disabled={busy||!sizes.length} checked={sizes.length>0&&ticked.length===sizes.length} ref={el=>{if(el)el.indeterminate=ticked.length>0&&ticked.length<sizes.length;}} onChange={()=>toggleGroup(p)}/>{p.name}</label></td><td className="p-2 text-center">{counted.length?counted.reduce((n,s)=>n+inStock(s),0):'—'}</td><td className="p-2"/><td className="p-2 text-muted-foreground">{ticked.length?`${ticked.reduce((n,s)=>n+Number(selected[keyOf(s)].quantity||0),0)} in all`:''}</td></tr>;
        }
        return <tr key={keyOf(p)} className="border-t"><td className={p.variantId?'p-2 pl-8':'p-2'}><label className="flex gap-2 items-center"><input type="checkbox" aria-label={p.name} disabled={busy} checked={!!selected[keyOf(p)]} onChange={()=>toggle(p)}/>{p.variantId?p.variantName:p.name}</label></td><td className="p-2 text-center">{stockText(p)}</td><td className="p-2">{settings.currency} {Number(p.sellingPrice||0).toFixed(2)}</td><td className="p-2"><input aria-label={`Copies of ${p.name}`} type="number" min="1" max={MAX_COPIES} className={`${fieldClass} max-w-20`} disabled={!selected[keyOf(p)]} value={selected[keyOf(p)]?.quantity??copiesFor(p)} onChange={e=>{const quantity=e.target.value;setSelected(old=>({...old,[keyOf(p)]:{...old[keyOf(p)],quantity}}));}}/></td></tr>;
      })}</tbody></table>{!busy&&!rows.length&&<p className="p-4">No products found.</p>}</div>
      <div className="flex gap-3 my-3"><Button variant="outline" disabled={page===1||busy} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={!hasNext||busy} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
      <p>{items.length} selected · {total} labels. Selections are kept across pages.</p><Button className="mt-3" disabled={!items.length||busy} onClick={()=>{setError('');setStep(2);}}>Continue</Button>
    </>}
    {step===2&&<>
      <div className="grid sm:grid-cols-3 gap-3">
        <label>Design<select className={fieldClass} value={settings.design} onChange={e=>setSetting('design',e.target.value)}>{[['barcode-price','Barcode + price'],['qr-price','QR + price'],['price','Price only'],['barcode','Barcode only'],['qr','QR only']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Paper layout<select className={fieldClass} value={settings.layout} onChange={e=>setSetting('layout',e.target.value)}><option value="roll">Thermal label roll</option><option value="sheet">Sticker sheet</option></select></label>
        <label>Preset<select className={fieldClass} defaultValue="" onChange={e=>{if(e.target.value){const [width,height]=e.target.value.split('x').map(Number);setSettings(s=>({...s,width,height}));}}}><option value="">Custom / choose size</option>{['40x30','50x30','60x40'].map(v=><option key={v} value={v}>{v} mm</option>)}</select></label>
        {settings.layout==='sheet'&&<label>Sheet<select className={fieldClass} value={settings.paper} onChange={e=>setSetting('paper',e.target.value)}><option>A4</option><option>Letter</option></select></label>}
        {[['width','Width (mm)',25,210],['height','Height (mm)',20,297],['columns','Labels across',1,8],['gap','Gap (mm)',0,20],['margin','Sheet margin (mm)',0,30],['offsetX','Horizontal offset (mm)',-10,10],['offsetY','Vertical offset (mm)',-10,10],['start','Skip used stickers',0,100]].map(([key,label,min,max])=><label key={key}>{label}<input className={fieldClass} type="number" step={['columns','start'].includes(key)?1:0.5} min={min} max={max} value={settings[key]} onChange={e=>setSetting(key,e.target.value)}/></label>)}
        <label>Currency symbol<input className={fieldClass} maxLength={5} value={settings.currency} onChange={e=>setSetting('currency',e.target.value)}/></label>
      </div>
      <p className="text-sm my-3">Default: thermal printer, 40 × 30 mm. Match the loaded stickers. Stickers show a short name (never the description), the price and a large barcode. Check the preview and print one test sticker first.</p>
      <details open className="my-3"><summary>Sticker names and copies ({ordered.length} products)</summary><p className="text-sm text-muted-foreground my-2">Change a sticker name if you like; it is remembered for next time.</p>{ordered.map(p=><div key={keyOf(p)} className="flex flex-wrap items-end gap-3 my-2 border-b pb-2"><label className="flex-1 min-w-48 text-sm"><span className="block text-muted-foreground truncate">{p.name}</span><input aria-label={`Sticker name for ${p.name}`} maxLength={60} className={fieldClass} value={p.labelText??(savedLabelName(p)||autoLabelName(p))} onChange={e=>{const labelText=e.target.value;setSelected(old=>({...old,[keyOf(p)]:{...old[keyOf(p)],labelText}}));setDocumentHtml('');}}/></label><input type="number" min="1" max="500" aria-label={`Copies of ${p.name}`} className={`${fieldClass} max-w-20`} value={p.quantity} onChange={e=>{const quantity=e.target.value;setSelected(old=>({...old,[keyOf(p)]:{...old[keyOf(p)],quantity}}));}}/><button className="underline" onClick={()=>toggle(p)}>Remove</button></div>)}</details>
      {settings.design!=='price'&&items.some(p=>!p.barcode)&&<div className="p-3 border rounded my-3"><p>{items.filter(p=>!p.barcode).length} products need a barcode. This saves a new internal code to each selected product or variant; existing codes stay unchanged.</p><Button disabled={busy} onClick={generateMissing}>Generate and save missing codes</Button></div>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={()=>setStep(1)}>Back</Button><Button variant="outline" onClick={()=>{try{labelGeometry(settings);localStorage.setItem(profileKey,JSON.stringify(settings));setError('');}catch(e){setError(e.message||'Could not save printer profile.');}}}>Save printer profile</Button><Button disabled={busy||!items.length} onClick={preview}>{busy?'Preparing…':'Preview labels'}</Button></div>
    </>}
    {step===3&&<><p className="mb-3">{total} labels · {settings.width} × {settings.height} mm. Print at 100% / actual size, with headers and footers off. Select “Save as PDF” in the print dialog to export.</p><iframe title="Sticker print preview" sandbox="" srcDoc={documentHtml} className="w-full h-96 border rounded bg-white"/><div className="flex flex-wrap gap-3 mt-3"><Button variant="outline" onClick={()=>setStep(2)}>Edit design</Button><Button variant="outline" onClick={()=>print(true)}>Print test sticker</Button><Button onClick={()=>print(false)}>Print all / Save PDF</Button></div></>}
  </DialogBody></DialogContent></Dialog>;
}
