---
name: Watch till install and detection
overview: Document the human till-zone install path (already in Watch), stop silent default-zone fallback, then add a confirm-only furniture YOLO proposal. Optional per-camera till/counter fine-tune is later and never shop identity.
todos:
  - id: p0-install-runbook
    content: Document installer vs owner till-draw runbook; export VisionCamera.zones for shop-PC run_stream.py; require a saved counter box before dwell runs
  - id: p0-no-silent-default
    content: Stop examples/zones.json and DEFAULT_TILL_ZONE as production fallbacks; empty overlay until a zone is saved; fail clip/stream if no counter zone
  - id: p0-per-camera-zones
    content: Process clips and always-on windows with that camera’s zones (not first counter camera); stamp VisionCamera.id on ingest
  - id: p1-furniture-propose
    content: Generic COCO furniture YOLO on one still → amber box → same Save till zone path; never auto-save
  - id: p1-confirm-ui
    content: Watch confirm/reject/redraw UX (amber proposed vs green saved); manager/admin only
  - id: p2-optional-finetune
    content: Only if Phase 1 fails on real counters; few stills from that camera; tenant/camera weights on the shop PC
---

# ABS Watch — till placement and camera install

## Product decision (locked)

When ABS integrates a shop CCTV camera, **someone draws the till once per camera view**. That rectangle is saved on `VisionCamera.zones` and reused for every clip and every always-on window. It is not redrawn per clip.

- Two cameras = two boxes (two `VisionCamera` rows).
- Till moved or remodelled = move the box on that camera and save again.
- Cameras are sensors. ABS matches **events to sales**. We do not train a model to recognize the shop, branding, or layout fingerprint.
- Always-on first slice already exists: `vision-edge/run_stream.py` on a shop PC posts **events + optional short snippets**. ABS does not show live RTSP.

**Ship order:** Phase 0 (install + stop silent defaults) → Phase 1 (propose + confirm) → Phase 2 (optional fine-tune). Fine-tune does **not** block install.

## Gating

- Feature key: `watch` (`Backend/config/features.js`). Route `/watch`.
- Business types with the feature listed today: **shop, pharmacy, studio, rental** (`Backend/config/businessTypes.js`). Typical CCTV install is shop/pharmacy; studio/rental still see Watch if the plan includes it.
- Plans: **trial / professional / enterprise** include `watch`; **starter does not**.
- UI + camera/zone writes: `admin` / `manager` only (`isManager` / `authorize('admin', 'manager')`). Staff can ingest events from the shop PC; they cannot draw the till in Watch.
- Mobile: Watch is web-only (not in the Expo out-of-scope list as an implementation target). Do not add till drawing to mobile in this work.

## Current codebase (baseline — do not invent APIs)

### Already built (human draw)

| Piece | What it does |
|-------|----------------|
| [Frontend/src/pages/Watch.jsx](Frontend/src/pages/Watch.jsx) | “Cameras and zones”: draw till, **Save till zone**, add camera + optional `streamUrl`, copy-paste `run_stream.py` command. |
| [Frontend/src/components/watch/WatchTillZoneEditor.jsx](Frontend/src/components/watch/WatchTillZoneEditor.jsx) | Green dashed box (`border-[#166534]`), drag on clip still, 0–1 sliders. |
| [Frontend/src/utils/watchTillZone.js](Frontend/src/utils/watchTillZone.js) | `clampTillZone`, `zoneFromDrag`, `tillZoneFromCamera`. |
| `POST /api/watch/cameras` · `PUT /api/watch/cameras/:id` | [Backend/routes/watchRoutes.js](Backend/routes/watchRoutes.js) → `upsertWatchCamera` → [upsertCamera](Backend/services/watchReconciliationService.js). |
| `VisionCamera.zones` | JSONB array `{ name, type, x, y, w, h }`. Counter box uses `type: "counter"`. [Backend/models/VisionCamera.js](Backend/models/VisionCamera.js). |
| Dwell | `DEFAULT_DWELL_SECONDS = 6.0` + `STILLNESS_MAX_STDEV = 0.045` in [vision-edge/abs_vision/events.py](vision-edge/abs_vision/events.py). Clip process passes `--dwell-seconds 6`. |
| Person YOLO | [vision-edge/abs_vision/detect.py](vision-edge/abs_vision/detect.py) `classes=[0]` (person only). Local `yolov8n.pt`. Frames never go to an LLM. |
| Always-on | [vision-edge/run_stream.py](vision-edge/run_stream.py) → `POST /api/watch/events`. Snippet upload only when `counter_interaction` fires. |
| Matching | Only `counter_interaction` opens unmatched-sale review ([Backend/config/watchConstants.js](Backend/config/watchConstants.js)). `person_entered_counter_zone` is diagnostic. |

