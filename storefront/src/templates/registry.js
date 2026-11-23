/**
 * Online Store visual template registry (storefront).
 * Keep in sync with Backend/config/storeTemplates.js and Frontend/src/constants/storeTemplates.js
 *
 * Per-template `harmony`: complement | analogous | tint | triad — see utils/colorHarmony.js
 */

import {
  DEFAULT_HARMONY,
  fillHarmoniousSlots,
  hexToHsl,
  normalizeHarmonyStrategy,
} from '../utils/colorHarmony';

/**
 * Convert #rrggbb to shadcn HSL channel string (`H S% L%`) for --primary / --ring.
 * @param {string} hex
 * @returns {string|null}
 */
const hexToCssHslChannels = (hex) => {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return `${Math.round(hsl.h)} ${Math.round(hsl.s * 100)}% ${Math.round(hsl.l * 100)}%`;
};

export const DEFAULT_TEMPLATE_ID = 'classic';

export const STORE_TEMPLATE_IDS = ['classic', 'minimal', 'bold', 'marketplace', 'catalog'];

export const COLOR_KEY_TO_FIELD = {
  primary: 'primaryColor',
  secondary: 'secondaryColor',
  tertiary: 'tertiaryColor',
};

export const STORE_TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Clean green header, search bar, and product grid',
    tags: ['Default', 'Trusted'],
    previewAccent: '#166534',
    harmony: 'tint',
    colorSlots: [
      { key: 'primary', label: 'Primary color', cssVar: '--store-accent', default: '#166534' },
      { key: 'secondary', label: 'Secondary color', cssVar: '--store-secondary', default: '#86efac' },
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    tagline: 'Light whitespace, thin type, quiet commerce',
    tags: ['Simple', 'Modern'],
    previewAccent: '#0f172a',
    harmony: 'tint',
    colorSlots: [
      { key: 'primary', label: 'Accent color', cssVar: '--store-accent', default: '#0f172a' },
    ],
  },
  {
    id: 'bold',
    name: 'Bold',
    tagline: 'Strong hero, high contrast, statement branding',
    tags: ['Impact', 'Retail'],
    previewAccent: '#f59e0b',
    harmony: 'complement',
    colorSlots: [
      { key: 'primary', label: 'Primary accent', cssVar: '--store-accent', default: '#f59e0b' },
      { key: 'secondary', label: 'Secondary color', cssVar: '--store-secondary', default: '#0e6dd9' },
      { key: 'tertiary', label: 'Highlight color', cssVar: '--store-tertiary', default: '#fde68a' },
    ],
  },
  {
    id: 'marketplace',
    name: 'Dense',
    tagline: 'Compact catalog layout with category chips and tight product cards',
    tags: ['Catalog', 'Busy'],
    previewAccent: '#0369a1',
    harmony: 'analogous',
    colorSlots: [
      { key: 'primary', label: 'Primary color', cssVar: '--store-accent', default: '#0369a1' },
      { key: 'secondary', label: 'Chip / badge color', cssVar: '--store-secondary', default: '#0ea5e9' },
    ],
  },
  {
    id: 'catalog',
    name: 'Catalog',
    tagline: 'Magazine-style hero and spacious product rows',
    tags: ['Premium', 'Lookbook'],
    previewAccent: '#7c3aed',
    harmony: 'tint',
    colorSlots: [
      { key: 'primary', label: 'Primary color', cssVar: '--store-accent', default: '#7c3aed' },
      { key: 'secondary', label: 'Secondary color', cssVar: '--store-secondary', default: '#a78bfa' },
    ],
  },
];

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const HEX_SHORT_COLOR_PATTERN = /^#[0-9A-Fa-f]{3}$/;

/**
 * @param {string} [value]
 * @param {string|null} [fallback]
 * @returns {string|null}
 */
export const normalizeHexColor = (value, fallback = null) => {
  const trimmed = String(value || '').trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  if (HEX_SHORT_COLOR_PATTERN.test(trimmed)) {
    const [, r, g, b] = trimmed.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/i) || [];
    if (r && g && b) return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
};

