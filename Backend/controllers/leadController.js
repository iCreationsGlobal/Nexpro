const { Op, Sequelize } = require('sequelize');
const {
  Lead,
  LeadActivity,
  User,
  Customer,
  Job
} = require('../models');
const { sequelize } = require('../config/database');
const config = require('../config/config');
const { getPagination } = require('../utils/paginationUtils');
const activityLogger = require('../services/activityLogger');
const { emitBusinessEvent } = require('../services/businessEvents');
const { invalidateCustomerListCache } = require('../middleware/cache');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const {
  applyStudioLocationReadFilter,
} = require('../utils/studioLocationUtils');
const { applyShopReadFilter, attachScopedToPayload } = require('../utils/shopUtils');

/** Empty string is not a valid UUID for PostgreSQL; treat as unassigned. */
const normalizeAssignedTo = (value) => {
  if (value === '' || value === undefined) return null;
  return value;
};

const logLeadDebug = (...args) => {
  if (config.nodeEnv === 'development') {
    console.log('[LeadController]', ...args);
  }
};

const buildLeadInclude = () => ([
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
    model: Customer,
    as: 'convertedCustomer',
    attributes: ['id', 'name', 'company']
  },
  {
    model: Job,
    as: 'convertedJob',
    attributes: ['id', 'jobNumber', 'title']
  }
]);

const leadWhere = (req, extra = {}) =>
  applyShopReadFilter(req, applyStudioLocationReadFilter(req, applyTenantFilter(req.tenantId, extra)));

exports.getLeads = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);

    const search = req.query.search;
    const status = req.query.status;
    const assignedTo = req.query.assignedTo;
    const priority = req.query.priority;
    const source = req.query.source;
    const isActive = req.query.isActive;

    const where = leadWhere(req, {});

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
      include: buildLeadInclude()
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

// @desc    Export leads to CSV
// @route   GET /api/leads/export
// @access  Private (admin, manager)
exports.exportLeads = async (req, res, next) => {
  try {
    const { sendCSV, COLUMN_DEFINITIONS } = require('../utils/dataExport');
    const where = leadWhere(req, {});

    const leads = await Lead.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: buildLeadInclude(),
      raw: false,
    });
    const rows = leads.map((l) => {
      const plain = l.get({ plain: true });
      return {
        ...plain,
        assignee: plain.assignee || {},
      };
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No leads to export' });
    }

    const filename = `leads_${new Date().toISOString().split('T')[0]}`;
    sendCSV(res, rows, `${filename}.csv`, COLUMN_DEFINITIONS.leads);
  } catch (error) {
    next(error);
  }
};

exports.getLead = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({
      where: leadWhere(req, { id: req.params.id }),
      include: [
        ...buildLeadInclude(),
        {
          model: LeadActivity,
          as: 'activities',
          include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'DESC']]
        }
      ]
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
};

exports.createLead = async (req, res, next) => {
  try {
    const payload = sanitizePayload(req.body);
    if (Object.prototype.hasOwnProperty.call(payload, 'assignedTo')) {
      payload.assignedTo = normalizeAssignedTo(payload.assignedTo);
    }

    if (payload.convertedCustomerId) {
      const customer = await Customer.findOne({
        where: applyTenantFilter(req.tenantId, { id: payload.convertedCustomerId })
      });
      if (!customer) {
        return res.status(400).json({ success: false, message: 'Customer not found for this tenant' });
      }
    }

    if (payload.convertedJobId) {
      const job = await Job.findOne({
        where: applyTenantFilter(req.tenantId, { id: payload.convertedJobId })
      });
      if (!job) {
        return res.status(400).json({ success: false, message: 'Job not found for this tenant' });
      }
    }

    const lead = await Lead.create(
      attachScopedToPayload(req, {
        ...payload,
        tenantId: req.tenantId,
        source: payload.source || 'unknown',
        status: payload.status || 'new',
        priority: payload.priority || 'medium',
        tags: payload.tags || [],
        createdBy: req.user?.id || null
      })
    );

    const createdLead = await Lead.findOne({
      where: applyTenantFilter(req.tenantId, { id: lead.id }),
      include: buildLeadInclude()
    });

    if (createdLead && createdLead.assignedTo) {
      try {
        await activityLogger.logLeadAssigned(createdLead, req.user?.id || null);
      } catch (error) {
        console.error('[LeadController] Failed to log lead activity:', error);
      }
      emitBusinessEvent(req.tenantId, 'lead.assigned', {
        leadId: createdLead.id,
        assigneeId: createdLead.assignedTo,
      });
    }

    emitBusinessEvent(req.tenantId, 'lead.created', { leadId: (createdLead || lead).id });

    res.status(201).json({ success: true, data: createdLead });
  } catch (error) {
    next(error);
  }
};