There is **no** Watch architecture markdown in-repo (unlike rental docs). Prior till work lives in Watch UI + vision-edge tests.

### Gaps that this plan must close

1. **Silent default till.** `resolveShopZonesPath` in [Backend/services/watchVisionEdgeService.js](Backend/services/watchVisionEdgeService.js) falls back to [vision-edge/examples/zones.json](vision-edge/examples/zones.json) (`x: 0.68, y: 0.52, w: 0.26, h: 0.42`) when the tenant has no counter camera with a `type: "counter"` zone. Same numbers as `DEFAULT_TILL_ZONE`. Clip “Upload and detect” can therefore count till time against a **demo phone-counter box**, not this shop.
2. **Shop-PC command ignores saved zones.** [Frontend/src/utils/watchStreamCommand.js](Frontend/src/utils/watchStreamCommand.js) always prints `--zones vision-edge/examples/zones.json`. Saving the till in Watch does **not** change what `run_stream.py` uses unless the installer copies a file by hand.
3. **Clip process is not camera-scoped.** `processUploadedClip` / `POST /api/watch/clips/process` takes `{ clipUrl, maxSeconds }` only — **no `cameraId`**. Zones come from the **oldest** active counter camera that already has a counter zone (`createdAt ASC`). Two cameras → wrong box on the second view.
4. **Ingest does not stamp `VisionCamera.id`.** Edge events put `camera` (name string) in `attributes`. `normalizeIncomingEvent` reads `cameraId` / `camera_id`, which `process_source` never sets. `VisionEvent.cameraId` stays null for the usual path.
5. **Editor shows a fake till before save.** `tillZoneFromCamera` returns `DEFAULT_TILL_ZONE` when `zones` is empty. The green box looks real. **Add camera** with role `counter` writes that default into JSONB without an explicit till save.
6. **Still vs video.** The editor uses a `<video preload="metadata">` of the last uploaded clip (`object-contain` on `aspect-video`). Letterboxing can misalign the overlay vs pixels YOLO uses. No RTSP snapshot API exists (by design — no live video in ABS).
7. **No furniture proposal code.** YOLO never runs COCO table/tv/laptop/chair classes. No amber overlay, no propose endpoint.

`examples/zones.json` / `zones.youtube.json` stay **fixtures for unit tests and local demos**, not production defaults.

---

## A. Phase 0 — Install runbook (human draw)

**Goal:** One site visit (or owner in Watch) produces a saved counter rectangle per camera. Dwell uses that box. No silent demo zone.

This is the **documented install path** even though the editor already exists. Remaining work is wiring, export, and refusing to run without a saved zone.

### Owners

| Role | Does |
|------|------|
| **ABS installer (on site)** | Mount/aim camera; confirm RTSP on shop PC; log in as workspace **admin/manager**; upload a short still-source clip **or** use an existing snippet; draw till; Save till zone; download zones JSON; start `run_stream.py`. |
| **Shop owner / manager (Watch)** | Same draw/save if they skip a site visit. Must have `watch` + manager. |
| **System** | Persist `VisionCamera.zones`; refuse person→till events until a counter zone exists; never invent a huge default till. |
| **Staff** | May run the shop-PC process with credentials that can `POST /api/watch/events`. They do not draw zones in Watch. |

