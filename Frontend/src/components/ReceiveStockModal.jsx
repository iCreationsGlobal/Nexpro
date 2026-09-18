import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import productService from '../services/productService';
import { useHardwareBarcodeScanner } from '../hooks/useHardwareBarcodeScanner';
import { parseProductQRPayload } from '../utils/productQR';
import { showSuccess } from '../utils/toast';

const unwrap = r => r?.data?.product ?? r?.data?.data ?? r?.data ?? r;
const listOf = r => { const data=unwrap(r); return Array.isArray(data)?data:r?.products??[]; };
export default function ReceiveStockModal({open,onClose,onSuccess,initialProduct=null}) {
  const [query,setQuery]=useState(''),[results,setResults]=useState([]),[items,setItems]=useState([]);
  const [variantChoices,setVariantChoices]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[pending,setPending]=useState(0);
  const variantChoice=variantChoices[0];
  function setVariantChoice(choice){setVariantChoices(old=>choice?[...old,choice]:old.slice(1));}
  const inputRef=useRef(null), queue=useRef(Promise.resolve()), generation=useRef(0), saving=useRef(false);
  useEffect(()=>{
    generation.current+=1;
    setQuery('');setResults([]);setItems([]);setVariantChoices([]);setError('');setPending(0);
    if(open&&initialProduct)enqueue(async()=>addProduct(initialProduct));
    return()=>{generation.current+=1;};
  },[open,initialProduct]);

  function addRow(product,variant=null){
    if(product.trackStock===false||variant?.trackStock===false)throw new Error('Stock is not tracked for this item.');
    const key=`${product.id}:${variant?.id||''}`;
    setItems(old=>old.some(row=>row.key===key)?old.map(row=>row.key===key?{...row,quantity:Number(row.quantity||0)+1}:row):[...old,{key,productId:product.id,variantId:variant?.id,name:variant?`${product.name} — ${variant.name}`:product.name,quantity:1}]);
    setQuery('');setResults([]);inputRef.current?.focus();
  }
  async function addProduct(product,token=generation.current){
    if(!product?.id)throw new Error('No matching product found.');
    if(product.selectedVariant?.id){addRow(product,product.selectedVariant);return;}
    if(product.hasVariants||product.variants?.length){
      const variants=product.variants?.length?product.variants:listOf(await productService.getProductVariants(product.id));
      if(token!==generation.current)return;
      const active=variants.filter(v=>v.isActive!==false);
      if(active.length===1)addRow(product,active[0]);
      else if(active.length)setVariantChoice({product,variants:active});
      else throw new Error('This product has no active variants.');
      return;
    }
    addRow(product);
  }
  function enqueue(work){
    if(saving.current)return;
    const token=generation.current;
    setPending(n=>n+1);
    queue.current=queue.current.then(async()=>{
      if(token!==generation.current)return;
      try{await work(token);}catch(e){if(token===generation.current)setError(e.message||'Could not find product.');}
      finally{if(token===generation.current)setPending(n=>Math.max(0,n-1));}
    });
  }
  const scanProducts=useRef(new Map());
  useEffect(()=>{scanProducts.current.clear();},[open,initialProduct]);
  const itemsRef=useRef(items);
  itemsRef.current=items;
  const scanEdit=useRef(null), lastKey=useRef(0);
  useEffect(()=>{
    if(!open)return;
    const capture=event=>{
      if(event.key.length!==1)return;
      const now=Date.now();
      if(now-lastKey.current>50){
        const key=event.target?.dataset?.receivingKey;
        const row=itemsRef.current.find(item=>item.key===key);
        scanEdit.current=row?{key,quantity:row.quantity}:null;
      }
      lastKey.current=now;
    };
    document.addEventListener('keydown',capture,true);
    return()=>document.removeEventListener('keydown',capture,true);
  },[open]);
  function scan(code, hardware=false){
    if(hardware&&scanEdit.current){
      const original=scanEdit.current;
      setItems(old=>old.map(row=>row.key===original.key?{...row,quantity:original.quantity}:row));
      scanEdit.current=null;
    }
    enqueue(async token=>{
      let product=scanProducts.current.get(code);
      if(product){
        if(token===generation.current)await addProduct(product,token);
        return;
      }
      if(code.startsWith('{')){
        const parsed=parseProductQRPayload(code);
        if(!parsed.success)throw new Error(parsed.error);
        product=await productService.resolveProductFromQRPayload(parsed.data);
      }else product=unwrap(await productService.getProductByBarcode(code));
      if(token===generation.current){
        if(product?.id)scanProducts.current.set(code,product);
        await addProduct(product,token);
      }
    });
  }
  useHardwareBarcodeScanner(code=>scan(code,true),{enabled:open&&!busy});
  useEffect(()=>{
    if(!open||!query.trim()){setResults([]);setSearching(false);return;}
    let active=true;
    const timer=setTimeout(async()=>{
      setSearching(true);
      try{const response=await productService.getProducts({search:query.trim(),limit:20,isActive:true});if(active)setResults(listOf(response));}
      catch(e){if(active)setError(e.message||'Search failed.');}
      finally{if(active)setSearching(false);}
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[query,open]);
  async function receiveAll(){
    if(saving.current||pending||!items.length)return;
    if(items.some(row=>!Number.isFinite(Number(row.quantity))||Number(row.quantity)<=0)){setError('Enter a quantity greater than zero for every item.');return;}
    saving.current=true;setBusy(true);setError('');scanProducts.current.clear();
    let completed=0;
    try{
      for(const row of items){
        await productService.adjustStock(row.productId,Number(row.quantity),'delta','Receive stock',{type:'receive',...(row.variantId?{variantId:row.variantId}:{})});
        completed++;
        setItems(old=>old.filter(item=>item.key!==row.key));
      }
      showSuccess(`Stock received for ${completed} items.`);
    }catch(e){setError(`${completed} items saved. Remaining items are still listed. Check stock before retrying if the connection was interrupted. ${e.message||''}`);}
    finally{saving.current=false;setBusy(false);if(completed)onSuccess?.();inputRef.current?.focus();}
  }
  return <Dialog open={open} onOpenChange={value=>{if(!value&&!busy)onClose();}}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Receive stock</DialogTitle></DialogHeader><DialogBody>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Scan or search to add items. Set quantities beside each product, then receive the batch.</p>
      <div className="flex gap-2"><Input ref={inputRef} autoFocus aria-label="Scan or search products" placeholder="Scan barcode or search name / SKU…" value={query} disabled={busy} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(query.trim())scan(query.trim());}}}/><Button variant="outline" disabled={busy||!query.trim()} onClick={()=>scan(query.trim())}>Look up barcode</Button></div>
      {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
      {(pending>0||searching)&&<p role="status" className="text-sm">Finding products…</p>}
      {results.length>0&&<div className="max-h-40 overflow-auto rounded border">{results.map(product=><button type="button" key={product.id} className="block w-full p-2 text-left hover:bg-muted" disabled={busy} onClick={()=>enqueue(token=>addProduct(product,token))}>{product.name}{product.barcode?` · ${product.barcode}`:''}</button>)}</div>}
      {query&&!searching&&!pending&&!results.length&&<p className="text-sm text-muted-foreground">No search results. Enter the full barcode to look it up.</p>}
      {variantChoice&&<div className="rounded border p-3"><p>Choose a variant for {variantChoice.product.name}</p><div className="flex flex-wrap gap-2 mt-2">{variantChoice.variants.map(variant=><Button variant="outline" key={variant.id} disabled={busy} onClick={()=>{try{addRow(variantChoice.product,variant);setVariantChoice(null);}catch(e){setError(e.message);}}}>{variant.name}</Button>)}<Button variant="ghost" onClick={()=>setVariantChoice(null)}>Cancel variant</Button></div></div>}
      <div className="max-h-80 overflow-auto rounded border"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">Product</th><th className="p-3 text-left">Quantity received</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map(row=><tr key={row.key} className="border-t"><td className="p-3">{row.name}</td><td className="p-3"><Input data-receiving-key={row.key} type="number" min="0.001" step="any" aria-label={`Quantity received for ${row.name}`} value={row.quantity} disabled={busy} onChange={e=>{const value=e.target.value;setItems(old=>old.map(item=>item.key===row.key?{...item,quantity:value}:item));}}/></td><td className="p-2"><Button variant="ghost" disabled={busy} onClick={()=>setItems(old=>old.filter(item=>item.key!==row.key))}>Remove</Button></td></tr>)}</tbody></table>{!items.length&&<p className="p-5 text-center text-muted-foreground">Scan or select your first product.</p>}</div>
      <div className="flex items-center justify-between gap-2"><p className="text-sm">{items.length} items · Repeated scans add 1.</p><Button disabled={busy||pending>0||!!variantChoice||!items.length} onClick={receiveAll}>{busy?'Receiving…':'Receive all stock'}</Button></div>
    </div>
  </DialogBody></DialogContent></Dialog>;
}
