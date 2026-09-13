const { Op } = require('sequelize');
const { Customer, DeliveryEvent } = require('../models');
const smsService = require('../services/smsService');
const { applySmsTemplate, estimateSmsSegments } = require('../utils/smsTemplateMerge');
const { getTenantCreditsSummary, resolvePlatformSmsBilling } = require('../services/absCreditsService');
const { sequelize } = require('../config/database');

const MAX_COMPOSE_RECIPIENTS = 500;

/**
 * Parse pasted phone numbers (comma / whitespace / newline separated).
 * @param {unknown} recipients
 * @returns {string[]}
 */
function parseRecipientList(recipients) {
  if (Array.isArray(recipients)) {
    return recipients.map((value) => String(value || '').trim()).filter(Boolean);
  }
  if (typeof recipients === 'string') {
    return recipients
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * GET /api/messages/overview
 */
exports.getMessagesOverview = async (req, res, next) => {
  try {
    const [credits, smsMode, recent, platformSettings, smsSetting] = await Promise.all([
      getTenantCreditsSummary(req.tenantId),
      smsService.getSmsMode(req.tenantId),
      DeliveryEvent.findAll({
        where: { tenantId: req.tenantId, channel: 'sms' },
        order: [['createdAt', 'DESC']],
        limit: 8,
        attributes: [
          'id', 'status', 'source', 'provider', 'errorCode', 'errorMessage',
          'recipientMasked', 'subjectOrContext', 'createdAt', 'metadata',
        ],
      }),
      require('../services/platformSmsSettingsService').getPlatformSmsSettingsSummary(),
      require('../models').Setting.findOne({ where: { tenantId: req.tenantId, key: 'sms' } }),
    ]);

    const preferred = smsSetting?.value?.preferredPlatformSenderId || null;
    const senderId = preferred
      || platformSettings?.arkesel?.senderId
      || platformSettings?.mnotify?.senderId
      || 'ABS';

    return res.status(200).json({
      success: true,
      data: {
        smsMode,
        credits,
        recentSends: recent,
        senderId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/messages/history
 */
exports.getSmsHistory = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const status = String(req.query.status || '').trim().toLowerCase();

    const where = { tenantId: req.tenantId, channel: 'sms' };
    if (status === 'success' || status === 'failed') {
      where.status = status;
    }

    const { rows, count } = await DeliveryEvent.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: [
        'id', 'status', 'source', 'provider', 'errorCode', 'errorMessage',
        'recipientMasked', 'subjectOrContext', 'createdAt', 'metadata',
      ],
    });

    return res.status(200).json({
      success: true,
      data: {
        events: rows,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.max(1, Math.ceil(count / limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/messages/compose
 * Body: { recipients?, customerIds?, groupId?, message, dryRun? }
 */
exports.composeSms = async (req, res, next) => {
  try {
    const messageTemplate = String(req.body?.message || '').trim();
    const dryRun = Boolean(req.body?.dryRun);
    const customerIds = Array.isArray(req.body?.customerIds)
      ? req.body.customerIds.map((id) => String(id)).filter(Boolean)
      : [];
    const groupId = req.body?.groupId ? String(req.body.groupId) : null;
    const rawPhones = parseRecipientList(req.body?.recipients);

    if (!messageTemplate) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    if (messageTemplate.length > 1000) {
      return res.status(400).json({ success: false, message: 'Message is too long (max 1000 characters)' });
    }

    /** @type {Array<{ phone: string, name?: string, customerId?: string }>} */
    const targets = [];
    const seen = new Set();

    const pushTarget = (phone, extra = {}) => {
      const formatted = smsService.validatePhoneNumber(phone);
      if (!formatted || seen.has(formatted)) return;
      seen.add(formatted);
      targets.push({ phone: formatted, ...extra });
    };

    rawPhones.forEach((phone) => pushTarget(phone));

    if (customerIds.length) {
      const customers = await Customer.findAll({
        where: {
          tenantId: req.tenantId,
          id: { [Op.in]: customerIds },
        },
        attributes: ['id', 'name', 'phone'],
      });
      customers.forEach((customer) => {
        if (customer.phone) {
          pushTarget(customer.phone, {
            name: customer.name || '',
            customerId: customer.id,
          });
        }
      });
    }

    if (groupId) {
      try {
        const [members] = await sequelize.query(
          `
            SELECT phone, name, "customerId"
            FROM sms_message_group_members
            WHERE "tenantId" = :tenantId AND "groupId" = :groupId
          `,
          { replacements: { tenantId: req.tenantId, groupId } }
        );
        (members || []).forEach((member) => {
          pushTarget(member.phone, {
            name: member.name || '',
            customerId: member.customerId || undefined,
          });
        });
      } catch (error) {
        const code = error?.parent?.code || error?.original?.code;
        if (code !== '42P01') throw error;
      }
    }

    if (!targets.length) {
      return res.status(400).json({
        success: false,
        message: 'Add at least one valid recipient phone number, customer, or group',
      });
    }
    if (targets.length > MAX_COMPOSE_RECIPIENTS) {
      return res.status(400).json({
        success: false,
        message: `Too many recipients (max ${MAX_COMPOSE_RECIPIENTS})`,
      });
    }

    const sampleBody = applySmsTemplate(messageTemplate, {
      name: targets[0].name || 'Customer',
      businessName: req.tenant?.name || 'Business',
    });
    const segments = estimateSmsSegments(sampleBody);
    const estimatedCredits = targets.length * segments.segments;

    const smsMode = await smsService.getSmsMode(req.tenantId);
    let billing = null;
    if (smsMode === 'platform') {
      billing = await resolvePlatformSmsBilling(req.tenantId, estimatedCredits);
    }

    if (dryRun) {
      return res.status(200).json({
        success: true,
        data: {
          dryRun: true,
          recipientCount: targets.length,
          sampleBody,
          segments,
          estimatedCredits,
          smsMode,
          billing,
        },
      });
    }

    if (smsMode === 'none') {
      return res.status(400).json({
        success: false,
        message: 'SMS is not configured. Connect a provider or enable ABS platform SMS.',
        errorCode: 'SMS_NOT_CONFIGURED',
      });
    }

    if (billing && !billing.allowed) {
      return res.status(402).json({
        success: false,
        message: billing.error,
        errorCode: billing.errorCode,
        data: { billing },
      });
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [],
    };

    for (const target of targets) {
      const body = applySmsTemplate(messageTemplate, {
        name: target.name || '',
        businessName: req.tenant?.name || '',
      });
      const usageCount = estimateSmsSegments(body).segments;
      // eslint-disable-next-line no-await-in-loop
      const sendResult = await smsService.sendMessage(
        req.tenantId,
        target.phone,
        body,
        null,
        {
          source: 'compose_sms',
          usageCount,
          context: {
            customerId: target.customerId || null,
            composedBy: req.user?.id || null,
          },
        }
      );
      if (sendResult.success) {
        results.sent += 1;
      } else {
        results.failed += 1;
        if (results.errors.length < 10) {
          results.errors.push({
            phone: target.phone,
            error: sendResult.error,
            errorCode: sendResult.errorCode,
          });
        }
      }
    }

    const credits = await getTenantCreditsSummary(req.tenantId);

    return res.status(200).json({
      success: true,
      message: `Sent ${results.sent} of ${targets.length} messages`,
      data: {
        ...results,
        recipientCount: targets.length,
        estimatedCredits,
        credits,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marketing SMS templates CRUD
 */
exports.listMarketingTemplates = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(
      `
        SELECT id, title, content, "createdAt", "updatedAt"
        FROM sms_marketing_templates
        WHERE "tenantId" = :tenantId
        ORDER BY "updatedAt" DESC
      `,
      { replacements: { tenantId: req.tenantId } }
    );
    return res.status(200).json({ success: true, data: { templates: rows || [] } });
  } catch (error) {
    if (error?.parent?.code === '42P01') {
      return res.status(200).json({ success: true, data: { templates: [] } });
    }
    next(error);
  }
};

exports.createMarketingTemplate = async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }
    const [rows] = await sequelize.query(
      `
        INSERT INTO sms_marketing_templates ("tenantId", title, content, "createdAt", "updatedAt")
        VALUES (:tenantId, :title, :content, NOW(), NOW())
        RETURNING id, title, content, "createdAt", "updatedAt"
      `,
      { replacements: { tenantId: req.tenantId, title, content } }
    );
    return res.status(201).json({ success: true, data: rows?.[0] });
  } catch (error) {
    if (error?.parent?.code === '42P01') {
      return res.status(503).json({ success: false, message: 'Messaging tables are not migrated yet' });
    }
    next(error);
  }
};

exports.updateMarketingTemplate = async (req, res, next) => {
  try {
    const id = req.params.id;
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }
    const [rows] = await sequelize.query(
      `
        UPDATE sms_marketing_templates
        SET title = :title, content = :content, "updatedAt" = NOW()
        WHERE id = :id AND "tenantId" = :tenantId
        RETURNING id, title, content, "createdAt", "updatedAt"
      `,
      { replacements: { id, tenantId: req.tenantId, title, content } }
    );
    if (!rows?.[0]) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteMarketingTemplate = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(
      `
        DELETE FROM sms_marketing_templates
        WHERE id = :id AND "tenantId" = :tenantId
        RETURNING id
      `,
      { replacements: { id: req.params.id, tenantId: req.tenantId } }
    );
    if (!rows?.[0]) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    return res.status(200).json({ success: true, message: 'Template deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Groups list + create + import members
 */
exports.listMessageGroups = async (req, res, next) => {
  try {
    const [groups] = await sequelize.query(
      `
        SELECT
          g.id,
          g.name,
          g.description,
          g."createdAt",
          g."updatedAt",
          COALESCE(m.member_count, 0)::int AS "memberCount"
        FROM sms_message_groups g
        LEFT JOIN (
          SELECT "groupId", COUNT(*)::int AS member_count
          FROM sms_message_group_members
          GROUP BY "groupId"
        ) m ON m."groupId" = g.id
        WHERE g."tenantId" = :tenantId
        ORDER BY g."updatedAt" DESC
      `,
      { replacements: { tenantId: req.tenantId } }
    );
    return res.status(200).json({ success: true, data: { groups: groups || [] } });
  } catch (error) {
    if (error?.parent?.code === '42P01') {
      return res.status(200).json({ success: true, data: { groups: [] } });
    }
    next(error);
  }
};

exports.createMessageGroup = async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }
    const [rows] = await sequelize.query(
      `
        INSERT INTO sms_message_groups ("tenantId", name, description, "createdAt", "updatedAt")
        VALUES (:tenantId, :name, :description, NOW(), NOW())
        RETURNING id, name, description, "createdAt", "updatedAt"
      `,
      { replacements: { tenantId: req.tenantId, name, description } }
    );
    return res.status(201).json({ success: true, data: { ...rows[0], memberCount: 0 } });
  } catch (error) {
    if (error?.parent?.code === '42P01') {
      return res.status(503).json({ success: false, message: 'Messaging tables are not migrated yet' });
    }
    next(error);
  }
};

/**
 * POST /api/messages/groups/:id/members
 * Body: { members: [{ phone, name? }], customerIds?: [] }
 */
exports.addGroupMembers = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const [groups] = await sequelize.query(
      `SELECT id FROM sms_message_groups WHERE id = :groupId AND "tenantId" = :tenantId LIMIT 1`,
      { replacements: { groupId, tenantId: req.tenantId } }
    );
    if (!groups?.[0]) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    const customerIds = Array.isArray(req.body?.customerIds) ? req.body.customerIds : [];
    const toInsert = [];

    members.forEach((member) => {
      const phone = smsService.validatePhoneNumber(member?.phone);
      if (!phone) return;
      toInsert.push({
        phone,
        name: member?.name ? String(member.name).trim() : null,
        customerId: null,
      });
    });

    if (customerIds.length) {
      const customers = await Customer.findAll({
        where: { tenantId: req.tenantId, id: { [Op.in]: customerIds } },
        attributes: ['id', 'name', 'phone'],
      });
      customers.forEach((customer) => {
        const phone = smsService.validatePhoneNumber(customer.phone);
        if (!phone) return;
        toInsert.push({
          phone,
          name: customer.name || null,
          customerId: customer.id,
        });
      });
    }

    let added = 0;
    for (const member of toInsert) {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await sequelize.query(
        `
          INSERT INTO sms_message_group_members (
            "groupId", "tenantId", "customerId", phone, name, "createdAt"
          )
          VALUES (:groupId, :tenantId, :customerId, :phone, :name, NOW())
          ON CONFLICT ("groupId", phone) DO UPDATE
            SET name = COALESCE(EXCLUDED.name, sms_message_group_members.name),
                "customerId" = COALESCE(EXCLUDED."customerId", sms_message_group_members."customerId")
          RETURNING id
        `,
        {
          replacements: {
            groupId,
            tenantId: req.tenantId,
            customerId: member.customerId,
            phone: member.phone,
            name: member.name,
          },
        }
      );
      if (rows?.[0]) added += 1;
    }

    await sequelize.query(
      `UPDATE sms_message_groups SET "updatedAt" = NOW() WHERE id = :groupId`,
      { replacements: { groupId } }
    );

    return res.status(200).json({
      success: true,
      message: `Added or updated ${added} members`,
      data: { added },
    });
  } catch (error) {
    if (error?.parent?.code === '42P01') {
      return res.status(503).json({ success: false, message: 'Messaging tables are not migrated yet' });
    }
    next(error);
  }
};

/**
 * PUT /api/messages/sender-id — preferred platform SMS sender ID (max 11 chars)
 */
exports.updatePreferredSenderId = async (req, res, next) => {
  try {
    const { Setting } = require('../models');
    const senderId = String(req.body?.senderId || '').trim().substring(0, 11);
    if (!senderId) {
      return res.status(400).json({ success: false, message: 'senderId is required' });
    }
    if (!/^[A-Za-z0-9 ]+$/.test(senderId)) {
      return res.status(400).json({
        success: false,
        message: 'Sender ID may only contain letters, numbers, and spaces',
      });
    }

    let setting = await Setting.findOne({ where: { tenantId: req.tenantId, key: 'sms' } });
    const value = { ...(setting?.value || {}) };
    value.preferredPlatformSenderId = senderId;
    if (setting) {
      await setting.update({ value });
    } else {
      setting = await Setting.create({
        tenantId: req.tenantId,
        key: 'sms',
        value: { enabled: false, preferredPlatformSenderId: senderId },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Preferred Sender ID saved. Ghana networks must approve this ID with the SMS provider.',
      data: { senderId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/messages/birthday-setup — create birthday SMS automation if missing
 */
exports.setupBirthdayMessaging = async (req, res, next) => {
  try {
    const { AutomationRule } = require('../models');
    const message = String(req.body?.message || '').trim()
      || 'Happy birthday {{customerName}}! Wishing you a wonderful day from everyone at {{businessName}}.';

    const existing = null;
    // Prefer metadata.source match without relying on JSON path operators
    let rule = existing;
    if (!rule) {
      const candidates = await AutomationRule.findAll({
        where: { tenantId: req.tenantId, triggerType: 'customer_birthday' },
        limit: 20,
      });
      rule = candidates.find((row) => row.metadata?.source === 'messages_birthday_setup') || null;
    }

    if (rule) {
      await rule.update({
        enabled: true,
        actionConfig: {
          actions: [
            {
              type: 'send_sms',
              body: message,
            },
          ],
        },
        conditionConfig: { birthdayMatch: 'today' },
        updatedBy: req.user?.id || null,
      });
      return res.status(200).json({
        success: true,
        message: 'Birthday SMS automation updated and enabled',
        data: { id: rule.id, created: false },
      });
    }

    const created = await AutomationRule.create({
      tenantId: req.tenantId,
      name: 'Birthday SMS',
      enabled: true,
      triggerType: 'customer_birthday',
      triggerConfig: {},
      conditionConfig: { birthdayMatch: 'today' },
      actionConfig: {
        actions: [{ type: 'send_sms', body: message }],
      },
      scheduleConfig: {},
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
      metadata: { source: 'messages_birthday_setup' },
    });

    return res.status(201).json({
      success: true,
      message: 'Birthday SMS automation created',
      data: { id: created.id, created: true },
    });
  } catch (error) {
    next(error);
  }
};
