const { Shop, User, UserShop, UserTenant } = require('../models');
const { Op } = require('sequelize');
const { resolveBusinessType } = require('../config/businessTypes');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const { getPagination } = require('../utils/paginationUtils');
const {
  ensureDefaultShop,
  setAsOnlyDefaultShop,
  isShopTenant,
  invalidateShopAccessCache,
  hasWorkspaceWideShopAccess,
  setUserShops,
  getUserShopIds,
  applyShopFilter,
  assertShopIdAccess,
} = require('../utils/shopUtils');
const {
  validateManagerUserId,
  ensureManagerShopAccess,
} = require('../utils/branchManagerUtils');
const { fileToDataUrl } = require('../utils/branchLogoUpload');
const { validateBranchLimit } = require('../utils/branchLimitHelper');

const managerInclude = {
  model: User,
  as: 'manager',
  attributes: ['id', 'name', 'email', 'role'],
  required: false,
};

/**
 * Validate and normalize shop payload (manager assignment).
 * @param {string} tenantId
 * @param {object} payload
 * @returns {Promise<object>}
 */
const prepareShopPayload = async (tenantId, payload) => {
  const next = { ...payload };
  delete next.managerName;

  [
    'code',
    'address',
    'city',
    'state',
    'postalCode',
    'phone',
    'email',
    'logoUrl',
  ].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(next, field)) {
      const value = next[field];
      next[field] = typeof value === 'string' && value.trim() === '' ? null : value;
    }
  });

  ['name', 'country'].forEach((field) => {
    if (typeof next[field] === 'string') {
      next[field] = next[field].trim();
    }
  });

  if (Object.prototype.hasOwnProperty.call(next, 'shopType')) {
    next.shopType = next.shopType ? String(next.shopType).trim() : null;
  }

  if (Object.prototype.hasOwnProperty.call(next, 'managerUserId')) {
    const check = await validateManagerUserId({
      tenantId,
      managerUserId: next.managerUserId,
    });
    if (!check.ok) {
      const err = new Error(check.message);
      err.statusCode = 400;
      throw err;
    }
    next.managerUserId = check.managerUserId;
  }
  return next;
};

const assertShopTenant = (req, res) => {
  if (!isShopTenant(req.tenant)) {
    res.status(400).json({
      success: false,
      message: 'Shops are only available for retail workspaces',
    });
    return false;
  }
  return true;
};

