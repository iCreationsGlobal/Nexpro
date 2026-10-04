#!/usr/bin/env node
/**
 * Prepare Oskobuys clothing stock from the Stock Master sheet.
 *
 * Products that share a cleaned description and category become one parent.
 * Distinct real size + color combinations become variants. A single combination
 * stays a simple product (hasVariants false). Opening quantities follow the app:
 * simple products record shop stock on the product; variant products record shop
 * stock on each variant and the parent quantityOnHand is the sum of variant
 * quantities (see createProduct / createProductVariant and applyStockChange).
 *
 * Safety:
 * - Dry run by default. Dry run does not load the database and does not write.
 * - Inserts only with --execute --confirm-import --tenant-slug <slug>
 * - Do not pass those flags on a machine that must not write production data.
 *
 * Usage (from Backend/):
 *   node scripts/import-oskobuys-clothing.js
 *   node scripts/import-oskobuys-clothing.js --source "/path/to/workbook.xlsx" --out tmp/oskobuys-clothing-import.json
 *   node scripts/import-oskobuys-clothing.js --execute --confirm-import --tenant-slug oskobuys [--shop-id <uuid>]
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE = '/Users/us/Downloads/Clothing_Shop_Stock_Workbook 2.xlsx';
const DEFAULT_OUT = path.resolve(__dirname, '..', 'tmp', 'oskobuys-clothing-import.json');
const SHEET_NAME = 'Stock Master';
const IMPORT_SOURCE = 'oskobuys-clothing-workbook';

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const getArgValue = (flag, fallback = null) => {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx === argv.length - 1) return fallback;
  return argv[idx + 1];
};

const isExecute = hasFlag('--execute');
const shouldConfirm = hasFlag('--confirm-import');
const tenantSlug = (getArgValue('--tenant-slug', '') || '').trim();
const shopIdArg = (getArgValue('--shop-id', '') || '').trim() || null;
const sourcePath = path.resolve(getArgValue('--source', DEFAULT_SOURCE));
const outPath = path.resolve(getArgValue('--out', DEFAULT_OUT));

const USAGE = `
Usage:
  node scripts/import-oskobuys-clothing.js [--source <workbook.xlsx>] [--out <json>]
  node scripts/import-oskobuys-clothing.js --execute --confirm-import --tenant-slug <slug> [--shop-id <uuid>]

Dry run is the default. It writes a review JSON and does not connect to a database.
`;

const SIZE_WORD = '(?:XXS|XS|S|M|L|XL|XXL|XXXL|[1-5]XL)';
const LETTER_SIZE = new RegExp(`^${SIZE_WORD}$`, 'i');
const LETTER_COMBO = new RegExp(`^${SIZE_WORD}(?:\\s*[/&,]\\s*${SIZE_WORD})+$`, 'i');
const LETTER_WITH_G = new RegExp(`^${SIZE_WORD}\\/G$`, 'i');
const NUMBERED_LETTER = new RegExp(`^(?:[1-5]XL|XXL)\\(\\d+\\)$`, 'i');
const NUMBER_SLASH_LETTER = new RegExp(`^\\d+(?:\\.\\d+)?\\/(?:${SIZE_WORD}|G)$`, 'i');
const THREE_QUARTER = /^\d\/\dXL$/i;
const AGE_SIZE = /^\d+(?:\s*-\s*\d+)?\s*(?:YRS?|YEARS?|MONTHS?|YS)$/i;
const AGE_SIZE_GLUED = /^\d+(?:-\d+)?(?:YRS?|YEARS?|MONTHS?)$/i;
const WAIST = /^W\s*\d+\s*L\s*\d+$/i;
const WAIST_STAR = /^\d+\s*\*\s*\d+$/;
const UK_USA = /^(?:(?:UK|USA)\s*-\s*\d+\s*,\s*)*(?:UK|USA)\s*-\s*\d+$/i;
const TAILOR = /^(?:[JT]\s*\d+\s*){1,4}$/i;
const TAILOR_STUB = /^T\s*J$/i;
const DUAL_NUMBER = /^\d+(?:\.\d+)?\s*[/,&-]\s*\d+(?:\.\d+)?$/;
const PLAIN_NUMBER = /^\d+(?:\.\d+)?$/;

const BASE_COLORS = new Set(`
  BLACK WHITE BLUE RED GREEN BROWN PINK CREAM ASH WINE GREY GRAY ORANGE PEACH
  PURPLE YELLOW GOLD GOLDEN BURGUNDY OLIVE NAVY VIOLET SILVER BEIGE LILAC
  COFFEE LEMON TEAL MAROON KHAKI TAN NUDE MAGENTA CORAL MUSTARD IVORY CHARCOAL
  PINKISH BROWNIE OFFWHITE CAMEL CHOCOLATE DENIM TURQUOISE INDIGO AQUA LIME
  MINT ROSE RUST TAUPE CEMENT SAGE
`.split(/\s+/).filter(Boolean));

const MODIFIERS = new Set(`
  LIGHT DARK DEEP BURNT DUSTY SKY SEA SOLDIER TAIL PLANE PLAIN OFF CURRY
`.split(/\s+/).filter(Boolean));

const PATTERNS = new Set(`
  STRIPES STRIPE STRIPPED STRIP CHECKED CHECK CAMOUFLAGE COLOURFUL COLORFUL
  MIXED RAINBOW COLOURS COLORS COLOUR COLOR
`.split(/\s+/).filter(Boolean));

const FILLER = new Set(`
  AND WITH THE A OF ON HAIR DESIGN BLOCK ROPES BEADS SHIMMER SHIMMERS FLOWER
  FLOWERY CIRCLE WOODEN PATTERN PATTEN PATTERRN
`.split(/\s+/).filter(Boolean));

const COLOR_ABBR = {
  BLACK: 'BLK',
  WHITE: 'WHT',
  BLUE: 'BLU',
  RED: 'RED',
  GREEN: 'GRN',
  BROWN: 'BRN',
  PINK: 'PNK',
  CREAM: 'CRM',
  ASH: 'ASH',
  WINE: 'WIN',
  GREY: 'GRY',
  GRAY: 'GRY',
  ORANGE: 'ORG',
  PEACH: 'PCH',
  PURPLE: 'PUR',
  YELLOW: 'YEL',
  GOLD: 'GLD',
  GOLDEN: 'GLD',
  BURGUNDY: 'BUR',
  OLIVE: 'OLV',
  NAVY: 'NVY',
  VIOLET: 'VIO',
  SILVER: 'SLV',
  BEIGE: 'BEI',
  LILAC: 'LIL',
  COFFEE: 'COF',
  CAMOUFLAGE: 'CAM',
  MUSTARD: 'MUS',
  CEMENT: 'CEM',
  OFFWHITE: 'OFW',
};

const NON_CLOTHING_TEXT = /PERFUME|BODY WASH|BODY LOTION|SHOWER GEL|\bPENCIL|\bERASER|\bSHARPENER|\bBOWL\b|COLANDER|STANLEY|LUNCH BOX|CUTTLERY|WATER BOTTLE|\bPOLISH\b|\bSERUM\b/;
const NON_CLOTHING_CATEGORY = /BOWL|COLANDER|STANLEY|PENCIL|ERASER|SHARPENER|PERFUME/;

function fail(message) {
  console.error(`\nERROR: ${message}`);
  console.error(USAGE);
  process.exit(1);
}

function printSummary(label, value) {
  console.log(`${String(label).padEnd(42)} ${value}`);
}

/**
 * Trim and collapse internal whitespace.
 * @param {unknown} value
 * @returns {string}
 */
