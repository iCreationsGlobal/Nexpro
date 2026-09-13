const { Op } = require('sequelize');
const { VisionEvent, VisionIncident, VisionCamera, Sale } = require('../models');
const {
  COUNTER_EVENT_TYPES,
  VISITOR_EVENT_TYPES,
  MATCHABLE_SALE_STATUSES,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
  REVIEW_DECISIONS,
} = require('../config/watchConstants');
const {
  clampMatchWindowMinutes,
  matchWindowMs,
  isCounterEventType,
  findBestSaleMatch,
  classifyIncidentKind,
  copyForKind,
  toTimestamp,
} = require('./watchMatching');
const { sanitizeClipReference } = require('../utils/watchClipReference');
const { sanitizeStreamUrl } = require('../utils/watchStreamUrl');

const DECISION_TO_STATUS = {
  [REVIEW_DECISIONS.CONFIRM]: INCIDENT_STATUSES.CONFIRMED,
  [REVIEW_DECISIONS.DISMISS]: INCIDENT_STATUSES.DISMISSED,
  [REVIEW_DECISIONS.NEEDS_CONTEXT]: INCIDENT_STATUSES.NEEDS_CONTEXT,
};

const shopWhere = (shopId) => (shopId ? { shopId } : {});

const VIDEO_PAYLOAD_KEYS = ['video', 'videoBytes', 'frames', 'image', 'base64', 'mp4'];

/**
 * Ingest stores events only — drop any video bytes a client stuffed into JSON.
 * @param {object} value
 * @returns {object}
 */
const stripVideoPayload = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = { ...value };
  for (const key of VIDEO_PAYLOAD_KEYS) {
    delete next[key];
  }
  return next;
};

/**
 * @param {object} raw
 * @returns {object|null}
 */
const normalizeIncomingEvent = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const eventType = String(raw.eventType || raw.event_type || '').trim();
  const startedAt = raw.startedAt || raw.started_at || raw.timestamp;
  if (!eventType || !startedAt) return null;
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return null;
  const endedRaw = raw.endedAt || raw.ended_at;
  const ended = endedRaw ? new Date(endedRaw) : null;
  const confidence = Number(raw.confidence);
  return {
    clientEventId: raw.clientEventId || raw.event_id || raw.client_event_id || null,
    cameraId: raw.cameraId || raw.camera_id || null,
    eventType,
    trackId: raw.trackId || raw.track_id || raw.person_id || null,
    startedAt: started,
    endedAt: ended && !Number.isNaN(ended.getTime()) ? ended : null,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    zone: raw.zone || null,
    clipReference: sanitizeClipReference(raw.clipReference || raw.clip_reference),
    attributes: stripVideoPayload(raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : {}),
    metadata: stripVideoPayload(raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}),
  };
};

const serializeIncident = (incident, sale = null) => {
  const plain = incident.toJSON ? incident.toJSON() : incident;
  return {
    ...plain,
    copy: copyForKind(plain.kind),
    sale: sale
      ? {
          id: sale.id,
          saleNumber: sale.saleNumber,
          total: sale.total,
          createdAt: sale.createdAt,
          status: sale.status,
        }
      : plain.sale || null,
  };
};

/**
 * Persist new vision events, then reconcile against Sale.createdAt.
 * @param {{ tenantId: string, shopId?: string|null, events: object[], matchWindowMinutes?: number, clipReference?: string }} args
 */
