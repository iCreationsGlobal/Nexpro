export const DEFAULT_LABEL_SETTINGS = { width: 50, height: 30, layout: 'roll', paper: 'A4', columns: 1, gap: 2, margin: 5, offsetX: 0, offsetY: 0, start: 0, design: 'barcode-price', currency: '₵' };
export const escapeLabelText = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function labelGeometry(s) {
  const width = Number(s.width), height = Number(s.height), gap = Number(s.gap), margin = Number(s.margin), columns = Number(s.columns);
  if (![width,height,gap,margin,columns,Number(s.offsetX),Number(s.offsetY),Number(s.start)].every(Number.isFinite)) throw new Error('Enter valid printer dimensions.');
  if (width < 25 || width > 210 || height < 20 || height > 297 || gap < 0 || gap > 20 || margin < 0 || margin > 30 || !Number.isInteger(columns) || columns < 1 || columns > 8 || Math.abs(s.offsetX)>10 || Math.abs(s.offsetY)>10 || !Number.isInteger(Number(s.start)) || s.start<0) throw new Error('Check sticker dimensions, spacing and alignment.');
  const pageWidth = s.layout === 'roll' ? width * columns + gap * (columns-1) : s.paper === 'Letter' ? 215.9 : 210;
  const pageHeight = s.layout === 'roll' ? height : s.paper === 'Letter' ? 279.4 : 297;
  const inset = s.layout === 'roll' ? 0 : margin;
  const rows = Math.floor((pageHeight-2*inset+gap)/(height+gap));
  if (width*columns+gap*(columns-1) > pageWidth-2*inset || rows<1 || Number(s.start)>=rows*columns) throw new Error('Labels or starting position do not fit the selected paper.');
  return {pageWidth,pageHeight,inset,rows,capacity:rows*columns};
}
export function paginateLabels(labels, settings) {
  const {capacity} = labelGeometry(settings);
  const expanded = Array(Number(settings.start)).fill(null);
  for (const label of labels) {
    if (!Number.isInteger(Number(label.quantity)) || label.quantity<1 || label.quantity>500) throw new Error('Use 1–500 copies per product.');
    for(let i=0;i<label.quantity;i++) expanded.push(label);
  }
  if(expanded.length>2000) throw new Error('Print at most 2,000 labels per batch.');
  const pages=[];
  for(let i=0;i<expanded.length;i+=capacity) pages.push(expanded.slice(i,i+capacity));
  return pages;
}
export function labelDocument(labels, settings) {
  const g=labelGeometry(settings), pages=paginateLabels(labels,settings), esc=escapeLabelText;
  const showPrice=settings.design.includes('price'), qr=settings.design.startsWith('qr');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Product labels</title><style>
  @page{size:${g.pageWidth}mm ${g.pageHeight}mm;margin:0}*{box-sizing:border-box}body{margin:0;background:white;color:black;font-family:Arial,sans-serif}.page{width:${g.pageWidth}mm;height:${g.pageHeight}mm;padding:${g.inset}mm;display:grid;grid-template-columns:repeat(${settings.columns},${settings.width}mm);grid-auto-rows:${settings.height}mm;gap:${settings.gap}mm;align-content:start;break-after:page;overflow:hidden}.page:last-child{break-after:auto}.label{width:${settings.width}mm;height:${settings.height}mm;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;overflow:hidden;transform:translate(${settings.offsetX}mm,${settings.offsetY}mm)}.name{font-size:9pt;line-height:1.1;text-align:center;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.price{font-size:${Math.min(24,Number(settings.height)*.65)}pt;font-weight:800;white-space:nowrap}.code{display:flex;align-items:center;justify-content:center;min-height:0;width:100%;flex:1}.code img{max-width:100%;max-height:100%;object-fit:contain;${qr?'aspect-ratio:1;':''}}.number{font-size:7pt}.label.qr{flex-direction:row}.qr .code{width:50%;height:100%;flex:none}.details{display:flex;flex-direction:column;align-items:center;min-width:0}.qr .details{width:50%}.qr .price{font-size:16pt}@media screen{body{background:#eee}.page{background:white;margin:10px auto;box-shadow:0 0 2px #888}.label{outline:1px dashed #ddd}}
  </style></head><body>${pages.map(page=>`<section class="page">${page.map(l=>l?`<article class="label ${qr?'qr':''}">${qr&&l.image?`<div class="code"><img src="${esc(l.image)}" alt="QR code"></div>`:''}<div class="details"><div class="name">${esc(l.name)}</div>${showPrice?`<div class="price">${esc(settings.currency)} ${esc(Number(l.sellingPrice).toFixed(2))}</div>`:''}</div>${!qr&&l.image?`<div class="code"><img src="${esc(l.image)}" alt="Barcode"></div><div class="number">${esc(l.barcode)}</div>`:''}</article>`:'<div></div>').join('')}</section>`).join('')}</body></html>`;
}