exports.updateLead = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const lead = await Lead.findOne({
      where: leadWhere(req, { id: req.params.id }),
      transaction
    });
    if (!lead) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const previousStatus = lead.status;
    const previousAssignedTo = lead.assignedTo;

    const fields = [
      'name', 'company', 'email', 'phone', 'source', 'status', 'priority',
      'assignedTo', 'nextFollowUp', 'lastContactedAt', 'notes', 'tags',
      'metadata', 'convertedCustomerId', 'convertedJobId', 'isActive'
    ];

    const updates = {};
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const sanitized = sanitizePayload(updates);
    if (Object.prototype.hasOwnProperty.call(sanitized, 'assignedTo')) {
      sanitized.assignedTo = normalizeAssignedTo(sanitized.assignedTo);
    }

    // Validate incremental status progression
    if (sanitized.status && sanitized.status !== previousStatus) {
      // Define status progression order (incremental only)
      const statusOrder = {
        'new': 1,
        'contacted': 2,
        'qualified': 3,
        'converted': 4,
        'lost': 4  // converted and lost are both terminal states at same level
      };

      const previousOrder = statusOrder[previousStatus];
      const newOrder = statusOrder[sanitized.status];

      // Terminal states cannot be changed from
      if (previousStatus === 'converted' || previousStatus === 'lost') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot change status from '${previousStatus}'. Once a lead is ${previousStatus}, the status cannot be changed.`
        });
      }

      // Validate that status change is forward/incremental only
      if (newOrder < previousOrder) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot change status from '${previousStatus}' to '${sanitized.status}'. Status changes must be incremental (forward progression only).`
        });
      }
    }

    if (sanitized.convertedCustomerId) {
      const customer = await Customer.findOne({
        where: applyTenantFilter(req.tenantId, { id: sanitized.convertedCustomerId }),
        transaction
      });
      if (!customer) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Customer not found for this tenant' });
      }
    }

    if (sanitized.convertedJobId) {
      const job = await Job.findOne({
        where: applyTenantFilter(req.tenantId, { id: sanitized.convertedJobId }),
        transaction
      });
      if (!job) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Job not found for this tenant' });
      }
    }

    // Auto-convert to customer if status is changed to 'converted' and no customer exists
    let autoCreatedCustomer = null;
    if (sanitized.status === 'converted' && sanitized.status !== previousStatus) {
      if (!lead.convertedCustomerId && !sanitized.convertedCustomerId) {
        // Create customer from lead data
        const customerPayload = {
          name: lead.name || lead.company || 'New Customer',
          company: lead.company || null,
          email: lead.email || null,
          phone: lead.phone || null,
          notes: lead.notes || null
        };

        autoCreatedCustomer = await Customer.create(
          attachScopedToPayload(req, { ...customerPayload, tenantId: req.tenantId }),
          { transaction }
        );

        // Set the convertedCustomerId
        sanitized.convertedCustomerId = autoCreatedCustomer.id;

        // Create activity for conversion
        await LeadActivity.create(
          {
            leadId: lead.id,
            tenantId: req.tenantId,
            type: 'note',
            subject: 'Lead Converted',
            notes: `Lead automatically converted to customer ${autoCreatedCustomer.name}`,
            createdBy: req.user?.id || null,
            metadata: {
              customerId: autoCreatedCustomer.id,
              autoConverted: true
            }
          },
          { transaction }
        );
      }
    }

    await lead.update(sanitized, { transaction });

    let activityCreated = false;
    if (sanitized.status && sanitized.status !== previousStatus) {
      // Log status change notification
      await activityLogger.logLeadStatusChanged(lead, previousStatus, sanitized.status, req.user?.id || null);
      if (!autoCreatedCustomer) {
        const statusLabels = {
          new: 'New',
          contacted: 'Contacted',
          qualified: 'Qualified',
          converted: 'Converted',
          lost: 'Lost'
        };
        const oldStatusLabel = statusLabels[previousStatus] || previousStatus;
        const newStatusLabel = statusLabels[sanitized.status] || sanitized.status;
        const statusComment = req.body.statusComment || '';
        const notesText = statusComment
          ? `Status changed from ${oldStatusLabel} to ${newStatusLabel}. ${statusComment}`
          : `Status changed from ${oldStatusLabel} to ${newStatusLabel}`;
        await LeadActivity.create({
          leadId: lead.id,
          tenantId: req.tenantId,
          type: 'note',
          subject: 'Status Updated',
          notes: notesText,
          createdBy: req.user?.id || null,
          metadata: {
            statusChange: true,
            oldStatus: previousStatus,
            newStatus: sanitized.status,
            comment: statusComment || null
          }
        }, { transaction });
        activityCreated = true;
      }
    }
    if (!activityCreated) {
      await LeadActivity.create({
        leadId: lead.id,
        tenantId: req.tenantId,
        type: 'note',
        subject: 'Lead Updated',
        notes: 'Details were updated',
        createdBy: req.user?.id || null,
        metadata: {}
      }, { transaction });
    }

    await transaction.commit();
    if (autoCreatedCustomer) {
      invalidateCustomerListCache(req.tenantId);
    }

    // Fetch updated lead with all includes including activities
    const updatedLead = await Lead.findOne({
      where: applyTenantFilter(req.tenantId, { id: lead.id }),
      include: [
        ...buildLeadInclude(),
        {
          model: LeadActivity,
          as: 'activities',
          include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'DESC']]
        }
      ]
    });

    // If customer was auto-created, log the conversion activity
    if (autoCreatedCustomer && updatedLead.convertedCustomer) {
      try {
        await activityLogger.logLeadConverted(updatedLead, updatedLead.convertedCustomer, req.user?.id || null);
      } catch (error) {
        console.error('[LeadController] Failed to log lead conversion activity:', error);
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(sanitized, 'assignedTo')
      && sanitized.assignedTo
      && sanitized.assignedTo !== previousAssignedTo
    ) {
      emitBusinessEvent(req.tenantId, 'lead.assigned', {
        leadId: lead.id,
        assigneeId: sanitized.assignedTo,
      });
    }

    res.status(200).json({ success: true, data: updatedLead });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

exports.deleteLead = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({
      where: leadWhere(req, { id: req.params.id })
    });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    await lead.update({ isActive: false, status: 'lost' });
    res.status(200).json({ success: true, message: 'Lead archived' });
  } catch (error) {
    next(error);
  }
};