const ingestEvents = async ({ tenantId, shopId = null, events = [], matchWindowMinutes, clipReference } = {}) => {
  if (!tenantId) {
    return { success: false, error: 'tenantId is required' };
  }
  const batchClip = sanitizeClipReference(clipReference, { tenantId });
  const incoming = (Array.isArray(events) ? events : [])
    .map((raw) => {
      const normalized = normalizeIncomingEvent(raw);
      if (!normalized) return null;
      normalized.clipReference = sanitizeClipReference(normalized.clipReference, { tenantId })
        || batchClip
        || null;
      return normalized;
    })
    .filter(Boolean);
  if (!incoming.length) {
    return { success: false, error: 'No valid events to ingest' };
  }

  const clientIds = incoming.map((event) => event.clientEventId).filter(Boolean);
  const existing = clientIds.length
    ? await VisionEvent.findAll({
        where: { tenantId, clientEventId: { [Op.in]: clientIds } },
        attributes: ['id', 'clientEventId'],
      })
    : [];
  const existingIds = new Set(existing.map((row) => row.clientEventId));

  const toCreate = incoming
    .filter((event) => !event.clientEventId || !existingIds.has(event.clientEventId))
    .map((event) => ({
      ...event,
      tenantId,
      shopId: shopId || event.metadata?.shopId || null,
    }));

  const created = toCreate.length ? await VisionEvent.bulkCreate(toCreate) : [];

  const times = incoming.map((event) => toTimestamp(event.startedAt)).filter(Number.isFinite);
  const windowMs = matchWindowMs(matchWindowMinutes);
  const startAt = new Date(Math.min(...times) - windowMs);
  const endAt = new Date(Math.max(...times) + windowMs);

  const reconciliation = await reconcilePeriod({
    tenantId,
    shopId,
    startAt,
    endAt,
    matchWindowMinutes,
  });

  return {
    success: true,
    data: {
      received: incoming.length,
      created: created.length,
      skipped: incoming.length - created.length,
      reconciliation: reconciliation.data,
    },
  };
};

/**
 * Match counter interactions to sales and flag camera misses.
 * Late-arriving POS sync can upgrade unmatched incidents to matched.
 * @param {{ tenantId: string, shopId?: string|null, startAt: Date, endAt: Date, matchWindowMinutes?: number }} args
 */
const reconcilePeriod = async ({
  tenantId,
  shopId = null,
  startAt,
  endAt,
  matchWindowMinutes,
} = {}) => {
  if (!tenantId || !startAt || !endAt) {
    return { success: false, error: 'tenantId, startAt, and endAt are required' };
  }

  const windowMs = matchWindowMs(matchWindowMinutes);
  const scope = { tenantId, ...shopWhere(shopId) };
  const range = { [Op.between]: [startAt, endAt] };

  const [events, sales, incidents] = await Promise.all([
    VisionEvent.findAll({
      where: {
        ...scope,
        eventType: { [Op.in]: COUNTER_EVENT_TYPES },
        startedAt: range,
      },
      order: [['startedAt', 'ASC']],
    }),
    Sale.findAll({
      where: {
        ...scope,
        status: { [Op.in]: MATCHABLE_SALE_STATUSES },
        createdAt: range,
        deletedAt: null,
      },
      attributes: ['id', 'saleNumber', 'total', 'createdAt', 'status', 'shopId'],
      order: [['createdAt', 'ASC']],
    }),
    VisionIncident.findAll({
      where: {
        ...scope,
        startedAt: range,
      },
    }),
  ]);

  const usedSaleIds = new Set(
    incidents
      .filter((row) => row.saleId && row.kind === INCIDENT_KINDS.MATCHED)
      .map((row) => row.saleId)
  );
  const incidentByEventId = new Map(
    incidents.filter((row) => row.eventId).map((row) => [row.eventId, row])
  );
  const incidentBySaleId = new Map(
    incidents.filter((row) => row.saleId).map((row) => [row.saleId, row])
  );

  let created = 0;
  let updated = 0;

  for (const event of events) {
    if (!isCounterEventType(event.eventType)) continue;
    const match = findBestSaleMatch({
      eventTime: event.startedAt,
      sales,
      windowMs,
      usedSaleIds,
    });
    const sale = match?.sale || null;
    const kind = classifyIncidentKind({ sale });
    if (sale) usedSaleIds.add(sale.id);

    const existingIncident = incidentByEventId.get(event.id);
    const payload = {
      tenantId,
      shopId: event.shopId || shopId || null,
      kind,
      eventId: event.id,
      saleId: sale?.id || null,
      trackId: event.trackId,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      confidence: event.confidence,
      clipReference: event.clipReference,
      metadata: {
        ...(existingIncident?.metadata || {}),
        matchDeltaMs: match ? match.deltaMs : null,
        copy: copyForKind(kind),
      },
    };

    if (existingIncident) {
      const shouldUpgrade =
        existingIncident.kind !== INCIDENT_KINDS.MATCHED && kind === INCIDENT_KINDS.MATCHED;
      const shouldRefreshSale = existingIncident.saleId !== (sale?.id || null);
      if (shouldUpgrade || shouldRefreshSale) {
        await existingIncident.update({
          ...payload,
          status: shouldUpgrade ? INCIDENT_STATUSES.PENDING : existingIncident.status,
        });
        updated += 1;
      }
    } else {
      const createdRow = await VisionIncident.create({
        ...payload,
        status: INCIDENT_STATUSES.PENDING,
      });
      incidentByEventId.set(event.id, createdRow);
      if (sale) incidentBySaleId.set(sale.id, createdRow);
      created += 1;
    }
  }

  for (const sale of sales) {
    if (incidentBySaleId.has(sale.id) || usedSaleIds.has(sale.id)) continue;
    const createdRow = await VisionIncident.create({
      tenantId,
      shopId: sale.shopId || shopId || null,
      kind: INCIDENT_KINDS.SALE_WITHOUT_EVENT,
      status: INCIDENT_STATUSES.PENDING,
      eventId: null,
      saleId: sale.id,
      startedAt: sale.createdAt,
      endedAt: sale.createdAt,
      confidence: 0,
      metadata: { copy: copyForKind(INCIDENT_KINDS.SALE_WITHOUT_EVENT) },
    });
    incidentBySaleId.set(sale.id, createdRow);
    created += 1;
  }

  return {
    success: true,
    data: {
      eventsConsidered: events.length,
      salesConsidered: sales.length,
      incidentsCreated: created,
      incidentsUpdated: updated,
      matchWindowMinutes: clampMatchWindowMinutes(matchWindowMinutes),
    },
  };
};

