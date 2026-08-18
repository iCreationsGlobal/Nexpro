# Deploying ABS (African Business Suite) to Vercel

> **Hosting split (2026-08):** Production web (API + every customer-facing frontend) runs on the **Contabo VPS**. **Vercel is for demos only.** See [docs/DEPLOY_CONTABO_VS_VERCEL.md](docs/DEPLOY_CONTABO_VS_VERCEL.md) for architecture, DNS, nginx, branching (`main` → Contabo, `staging` → Vercel demo), and cutover. This file still describes the older Vercel project layout and env names.

This guide covers deploying the **Backend**, **Frontend**, and **Marketing Site** as **three separate Vercel projects** from this monorepo.

---

## ABS / African Business Suite production domains

The production app is served at **myapp.africanbusinesssuite.com** (any previous Vercel preview URL such as `nexpro-frontend-dusky.vercel.app` is no longer used). When the app is deployed on these domains, use the following so the frontend and API stay connected:

| Role | Domain |
|------|--------|
| **API (Backend)** | `https://api.africanbusinesssuite.com` |
| **App (Frontend)** | `https://myapp.africanbusinesssuite.com` |
| **Website** | `https://africanbusinesssuite.com` |

### Backend (api.africanbusinesssuite.com)

Set these environment variables on the API server:

- **`CORS_ORIGIN`** = `https://myapp.africanbusinesssuite.com,https://africanbusinesssuite.com`  
  (so both the app and the website can call the API)
- **`FRONTEND_URL`** = `https://myapp.africanbusinesssuite.com`  
  (for auth redirects, invite links, and email links)

### Frontend (myapp.africanbusinesssuite.com)

- The app automatically uses `https://api.africanbusinesssuite.com` when it is served from `myapp.africanbusinesssuite.com` or `africanbusinesssuite.com`, so **`VITE_API_URL`** is optional for that deployment.
- To override, set **`VITE_API_URL`** = `https://api.africanbusinesssuite.com`.

### Website (africanbusinesssuite.com)

- If the website only links to the app (e.g. “Log in” → myapp.africanbusinesssuite.com), no API env is needed on the website.
- If the website makes API calls, ensure the backend has `https://africanbusinesssuite.com` in **`CORS_ORIGIN`** (see above).

### CORS: "No 'Access-Control-Allow-Origin' header" from myapp.africanbusinesssuite.com

- **Set CORS on the Backend (API) project** — the project that serves your API domain (e.g. `api.africanbusinesssuite.com`). CORS is enforced by the API server, not the frontend.
- In that project's env: **`CORS_ORIGIN`** = `https://myapp.africanbusinesssuite.com` (no trailing slash; add `,https://africanbusinesssuite.com` if the marketing site calls the API). **`FRONTEND_URL`** = `https://myapp.africanbusinesssuite.com` (also added to allowed origins).
- **Redeploy the Backend** after changing env vars so the new values are applied.
- Ensure the **Frontend** project uses **`VITE_API_URL`** = `https://api.africanbusinesssuite.com` (or leave unset when the app is served from myapp.africanbusinesssuite.com so it auto-uses that API), then redeploy the frontend.

---

## Prerequisites

