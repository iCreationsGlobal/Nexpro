const { sequelize } = require('../config/database');
const { Customer, Job, CustomerActivity, User } = require('../models');
const { Op } = require('sequelize');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const {
  applyStudioLocationFilter,
} = require('../utils/studioLocationUtils');
const {
  applyShopReadFilter,
  attachScopedToPayload,
  assertShopRecordAccess,
  getShopReadSqlFragment,
} = require('../utils/shopUtils');
const { getPagination } = require('../utils/paginationUtils');
const { invalidateCustomerListCache } = require('../middleware/cache');
const { runCustomerCreatedAutomations } = require('../services/automationEngineService');
const { assertCustomerContactUnique } = require('../utils/customerUniquenessUtils');
const { normalizeBirthdayDate } = require('../utils/customerBirthday');

const RENTAL_METADATA_KEYS = [
  'guarantor',
  'emergencyContact',
  'riskProfile',
  'verification',
  'preferences',
  'history',
];

/**
 * Normalize metadata to a plain object (never null/array).
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function normalizeMetadataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...value };
}

/**
 * Deep-merge customer metadata patches without clobbering unrelated keys.
 * Nested `metadata.rental.*` sections merge field-by-field.
 * @param {Record<string, unknown>|null|undefined} existing
 * @param {Record<string, unknown>|null|undefined} incoming
 * @returns {Record<string, unknown>}
 */
function mergeCustomerMetadata(existing, incoming) {
  const base = normalizeMetadataObject(existing);
  const patch = normalizeMetadataObject(incoming);
  const merged = { ...base, ...patch };

  if (!patch.rental || typeof patch.rental !== 'object' || Array.isArray(patch.rental)) {
    return merged;
  }

  const baseRental = normalizeMetadataObject(base.rental);
  const patchRental = normalizeMetadataObject(patch.rental);
  merged.rental = { ...baseRental, ...patchRental };

  for (const key of RENTAL_METADATA_KEYS) {
    if (
      patchRental[key]
      && typeof patchRental[key] === 'object'
      && !Array.isArray(patchRental[key])
    ) {
      merged.rental[key] = {
        ...(baseRental[key] && typeof baseRental[key] === 'object' && !Array.isArray(baseRental[key])
          ? baseRental[key]
          : {}),
        ...patchRental[key],
      };
    }
  }

  return merged;
}

/**
 * Apply metadata merge rules to create/update payloads.
 * @param {Record<string, unknown>} payload
 * @param {Record<string, unknown>|null|undefined} [existingMetadata]
 */
function applyCustomerMetadataPayload(payload, existingMetadata) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
    return;
  }

  if (existingMetadata !== undefined) {
    payload.metadata = mergeCustomerMetadata(existingMetadata, payload.metadata);
    return;
  }

  payload.metadata = normalizeMetadataObject(payload.metadata);
}

const customerReadWhere = (req, extra = {}) =>
  applyShopReadFilter(req, applyStudioLocationFilter(req, applyTenantFilter(req.tenantId, extra)));

/**
 * Normalize optional birthday to DATEONLY `2000-MM-DD` (day + month only).
 * @param {Record<string, unknown>} payload
 */
function normalizeCustomerBirthdayPayload(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'dateOfBirth')) return;
  if (payload.dateOfBirth === '' || payload.dateOfBirth == null) {
    payload.dateOfBirth = null;
    return;
  }
  payload.dateOfBirth = normalizeBirthdayDate(payload.dateOfBirth);
}

