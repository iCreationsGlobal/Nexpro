import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import productService from '../services/productService';
import { DEFAULT_LABEL_SETTINGS, labelDocument, labelGeometry } from '../utils/productLabels';

const rowsOf = r => Array.isArray(r?.data) ? r.data : Array.isArray(r?.products) ? r.products : [];
const fieldClass = 'border rounded-md bg-background p-2 w-full';
export default function BulkProductLabels({ onClose, shopId, profileKey, onSaved }) {
  const [step,setStep]=useState(1), [rows,setRows]=useState([]), [page,setPage]=useState(1), [hasNext,setHasNext]=useState(false);
  const [search,setSearch]=useState(''), [selected,setSelected]=useState({}), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [revision,setRevision]=useState(0), [documentHtml,setDocumentHtml]=useState(''), [prepared,setPrepared]=useState([]);
  const [settings,setSettings]=useState(()=>{try {return {...DEFAULT_LABEL_SETTINGS,...JSON.parse(localStorage.getItem(profileKey)||'{}')};}catch{return {...DEFAULT_LABEL_SETTINGS};}});
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(async()=>{
      setBusy(true);setError('');
      try {
        const result=await productService.getProducts({page,limit:25,search,shopId,isActive:true});
        if(active){const list=rowsOf(result);setRows(list);setHasNext(result?.pagination?.total ? page*25<result.pagination.total : list.length===25);}
      }catch(e){if(active){setRows([]);setError(e.message||'Could not load products.');}}
      finally{if(active)setBusy(false);}
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[page,search,shopId,revision]);
  const items=Object.values(selected), total=items.reduce((n,p)=>n+Number(p.quantity||0),0);
  const keyOf=p=>`${p.variantId?'variant':'product'}:${p.variantId||p.id}`;
  const toggle=p=>setSelected(old=>{const next={...old}, key=keyOf(p);if(next[key])delete next[key];else next[key]={...p,quantity:1};return next;});
  const setSetting=(key,value)=>{setSettings(s=>({...s,[key]:value}));setDocumentHtml('');};
  async function variants(product){
    setBusy(true);setError('');
    try {
      const result=await productService.getProductVariants(product.id);
      const variants=Array.isArray(result)?result:rowsOf(result);
      setRows(old=>{const existing=new Set(old.map(keyOf));return old.flatMap(p=>p.id===product.id&&!p.variantId?[p,...variants.filter(v=>v.isActive!==false&&!existing.has(`variant:${v.id}`)).map(v=>({...v,id:product.id,variantId:v.id,name:`${product.name} — ${v.name}`,sellingPrice:v.sellingPrice??product.sellingPrice,hasVariants:false}))]:[p]);});
      if(!variants.length)setError('No variants found for this product.');
    }catch(e){setError(e.message||'Could not load variants.');}finally{setBusy(false);}
  }
  async function generateMissing(){
    setBusy(true);setError('');
    try {
      for(const item of items.filter(p=>!p.barcode)){
        const bytes=crypto.getRandomValues(new Uint32Array(2));
        const freshResult = item.variantId ? await productService.getProductVariants(item.id) : await productService.getProductById(item.id);
        const fresh = item.variantId ? rowsOf(freshResult).find(v=>v.id===item.variantId) : freshResult?.data;
        if (!fresh?.id) throw new Error(`Could not verify ${item.name}. Refresh the catalog.`);
        const barcode=fresh.barcode || `20${String(bytes[0]%100000).padStart(5,'0')}${String(bytes[1]%100000).padStart(5,'0')}`;
        if (!fresh.barcode) {
          const saved = item.variantId ? await productService.updateProductVariant(item.variantId,{barcode}) : await productService.updateProduct(item.id,{barcode});
          if (saved?.data?.barcode !== barcode) throw new Error(`Barcode was not saved for ${item.name}. Check product-edit permissions.`);
        }
        setRows(old=>old.map(p=>keyOf(p)===keyOf(item)?{...p,barcode}:p));
        setSelected(old=>({...old,[keyOf(item)]:{...old[keyOf(item)],barcode}}));
      }
    }catch(e){setError(`Some codes could not be saved. Successfully saved codes are retained. ${e.message||''}`);}finally{setBusy(false);onSaved?.();}
  }
  async function preview(){
    setBusy(true);setError('');
    try {
      labelGeometry(settings);
      if(!items.length)throw new Error('Select at least one product.');
      const code=settings.design!=='price';
      if(code&&items.some(p=>!p.barcode))throw new Error('Generate and save missing barcodes before continuing.');
      const labels=[];
      for(const item of items){
        if(!Number.isFinite(Number(item.sellingPrice))||Number(item.sellingPrice)<0)throw new Error(`Check the selling price for ${item.name}.`);
        let image;
        if(settings.design.startsWith('qr')){
          // No parent id: barcode lookup preserves the selected variant in POS.
          const payload=JSON.stringify({name:item.name.slice(0,60),barcode:item.barcode});
          const modules=QRCode.create(payload,{errorCorrectionLevel:'M'}).modules.size+8;
          if(Math.min((Number(settings.width)-4)/2,Number(settings.height)-4)/modules<0.25) throw new Error(`The QR code for ${item.name} needs a larger sticker.`);
          image=await QRCode.toDataURL(payload,{width:400,margin:4,errorCorrectionLevel:'M'});
        }else if(code){
          const canvas=document.createElement('canvas');
          JsBarcode(canvas,item.barcode,{format:'CODE128',width:2,height:64,margin:20,displayValue:false,lineColor:'#000',background:'#fff'});
          if((Number(settings.width)-4)/canvas.width*2<0.25)throw new Error(`The barcode for ${item.name} needs a wider sticker. Increase the width or choose QR.`);
          image=canvas.toDataURL('image/png');
        }
        labels.push({...item,image});
      }
      setDocumentHtml(labelDocument(labels,settings));setPrepared(labels);setStep(3);
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
      <label className="block">Search products<input className={fieldClass} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Name, barcode or product code" /></label>
      <div className="flex gap-3 my-3"><Button variant="outline" disabled={busy} onClick={()=>setSelected(old=>({...old,...Object.fromEntries(rows.filter(p=>!p.hasVariants).map(p=>[keyOf(p),old[keyOf(p)]||{...p,quantity:1}]))}))}>Select this page</Button><Button variant="outline" onClick={()=>setSelected({})}>Clear selection</Button><Button variant="outline" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh</Button></div>
      {busy&&<p role="status">Loading…</p>}
      <div className="max-h-72 overflow-auto border rounded"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Product</th><th>Price</th><th>Copies</th></tr></thead><tbody>{rows.map(p=><tr key={keyOf(p)} className="border-t"><td className="p-2"><label className="flex gap-2 items-center"><input type="checkbox" disabled={!!p.hasVariants||busy} checked={!!selected[keyOf(p)]} onChange={()=>toggle(p)}/>{p.name}</label>{p.hasVariants&&<button className="underline ml-6" disabled={busy} onClick={()=>variants(p)}>Choose variants</button>}</td><td className="p-2">{settings.currency} {Number(p.sellingPrice||0).toFixed(2)}</td><td className="p-2"><input aria-label={`Copies of ${p.name}`} type="number" min="1" max="500" className={`${fieldClass} max-w-20`} disabled={!selected[keyOf(p)]} value={selected[keyOf(p)]?.quantity??1} onChange={e=>{const quantity=e.target.value;setSelected(old=>({...old,[keyOf(p)]:{...old[keyOf(p)],quantity}}));}}/></td></tr>)}</tbody></table>{!busy&&!rows.length&&<p className="p-4">No products found.</p>}</div>
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
      <p className="text-sm my-3">Default: generic thermal printer, 50 × 30 mm. Match the loaded stickers. Long product names are shortened on the label. Check the preview and print one test sticker first.</p>
      <details className="my-3"><summary>Review {items.length} selected products / quantities</summary>{items.map(p=><div key={keyOf(p)} className="flex items-center gap-3 my-2"><span className="flex-1">{p.name}</span><input type="number" min="1" max="500" aria-label={`Copies of ${p.name}`} className={`${fieldClass} max-w-20`} value={p.quantity} onChange={e=>{const quantity=e.target.value;setSelected(old=>({...old,[keyOf(p)]:{...p,quantity}}));}}/><button className="underline" onClick={()=>toggle(p)}>Remove</button></div>)}</details>
      {settings.design!=='price'&&items.some(p=>!p.barcode)&&<div className="p-3 border rounded my-3"><p>{items.filter(p=>!p.barcode).length} products need a barcode. This saves a new internal code to each selected product or variant; existing codes stay unchanged.</p><Button disabled={busy} onClick={generateMissing}>Generate and save missing codes</Button></div>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={()=>setStep(1)}>Back</Button><Button variant="outline" onClick={()=>{try{labelGeometry(settings);localStorage.setItem(profileKey,JSON.stringify(settings));setError('');}catch(e){setError(e.message||'Could not save printer profile.');}}}>Save printer profile</Button><Button disabled={busy||!items.length} onClick={preview}>{busy?'Preparing…':'Preview labels'}</Button></div>
    </>}
    {step===3&&<><p className="mb-3">{total} labels · {settings.width} × {settings.height} mm. Print at 100% / actual size, with headers and footers off. Select “Save as PDF” in the print dialog to export.</p><iframe title="Sticker print preview" sandbox="" srcDoc={documentHtml} className="w-full h-96 border rounded bg-white"/><div className="flex flex-wrap gap-3 mt-3"><Button variant="outline" onClick={()=>setStep(2)}>Edit design</Button><Button variant="outline" onClick={()=>print(true)}>Print test sticker</Button><Button onClick={()=>print(false)}>Print all / Save PDF</Button></div></>}
  </DialogBody></DialogContent></Dialog>;
}