export const normalizeTemplateId = (value) => {
  const id = String(value || '').trim().toLowerCase();
  return STORE_TEMPLATE_IDS.includes(id) ? id : DEFAULT_TEMPLATE_ID;
};

export const getStoreTemplate = (id) =>
  STORE_TEMPLATES.find((t) => t.id === normalizeTemplateId(id)) || STORE_TEMPLATES[0];

/**
 * @param {string} [templateId]
 * @returns {'complement'|'analogous'|'tint'|'triad'}
 */
export const getTemplateHarmony = (templateId) =>
  normalizeHarmonyStrategy(getStoreTemplate(templateId).harmony || DEFAULT_HARMONY);

/**
 * @param {string} [templateId]
 * @returns {Array<{ key: string, label: string, cssVar: string, default: string }>}
 */
export const getTemplateColorSlots = (templateId) => {
  const template = getStoreTemplate(templateId);
  return Array.isArray(template.colorSlots) ? template.colorSlots : [];
};

/**
 * @param {string} [templateId]
 * @returns {{ primary?: string, secondary?: string, tertiary?: string }}
 */
export const getTemplateDefaultColors = (templateId) =>
  getTemplateColorSlots(templateId).reduce((acc, slot) => {
    acc[slot.key] = slot.default;
    return acc;
  }, {});

/**
 * @param {string} [templateId]
 * @returns {{ hasSecondary: boolean, hasTertiary: boolean }}
 */
export const getTemplateColorSlotFlags = (templateId) => {
  const keys = new Set(getTemplateColorSlots(templateId).map((s) => s.key));
  return {
    hasSecondary: keys.has('secondary'),
    hasTertiary: keys.has('tertiary'),
  };
};

/**
 * Resolve merchant colors against the active template's slots.
 * Missing secondary/tertiary are filled from primary via harmony.
 * @param {string} [templateId]
 * @param {Record<string, string|null|undefined>} [colors]
 * @returns {{ primary?: string, secondary?: string, tertiary?: string }}
 */
export const resolveStoreBrandColors = (templateId, colors = {}) => {
  const source = colors && typeof colors === 'object' ? colors : {};
  const slots = getTemplateColorSlots(templateId);
  const defaults = getTemplateDefaultColors(templateId);
  const primaryRaw = source.primary != null ? source.primary : source.primaryColor;
  const primary = normalizeHexColor(primaryRaw, defaults.primary) || defaults.primary;

  const existingSecondary = source.secondary != null ? source.secondary : source.secondaryColor;
  const existingTertiary = source.tertiary != null ? source.tertiary : source.tertiaryColor;
  const filled = fillHarmoniousSlots(
    primary,
    { secondary: existingSecondary, tertiary: existingTertiary },
    getTemplateHarmony(templateId),
    getTemplateColorSlotFlags(templateId),
  );

  return slots.reduce((acc, slot) => {
    if (slot.key === 'primary') {
      acc.primary = primary || slot.default;
      return acc;
    }
    if (slot.key === 'secondary') {
      acc.secondary = normalizeHexColor(filled.secondary, slot.default) || slot.default;
      return acc;
    }
    if (slot.key === 'tertiary') {
      acc.tertiary = normalizeHexColor(filled.tertiary, slot.default) || slot.default;
      return acc;
    }
    const field = COLOR_KEY_TO_FIELD[slot.key];
    const raw = source[slot.key] != null ? source[slot.key] : source[field];
    acc[slot.key] = normalizeHexColor(raw, slot.default) || slot.default;
    return acc;
  }, {});
};

/**
 * @param {string} [templateId]
 * @param {Record<string, string|null|undefined>} [colors]
 * @returns {Record<string, string>}
 */
