/**
 * External partner / agency API auth (GRA-style integrations).
 * Uses x-api-key header matched against PARTNER_API_KEYS env (comma-separated)
 * or per-request tenant via x-tenant-id + PARTNER_API_KEY_<tenant> pattern.
 *
 * Format for PARTNER_API_KEYS: "key1:tenantUuid1,key2:tenantUuid2"
 */

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
exports.partnerApiAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['x-partner-api-key'];
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Missing x-api-key',
      errorCode: 'PARTNER_API_KEY_REQUIRED',
    });
  }

  const raw = process.env.PARTNER_API_KEYS || '';
  const pairs = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':');
      if (idx <= 0) return null;
      return { key: entry.slice(0, idx), tenantId: entry.slice(idx + 1) };
    })
    .filter(Boolean);

  const match = pairs.find((p) => p.key === apiKey);
  if (!match) {
    return res.status(401).json({
      success: false,
      message: 'Invalid partner API key',
      errorCode: 'PARTNER_API_KEY_INVALID',
    });
  }

  req.tenantId = match.tenantId;
  req.partnerAuth = { type: 'partner_api', tenantId: match.tenantId };
  next();
};
