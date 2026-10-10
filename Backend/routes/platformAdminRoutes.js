const express = require('express');
const { protect, requirePlatformAdmin } = require('../middleware/auth');
const {
  requirePlatformAdminPermission,
  requireAnyPlatformAdminPermission
} = require('../middleware/platformAdminPermissions');
const {
  listPlatformAdmins,
  createPlatformAdmin,
  updatePlatformAdmin,
  getPlatformAdminInviteRoles,
  generatePlatformAdminInvite,
  getPlatformAdminInvites,
  revokePlatformAdminInvite
} = require('../controllers/platformAdminController');

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

/**
 * @swagger
 * tags:
 *   name: PlatformAdmins
 *   description: Platform administrator management
 */

/**
 * @swagger
 * /api/platform-admins:
 *   get:
 *     summary: List platform administrators
 *     tags: [PlatformAdmins]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of platform admins.
 */
router.get('/', requireAnyPlatformAdminPermission('users.view', 'roles.view'), listPlatformAdmins);

router.get('/invite-roles', requirePlatformAdminPermission('users.manage'), getPlatformAdminInviteRoles);
router.post('/invite', requirePlatformAdminPermission('users.manage'), generatePlatformAdminInvite);
router.get('/invites', requirePlatformAdminPermission('users.view'), getPlatformAdminInvites);
router.delete('/invites/:id', requirePlatformAdminPermission('users.manage'), revokePlatformAdminInvite);

/**
 * @swagger
 * /api/platform-admins:
 *   post:
 *     summary: Create a new platform administrator
 *     tags: [PlatformAdmins]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Platform admin created.
 */
router.post('/', requirePlatformAdminPermission('users.manage'), createPlatformAdmin);

/**
 * @swagger
 * /api/platform-admins/{adminId}:
 *   put:
 *     summary: Update a platform administrator
 *     tags: [PlatformAdmins]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: adminId
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Platform admin updated.
 */
router.put('/:id', requirePlatformAdminPermission('users.manage'), updatePlatformAdmin);

module.exports = router;