### Install steps (human draw)

1. **Workspace** — Tenant has `watch`. Active shop selected (`shopContext`).
2. **Camera row** — Watch → Cameras and zones → name + role **Counter** + optional `streamUrl` (`rtsp://` / `rtsps://` / `http://` / `https://` via [Backend/utils/watchStreamUrl.js](Backend/utils/watchStreamUrl.js)). **Do not** write a counter zone until the human draws (or Phase 1 confirms). Entrance/floor/exit cameras store `zones: []`.
3. **Still for drawing** — Preferred: **Upload a short clip** (existing `POST /api/watch/clips`, 30 MB MP4/WebM). Editor uses that file as the still. Alternative for always-on only: installer grabs one local frame on the shop PC (OpenCV/ffmpeg) and uploads it as a tiny clip — still no live RTSP in the browser.
4. **Draw** — Green dashed box around the **till / register / scale**, not the whole counter queue, not the door. Walk-ins should miss this box. Copy already on the editor.
5. **Save till zone** — Existing `PUT /api/watch/cameras/:id` with `zones: [{ name: "counter", type: "counter", x, y, w, h }]`. Replaces the camera’s `zones` array today (one counter box per camera is the contract).
6. **Always-on** — On the shop PC (same LAN as the camera):

   ```bash
   python3 vision-edge/run_stream.py \
     --stream 'rtsp://CAMERA_IP/stream' \
     --zones /path/to/this-camera-zones.json \
     --post https://api.example/api/watch/events \
     --email OWNER_EMAIL --password '…'
   ```

   `--zones` must be **this camera’s exported JSON**, not `examples/zones.json`. ABS still does not ingest live video (`ingest_body_contains_video` in [vision-edge/abs_vision/stream.py](vision-edge/abs_vision/stream.py)).
7. **Clip-only shops** — Skip RTSP. Owner uploads clips; `POST /api/watch/clips/process` must use **that camera’s** saved zones (see files below).
8. **Multi-camera** — Repeat 2–6 per view. Selector “Apply till zone to” already lists `role === 'counter'` cameras.
9. **Remodel / till moved** — Open the same camera, redraw, Save till zone. Copy the new JSON to the shop PC (or re-download). No retrain in Phase 0.
10. **Verify** — Walk through the shop (visitor only). Stand still in the box ~6s (counter_interaction). Ring a POS sale in the 3–10 minute match window. Review in Watch.

### Phase 0 engineering (required)

| File | Change |
|------|--------|
| `Frontend/src/utils/watchTillZone.js` | `tillZoneFromCamera` returns `null` (or `{ missing: true }`) when no `type === 'counter'` zone. Stop substituting `DEFAULT_TILL_ZONE` for live cameras. Keep `DEFAULT_TILL_ZONE` only as a test/demo constant if tests still need it. |
| `Frontend/src/pages/Watch.jsx` | Empty editor until a zone exists or the user starts drawing. **Add camera** with role counter does **not** persist a default box. Disable **Save till zone** until the rectangle was drawn/adjusted (min size already 0.05). Banner: “Till zone not set — walk-ins will not be compared to sales.” |
| `Frontend/src/utils/watchStreamCommand.js` | After a camera with `streamUrl` + saved zones exists: tell the installer to download zones JSON; command uses that path. Never advertise `examples/zones.json` as the production `--zones`. |
| `Frontend/src/services/watchService.js` | `GET` zones export (new) or reuse `GET /watch/cameras` and a client-side download of `{ camera, cameraId, zones }`. |
| `Backend/services/watchVisionEdgeService.js` | `resolveShopZonesPath({ tenantId, shopId, cameraId })`. **No** `SHOP_ZONES` fallback for tenant jobs. If no counter zone: return `{ success: false, error: 'Save a till zone for this camera before detecting people.' }`. `processUploadedClip` accepts `cameraId`. |
| `Backend/controllers/watchController.js` | Pass `req.body.cameraId` into `processUploadedClip`. |
| `Frontend/src/components/watch/WatchClipUploadCard.jsx` | Send selected `zoneCameraId` with process. |
| `vision-edge/run_stream.py` + `process_mp4.py` | If zones file has no `type: counter` rectangle, exit non-zero with a clear message. Optional `--camera-id UUID` written onto each event as `camera_id` for ingest. |
| `Backend/services/watchReconciliationService.js` | Prefer `camera_id` on ingest; optionally resolve by `attributes.camera` name within tenant/shop. |
| Tests | `watchTillZone.test.js`, `watchVisionEdgeService.test.js` (no fallback to examples), `watchStreamCommand.test.js`, new controller test for missing zone / cameraId. vision-edge: empty zones → no `counter_interaction`. |

