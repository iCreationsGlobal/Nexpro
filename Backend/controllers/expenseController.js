const fs = require('fs');
const path = require('path');
const { Expense, Vendor, Job, User, Shop } = require('../models');
const ExpenseActivity = require('../models/ExpenseActivity');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const {
  applyShopReadFilter,
  attachScopedToPayload,
  assertShopRecordAccess,
} = require('../utils/shopUtils');
const { applyStudioLocationFilter } = require('../utils/studioLocationUtils');

/** Expense queries scoped by tenant + active shop/studio location when applicable. */
const expenseScopeWhere = (req, extra = {}) =>
  applyShopReadFilter(req, applyStudioLocationFilter(req, applyTenantFilter(req.tenantId, extra)));

/** Job lookups scoped to the active studio location for studio tenants. */
const jobScopeWhere = (req, extra = {}) =>
  applyStudioLocationFilter(req, applyTenantFilter(req.tenantId, extra));

/** Load one expense with shop access checks. */
const findScopedExpense = async (req, id, options = {}) => {
  const expense = await Expense.findOne({
    where: expenseScopeWhere(req, { id }),
    ...options,
  });
  if (!expense) return { expense: null };
  try {
    assertShopRecordAccess(req, expense);
  } catch (accessErr) {
    return { expense, accessErr };
  }
  return { expense };
};
const { getExpenseCategories } = require('../config/expenseCategories');
const { getPagination } = require('../utils/paginationUtils');
const activityLogger = require('../services/activityLogger');
const { createExpenseJournal } = require('../services/expenseAccountingService');
const { invalidateAfterMutation, invalidateExpenseStatsCache } = require('../middleware/cache');
const { baseUploadDir, ensureDirExists } = require('../middleware/upload');
const {
  getCreateApprovalDefaults,
  stripCreateApprovalFields
} = require('../utils/expenseApprovalDefaults');

/**
 * Auth middleware sets `req.user` (not `req.userId`). Prefer `req.user.id`.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const getActorUserId = (req) => req.user?.id || req.userId || null;

/**
 * Prefer persisted submitter; fall back to creation/submission activity actor or approver.
 * Covers older rows created when submittedBy was not persisted correctly.
 * @param {Object} expensePlain - Plain expense JSON (with includes)
 * @returns {Object}
 */
const withSubmitterFallback = (expensePlain) => {
  if (!expensePlain || expensePlain.submitter) return expensePlain;

  const activities = Array.isArray(expensePlain.activities) ? expensePlain.activities : [];
  const creationActor = activities.find(
    (activity) => activity?.type === 'creation' && activity.createdByUser
  )?.createdByUser;
  const submissionActor = activities.find(
    (activity) => activity?.type === 'submission' && activity.createdByUser
  )?.createdByUser;
  const anyActivityActor = activities.find((activity) => activity?.createdByUser)?.createdByUser;
  const fallbackActor = creationActor || submissionActor || anyActivityActor || expensePlain.approver || null;

  if (!fallbackActor) return expensePlain;
  return { ...expensePlain, submitter: fallbackActor };
};

/**
 * Validate expense create payload before DB work (fail fast).
 * @param {Object} payload - Sanitized request body
 * @returns {string|null} Error message or null when valid
 */
const validateCreateExpensePayload = (payload = {}) => {
  const category = payload.category;
  if (!category || String(category).trim() === '') {
    return 'Category is required';
  }

  const amount = Number(payload.amount);
  if (payload.amount == null || payload.amount === '' || Number.isNaN(amount) || amount <= 0) {
    return 'Amount must be greater than 0';
  }

  return null;
};

const normalizeExpenseDescription = (payload = {}) => {
  if (payload.description === undefined || payload.description === null) {
    payload.description = '';
  }
  return payload;
};

/**
 * Generate unique expense number with optional transaction for advisory lock (prevents race conditions).
 * @param {string} tenantId - Tenant UUID
 * @param {Object} [transaction] - Sequelize transaction (when provided, uses advisory lock and sees uncommitted rows)
 * @returns {Promise<string>} - e.g. EXP-202601-0001
 */
