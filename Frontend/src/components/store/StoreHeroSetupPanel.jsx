import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImagePlus, Loader2, Upload, X } from 'lucide-react';
import storeService from '../../services/storeService';
import { API_BASE_URL } from '../../services/api';
import { showError } from '../../utils/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const MAX_HERO_SLIDES = 5;
const HERO_ANIMATION_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
];

const resolveUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL || ''}${url}`;
  return url;
};

/**
 * Normalize hero animation allowlist value.
 * @param {unknown} value
 * @returns {'fade'|'slide'|'zoom'}
 */
const normalizeHeroAnimation = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return HERO_ANIMATION_OPTIONS.some((opt) => opt.value === key) ? key : 'fade';
};

/**
 * Online Store setup — pick library heroes (auto color-matched) and/or upload own.
 * Selected library slides can override the matched colorway via swatches.
 */
export default function StoreHeroSetupPanel({
  primaryColor,
  heroSlides,
  onChange,
  heroAnimation = 'fade',
  onAnimationChange,
}) {
  const [library, setLibrary] = useState({ categories: [], maxSlides: MAX_HERO_SLIDES });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storeService.getHeroLibrary({ primaryColor });
      const data = res?.data !== undefined ? res.data : res || {};
      setLibrary({
        categories: Array.isArray(data.categories) ? data.categories : [],
        maxSlides: data.maxSlides || MAX_HERO_SLIDES,
      });
    } catch (error) {
      showError(error?.response?.data?.message || 'Failed to load hero library');
    } finally {
      setLoading(false);
    }
  }, [primaryColor]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const slides = Array.isArray(heroSlides) ? heroSlides : [];
  const maxSlides = library.maxSlides || MAX_HERO_SLIDES;
  const selectedDesignIds = useMemo(
    () => new Set(slides.filter((s) => s.type === 'library' && s.designId).map((s) => s.designId)),
    [slides]
  );

  const designById = useMemo(() => {
    const map = new Map();
    for (const cat of library.categories) {
      for (const design of cat.designs || []) {
        map.set(design.id, { ...design, categoryName: cat.name, categoryId: cat.id });
      }
    }
    return map;
  }, [library.categories]);

  const designs = useMemo(() => {
    const list = library.categories.flatMap((cat) =>
      (cat.designs || []).map((d) => ({ ...d, categoryName: cat.name, categoryId: cat.id }))
    );
    if (categoryFilter === 'all') return list;
    return list.filter((d) => d.categoryId === categoryFilter);
  }, [library.categories, categoryFilter]);

  const updateSlides = useCallback((next) => {
    onChange(next.slice(0, maxSlides).map((slide, index) => ({ ...slide, sortOrder: index })));
  }, [maxSlides, onChange]);

  const toggleDesign = (design) => {
    if (selectedDesignIds.has(design.id)) {
      updateSlides(slides.filter((s) => !(s.type === 'library' && s.designId === design.id)));
      return;
    }
    if (slides.length >= maxSlides) {
      showError(`You can select up to ${maxSlides} hero slides`);
      return;
    }
    updateSlides([
      ...slides,
      {
        type: 'library',
        designId: design.id,
        colorwayId: design.matchedColorway?.id || null,
        imageUrl: design.previewImageUrl || design.matchedColorway?.imageUrl || design.thumbnailUrl,
      },
    ]);
  };

  /**
   * Override the colorway for a selected library slide (sticky via colorwayId).
   * @param {number} index - Slide index in heroSlides
   * @param {{ id: string, imageUrl?: string }} colorway - Chosen colorway from design.colorways
   */
  const selectColorway = useCallback((index, colorway) => {
    if (!colorway?.id) return;
    updateSlides(
      slides.map((slide, i) => {
        if (i !== index || slide.type !== 'library') return slide;
        return {
          ...slide,
          colorwayId: colorway.id,
          imageUrl: colorway.imageUrl || slide.imageUrl,
        };
      })
    );
  }, [slides, updateSlides]);

  const removeSlide = (index) => {
    updateSlides(slides.filter((_, i) => i !== index));
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const remaining = maxSlides - slides.length;
    if (remaining <= 0) {
      showError(`You can select up to ${maxSlides} hero slides`);
      return;
    }
    setUploading(true);
    try {
      const res = await storeService.uploadHeroImages(files.slice(0, remaining));
      const urls = res?.data?.imageUrls || res?.imageUrls || [];
      updateSlides([
        ...slides,
        ...urls.map((imageUrl) => ({ type: 'upload', imageUrl })),
      ]);
    } catch (error) {
      showError(error?.response?.data?.message || 'Failed to upload hero image');
    } finally {
      setUploading(false);
    }
  };

  const clearAll = () => updateSlides([]);
  const animationValue = normalizeHeroAnimation(heroAnimation);
  const canEditAnimation = typeof onAnimationChange === 'function';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <div className="rounded-xl border border-border p-4">
          <p className="font-medium">Hero slider</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose up to {maxSlides} slides for your storefront. Library designs auto-match your brand color
            ({primaryColor || '#166534'}). Change the colorway on any selected library slide if you prefer a
            different look. You can also upload your own. Optional — skip for no hero.
          </p>
        </div>

        {canEditAnimation ? (
          <div className="w-full max-w-xs space-y-2">
            <Label htmlFor="hero-animation">Animation (optional)</Label>
            <Select
              value={animationValue}
              onValueChange={(value) => onAnimationChange(normalizeHeroAnimation(value))}
            >
              <SelectTrigger id="hero-animation">
                <SelectValue placeholder="Fade" />
              </SelectTrigger>
              <SelectContent>
                {HERO_ANIMATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Applies when you have 2 or more slides.
            </p>
          </div>
        ) : null}

        {slides.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Selected ({slides.length}/{maxSlides})</Label>
              <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {slides.map((slide, index) => {
                const design = slide.type === 'library' && slide.designId
                  ? designById.get(slide.designId)
                  : null;
                const colorways = Array.isArray(design?.colorways) ? design.colorways : [];
                const activeColorway =
                  colorways.find((cw) => cw.id === slide.colorwayId) ||
                  design?.matchedColorway ||
                  colorways[0] ||
                  null;

                return (
                  <div
                    key={`${slide.type}-${slide.designId || slide.imageUrl}-${index}`}
                    className="overflow-hidden rounded-lg border border-slate-200"
                  >
                    <div className="relative">
                      <img
                        src={resolveUrl(slide.imageUrl)}
                        alt={`Hero ${index + 1}`}
                        className="aspect-[16/6] w-full object-cover sm:aspect-[21/7]"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full border border-slate-200 bg-white p-1"
                        onClick={() => removeSlide(index)}
                        aria-label="Remove slide"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <Badge className="absolute bottom-1 left-1 bg-white/95 text-slate-800 hover:bg-white/95" variant="outline">
                        {slide.type === 'upload' ? 'Upload' : 'Library'}
                      </Badge>
                    </div>

                    {slide.type === 'library' && colorways.length > 0 ? (
                      <div className="space-y-2 border-t border-slate-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-slate-800">
                            {design?.name || 'Colorway'}
                          </p>
                          {activeColorway?.label ? (
                            <p className="shrink-0 text-[11px] text-muted-foreground">
                              {activeColorway.label}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Colorway options">
                          {colorways.map((cw) => {
                            const isActive = cw.id === (slide.colorwayId || activeColorway?.id);
                            return (
                              <Tooltip key={cw.id}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => selectColorway(index, cw)}
                                    aria-label={`Colorway ${cw.label || cw.id}`}
                                    aria-pressed={isActive}
                                    className={cn(
                                      'relative h-8 w-8 overflow-hidden rounded-md border-2 transition-colors',
                                      isActive
                                        ? 'border-green-700'
                                        : 'border-slate-200 hover:border-slate-400'
                                    )}
                                  >
                                    {cw.imageUrl ? (
                                      <img
                                        src={resolveUrl(cw.imageUrl)}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span
                                        className="block h-full w-full"
                                        style={{ backgroundColor: cw.hexHint || primaryColor || '#166534' }}
                                      />
                                    )}
                                    {cw.hexHint ? (
                                      <span
                                        className="absolute bottom-0 right-0 h-2.5 w-2.5 border border-white"
                                        style={{ backgroundColor: cw.hexHint }}
                                        aria-hidden
                                      />
                                    ) : null}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {cw.label || 'Colorway'}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full space-y-2 sm:max-w-xs">
            <Label>Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {library.categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <input
              id="hero-upload-input"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              disabled={uploading || slides.length >= maxSlides}
              onClick={() => document.getElementById('hero-upload-input')?.click()}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload own
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-green-700" />
          </div>
        ) : designs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <ImagePlus className="h-8 w-8 text-slate-400" />
            <p className="text-sm text-muted-foreground">
              No library designs yet. Upload your own, or ask your platform admin to add heroes.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((design) => {
              const selected = selectedDesignIds.has(design.id);
              return (
                <button
                  key={design.id}
                  type="button"
                  onClick={() => toggleDesign(design)}
                  className={`overflow-hidden rounded-xl border text-left transition-colors ${
                    selected ? 'border-green-700 bg-green-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <img
                    src={resolveUrl(design.previewImageUrl || design.thumbnailUrl)}
                    alt={design.name}
                    className="aspect-[16/5] w-full object-cover"
                  />
                  <div className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{design.name}</p>
                      {selected ? <Badge className="bg-green-700 text-white hover:bg-green-700">Selected</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{design.categoryName}</p>
                    {design.matchedColorway ? (
                      <p className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300"
                          style={{ backgroundColor: design.matchedColorway.hexHint || primaryColor }}
                        />
                        Matched: {design.matchedColorway.label}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