exports.addLeadActivity = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({
      where: leadWhere(req, { id: req.params.id })
    });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const payload = sanitizePayload(req.body);

    const activity = await LeadActivity.create({
      leadId: lead.id,
      tenantId: req.tenantId,
      type: payload.type || 'note',
      subject: payload.subject || null,
      notes: payload.notes || null,
      createdBy: req.user?.id || null,
      nextStep: payload.nextStep || null,
      followUpDate: payload.followUpDate || null,
      metadata: payload.metadata || {}
    });

    if (payload.followUpDate) {
      await lead.update({ nextFollowUp: payload.followUpDate });
    }
    if (payload.updateStatus) {
      await lead.update({ status: payload.updateStatus });
    }

    const populatedActivity = await LeadActivity.findOne({
      where: applyTenantFilter(req.tenantId, { id: activity.id }),
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    await activityLogger.logLeadActivityLogged(lead, populatedActivity, req.user?.id || null);

    res.status(201).json({ success: true, data: populatedActivity });
  } catch (error) {
    next(error);
  }
};

exports.getLeadActivities = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({
      where: leadWhere(req, { id: req.params.id })
    });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const activities = await LeadActivity.findAll({
      where: applyTenantFilter(req.tenantId, { leadId: lead.id }),
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
};

exports.getLeadSummary = async (req, res, next) => {
  try {
    const [summary] = await Lead.findAll({
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('Lead.id')), 'totalLeads'],
        [Sequelize.fn('SUM', Sequelize.literal(`CASE WHEN status = 'new' THEN 1 ELSE 0 END`)), 'newLeads'],
        [Sequelize.fn('SUM', Sequelize.literal(`CASE WHEN status = 'qualified' THEN 1 ELSE 0 END`)), 'qualifiedLeads'],
        [Sequelize.fn('SUM', Sequelize.literal(`CASE WHEN status = 'converted' THEN 1 ELSE 0 END`)), 'convertedLeads'],
        [Sequelize.fn('SUM', Sequelize.literal(`CASE WHEN status = 'lost' THEN 1 ELSE 0 END`)), 'lostLeads']
      ],
      where: leadWhere(req, {})
    });

    const upcomingFollowUps = await Lead.findAll({
      where: leadWhere(req, {
        nextFollowUp: {
          [Op.ne]: null,
          [Op.lte]: Sequelize.literal("NOW() + interval '7 days'")
        },
        isActive: true
      }),
      order: [['nextFollowUp', 'ASC']],
      limit: 5,
      include: buildLeadInclude()
    });

    res.status(200).json({
      success: true,
      data: {
        totals: summary ? summary.toJSON() : {},
        upcomingFollowUps
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.convertLead = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    // First, fetch lead without includes to avoid FOR UPDATE with JOIN issue
    const lead = await Lead.findOne({
      where: leadWhere(req, { id: req.params.id }),
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!lead) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const previousStatus = lead.status;

    if (lead.convertedCustomerId) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        data: lead,
        message: 'Lead already converted'
      });
    }

    const customerPayload = {
      name: lead.name || lead.company || 'New Customer',
      company: lead.company || null,
      email: lead.email || null,
      phone: lead.phone || null,
      notes: lead.notes || null
    };

    const customer = await Customer.create(
      attachScopedToPayload(req, { ...customerPayload, tenantId: req.tenantId }),
      { transaction }
    );

    await lead.update(
      {
        status: 'converted',
        convertedCustomerId: customer.id
      },
      { transaction }
    );

    await LeadActivity.create(
      {
        leadId: lead.id,
        tenantId: req.tenantId,
        type: 'note',
        subject: 'Lead Converted',
        notes: `Lead converted to customer ${customer.name}`,
        createdBy: req.user?.id || null,
        metadata: {
          customerId: customer.id
        }
      },
      { transaction }
    );

    await transaction.commit();
    invalidateCustomerListCache(req.tenantId);

    const updatedLead = await Lead.findOne({
      where: applyTenantFilter(req.tenantId, { id: lead.id }),
      include: buildLeadInclude()
    });

    await activityLogger.logLeadConverted(updatedLead, customer, req.user?.id || null);

    res.status(200).json({
      success: true,
      data: updatedLead,
      customer
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};