exports.generateExpenseNumber = async (tenantId, transaction = null) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const pattern = `EXP-${year}${month}-%`;

  try {
    if (transaction) {
      const lockId = `expense_number_${tenantId}_${year}${month}`.replace(/-/g, '_').substring(0, 63);
      const [lockHash] = await sequelize.query(
        'SELECT hashtext(:lockId) AS lock_hash',
        {
          replacements: { lockId },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      const lockKey = Math.abs(lockHash?.lock_hash || 0);
      await sequelize.query('SELECT pg_advisory_xact_lock(:lockKey)', {
        replacements: { lockKey },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });
    }

    const queryResults = await sequelize.query(
      `SELECT "expenseNumber"
       FROM expenses
       WHERE "tenantId" = :tenantId
         AND "expenseNumber" LIKE :pattern
       ORDER BY "expenseNumber" DESC
       LIMIT 1`,
      {
        replacements: { tenantId, pattern },
        type: sequelize.QueryTypes.SELECT,
        transaction: transaction || undefined
      }
    );

    let sequence = 1;
    const result = Array.isArray(queryResults) && queryResults.length > 0 ? queryResults[0] : null;
    if (result?.expenseNumber) {
      const maxSeq = parseInt(String(result.expenseNumber).split('-')[2], 10);
      if (!Number.isNaN(maxSeq) && maxSeq >= 1) {
        sequence = maxSeq + 1;
      }
    }

    return `EXP-${year}${month}-${String(sequence).padStart(4, '0')}`;
  } catch (err) {
    console.error('[ExpenseNumber] Error with advisory lock/query, using fallback:', err.message);
    const fallbackResults = await sequelize.query(
      `SELECT MAX(CAST(SPLIT_PART("expenseNumber", '-', 3) AS INTEGER)) AS max_sequence
       FROM expenses
       WHERE "tenantId" = :tenantId
         AND "expenseNumber" LIKE :pattern
         AND SPLIT_PART("expenseNumber", '-', 3) ~ '^[0-9]+$'`,
      {
        replacements: { tenantId, pattern },
        type: sequelize.QueryTypes.SELECT
      }
    );
    let sequence = 1;
    const row = Array.isArray(fallbackResults) && fallbackResults.length > 0 ? fallbackResults[0] : null;
    if (row?.max_sequence != null) {
      const maxSeq = parseInt(row.max_sequence, 10);
      if (!Number.isNaN(maxSeq) && maxSeq >= 1) {
        sequence = maxSeq + 1;
      }
    }
    return `EXP-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }
};

/**
 * Generate unique expense number for internal (platform) admin expenses.
 * @param {Object} [transaction] - Sequelize transaction
 * @returns {Promise<string>} - e.g. ADMIN-EXP-202602-0001
 */
exports.generateAdminExpenseNumber = async (transaction = null) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const pattern = `ADMIN-EXP-${year}${month}-%`;

  try {
    if (transaction) {
      const lockId = `admin_expense_number_${year}${month}`.replace(/-/g, '_').substring(0, 63);
      const [lockHash] = await sequelize.query(
        'SELECT hashtext(:lockId) AS lock_hash',
        {
          replacements: { lockId },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      const lockKey = Math.abs(lockHash?.lock_hash || 0);
      await sequelize.query('SELECT pg_advisory_xact_lock(:lockKey)', {
        replacements: { lockKey },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });
    }

    const queryResults = await sequelize.query(
      `SELECT "expenseNumber",
              CAST(SPLIT_PART("expenseNumber", '-', 4) AS INTEGER) AS sequence
       FROM expenses
       WHERE "tenantId" IS NULL
         AND "expenseNumber" LIKE :pattern
         AND SPLIT_PART("expenseNumber", '-', 4) ~ '^[0-9]+$'
       ORDER BY CAST(SPLIT_PART("expenseNumber", '-', 4) AS INTEGER) DESC
       LIMIT 1`,
      {
        replacements: { pattern },
        type: sequelize.QueryTypes.SELECT,
        transaction: transaction || undefined
      }
    );

    let sequence = 1;
    const result = Array.isArray(queryResults) && queryResults.length > 0 ? queryResults[0] : null;
    if (result && result.sequence != null) {
      const maxSeq = parseInt(result.sequence, 10);
      if (!Number.isNaN(maxSeq) && maxSeq >= 1) {
        sequence = maxSeq + 1;
      }
    }

    return `ADMIN-EXP-${year}${month}-${String(sequence).padStart(4, '0')}`;
  } catch (err) {
    console.error('[AdminExpenseNumber] Error:', err.message);
    const timestamp = Date.now().toString().slice(-6);
    return `ADMIN-EXP-${year}${month}-${timestamp}`;
  }
};

/**
 * @desc    Upload expense receipt (image or PDF)
 * @route   POST /api/expenses/upload-receipt
 * @access  Private
 */
exports.uploadExpenseReceipt = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

    if (isServerless) {
      const mime = req.file.mimetype || 'image/jpeg';
      const base64 = req.file.buffer.toString('base64');
      const receiptUrl = `data:${mime};base64,${base64}`;
      return res.status(200).json({ success: true, receiptUrl });
    }

    const tenantId = req.tenantId;
    const subDir = path.join('expenses', tenantId);
    const uploadPath = path.join(baseUploadDir, subDir);
    ensureDirExists(uploadPath);
    const ext = path.extname(req.file.originalname) || '.jpg';
    const sanitized = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.[^.]+$/, '') || 'receipt';
    const filename = `${Date.now()}-${sanitized}${ext}`;
    const filePath = path.join(uploadPath, filename);
    fs.writeFileSync(filePath, req.file.buffer);
    const receiptUrl = `/uploads/expenses/${tenantId}/${filename}`;
    res.status(200).json({ success: true, receiptUrl });
  } catch (error) {
    next(error);
  }
};

// @desc    Get expense categories for current tenant (based on business type, shop/studio type, and custom)
// @route   GET /api/expenses/categories
// @access  Private
exports.getExpenseCategories = async (req, res, next) => {
  try {
    const tenant = req.tenant || (req.tenantMembership && await req.tenantMembership.getTenant());
    const businessType = tenant?.businessType || 'shop';
    const metadata = tenant?.metadata || {};
    const defaultCategories = getExpenseCategories(businessType, metadata);
    const custom = Array.isArray(metadata.customExpenseCategories) ? metadata.customExpenseCategories : [];
    const merged = [...new Set([...defaultCategories, ...custom])].sort();

    res.status(200).json({
      success: true,
      data: merged,
      custom
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add a custom expense category for the current tenant
 * @route   POST /api/expenses/categories
 * @access  Private (admin, manager, staff)
 */
exports.addCustomExpenseCategory = async (req, res, next) => {
  try {
    const tenant = req.tenant || (req.tenantMembership && await req.tenantMembership.getTenant());
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }
    const metadata = tenant.metadata || {};
    const custom = Array.isArray(metadata.customExpenseCategories) ? [...metadata.customExpenseCategories] : [];
    if (custom.includes(name)) {
      const defaultCategories = getExpenseCategories(tenant.businessType || 'shop', metadata);
      const merged = [...new Set([...defaultCategories, ...custom])].sort();
      return res.status(200).json({
        success: true,
        data: merged,
        custom,
        message: 'Category already exists'
      });
    }
    custom.push(name);
    custom.sort();
    metadata.customExpenseCategories = custom;
    tenant.metadata = metadata;
    await tenant.save();

    const defaultCategories = getExpenseCategories(tenant.businessType || 'shop', metadata);
    const merged = [...new Set([...defaultCategories, ...custom])].sort();

    res.status(201).json({
      success: true,
      data: merged,
      custom,
      message: 'Custom category added'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove a custom expense category for the current tenant
 * @route   DELETE /api/expenses/categories
 * @access  Private (admin, manager, staff)
 */
exports.removeCustomExpenseCategory = async (req, res, next) => {
  try {
    const tenant = req.tenant || (req.tenantMembership && await req.tenantMembership.getTenant());
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    const name = typeof req.query?.name === 'string' ? req.query.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, error: 'Category name (query param "name") is required' });
    }
    const metadata = tenant.metadata || {};
    const custom = Array.isArray(metadata.customExpenseCategories) ? [...metadata.customExpenseCategories] : [];
    const idx = custom.indexOf(name);
    if (idx === -1) {
      const defaultCategories = getExpenseCategories(tenant.businessType || 'shop', metadata);
      const merged = [...new Set([...defaultCategories, ...custom])].sort();
      return res.status(200).json({
        success: true,
        data: merged,
        custom,
        message: 'Category not in custom list'
      });
    }

    const expenseCount = await Expense.count({
      where: applyTenantFilter(tenant.id, { category: name }),
    });
    if (expenseCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete: ${expenseCount} expense(s) use this category. Reassign those expenses first.`,
      });
    }

    custom.splice(idx, 1);
    metadata.customExpenseCategories = custom;
    tenant.metadata = metadata;
    await tenant.save();

    const defaultCategories = getExpenseCategories(tenant.businessType || 'shop', metadata);
    const merged = [...new Set([...defaultCategories, ...custom])].sort();

    res.status(200).json({
      success: true,
      data: merged,
      custom,
      message: 'Custom category removed'
    });
  } catch (error) {
    next(error);
  }
};