- [Vercel account](https://vercel.com/signup)
- [Vercel CLI](https://vercel.com/docs/cli) (optional): `npm i -g vercel`
- Git repo pushed to **GitHub**, **GitLab**, or **Bitbucket**
- **PostgreSQL** database (e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app))

---

## 1. Deploy order

1. **Backend** first → note the deployment URL (e.g. `https://nexpro-api-xxx.vercel.app`).
2. **Frontend** second → set `VITE_API_URL` to the Backend URL.
3. **Marketing Site** last (optional) → set `NEXT_PUBLIC_APP_URL` to the Frontend URL if you use `/login` and `/signup` redirects.

---

## 2. Backend (API)

### 2.1 Create Vercel project

1. [Vercel Dashboard](https://vercel.com/new) → **Add New…** → **Project**.
2. Import your Git repository.
3. **Before** deploying, open **Settings** → **General**:
   - **Root Directory**: set to `Backend` (click **Edit**, then **Browse** and choose `Backend`).
4. **Framework Preset**: **Other** (no framework).

### 2.2 Build & output

- **Build Command**: leave empty (handled by `vercel.json`).
- **Output Directory**: leave empty.
- **Install Command**: `npm install` (default).

### 2.3 Environment variables

In **Settings** → **Environment Variables**, add:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string (**production** Neon / server DB — separate from demo) | `Backend/.env.production` on team machines; Vercel `shopwise_backend` |
| `JWT_SECRET` | Secret for JWT signing | `openssl rand -base64 32` |
| `JWT_EXPIRE` | Token expiry | `7d` |
| `CORS_ORIGIN` | Allowed frontend origins (comma‑separated) | `https://myapp.africanbusinesssuite.com,https://africanbusinesssuite.com` |
| `FRONTEND_URL` | Main app URL (invites, etc.) | `https://myapp.africanbusinesssuite.com` |

Optional (see `Backend/env.example`):

- `NODE_ENV` = `production`
- Sabito, WhatsApp, OpenAI, Mobile Money, etc.

Add these for **Production** (and **Preview** if you use branch deploys).

### 2.3.1 Database migrations (do not skip)

**Two databases:**

| Target | Vercel project | `DATABASE_URL` |
|--------|----------------|----------------|
| Local + **demo-api** | `nexpro-backend` | Demo Neon (`ep-dry-wildflower-...`) in `Backend/.env` |
| **Production API** | `shopwise_backend` | Production Neon (`ep-sweet-hall-...`) or VPS Postgres in `Backend/.env.production` |

- Demo sync: `npm run db:sync-vercel` (from `Backend/.env`)
- Production Vercel sync: `npm run db:restore-production-vercel` (from `Backend/.env.production`)

Run migrations on **each** database when schema changes (demo first, then production).

Whenever backend code adds or changes database columns, run migrations against the **matching** database **before or immediately after** deploy. From a machine that can reach Postgres:

```bash
cd Backend && npm run migrate
```

To apply only the customer job-tracking column on `jobs` (if the full migrate script is not an option):

```bash
cd Backend && node migrations/add-view-token-to-jobs.js
```

If migrations are not applied, Sequelize will still issue `SELECT`/`INSERT` including new fields and Postgres will error (for example **`column Job.viewToken does not exist`**), which surfaces as **500** on **`GET /api/jobs`**.

### 2.4 Deploy

- Trigger a deploy (e.g. **Redeploy** or push to `main`).
- Copy the **Production** URL, e.g. `https://nexpro-api-xxx.vercel.app`.

### 2.5 Verify

- `https://<backend-url>/health` → `{"success":true,"message":"Server is running",...}`
- `https://<backend-url>/` → API info JSON.

---

## 3. Frontend (App)

### 3.1 Create Vercel project

1. **Add New…** → **Project** → same Git repo.
2. **Root Directory**: `Frontend`.
3. **Framework Preset**: **Vite** (or **Other**; `vercel.json` sets build/output).

### 3.2 Build & output

- **Build Command**: `npm run build` (or leave default).
- **Output Directory**: `dist`.

### 3.3 Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL (**required** unless on myapp.africanbusinesssuite.com) | `https://api.africanbusinesssuite.com` |

Optional:

- `VITE_SABITO_URL` – Sabito frontend URL.
- `VITE_WS_URL` – WebSocket URL (not used on Vercel serverless; real‑time uses fallbacks).

### 3.4 Deploy

Deploy and note the Frontend URL (production: `https://myapp.africanbusinesssuite.com`).

### 3.5 Wire Backend ↔ Frontend

1. **Backend** project → **Settings** → **Environment Variables**:
   - `CORS_ORIGIN`: add the Frontend URL (and any preview URLs if needed).
   - `FRONTEND_URL`: set to the Frontend URL.
2. Redeploy the Backend after changing env vars.

---

## 4. Marketing Site (Next.js)

### 4.1 Create Vercel project

1. **Add New…** → **Project** → same Git repo.
2. **Root Directory**: `marketing-site`.
3. **Framework Preset**: **Next.js** (auto‑detected).

### 4.2 Build & output

Use defaults (`npm run build`, Next.js output).

### 4.3 Environment variables (optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Main app URL for redirects | `https://myapp.africanbusinesssuite.com` |

If set, `/signup` and `/login` on the marketing site redirect to the main app.

### 4.4 Deploy

Deploy and note the Marketing Site URL.

---

## 5. Deploying via Vercel CLI

From the **repository root**:

```bash
# Login once
vercel login

# Backend
vercel --cwd Backend link    # Link to existing Backend project, or creates new
vercel --cwd Backend --prod  # Deploy production

# Frontend (after setting VITE_API_URL in project settings)
vercel --cwd Frontend link
vercel --cwd Frontend --prod

# Marketing site
vercel --cwd marketing-site link
vercel --cwd marketing-site --prod
```

Ensure **Root Directory** is set correctly for each project in the Vercel dashboard (e.g. `Backend`, `Frontend`, `marketing-site`).

---

## 6. Summary of Vercel projects

| Project | Root Directory | Main env vars |
|--------|----------------|----------------|
| **Backend** | `Backend` | `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL` |
| **Frontend** | `Frontend` | `VITE_API_URL` |
| **Marketing Site** | `marketing-site` | `NEXT_PUBLIC_APP_URL` (optional) |
| **sabito-store** (storefront) | `storefront` | See below — Vite `VITE_*` baked at **build time** |

### sabito-store (Vite storefront)

Serves **sabitostore.com** (Sabito marketplace) and **store.absghana.com** (ABS Online Store). Hostname decides mode at runtime; env must be set before rebuild.

| Variable | Production value |
|----------|------------------|
| `VITE_API_URL` | `https://api.africanbusinesssuite.com` |
| `VITE_STOREFRONT_URL` | `https://sabitostore.com` |
| `VITE_DASHBOARD_URL` | `https://myapp.africanbusinesssuite.com` |
| `VITE_ABS_APP_URL` | `https://myapp.africanbusinesssuite.com` |
| `VITE_ONLINE_STORE_HOST` | `store.absghana.com` |
| `VITE_ONLINE_STORE_URL` | `https://store.absghana.com` |
| `VITE_TEMPLATES_HOST` | `templates.absghana.com` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Web client ID |

After changing any `VITE_*` var: **Redeploy** the sabito-store project (Vite inlines env at build). If `store.absghana.com` shows Sabito marketplace chrome, redeploy from `main` — code recognizes that host even when env is unset, but production must not be on a stale build.

---

## 7. Important notes

### Backend (serverless)

- **WebSockets**: Not supported on Vercel serverless. Real‑time features use HTTP fallbacks where implemented. Requests to `/socket.io/` return **503** with a JSON body so the client can detect that WebSocket is unavailable. To avoid connection attempts and log noise, set **`VITE_WS_ENABLED=false`** in the Frontend project when the API is deployed on Vercel.
- **File uploads**: The `/uploads` directory is not persistent. Use **Vercel Blob**, **S3**, or similar for production file storage.
- **Cron / background jobs**: `node-cron` and long‑running processes do not run on serverless. Use [Vercel Cron](https://vercel.com/docs/cron-jobs) or an external scheduler for Sabito sync, reminders, etc.
- **`maxDuration`**: `Backend/vercel.json` sets `maxDuration: 60` for the API handler. This requires a **Pro** plan; **Hobby** is limited to 10s. Adjust or remove if needed.

### Frontend

- **`VITE_API_URL`** must be set in production. The app shows an error banner if it’s missing on a Vercel deployment.

- **`VITE_WS_ENABLED=false`** recommended when the API is on Vercel (no WebSocket support); avoids connection attempts and 503s for `/socket.io/`.

### Marketing site

- Purely optional. Deploy only if you use the marketing/landing site.

---

## 8. Custom domains

For each project:

1. **Settings** → **Domains**.
2. Add your domain and follow DNS instructions.

Use the same domains in `CORS_ORIGIN`, `FRONTEND_URL`, and `VITE_API_URL` as needed.

---

## 9. Troubleshooting

| Issue | Check |
|-------|--------|
| **404 DEPLOYMENT_NOT_FOUND** (e.g. on myapp.africanbusinesssuite.com/view-quote/…) | Vercel can’t find the deployment. In Vercel → your **Frontend** project: **Deployments** → ensure there is a successful production deployment; **Settings → Domains** → ensure the domain (e.g. myapp.africanbusinesssuite.com) is set and assigned to **Production** (not an old/deleted deployment). Then trigger a new production deploy from the main branch. |
| Backend 404 / 500 | Root Directory = `Backend`, `DATABASE_URL` set, redeploy after env changes |
| Frontend “VITE_API_URL not set” | Add `VITE_API_URL` in Frontend project env and redeploy |
| CORS errors | Add Frontend (and marketing) URLs to Backend `CORS_ORIGIN` |
| CORS "cache-control is not allowed" | Backend must allow `Cache-Control` (and `Pragma`) in `Access-Control-Allow-Headers`. See `Backend/config/config.js` and `Backend/utils/corsUtils.js`. Redeploy Backend after change. |
| WebSocket connection failed | API must run on a host that supports long-lived WebSockets (Vercel serverless does not). Use a Node server (e.g. Railway, Render, Fly.io) for the API if real-time is required. Ensure `CORS_ORIGIN` includes the app origin. |
| PWA "Resource size is not correct" for icon | Each icon in `public/icons/` must have pixel dimensions matching its filename (e.g. `icon-192x192.png` must be 192×192). Regenerate icons or fix `public/manifest.json` to match actual file dimensions. |
| DB connection errors | `DATABASE_URL` correct, IP allowlist if required, SSL params for Neon/Supabase |

---

You now have **Backend**, **Frontend**, and **Marketing Site** deployed as three separate Vercel projects.

---

## 10. Contabo VPS — sabitostore.com

When the API runs on the Contabo VPS (`~/nexpro`) and the storefront is served at **sabitostore.com**, use the server-side config script after pulling code or when domains change:

```bash
cd ~/nexpro
./scripts/configure-sabitostore-production.sh
```

The script backs up `Backend/.env`, sets `STOREFRONT_URL`, `FRONTEND_URL`, `ONLINE_STORE_URL`, `STOREFRONT_CNAME_TARGET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, merges required origins into `CORS_ORIGIN` (including `https://store.absghana.com`), writes `Frontend/.env.production` and `storefront/.env.production` (including `VITE_GOOGLE_CLIENT_ID`), restarts `nexpro-backend` (systemd, or pm2 fallback), and curls `/health`.

| Flag | Effect |
|------|--------|
| `--env-only` | Update env files only (no restart, no build) |
| `--build` | Also `npm install`, `npm run migrate`, build Frontend + storefront |
| `--restart` | Restart backend (default unless `--env-only`) |
| `--storefront-url=…` | Override storefront origin (default `https://sabitostore.com`) |
| `--frontend-url=…` | Override dashboard origin (default `https://myapp.africanbusinesssuite.com`) |
| `--api-url=…` | Override API origin (default `https://api.africanbusinesssuite.com`) |
| `--google-client-id=…` | Google OAuth Web client ID (default: production ABS + Sabito client) |
| `--google-client-secret=…` | Google OAuth client secret (Backend `.env` only) |

Run `./scripts/configure-sabitostore-production.sh --help` for full usage.

### ABS Online Store only (`store.absghana.com`)

To upsert just the Online Store backend keys from your laptop (SSH; no password in the script):

```bash
# Default host matches Backend/scripts docs: root@62.169.22.3
./scripts/configure-online-store-production.sh

# Or use an ~/.ssh/config Host alias / override:
CONTABO_HOST=contabo ./scripts/configure-online-store-production.sh
CONTABO_HOST=root@62.169.22.3 ./scripts/configure-online-store-production.sh --env-only
```

Sets `ONLINE_STORE_URL=https://store.absghana.com`, `STOREFRONT_CNAME_TARGET=store.absghana.com`, merges `https://store.absghana.com` into `CORS_ORIGIN`, backs up `Backend/.env`, and restarts `nexpro-backend` (unless `--env-only`). On the VPS itself: `./scripts/configure-online-store-production.sh --local`.