// @desc    Get all shops
// @route   GET /api/shops
// @access  Private
exports.getShops = async (req, res, next) => {
  try {
    if (resolveBusinessType(req.tenant?.businessType) === 'shop' || resolveBusinessType(req.tenant?.businessType) === 'rental') {
      await ensureDefaultShop(req.tenantId, { name: req.tenant?.name });
    }

    const { page, limit, offset } = getPagination(req);
    const search = req.query.search || '';

    let where = applyTenantFilter(req.tenantId, {});
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { code: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (req.shopScoped && !req.canAccessAllShops && req.allowedShopIds?.length) {
      where = applyShopFilter(req, where);
    }

    const { count, rows } = await Shop.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'ASC'],
      ],
      include: [managerInclude],
    });

    res.status(200).json({
      success: true,
      count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      },
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single shop
// @route   GET /api/shops/:id
// @access  Private
exports.getShop = async (req, res, next) => {
  try {
    const shop = await Shop.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [managerInclude],
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    try {
      assertShopIdAccess(req, shop.id);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    res.status(200).json({
      success: true,
      data: shop
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new shop
// @route   POST /api/shops
// @access  Private
exports.createShop = async (req, res, next) => {
  try {
    const payload = await prepareShopPayload(req.tenantId, sanitizePayload(req.body));
    const isFirst = (await Shop.count({ where: { tenantId: req.tenantId } })) === 0;
    if (!isFirst) {
      await validateBranchLimit(req.tenantId, 'shop');
    }

    const shop = await Shop.create({
      ...payload,
      tenantId: req.tenantId,
      isDefault: isFirst ? true : Boolean(payload.isDefault),
    });

    if (shop.isDefault && !isFirst) {
      await setAsOnlyDefaultShop(req.tenantId, shop.id);
    }

    if (shop.managerUserId) {
      await ensureManagerShopAccess(shop.managerUserId, req.tenantId, shop.id);
    }

    await shop.reload({ include: [managerInclude] });
    invalidateShopAccessCache(req.tenantId);

    res.status(201).json({
      success: true,
      data: shop
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.statusCode === 403 && error.code === 'BRANCH_LIMIT_EXCEEDED') {
      return res.status(403).json({ success: false, message: error.message, details: error.details });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'Shop code already exists' });
    }
    next(error);
  }
};

// @desc    Update shop
// @route   PUT /api/shops/:id
// @access  Private
exports.updateShop = async (req, res, next) => {
  try {
    const shop = await Shop.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [managerInclude],
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    const payload = await prepareShopPayload(req.tenantId, sanitizePayload(req.body));
    await shop.update(payload);

    if (payload.isDefault) {
      await setAsOnlyDefaultShop(req.tenantId, shop.id);
    }

    if (shop.managerUserId) {
      await ensureManagerShopAccess(shop.managerUserId, req.tenantId, shop.id);
    }

    await shop.reload({ include: [managerInclude] });
    invalidateShopAccessCache(req.tenantId);

    res.status(200).json({
      success: true,
      data: shop
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'Shop code already exists' });
    }
    next(error);
  }
};

// @desc    Upload shop logo (used on invoices/receipts for this shop)
// @route   POST /api/shops/:id/logo
exports.uploadShopLogo = async (req, res, next) => {
  try {
    const shop = await Shop.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
    });

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    try {
      assertShopIdAccess(req, shop.id);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const logoUrl = await fileToDataUrl(req.file);
    await shop.update({ logoUrl });
    await shop.reload({ include: [managerInclude] });
    invalidateShopAccessCache(req.tenantId);

    res.status(200).json({ success: true, data: shop });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// @desc    Delete shop
// @route   DELETE /api/shops/:id
// @access  Private
exports.deleteShop = async (req, res, next) => {
  try {
    const shop = await Shop.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [managerInclude],
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    const total = await Shop.count({ where: { tenantId: req.tenantId } });
    if (total <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the only shop for this workspace',
      });
    }

    const wasDefault = shop.isDefault;
    await shop.destroy();

    if (wasDefault) {
      const fallback = await Shop.findOne({
        where: { tenantId: req.tenantId },
        order: [['createdAt', 'ASC']],
      });
      if (fallback) {
        await fallback.update({ isDefault: true });
      }
    }
    invalidateShopAccessCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'Shop deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Accessible shops for current user (header switcher)
// @route   GET /api/shops/access
exports.getShopAccess = async (req, res, next) => {
  try {
    if (!assertShopTenant(req, res)) return;

    const where = applyTenantFilter(req.tenantId, { isActive: true });
    if (!req.canAccessAllShops) {
      if (!req.allowedShopIds?.length) {
        return res.status(200).json({
          success: true,
          data: {
            shops: [],
            canAccessAll: false,
            activeShopId: null,
            defaultShopId: req.defaultShopId,
          },
        });
      }
      where.id = { [Op.in]: req.allowedShopIds };
    }

    const shops = await Shop.findAll({
      where,
      order: [
        ['isDefault', 'DESC'],
        ['name', 'ASC'],
      ],
    });

    res.status(200).json({
      success: true,
      data: {
        shops,
        canAccessAll: !!req.canAccessAllShops,
        activeShopId: req.shopFilterId || null,
        defaultShopId: req.defaultShopId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign shops to a workspace user
// @route   PUT /api/shops/users/:userId/assignments
exports.setUserShopAssignments = async (req, res, next) => {
  try {
    if (!assertShopTenant(req, res)) return;

    if (!hasWorkspaceWideShopAccess(req.tenantRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only workspace administrators can assign shops',
      });
    }

    const { userId } = req.params;
    const { shopIds = [] } = req.body || {};

    const membership = await UserTenant.findOne({
      where: { userId, tenantId: req.tenantId, status: 'active' },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User is not an active member of this workspace',
      });
    }

    if (hasWorkspaceWideShopAccess(membership.role)) {
      return res.status(400).json({
        success: false,
        message: 'Workspace owners and admins have access to all shops',
      });
    }

    await setUserShops(userId, req.tenantId, shopIds);

    const ids = await getUserShopIds(userId, req.tenantId, membership.role);

    res.status(200).json({
      success: true,
      data: { userId, shopIds: ids },
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// @desc    Get shop assignments for a user
// @route   GET /api/shops/users/:userId/assignments
exports.getUserShopAssignments = async (req, res, next) => {
  try {
    if (!assertShopTenant(req, res)) return;

    if (!hasWorkspaceWideShopAccess(req.tenantRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only workspace administrators can view shop assignments',
      });
    }

    const { userId } = req.params;
    const membership = await UserTenant.findOne({
      where: { userId, tenantId: req.tenantId, status: 'active' },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User is not an active member of this workspace',
      });
    }

    const assignments = await UserShop.findAll({
      where: { userId, tenantId: req.tenantId },
      include: [{ model: Shop, as: 'shop' }],
    });

    res.status(200).json({
      success: true,
      data: {
        user: membership.user,
        role: membership.role,
        shopIds: assignments.map((a) => a.shopId),
        shops: assignments.map((a) => a.shop).filter(Boolean),
      },
    });
  } catch (error) {
    next(error);
  }
};
