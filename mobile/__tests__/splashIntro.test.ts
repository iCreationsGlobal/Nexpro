import { SPLASH_INTRO_SLIDES } from '@/config/splashIntro';

describe('splashIntro slides', () => {
  it('defines five onboarding screens with titles and placeholders', () => {
    expect(SPLASH_INTRO_SLIDES).toHaveLength(5);

    const ids = SPLASH_INTRO_SLIDES.map((slide) => slide.id);
    expect(ids).toEqual([
      'every-business',
      'smart-pos',
      'quotations',
      'online-store',
      'abs-watch',
    ]);

    for (const slide of SPLASH_INTRO_SLIDES) {
      expect(slide.title.trim().length).toBeGreaterThan(0);
      expect(slide.subtitle.trim().length).toBeGreaterThan(0);
      expect(slide.largeCardPlaceholder.trim().length).toBeGreaterThan(0);
      expect(slide.smallCardPlaceholder.trim().length).toBeGreaterThan(0);
      expect(slide.largeCardImage).toBeTruthy();
    }

    const watch = SPLASH_INTRO_SLIDES.find((slide) => slide.id === 'abs-watch');
    expect(watch?.smallCardVariant).toBe('unusual-activity');
  });
});
