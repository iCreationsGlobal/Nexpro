export const DEFAULT_LABEL_SETTINGS = { width: 40, height: 30, layout: 'roll', paper: 'A4', columns: 1, gap: 2, margin: 5, offsetX: 0, offsetY: 0, start: 0, design: 'barcode-price', currency: '₵' };
export const escapeLabelText = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Sticker edge to print area, in mm, on every side. */
export const LABEL_PADDING_MM = 1.5;

/** Longest automatic sticker name: two short lines on a 40 mm sticker. Saved names may be longer (the sticker cuts them at two lines). */
export const LABEL_NAME_MAX_LENGTH = 40;

// Words after which a product name turns into a description ("Black long dress with puff sleeves …").
const DESCRIPTION_STARTS = new Set(['with', 'for', 'featuring', 'that', 'which', 'perfect', 'ideal', 'suitable', 'available', 'great', 'made', 'comes', 'designed', 'has', 'have', 'is', 'are', 'in']);
const FILLER_WORDS = new Set(['a', 'an', 'the', 'and', '&', 'new', 'beautiful', 'elegant', 'quality', 'premium', 'classic', 'stylish', 'fashionable', 'trendy', 'lovely', 'nice', 'cute', 'gorgeous', 'original', 'genuine', 'best', 'super', 'very', 'latest', 'unique', 'exclusive', 'affordable', 'amazing', 'awesome', 'fancy']);
const COLOURS = new Set(['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'brown', 'grey', 'gray', 'gold', 'silver', 'beige', 'cream', 'navy', 'orange', 'maroon', 'wine', 'nude', 'khaki', 'olive', 'teal', 'peach', 'lilac', 'burgundy', 'ivory', 'tan', 'coral', 'mint', 'turquoise', 'multicolour', 'multicolor']);
const LETTER_SIZE = /^(?:xxs|xs|xl|xxl|xxxl|[2-6]xl)$/i;
const SINGLE_LETTER_SIZE = /^[SML]$/; // only as capitals: "Dress M", not the word "m"
const MEASURE = /^\d+(?:\.\d+)?(?:ml|cl|l|ltr|g|kg|oz|cm|mm|pcs|pc|pack)$/i;
// What may follow the word "size": a letter size, or a number such as 12, 42, UK10 or 10-12 ("plus size dress" keeps "dress").
const SIZE_AFTER_WORD = /^(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|free|[a-z]{0,2}\d[\w.-]*)$/i;

const bare = (word) => word.toLowerCase().replace(/^[^a-z0-9&]+|[^a-z0-9&]+$/g, '');
const isSize = (word) => LETTER_SIZE.test(word) || SINGLE_LETTER_SIZE.test(word) || MEASURE.test(word);
const tidySize = (word) => (LETTER_SIZE.test(word) || SINGLE_LETTER_SIZE.test(word) ? word.toUpperCase() : word);

/**
 * A short sticker name from a long product name: the words before the description starts
 * (with/for/commas …) without filler words, then any colour and size from the whole name, sizes last
 * so they are never cut off. "Black long dress with puff sleeves, perfect for parties. Size XL" →
 * "Black long dress XL". Product descriptions are never used.
 * @param {string} name
 * @param {{ suffix?: string, maxLength?: number }} [options] suffix: a variant's name, always kept at the end
 * @returns {string}
 */
export function shortLabelName(name, { suffix = '', maxLength = LABEL_NAME_MAX_LENGTH } = {}) {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim();
  const tail = String(suffix ?? '').replace(/[/|,]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return tail;
  // Clause breaks (punctuation and " - ") become their own tokens so the head phrase ends there.
  // A dot followed by a digit is a decimal ("2.5kg"), not a full stop.
  const tokens = text
    .replace(/\s[-–—]\s/g, ' , ')
    .replace(/\.(?!\d)/g, ' , ')
    .replace(/[,;:|()[\]{}]/g, ' , ')
    .split(' ')
    .filter(Boolean);
  const nextWord = (index) => tokens.slice(index + 1).find(word => word !== ',');

  const sizes = [];
  const sizeKeys = new Set();
  const sizeWords = new Set(); // positions of a "size" word that a size follows ("size XL")
  // A bare number reads as a size only with the word: "Size 12"; letter sizes and measures stand alone.
  const addSize = (word, afterSizeWord = false) => {
    const value = tidySize(word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, '').replace(/\.$/, ''));
    if (!value || sizeKeys.has(value.toLowerCase())) return;
    sizeKeys.add(value.toLowerCase());
    sizes.push(afterSizeWord && /^\d/.test(value) && !MEASURE.test(value) ? `Size ${value}` : value);
  };
  tokens.forEach((word, index) => {
    if (word === ',') return;
    if (bare(word) === 'size') {
      const value = nextWord(index);
      if (value && SIZE_AFTER_WORD.test(value.replace(/[^A-Za-z0-9.-]+$/g, ''))) { addSize(value, true); sizeWords.add(index); }
    } else if (isSize(word)) addSize(word);
  });

  const tailKeys = new Set(tail.toLowerCase().split(' ').filter(Boolean));
  const head = [];
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const word = tokens[index];
    const key = bare(word);
    if (word === ',' || (head.length && DESCRIPTION_STARTS.has(key))) {
      if (head.length) break;
      continue;
    }
    if (!key || FILLER_WORDS.has(key) || sizeWords.has(index) || seen.has(key)) continue;
    if (sizeKeys.has(key) || isSize(word) || tailKeys.has(key)) continue;
    seen.add(key);
    head.push(word.replace(/^[^A-Za-z0-9&]+|[^A-Za-z0-9&]+$/g, ''));
  }
  // A colour mentioned only in the description still matters on a clothes sticker.
  const colours = tokens
    .map(bare)
    .filter((key, index, all) => COLOURS.has(key) && !seen.has(key) && !tailKeys.has(key) && all.indexOf(key) === index);
  const words = [...colours.map(key => key[0].toUpperCase() + key.slice(1)), ...head];
  const end = [...sizes.filter(size => !tailKeys.has(size.toLowerCase())), ...(tail ? [tail] : [])].join(' ');

  const budget = maxLength - (end ? end.length + 1 : 0);
  const kept = [];
  for (const word of words) {
    const next = [...kept, word].join(' ');
    if (kept.length && next.length > budget) break;
    kept.push(word);
  }
  return [kept.join(' '), end].filter(Boolean).join(' ') || text.slice(0, maxLength);
}

/**
 * The sticker name someone saved for a product or variant ('' when none). The product list sends it
 * as labelName; full product and variant records keep it in metadata.labelName.
 * @param {object} item
 */
export function savedLabelName(item) {
  if (!item) return '';
  if (typeof item.savedLabelName === 'string') return item.savedLabelName;
  const value = item.variantId ? item.metadata?.labelName : (item.labelName ?? item.metadata?.labelName);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The automatic sticker name. Variant rows (from BulkProductLabels) carry the parent's name and
 * saved sticker name in baseName / baseLabelName and the variant's own name in variantName.
 * @param {object} item
 */
export function autoLabelName(item) {
  if (item?.variantId) return shortLabelName(item.baseLabelName || item.baseName || item.name, { suffix: item.variantName });
  return shortLabelName(item?.name);
}

/** The name printed on the sticker: what was typed for this print, else the saved name, else the automatic one. */
export function labelTextFor(item) {
  const typed = typeof item?.labelText === 'string' ? item.labelText.trim() : '';
  return typed || savedLabelName(item) || autoLabelName(item);
}

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

/** Width the barcode artwork fills on a sticker, quiet zones included (mm). */
export const barcodeAreaWidth = (settings) => Number(settings.width) - 2 * LABEL_PADDING_MM;

/**
 * Printable sticker sheet. Each label prints its short name (labelName, else name) on up to two lines,
 * then the price, then a barcode that fills the sticker's width and the height left over.
 */
export function labelDocument(labels, settings) {
  const g=labelGeometry(settings), pages=paginateLabels(labels,settings), esc=escapeLabelText;
  const showPrice=settings.design.includes('price'), qr=settings.design.startsWith('qr'), priceOnly=settings.design==='price';
  const height=Number(settings.height);
  const pricePt=priceOnly?Math.min(24,height*.65):qr?Math.min(14,height*.45):Math.min(12,height*.4);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Product labels</title><style>
  @page{size:${g.pageWidth}mm ${g.pageHeight}mm;margin:0}*{box-sizing:border-box}body{margin:0;background:white;color:black;font-family:Arial,sans-serif}.page{width:${g.pageWidth}mm;height:${g.pageHeight}mm;padding:${g.inset}mm;display:grid;grid-template-columns:repeat(${settings.columns},${settings.width}mm);grid-auto-rows:${settings.height}mm;gap:${settings.gap}mm;align-content:start;break-after:page;overflow:hidden}.page:last-child{break-after:auto}.label{width:${settings.width}mm;height:${settings.height}mm;padding:${LABEL_PADDING_MM}mm;display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:.6mm;overflow:hidden;transform:translate(${settings.offsetX}mm,${settings.offsetY}mm)}.details{display:flex;flex-direction:column;align-items:center;width:100%;min-width:0;gap:.3mm}.name{width:100%;font-size:7.5pt;font-weight:700;line-height:1.15;text-align:center;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}.price{font-size:${pricePt}pt;font-weight:800;line-height:1.1;white-space:nowrap}.code{flex:1 1 auto;min-height:0;width:100%;display:flex;align-items:center;justify-content:center}.code img{display:block;width:100%;height:100%}.number{font-size:7pt;line-height:1;text-align:center;letter-spacing:.3pt}.label.qr{flex-direction:row;align-items:center}.qr .code{width:50%;height:100%;flex:none}.qr .code img{object-fit:contain}.qr .details{width:50%}@media screen{body{background:#eee}.page{background:white;margin:10px auto;box-shadow:0 0 2px #888}.label{outline:1px dashed #ddd}}
  </style></head><body>${pages.map(page=>`<section class="page">${page.map(l=>l?`<article class="label ${qr?'qr':''}">${qr&&l.image?`<div class="code"><img src="${esc(l.image)}" alt="QR code"></div>`:''}<div class="details"><div class="name">${esc(l.labelName||l.name)}</div>${showPrice?`<div class="price">${esc(settings.currency)} ${esc(Number(l.sellingPrice).toFixed(2))}</div>`:''}</div>${!qr&&l.image?`<div class="code"><img src="${esc(l.image)}" alt="Barcode"></div><div class="number">${esc(l.barcode)}</div>`:''}</article>`:'<div></div>').join('')}</section>`).join('')}</body></html>`;
}