**Data stored (Phase 0):** unchanged schema. Optional `metadata.tillZone` provenance later: `{ source: 'human', updatedAt, updatedBy }` via existing `metadata.updatedBy` on upsert.

**Dwell:** keep 6s + stillness. Still not SKU detection.

---

## B. Phase 1 — Propose till (generic furniture, no per-shop training)

**Goal:** One extra YOLO pass on **COCO furniture-like classes** suggests an amber box. Installer/owner **confirms or redraws**. Save path is identical to Phase 0 (`VisionCamera.zones`).

### COCO classes (YOLOv8 default 80 — `yolov8n.pt`)

Person pass stays `classes=[0]`. Proposal pass is a **separate** inference (one still, not every stream frame).

| COCO id | Name | Use for till proposal? |
|---------|------|------------------------|
| 56 | chair | Yes — seating at / behind counter |
| 57 | couch | Weak; only if nothing else |
| 60 | dining table | Yes — closest to “counter surface” |
| 62 | tv | Yes — POS / customer display |
| 63 | laptop | Yes — POS laptop |
| 64 | mouse | Weak; ignore unless clustered with laptop |
| 66 | keyboard | Yes — with laptop/tv |
| 67 | cell phone | No — too common, not a till |
| 72 | refrigerator | Pharmacy/shop coolers — **do not** treat as till |
| 0 | person | **Never** for the till box |

There is **no** COCO class for cash register, till, counter, or scale. Phase 1 is a **heuristic proposal**, not “we found the till.” Copy must say that.

### Heuristic (implement in vision-edge, unit-test without GPU)

On one RGB still (normalized 0–1 boxes from YOLO):

1. Run YOLO with `classes=[56, 60, 62, 63, 66]` (chair, dining table, tv, laptop, keyboard).
2. Drop boxes with conf &lt; 0.25 (tune in tests).
3. Prefer **dining table**; else union of **tv + laptop + keyboard** if IoU/nearby; else largest **chair** in the lower 60% of the frame.
4. Expand the chosen box by ~8% (clamp to frame) so a person standing at the till still has centroid in-zone.
5. Reject if proposed area &gt; 40% of frame (that is a floor, not a till) or &lt; 3%.
6. Return `{ x, y, w, h, name: "counter", type: "counter", source: "furniture_proposal", confidence, cocoClass }` — **do not write DB**.

If nothing passes: return empty proposal; UI stays on human draw.

### Where it runs

| Path | Where YOLO runs | Why |
|------|-----------------|-----|
| **Watch clip upload (recommended for confirm UI)** | Same machine as today’s `process_mp4.py` spawn (`WATCH_PYTHON` / API host). One-shot on **first decoded frame** of the uploaded clip (or a dedicated still upload). | Watch already pays for local YOLO on clips. No RTSP to cloud. |
| **Shop PC at install** | `run_stream.py --propose-till --once` (or `process_mp4.py --propose-till`) prints JSON; installer pastes/adjusts in Watch **or** we add `POST /api/watch/cameras/:id/till-proposal` with **numbers only** (no image required if they confirm in CLI — prefer Watch confirm). | Always-on shops may never upload a clip. |

