const { Op } = require('sequelize');
const {
  Lead,
  LeadActivity,
  User,
  Job
} = require('../models');
const { sequelize } = require('../config/database');
const { getPagination } = require('../utils/paginationUtils');
const { sanitizePayload } = require('../utils/tenantUtils');

const buildAdminLeadInclude = () => ([
  {
    model: User,
    as: 'assignee',
    attributes: ['id', 'name', 'email']
  },
  {
    model: User,
    as: 'createdByUser',
    attributes: ['id', 'name', 'email']
  },
  {
    model: Job,
    as: 'adminJobs',
    attributes: ['id', 'jobNumber', 'title', 'status'],
    where: { tenantId: null },
    required: false
  }
]);

/**
 * Get all admin leads (where tenantId IS NULL)
 * Visible to all platform admins for collaboration
 */
exports.getAdminLeads = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);

    const search = req.query.search;
    const status = req.query.status;
    const assignedTo = req.query.assignedTo;
    const priority = req.query.priority;
    const source = req.query.source;
    const isActive = req.query.isActive;

    // Admin leads: tenantId IS NULL
    const where = {
      tenantId: null
    };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (status && status !== 'all') {
      where.status = status;
    }
    if (assignedTo) {
      where.assignedTo = assignedTo;
    }
    if (priority && priority !== 'all') {
      where.priority = priority;
    }
    if (source && source !== 'all') {
      where.source = source;
    }
    if (isActive !== undefined && isActive !== 'all') {
      where.isActive = isActive === 'true';
    }

    const { count, rows } = await Lead.findAndCountAll({
      where,
      limit,
      offset,
      order: [['nextFollowUp', 'ASC'], ['createdAt', 'DESC']],
      include: buildAdminLeadInclude()
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

/**
 * Get single admin lead by ID
 */
exports.getAdminLead = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({
      where: {
        id: req.params.id,
        tenantId: null // Ensure it's an admin lead
      },
      include: [
        ...buildAdminLeadInclude(),
        {
          model: LeadActivity,
          as: 'activities',
          include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'DESC']]
        }
      ]
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Admin lead not found' });
    }

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new admin lead
 */
exports.createAdminLead = async (req, res, next) => {
  try {
    const payload = sanitizePayload(req.body);

    const lead = await Lead.create({
      ...payload,
      tenantId: null, // Admin lead - no tenant
      source: payload.source || 'unknown',
      status: payload.status || 'new',
      priority: payload.priority || 'medium',
      tags: payload.tags || [],
      createdBy: req.user?.id || null
    });

    const createdLead = await Lead.findOne({
      where: { id: lead.id, tenantId: null },
      include: buildAdminLeadInclude()
    });

    res.status(201).json({ success: true, data: createdLead });
  } catch (error) {
    next(error);
  }
};

/**
 * Update admin lead
 */
exports.updateAdminLead = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const lead = await Lead.findOne({
      where: {
        id: req.params.id,
        tenantId: null // Ensure it's an admin lead
      },
      transaction
    });
    
    if (!lead) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Admin lead not found' });
    }

    const previousStatus = lead.status;

    const fields = [
      'name', 'company', 'email', 'phone', 'source', 'status', 'priority',
      'assignedTo', 'nextFollowUp', 'lastContactedAt', 'notes', 'tags',
      'metadata', 'isActive'
    ];

    const updates = {};
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const sanitized = sanitizePayload(updates);

    // Validate incremental status progression
    if (sanitized.status && sanitized.status !== previousStatus) {
      const statusOrder = {
        'new': 1,
        'contacted': 2,
        'qualified': 3,
        'converted': 4,
        'lost': 4
      };

      const previousOrder = statusOrder[previousStatus];
      const newOrder = statusOrder[sanitized.status];

      if (previousStatus === 'converted' || previousStatus === 'lost') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot change status from '${previousStatus}'.`
        });
      }

      if (newOrder < previousOrder) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot change status from '${previousStatus}' to '${sanitized.status}'. Status changes must be incremental.`
        });
      }
    }

    // Update lastContactedAt if status changed to contacted
    if (sanitized.status === 'contacted' && previousStatus !== 'contacted') {
      sanitized.lastContactedAt = new Date();
    }

    await lead.update(sanitized, { transaction });
    await transaction.commit();

    const updatedLead = await Lead.findOne({
      where: { id: lead.id, tenantId: null },
      include: [
        ...buildAdminLeadInclude(),
        {
          model: LeadActivity,
          as: 'activities',
          include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'DESC']]
        }
      ]
    });

    res.status(200).json({ success: true, data: updatedLead });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

