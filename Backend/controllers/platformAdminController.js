const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, InviteToken } = require('../models');
const { getPlatformAdminInviteRoles, isValidPlatformAdminInviteRole } = require('../config/platformAdminInviteRoles');
const { getFrontendBaseUrl } = require('../utils/frontendUrl');
const {
  isBootstrapPlatformSuperAdmin,
  isBootstrapPlatformSuperAdminEmail
} = require('../utils/platformAdminBootstrap');

const generateToken = () => crypto.randomBytes(16).toString('hex');

/** Super-admin addresses grant full access by email alone, so only a super admin may hand one out. */
const rejectReservedEmail = (req, res, email) => {
  if (isBootstrapPlatformSuperAdminEmail(email) && !isBootstrapPlatformSuperAdmin(req.user)) {
    res.status(403).json({
      success: false,
      message: 'This email address is reserved.'
    });
    return true;
  }
  return false;
};

/**
 * Get roles available for platform admin invites.
 * @route   GET /api/platform-admins/invite-roles
 */
exports.getPlatformAdminInviteRoles = async (req, res, next) => {
  try {
    const roles = getPlatformAdminInviteRoles();
    res.status(200).json({ success: true, data: roles });
  } catch (error) {
    next(error);
  }
};

/**
 * Invite a platform admin (same flow as shop invites: send link, invitee sets password on signup).
 * @route   POST /api/platform-admins/invite
 */
exports.generatePlatformAdminInvite = async (req, res, next) => {
  try {
    const { email, name, role: platformAdminRoleName, expiresInDays } = req.body || {};

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    if (!platformAdminRoleName || !isValidPlatformAdminInviteRole(platformAdminRoleName)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${getPlatformAdminInviteRoles().join(', ')}`
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (rejectReservedEmail(req, res, normalizedEmail)) return;
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    const existingInvite = await InviteToken.findOne({
      where: {
        email: normalizedEmail,
        inviteType: 'platform_admin',
        used: false,
        tenantId: null,
        expiresAt: { [Op.gt]: new Date() }
      }
    });
    if (existingInvite) {
      const frontendUrl = getFrontendBaseUrl(req);
      const inviteUrl = `${frontendUrl}/signup?token=${existingInvite.token}`;
      return res.status(400).json({
        success: false,
        message: 'An active invite already exists for this email. You can revoke it or use the existing link.',
        data: { inviteUrl, invite: existingInvite }
      });
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

    const invite = await InviteToken.create({
      token,
      email: normalizedEmail,
      name: name ? name.trim() : null,
      role: 'admin',
      inviteType: 'platform_admin',
      tenantId: null,
      platformAdminRoleName,
      createdBy: req.user.id,
      expiresAt,
      used: false
    });

    const frontendUrl = getFrontendBaseUrl(req);
    const inviteUrl = `${frontendUrl}/signup?token=${token}`;

    res.status(201).json({
      success: true,
      data: { invite, inviteUrl }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List pending platform admin invites.
 * @route   GET /api/platform-admins/invites
 */
exports.getPlatformAdminInvites = async (req, res, next) => {
  try {
    const invites = await InviteToken.findAll({
      where: { inviteType: 'platform_admin', tenantId: null, used: false },
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({
      success: true,
      data: invites
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Revoke a platform admin invite.
 * @route   DELETE /api/platform-admins/invites/:id
 */
exports.revokePlatformAdminInvite = async (req, res, next) => {
  try {
    const invite = await InviteToken.findOne({
      where: { id: req.params.id, inviteType: 'platform_admin', tenantId: null }
    });
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite not found' });
    }
    if (invite.used) {
      return res.status(400).json({ success: false, message: 'Cannot revoke an already used invite' });
    }
    await invite.destroy();
    res.status(200).json({ success: true, message: 'Invite revoked successfully' });
  } catch (error) {
    next(error);
  }
};

exports.listPlatformAdmins = async (req, res, next) => {
  try {
    const admins = await User.findAll({
      where: { isPlatformAdmin: true },
      attributes: ['id', 'name', 'email', 'isActive', 'lastLogin', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: admins
    });
  } catch (error) {
    next(error);
  }
};

exports.createPlatformAdmin = async (req, res, next) => {
  try {
    const { name, email, password, isActive = true } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (rejectReservedEmail(req, res, normalizedEmail)) return;
    const existing = await User.findOne({ where: { email: normalizedEmail } });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    const admin = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'admin',
      isPlatformAdmin: true,
      isActive
    });

    res.status(201).json({
      success: true,
      data: admin
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePlatformAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, password, isActive } = req.body || {};

    const admin = await User.findOne({
      where: { id, isPlatformAdmin: true }
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Platform admin not found'
      });
    }

    if (isBootstrapPlatformSuperAdmin(admin) && !isBootstrapPlatformSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only a super admin can change a super admin's account."
      });
    }

    if (name !== undefined) {
      admin.name = name;
    }
    if (isActive !== undefined) {
      admin.isActive = Boolean(isActive);
    }
    if (password) {
      admin.password = password;
    }

    await admin.save();

    res.status(200).json({
      success: true,
      data: admin
    });
  } catch (error) {
    next(error);
  }
};