**Do not** run furniture YOLO on every live window. **Do not** silently apply the amber box to dwell.

### Confirm UX (Watch)

- After proposal: **amber dashed** overlay (`border-amber-500` or `#d97706`) vs saved **green** (`#166534`).
- Copy: “Suggested till from furniture in this view. Check it matches the register. This is not a sale and not a person.”
- Buttons (primary last): **Redraw** · **Save till zone** (existing mutation). Optional **Dismiss suggestion**.
- Saving writes the same `zones: [clampTillZone(zone)]` as today. Then dwell uses it.
- Manager/admin only. shadcn Button/Card/Label; no shadows.

### Phase 1 files

| File | Change |
|------|--------|
| `vision-edge/abs_vision/detect.py` | `detect_furniture_still(image_or_video, classes=…)` — one frame, no ByteTrack. |
| `vision-edge/abs_vision/till_proposal.py` (new) | Heuristic + clamp. Pure functions for tests. |
| `vision-edge/process_mp4.py` / `run_stream.py` | `--propose-till` writes proposal JSON to `--out`; does not ingest events. |
| `Backend/services/watchVisionEdgeService.js` | `proposeTillFromClip({ tenantId, clipUrl })` spawn; parse proposal; **no** zone write. |
| `Backend/routes/watchRoutes.js` | `POST /api/watch/cameras/:id/propose-till` body `{ clipUrl }` (admin/manager, YOLO timeout middleware). |
| `Frontend` | Propose button on Cameras and zones; amber overlay in `WatchTillZoneEditor`; reuse Save till zone. |
| Tests | Fixture stills or mocked YOLO boxes; reject huge table; empty proposal; API does not persist until PUT camera. |

**Dwell stays 6s.** Proposal does not change event types.

---

## C. Phase 2 — Optional per-camera fine-tune (only if Phase 1 is not enough)

**Trigger:** After real installs, furniture proposal consistently misses Ghana shop tills (wood counters, glass display, scale with no COCO class). **Not** required for first customer go-live.

### What we train

A **small detector** for till / counter surface / scale **in this camera’s view**. Weights are scoped `{ tenantId, cameraId }` and live on the **shop PC** (or a private ABS object path keyed by tenant/camera — never a public “shop fingerprint” model).

### What we collect

- **Few stills** (target 5–20) from **that camera** after install: same mount, day + night if lighting changes.
- Labels: one rectangle (till/counter/scale), no person names, no SKUs.
- Remodel / till moved → **new stills**, replace weights. Same as moving the green box, plus a short retrain.

### What we will **not** collect

- Face galleries, staff IDs, customer identity.
- Full-shift video to cloud for training.
- Shop branding / layout fingerprint datasets.
- Product SKU crops for recognition.

### Ops / cost (order of magnitude)

- Labeling: installer or owner in a simple Watch “mark till on stills” tool (reuse editor).
- Train: Ultralytics fine-tune `yolov8n` 20–50 epochs on a laptop or a one-off GPU job; minutes to an hour, not a standing GPU bill.
- Runtime: shop PC loads `--yolo-model /var/abs-watch/{cameraId}.pt` **only** for an occasional propose pass or, if we ever replace furniture proposal, for propose-not-dwell. Person tracking stays stock `yolov8n` class 0 unless we later merge classes carefully.
- Retrain trigger: owner reports “till moved” or installer checkbox; no automatic 24/7 learning.

### Schema (when Phase 2 is scheduled)

Prefer `VisionCamera.metadata.tillDetector = { weightRef, trainedAt, stillCount, source: 'finetune' }` over a new table until we have more than one weight file per camera. Do not add a global “shop model.”

---

## D. Explicit non-goals