/**
 * Delete admin lead (soft delete)
 */
exports.deleteAdminLead = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({
      where: {
        id: req.params.id,
        tenantId: null // Ensure it's an admin lead
      }
    });
    
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Admin lead not found' });
    }

    await lead.update({ isActive: false, status: 'lost' });
    res.status(200).json({ success: true, message: 'Admin lead archived' });
  } catch (error) {
    next(error);
  }
};

/**
 * Add activity to admin lead
 */
exports.addAdminLeadActivity = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({
      where: {
        id: req.params.id,
        tenantId: null // Ensure it's an admin lead
      }
    });
    
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Admin lead not found' });
    }

    const payload = sanitizePayload(req.body);

    const activity = await LeadActivity.create({
      leadId: lead.id,
      tenantId: null, // Admin activity
      type: payload.type || 'note',
      subject: payload.subject || null,
      notes: payload.notes || null,
      createdBy: req.user?.id || null,
      nextStep: payload.nextStep || null,
      followUpDate: payload.followUpDate || null,
      metadata: payload.metadata || {}
    });

    const createdActivity = await LeadActivity.findOne({
      where: { id: activity.id },
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(201).json({ success: true, data: createdActivity });
  } catch (error) {
    next(error);
  }
};

const ADMIN_BROADCAST_MAX_RECIPIENTS = 500;
const ADMIN_BROADCAST_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * Email-broadcast a message to a selected set of admin leads (tenantId IS NULL), personalized with each lead's name.
 * Sent via ABS platform email (emailService.sendPlatformMessage) — admin leads have no tenant to own SMTP/Resend credentials.
 * SMS is intentionally not offered here: platform SMS billing/quota is tenant-scoped and not meaningful for tenantId=null.
 * @route   POST /api/admin/leads/broadcast
 */
