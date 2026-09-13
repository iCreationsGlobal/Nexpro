const fs = require('fs');
const os = require('os');
const path = require('path');
const { ingestEvents } = require('./watchReconciliationService');
const { parseYoutubeUrl, clampDemoSeconds } = require('../utils/youtubeUrl');
const { SCRIPT, SHOP_ZONES, YOUTUBE_ZONES, runVisionEdge, resolveShopZonesPath } = require('./watchVisionEdgeService');

/**
 * Attach a playable YouTube clipReference so Review can embed the demo clip.
 * Reconciliation copies clipReference onto VisionIncident — do not stamp incidents here.
 *
 * @param {object[]} events
 * @param {{ videoId: string, watchUrl: string, maxSeconds: number }} source
 * @returns {object[]}
 */
const stampYoutubeClipOnEvents = (events, { videoId, watchUrl, maxSeconds } = {}) => {
  if (!Array.isArray(events) || !videoId) return [];
  const clipReference = `youtube:${videoId}`;
  return events.map((event) => ({
    ...event,
    clipReference,
    metadata: {
      ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
      videoId,
      watchUrl,
      maxSeconds,
      source: 'youtube_demo',
    },
  }));
};

const runPythonClip = ({ watchUrl, maxSeconds, startTime, outputPath, zonesPath }) => runVisionEdge({
  extraArgs: [
    '--youtube',
    watchUrl,
    '--zones',
    zonesPath || YOUTUBE_ZONES,
    '--max-seconds',
    String(maxSeconds),
    '--sample-fps',
    '5',
    '--dwell-seconds',
    '6',
    '--start-time',
    startTime,
  ],
  outputPath,
});

/**
 * Download a short YouTube clip on this machine, run local YOLO, ingest Watch events.
 * Demo only — not a live camera source.
 * @param {{ tenantId: string, shopId?: string|null, youtubeUrl: string, maxSeconds?: number }} args
 */
const processYoutubeClip = async ({
  tenantId,
  shopId = null,
  youtubeUrl,
  maxSeconds,
} = {}) => {
  if (!tenantId) {
    return { success: false, error: 'tenantId is required' };
  }
  const parsed = parseYoutubeUrl(youtubeUrl);
  if (!parsed) {
    return { success: false, error: 'Paste a YouTube URL (youtube.com or youtu.be).' };
  }
  if (!fs.existsSync(SCRIPT) || !fs.existsSync(SHOP_ZONES)) {
    return { success: false, error: 'vision-edge is not available on this server.' };
  }

  const seconds = clampDemoSeconds(maxSeconds);
  const startTime = new Date().toISOString();
  const outputPath = path.join(os.tmpdir(), `watch-demo-${tenantId}-${Date.now()}.json`);
  let zonesCleanup = null;

  try {
    const zones = await resolveShopZonesPath({ tenantId, shopId });
    zonesCleanup = zones.cleanupPath || null;
    const zonesPath = zones.zonesPath && fs.existsSync(zones.zonesPath)
      ? zones.zonesPath
      : YOUTUBE_ZONES;
    await runPythonClip({
      watchUrl: parsed.watchUrl,
      maxSeconds: seconds,
      startTime,
      outputPath,
      zonesPath,
    });
    const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const events = stampYoutubeClipOnEvents(payload.events || [], {
      videoId: parsed.videoId,
      watchUrl: parsed.watchUrl,
      maxSeconds: seconds,
    });
    if (!events.length) {
      return {
        success: true,
        data: {
          videoId: parsed.videoId,
          watchUrl: parsed.watchUrl,
          maxSeconds: seconds,
          eventCount: 0,
          received: 0,
          created: 0,
          skipped: 0,
          reconciliation: null,
        },
      };
    }

    const ingested = await ingestEvents({
      tenantId,
      shopId,
      events,
    });
    if (!ingested.success) {
      return ingested;
    }

    return {
      success: true,
      data: {
        videoId: parsed.videoId,
        watchUrl: parsed.watchUrl,
        maxSeconds: seconds,
        eventCount: events.length,
        ...ingested.data,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to process YouTube clip',
    };
  } finally {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // temp file may not exist if download failed first
    }
    if (zonesCleanup) {
      try {
        fs.unlinkSync(zonesCleanup);
      } catch {
        // temp zones file
      }
    }
  }
};

module.exports = {
  processYoutubeClip,
  stampYoutubeClipOnEvents,
  parseYoutubeUrl,
  clampDemoSeconds,
};
