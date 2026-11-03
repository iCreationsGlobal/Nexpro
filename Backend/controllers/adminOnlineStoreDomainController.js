const { Op } = require('sequelize');
const { OnlineStoreSettings, Tenant } = require('../models');
const { getPagination } = require('../utils/paginationUtils');
const { refreshVerifiedDomainOrigins } = require('../utils/corsUtils');

const VALID_STATUSES = new Set(['pending', 'verified', 'none']);

/**
 * Serializes a custom-domain row for the admin queue.
 * @param {import('sequelize').Model} row
 * @returns {object}
 */
const serializeDomainRow = (row) => {
  const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: plain.id,
    tenantId: plain.tenantId,
    tenantName: plain.tenant?.name || null,
    businessType: plain.tenant?.businessType || null,
    slug: plain.slug || null,
    displayName: plain.displayName || null,
    customDomain: plain.customDomain || null,
    customDomainStatus: plain.customDomainStatus || 'none',
    enabled: Boolean(plain.enabled),
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null,
  };
};

/**
 * Lists custom domain requests for platform admins.
 * Query: status (pending|verified|none|all), search, page, limit
 */
exports.listCustomDomains = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const status = String(req.query.status || 'pending').trim().toLowerCase();
    const search = String(req.query.search || '').trim();

    const where = {
      customDomain: { [Op.ne]: null },
    };

    if (status !== 'all' && VALID_STATUSES.has(status)) {
      where.customDomainStatus = status;
    } else if (status !== 'all') {
      where.customDomainStatus = 'pending';
    }

    if (search) {
      where[Op.or] = [
        { customDomain: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await OnlineStoreSettings.findAndCountAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
      attributes: [
        'id',
        'tenantId',
        'slug',
        'displayName',
        'customDomain',
        'customDomainStatus',
        'enabled',
        'createdAt',
        'updatedAt',
      ],
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'businessType'],
          required: true,
        },
      ],
    });

    res.status(200).json({
      success: true,
      data: rows.map(serializeDomainRow),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pending custom-domain count for admin nav badge.
 */
exports.getPendingCustomDomainCount = async (req, res, next) => {
  try {
    const count = await OnlineStoreSettings.count({
      where: {
        customDomain: { [Op.ne]: null },
        customDomainStatus: 'pending',
      },
    });
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates custom domain status: verify, reject (clear), or set pending.
 * Body: { action: 'verify' | 'reject' | 'pending' }
 * - verify → customDomainStatus = 'verified' (domain kept)
 * - reject → customDomain = null, status = 'none' (disconnect)
 * - pending → customDomainStatus = 'pending' (re-queue)
 */
exports.updateCustomDomainStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const action = String(req.body.action || '').trim().toLowerCase();

    if (!['verify', 'reject', 'pending'].includes(action)) {
      const error = new Error('action must be verify, reject, or pending');
      error.statusCode = 400;
      throw error;
    }

    const settings = await OnlineStoreSettings.findByPk(id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'businessType'],
          required: false,
        },
      ],
    });

    if (!settings || !settings.customDomain) {
      const error = new Error('Custom domain request not found');
      error.statusCode = 404;
      throw error;
    }

    const hosting = require('../services/storeDomainHosting');
    // With the hosting's settings in place, verifying puts the domain on the store's hosting too and rejecting takes it off.
    const onHosting = (work) => (hosting.isConfigured() ? work().catch((err) => {
      console.error('[AdminDomains] Store hosting change failed:', err?.message || err);
    }) : Promise.resolve());

    if (action === 'verify') {
      await settings.update({ customDomainStatus: 'verified' });
      await onHosting(() => hosting.addToHosting(settings.customDomain));
    } else if (action === 'reject') {
      const removed = settings.customDomain;
      await settings.update({ customDomain: null, customDomainStatus: 'none' });
      await onHosting(() => hosting.removeFromHosting(removed));
    } else {
      await settings.update({ customDomainStatus: 'pending' });
    }

    // Keep API CORS allowlist in sync with connected (pending|verified) merchant domains.
    refreshVerifiedDomainOrigins().catch((err) => {
      console.error('[AdminDomains] Failed refreshing CORS custom-domain origins:', err?.message || err);
    });

    await settings.reload({
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'businessType'],
          required: false,
        },
      ],
    });

    res.status(200).json({ success: true, data: serializeDomainRow(settings) });
  } catch (error) {
    next(error);
  }
};