// @desc    Get customer stats (counts for summary cards) – single query, no row fetch
// @route   GET /api/customers/stats
// @access  Private
exports.getCustomerStats = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    let locationSql = '';
    const replacements = { tenantId };
    if (req.studioLocationScoped && req.studioLocationFilterId) {
      locationSql = ' AND "studioLocationId" = :studioLocationId';
      replacements.studioLocationId = req.studioLocationFilterId;
    } else if (req.studioLocationScoped && req.allowedStudioLocationIds?.length) {
      locationSql = ' AND "studioLocationId" IN (:studioLocationIds)';
      replacements.studioLocationIds = req.allowedStudioLocationIds;
    }
    const shopFrag = getShopReadSqlFragment(req);
    locationSql += shopFrag.sql;
    Object.assign(replacements, shopFrag.replacements);
    const [result] = await sequelize.query(
      `SELECT
        COUNT(*)::int AS "totalCustomers",
        COUNT(*) FILTER (WHERE "isActive" = true)::int AS "activeCustomers",
        COUNT(*) FILTER (WHERE "isActive" = false)::int AS "inactiveCustomers",
        COUNT(*) FILTER (WHERE "isActive" = true AND COALESCE(balance, 0) > 0)::int AS "returningCustomers"
      FROM customers WHERE "tenantId" = :tenantId${locationSql}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    res.status(200).json({
      success: true,
      data: {
        totalCustomers: result?.totalCustomers ?? 0,
        activeCustomers: result?.activeCustomers ?? 0,
        inactiveCustomers: result?.inactiveCustomers ?? 0,
        returningCustomers: result?.returningCustomers ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const search = req.query.search || '';
    const isActive = req.query.isActive;
    const howDidYouHear = req.query.howDidYouHear;

    let where = customerReadWhere(req, {});
    if (isActive !== undefined && isActive !== 'all') {
      where.isActive = isActive === 'true';
    }
    if (howDidYouHear && howDidYouHear !== 'all') {
      where.howDidYouHear = howDidYouHear;
    }
    if (search) {
      const term = `%${search}%`;
      where = {
        [Op.and]: [
          where,
          {
            [Op.or]: [
              { name: { [Op.iLike]: term } },
              { company: { [Op.iLike]: term } },
              { email: { [Op.iLike]: term } },
              { phone: { [Op.iLike]: term } }
            ]
          }
        ]
      };
    }

    const { count, rows } = await Customer.findAndCountAll({
      where,
      limit,
      offset,
      attributes: [
        'id',
        'name',
        'company',
        'email',
        'phone',
        'dateOfBirth',
        'isActive',
        'balance',
        'creditLimit',
        'shopId',
        'tenantId',
        'howDidYouHear',
        'createdAt',
        'updatedAt',
      ],
      order: [['createdAt', 'DESC']]
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

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      where: customerReadWhere(req, { id: req.params.id }),
      include: [
        {
          model: Job,
          as: 'jobs',
          limit: 10,
          order: [['createdAt', 'DESC']],
          where: applyTenantFilter(req.tenantId, {}),
          required: false
        },
        {
          model: CustomerActivity,
          as: 'activities',
          include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'DESC']],
          required: false
        }
      ]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res, next) => {
  try {
    const payload = sanitizePayload(req.body);
    if (payload.email === '') payload.email = null;
    if (payload.phone === '') payload.phone = null;
    normalizeCustomerBirthdayPayload(payload);

    const referralCode = payload.referralCode || payload.partnerReferralCode;
    delete payload.referralCode;
    delete payload.partnerReferralCode;

    if (referralCode) {
      const { findPartnershipByReferralCode } = require('../services/partnerProgramService');
      const partnership = await findPartnershipByReferralCode(referralCode, req.tenantId);
      if (partnership) {
        payload.partnershipId = partnership.id;
        payload.partnerMarketerId = partnership.marketerId;
        if (!payload.howDidYouHear) payload.howDidYouHear = 'Sabito Partner';
        if (!payload.referralName) payload.referralName = partnership.referralCode;
      }
    }

    await assertCustomerContactUnique(req, {
      phone: payload.phone,
      email: payload.email,
    });
    applyCustomerMetadataPayload(payload);
    const customer = await Customer.create(
      attachScopedToPayload(req, {
        ...payload,
        tenantId: req.tenantId,
      })
    );
    invalidateCustomerListCache(req.tenantId);

    try {
      const partnerReferralService = require('../services/partnerReferralService');
      await partnerReferralService.matchPendingReferralsForCustomer(customer);
      await customer.reload();
    } catch (matchError) {
      console.error('[CustomerController] partner referral match failed:', matchError?.message || matchError);
    }

    runCustomerCreatedAutomations({
      tenantId: req.tenantId,
      customer,
      actorUserId: req.user?.id || null,
    }).catch((error) =>
      console.error('[CustomerController] customer_created automations failed:', error?.message || error)
    );

    res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      where: customerReadWhere(req, { id: req.params.id }),
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    try {
      assertShopRecordAccess(req, customer);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const payload = sanitizePayload(req.body);
    if (payload.email === '') payload.email = null;
    if (payload.phone === '') payload.phone = null;
    normalizeCustomerBirthdayPayload(payload);
    delete payload.studioLocationId;
    delete payload.shopId;
    await assertCustomerContactUnique(req, {
      phone: payload.phone !== undefined ? payload.phone : customer.phone,
      email: payload.email !== undefined ? payload.email : customer.email,
      excludeCustomerId: customer.id,
    });
    applyCustomerMetadataPayload(payload, customer.metadata);
    await customer.update(payload);
    invalidateCustomerListCache(req.tenantId);

    try {
      const partnerReferralService = require('../services/partnerReferralService');
      await partnerReferralService.matchPendingReferralsForCustomer(customer);
      await customer.reload();
    } catch (matchError) {
      console.error('[CustomerController] partner referral match on update failed:', matchError?.message || matchError);
    }

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private (admin, manager, staff)
exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      where: customerReadWhere(req, { id: req.params.id }),
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    try {
      assertShopRecordAccess(req, customer);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    await customer.destroy();
    invalidateCustomerListCache(req.tenantId);

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add activity to customer
// @route   POST /api/customers/:id/activities
// @access  Private
exports.addCustomerActivity = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      where: customerReadWhere(req, { id: req.params.id }),
    });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const payload = sanitizePayload(req.body);

    const activity = await CustomerActivity.create({
      customerId: customer.id,
      tenantId: req.tenantId,
      type: payload.type || 'note',
      subject: payload.subject || null,
      notes: payload.notes || null,
      createdBy: req.user?.id || null,
      nextStep: payload.nextStep || null,
      followUpDate: payload.followUpDate || null,
      metadata: payload.metadata || {}
    });

    const populatedActivity = await CustomerActivity.findOne({
      where: applyTenantFilter(req.tenantId, { id: activity.id }),
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(201).json({ success: true, data: populatedActivity });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer activities
// @route   GET /api/customers/:id/activities
// @access  Private
exports.getCustomerActivities = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const activities = await CustomerActivity.findAll({
      where: applyTenantFilter(req.tenantId, { customerId: customer.id }),
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
};

// @desc    Find customer by phone or create new one
// @route   POST /api/customers/find-or-create
// @access  Private
// @note    Used for quick customer creation during POS checkout
exports.findOrCreateCustomer = async (req, res, next) => {
  try {
    const { phone, name } = req.body;
    const { formatToE164, isValidPhoneNumber } = require('../utils/phoneUtils');

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Normalize and validate (African formats: 0XX, +233, etc.)
    const normalizedPhone = formatToE164(phone.trim());
    if (!normalizedPhone || !isValidPhoneNumber(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number. Use format 0XX XXX XXXX or +233 XX XXX XXXX'
      });
    }

    // Try to find existing customer by phone (normalized and raw for backwards compatibility)
    const rawTrimmed = phone.trim().replace(/[\s\-\(\)]/g, '');
    let customer = await Customer.findOne({
      where: customerReadWhere(req, {
        phone: {
          [Op.or]: [
            { [Op.eq]: normalizedPhone },
            { [Op.eq]: rawTrimmed },
            { [Op.eq]: phone.trim() }
          ]
        }
      }),
    });

    let created = false;

    if (!customer) {
      await assertCustomerContactUnique(req, { phone: normalizedPhone });
      customer = await Customer.create(
        attachScopedToPayload(req, {
          name: name || `Customer ${normalizedPhone.slice(-4)}`,
          phone: normalizedPhone,
          tenantId: req.tenantId,
          source: 'pos',
          metadata: {
            createdFrom: 'pos_scan_mode',
            createdAt: new Date().toISOString(),
          },
        })
      );
      created = true;
    } else if (name && !customer.name) {
      // Update name if customer exists but has no name
      await customer.update({ name });
    }

    res.status(created ? 201 : 200).json({
      success: true,
      created,
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk create customers
// @route   POST /api/customers/bulk
// @access  Private (admin, manager)
exports.bulkCreateCustomers = async (req, res, next) => {
  try {
    const { customers } = req.body;
    const { bulkCreate } = require('../utils/bulkOperations');

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of customers'
      });
    }

    const result = await bulkCreate(Customer, customers, {
      tenantId: req.tenantId,
      userId: req.user?.id,
      continueOnError: true,
      maxBatchSize: 100,
    });
    invalidateCustomerListCache(req.tenantId);

    res.status(result.success ? 201 : 207).json({
      success: result.success,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk update customers
// @route   PUT /api/customers/bulk
// @access  Private (admin, manager)
exports.bulkUpdateCustomers = async (req, res, next) => {
  try {
    const { customers } = req.body;
    const { bulkUpdate } = require('../utils/bulkOperations');

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of customer updates'
      });
    }

    const result = await bulkUpdate(Customer, customers, {
      tenantId: req.tenantId,
      userId: req.user?.id,
      continueOnError: true,
      maxBatchSize: 100,
    });
    invalidateCustomerListCache(req.tenantId);

    res.status(result.success ? 200 : 207).json({
      success: result.success,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk delete customers
// @route   DELETE /api/customers/bulk
// @access  Private (admin only)
exports.bulkDeleteCustomers = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const { bulkDelete } = require('../utils/bulkOperations');

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of customer IDs'
      });
    }

    const result = await bulkDelete(Customer, ids, {
      tenantId: req.tenantId,
      continueOnError: true,
      maxBatchSize: 100,
    });
    invalidateCustomerListCache(req.tenantId);

    res.status(result.success ? 200 : 207).json({
      success: result.success,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk update customer status
// @route   PUT /api/customers/bulk/status
// @access  Private (admin, manager)
exports.bulkUpdateCustomerStatus = async (req, res, next) => {
  try {
    const { ids, status } = req.body;
    const { bulkStatusUpdate } = require('../utils/bulkOperations');

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of customer IDs'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a status'
      });
    }

    const result = await bulkStatusUpdate(Customer, ids, status, {
      tenantId: req.tenantId,
      maxBatchSize: 100,
    });
    invalidateCustomerListCache(req.tenantId);

    res.status(result.success ? 200 : 400).json({
      success: result.success,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export customers to CSV/Excel
// @route   GET /api/customers/export
// @access  Private (admin, manager)
exports.exportCustomers = async (req, res, next) => {
  try {
    const { format = 'csv', status, source } = req.query;
    const { sendCSV, sendExcel, COLUMN_DEFINITIONS } = require('../utils/dataExport');

    // Build filter
    const where = applyTenantFilter(req.tenantId, {});
    if (status) where.status = status;
    if (source) where.source = source;

    // Get all customers (no pagination for export)
    const customers = await Customer.findAll({
      where,
      order: [['createdAt', 'DESC']],
      raw: true,
      nest: true
    });

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No customers to export'
      });
    }

    const filename = `customers_${new Date().toISOString().split('T')[0]}`;
    const columns = COLUMN_DEFINITIONS.customers;

    if (format === 'excel') {
      await sendExcel(res, customers, `${filename}.xlsx`, {
        columns,
        sheetName: 'Customers',
        title: 'Customer List'
      });
    } else {
      sendCSV(res, customers, `${filename}.csv`, columns);
    }
  } catch (error) {
    next(error);
  }
};