function collapse(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/**
 * Unwrap an ExcelJS cell value, including cached formula results.
 * @param {unknown} value
 * @returns {unknown}
 */
function unwrap(value) {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return null;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'error') && value.error) return String(value.error);
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return unwrap(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (typeof value.text === 'string' && !value.hyperlink) return value.text;
    if (typeof value.formula === 'string' || typeof value.sharedFormula === 'string') return null;
  }
  return null;
}

/**
 * @param {number} value
 * @returns {number}
 */
function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Parse a selling price. Rejects blanks, spaces, Excel errors, and tokens like 18O.
 * @param {unknown} value
 * @returns {number|null}
 */
function parseSelling(value) {
  const unwrapped = unwrap(value);
  if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) return money(unwrapped);
  if (typeof unwrapped !== 'string') return null;
  const text = unwrapped.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  return money(text);
}

/**
 * Parse a sheet cost. Does not recompute ROUND(100/135 × selling).
 * @param {unknown} value
 * @returns {number|null}
 */
function parseCost(value) {
  return parseSelling(value);
}

/**
 * Blank → 0. SET → 1. Prefer the number after "="; otherwise one simple operation.
 * @param {unknown} value
 * @returns {number}
 */
function parseQty(value) {
  const unwrapped = unwrap(value);
  if (unwrapped == null || unwrapped === '') return 0;
  if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) return unwrapped;
  const text = String(unwrapped).trim();
  if (!text) return 0;
  if (/^set$/i.test(text)) return 1;
  const afterEquals = text.match(/=\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (afterEquals) return Number(afterEquals[1]);
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const arithmetic = text.match(/^(\d+(?:\.\d+)?)\s*([*x/+-])\s*(\d+(?:\.\d+)?)$/i);
  if (!arithmetic) {
    throw new Error(`Unparseable quantity: ${text}`);
  }
  const left = Number(arithmetic[1]);
  const right = Number(arithmetic[3]);
  const operator = arithmetic[2].toLowerCase();
  if (operator === '*' || operator === 'x') return left * right;
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '/' && right !== 0) return left / right;
  throw new Error(`Unparseable quantity: ${text}`);
}

/**
 * Map sheet categories. TIE&DIE → TIE&DYE. Junk "d" becomes uncategorized.
 * @param {unknown} value
 * @returns {string}
 */