- Shop identity / “recognize this shop” / layout fingerprint / branding.
- Named faces, biometrics, staff watchlists.
- SKU or product recognition from pixels (POS remains source of product names).
- LLM / GPT on frames (`detect.py` contract: local models only).
- 24/7 cloud live video, RTSP proxy in ABS, or Watch as an NVR.
- Accusatory copy (existing `watchConstants` incident language).
- Changing dwell to “saw money” or hand tracking.
- Per-clip zone redraw as the normal path.
- Using `examples/zones.json` as a hidden production till.
- Training on other tenants’ cameras to identify this tenant.

---

## E. Success criteria and test plan

### Success

1. **Installer sets till in one visit:** camera row + clip/still + draw + save + shop-PC `--zones` file from that save. Second camera gets its own box.
2. **Walk-ins ≠ till:** person centroid outside the saved box → `person_entered` only. Linger still in box ≥ 6s → `counter_interaction`. Existing [vision-edge/tests/test_events.py](vision-edge/tests/test_events.py) stay green.
3. **No silent default:** tenant without a saved counter zone cannot get till events from clip process or `run_stream.py`. Watch overlay is empty, not the demo lower-right box.
4. **Proposal + confirm (Phase 1):** amber box never used for dwell until Save till zone. Reject path leaves zones unchanged.
5. **Fine-tune (Phase 2)** is optional and not on the install checklist.

### Test plan

**Automated**

- Frontend: missing zone ≠ `DEFAULT_TILL_ZONE`; save payload `{ type: 'counter', x,y,w,h }`; stream command omits `examples/zones.json` when a camera is configured; process clip sends `cameraId`.
- Backend: `resolveShopZonesPath` without counter zone fails; with two counter cameras, `cameraId` selects the right JSON; ingest stores `cameraId` when edge sends it.
- vision-edge: dwell/stillness regression; `--propose-till` fixtures (mocked boxes); huge dining table rejected; `--zones` empty counter list → exit error.
- Matching: unchanged — only `counter_interaction` vs sales.

**Manual / site**

- Draw till on a real counter clip; walk past; stand at register 6s+; POS sale; Watch cards: visitors vs counter interactions.
- Two cameras: confirm camera B clip does not use camera A’s box.
- Remodel: move box, re-save, shop PC picks up new JSON (restart or documented reload).
- Phase 1: propose on a clip where a table/POS is visible; confirm; propose on an empty aisle (no / weak proposal).

**Browser (when implementing UI):** exercise Watch Cameras and zones + Upload and detect + Review overlay. No box-shadow. Verify letterbox: overlay must match the video content box (fix `object-contain` vs absolute % if Phase 0 QA fails).

---

## Suggested build order

1. **Phase 0a** — Stop silent fallback + require saved zone (backend + edge + frontend empty state). Highest bugfix value.
2. **Phase 0b** — `cameraId` on clip process + ingest; zones export + stream command copy.
3. **Phase 0c** — Overlay alignment if the still/letterbox is wrong; runbook in Watch help text (not a new markdown site).
4. **Phase 1** — Furniture still + confirm UI + `--propose-till`.
5. **Phase 2** — Only after 2+ real shops show Phase 1 is insufficient.

## Risks

| Risk | Mitigation |
|------|------------|
| Demo zone inflates counter interactions | Phase 0a; fail closed. |
| Shop PC keeps old JSON after remodel | Watch copy: “Download zones again after Save”; optional later: edge pulls `GET /watch/cameras/:id` (events/zones JSON only, not video). |
| Furniture YOLO proposes the dining area | Area cap + confirm UX; human draw remains default. |
| API host has no GPU for Phase 1 | Same as today’s clip YOLO (CPU `yolov8n`); one still is cheap. If API cannot run YOLO, propose only on shop PC. |
| Letterboxed overlay | Measure content rect; tests with non-16:9 clips. |
| Identity creep in Phase 2 | Written non-goals; stills only; tenant/camera paths; no faces. |

## Out of scope for this plan’s first implementation PR

Phase 1 and 2 code. Phase 0 is the first ship. Do not implement in the planning pass.