exports.broadcastAdminLeads = async (req, res, next) => {
  try {
    const body = req.body || {};
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map((id) => String(id)) : [];
    if (leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one lead to message' });
    }
    if (leadIds.length > ADMIN_BROADCAST_MAX_RECIPIENTS) {
      return res.status(400).json({ success: false, message: `At most ${ADMIN_BROADCAST_MAX_RECIPIENTS} recipients per broadcast` });
    }

    const subject = String(body.subject || '').trim();
    const emailBody = String(body.emailBody || '');
    if (!subject || !emailBody.trim()) {
      return res.status(400).json({ success: false, message: 'Email subject and message are required' });
    }

    const leads = await Lead.findAll({
      where: { tenantId: null, id: { [Op.in]: leadIds }, doNotContact: { [Op.not]: true } },
      attributes: ['id', 'name', 'company', 'email', 'doNotContact'],
    });

    const emailService = require('../services/emailService');
    const { applySmsTemplate } = require('../utils/smsTemplateMerge');
    const businessName = process.env.APP_NAME || 'African Business Suite';

    const result = { sent: 0, skipped: 0, failed: [] };
    const seenEmails = new Set();

    for (const lead of leads) {
      const email = (lead.email || '').trim().toLowerCase();
      if (!email || !ADMIN_BROADCAST_EMAIL_REGEX.test(email) || seenEmails.has(email)) {
        result.skipped += 1;
        continue;
      }
      seenEmails.add(email);

      const name = (lead.name && lead.name.trim()) || (lead.company && lead.company.trim()) || 'there';
      const mergeVars = { name, businessName };
      const personalizedSubject = applySmsTemplate(subject, mergeVars);
      const personalizedBody = applySmsTemplate(emailBody, mergeVars);
      const html = `<p>${personalizedBody.replace(/\n/g, '<br/>')}</p>`;

      const sendRes = await emailService.sendPlatformMessage(email, personalizedSubject, html, personalizedBody, [], {
        context: { source: 'admin_lead_broadcast', userId: req.user?.id, leadId: lead.id },
      });
      if (sendRes.success) {
        result.sent += 1;
      } else {
        result.failed.push({ leadId: lead.id, reason: sendRes.error || 'send failed' });
      }
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Get admin lead statistics
 */
exports.getAdminLeadStats = async (req, res, next) => {
  try {
    const where = { tenantId: null };

    const [
      total,
      byStatus,
      byPriority,
      upcomingFollowUps
    ] = await Promise.all([
      Lead.count({ where }),
      Lead.findAll({
        where,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      }),
      Lead.findAll({
        where,
        attributes: [
          'priority',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['priority'],
        raw: true
      }),
      Lead.count({
        where: {
          ...where,
          nextFollowUp: {
            [Op.between]: [new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)] // Next 7 days
          }
        }
      })
    ]);

    const statusMap = {};
    byStatus.forEach(item => {
      statusMap[item.status] = parseInt(item.count);
    });

    const priorityMap = {};
    byPriority.forEach(item => {
      priorityMap[item.priority] = parseInt(item.count);
    });

    res.status(200).json({
      success: true,
      data: {
        total,
        byStatus: statusMap,
        byPriority: priorityMap,
        upcomingFollowUps
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Convert admin lead to admin job
 */
exports.convertAdminLeadToJob = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const lead = await Lead.findOne({
      where: {
        id: req.params.id,
        tenantId: null // Ensure it's an admin lead
      },
      transaction
    });
    
    if (!lead) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Admin lead not found' });
    }

    const jobData = sanitizePayload(req.body);
    
    // Generate job number for admin job (format: ADMIN-JOB-YYYYMM-####)
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const pattern = `ADMIN-JOB-${year}${month}-%`;
    
    const [existingJobs] = await sequelize.query(
      `SELECT "jobNumber",
              CAST(SPLIT_PART("jobNumber", '-', 4) AS INTEGER) as sequence
       FROM jobs 
       WHERE "tenantId" IS NULL
         AND "jobNumber" LIKE :pattern
         AND SPLIT_PART("jobNumber", '-', 4) ~ '^[0-9]+$'
       ORDER BY CAST(SPLIT_PART("jobNumber", '-', 4) AS INTEGER) DESC
       LIMIT 1`,
      {
        replacements: { pattern },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );
    
    let sequence = 1;
    if (existingJobs && existingJobs.length > 0 && existingJobs[0].sequence) {
      sequence = parseInt(existingJobs[0].sequence, 10) + 1;
    }
    
    const jobNumber = `ADMIN-JOB-${year}${month}-${String(sequence).padStart(4, '0')}`;

    // Create admin job
    const job = await Job.create({
      tenantId: null, // Admin job
      customerId: null, // No customer for admin jobs
      jobNumber,
      title: jobData.title || `Project for ${lead.company || lead.name}`,
      description: jobData.description || lead.notes || null,
      status: jobData.status || 'new',
      priority: jobData.priority || lead.priority || 'medium',
      assignedTo: jobData.assignedTo || null,
      startDate: jobData.startDate || null,
      dueDate: jobData.dueDate || null,
      notes: jobData.notes || null,
      adminLeadId: lead.id, // Link to admin lead
      createdBy: req.user?.id || null
    }, { transaction });

    // Update lead status to converted
    await lead.update({
      status: 'converted',
      convertedJobId: job.id
    }, { transaction });

    await transaction.commit();

    // Fetch created job with includes
    const createdJob = await Job.findOne({
      where: { id: job.id, tenantId: null },
      include: [
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Lead, as: 'adminLead', attributes: ['id', 'name', 'company', 'email', 'phone'] }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdJob,
      message: 'Admin lead converted to job successfully'
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};