function cleanCategory(value) {
  let text = collapse(value).toUpperCase();
  text = text.replace(/([A-Z])'\s+([A-Z])/g, "$1'$2");
  if (text === 'D') return '';
  if (text === 'TIE&DIE') return 'TIE&DYE';
  return text;
}

/**
 * Repair glued words and known typos before size/color classification.
 * @param {unknown} value
 * @returns {string}
 */
function prepareAttribute(value) {
  let text = collapse(value).toUpperCase();
  if (!text) return '';
  const replacements = [
    [/PURPPLE/g, 'PURPLE'],
    [/BURGANDY/g, 'BURGUNDY'],
    [/CAMOLUFLUGE/g, 'CAMOUFLAGE'],
    [/CAMOFLAGE/g, 'CAMOUFLAGE'],
    [/WHITHE/g, 'WHITE'],
    [/BLACCK/g, 'BLACK'],
    [/ORRANGE/g, 'ORANGE'],
    [/SIVER/g, 'SILVER'],
    [/VOILET/g, 'VIOLET'],
    [/ANDYELLOW/g, 'AND YELLOW'],
    [/ANDPURPLE/g, 'AND PURPLE'],
    [/REDAND/g, 'RED AND'],
    [/BLACKAND/g, 'BLACK AND'],
    [/ASHAND/g, 'ASH AND'],
    [/LIGHTBLUE/g, 'LIGHT BLUE'],
    [/WHITE1/g, 'WHITE'],
    [/PEACHES/g, 'PEACH'],
    [/\bBLEU\b/g, 'BLUE'],
    [/\bWHIT\b/g, 'WHITE'],
    [/\bHITE\b/g, 'WHITE'],
  ];
  replacements.forEach(([pattern, next]) => {
    text = text.replace(pattern, next);
  });
  return collapse(text);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isBodyMeasurement(text) {
  const hits = text.match(/(?:DL|SL|FL|TL|[CWHSL])\s*-?\s*\d+(?:\.\d+)?/g);
  return Boolean(hits && hits.length >= 2);
}

/**
 * @param {string} text Prepared uppercase attribute text.
 * @returns {boolean}
 */
function isSize(text) {
  if (!text) return false;
  if (LETTER_SIZE.test(text) || LETTER_COMBO.test(text) || LETTER_WITH_G.test(text)) return true;
  if (NUMBERED_LETTER.test(text) || NUMBER_SLASH_LETTER.test(text) || THREE_QUARTER.test(text)) return true;
  if (AGE_SIZE.test(text) || AGE_SIZE_GLUED.test(text)) return true;
  if (WAIST.test(text) || WAIST_STAR.test(text) || UK_USA.test(text)) return true;
  if (TAILOR.test(text) || TAILOR_STUB.test(text)) return true;
  if (DUAL_NUMBER.test(text)) return true;
  if (isBodyMeasurement(text)) return true;
  if (PLAIN_NUMBER.test(text)) {
    const number = Number(text);
    return number >= 1 && number <= 60;
  }
  if (/^(?:XXS|XS|S|M|L|XL|XXL|XXXL|[1-5]XL|OSFA|PLUS|MEDIUM|SMALL|LARGE|X)$/.test(text)) return true;
  return false;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function colorTokens(text) {
  const stripped = text.replace(/\s+(SHRIT|SHIRT|DRESS|TOP|SHOE|SHOES)$/, '').trim();
  return stripped
    .replace(/&/g, ' ')
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .filter((token) => !FILLER.has(token));
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isColor(text) {
  if (!text || isSize(text)) return false;
  const tokens = colorTokens(text);
  if (!tokens.length) return false;
  if (!tokens.every((token) => BASE_COLORS.has(token) || MODIFIERS.has(token) || PATTERNS.has(token))) {
    return false;
  }
  return tokens.some((token) => BASE_COLORS.has(token) || PATTERNS.has(token));
}

/**
 * Canonical color used for variant identity. Drops joiners so BLUE-BLACK and BLUE BLACK match.
 * @param {string} text
 * @returns {string}
 */
function colorKey(text) {
  const tokens = colorTokens(prepareAttribute(text));
  return tokens.join(' ');
}

/**
 * @param {string} text
 * @returns {string}
 */
function sizeKey(text) {
  return collapse(text).toUpperCase().replace(/\s+/g, '');
}

/**
 * Split a cell that glues a color to a tailor size, e.g. DEEP BLUET30 T34.
 * @param {string} text
 * @returns {{ colorText: string, sizeText: string }|null}
 */
function splitMixed(text) {
  const spaced = text.replace(/([A-Z])([TJ])(\d)/g, '$1 $2$3');
  const match = spaced.match(/^(.*?)\s+((?:[TJ]\s*\d+\s*)+)$/);
  if (!match) return null;
  const colorText = collapse(match[1]);
  const sizeText = collapse(match[2]);
  if (isColor(colorText) && isSize(sizeText)) return { colorText, sizeText };
  return null;
}

/**
 * @param {unknown} raw
 * @returns {{ kind: string, value: string }}
 */
function classify(raw) {
  const prepared = prepareAttribute(raw);
  if (!prepared) return { kind: 'empty', value: '' };
  if (isSize(prepared)) return { kind: 'size', value: collapse(prepared) };
  if (isColor(prepared)) return { kind: 'color', value: colorKey(prepared) };
  const mixed = splitMixed(prepared);
  if (mixed) return { kind: 'mixed', value: prepared, colorText: mixed.colorText, sizeText: mixed.sizeText };
  return { kind: 'other', value: prepared };
}

/**
 * Put size and color in the right fields before variants are created.
 * @param {unknown} rawSize
 * @param {unknown} rawColor
 * @returns {{ size: { kind: string, value: string }, color: { kind: string, value: string }, action: string }}
 */
function resolveAttributes(rawSize, rawColor) {
  let size = classify(rawSize);
  let color = classify(rawColor);
  let action = 'unchanged';

  if (size.kind === 'mixed' && (color.kind === 'empty' || color.kind === 'size')) {
    const mixedSize = color.kind === 'size' ? color.value : size.sizeText;
    return {
      size: { kind: 'size', value: collapse(mixedSize) },
      color: { kind: 'color', value: colorKey(size.colorText) },
      action: 'split-size-cell',
    };
  }
  if (color.kind === 'mixed' && (size.kind === 'empty' || size.kind === 'color')) {
    const mixedColor = size.kind === 'color' ? size.value : colorKey(color.colorText);
    return {
      size: { kind: 'size', value: collapse(color.sizeText) },
      color: { kind: 'color', value: mixedColor },
      action: 'split-color-cell',
    };
  }

  if (size.kind === 'color' && color.kind === 'size') {
    const swapped = size;
    size = color;
    color = swapped;
    action = 'swap';
  } else if (size.kind === 'color' && color.kind === 'empty') {
    color = { kind: 'color', value: size.value };
    size = { kind: 'empty', value: '' };
    action = 'move-size-to-color';
  } else if (size.kind === 'empty' && color.kind === 'size') {
    size = { kind: 'size', value: color.value };
    color = { kind: 'empty', value: '' };
    action = 'move-color-to-size';
  }

  return {
    size: { kind: size.kind === 'size' ? 'size' : size.kind, value: size.kind === 'size' ? size.value : size.value },
    color: { kind: color.kind, value: color.kind === 'color' ? color.value : color.value },
    action,
  };
}

/**
 * @param {string} description
 * @param {string} category
 * @param {string} itemCode
 * @returns {boolean}
 */
function isNonClothing(description, category, itemCode) {
  if (NON_CLOTHING_CATEGORY.test(category)) return true;
  return NON_CLOTHING_TEXT.test(`${description} ${itemCode}`);
}

/**
 * @param {{ kind: string }} size
 * @param {{ kind: string }} color
 * @returns {boolean}
 */
function attributesAreReal(size, color) {
  const sizeOk = size.kind === 'empty' || size.kind === 'size';
  const colorOk = color.kind === 'empty' || color.kind === 'color';
  return sizeOk && colorOk;
}

/**
 * @param {string} size
 * @param {string} color
 * @returns {string}
 */
function variantToken(size, color) {
  const sizeToken = size ? sizeKey(size).replace(/\./g, 'P').replace(/[^A-Z0-9]+/g, '').slice(0, 12) : '';
  const colorToken = color
    ? colorKey(color)
      .split(' ')
      .filter(Boolean)
      .map((word) => COLOR_ABBR[word] || word.slice(0, 3))
      .join('')
      .slice(0, 16)
    : '';
  return [sizeToken, colorToken].filter(Boolean).join('-') || 'STD';
}

/**
 * @param {string} size
 * @param {string} color
 * @returns {string}
 */
function variantName(size, color) {
  if (size && color) return `${size} / ${color}`;
  return size || color || 'Standard';
}

/**
 * @param {object[]} lines Source lines that share one size/color.
 * @returns {{ costPrice: number, sellingPrice: number, priceSource: string, priceConflict: boolean }}
 */
function choosePrice(lines) {
  const sheetLines = lines.filter((line) => line.priceSource === 'sheet');
  const chosen = (sheetLines[0] || lines[0]);
  const prices = new Set(lines.map((line) => `${line.sellingPrice}|${line.costPrice}`));
  return {
    costPrice: chosen.costPrice,
    sellingPrice: chosen.sellingPrice,
    priceSource: chosen.priceSource,
    priceConflict: prices.size > 1,
  };
}

/**
 * Parent list price follows the variant with the most stock.
 * Point of sale uses each variant's own price.
 * @param {object[]} variants
 * @returns {{ costPrice: number, sellingPrice: number }}
 */
function parentPrice(variants) {
  const ranked = [...variants].sort((a, b) => {
    if (b.quantityOnHand !== a.quantityOnHand) return b.quantityOnHand - a.quantityOnHand;
    return a.sourceRows[0] - b.sourceRows[0];
  });
  return {
    costPrice: ranked[0].costPrice,
    sellingPrice: ranked[0].sellingPrice,
  };
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

/**
 * @param {object[]} lines
 * @param {boolean} refused
 * @param {string|null} refusalReason
 * @returns {object}
 */
function buildSimpleProduct(lines, refused, refusalReason) {
  const first = lines[0];
  const price = choosePrice(lines);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const size = first.resolved.size.kind === 'size' ? first.resolved.size.value : '';
  const color = first.resolved.color.kind === 'color' ? first.resolved.color.value : '';
  return {
    hasVariants: false,
    name: first.description,
    categoryName: first.category || null,
    brand: unique(lines.map((line) => line.brand)).length === 1 ? unique(lines.map((line) => line.brand))[0] : null,
    quantityOnHand: quantity,
    ...price,
    unit: 'pcs',
    trackStock: true,
    isActive: true,
    isSalable: true,
    sourceRows: lines.map((line) => line.excelRow),
    variants: [],
    refused,
    refusalReason,
    metadata: {
      importSource: IMPORT_SOURCE,
      sourceSheet: SHEET_NAME,
      itemCodes: unique(lines.map((line) => line.itemCode)),
      rawBrands: unique(lines.map((line) => line.rawBrand)),
      size: size || null,
      color: color || null,
      rawSizeColor: lines.map((line) => ({
        row: line.excelRow,
        itemCode: line.itemCode,
        rawSize: line.rawSize,
        rawColor: line.rawColor,
        resolvedSize: size || null,
        resolvedColor: color || null,
        attributeAction: line.resolved.action,
        quantity: line.quantity,
        costPrice: line.costPrice,
        sellingPrice: line.sellingPrice,
        priceSource: line.priceSource,
      })),
      priceConflict: price.priceConflict,
      nonClothing: first.nonClothing,
      refusalReason,
    },
  };
}

/**
 * @param {object[]} lines
 * @returns {object}
 */
function buildVariantProduct(lines) {
  const buckets = new Map();
  lines.forEach((line) => {
    const size = line.resolved.size.kind === 'size' ? line.resolved.size.value : '';
    const color = line.resolved.color.kind === 'color' ? line.resolved.color.value : '';
    const key = `${sizeKey(size)}|${colorKey(color)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ ...line, size, color });
  });

  const variants = [...buckets.values()]
    .sort((a, b) => a[0].excelRow - b[0].excelRow)
    .map((bucket) => {
      const price = choosePrice(bucket);
      const size = bucket[0].size;
      const color = bucket[0].color;
      const attributes = {};
      if (size) attributes.size = size;
      if (color) attributes.color = color;
      return {
        name: variantName(size, color),
        ...price,
        quantityOnHand: bucket.reduce((sum, line) => sum + line.quantity, 0),
        attributes,
        trackStock: true,
        isActive: true,
        token: variantToken(size, color),
        sourceRows: bucket.map((line) => line.excelRow),
        metadata: {
          importSource: IMPORT_SOURCE,
          itemCodes: unique(bucket.map((line) => line.itemCode)),
          rawSizeColor: bucket.map((line) => ({
            row: line.excelRow,
            itemCode: line.itemCode,
            rawSize: line.rawSize,
            rawColor: line.rawColor,
            attributeAction: line.resolved.action,
            quantity: line.quantity,
            costPrice: line.costPrice,
            sellingPrice: line.sellingPrice,
            priceSource: line.priceSource,
          })),
          priceConflict: price.priceConflict,
        },
      };
    });

  const first = lines[0];
  const price = parentPrice(variants);
  const brands = unique(lines.map((line) => line.brand));
  return {
    hasVariants: true,
    name: first.description,
    categoryName: first.category || null,
    brand: brands.length === 1 ? brands[0] : null,
    quantityOnHand: variants.reduce((sum, variant) => sum + variant.quantityOnHand, 0),
    costPrice: price.costPrice,
    sellingPrice: price.sellingPrice,
    unit: 'pcs',
    trackStock: true,
    isActive: true,
    isSalable: true,
    sourceRows: lines.map((line) => line.excelRow).sort((a, b) => a - b),
    variants,
    refused: false,
    refusalReason: null,
    metadata: {
      importSource: IMPORT_SOURCE,
      sourceSheet: SHEET_NAME,
      itemCodes: unique(lines.map((line) => line.itemCode)),
      rawBrands: unique(lines.map((line) => line.rawBrand)),
      sizes: unique(variants.map((variant) => variant.attributes.size)),
      colors: unique(variants.map((variant) => variant.attributes.color)),
      nonClothing: first.nonClothing,
      priceNote: 'Parent price is the price of the highest-quantity variant. Each variant keeps its own cost and selling price.',
    },
  };
}

/**
 * @param {object[]} rows
 * @returns {{ products: object[], notes: string[] }}
 */
function groupRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = `${row.descriptionKey}\u0000${row.categoryKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const products = [];
  const notes = [];

  groups.forEach((group) => {
    const ordered = [...group].sort((a, b) => a.excelRow - b.excelRow);
    const nonClothing = ordered.some((row) => row.nonClothing);
    const realRows = ordered.filter((row) => row.attributeOk);
    const junkRows = ordered.filter((row) => !row.attributeOk);

    if (nonClothing) {
      const keys = new Set(ordered.map((row) => row.variantKey));
      const codes = new Set(ordered.map((row) => row.itemCodeKey));
      const onlyRealDifferences = ordered.length > 1
        && junkRows.length === 0
        && keys.size >= 2
        && codes.size === 1;
      if (onlyRealDifferences) {
        notes.push(`${ordered[0].description} (${ordered[0].category || 'uncategorized'}) is non-clothing but the rows differ only by a real size/color, so they are variants.`);
        products.push(buildVariantProduct(ordered));
        return;
      }
      if (ordered.length > 1 && keys.size === 1 && junkRows.length === 0) {
        products.push(buildSimpleProduct(ordered, false, null));
        return;
      }
      if (ordered.length > 1) {
        const buckets = new Map();
        ordered.forEach((row) => {
          const key = `${row.variantKey}\u0000${row.itemCodeKey}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(row);
        });
        buckets.forEach((bucket) => {
          const reason = `Non-clothing "${bucket[0].description}" was not folded into size/color variants. Item code ${bucket[0].itemCode || '(blank)'} stays a separate simple product.`;
          products.push(buildSimpleProduct(bucket, true, reason));
        });
        return;
      }
      products.push(buildSimpleProduct(ordered, false, null));
      return;
    }

    if (realRows.length) {
      const keys = new Set(realRows.map((row) => row.variantKey));
      if (keys.size >= 2) products.push(buildVariantProduct(realRows));
      else products.push(buildSimpleProduct(realRows, false, null));
    }

    junkRows.forEach((row) => {
      const reason = refusalReason(row, ordered.length > 1);
      products.push(buildSimpleProduct([row], ordered.length > 1, ordered.length > 1 ? reason : null));
    });
  });

  products.sort((a, b) => a.sourceRows[0] - b.sourceRows[0]);
  const usedVariantSkus = new Set();
  products.forEach((product, index) => {
    product.sku = `OSB-${String(index + 1).padStart(4, '0')}`;
    product.variants.forEach((variant) => {
      let sku = `${product.sku}-${variant.token}`;
      let suffix = 2;
      while (usedVariantSkus.has(sku)) {
        sku = `${product.sku}-${variant.token}-${suffix}`;
        suffix += 1;
      }
      usedVariantSkus.add(sku);
      variant.sku = sku;
      delete variant.token;
    });
  });

  return { products, notes };
}

/**
 * @param {object} row
 * @param {boolean} hadSiblings
 * @returns {string}
 */
function refusalReason(row, hadSiblings) {
  if (!hadSiblings) return '';
  const problems = [];
  if (row.resolved.size.kind === 'other') problems.push(`size "${row.rawSize}" is not a real size or color`);
  if (row.resolved.color.kind === 'other') problems.push(`color "${row.rawColor}" is not a real size or color`);
  if (row.resolved.size.kind === 'color' && row.resolved.color.kind === 'color') {
    problems.push('both size and color cells are colors, so they were not swapped');
  }
  if (row.resolved.size.kind === 'color' && row.resolved.color.kind === 'other') {
    problems.push(`size cell "${row.rawSize}" is a color, but color cell "${row.rawColor}" is not a size`);
  }
  if (row.resolved.size.kind === 'size' && row.resolved.color.kind === 'other') {
    problems.push(`color cell "${row.rawColor}" is not a real color`);
  }
  const detail = problems.join('; ') || 'size/color could not be read as a real size or color';
  return `Kept separate from other "${row.description}" rows in ${row.category || 'uncategorized'}: ${detail}.`;
}

/**
 * @param {object[]} rows
 * @returns {number}
 */
function countExactDuplicateExtras(rows) {
  const buckets = new Map();
  rows.forEach((row) => {
    const size = row.resolved.size.kind === 'size' ? sizeKey(row.resolved.size.value) : '';
    const color = row.resolved.color.kind === 'color' ? colorKey(row.resolved.color.value) : '';
    const key = [row.descriptionKey, row.categoryKey, size, color, row.itemCodeKey].join('\u0000');
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  let extras = 0;
  buckets.forEach((count) => {
    if (count > 1) extras += count - 1;
  });
  return extras;
}

/**
 * @returns {Promise<object[]>}
 */
async function loadRows() {
  const ExcelJS = require('exceljs');
  if (!fs.existsSync(sourcePath)) fail(`Workbook not found: ${sourcePath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) fail(`Sheet not found: ${SHEET_NAME}`);

  const rows = [];
  let dropped = 0;
  sheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const itemCode = collapse(unwrap(excelRow.getCell(1).value));
    const category = cleanCategory(unwrap(excelRow.getCell(2).value));
    const description = collapse(unwrap(excelRow.getCell(4).value));
    const rawSize = collapse(unwrap(excelRow.getCell(5).value));
    const rawColor = collapse(unwrap(excelRow.getCell(6).value));
    const rawBrand = collapse(unwrap(excelRow.getCell(7).value));
    if (!description && !itemCode && !category && !rawSize && !rawColor) {
      dropped += 1;
      return;
    }
    if (!description) {
      throw new Error(`Row ${rowNumber} has no description and is not the blank trailer row`);
    }

    const selling = parseSelling(excelRow.getCell(10).value);
    const cost = parseCost(excelRow.getCell(9).value);
    const pricedFromSheet = selling != null;
    if (pricedFromSheet && cost == null) {
      throw new Error(`Row ${rowNumber} has selling price ${selling} but no numeric cached cost. Refusing to recalculate.`);
    }
    const resolved = resolveAttributes(rawSize, rawColor);
    const sizeValue = resolved.size.kind === 'size' ? resolved.size.value : '';
    const colorValue = resolved.color.kind === 'color' ? resolved.color.value : '';
    const brandPrepared = prepareAttribute(rawBrand);
    const brandIsAttribute = brandPrepared && (isSize(brandPrepared) || isColor(brandPrepared) || PLAIN_NUMBER.test(brandPrepared));
    rows.push({
      excelRow: rowNumber,
      itemCode: itemCode || null,
      itemCodeKey: itemCode.toUpperCase(),
      category,
      categoryKey: category,
      description,
      descriptionKey: description.toUpperCase(),
      rawSize,
      rawColor,
      rawBrand: rawBrand || null,
      brand: brandIsAttribute ? null : (rawBrand || null),
      quantity: parseQty(excelRow.getCell(11).value),
      costPrice: pricedFromSheet ? cost : 1,
      sellingPrice: pricedFromSheet ? selling : 1,
      priceSource: pricedFromSheet ? 'sheet' : 'fallback-1-ghs',
      resolved,
      attributeOk: attributesAreReal(resolved.size, resolved.color),
      variantKey: `${sizeKey(sizeValue)}|${colorValue ? colorKey(colorValue) : ''}`,
      nonClothing: isNonClothing(description.toUpperCase(), category, itemCode.toUpperCase()),
    });
  });

  if (dropped !== 1) {
    throw new Error(`Expected to drop 1 blank trailer row, dropped ${dropped}`);
  }
  if (rows.length !== 988) {
    throw new Error(`Expected 988 source rows, read ${rows.length}`);
  }
  return rows;
}

function assertPlan(rows, products) {
  const seen = [];
  products.forEach((product) => {
    if (product.hasVariants) {
      if (product.variants.length < 2) {
        throw new Error(`${product.sku} ${product.name} hasVariants with ${product.variants.length} variants`);
      }
      const parentQty = product.variants.reduce((sum, variant) => sum + variant.quantityOnHand, 0);
      if (parentQty !== product.quantityOnHand) {
        throw new Error(`${product.sku} parent quantity ${product.quantityOnHand} != variant sum ${parentQty}`);
      }
    } else if (product.variants.length) {
      throw new Error(`${product.sku} simple product has variants`);
    }
    seen.push(...product.sourceRows);
  });
  seen.sort((a, b) => a - b);
  const expected = rows.map((row) => row.excelRow).sort((a, b) => a - b);
  if (seen.length !== expected.length || seen.some((row, index) => row !== expected[index])) {
    throw new Error('Source rows were dropped or duplicated while grouping');
  }
  const sourceQty = rows.reduce((sum, row) => sum + row.quantity, 0);
  const planQty = products.reduce((sum, product) => sum + product.quantityOnHand, 0);
  if (sourceQty !== planQty) {
    throw new Error(`Quantity mismatch source ${sourceQty} plan ${planQty}`);
  }
}

function selectExamples(products) {
  const variantProducts = products.filter((product) => product.hasVariants);
  const byCount = [...variantProducts].sort((a, b) => b.variants.length - a.variants.length || a.sourceRows[0] - b.sourceRows[0]);
  const picked = [];
  const push = (product) => {
    if (product && !picked.some((item) => item.sku === product.sku)) picked.push(product);
  };
  byCount.slice(0, 3).forEach(push);
  push(variantProducts.find((product) => /SHOE/i.test(`${product.name} ${product.categoryName || ''}`)));
  push(variantProducts.find((product) => product.variants.some((variant) => variant.priceSource === 'sheet') && !picked.some((item) => item.sku === product.sku)));
  return picked.slice(0, 5);
}

function printExamples(products) {
  console.log('\nExample variant groups:');
  selectExamples(products).forEach((product) => {
    console.log(`\n${product.sku}  ${product.name}  [${product.categoryName || 'uncategorized'}]  parent qty ${product.quantityOnHand}  parent price ${product.sellingPrice} (cost ${product.costPrice})`);
    product.variants.forEach((variant) => {
      const size = variant.attributes.size || '-';
      const color = variant.attributes.color || '-';
      console.log(`  ${variant.sku}  size=${size}  color=${color}  cost=${variant.costPrice}  price=${variant.sellingPrice}  qty=${variant.quantityOnHand}`);
    });
  });
}

function buildArtifact(rows, products, notes, duplicateExtras) {
  const simple = products.filter((product) => !product.hasVariants);
  const parents = products.filter((product) => product.hasVariants);
  const refused = products.filter((product) => product.refused);
  const pricedFromSheet = rows.filter((row) => row.priceSource === 'sheet').length;
  const actions = rows.reduce((counts, row) => {
    counts[row.resolved.action] = (counts[row.resolved.action] || 0) + 1;
    return counts;
  }, {});
  return {
    databaseWrites: false,
    mode: 'dry-run',
    source: sourcePath,
    sheet: SHEET_NAME,
    summary: {
      sourceRows: rows.length,
      droppedBlankTrailerRows: 1,
      simpleProducts: simple.length,
      parentProductsWithVariants: parents.length,
      totalVariants: parents.reduce((sum, product) => sum + product.variants.length, 0),
      totalProducts: products.length,
      rowsPricedFromSheet: pricedFromSheet,
      rowsSetTo1Ghs: rows.length - pricedFromSheet,
      duplicateQuantitiesMerged: duplicateExtras,
      attributeActions: actions,
      refusedProductCount: refused.length,
      nonClothingSimpleProducts: simple.filter((product) => product.metadata.nonClothing).length,
      priceConflicts: products.reduce((sum, product) => {
        const own = product.metadata.priceConflict ? 1 : 0;
        const variants = product.variants.filter((variant) => variant.metadata.priceConflict).length;
        return sum + own + variants;
      }, 0),
    },
    notes,
    refused: refused.map((product) => ({
      sku: product.sku,
      name: product.name,
      categoryName: product.categoryName,
      sourceRows: product.sourceRows,
      reason: product.refusalReason,
      rawSizeColor: product.metadata.rawSizeColor,
    })),
    examples: selectExamples(products).map((product) => ({
      sku: product.sku,
      name: product.name,
      categoryName: product.categoryName,
      quantityOnHand: product.quantityOnHand,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        name: variant.name,
        size: variant.attributes.size || null,
        color: variant.attributes.color || null,
        costPrice: variant.costPrice,
        sellingPrice: variant.sellingPrice,
        quantityOnHand: variant.quantityOnHand,
      })),
    })),
    products: products.map((product) => {
      const { refused: _refused, refusalReason: _reason, ...rest } = product;
      return rest;
    }),
  };
}

/**
 * Insert path. Not used by a dry run. Requires --execute --confirm-import --tenant-slug.
 * Writes products, variant rows, categories, and opening shop stock the same way
 * product create does: quantity starts at 0, then applyStockChange(setTo, type opening)
 * updates product_shop_stocks and the denormalized quantity. Variant opens also
 * sync the parent quantity to the sum of variant quantities.
 * @param {object} plan
 * @returns {Promise<void>}
 */
async function executeImport(plan) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  const { Op } = require('sequelize');
  const { sequelize } = require('../config/database');
  const { Tenant, Product, ProductVariant, ProductCategory, Shop } = require('../models');
  const { applyStockChange, syncParentQuantityFromVariants } = require('../utils/productStockUtils');

  const tenant = await Tenant.findOne({ where: { slug: tenantSlug } });
  if (!tenant) {
    await sequelize.close();
    fail(`No tenant with slug "${tenantSlug}"`);
  }

  let shop = null;
  if (shopIdArg) {
    shop = await Shop.findOne({ where: { id: shopIdArg, tenantId: tenant.id } });
    if (!shop) {
      await sequelize.close();
      fail(`No shop ${shopIdArg} on tenant ${tenantSlug}`);
    }
  } else {
    shop = await Shop.findOne({
      where: { tenantId: tenant.id, isDefault: true },
      order: [['createdAt', 'ASC']],
    });
    if (!shop) {
      shop = await Shop.findOne({
        where: { tenantId: tenant.id },
        order: [['createdAt', 'ASC']],
      });
    }
  }
  if (!shop) {
    await sequelize.close();
    fail('No shop found for this tenant. Pass --shop-id. This script does not create a shop.');
  }

  const transaction = await sequelize.transaction();
  try {
    const skus = plan.products.map((product) => product.sku);
    const existing = await Product.findAll({
      where: { tenantId: tenant.id, sku: { [Op.in]: skus } },
      attributes: ['sku'],
      transaction,
    });
    if (existing.length) {
      throw new Error(`Import aborted. SKU already exists: ${existing.map((row) => row.sku).slice(0, 10).join(', ')}`);
    }

    const categoryIdByName = new Map();
    const categoryNames = unique(plan.products.map((product) => product.categoryName));
    for (const name of categoryNames) {
      const [category] = await ProductCategory.findOrCreate({
        where: { tenantId: tenant.id, name },
        defaults: {
          tenantId: tenant.id,
          name,
          description: 'Imported from Oskobuys clothing workbook',
          isActive: true,
          metadata: { importSource: IMPORT_SOURCE },
        },
        transaction,
      });
      categoryIdByName.set(name, category.id);
    }

    for (const item of plan.products) {
      const product = await Product.create({
        tenantId: tenant.id,
        shopId: shop.id,
        name: item.name,
        sku: item.sku,
        description: item.name,
        categoryId: item.categoryName ? categoryIdByName.get(item.categoryName) || null : null,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        quantityOnHand: 0,
        reorderLevel: 0,
        reorderQuantity: 0,
        unit: 'pcs',
        brand: item.brand,
        hasVariants: item.hasVariants === true,
        isActive: true,
        isSalable: true,
        trackStock: true,
        metadata: item.metadata,
      }, { transaction });

      if (!item.hasVariants) {
        if (item.quantityOnHand > 0) {
          await applyStockChange({
            tenantId: tenant.id,
            productId: product.id,
            shopId: shop.id,
            setTo: item.quantityOnHand,
            type: 'opening',
            reason: 'Opening stock on Oskobuys clothing import',
            metadata: { source: 'import-oskobuys-clothing' },
            transaction,
          });
        }
        continue;
      }

      for (const variant of item.variants) {
        const created = await ProductVariant.create({
          productId: product.id,
          name: variant.name,
          sku: variant.sku,
          costPrice: variant.costPrice,
          sellingPrice: variant.sellingPrice,
          quantityOnHand: 0,
          attributes: variant.attributes,
          isActive: true,
          trackStock: true,
          metadata: variant.metadata,
        }, { transaction });
        if (variant.quantityOnHand > 0) {
          await applyStockChange({
            tenantId: tenant.id,
            productId: product.id,
            productVariantId: created.id,
            shopId: shop.id,
            setTo: variant.quantityOnHand,
            type: 'opening',
            reason: 'Opening stock on Oskobuys clothing import',
            metadata: { source: 'import-oskobuys-clothing' },
            transaction,
          });
        }
      }
      await syncParentQuantityFromVariants(product.id, transaction);
    }

    await transaction.commit();
    console.log(`\nImport completed for tenant ${tenant.slug} shop ${shop.name} (${shop.id}).`);
    console.log(`Created ${plan.products.length} products.`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await sequelize.close();
  }
}

function selfCheck() {
  if (parseSelling('18O') !== null) throw new Error('18O must not parse as a price');
  if (parseSelling('  ') !== null) throw new Error('blank selling price must not parse');
  if (parseSelling('#VALUE!') !== null) throw new Error('#VALUE! must not parse');
  if (parseSelling(180) !== 180) throw new Error('numeric selling price should be kept');
  if (parseQty('12*6=72') !== 72) throw new Error('12*6=72');
  if (parseQty('12*2=24') !== 24) throw new Error('12*2=24');
  if (parseQty('36+6=42') !== 42) throw new Error('36+6=42');
  if (parseQty('SET') !== 1) throw new Error('SET');
  if (parseQty('') !== 0 || parseQty(null) !== 0) throw new Error('blank qty');
  if (cleanCategory('d') !== '' || cleanCategory('TIE&DIE') !== 'TIE&DYE') throw new Error('category map');
  if (cleanCategory("MEN' S LEATHER LOAFERS SHOE") !== "MEN'S LEATHER LOAFERS SHOE") throw new Error('category spaces');
  if (collapse('HOLLY FASHION 2PCS  LONG') !== 'HOLLY FASHION 2PCS LONG') throw new Error('description spaces');
  const swapped = resolveAttributes('BLACK', 'L');
  if (swapped.action !== 'swap' || swapped.size.value !== 'L' || swapped.color.value !== 'BLACK') {
    throw new Error(`swap failed: ${JSON.stringify(swapped)}`);
  }
  const moved = resolveAttributes('BLACK', '');
  if (moved.action !== 'move-size-to-color' || moved.size.kind !== 'empty' || moved.color.value !== 'BLACK') {
    throw new Error(`move failed: ${JSON.stringify(moved)}`);
  }
  const shoe = resolveAttributes('', '44');
  if (shoe.action !== 'move-color-to-size' || shoe.size.value !== '44') throw new Error('shoe size move');
}

async function main() {
  selfCheck();
  if (isExecute && !shouldConfirm) {
    fail('Execute mode requires --confirm-import. No database connection was opened.');
  }
  if (isExecute && !tenantSlug) {
    fail('Execute mode requires --tenant-slug. No database connection was opened.');
  }

  const rows = await loadRows();
  const duplicateExtras = countExactDuplicateExtras(rows);
  const { products, notes } = groupRows(rows);
  assertPlan(rows, products);
  const artifact = buildArtifact(rows, products, notes, duplicateExtras);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));

  const summary = artifact.summary;
  console.log('\n=== Oskobuys clothing stock import ===');
  printSummary('Mode', isExecute ? 'EXECUTE' : 'DRY RUN');
  printSummary('Database writes', 'none in this process unless execute runs');
  printSummary('Source', sourcePath);
  printSummary('Sheet', SHEET_NAME);
  printSummary('Review file', outPath);
  console.log('');
  printSummary('Source rows', summary.sourceRows);
  printSummary('Blank trailer rows dropped', summary.droppedBlankTrailerRows);
  printSummary('Simple products', summary.simpleProducts);
  printSummary('Parent products with variants', summary.parentProductsWithVariants);
  printSummary('Total variants', summary.totalVariants);
  printSummary('Total products (simple + parents)', summary.totalProducts);
  printSummary('Rows priced from the sheet', summary.rowsPricedFromSheet);
  printSummary('Rows set to 1 cedi', summary.rowsSetTo1Ghs);
  printSummary('Duplicate quantities merged', summary.duplicateQuantitiesMerged);
  printSummary('Size/color swaps', summary.attributeActions.swap || 0);
  printSummary('Size values moved to color', summary.attributeActions['move-size-to-color'] || 0);
  printSummary('Color values moved to size', summary.attributeActions['move-color-to-size'] || 0);
  printSummary('Refused variant groupings', summary.refusedProductCount);
  printSummary('Price conflicts inside a variant', summary.priceConflicts);

  if (notes.length) {
    console.log('\nNotes:');
    notes.forEach((note) => console.log(`- ${note}`));
  }
  if (artifact.refused.length) {
    console.log('\nRows kept out of a variant group:');
    artifact.refused.forEach((item) => {
      console.log(`- rows ${item.sourceRows.join(', ')} ${item.name}: ${item.reason}`);
    });
  } else {
    console.log('\nNo multi-row description was held out of variant grouping.');
  }

  printExamples(products);

  if (!isExecute) {
    console.log('\nDry run complete. No database connection was opened. No products, stock, or categories were written.');
    return;
  }

  console.log(`\nExecuting import for tenant slug ${tenantSlug}.`);
  await executeImport(artifact);
}

main().catch((error) => {
  console.error('\nImport failed:', error?.stack || error?.message || error);
  process.exitCode = 1;
});
