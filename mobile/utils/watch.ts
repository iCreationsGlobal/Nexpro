/**
 * ABS Watch — physical shop activity compared with recorded sales.
 * Mirrors the web Watch page (Frontend/src/pages/Watch.jsx) and its constants.
 */
import { resolveImageUrl } from '@/utils/fileUtils';

export const WATCH_INCIDENT_KINDS = {
  MATCHED: 'matched',
  UNMATCHED_INTERACTION: 'unmatched_interaction',
  SALE_WITHOUT_EVENT: 'sale_without_event',
} as const;

export const WATCH_INCIDENT_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DISMISSED: 'dismissed',
  NEEDS_CONTEXT: 'needs_context',
} as const;

export const WATCH_REVIEW_DECISIONS = {
  CONFIRM: 'confirm',
  DISMISS: 'dismiss',
  NEEDS_CONTEXT: 'needs_context',
} as const;

export type WatchReviewDecision = (typeof WATCH_REVIEW_DECISIONS)[keyof typeof WATCH_REVIEW_DECISIONS];

export const WATCH_KIND_LABELS: Record<string, string> = {
  [WATCH_INCIDENT_KINDS.MATCHED]: 'Matched',
  [WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION]: 'Needs review',
  [WATCH_INCIDENT_KINDS.SALE_WITHOUT_EVENT]: 'Camera miss',
};

export const WATCH_STATUS_LABELS: Record<string, string> = {
  [WATCH_INCIDENT_STATUSES.PENDING]: 'Pending',
  [WATCH_INCIDENT_STATUSES.CONFIRMED]: 'Confirmed',
  [WATCH_INCIDENT_STATUSES.DISMISSED]: 'Dismissed',
  [WATCH_INCIDENT_STATUSES.NEEDS_CONTEXT]: 'Needs more context',
};

export const WATCH_INCIDENT_FILTERS = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'all', label: 'All' },
  { value: WATCH_INCIDENT_KINDS.UNMATCHED_INTERACTION, label: 'Unmatched' },
  { value: WATCH_INCIDENT_KINDS.SALE_WITHOUT_EVENT, label: 'Camera misses' },
  { value: WATCH_INCIDENT_KINDS.MATCHED, label: 'Matched' },
  { value: WATCH_INCIDENT_STATUSES.CONFIRMED, label: 'Confirmed' },
  { value: WATCH_INCIDENT_STATUSES.DISMISSED, label: 'Dismissed' },
] as const;

export type WatchIncidentFilter = (typeof WATCH_INCIDENT_FILTERS)[number]['value'];

export type WatchIncident = {
  id: string;
  kind?: string;
  status?: string;
  copy?: string;
  startedAt?: string;
  confidence?: number | string | null;
  saleId?: string | null;
  sale?: { saleNumber?: string | null } | null;
  reviewNote?: string | null;
  clipReference?: string | null;
  metadata?: Record<string, unknown> | null;
  event?: { clipReference?: string | null; metadata?: Record<string, unknown> | null } | null;
};

/** Same buckets as the web page: "attention" is pending, kinds filter by kind, the rest by status. */
export function watchIncidentParams(filter: WatchIncidentFilter): Record<string, string> {
  if (filter === 'attention') return { status: WATCH_INCIDENT_STATUSES.PENDING };
  if (filter === 'all') return {};
  if ((Object.values(WATCH_INCIDENT_KINDS) as string[]).includes(filter)) return { kind: filter };
  return { status: filter };
}

export function formatWatchConfidence(confidence: unknown): string {
  if (confidence == null || confidence === '') return '—';
  const value = Number(confidence);
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

export function formatWatchTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Local calendar day as YYYY-MM-DD — the `date` the Watch API uses for its day range. */
export function watchDayParam(daysAgo = 0, now: Date = new Date()): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

export type WatchClipSource = { type: 'youtube' | 'video'; url: string } | { type: 'none' };

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_PREFIXED = /^youtube:([\w-]{11})$/i;
const YOUTUBE_URL =
  /^https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i;

const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

function parseClipReference(raw: unknown): WatchClipSource | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const prefixed = text.match(YOUTUBE_PREFIXED);
  if (prefixed) return { type: 'youtube', url: youtubeWatchUrl(prefixed[1]) };
  if (YOUTUBE_ID.test(text)) return { type: 'youtube', url: youtubeWatchUrl(text) };
  const fromUrl = text.match(YOUTUBE_URL);
  if (fromUrl) return { type: 'youtube', url: youtubeWatchUrl(fromUrl[1]) };

  // Uploaded clips are served by the API; anything else (a path on the detection PC) can't be opened here.
  if (/^https?:\/\//i.test(text) || text.startsWith('/uploads/')) {
    return { type: 'video', url: resolveImageUrl(text) };
  }
  return null;
}

/** The clip to show for an incident (port of the web parseWatchClipSource). */
export function parseWatchClipSource(incident: WatchIncident | null | undefined): WatchClipSource {
  if (!incident) return { type: 'none' };
  const candidates = [
    incident.clipReference,
    incident.event?.clipReference,
    incident.metadata?.videoId,
    incident.metadata?.watchUrl,
    incident.event?.metadata?.videoId,
    incident.event?.metadata?.watchUrl,
  ];
  for (const candidate of candidates) {
    const parsed = parseClipReference(candidate);
    if (parsed) return parsed;
  }
  return { type: 'none' };
}
