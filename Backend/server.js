const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Load .env from Backend directory (avoids cwd issues when running from project root or different case)
require('dotenv').config({ path: path.join(__dirname, '.env') });

/** Vercel serverless: no long-lived WebSocket server; use stub below. Long-running Node (Railway, VPS, etc.): real Socket.IO attaches to http.Server — do not register the stub. */
const IS_VERCEL_SERVERLESS = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

// Validate required environment variables at startup
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DATABASE_URL'];
const missingEnvVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`[Server] ❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('[Server] Please set these variables in your .env file or environment');
  process.exit(1);
}

const config = require('./config/config');
const { applySilenceIfProduction } = require('./utils/silenceConsoleInProduction');
applySilenceIfProduction(config.nodeEnv);

// Prevent serverless process exit on uncaught errors so Vercel can log and return 500
process.on('uncaughtException', (err) => {
  console.error('[Server] uncaughtException:', err?.message || err);
  if (process.env.NODE_ENV === 'development') console.error(err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] unhandledRejection:', reason);
  if (process.env.NODE_ENV === 'development') console.error('Promise:', promise);
});

const { sequelize, testConnection } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const requestTiming = require('./middleware/requestTiming');
const { generalLimiter, webhookLimiter } = require('./middleware/rateLimiter');
const { isOriginAllowed, setCorsHeadersAsync } = require('./utils/corsUtils');
const { csrfProtection } = require('./middleware/csrfProtection');
const { sanitizeInputs } = require('./middleware/sanitizer');
const { checkRouteAccess } = require('./middleware/featureAccess');

// Import models to ensure relationships are set up
require('./models');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const customerRoutes = require('./routes/customerRoutes');
const dealerRoutes = require('./routes/dealerRoutes');
const marketingRoutes = require('./routes/marketingRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const jobRoutes = require('./routes/jobRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
// const paymentRoutes = require('./routes/paymentRoutes'); // REMOVED: Payments module removed (redundant with Invoices)
const expenseRoutes = require('./routes/expenseRoutes');
const quoteRoutes = require('./routes/quoteRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const publicRoutes = require('./routes/publicRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const reportRoutes = require('./routes/reportRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const automationRoutes = require('./routes/automationRoutes');
const materialsRoutes = require('./routes/materialsRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const leadRoutes = require('./routes/leadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const tourRoutes = require('./routes/tourRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const accountingRoutes = require('./routes/accountingRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const adminRoutes = require('./routes/adminRoutes');
const platformSettingsRoutes = require('./routes/platformSettingsRoutes');
const platformAdminRoutes = require('./routes/platformAdminRoutes');
const platformAdminRoleRoutes = require('./routes/platformAdminRoleRoutes');
const customDropdownRoutes = require('./routes/customDropdownRoutes');
const sabitoMappingRoutes = require('./routes/sabitoMappingRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
// Shop Management Routes
const shopRoutes = require('./routes/shopRoutes');
const studioLocationRoutes = require('./routes/studioLocationRoutes');
const productRoutes = require('./routes/productRoutes');
const merchandiseRoutes = require('./routes/merchandiseRoutes');
const storeRoutes = require('./routes/storeRoutes');
const saleRoutes = require('./routes/saleRoutes');
const scanLogRoutes = require('./routes/scanLogRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
// Pharmacy Management Routes
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const drugRoutes = require('./routes/drugRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
// Retail Intelligence Routes
const footTrafficRoutes = require('./routes/footTrafficRoutes');
const stockCountRoutes = require('./routes/stockCountRoutes');
// Mobile Money Routes
const mobileMoneyRoutes = require('./routes/mobileMoneyRoutes');
// Variance Detection Routes
const varianceRoutes = require('./routes/varianceRoutes');
const userWorkspaceRoutes = require('./routes/userWorkspaceRoutes');
const swaggerUi = require('swagger-ui-express');
const openapiSpecification = require('./docs/openapi');

const app = express();

// Middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      const pathHint = `${req.originalUrl || ''} ${req.url || ''} ${req.path || ''}`;
      if (req.method === 'POST' && /webhooks\/whatsapp/.test(pathHint)) {
        req.rawBody = buf;
      }
    }
  })
); // Increased limit for base64 images; raw body for Meta signature verification
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use('/api', requestTiming);
// Allow cross-origin loading of uploads (images) so frontend on different port can display them
app.use('/uploads', (req, res, next) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
// Upload filenames include timestamp + random segment (immutable once written).
// 7d maxAge keeps CDN/browser caches warm while still allowing eventual refresh
// if an object is ever replaced at the same path; etag/lastModified remain on.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  immutable: false,
}));

// Explicit OPTIONS preflight for /api (runs before rate limit). CORS uses preflightContinue,
// so we must respond to OPTIONS here and always send CORS headers.
// Await custom-domain cache on cold start so merchant Origin is not missing Allow-Origin.
app.use('/api', async (req, res, next) => {
  if (req.method !== 'OPTIONS') return next();
  const origin = req.get('Origin');
  await setCorsHeadersAsync(res, origin);
  return res.sendStatus(204);
});

// Rate limiting - apply to all API routes
app.use('/api', generalLimiter);

// Reject obviously invalid paths (e.g. GET /api/& from malformed client requests)
app.use('/api', (req, res, next) => {
  const p = (req.path || '').replace(/^\/+/, '').trim();
  if (p === '&') {
    return res.status(400).json({ success: false, message: 'Invalid path' });
  }
  next();
});

// CSRF protection - validate origin on state-changing requests
app.use('/api', csrfProtection);

// Input sanitization - XSS protection for all inputs
app.use('/api', sanitizeInputs);
app.use('/api', checkRouteAccess);

// Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Verbose SSO request logging (development only)
app.use((req, res, next) => {
  if (
    config.nodeEnv === 'development' &&
    (req.path.includes('sso') || req.url.includes('sso') || req.query.token)
  ) {
    console.log('='.repeat(100));
    console.log('[MIDDLEWARE] 📥 INCOMING SSO REQUEST');
    console.log('[MIDDLEWARE] Method:', req.method);
    console.log('[MIDDLEWARE] Path:', req.path);
    console.log('[MIDDLEWARE] URL:', req.url);
    console.log('[MIDDLEWARE] Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
    console.log('[MIDDLEWARE] Query:', JSON.stringify(req.query, null, 2));
    console.log('[MIDDLEWARE] Query Keys:', Object.keys(req.query));
    console.log('[MIDDLEWARE] Has Token:', !!req.query.token);
    console.log('[MIDDLEWARE] Body:', JSON.stringify(req.body, null, 2));
    console.log('[MIDDLEWARE] Headers:', {
      'x-tenant-id': req.headers['x-tenant-id'],
      authorization: req.headers['authorization'] ? 'Bearer ***' : 'none',
      'user-agent': req.headers['user-agent']?.substring(0, 50),
      referer: req.headers.referer
    });
    console.log('='.repeat(100));
  }
  next();
});

// Webhook routes (before auth middleware - uses API key authentication)
app.use('/api/webhooks', webhookLimiter, require('./routes/webhookRoutes'));
app.use('/api/partner/v1', webhookLimiter, require('./routes/partnerV1Routes'));
app.use('/api/evat', require('./routes/evatRoutes'));

// SSO route at root level (before auth routes)
const { sabitoSSOGet } = require('./controllers/authController');
app.get('/sso', sabitoSSOGet);
if (config.nodeEnv === 'development') {
  console.log('[SERVER] ✅ GET /sso route registered');
}

// Stub ONLY on Vercel serverless — otherwise this middleware runs before Socket.IO and returns 503 for every WS client.
if (IS_VERCEL_SERVERLESS) {
  app.use('/socket.io', (req, res) => {
    if (req.method === 'OPTIONS') {
      const { setCorsHeadersAsync } = require('./utils/corsUtils');
      return setCorsHeadersAsync(res, req.get('Origin')).then(() => res.sendStatus(204));
    }
    res.status(503).json({ websocket: false, message: 'WebSocket not available on this deployment' });
  });
  if (config.nodeEnv === 'development') {
    console.log('[Server] Socket.IO path stub active (Vercel serverless)');
  } else {
    console.warn('[Server] Socket.IO stub active (Vercel serverless)');
  }
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/contacts', require('./routes/contactImportRoutes'));
app.use('/api/dealers', dealerRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/deliveries', deliveryRoutes);
// app.use('/api/payments', paymentRoutes); // REMOVED: Payments module removed (redundant with Invoices)
app.use('/api/expenses', expenseRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/feedback', feedbackRoutes);
// Alias: some clients / docs referred to customer feedback as "reviews"
app.use('/api/reviews', feedbackRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/inventory', materialsRoutes); // backward compat; remove after frontend/mobile use /api/materials
app.use('/api/equipment', equipmentRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tours', tourRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/partner-program', require('./routes/partnerProgramRoutes'));
app.use('/api/employees', employeeRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/platform-settings', platformSettingsRoutes);
app.use('/api/platform-admins', platformAdminRoutes);
app.use('/api/platform-admin', platformAdminRoleRoutes);
app.use('/api/custom-dropdowns', customDropdownRoutes);
app.use('/api/sabito', sabitoMappingRoutes);
app.use('/api/subscription', subscriptionRoutes);
// Shop Management Routes
app.use('/api/shops', shopRoutes);
app.use('/api/studio-locations', studioLocationRoutes);
app.use('/api/products', productRoutes);
app.use('/api/merchandise', merchandiseRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/returns', require('./routes/saleReturnRoutes'));
app.use('/api/scan-logs', scanLogRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
// Pharmacy Management Routes
app.use('/api/pharmacies', pharmacyRoutes);
app.use('/api/drugs', drugRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
// Retail Intelligence Routes
app.use('/api/foot-traffic', footTrafficRoutes);
app.use('/api/stock-counts', stockCountRoutes);
// Mobile Money Routes
app.use('/api/mobile-money', mobileMoneyRoutes);
// Variance Detection Routes
app.use('/api/variance', varianceRoutes);
app.use('/api/user-workspace', userWorkspaceRoutes);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    environment: config.nodeEnv
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ABS (African Business Suite) - Business Management API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      customers: '/api/customers',
      vendors: '/api/vendors',
      jobs: '/api/jobs',
      expenses: '/api/expenses',
      pricing: '/api/pricing',
      invoices: '/api/invoices',
      dashboard: '/api/dashboard',
      invites: '/api/invites',
      reports: '/api/reports',
      inventory: '/api/inventory',
      store: '/api/store',
      equipment: '/api/equipment',
      leads: '/api/leads',
      notifications: '/api/notifications',
      tenants: '/api/tenants',
      admin: '/api/admin',
      platformSettings: '/api/platform-settings',
      platformAdmins: '/api/platform-admins',
      docs: '/api/docs'
    }
  });
});

// Error handler (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  const fullPath = req.originalUrl || req.url || '';
  const pathOnly = req.path || '';
  const lower = fullPath.toLowerCase();
  const looksLikePublicFeedbackPage =
    /^\/feedback\//i.test(fullPath) || lower.startsWith('/feedback?');
  const looksLikeFeedbackApi =
    lower.startsWith('/api/feedback') ||
    lower.startsWith('/api/reviews') ||
    lower.startsWith('/api/public/feedback');
  const doubleApi = /\/api\/api\//i.test(fullPath);
  const hint = looksLikePublicFeedbackPage
    ? ' Customer feedback pages must be opened on your web app URL (not the API server), e.g. https://your-app…/feedback/your-workspace-slug.'
    : '';

  const logPayload = {
    tag: '[404]',
    reason: 'no_matching_route',
    method: req.method,
    originalUrl: fullPath,
    path: pathOnly,
    baseUrl: req.baseUrl || '',
    referer: req.get('Referer') || null,
    userAgent: (req.get('User-Agent') || '').slice(0, 160) || null,
    looksLikePublicFeedbackPage,
    looksLikeFeedbackApi,
    doubleApi
  };
  if (looksLikePublicFeedbackPage || looksLikeFeedbackApi || doubleApi || lower.includes('review')) {
    console.warn('[404] Route not found (reviews/feedback-related or double /api):', JSON.stringify(logPayload));
  }

  res.status(404).json({
    success: false,
    message: hint ? `Route not found.${hint}` : 'Route not found',
    path: fullPath,
    ...(config.nodeEnv === 'development' ? { debug: logPayload } : {})
  });
});

// Database connection and server start
// Only start long-lived HTTP server if not running on Vercel (serverless)
// Create HTTP server for WebSocket support
const server = http.createServer(app);

if (!IS_VERCEL_SERVERLESS) {
  const PORT_BASE = Number(process.env.PORT) || Number(config.port) || 5000;
  const PORT_MAX = PORT_BASE + 10;

  const onListen = (port) => {
    const configuredPort = PORT_BASE;
    if (Number(port) !== configuredPort) {
      console.warn(
        `[Server] Port ${configuredPort} was in use; listening on ${port} instead. ` +
          'On macOS, AirPlay Receiver often uses :5000 — disable it in System Settings or set PORT=5001 in Backend/.env.'
      );
      console.warn(
        `[Server] Frontend dev uses the Vite proxy (/api). For direct API calls: VITE_API_DIRECT=true VITE_API_URL=http://localhost:${port}`
      );
      console.warn(
        `[Server] Mobile must match this port: EXPO_PUBLIC_API_URL=http://<LAN-IP>:${port} ` +
          '(run: cd mobile && npm run show-api-url). A stale :' +
          `${configuredPort} URL causes Store tab timeouts.`
      );
    }
    if (config.nodeEnv === 'development') {
      console.log(`[Server] Running in ${config.nodeEnv} mode on port ${port}`);
      const openaiKey = process.env.OPENAI_API_KEY?.trim();
      console.log(`[Server] OpenAI: ${openaiKey ? 'configured' : 'not set (AI features disabled)'}`);
      const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
      console.log(
        `[Server] Google OAuth (GOOGLE_CLIENT_ID): ${googleClientId ? `${googleClientId.substring(0, 20)}...` : 'not set (Google sign-in button hidden)'}`
      );
    } else {
      console.warn(`[Server] Listening on port ${port} (production)`);
    }
    // Warm CORS allowlist with connected (pending|verified) merchant custom domains
    require('./utils/corsUtils').refreshVerifiedDomainOrigins().catch((err) => {
      console.error('[Server] Failed loading custom-domain CORS origins:', err?.message || err);
    });
    if (process.env.SABITO_SYNC_ENABLED !== 'false') {
      try {
        require('./services/sabitoScheduler').start();
      } catch (error) {
        console.error('[Server] Failed to start Sabito scheduler:', error);
      }
    }
    try {
      require('./services/paymentReminderService').start();
      if (config.nodeEnv === 'development') {
        console.log('[Server] ✅ Payment reminder service started');
      }
    } catch (error) {
      console.error('[Server] Failed to start payment reminder service:', error);
    }
    try {
      require('./services/jobDueReminderService').start();
      if (config.nodeEnv === 'development') {
        console.log('[Server] ✅ Job due reminder service started');
      }
    } catch (error) {
      console.error('[Server] Failed to start job due reminder service:', error);
    }
    try {
      require('./services/autoTaskSchedulerService').start();
      if (config.nodeEnv === 'development') {
        console.log('[Server] ✅ Auto task scheduler service started');
      }
    } catch (error) {
      console.error('[Server] Failed to start auto task scheduler service:', error);
    }
    try {
      require('./services/automationSchedulerService').start();
      if (config.nodeEnv === 'development') {
        console.log('[Server] ✅ Automation scheduler service started');
      }
    } catch (error) {
      console.error('[Server] Failed to start automation scheduler service:', error);
    }
    try {
      require('./services/recurringJournalSchedulerService').start();
      if (config.nodeEnv === 'development') {
        console.log('[Server] ✅ Recurring journal scheduler service started');
      }
    } catch (error) {
      console.error('[Server] Failed to start recurring journal scheduler service:', error);
    }
    try {
      require('./services/marketplacePayoutSchedulerService').start();
      if (config.nodeEnv === 'development') {
        console.log('[Server] ✅ Marketplace payout scheduler service started');
      }
    } catch (error) {
      console.error('[Server] Failed to start marketplace payout scheduler service:', error);
    }
  };

  const startServer = async () => {
    try {
      await testConnection();
      try {
        const { initializeWebSocket } = require('./services/websocketService');
        initializeWebSocket(server);
        if (config.nodeEnv === 'development') {
          console.log('[Server] ✅ WebSocket server initialized');
        }
      } catch (error) {
        console.error('[Server] Failed to initialize WebSocket:', error);
      }

      const tryListen = (port) => {
        const listenPort = Number(port);
        if (listenPort > PORT_MAX) {
          console.error(`[Server] No available port in range ${PORT_BASE}-${PORT_MAX}`);
          process.exit(1);
        }
        const onError = (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[Server] Port ${listenPort} in use, trying ${listenPort + 1}...`);
            server.off('listening', onListening);
            tryListen(listenPort + 1);
          } else {
            console.error('Server error:', err);
            process.exit(1);
          }
        };
        const onListening = () => {
          server.off('error', onError);
          onListen(listenPort);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(listenPort, '0.0.0.0');
      };

      tryListen(PORT_BASE);
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  startServer();
} else {
  // On Vercel, just test connection but don't start server
  // The connection will be established on first request
  testConnection().catch(err => {
    console.error('Database connection test failed:', err);
  });
}

module.exports = app;

