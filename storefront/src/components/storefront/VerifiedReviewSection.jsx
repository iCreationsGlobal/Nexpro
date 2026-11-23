import { useEffect, useMemo, useState } from 'react';
import { Loader2, Star, ShieldCheck } from 'lucide-react';

import { formatInteger } from '../../utils/formatNumber';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const clampRating = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(parsed, 1), 5);
};

const accentText = 'text-[color:var(--store-accent,#166534)]';
const accentSoftBg = 'bg-[var(--store-accent-soft,#f0fdf4)]';
const accentBorder = 'border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,hsl(var(--border)))]';
const accentBorderSoft = 'border-[color:color-mix(in_srgb,var(--store-accent,#166534)_18%,hsl(var(--border)))]';
const accentFocus = 'focus:border-[color:var(--store-accent,#166534)]';
const accentButton =
  'rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]';

export const StarRatingPicker = ({
  value = 0,
  onChange,
  label,
  disabled = false,
}) => (
  <div>
    <p className="text-sm font-bold text-foreground">{label}</p>
    <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label={label}>
      {Array.from({ length: 5 }).map((_, index) => {
        const rating = index + 1;
        const active = rating <= value;
        return (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onChange(rating)}
            className={`rounded-full p-1 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-amber-400/10'}`}
            aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
          >
            <Star className={`h-6 w-6 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        );
      })}
    </div>
  </div>
);

export const RatingStars = ({ rating = 0, sizeClass = 'h-4 w-4' }) => (
  <span className="inline-flex items-center gap-0.5 text-amber-500">
    {Array.from({ length: 5 }).map((_, index) => {
      const active = index < Math.round(Number(rating || 0));
      return (
        <Star
          key={index}
          className={`${sizeClass} ${active ? 'fill-current' : 'text-slate-300'}`}
          aria-hidden="true"
        />
      );
    })}
  </span>
);

export const ReviewSummaryLine = ({ summary }) => {
  const rating = Number(summary?.rating || 0);
  const count = Number(summary?.reviewsCount || 0);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <RatingStars rating={rating} />
      <span className="font-bold text-foreground">{rating ? rating.toFixed(1) : 'No rating yet'}</span>
      <span className="text-muted-foreground">
        {count ? `${formatInteger(count)} verified ${count === 1 ? 'review' : 'reviews'}` : 'No verified reviews yet'}
      </span>
    </div>
  );
};

export const ReviewList = ({ reviews = [], emptyText = 'No verified reviews yet.' }) => {
  if (!reviews.length) {
    return (
      <div className="rounded-2xl border border-border bg-muted/50 p-5 text-sm text-muted-foreground sm:rounded-3xl">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {reviews.map((review) => (
        <article key={review.id} className="rounded-2xl border border-border bg-card p-5 sm:rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <RatingStars rating={review.rating} />
            <Badge variant="outline" className={`${accentBorder} ${accentSoftBg} ${accentText}`}>
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              Verified purchase
            </Badge>
          </div>
          {review.title ? <h3 className="mt-3 font-black text-foreground">{review.title}</h3> : null}
          {review.comment ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.comment}</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Rated without a written comment.</p>
          )}
          <p className="mt-4 text-sm font-bold text-foreground">{review.reviewerName || 'Verified shopper'}</p>
        </article>
      ))}
    </div>
  );
};

export const VerifiedReviewForm = ({
  eligibility,
  isAuthenticated,
  isEligibilityLoading = false,
  isSubmitting = false,
  onRequireAuth,
  onSubmit,
  targetLabel = 'this item',
}) => {
  const existingReview = eligibility?.existingReview || null;
  const canSubmit = Boolean(eligibility?.eligible || existingReview);
  const [form, setForm] = useState({ rating: 5, title: '', comment: '' });

  useEffect(() => {
    if (!existingReview) return;
    setForm({
      rating: clampRating(existingReview.rating || 5),
      title: existingReview.title || '',
      comment: existingReview.comment || '',
    });
  }, [existingReview]);

  const helperText = useMemo(() => {
    if (!isAuthenticated) return `Sign in to check whether your delivered order can review ${targetLabel}.`;
    if (isEligibilityLoading) return 'Checking your delivered orders...';
    if (canSubmit) return existingReview ? 'You already reviewed this purchase. You can update it here.' : 'Your delivered purchase is verified. Share your experience.';
    return eligibility?.reason || `Only shoppers with a delivered purchase can review ${targetLabel}.`;
  }, [canSubmit, eligibility?.reason, existingReview, isAuthenticated, isEligibilityLoading, targetLabel]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    onSubmit?.({
      ...form,
      rating: clampRating(form.rating),
      saleId: eligibility?.saleId || undefined,
    });
  };

  return (
    <div
      className={`rounded-2xl border ${accentBorderSoft} p-5 sm:rounded-3xl`}
      style={{ backgroundColor: 'color-mix(in srgb, var(--store-accent, #166534) 8%, hsl(var(--card)))' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-bold uppercase tracking-wide ${accentText}`}>Verified purchase review</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{helperText}</p>
        </div>
        {!isAuthenticated ? (
          <Button type="button" className={accentButton} onClick={onRequireAuth}>
            Sign in to review
          </Button>
        ) : null}
      </div>

      {isAuthenticated && isEligibilityLoading ? (
        <div className={`mt-4 inline-flex items-center rounded-full border ${accentBorder} bg-background px-4 py-2 text-sm font-semibold ${accentText}`}>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Checking eligibility
        </div>
      ) : null}

      {isAuthenticated && canSubmit ? (
        <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
          <div className={`rounded-2xl border ${accentBorder} bg-background p-3`}>
            <StarRatingPicker
              value={form.rating}
              onChange={(rating) => setForm((current) => ({ ...current, rating: clampRating(rating) }))}
              label="Rating"
              disabled={isSubmitting}
            />
          </div>
          <label className="text-sm font-bold text-foreground">
            Title (optional)
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value.slice(0, 120) }))}
              className={`mt-1 h-11 w-full rounded-2xl border ${accentBorder} bg-background px-3 text-sm outline-none ${accentFocus}`}
              placeholder="Short review title"
            />
          </label>
          <label className="text-sm font-bold text-foreground">
            Review (optional)
            <textarea
              value={form.comment}
              onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value.slice(0, 1000) }))}
              className={`mt-1 min-h-28 w-full rounded-2xl border ${accentBorder} bg-background px-3 py-3 text-sm outline-none ${accentFocus}`}
              placeholder="What should other shoppers know?"
            />
          </label>
          <Button type="submit" className={accentButton} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {existingReview ? 'Update review' : 'Publish review'}
          </Button>
        </form>
      ) : null}
    </div>
  );
};