/**
 * @param {{ tenantId: string, incidentId: string, userId: string, decision: string, note?: string }} args
 */
const reviewIncident = async ({ tenantId, incidentId, userId, decision, note } = {}) => {
  const status = DECISION_TO_STATUS[decision];
  if (!status) {
    return { success: false, error: 'Review must be confirm, dismiss, or needs_context' };
  }

  const incident = await VisionIncident.findOne({ where: { id: incidentId, tenantId } });
  if (!incident) {
    return { success: false, error: 'Incident not found' };
  }

  await incident.update({
    status,
    reviewNote: note ? String(note).trim() : incident.reviewNote,
    reviewedBy: userId || null,
    reviewedAt: new Date(),
  });

  return { success: true, data: serializeIncident(incident) };
};

/**
 * Unique people for the Visitors card.
 * Clipped rows: distinct (clipReference, trackId) so YOLO id 1 on clip A is not
 * the same person as id 1 on clip B. Rows with no clipReference fall back to
 * distinct trackId only (live ingest / older rows). Empty track ids are skipped.
 *
 * @param {object[]} rows
 * @returns {number}
 */
const countUniqueVisitorPeople = (rows) => {
  const clipped = new Set();
  const unclipped = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const trackId = String(row?.trackId || row?.track_id || '').trim();
    if (!trackId) return;
    const clip = row.clipReference || row.clip_reference || null;
    if (clip) clipped.add(`${clip}::${trackId}`);
    else unclipped.add(trackId);
  });
  return clipped.size + unclipped.size;
};

/**
 * @param {{ tenantId: string, shopId?: string|null, startAt: Date, endAt: Date }} args
 */
const getSummary = async ({ tenantId, shopId = null, startAt, endAt } = {}) => {
  const scope = { tenantId, ...shopWhere(shopId) };
  const range = { [Op.between]: [startAt, endAt] };

  const [visitorRows, counterEvents, sales, incidents] = await Promise.all([
    VisionEvent.findAll({
      where: { ...scope, eventType: { [Op.in]: VISITOR_EVENT_TYPES }, startedAt: range },
      attributes: ['clipReference', 'trackId'],
    }),
    VisionEvent.count({
      where: { ...scope, eventType: { [Op.in]: COUNTER_EVENT_TYPES }, startedAt: range },
    }),
    Sale.count({
      where: {
        ...scope,
        status: { [Op.in]: MATCHABLE_SALE_STATUSES },
        createdAt: range,
        deletedAt: null,
      },
    }),
    VisionIncident.findAll({
      where: { ...scope, startedAt: range },
      attributes: ['id', 'kind', 'status'],
    }),
  ]);

  const pending = incidents.filter((row) => row.status === INCIDENT_STATUSES.PENDING);
  const unmatched = pending.filter((row) => row.kind === INCIDENT_KINDS.UNMATCHED_INTERACTION);
  const cameraMisses = pending.filter((row) => row.kind === INCIDENT_KINDS.SALE_WITHOUT_EVENT);
  const matched = incidents.filter((row) => row.kind === INCIDENT_KINDS.MATCHED);

  return {
    success: true,
    data: {
      visitors: countUniqueVisitorPeople(visitorRows),
      counterInteractions: counterEvents,
      recordedSales: sales,
      matched: matched.length,
      unmatchedInteractions: unmatched.length,
      cameraMisses: cameraMisses.length,
      attentionRequired: unmatched.length + cameraMisses.length,
    },
  };
};