// @access  Private
// @note    Returns expenses from all users in the tenant, not filtered by current user
exports.getExpenses = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const category = req.query.category;
    const status = req.query.status;
    const jobId = req.query.jobId;
    const approvalStatus = req.query.approvalStatus;
    const viewType = req.query.viewType;
    const includeArchived = req.query.includeArchived === 'true';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Filter by tenant only - returns expenses from all users in the tenant
    const where = expenseScopeWhere(req, {});
    if (category && category !== 'null') where.category = category;
    if (status && status !== 'null') where.status = status;
    if (jobId && jobId !== 'null') where.jobId = jobId;
    if (approvalStatus && approvalStatus !== 'null') where.approvalStatus = approvalStatus;
    if (viewType === 'general') where.jobId = null;
    if (viewType === 'job-specific') where.jobId = { [Op.ne]: null };
    // Exclude archived expenses by default
    if (!includeArchived) {
      where.isArchived = false;
    }
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      where.expenseDate = {
        [Op.between]: [start, end]
      };
    }

    const { count, rows } = await Expense.findAndCountAll({
      where,
      limit,
      offset,
      include: [
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'company'] },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] },
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
        {
          model: ExpenseActivity,
          as: 'activities',
          required: false,
          separate: true,
          where: { type: 'creation' },
          attributes: ['id', 'type', 'createdBy', 'createdAt'],
          include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }],
          limit: 1,
        },
      ],
      order: [['expenseDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      },
      data: rows.map((row) => withSubmitterFallback(row.toJSON ? row.toJSON() : row))
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export expenses to CSV/Excel
// @route   GET /api/expenses/export
// @access  Private (admin, manager)
exports.exportExpenses = async (req, res, next) => {
  try {
    const { format = 'csv', status, category } = req.query;
    const { sendCSV, sendExcel, COLUMN_DEFINITIONS } = require('../utils/dataExport');

    const where = expenseScopeWhere(req, {});
    if (status) where.status = status;
    if (category) where.category = category;

    const expenses = await Expense.findAll({
      where,
      include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name'] }],
      order: [['expenseDate', 'DESC']],
      raw: false
    });
    const rows = expenses.map((e) => {
      const plain = e.get({ plain: true });
      return { ...plain, vendor: plain.vendor || {} };
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No expenses to export' });
    }

    const filename = `expenses_${new Date().toISOString().split('T')[0]}`;
    const columns = COLUMN_DEFINITIONS.expenses;

    if (format === 'excel') {
      await sendExcel(res, rows, `${filename}.xlsx`, { columns, sheetName: 'Expenses', title: 'Expense List' });
    } else {
      sendCSV(res, rows, `${filename}.csv`, columns);
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get single expense
// @route   GET /api/expenses/:id
// @access  Private
exports.getExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({
      where: expenseScopeWhere(req, { id: req.params.id }),
      include: [
        { model: Vendor, as: 'vendor' },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] },
        { 
          model: ExpenseActivity, 
          as: 'activities',
          separate: true,
          include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'DESC']],
          limit: 50
        }
      ]
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    try {
      assertShopRecordAccess(req, expense);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const expensePlain = expense.toJSON ? expense.toJSON() : expense;
    res.status(200).json({
      success: true,
      data: withSubmitterFallback(expensePlain)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res, next) => {
  const payload = sanitizePayload(req.body);
  const validationError = validateCreateExpensePayload(payload);
  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError
    });
  }
  normalizeExpenseDescription(payload);

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const transaction = await sequelize.transaction();
    try {
      const expenseNumber = await exports.generateExpenseNumber(req.tenantId, transaction);
      let vendorForResponse = null;
      let jobForResponse = null;

      if (payload.vendorId) {
        const vendor = await Vendor.findOne({
          where: applyTenantFilter(req.tenantId, { id: payload.vendorId }),
          attributes: ['id', 'name', 'company'],
          transaction
        });
        if (!vendor) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Vendor not found for this tenant'
          });
        }
        vendorForResponse = vendor;
      }

      if (payload.jobId) {
        const job = await Job.findOne({
          where: jobScopeWhere(req, { id: payload.jobId }),
          attributes: ['id', 'jobNumber', 'title'],
          transaction
        });
        if (!job) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Job not found for this tenant'
          });
        }
        jobForResponse = job;
      }

      const approvalDefaults = getCreateApprovalDefaults(payload, getActorUserId(req));
      stripCreateApprovalFields(payload);

      const expense = await Expense.create(
        attachScopedToPayload(req, {
          ...payload,
          tenantId: req.tenantId,
          expenseNumber,
          submittedBy: getActorUserId(req),
          approvalStatus: approvalDefaults.approvalStatus,
          approvedBy: approvalDefaults.approvedBy,
          approvedAt: approvalDefaults.approvedAt,
        }),
        { transaction }
      );

      const expenseWithDetails = {
        ...(expense.toJSON ? expense.toJSON() : expense),
        vendor: vendorForResponse?.toJSON ? vendorForResponse.toJSON() : vendorForResponse,
        job: jobForResponse?.toJSON ? jobForResponse.toJSON() : jobForResponse,
        submitter: req.user ? {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email
        } : null,
        approver: approvalDefaults.approvedBy && req.user ? {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email
        } : null
      };

      try {
        await ExpenseActivity.create({
          expenseId: expense.id,
          tenantId: req.tenantId,
          type: 'creation',
          subject: 'Expense Created',
          notes: `Expense ${expense.expenseNumber} was created${approvalDefaults.isExpenseRequest ? ' as an approval request' : ' and auto-approved'}`,
          createdBy: getActorUserId(req),
          metadata: {
            amount: expense.amount,
            category: expense.category,
            autoApproved: !approvalDefaults.isExpenseRequest
          }
        }, { transaction });
      } catch (activityErr) {
        console.error('Failed to create expense activity:', activityErr);
      }

      await transaction.commit();
      invalidateAfterMutation(req.tenantId);
      invalidateExpenseStatsCache(req.tenantId);

      const response = res.status(201).json({
        success: true,
        data: expenseWithDetails
      });

      if (!approvalDefaults.isExpenseRequest) {
        setImmediate(async () => {
          try {
            await createExpenseJournal(expenseWithDetails, getActorUserId(req));
          } catch (journalError) {
            console.error('Failed to create accounting entry for auto-approved expense', journalError?.message);
          }
        });
      }

      return response;
    } catch (error) {
      await transaction.rollback();
      lastError = error;
      const isDuplicateExpenseNumber = error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some(e => e.path === 'expenseNumber');
      if (isDuplicateExpenseNumber && attempt < maxRetries) {
        continue;
      }
      next(error);
      return;
    }
  }

  next(lastError);
};

