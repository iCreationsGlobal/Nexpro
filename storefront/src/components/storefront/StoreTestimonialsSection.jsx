import { resolveImageUrl } from '../../utils/fileUtils';

/**
 * Merchant-curated testimonials on owned Online Store home.
 * Not Verified reviews — hide when disabled or empty.
 * @param {{
 *   testimonials?: { enabled?: boolean, items?: Array<{
 *     id?: string,
 *     quote?: string,
 *     authorName?: string,
 *     role?: string | null,
 *     company?: string | null,
 *     photoUrl?: string | null,
 *   }> } | null,
 *   accent?: string,
 * }} props
 */
export default function StoreTestimonialsSection({ testimonials, accent = '#166534' }) {
  const items = Array.isArray(testimonials?.items) ? testimonials.items : [];
  if (!testimonials?.enabled || items.length === 0) return null;

  return (
    <section
      id="testimonials"
      className="w-full border-t border-border px-3 py-10 sm:px-4 sm:py-12"
      aria-labelledby="store-testimonials-heading"
    >
      <div className="mx-auto w-full max-w-[1440px]">
        <div className="mb-6 max-w-2xl">
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: accent }}
          >
            Testimonials
          </p>
          <h2
            id="store-testimonials-heading"
            className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            What our customers say
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const meta = [item.role, item.company].filter(Boolean).join(' · ');
            const initial = String(item.authorName || '?').trim().charAt(0).toUpperCase() || '?';
            const photoUrl = resolveImageUrl(item.photoUrl);
            return (
              <figure
                key={item.id || `${item.authorName}-${item.quote?.slice(0, 24)}`}
                className="flex h-full flex-col rounded-2xl border border-border bg-card p-5"
              >
                <blockquote className="flex-1 text-base leading-7 text-foreground">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold text-white"
                      style={{ backgroundColor: accent }}
                      aria-hidden
                    >
                      {initial}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{item.authorName}</p>
                    {meta ? (
                      <p className="truncate text-sm text-muted-foreground">{meta}</p>
                    ) : null}
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