export const buildStoreColorCssVars = (templateId, colors = {}) => {
  const resolved = resolveStoreBrandColors(templateId, colors);
  return getTemplateColorSlots(templateId).reduce((vars, slot) => {
    const value = resolved[slot.key];
    vars[slot.cssVar] = value;
    if (slot.key === 'primary') {
      vars['--store-accent-soft'] = `${value}22`;
      // Darker brand shade for filled CTA hover (overrides Button hover:bg-primary/90 green)
      vars['--store-accent-hover'] = `color-mix(in srgb, ${value} 85%, black)`;
      // Remap shadcn primary/ring so default Button / focus rings follow tenant brand
      const channels = hexToCssHslChannels(value);
      if (channels) {
        vars['--primary'] = channels;
        vars['--ring'] = channels;
      }
    }
    if (slot.key === 'secondary') vars['--store-secondary-soft'] = `${value}22`;
    if (slot.key === 'tertiary') vars['--store-tertiary-soft'] = `${value}22`;
    return vars;
  }, {});
};

/**
 * Theme tokens applied as CSS variables / class hooks per template.
 */
export const getTemplateTheme = (templateId) => {
  const id = normalizeTemplateId(templateId);
  const defaults = getTemplateDefaultColors(id);
  const themes = {
    classic: {
      id,
      shellClass: 'store-tpl-classic bg-white text-slate-950',
      headerClass: 'border-b border-slate-200 bg-white/95 backdrop-blur',
      heroClass: 'rounded-[2rem] border border-slate-200 bg-slate-50',
      accent: defaults.primary || '#166534',
      secondary: defaults.secondary || null,
      tertiary: defaults.tertiary || null,
      gridClass: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4',
      productCardClass: 'rounded-2xl border border-slate-200 bg-white',
      heroOverlay: false,
      dense: false,
      dark: false,
    },
    minimal: {
      id,
      shellClass: 'store-tpl-minimal bg-stone-50 text-slate-900',
      headerClass: 'border-b border-stone-200 bg-stone-50',
      heroClass: 'rounded-none border-0 bg-transparent',
      accent: defaults.primary || '#0f172a',
      secondary: defaults.secondary || null,
      tertiary: defaults.tertiary || null,
      gridClass: 'grid gap-8 sm:grid-cols-2 lg:grid-cols-3',
      productCardClass: 'rounded-none border-0 border-b border-stone-200 bg-transparent',
      heroOverlay: false,
      dense: false,
      dark: false,
    },
    bold: {
      id,
      shellClass: 'store-tpl-bold bg-slate-950 text-white',
      headerClass: 'border-b border-white/10 bg-slate-950',
      heroClass: 'rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-600 to-slate-900',
      accent: defaults.primary || '#f59e0b',
      secondary: defaults.secondary || null,
      tertiary: defaults.tertiary || null,
      gridClass: 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3',
      productCardClass: 'rounded-2xl border border-white/10 bg-slate-900',
      heroOverlay: true,
      dense: false,
      dark: true,
    },
    marketplace: {
      id,
      shellClass: 'store-tpl-marketplace bg-slate-100 text-slate-950',
      headerClass: 'border-b border-slate-300 bg-white',
      heroClass: 'rounded-xl border border-sky-200 bg-sky-50',
      accent: defaults.primary || '#0369a1',
      secondary: defaults.secondary || null,
      tertiary: defaults.tertiary || null,
      gridClass: 'grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
      productCardClass: 'rounded-xl border border-slate-200 bg-white',
      heroOverlay: false,
      dense: true,
      dark: false,
    },
    catalog: {
      id,
      shellClass: 'store-tpl-catalog bg-white text-slate-950',
      headerClass: 'border-b border-violet-100 bg-white',
      heroClass: 'rounded-[2.5rem] border border-violet-100 bg-violet-50/60',
      accent: defaults.primary || '#7c3aed',
      secondary: defaults.secondary || null,
      tertiary: defaults.tertiary || null,
      gridClass: 'grid gap-10 sm:grid-cols-2',
      productCardClass: 'rounded-3xl border border-violet-100 bg-white',
      heroOverlay: false,
      dense: false,
      dark: false,
    },
  };
  return themes[id] || themes.classic;
};
