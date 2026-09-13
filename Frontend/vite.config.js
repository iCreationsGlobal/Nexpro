import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const projectRoot = path.resolve(__dirname);
/** Default when probing fails — avoid :5000 (AirPlay) and :5001 (often non-ABS on this machine). */
const LOCAL_API_URL = 'http://127.0.0.1:5002';

const PRODUCTION_API_HOST = 'api.africanbusinesssuite.com';

const normalizeApiOrigin = (url = LOCAL_API_URL) => {
  const normalized = url.trim().replace(/\/$/, '').replace(/\/api\/?$/i, '') || LOCAL_API_URL;
  if (/^https?:\/\//i.test(normalized)) return normalized;

  const localhostLike = /^(localhost|127(?:\.\d{1,3}){3}|192\.168\.)/i.test(normalized);
  return `${localhostLike ? 'http' : 'https'}://${normalized}`;
};

const resolveDevProxyTargetFromEnv = (envUrl) => {
  if (!envUrl?.trim()) return LOCAL_API_URL;
  const normalized = normalizeApiOrigin(envUrl);
  try {
    const host = new URL(normalized).hostname;
    if (host === PRODUCTION_API_HOST) {
      console.warn(
        `[vite] VITE_API_URL is production (${normalized}); dev proxy will probe local ports. ` +
          'Update Frontend/.env.local if you intended a different API.'
      );
      return LOCAL_API_URL;
    }
  } catch {
    return LOCAL_API_URL;
  }
  return normalized;
};

/** Probe local ABS /health and keep proxy target updated (re-probes if backend starts later). */
function localBackendProxyPlugin(envUrl) {
  const initialTarget = resolveDevProxyTargetFromEnv(envUrl);
  return {
    name: 'local-backend-proxy',
    async configureServer(server) {
      let target = initialTarget;
      const { resolveLocalBackendUrl, probeBackendOrigin, shouldRetargetAfterProxyError } = await import(
        './scripts/resolveLocalBackendUrl.mjs'
      );

      const proxyEntries = [];

      const syncProxyTarget = () => {
        for (const proxyEntry of proxyEntries) {
          proxyEntry.target = target;
          proxyEntry.router = () => target;
        }
      };

      const refreshTarget = async (reason) => {
        try {
          if (reason !== 'startup' && reason !== 'html-404') {
            if (await probeBackendOrigin(target)) {
              return;
            }
          }
          let next = await resolveLocalBackendUrl({ envUrl: envUrl?.trim() || undefined });
          if (!(await probeBackendOrigin(next))) {
            next = await resolveLocalBackendUrl({});
          }
          if (!(await probeBackendOrigin(next))) {
            console.warn(
              `[vite] Dev proxy /api → ${target} (backend /health not reachable — start Backend with npm run dev, then retry)`
            );
            return;
          }
          if (next !== target) {
            target = next;
            syncProxyTarget();
            console.log(`[vite] Dev proxy retargeted → ${target}${reason ? ` (${reason})` : ''}`);
          }
        } catch (err) {
          console.warn('[vite] Backend probe failed:', err?.message || err);
        }
      };

      await refreshTarget('startup');

      const applyTarget = (key) => {
        const proxyEntry = server.config.server?.proxy?.[key];
        if (!proxyEntry) return;
        proxyEntries.push(proxyEntry);
        proxyEntry.target = target;
        proxyEntry.router = () => target;
        const priorConfigure = proxyEntry.configure;
        proxyEntry.configure = (proxy, options) => {
          priorConfigure?.(proxy, options);
          proxy.on('error', (err, req) => {
            const reqUrl = req?.url || '';
            console.warn(
              `[vite] Proxy error for ${key}${reqUrl ? ` ${reqUrl}` : ''} → ${target}: ${err?.message || err}`
            );
            if (!shouldRetargetAfterProxyError({ err, reqUrl })) {
              return;
            }
            refreshTarget('proxy-error');
          });
          proxy.on('proxyRes', (proxyRes) => {
            // Python/other apps on :5001 return HTML 404 — retarget to a healthy ABS port.
            const ct = String(proxyRes.headers['content-type'] || '');
            if (proxyRes.statusCode === 404 && ct.includes('text/html')) {
              refreshTarget('html-404');
            }
          });
        };
      };
      applyTarget('/api');
      applyTarget('/uploads');

      if (await probeBackendOrigin(target)) {
        console.log(`[vite] Dev proxy /api, /uploads → ${target}`);
      } else {
        console.warn(
          `[vite] Dev proxy /api, /uploads → ${target} (backend /health not reachable yet — start Backend with npm run dev; Vite will re-probe)`
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const devApiTarget = resolveDevProxyTargetFromEnv(env.VITE_API_URL);

  return {
    plugins: [
      react(),
      ...(mode === 'development' ? [localBackendProxyPlugin(env.VITE_API_URL)] : []),
      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globIgnores: [
            '**/empty-states/**',
            '**/tour/**',
            '**/African focused woman*',
            '**/html2pdf*.js',
          ],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
        manifest: false,
        dev: false,
      }),
    ],
    resolve: {
      alias: {
        '@': path.join(projectRoot, 'src'),
        'react': path.join(projectRoot, 'node_modules/react'),
        'react-dom': path.join(projectRoot, 'node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'react-beautiful-dnd'],
    },
    server: {
      port: 3000,
      // Fail fast when 3000 is taken instead of silently moving to 3001 (avoids stale tabs on the wrong port).
      strictPort: true,
      host: true,
      hmr: false,
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
          // Watch YOLO (and similar long POSTs) often run 60s+. Default proxy idle
          // close looks like axios "Network Error" → "check your internet".
          timeout: 360000,
          proxyTimeout: 360000,
        },
        '/uploads': {
          target: devApiTarget,
          changeOrigin: true,
          timeout: 360000,
          proxyTimeout: 360000,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      minify: mode === 'production' ? 'terser' : 'esbuild',
      terserOptions:
        mode === 'production'
          ? {
              compress: {
                pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
                passes: 2,
              },
            }
          : undefined,
    },
  };
});