// @desc    Create multiple expenses (bulk)
// @route   POST /api/expenses/bulk
// @access  Private
exports.createBulkExpenses = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { expenses, commonFields } = req.body;

    if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Expenses array is required and must not be empty'
      });
    }

    // Validate common fields if provided
    if (commonFields?.vendorId) {
      const vendor = await Vendor.findOne({
        where: applyTenantFilter(req.tenantId, { id: commonFields.vendorId }),
        transaction
      });
      if (!vendor) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Vendor not found for this tenant'
        });
      }
    }

    if (commonFields?.jobId) {
      const job = await Job.findOne({
        where: jobScopeWhere(req, { id: commonFields.jobId }),
        transaction
      });
      if (!job) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Job not found for this tenant'
        });
      }
    }

    // Create all expenses in a transaction
    const createdExpenses = [];
    const createdExpenseApprovalDefaults = new Map();
    for (const expenseData of expenses) {
      // Skip invalid expenses
      if (!expenseData.category || !expenseData.amount || !expenseData.description) {
        continue;
      }

      // Merge common fields with individual expense data
      // Handle date - if it's a string, use it; otherwise use common date or current date
      let expenseDate = expenseData.expenseDate;
      if (!expenseDate && commonFields?.expenseDate) {
        expenseDate = commonFields.expenseDate;
      }
      if (!expenseDate) {
        expenseDate = new Date();
      }
      // Ensure date is a Date object
      if (typeof expenseDate === 'string') {
        expenseDate = new Date(expenseDate);
      }

      const finalExpenseData = {
        ...sanitizePayload(expenseData),
        expenseDate: expenseDate,
        jobId: expenseData.jobId || commonFields?.jobId || null,
        vendorId: expenseData.vendorId || commonFields?.vendorId || null,
        paymentMethod: expenseData.paymentMethod || commonFields?.paymentMethod || null,
        status: expenseData.status || commonFields?.status || null,
        approvalStatus: expenseData.approvalStatus || commonFields?.approvalStatus,
        notes: expenseData.notes || commonFields?.notes || null
      };

      // Validate vendor if provided
      if (finalExpenseData.vendorId) {
        const vendor = await Vendor.findOne({
          where: applyTenantFilter(req.tenantId, { id: finalExpenseData.vendorId }),
          transaction
        });
        if (!vendor) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Vendor not found for expense: ${expenseData.description}`
          });
        }
      }

      // Validate job if provided
      if (finalExpenseData.jobId) {
        const job = await Job.findOne({
          where: jobScopeWhere(req, { id: finalExpenseData.jobId }),
          transaction
        });
        if (!job) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Job not found for expense: ${expenseData.description}`
          });
        }
      }

      const expenseNumber = await exports.generateExpenseNumber(req.tenantId, transaction);
      const approvalDefaults = getCreateApprovalDefaults(finalExpenseData, getActorUserId(req));
      stripCreateApprovalFields(finalExpenseData);

      const expense = await Expense.create(
        attachScopedToPayload(req, {
          ...finalExpenseData,
          tenantId: req.tenantId,
          expenseNumber,
          submittedBy: getActorUserId(req),
          approvalStatus: approvalDefaults.approvalStatus,
          approvedBy: approvalDefaults.approvedBy,
          approvedAt: approvalDefaults.approvedAt,
        }),
        { transaction }
      );

      createdExpenses.push(expense);
      createdExpenseApprovalDefaults.set(expense.id, approvalDefaults);
    }

    if (createdExpenses.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No valid expenses to create'
      });
    }

    // Commit transaction
    await transaction.commit();
    invalidateAfterMutation(req.tenantId);
    invalidateExpenseStatsCache(req.tenantId);

    // Fetch created expenses with details
    const expenseIds = createdExpenses.map(e => e.id);
    const expensesWithDetails = await Expense.findAll({
      where: expenseScopeWhere(req, { id: { [Op.in]: expenseIds } }),
      include: [
        { model: Vendor, as: 'vendor' },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Create creation activities for all expenses
    try {
      for (const expense of createdExpenses) {
        const approvalDefaults = createdExpenseApprovalDefaults.get(expense.id);
        await ExpenseActivity.create({
          expenseId: expense.id,
          tenantId: req.tenantId,
          type: 'creation',
          subject: 'Expense Created',
          notes: `Expense ${expense.expenseNumber} was created${approvalDefaults?.isExpenseRequest ? ' as an approval request' : ' and auto-approved'}`,
          createdBy: getActorUserId(req),
          metadata: {
            amount: expense.amount,
            category: expense.category,
            autoApproved: !approvalDefaults?.isExpenseRequest
          }
        });
      }
    } catch (error) {
      console.error('Failed to create expense activities:', error);
    }

    for (const exp of expensesWithDetails) {
      const approvalDefaults = createdExpenseApprovalDefaults.get(exp.id);
      if (approvalDefaults?.isExpenseRequest) {
        continue;
      }

      try {
        await createExpenseJournal(exp, getActorUserId(req));
      } catch (journalError) {
        console.error('Failed to create accounting entry for auto-approved expense', exp.expenseNumber, journalError?.message);
      }
    }

    res.status(201).json({
      success: true,
      count: expensesWithDetails.length,
      data: expensesWithDetails
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
exports.updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({
      where: expenseScopeWhere(req, { id: req.params.id }),
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    try {
      assertShopRecordAccess(req, expense);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const updatePayload = sanitizePayload(req.body);
    delete updatePayload.shopId;
    delete updatePayload.studioLocationId;

    if (updatePayload.status === 'paid' && expense.approvalStatus !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Expense must be approved before it can be marked paid'
      });
    }

    if (updatePayload.approvalStatus === 'approved') {
      updatePayload.approvedBy = getActorUserId(req);
      updatePayload.approvedAt = new Date();
    }

    if (updatePayload.vendorId) {
      const vendor = await Vendor.findOne({
        where: applyTenantFilter(req.tenantId, { id: updatePayload.vendorId })
      });
      if (!vendor) {
        return res.status(400).json({
          success: false,
          message: 'Vendor not found for this tenant'
        });
      }
    }

    if (updatePayload.jobId) {
      const job = await Job.findOne({
        where: jobScopeWhere(req, { id: updatePayload.jobId })
      });
      if (!job) {
        return res.status(400).json({
          success: false,
          message: 'Job not found for this tenant'
        });
      }
    }

    const previousStatus = expense.approvalStatus;
    const previousAmount = expense.amount;
    const previousCategory = expense.category;
    const previousStatusVal = expense.status;
    const previousDescription = expense.description;
    const previousPaymentMethod = expense.paymentMethod;
    const previousVendorId = expense.vendorId;
    const previousJobId = expense.jobId;

    await expense.update(updatePayload);

    const updatedExpense = await Expense.findOne({
      where: expenseScopeWhere(req, { id: expense.id }),
      include: [
        { model: Vendor, as: 'vendor' },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] }
      ]
    });

    try {
      const changes = [];
      if (updatePayload.amount != null && String(updatePayload.amount) !== String(previousAmount)) {
        changes.push(`Amount: ${previousAmount} → ${updatePayload.amount}`);
      }
      if (updatePayload.category != null && updatePayload.category !== previousCategory) {
        changes.push(`Category: ${previousCategory || '—'} → ${updatePayload.category}`);
      }
      if (updatePayload.status != null && updatePayload.status !== previousStatusVal) {
        changes.push(`Status: ${previousStatusVal || '—'} → ${updatePayload.status}`);
      }
      if (updatePayload.approvalStatus != null && updatePayload.approvalStatus !== previousStatus) {
        changes.push(`Approval Status: ${previousStatus || '—'} → ${updatePayload.approvalStatus}`);
      }
      if (updatePayload.description !== undefined && String(updatePayload.description || '') !== String(previousDescription || '')) {
        changes.push('Description updated');
      }
      if (updatePayload.paymentMethod !== undefined && (updatePayload.paymentMethod || null) !== (previousPaymentMethod || null)) {
        changes.push(`Payment method: ${previousPaymentMethod || '—'} → ${updatePayload.paymentMethod || '—'}`);
      }
      if (updatePayload.vendorId !== undefined && (updatePayload.vendorId || null) !== (previousVendorId || null)) {
        changes.push('Vendor updated');
      }
      if (updatePayload.jobId !== undefined && (updatePayload.jobId || null) !== (previousJobId || null)) {
        changes.push('Job updated');
      }

      const metadata = {
        previousData: {
          amount: previousAmount,
          category: previousCategory,
          status: previousStatusVal,
          approvalStatus: previousStatus,
          description: previousDescription,
          paymentMethod: previousPaymentMethod,
          vendorId: previousVendorId,
          jobId: previousJobId
        },
        newData: {
          amount: updatePayload.amount,
          category: updatePayload.category,
          status: updatePayload.status,
          approvalStatus: updatePayload.approvalStatus,
          description: updatePayload.description,
          paymentMethod: updatePayload.paymentMethod,
          vendorId: updatePayload.vendorId,
          jobId: updatePayload.jobId
        }
      };

      await ExpenseActivity.create({
        expenseId: expense.id,
        tenantId: req.tenantId,
        type: 'update',
        subject: 'Expense Updated',
        notes: changes.length > 0 ? changes.join(', ') : 'Expense details were updated',
        createdBy: req.user?.id ?? null,
        metadata
      });
    } catch (error) {
      console.error('Failed to create expense activity:', error);
    }

    // Invalidate cache after updating expense
    invalidateAfterMutation(req.tenantId);
    invalidateExpenseStatsCache(req.tenantId);

    if (updatePayload.approvalStatus === 'approved' && previousStatus !== 'approved') {
      const expenseForJournal = updatedExpense;
      const actorUserId = req.user?.id;
      setImmediate(async () => {
        try {
          await createExpenseJournal(expenseForJournal, actorUserId);
        } catch (journalError) {
          console.error('Failed to create accounting entry for approved expense', journalError?.message);
        }
      });
    }

    res.status(200).json({
      success: true,
      data: updatedExpense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
// @desc    Archive expense (soft delete)
// @route   PUT /api/expenses/:id/archive
// @access  Private
exports.archiveExpense = async (req, res, next) => {
  try {
    const { expense, accessErr } = await findScopedExpense(req, req.params.id);

    if (accessErr?.statusCode === 403) {
      return res.status(403).json({ success: false, message: accessErr.message });
    }

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    if (expense.isArchived) {
      return res.status(400).json({
        success: false,
        message: 'Expense is already archived'
      });
    }

    await expense.update({ isArchived: true });

    // Create archive activity
    try {
      await ExpenseActivity.create({
        expenseId: expense.id,
        tenantId: req.tenantId,
        type: 'note',
        subject: 'Expense Archived',
        notes: `Expense ${expense.expenseNumber} was archived`,
        createdBy: getActorUserId(req),
        metadata: {
          archived: true
        }
      });
    } catch (error) {
      console.error('Failed to create archive activity:', error);
    }

    const updatedExpense = await Expense.findOne({
      where: expenseScopeWhere(req, { id: expense.id }),
      include: [
        { model: Vendor, as: 'vendor' },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] },
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
      ]
    });
    invalidateAfterMutation(req.tenantId);
    invalidateExpenseStatsCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'Expense archived successfully',
      data: updatedExpense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get expense statistics
// @route   GET /api/expenses/stats/overview
// @access  Private
exports.getExpenseStats = async (req, res, next) => {
  try {
    const { sequelize } = require('../config/database');
    const { jobId, startDate, endDate } = req.query;

    const baseFilters = expenseScopeWhere(req, {});

    if (jobId) {
      baseFilters.jobId = jobId;
    }

    const dateFilters = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      dateFilters.expenseDate = {
        [Op.between]: [start, end]
      };
    }

    const combinedFilters = { ...baseFilters, ...dateFilters, isArchived: false };

    // Get current month expenses
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const monthlyWhereClause = {
      ...baseFilters,
      isArchived: false,
      expenseDate: {
        [Op.between]: [startOfMonth, endOfMonth]
      }
    };

    const jobExpensesPromise = jobId
      ? Expense.findAll({
          where: expenseScopeWhere(req, { jobId, isArchived: false }),
          include: [
            { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] }
          ],
          order: [['expenseDate', 'DESC']]
        })
      : Promise.resolve(null);

    const [
      stats,
      totalExpensesRaw,
      thisMonthExpensesRaw,
      pendingRequests,
      approvedCount,
      jobExpenses
    ] = await Promise.all([
      Expense.findAll({
        where: combinedFilters,
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
        ],
        group: ['category']
      }),
      Expense.sum('amount', { where: combinedFilters }),
      Expense.sum('amount', { where: monthlyWhereClause }),
      Expense.count({
        where: { ...baseFilters, approvalStatus: 'pending_approval', isArchived: false }
      }),
      Expense.count({
        where: { ...baseFilters, approvalStatus: 'approved', isArchived: false }
      }),
      jobExpensesPromise
    ]);

    const totalExpenses = Number(parseFloat(totalExpensesRaw || 0).toFixed(2));
    const thisMonthExpenses = Number(parseFloat(thisMonthExpensesRaw || 0).toFixed(2));
    const categoryCount = stats?.length ?? 0;

    res.status(200).json({
      success: true,
      data: {
        categoryStats: stats,
        totalExpenses,
        thisMonthExpenses,
        categoryCount,
        pendingRequests,
        approvedCount,
        totals: {
          totalExpenses,
          categoryCount,
          thisMonth: thisMonthExpenses,
          pendingRequests,
          approvedCount
        },
        jobExpenses
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get expenses by job
// @route   GET /api/expenses/by-job/:jobId
// @access  Private
exports.getExpensesByJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 10 });

    const job = await Job.findOne({
      where: jobScopeWhere(req, { id: jobId })
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found for this tenant'
      });
    }

    const { count, rows } = await Expense.findAndCountAll({
      where: expenseScopeWhere(req, { jobId }),
      limit,
      offset,
      include: [
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'company'] },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] }
      ],
      order: [['expenseDate', 'DESC']]
    });

    // Get total amount for this job
    const totalAmount =
      (await Expense.sum('amount', { where: expenseScopeWhere(req, { jobId }) })) || 0;

    res.status(200).json({
      success: true,
      count,
      totalAmount: parseFloat(totalAmount).toFixed(2),
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

// @desc    Submit expense for approval
// @route   POST /api/expenses/:id/submit
// @access  Manager/Staff only (admins cannot submit)
exports.submitExpense = async (req, res, next) => {
  try {
    const { expense, accessErr } = await findScopedExpense(req, req.params.id);

    if (accessErr?.statusCode === 403) {
      return res.status(403).json({ success: false, message: accessErr.message });
    }

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    if (expense.approvalStatus !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft expenses can be submitted for approval'
      });
    }

    await expense.update({
      approvalStatus: 'pending_approval',
      submittedBy: getActorUserId(req)
    });

    const updatedExpense = await Expense.findOne({
      where: expenseScopeWhere(req, { id: expense.id }),
      include: [
        { model: Vendor, as: 'vendor' },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] }
      ]
    });

    // Log activity
    try {
      await activityLogger.logExpenseSubmitted(updatedExpense, req.user?.id || null);
      
      // Create ExpenseActivity record
      await ExpenseActivity.create({
        expenseId: expense.id,
        tenantId: req.tenantId,
        type: 'submission',
        subject: 'Expense Submitted for Approval',
        notes: `Expense ${expense.expenseNumber} was submitted for approval`,
        createdBy: getActorUserId(req),
        metadata: {
          previousStatus: 'draft',
          newStatus: 'pending_approval'
        }
      });
    } catch (error) {
      console.error('Failed to log expense submission activity:', error);
    }

    res.status(200).json({
      success: true,
      message: 'Expense submitted for approval',
      data: updatedExpense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve expense
// @route   POST /api/expenses/:id/approve
// @access  Admin only
exports.approveExpense = async (req, res, next) => {
  try {
    const { expense, accessErr } = await findScopedExpense(req, req.params.id);

    if (accessErr?.statusCode === 403) {
      return res.status(403).json({ success: false, message: accessErr.message });
    }

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    if (expense.approvalStatus !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        message: 'Only pending expenses can be approved'
      });
    }

    await expense.update({
      approvalStatus: 'approved',
      approvedBy: getActorUserId(req),
      approvedAt: new Date()
    });

    const updatedExpense = await Expense.findOne({
      where: expenseScopeWhere(req, { id: expense.id }),
      include: [
        { model: Vendor, as: 'vendor' },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] }
      ]
    });

    // Log activity
    try {
      await activityLogger.logExpenseApproved(updatedExpense, req.user?.id || null);

      // Create ExpenseActivity record
      await ExpenseActivity.create({
        expenseId: expense.id,
        tenantId: req.tenantId,
        type: 'approval',
        subject: 'Expense Approved',
        notes: `Expense ${expense.expenseNumber} was approved`,
        createdBy: getActorUserId(req),
        metadata: {
          previousStatus: 'pending_approval',
          newStatus: 'approved',
          approvedBy: req.user?.name || req.user?.email || 'Unknown'
        }
      });
    } catch (error) {
      console.error('Failed to log expense approval activity:', error);
    }

    // Post to accounting (Dr Expense Cr Cash/Bank) after response
    const expenseForJournal = updatedExpense;
    const actorUserId = getActorUserId(req);
    setImmediate(async () => {
      try {
        await createExpenseJournal(expenseForJournal, actorUserId);
      } catch (journalError) {
        console.error('Failed to create accounting entry for approved expense', journalError?.message);
      }
    });
    invalidateAfterMutation(req.tenantId);
    invalidateExpenseStatsCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'Expense approved successfully',
      data: updatedExpense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject expense
// @route   POST /api/expenses/:id/reject
// @access  Admin only
exports.rejectExpense = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;

    const { expense, accessErr } = await findScopedExpense(req, req.params.id);

    if (accessErr?.statusCode === 403) {
      return res.status(403).json({ success: false, message: accessErr.message });
    }

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    if (expense.approvalStatus !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        message: 'Only pending expenses can be rejected'
      });
    }

    await expense.update({
      approvalStatus: 'rejected',
      approvedBy: getActorUserId(req),
      approvedAt: new Date(),
      rejectionReason: rejectionReason || 'No reason provided'
    });

    const updatedExpense = await Expense.findOne({
      where: expenseScopeWhere(req, { id: expense.id }),
      include: [
        { model: Vendor, as: 'vendor' },
        { model: Job, as: 'job', attributes: ['id', 'jobNumber', 'title'] },
        { model: User, as: 'submitter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] }
      ]
    });

    // Log activity
    try {
      await activityLogger.logExpenseRejected(updatedExpense, rejectionReason, req.user?.id || null);
      
      // Create ExpenseActivity record
      await ExpenseActivity.create({
        expenseId: expense.id,
        tenantId: req.tenantId,
        type: 'rejection',
        subject: 'Expense Rejected',
        notes: `Expense ${expense.expenseNumber} was rejected${rejectionReason ? `: ${rejectionReason}` : ''}`,
        createdBy: getActorUserId(req),
        metadata: {
          previousStatus: 'pending_approval',
          newStatus: 'rejected',
          rejectionReason: rejectionReason || 'No reason provided',
          rejectedBy: req.user?.name || req.user?.email || 'Unknown'
        }
      });
    } catch (error) {
      console.error('Failed to log expense rejection activity:', error);
    }
    invalidateAfterMutation(req.tenantId);
    invalidateExpenseStatsCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'Expense rejected',
      data: updatedExpense
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get expense activities
// @route   GET /api/expenses/:id/activities
// @access  Private
exports.getExpenseActivities = async (req, res, next) => {
  try {
    const { expense, accessErr } = await findScopedExpense(req, req.params.id);
    if (accessErr?.statusCode === 403) {
      return res.status(403).json({ success: false, message: accessErr.message });
    }
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const activities = await ExpenseActivity.findAll({
      where: applyTenantFilter(req.tenantId, { expenseId: expense.id }),
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
};

// @desc    Add expense activity
// @route   POST /api/expenses/:id/activities
// @access  Private
exports.addExpenseActivity = async (req, res, next) => {
  try {
    const { expense, accessErr } = await findScopedExpense(req, req.params.id);
    if (accessErr?.statusCode === 403) {
      return res.status(403).json({ success: false, message: accessErr.message });
    }
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const payload = sanitizePayload(req.body);

    const activity = await ExpenseActivity.create({
      expenseId: expense.id,
      tenantId: req.tenantId,
      type: payload.type || 'note',
      subject: payload.subject || null,
      notes: payload.notes || null,
      createdBy: getActorUserId(req),
      metadata: payload.metadata || {}
    });

    const populatedActivity = await ExpenseActivity.findOne({
      where: applyTenantFilter(req.tenantId, { id: activity.id }),
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(201).json({ success: true, data: populatedActivity });
  } catch (error) {
    next(error);
  }
};