/**
 * @param {{ tenantId: string, shopId?: string|null, kind?: string, status?: string, startAt?: Date, endAt?: Date, limit?: number, offset?: number }} args
 */
const listIncidents = async ({
  tenantId,
  shopId = null,
  kind,
  status,
  startAt,
  endAt,
  limit = 50,
  offset = 0,
} = {}) => {
  const where = { tenantId, ...shopWhere(shopId) };
  if (kind) where.kind = kind;
  if (status) where.status = status;
  if (startAt && endAt) where.startedAt = { [Op.between]: [startAt, endAt] };

  const { rows, count } = await VisionIncident.findAndCountAll({
    where,
    include: [
      { model: Sale, as: 'sale', attributes: ['id', 'saleNumber', 'total', 'createdAt', 'status'], required: false },
      { model: VisionEvent, as: 'event', attributes: ['id', 'eventType', 'trackId', 'startedAt', 'clipReference'], required: false },
    ],
    order: [['startedAt', 'DESC']],
    limit: Math.min(Number(limit) || 50, 100),
    offset: Number(offset) || 0,
  });

  return {
    success: true,
    data: rows.map((row) => serializeIncident(row, row.sale)),
    pagination: { total: count, limit: Math.min(Number(limit) || 50, 100), offset: Number(offset) || 0 },
  };
};

const listEvents = async ({
  tenantId,
  shopId = null,
  startAt,
  endAt,
  limit = 100,
  offset = 0,
} = {}) => {
  const where = { tenantId, ...shopWhere(shopId) };
  if (startAt && endAt) where.startedAt = { [Op.between]: [startAt, endAt] };

  const { rows, count } = await VisionEvent.findAndCountAll({
    where,
    order: [['startedAt', 'DESC']],
    limit: Math.min(Number(limit) || 100, 200),
    offset: Number(offset) || 0,
  });

  return {
    success: true,
    data: rows,
    pagination: { total: count, limit: Math.min(Number(limit) || 100, 200), offset: Number(offset) || 0 },
  };
};

const listCameras = async ({ tenantId, shopId = null } = {}) => {
  const rows = await VisionCamera.findAll({
    where: { tenantId, ...shopWhere(shopId) },
    order: [['createdAt', 'ASC']],
  });
  return { success: true, data: rows };
};

const upsertCamera = async ({ tenantId, shopId = null, cameraId, payload = {}, userId } = {}) => {
  const rawStream = payload.streamUrl != null ? String(payload.streamUrl).trim() : '';
  if (rawStream && !sanitizeStreamUrl(rawStream)) {
    return {
      success: false,
      error: 'Stream URL must be rtsp://, rtsps://, http://, or https://',
    };
  }
  const body = {
    name: String(payload.name || '').trim(),
    role: payload.role || 'counter',
    deviceId: payload.deviceId || null,
    streamUrl: sanitizeStreamUrl(rawStream),
    zones: Array.isArray(payload.zones) ? payload.zones : [],
    isActive: payload.isActive !== false,
    metadata: {
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
      updatedBy: userId || null,
    },
  };
  if (!body.name) {
    return { success: false, error: 'Camera name is required' };
  }

  if (cameraId) {
    const existing = await VisionCamera.findOne({ where: { id: cameraId, tenantId } });
    if (!existing) return { success: false, error: 'Camera not found' };
    await existing.update({ ...body, shopId: shopId || existing.shopId });
    return { success: true, data: existing };
  }

  const created = await VisionCamera.create({ ...body, tenantId, shopId });
  return { success: true, data: created };
};

module.exports = {
  ingestEvents,
  reconcilePeriod,
  reviewIncident,
  getSummary,
  listIncidents,
  listEvents,
  listCameras,
  upsertCamera,
  normalizeIncomingEvent,
  countUniqueVisitorPeople,
};
