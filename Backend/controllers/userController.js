const { User, UserTenant, UserShop, UserStudioLocation, InviteToken } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { getPagination } = require('../utils/paginationUtils');
const { invalidateUserCache } = require('../middleware/cache');
const { validateSeatLimit } = require('../utils/seatLimitHelper');

const ALLOWED_USER_ROLES = ['admin', 'manager', 'staff', 'driver'];
const ADMIN_LIKE_ROLES = ['owner', 'admin'];

const jsonError = (req, res, statusCode, error, errorCode) => {
  const requestId = req.id || req.headers?.['x-request-id'] || undefined;
  return res.status(statusCode).json({
    success: false,
    error,
    message: error,
    errorCode,
    requestId,
  });
};

// @desc    Get all users for the current tenant
// @route   GET /api/users
// @access  Private — workspace manager or admin
exports.getUsers = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const search = req.query.search || '';
    const role = req.query.role;
    const isActive = req.query.isActive;

    // Ensure tenantId is available (set by tenantContext middleware)
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // Build where clause for user search
    const userWhere = {};
    if (search) {
      userWhere[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (role && role !== 'null') {
      userWhere.role = role;
    }
    if (isActive && isActive !== 'null') {
      userWhere.isActive = isActive === 'true';
    }

    // Get users that belong to the current tenant through UserTenant relationship
    const { count, rows } = await User.findAndCountAll({
      where: userWhere,
      include: [
        {
          model: UserTenant,
          as: 'tenantMemberships',
          where: {
            tenantId: req.tenantId
          },
          required: true, // Inner join - only users with membership in this tenant
          attributes: ['role', 'status', 'isDefault', 'joinedAt']
        }
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true // Important for count with includes
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

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private — workspace manager or admin
exports.getUser = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // Verify user belongs to the current tenant
    const membership = await UserTenant.findOne({
      where: {
        userId: req.params.id,
        tenantId: req.tenantId
      }
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User not found in this tenant'
      });
    }

    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create user and add to tenant
// @route   POST /api/users
// @access  Private/Admin
exports.createUser = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    try {
      await validateSeatLimit(req.tenantId);
    } catch (error) {
      if (error.code === 'SEAT_LIMIT_EXCEEDED') {
        return res.status(403).json({
          success: false,
          message: error.message,
          code: 'SEAT_LIMIT_EXCEEDED',
          details: error.details,
          upgradeRequired: true,
        });
      }
      throw error;
    }

    const { password, ...userData } = req.body;
    const requestedRole = userData.role || 'staff';
    if (!ALLOWED_USER_ROLES.includes(requestedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Expected one of: ${ALLOWED_USER_ROLES.join(', ')}`,
      });
    }
    
    // Create user
    const user = await User.create({
      ...userData,
      password: password // Will be hashed by User model hook
    });

    // Add user to current tenant
    await UserTenant.create({
      userId: user.id,
      tenantId: req.tenantId,
      role: requestedRole,
      status: 'active',
      isDefault: true,
      joinedAt: new Date()
    });

    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private — workspace admin only
exports.updateUser = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // Verify user belongs to the current tenant
    const membership = await UserTenant.findOne({
      where: {
        userId: req.params.id,
        tenantId: req.tenantId
      }
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User not found in this tenant'
      });
    }

    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow updating password through this route
    const { password, ...updateData } = req.body;
    if (Object.prototype.hasOwnProperty.call(updateData, 'role')) {
      const requestedRole = updateData.role || 'staff';
      if (!ALLOWED_USER_ROLES.includes(requestedRole)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Expected one of: ${ALLOWED_USER_ROLES.join(', ')}`,
        });
      }
      updateData.role = requestedRole;
      await membership.update({ role: requestedRole });
    }

    await user.update(updateData);

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove a team member from this tenant (unlink membership; do not hard-delete the User)
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return jsonError(req, res, 400, 'Tenant context is required', 'TENANT_REQUIRED');
    }

    const targetUserId = req.params.id;
    if (req.user?.id && String(req.user.id) === String(targetUserId)) {
      return jsonError(
        req,
        res,
        400,
        'You cannot remove yourself from this workspace',
        'CANNOT_DELETE_SELF'
      );
    }

    const membership = await UserTenant.findOne({
      where: {
        userId: targetUserId,
        tenantId: req.tenantId
      }
    });

    if (!membership) {
      return jsonError(req, res, 404, 'User not found in this tenant', 'USER_NOT_IN_TENANT');
    }

    if (ADMIN_LIKE_ROLES.includes(membership.role)) {
      const remainingAdmins = await UserTenant.count({
        where: {
          tenantId: req.tenantId,
          role: { [Op.in]: ADMIN_LIKE_ROLES },
          userId: { [Op.ne]: targetUserId }
        }
      });
      if (remainingAdmins === 0) {
        return jsonError(
          req,
          res,
          409,
          'Cannot remove the last remaining owner or admin from this workspace',
          'CANNOT_REMOVE_LAST_ADMIN'
        );
      }
    }

    const userRecord = await User.findByPk(targetUserId, { attributes: ['id', 'email'] });

    await sequelize.transaction(async (transaction) => {
      await UserShop.destroy({
        where: { userId: targetUserId, tenantId: req.tenantId },
        transaction
      });
      await UserStudioLocation.destroy({
        where: { userId: targetUserId, tenantId: req.tenantId },
        transaction
      });
      if (userRecord?.email) {
        await InviteToken.destroy({
          where: {
            tenantId: req.tenantId,
            used: false,
            email: { [Op.iLike]: userRecord.email }
          },
          transaction
        });
      }
      await membership.destroy({ transaction });
    });

    invalidateUserCache(targetUserId);

    res.status(200).json({
      success: true,
      message: 'Team member removed from workspace successfully',
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle user status
// @route   PUT /api/users/:id/toggle-status
// @access  Private — workspace admin only
exports.toggleUserStatus = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // Verify user belongs to the current tenant
    const membership = await UserTenant.findOne({
      where: {
        userId: req.params.id,
        tenantId: req.tenantId
      }
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User not found in this tenant'
      });
    }

    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.update({ isActive: !user.isActive });
    invalidateUserCache(user.id);

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};


