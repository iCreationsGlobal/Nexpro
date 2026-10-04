import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveImageUrl } from '../../utils/fileUtils';
import { Button } from '@/components/ui/button';

const TRANSITION_MS = 700;
const HERO_ANIMATIONS = new Set(['fade', 'slide', 'zoom']);

/**
 * @param {unknown} value
 * @returns {'fade'|'slide'|'zoom'}
 */
const normalizeHeroAnimation = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return HERO_ANIMATIONS.has(key) ? key : 'fade';
};

/**
 * Style for a slide given animation mode and active state.
 * @param {{ animation: string, isActive: boolean, index: number, activeIndex: number, animate: boolean }} opts
 */
const slideStyle = ({ animation, isActive, index, activeIndex, animate }) => {
  const duration = animate ? `${TRANSITION_MS}ms` : undefined;

  if (animation === 'slide') {
    return {
      opacity: 1,
      transform: `translateX(${(index - activeIndex) * 100}%)`,
      transitionProperty: animate ? 'transform' : undefined,
      transitionDuration: duration,
      transitionTimingFunction: animate ? 'ease-out' : undefined,
      zIndex: isActive ? 1 : 0,
    };
  }

  if (animation === 'zoom') {
    return {
      opacity: isActive ? 1 : 0,
      transform: isActive ? 'scale(1)' : 'scale(1.06)',
      transitionProperty: animate ? 'opacity, transform' : undefined,
      transitionDuration: duration,
      transitionTimingFunction: animate ? 'ease-out' : undefined,
      zIndex: isActive ? 1 : 0,
    };
  }

  // fade (default / current crossfade)
  return {
    opacity: isActive ? 1 : 0,
    transform: animate
      ? isActive
        ? 'scale(1) translateX(0)'
        : 'scale(1.03) translateX(1.25%)'
      : undefined,
    transitionProperty: animate ? 'opacity, transform' : undefined,
    transitionDuration: duration,
    transitionTimingFunction: animate ? 'ease-out' : undefined,
    zIndex: isActive ? 1 : 0,
  };
};

/**
 * Online Store hero image carousel (library + upload slides).
 * Multi-slide stores animate on autoplay / nav; single slide stays static.
 * @param {{
 *   slides?: object[],
 *   storeName?: string,
 *   accent?: string,
 *   animation?: 'fade'|'slide'|'zoom'|string,
 * }} props
 */
export default function StoreHeroCarousel({
  slides = [],
  storeName = 'Store',
  accent = '#166534',
  animation: animationProp = 'fade',
}) {
  const animation = normalizeHeroAnimation(animationProp);
  const items = useMemo(
    () =>
      (Array.isArray(slides) ? slides : [])
        .map((slide) => ({
          ...slide,
          src: resolveImageUrl(slide?.imageUrl),
        }))
        .filter((slide) => slide.src),
    [slides]
  );

  const multi = items.length > 1;
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(Boolean(mq.matches));
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (reduceMotion || !multi) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [items.length, multi, reduceMotion]);

  const go = useCallback((direction) => {
    if (!items.length) return;
    setIndex((prev) => (prev + direction + items.length) % items.length);
  }, [items.length]);

  if (!items.length) return null;

  const activeIndex = Math.min(index, items.length - 1);
  const animate = multi && !reduceMotion;
  const neighborIndexes = multi
    ? new Set([
      activeIndex,
      (activeIndex - 1 + items.length) % items.length,
      (activeIndex + 1) % items.length,
    ])
    : new Set([activeIndex]);

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border-b border-slate-200" aria-label={`${storeName} hero`}>
      <div className="relative aspect-[16/6] w-full bg-slate-100 sm:aspect-[21/7]">
        {items.map((slide, i) => {
          const isActive = i === activeIndex;
          const isPriority = neighborIndexes.has(i);
          return (
            <img
              key={`${slide.src}-${i}`}
              src={slide.src}
              alt={isActive ? `${storeName} hero ${i + 1}` : ''}
              aria-hidden={!isActive}
              className="absolute inset-0 h-full w-full object-cover"
              style={slideStyle({
                animation,
                isActive,
                index: i,
                activeIndex,
                animate,
              })}
              loading={isPriority ? 'eager' : 'lazy'}
              fetchpriority={isActive ? 'high' : 'auto'}
              decoding={isActive ? 'sync' : 'async'}
              draggable={false}
            />
          );
        })}
        {multi ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute left-3 top-1/2 z-[2] h-10 w-10 -translate-y-1/2 rounded-full border-slate-200 bg-white/90"
              onClick={() => go(-1)}
              aria-label="Previous hero slide"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-3 top-1/2 z-[2] h-10 w-10 -translate-y-1/2 rounded-full border-slate-200 bg-white/90"
              onClick={() => go(1)}
              aria-label="Next hero slide"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <div className="absolute bottom-3 left-1/2 z-[2] flex -translate-x-1/2 gap-1.5">
              {items.map((slide, i) => (
                <button
                  key={`${slide.src}-dot-${i}`}
                  type="button"
                  aria-label={`Go to hero slide ${i + 1}`}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  className={`h-2.5 w-2.5 rounded-full border border-white/80 ${
                    animate ? 'transition-colors duration-300' : ''
                  }`}
                  style={{ backgroundColor: i === activeIndex ? accent : 'rgba(255,255,255,0.55)' }}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
