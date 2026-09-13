const { Op } = require('sequelize');
const { Rental, RentalItem, PreBooking, PreBookingItem, DamageReport, Product, Customer, Invoice, Expense, LateCharge, RentalExtension, RentalUnit, Payment } = require('../models');
const { sequelize } = require('../config/database');
const { calculateRentalTotals, calculateExtensionPreview, checkRentalAvailability, checkBatchAvailability, assertItemsAvailable, recalculateLateCharge, getInitialRentalStatus, canTransitionRentalStatus, canCheckoutRental, syncRentalLifecycleStatus, getDayCount } = require('../services/rentalAvailabilityService');
const {
  validateItemUnitAssignments,
  applyUnitAssignments,
  releaseRentalUnits,
} = require('../services/rentalUnitService');
const { getEffectiveRole } = require('../middleware/auth');
const { getRentalSettings } = require('../services/rentalSettingsService');
const { autoCreateExpenseFromDamage } = require('../services/rentalDamageService');
const { generateRentalInvoice, computeRentalTotalDue, syncRentalInvoice } = require('../services/rentalInvoiceService');
const { updateRentalCustomerHistory } = require('../services/rentalCustomerHistoryService');
const {
  initializeRentalDeposit,
  parseDepositInput,
  buildDepositMetadata,
  recordDepositPayment,
  getRentalDeposit,
  getDepositRefundableAmount,
  resolveSuggestedDepositAmount,
  refundRentalDeposit,
  applyRentalDepositManually,
  rentalPaymentMethodToPaymentModel,
} = require('../services/rentalDepositService');
const { enqueuePostRentalAutomation } = require('../services/rentalAutomationService');
const {
  syncRentalInvoiceAndRefreshCustomerBalance,
} = require('../services/rentalInvoicePaymentService');
const {
  buildRentalAgreementDocument,
  buildRentalReturnInspectionDocument,
} = require('../services/rentalPdfService');
const rentalNotificationService = require('../services/rentalNotificationService');
const {
  parseScheduleDeliveryInput,
  buildScheduledDeliveryLeg,
  mergeDeliveryLegMetadata,
  resolveRentalDeliveryAddress,
} = require('../services/rentalDeliveryService');
const { parsePromisedPaymentDate } = require('../utils/rentalPromisedPayment');

const { ensureDefaultShop } = require('../utils/shopUtils');

const getTenantScope = (req) => req.tenantId || req.user?.tenantId || null;
const getUserId = (req) => req.user?.id || null;

/** Resolve branchId from body/query or ensure a default shop exists for the tenant. */
const resolveBranchId = async (req, branchId) => {
  if (branchId) return branchId;
  const shop = await ensureDefaultShop(req.tenantId, { name: req.tenant?.name || 'Main location' });
  return shop?.id || null;
};

const EXTENDABLE_STATUSES = ['confirmed', 'active', 'overdue'];
const RETURNABLE_STATUSES = ['active', 'overdue'];

const VALID_DAMAGE_TYPES = ['scratch', 'dent', 'broken', 'lost', 'stained', 'other'];
const VALID_DAMAGE_SEVERITIES = ['minor', 'moderate', 'severe'];
const DAMAGE_SEVERITY_ALIASES = {
  major: 'severe',
  total_loss: 'severe',
};

/** Map legacy/UI severity values to the DamageReport enum. */
const normalizeDamageSeverity = (severity) => {
  const raw = String(severity || 'minor').toLowerCase().trim();
  const mapped = DAMAGE_SEVERITY_ALIASES[raw] || raw;
  return VALID_DAMAGE_SEVERITIES.includes(mapped) ? mapped : 'minor';
};

/** Coerce free-text damage types to the DamageReport enum (defaults to other). */
const normalizeDamageType = (damageType) => {
  const raw = String(damageType || 'other').toLowerCase().trim();
  return VALID_DAMAGE_TYPES.includes(raw) ? raw : 'other';
};

const DAMAGE_REPORT_INCLUDE = {
  model: DamageReport,
  as: 'damageReports',
  include: [{
    model: Expense,
    as: 'expense',
    attributes: ['id', 'expenseNumber', 'amount', 'approvalStatus', 'status', 'category'],
  }],
};

const RENTAL_DETAIL_INCLUDES = [
  {
    model: RentalItem,
    as: 'items',
    include: [
      { model: Product, as: 'product' },
      { model: RentalUnit, as: 'rentalUnit' },
    ],
  },
  { model: Customer, as: 'customer' },
  DAMAGE_REPORT_INCLUDE,
  { model: LateCharge, as: 'lateCharges' },
  { model: RentalExtension, as: 'extensions' }
];

/**
 * Recompute totalDue and ensure a final invoice exists (idempotent).
 * @param {object} rental - Sequelize rental instance
 * @returns {Promise<{ invoice: object|null, created: boolean }>}
 */
const finalizeRentalBilling = async (rental) => {
  const totalDue = computeRentalTotalDue(rental, rental.lateCharges, rental.damageReports);
  await rental.update({ totalDue });

  try {
    await syncRentalInvoice(rental);
    const result = await generateRentalInvoice(rental.id, { applyHeldDeposit: true });
    return result;
  } catch (error) {
    console.error('[rental] Failed to generate invoice for rental', rental.id, error);
    return { invoice: null, created: false };
  }
};

const ensureRentalInvoice = async (rental) => {
  const metadata = rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
  if (metadata.invoiceId) return { invoice: null, created: false };
  try {
    return await generateRentalInvoice(rental.id, { applyHeldDeposit: false });
  } catch (error) {
    console.error('[rental] Failed to auto-create invoice for rental', rental.id, error);
    return { invoice: null, created: false };
  }
};

const MANAGER_PLUS_ROLES = ['admin', 'manager'];

const isManagerPlusRole = (req) => MANAGER_PLUS_ROLES.includes(getEffectiveRole(req));

const rejectForbidden = (res, message) => res.status(403).json({
  success: false,
  message: message || 'You are not authorized to perform this action',
});

const rejectInvalidTransition = (res, fromStatus, toStatus) => res.status(400).json({
  success: false,
  message: `Invalid rental status transition (${fromStatus} → ${toStatus})`
});

const syncRentalsInList = async (rentals) => {
  await Promise.all(rentals.map((rental) => syncRentalLifecycleStatus(rental)));
  return rentals;
};

const serializeRental = async (rental) => {
  if (!rental) return null;
  const plain = rental.get ? rental.get({ plain: true }) : rental;

  if (plain.items) {
    plain.items = plain.items.map((item) => ({
      ...item,
      rentalRatePerDay: Number(item.rentalRatePerDay || 0),
      subtotal: Number(item.subtotal || 0)
    }));
  }

  return plain;
};

const listRentals = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const where = { tenantId };

    if (req.query.customerId) where.customerId = req.query.customerId;
    if (req.query.branchId) where.branchId = req.query.branchId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.overdue === 'true') {
      const today = new Date().toISOString().slice(0, 10);
      where[Op.or] = [
        { status: 'overdue' },
        { status: 'active', endDate: { [Op.lt]: today } }
      ];
    }

    const rentals = await Rental.findAll({
      where,
      include: [
        { model: RentalItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Customer, as: 'customer' }
      ],
      order: [['createdAt', 'DESC']]
    });

    await syncRentalsInList(rentals);

    res.status(200).json({ success: true, data: rentals });
  } catch (error) {
    next(error);
  }
};

const getRental = async (req, res, next) => {
  try {
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId: getTenantScope(req) },
      include: RENTAL_DETAIL_INCLUDES,
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    await syncRentalLifecycleStatus(rental);
    await ensureRentalInvoice(rental);
    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });

    return res.status(200).json({ success: true, data: await serializeRental(rental) });
  } catch (error) {
    return next(error);
  }
};

const rejectAvailabilityError = (res, error) => res.status(error.statusCode || 400).json({
  success: false,
  message: error.message,
  errorCode: error.code || 'INSUFFICIENT_RENTAL_STOCK',
  details: error.details || []
});

const createRental = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = getTenantScope(req);
    const { customerId, branchId: bodyBranchId, startDate, endDate, paymentMethod, notes, discountAmount = 0, items = [] } = req.body;

    if (!customerId || !startDate || !endDate || !items.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'customerId, startDate, endDate and items are required' });
    }

    const branchId = await resolveBranchId(req, bodyBranchId);
    if (!branchId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'branchId is required' });
    }

    const rentalSettings = await getRentalSettings(tenantId);
    const dayBillingMode = rentalSettings.dayBillingMode;

    await assertItemsAvailable({
      tenantId,
      branchId,
      startDate,
      endDate,
      items,
      transaction
    });

    await validateItemUnitAssignments({
      tenantId,
      branchId,
      startDate,
      endDate,
      items: items.filter((item) => item.rentalUnitId),
      transaction,
    });

    const summary = calculateRentalTotals(items, startDate, endDate, { dayBillingMode });
    const total = Number(summary.total || 0);
    const discount = Number(discountAmount || 0);
    const hireDue = Math.max(0, Number((total - discount).toFixed(2)));
    const requestedPaid = Number(req.body.amountPaid);
    const amountPaid = Number.isFinite(requestedPaid)
      ? Math.min(Math.max(0, Number(requestedPaid.toFixed(2))), hireDue)
      : 0;
    const status = getInitialRentalStatus(startDate);

    const customer = await Customer.findByPk(customerId, { transaction });
    const operationalLocation = typeof req.body.operationalLocation === 'string'
      ? req.body.operationalLocation.trim()
      : '';
    const promisedPaymentDate = parsePromisedPaymentDate(req.body.promisedPaymentDate);

    const schedulePickup = parseScheduleDeliveryInput(req.body.scheduleDelivery);
    if (schedulePickup.enabled && !resolveRentalDeliveryAddress(customer, schedulePickup.address)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Customer delivery address is required to schedule rental delivery. Add it on the customer profile or provide an address.',
      });
    }

    const suggestedDeposit = resolveSuggestedDepositAmount({
      rentalSettings,
      customer,
      rentalSubtotal: total,
    });

    const rental = await Rental.create({
      tenantId,
      customerId,
      branchId,
      startDate,
      endDate,
      status,
      rentalDurationDays: summary.days,
      paymentMethod: paymentMethod || 'cash',
      amount: total,
      discountAmount: discount,
      amountPaid,
      totalDue: hireDue,
      notes,
      createdBy: getUserId(req),
      updatedBy: getUserId(req),
      metadata: {
        lateChargePerDay: 0,
        dayBillingMode,
        ...(operationalLocation ? { operationalLocation } : {}),
        ...(promisedPaymentDate ? { promisedPaymentDate } : {}),
      }
    }, { transaction });

    if (schedulePickup.enabled) {
      await rental.update({
        metadata: mergeDeliveryLegMetadata(
          rental,
          'pickup',
          buildScheduledDeliveryLeg({
            rental,
            leg: 'pickup',
            customer,
            scheduleInput: schedulePickup,
          }),
        ),
      }, { transaction });
    }

    const { deposit } = await initializeRentalDeposit({
      tenantId,
      rentalId: rental.id,
      customerId,
      paymentMethod: paymentMethod || 'cash',
      body: req.body,
      suggestedAmount: suggestedDeposit,
      transaction,
    });

    if (deposit) {
      await rental.update({
        metadata: {
          ...(rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {}),
          deposit,
        },
      }, { transaction });
    }

    for (const item of items) {
      const product = await Product.findByPk(item.productId, { transaction });
      const unitRate = Number(item.rentalRatePerDay || item.rate || product?.rentalRatePerDay || product?.sellingPrice || 0);
      const subtotal = Number((Number(item.quantity || 0) * unitRate * summary.days).toFixed(2));

      await RentalItem.create({
        rentalId: rental.id,
        productId: item.productId,
        branchId: branchId || item.branchId,
        quantity: Number(item.quantity || 0),
        rentalRatePerDay: unitRate,
        subtotal,
        notes: item.notes || null,
        rentalUnitId: item.rentalUnitId || null,
      }, { transaction });
    }

    const createdItems = await RentalItem.findAll({
      where: { rentalId: rental.id },
      transaction,
    });

    const itemsWithUnits = items.filter((item) => item.rentalUnitId);
    if (itemsWithUnits.length) {
      await applyUnitAssignments({
        tenantId,
        rental,
        items: createdItems,
        assignments: createdItems
          .filter((row) => row.rentalUnitId)
          .map((row) => ({ rentalItemId: row.id, rentalUnitId: row.rentalUnitId })),
        transaction,
        markAsRented: ['active', 'overdue'].includes(status),
      });
    }

    await transaction.commit();

    await generateRentalInvoice(rental.id, { applyHeldDeposit: false }).catch((invoiceError) => {
      console.error('[rental] Auto-invoice failed after create', rental.id, invoiceError);
    });

    const freshRental = await Rental.findByPk(rental.id, {
      include: RENTAL_DETAIL_INCLUDES,
    });

    enqueuePostRentalAutomation({
      event: 'created',
      rentalId: rental.id,
      tenantId,
      userId: getUserId(req),
    });

    return res.status(201).json({ success: true, data: await serializeRental(freshRental) });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode === 400) {
      return rejectAvailabilityError(res, error);
    }
    if (error.code === 'INVALID_RENTAL_UNIT') {
      return res.status(400).json({
        success: false,
        message: error.message,
        errorCode: error.code,
        details: error.details || [],
      });
    }
    return next(error);
  }
};

const updateRental = async (req, res, next) => {
  try {
    const rental = await Rental.findOne({ where: { id: req.params.id, tenantId: getTenantScope(req) } });
    if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });

    await syncRentalLifecycleStatus(rental);

    const payload = { ...req.body };
    const nextStatus = payload.status;

    if (nextStatus && nextStatus !== rental.status) {
      if (nextStatus === 'cancelled' && !isManagerPlusRole(req)) {
        return rejectForbidden(res, 'Only managers and admins can cancel rentals');
      }
      if (!canTransitionRentalStatus(rental.status, nextStatus)) {
        return rejectInvalidTransition(res, rental.status, nextStatus);
      }
    } else {
      delete payload.status;
    }

    const previousStatus = rental.status;

    const depositFields = ['depositAmount', 'depositPaid', 'depositStatus', 'collectDeposit', 'depositPaymentMethod', 'depositReferenceNumber', 'depositNotes'];
    const hasDepositUpdate = depositFields.some((key) => payload[key] !== undefined);
    let depositUpdate = null;

    if (hasDepositUpdate) {
      const existingMetadata = rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
      const existingDeposit = getRentalDeposit(rental);
      const parsed = parseDepositInput(payload, existingDeposit);

      if (parsed.paid > existingDeposit.paid && parsed.collectDeposit) {
        const incremental = Number((parsed.paid - existingDeposit.paid).toFixed(2));
        const payment = await recordDepositPayment({
          tenantId: getTenantScope(req),
          rentalId: rental.id,
          customerId: rental.customerId,
          amount: incremental,
          paymentMethod: payload.depositPaymentMethod || rental.paymentMethod,
          referenceNumber: payload.depositReferenceNumber || null,
          notes: payload.depositNotes || null,
        });
        depositUpdate = buildDepositMetadata({
          amount: parsed.amount || existingDeposit.amount,
          paid: parsed.paid,
          status: parsed.status || 'held',
          paymentId: existingDeposit.paymentId || payment?.id,
          paymentMethod: payload.depositPaymentMethod || existingDeposit.paymentMethod || rental.paymentMethod,
          collectedAt: existingDeposit.collectedAt || new Date().toISOString(),
        });
      } else {
        depositUpdate = buildDepositMetadata({
          amount: parsed.amount || existingDeposit.amount,
          paid: parsed.paid,
          status: parsed.status || existingDeposit.status,
          paymentId: existingDeposit.paymentId,
          paymentMethod: existingDeposit.paymentMethod,
          collectedAt: existingDeposit.collectedAt,
          appliedAt: existingDeposit.appliedAt,
          appliedAmount: existingDeposit.appliedAmount,
          invoiceId: existingDeposit.invoiceId,
          refundedAt: existingDeposit.refundedAt,
        });
      }

      depositFields.forEach((key) => delete payload[key]);
    }

    if (payload.startDate || payload.endDate) {
      payload.rentalDurationDays = getDayCount(
        payload.startDate || rental.startDate,
        payload.endDate || rental.endDate,
        rental.metadata?.dayBillingMode
      );
    }

    if (depositUpdate) {
      const existingMetadata = rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
      payload.metadata = {
        ...existingMetadata,
        ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
        deposit: depositUpdate,
      };
    }

    payload.updatedBy = getUserId(req);
    await rental.update(payload);

    if (nextStatus === 'cancelled' && previousStatus !== 'cancelled') {
      await releaseRentalUnits({ rentalId: rental.id });
      enqueuePostRentalAutomation({
        event: 'cancelled',
        rentalId: rental.id,
        tenantId: getTenantScope(req),
        userId: getUserId(req),
      });
    }

    if (nextStatus === 'completed') {
      await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
      await finalizeRentalBilling(rental);
      try {
        await updateRentalCustomerHistory({
          rental,
          tenantId: getTenantScope(req),
        });
      } catch (historyError) {
        console.error('[rental] Failed to update customer rental history', rental.id, historyError);
      }
    }

    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    return res.status(200).json({ success: true, data: await serializeRental(rental) });
  } catch (error) {
    return next(error);
  }
};

/** Normalize a rental end date to YYYY-MM-DD without timezone drift. */
const normalizeEndDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = value ? new Date(value) : new Date();
  return parsed.toISOString().slice(0, 10);
};

/** Shared validation and cost preview for rental extensions. */
const buildExtensionPreview = async (rental, items, newEndDateStr, tenantId) => {
  const preview = calculateExtensionPreview(rental, items, newEndDateStr);

  if (preview.extensionDays <= 0) {
    const err = new Error('New end date must be after the current end date.');
    err.statusCode = 400;
    throw err;
  }

  let availability = { ok: true, failures: [] };

  try {
    await assertItemsAvailable({
      tenantId,
      branchId: rental.branchId,
      startDate: preview.extensionStartDate,
      endDate: newEndDateStr,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        branchId: item.branchId || rental.branchId,
      })),
      excludeRentalId: rental.id,
    });
  } catch (error) {
    if (error.statusCode === 400 && error.code === 'INSUFFICIENT_RENTAL_STOCK') {
      availability = { ok: false, failures: error.details || [] };
    } else {
      throw error;
    }
  }

  const discount = Number(rental.discountAmount || 0);
  const newTotalDue = Number((preview.newAmount - discount).toFixed(2));

  return {
    ...preview,
    newTotalDue,
    availability,
  };
};

const extendRental = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = getTenantScope(req);
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId },
      include: [{ model: RentalItem, as: 'items' }],
      transaction,
    });

    if (!rental) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    await syncRentalLifecycleStatus(rental);
    await rental.reload({ transaction });

    if (!EXTENDABLE_STATUSES.includes(rental.status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot extend rental with status "${rental.status}"`
      });
    }

    const newEndDateStr = normalizeEndDate(req.body.newEndDate);
    if (!req.body.newEndDate) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'newEndDate is required' });
    }

    const { reason } = req.body;
    const preview = calculateExtensionPreview(rental, rental.items, newEndDateStr);

    if (preview.extensionDays <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'New end date must be after the current end date.'
      });
    }

    await assertItemsAvailable({
      tenantId,
      branchId: rental.branchId,
      startDate: preview.extensionStartDate,
      endDate: newEndDateStr,
      items: rental.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        branchId: item.branchId || rental.branchId,
      })),
      excludeRentalId: rental.id,
      transaction,
    });

    const previousEndDate = rental.endDate;
    const extension = await RentalExtension.create({
      rentalId: rental.id,
      previousEndDate,
      newEndDate: newEndDateStr,
      extensionDays: preview.extensionDays,
      additionalCharge: preview.additionalCharge,
      reason: reason || null,
      createdBy: getUserId(req),
    }, { transaction });

    for (const item of rental.items) {
      const linePreview = preview.items.find((row) => row.rentalItemId === item.id);
      await item.update({
        subtotal: linePreview?.newSubtotal ?? item.subtotal,
      }, { transaction });
    }

    const discount = Number(rental.discountAmount || 0);
    await rental.update({
      endDate: newEndDateStr,
      amount: preview.newAmount,
      totalDue: Number((preview.newAmount - discount).toFixed(2)),
      rentalDurationDays: preview.newDurationDays,
      metadata: {
        ...((rental.metadata && typeof rental.metadata === 'object') ? rental.metadata : {}),
        lastExtension: extension.id,
      },
      updatedBy: getUserId(req),
    }, { transaction });

    await transaction.commit();

    await syncRentalLifecycleStatus(rental);
    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    await syncRentalInvoice(rental);
    enqueuePostRentalAutomation({
      event: 'extended',
      rentalId: rental.id,
      tenantId,
      userId: getUserId(req),
    });
    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    return res.status(200).json({
      success: true,
      data: {
        rental: await serializeRental(rental),
        extension,
      },
    });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode === 400) {
      return rejectAvailabilityError(res, error);
    }
    return next(error);
  }
};

/**
 * Preview extension cost and availability before confirming.
 * Query: newEndDate (YYYY-MM-DD, required).
 */
const previewExtendRental = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId },
      include: [{ model: RentalItem, as: 'items' }],
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    await syncRentalLifecycleStatus(rental);

    if (!EXTENDABLE_STATUSES.includes(rental.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot preview extension for rental with status "${rental.status}". Rental must be confirmed, active, or overdue.`
      });
    }

    const newEndDateStr = normalizeEndDate(req.query.newEndDate);
    if (!req.query.newEndDate) {
      return res.status(400).json({ success: false, message: 'newEndDate is required' });
    }

    const preview = await buildExtensionPreview(rental, rental.items, newEndDateStr, tenantId);
    return res.status(200).json({ success: true, data: preview });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * Check out / hand over a confirmed rental to the customer.
 * Records handover notes, actor, and timestamp in rental metadata.
 */
const checkoutRental = async (req, res, next) => {
  try {
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId: getTenantScope(req) },
      include: [
        { model: RentalItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Customer, as: 'customer' }
      ]
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    await syncRentalLifecycleStatus(rental);
    await rental.reload();

    const effectiveRole = getEffectiveRole(req);
    const allowEarlyOverride = MANAGER_PLUS_ROLES.includes(effectiveRole);

    if (!canCheckoutRental(rental, { allowEarlyOverride })) {
      if (rental.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: `Cannot check out rental with status "${rental.status}". Rental must be confirmed.`
        });
      }

      return rejectForbidden(
        res,
        'Rental start date has not been reached yet. Only managers and admins can hand over early.'
      );
    }

    const { handoverNotes, unitAssignments = [], scheduleDelivery } = req.body;
    const schedulePickup = parseScheduleDeliveryInput(scheduleDelivery);
    const handedOverAt = new Date().toISOString();
    const handedOverBy = getUserId(req);
    const existingMetadata = (rental.metadata && typeof rental.metadata === 'object') ? rental.metadata : {};
    const earlyHandover = !canCheckoutRental(rental, { allowEarlyOverride: false });

    if (schedulePickup.enabled) {
      const customerRecord = rental.customer || await Customer.findByPk(rental.customerId);
      if (!resolveRentalDeliveryAddress(customerRecord, schedulePickup.address)) {
        return res.status(400).json({
          success: false,
          message: 'Customer delivery address is required to schedule rental delivery.',
        });
      }
    }

    if (Array.isArray(unitAssignments) && unitAssignments.length) {
      await applyUnitAssignments({
        tenantId: getTenantScope(req),
        rental,
        items: rental.items || [],
        assignments: unitAssignments,
        markAsRented: true,
      });
    } else {
      const assignedItems = (rental.items || []).filter((item) => item.rentalUnitId);
      if (assignedItems.length) {
        await applyUnitAssignments({
          tenantId: getTenantScope(req),
          rental,
          items: assignedItems,
          assignments: [],
          markAsRented: true,
        });
      }
    }

    let nextMetadata = {
      ...existingMetadata,
      handover: {
        notes: handoverNotes || null,
        handedOverBy,
        handedOverAt,
        earlyHandover
      }
    };

    if (schedulePickup.enabled) {
      const customerRecord = rental.customer || await Customer.findByPk(rental.customerId);
      nextMetadata = mergeDeliveryLegMetadata(
        { metadata: nextMetadata },
        'pickup',
        buildScheduledDeliveryLeg({
          rental,
          leg: 'pickup',
          customer: customerRecord,
          scheduleInput: schedulePickup,
        }),
      );
    }

    await rental.update({
      status: 'active',
      metadata: nextMetadata,
      updatedBy: getUserId(req)
    });

    await syncRentalLifecycleStatus(rental);
    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });

    enqueuePostRentalAutomation({
      event: 'checkout',
      rentalId: rental.id,
      tenantId: getTenantScope(req),
      userId: getUserId(req),
    });

    return res.status(200).json({ success: true, data: await serializeRental(rental) });
  } catch (error) {
    return next(error);
  }
};

/** Normalize a return date to YYYY-MM-DD without timezone drift. */
const normalizeReturnDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = value ? new Date(value) : new Date();
  return parsed.toISOString().slice(0, 10);
};

/** Build duration and late-charge preview for a proposed return date. */
const buildReturnPreview = async (rental, actualReturnDateStr, tenantId) => {
  const rentalSettings = await getRentalSettings(tenantId);
  const dayBillingMode = rental.metadata?.dayBillingMode || rentalSettings.dayBillingMode;
  const rentalDurationDays = getDayCount(rental.startDate, actualReturnDateStr, dayBillingMode);
  const scheduledDurationDays = getDayCount(rental.startDate, rental.endDate, dayBillingMode);
  const lateCharge = recalculateLateCharge(rental, actualReturnDateStr, rentalSettings);

  return {
    actualReturnDate: actualReturnDateStr,
    startDate: rental.startDate,
    endDate: rental.endDate,
    rentalDurationDays,
    scheduledDurationDays,
    lateCharge,
    isLate: lateCharge.daysLate > 0,
    gracePeriodValue: rentalSettings.gracePeriodValue,
    gracePeriodUnit: rentalSettings.gracePeriodUnit,
    lateChargeRatePercent: rentalSettings.lateChargeRatePercent,
  };
};

/**
 * Preview return duration and estimated late charge before confirming.
 * Query: actualReturnDate (YYYY-MM-DD, defaults to today).
 */
const previewReturnRental = async (req, res, next) => {
  try {
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId: getTenantScope(req) },
      include: [{ model: RentalItem, as: 'items' }]
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    await syncRentalLifecycleStatus(rental);

    if (!RETURNABLE_STATUSES.includes(rental.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot preview return for rental with status "${rental.status}". Rental must be active or overdue.`
      });
    }

    const actualReturnDateStr = normalizeReturnDate(req.query.actualReturnDate);

    if (actualReturnDateStr < rental.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Return date cannot be before the rental start date.'
      });
    }

    const preview = await buildReturnPreview(rental, actualReturnDateStr, getTenantScope(req));
    return res.status(200).json({ success: true, data: preview });
  } catch (error) {
    return next(error);
  }
};

/**
 * Record a full rental return with inspection notes and late-charge generation.
 * Body: { actualReturnDate, inspectionNotes }
 */
const returnRental = async (req, res, next) => {
  try {
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId: getTenantScope(req) },
      include: [{ model: RentalItem, as: 'items' }, { model: LateCharge, as: 'lateCharges' }]
    });

    if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });

    await syncRentalLifecycleStatus(rental);

    if (!RETURNABLE_STATUSES.includes(rental.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot return rental with status "${rental.status}". Rental must be active or overdue.`
      });
    }

    const actualReturnDateStr = normalizeReturnDate(req.body.actualReturnDate);

    if (actualReturnDateStr < rental.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Return date cannot be before the rental start date.'
      });
    }

    const rentalSettingsForReturn = await getRentalSettings(getTenantScope(req));
    const rentalDurationDays = getDayCount(
      rental.startDate,
      actualReturnDateStr,
      rental.metadata?.dayBillingMode || rentalSettingsForReturn.dayBillingMode
    );
    const returnedAt = new Date().toISOString();
    const returnedBy = getUserId(req);
    const { inspectionNotes, scheduleReturnPickup, scheduleDelivery } = req.body;
    const scheduleReturn = parseScheduleDeliveryInput(
      scheduleReturnPickup !== undefined ? scheduleReturnPickup : scheduleDelivery
    );
    const existingMetadata = (rental.metadata && typeof rental.metadata === 'object') ? rental.metadata : {};

    if (scheduleReturn.enabled) {
      const customerRecord = await Customer.findByPk(rental.customerId);
      if (!resolveRentalDeliveryAddress(customerRecord, scheduleReturn.address)) {
        return res.status(400).json({
          success: false,
          message: 'Customer delivery address is required to schedule return pickup.',
        });
      }
    }

    const rentalSettings = rentalSettingsForReturn;
    const lateCharge = recalculateLateCharge(rental, actualReturnDateStr, rentalSettings);

    let nextMetadata = {
      ...existingMetadata,
      return: {
        inspectionNotes: inspectionNotes || null,
        returnedBy,
        returnedAt,
        rentalDurationDays,
        lateChargeEstimate: lateCharge.totalCharge > 0 ? lateCharge : null,
      }
    };

    if (scheduleReturn.enabled) {
      const customerRecord = await Customer.findByPk(rental.customerId);
      nextMetadata = mergeDeliveryLegMetadata(
        { metadata: nextMetadata },
        'return',
        buildScheduledDeliveryLeg({
          rental,
          leg: 'return',
          customer: customerRecord,
          scheduleInput: scheduleReturn,
        }),
      );
    }

    await rental.update({
      actualReturnDate: actualReturnDateStr,
      status: 'returned',
      rentalDurationDays,
      metadata: nextMetadata,
      updatedBy: getUserId(req)
    });

    await releaseRentalUnits({ rentalId: rental.id });

    let createdLateCharge = null;
    if (lateCharge.totalCharge > 0) {
      createdLateCharge = await LateCharge.create({
        rentalId: rental.id,
        customerId: rental.customerId,
        branchId: rental.branchId,
        daysLate: lateCharge.daysLate,
        chargePerDay: lateCharge.chargePerDay,
        totalCharge: lateCharge.totalCharge,
        status: 'pending',
        notes: 'Auto-generated late charge',
        metadata: { generatedAt: new Date().toISOString() }
      });
    }

    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    const invoiceResult = await finalizeRentalBilling(rental);
    enqueuePostRentalAutomation({
      event: 'returned',
      rentalId: rental.id,
      tenantId: getTenantScope(req),
      userId: getUserId(req),
    });
    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });

    try {
      await updateRentalCustomerHistory({
        rental,
        tenantId: getTenantScope(req),
      });
    } catch (historyError) {
      console.error('[rental] Failed to update customer rental history on return', rental.id, historyError);
    }

    return res.status(200).json({
      success: true,
      data: await serializeRental(rental),
      invoice: invoiceResult.invoice,
      invoiceCreated: invoiceResult.created,
      lateCharge: createdLateCharge
        ? {
          daysLate: lateCharge.daysLate,
          chargePerDay: lateCharge.chargePerDay,
          totalCharge: lateCharge.totalCharge,
        }
        : null,
    });
  } catch (error) {
    return next(error);
  }
};

const recordDamage = async (req, res, next) => {
  try {
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId: getTenantScope(req) },
      include: [{ model: RentalItem, as: 'items' }]
    });

    if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });

    const { rentalItemId, productId, damageType, severity, description, estimatedRepairCost, photos = [] } = req.body;

    if (!rentalItemId || !productId) {
      return res.status(400).json({ success: false, message: 'rentalItemId and productId are required' });
    }

    const itemBelongsToRental = (rental.items || []).some((item) => item.id === rentalItemId);
    if (!itemBelongsToRental) {
      return res.status(400).json({ success: false, message: 'rentalItemId does not belong to this rental' });
    }

    const photoUrls = Array.isArray(photos)
      ? photos.filter((url) => typeof url === 'string' && url.trim())
      : [];

    const report = await DamageReport.create({
      rentalId: rental.id,
      rentalItemId,
      productId,
      damageType: normalizeDamageType(damageType),
      severity: normalizeDamageSeverity(severity),
      description,
      estimatedRepairCost: Number(estimatedRepairCost || 0),
      photos: photoUrls,
      inspectionBy: getUserId(req),
      status: 'pending_approval'
    });

    const product = await Product.findByPk(productId);
    const productName = product?.name || 'Rental product';

    const expense = await autoCreateExpenseFromDamage({
      damageReportId: report.id,
      tenantId: rental.tenantId,
      shopId: rental.branchId,
      createdBy: getUserId(req),
      productName,
    });

    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    const totalDue = computeRentalTotalDue(rental, rental.lateCharges, rental.damageReports);
    await rental.update({ totalDue, updatedBy: getUserId(req) });
    await syncRentalInvoice(rental);

    await report.reload({
      include: [{ model: Expense, as: 'expense', attributes: ['id', 'expenseNumber', 'amount', 'approvalStatus', 'status'] }],
    });

    rentalNotificationService.notifyDamageReportCreated({
      damageReport: report,
      rental,
      productName,
      triggeredBy: getUserId(req),
    }).catch((notifyError) => {
      console.error('[rental] Damage notification failed:', notifyError?.message || notifyError);
    });

    return res.status(201).json({
      success: true,
      data: {
        damageReport: report.get ? report.get({ plain: true }) : report,
        expense: expense.get ? expense.get({ plain: true }) : expense,
        totalDue,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const WAIVABLE_LATE_CHARGE_STATUSES = ['pending'];

/**
 * Waive a pending late charge (manager/admin only — enforced by route authorize).
 * Body: { reason } (required).
 */
const waiveLateCharge = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { reason } = req.body;

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        message: 'A waive reason is required'
      });
    }

    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId },
      include: RENTAL_DETAIL_INCLUDES
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    const charge = await LateCharge.findOne({
      where: { id: req.params.chargeId, rentalId: rental.id }
    });

    if (!charge) {
      return res.status(404).json({ success: false, message: 'Late charge not found' });
    }

    if (!WAIVABLE_LATE_CHARGE_STATUSES.includes(charge.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot waive late charge with status "${charge.status}". Only pending charges can be waived.`
      });
    }

    const waivedAt = new Date().toISOString();
    const waivedBy = getUserId(req);
    const existingMetadata = (charge.metadata && typeof charge.metadata === 'object') ? charge.metadata : {};

    await charge.update({
      status: 'waived',
      metadata: {
        ...existingMetadata,
        waiveReason: String(reason).trim(),
        waivedBy,
        waivedAt,
      }
    });

    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    const totalDue = computeRentalTotalDue(rental, rental.lateCharges, rental.damageReports);
    await rental.update({ totalDue, updatedBy: getUserId(req) });

    const invoiceResult = await syncRentalInvoice(rental);
    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });

    return res.status(200).json({
      success: true,
      data: await serializeRental(rental),
      lateCharge: charge,
      invoice: invoiceResult.invoice,
      invoiceUpdated: invoiceResult.updated,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Refund a held deposit balance (full or partial). Manager/admin only — enforced by route authorize.
 * POST /api/rentals/:id/deposit/refund
 * Body: { amount?, reason, paymentMethod?, referenceNumber? }
 */
const refundDeposit = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { amount, reason, paymentMethod, referenceNumber } = req.body || {};

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        message: 'A refund reason is required',
      });
    }

    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId },
      include: RENTAL_DETAIL_INCLUDES,
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    const deposit = getRentalDeposit(rental);
    if (deposit.paid <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This rental has no deposit to refund',
      });
    }

    const refundable = getDepositRefundableAmount(rental, deposit);
    if (refundable <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Deposit has already been fully refunded or applied',
      });
    }

    const result = await refundRentalDeposit(rental, {
      amount,
      reason: String(reason).trim(),
      paymentMethod,
      referenceNumber: referenceNumber || null,
    });

    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });

    return res.status(200).json({
      success: true,
      data: await serializeRental(rental),
      refundAmount: result.refundAmount,
      refundPaymentId: result.refundPaymentId,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * Manually apply a held deposit to the rental invoice. Manager/admin only.
 * POST /api/rentals/:id/deposit/apply
 */
const applyDeposit = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);

    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId },
      include: RENTAL_DETAIL_INCLUDES,
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    const invoiceId = rental.metadata?.invoiceId;
    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: 'No invoice exists for this rental yet',
      });
    }

    const invoice = await Invoice.findOne({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Rental invoice not found' });
    }

    const result = await applyRentalDepositManually(rental, invoice);

    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    await invoice.reload();

    return res.status(200).json({
      success: true,
      data: await serializeRental(rental),
      appliedAmount: result.appliedAmount,
      invoice: invoice.get ? invoice.get({ plain: true }) : invoice,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

const listPreBookings = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const where = { tenantId };
    if (req.query.customerId) where.customerId = req.query.customerId;
    if (req.query.branchId) where.branchId = req.query.branchId;
    if (req.query.status) where.status = req.query.status;

    const preBookings = await PreBooking.findAll({
      where,
      include: [
        { model: Customer, as: 'customer' },
        { model: PreBookingItem, as: 'items', include: [{ model: Product, as: 'product' }] },
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({ success: true, data: preBookings });
  } catch (error) {
    return next(error);
  }
};

const createPreBooking = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { customerId, branchId: bodyBranchId, requestedStartDate, requestedEndDate, notes, items = [] } = req.body;

    if (!customerId || !requestedStartDate || !requestedEndDate || !items.length) {
      return res.status(400).json({ success: false, message: 'customerId, requestedStartDate, requestedEndDate and items are required' });
    }

    const branchId = await resolveBranchId(req, bodyBranchId);
    if (!branchId) {
      return res.status(400).json({ success: false, message: 'branchId is required' });
    }

    await assertItemsAvailable({
      tenantId,
      branchId,
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      items,
    });

    const normalizedItems = [];
    for (const item of items) {
      const product = await Product.findByPk(item.productId);
      const unitRate = Number(item.requestedRatePerDay || item.rate || product?.rentalRatePerDay || product?.sellingPrice || 0);
      normalizedItems.push({
        productId: item.productId,
        product,
        quantity: Number(item.quantity || 0),
        requestedRatePerDay: unitRate,
      });
    }

    const preBookingSettings = await getRentalSettings(tenantId);
    const summary = calculateRentalTotals(
      normalizedItems.map((row) => ({
        quantity: row.quantity,
        rentalRatePerDay: row.requestedRatePerDay,
      })),
      requestedStartDate,
      requestedEndDate,
      { dayBillingMode: preBookingSettings.dayBillingMode }
    );

    const preBooking = await PreBooking.create({
      tenantId,
      customerId,
      branchId,
      requestedStartDate,
      requestedEndDate,
      notes,
      createdBy: getUserId(req),
      metadata: { source: 'staff' }
    });

    for (const item of normalizedItems) {
      await PreBookingItem.create({
        preBookingId: preBooking.id,
        productId: item.productId,
        branchId: branchId || item.branchId,
        quantity: item.quantity,
        requestedRatePerDay: item.requestedRatePerDay,
      });
    }

    const proforma = await Invoice.create({
      tenantId,
      shopId: branchId,
      customerId,
      invoiceNumber: `PB-${Date.now()}`,
      sourceType: 'quote',
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subtotal: summary.total,
      totalAmount: summary.total,
      balance: summary.total,
      status: 'draft',
      items: normalizedItems.map((item) => ({
        productId: item.productId,
        description: `Pre-booking: ${item.product?.name || item.productId}`,
        quantity: item.quantity,
        rate: item.requestedRatePerDay,
        amount: Number((item.quantity * item.requestedRatePerDay * summary.days).toFixed(2)),
      })),
      metadata: { preBookingId: preBooking.id, generatedFrom: 'prebooking' },
      notes: 'Proforma generated for rental pre-booking'
    });

    await preBooking.update({ proformaInvoiceId: proforma.id, metadata: { ...preBooking.metadata, proformaInvoiceId: proforma.id } });

    const freshPreBooking = await PreBooking.findByPk(preBooking.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: PreBookingItem, as: 'items', include: [{ model: Product, as: 'product' }] },
      ],
    });

    rentalNotificationService.notifyPreBookingCreated({ preBooking: freshPreBooking })
      .catch((notifyError) => {
        console.error('[rental] Pre-booking notification failed:', notifyError?.message || notifyError);
      });

    return res.status(201).json({ success: true, data: { preBooking: freshPreBooking, proforma } });
  } catch (error) {
    if (error.statusCode === 400) {
      return rejectAvailabilityError(res, error);
    }
    return next(error);
  }
};

const confirmPreBooking = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const preBooking = await PreBooking.findOne({
      where: { id: req.params.id, tenantId: getTenantScope(req) },
      include: [{ model: PreBookingItem, as: 'items' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!preBooking) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Pre-booking not found' });
    }

    if (preBooking.status !== 'pending') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot confirm pre-booking with status "${preBooking.status}"`
      });
    }

    const items = (preBooking.items || []).map((item) => ({
      productId: item.productId,
      branchId: item.branchId || preBooking.branchId,
      quantity: Number(item.quantity || 0)
    }));

    await assertItemsAvailable({
      tenantId: preBooking.tenantId,
      branchId: preBooking.branchId,
      startDate: preBooking.requestedStartDate,
      endDate: preBooking.requestedEndDate,
      items,
      excludePreBookingId: preBooking.id,
      transaction
    });

    const confirmSettings = await getRentalSettings(preBooking.tenantId);

    const rental = await Rental.create({
      tenantId: preBooking.tenantId,
      customerId: preBooking.customerId,
      branchId: preBooking.branchId,
      startDate: preBooking.requestedStartDate,
      endDate: preBooking.requestedEndDate,
      status: getInitialRentalStatus(preBooking.requestedStartDate),
      rentalDurationDays: getDayCount(
        preBooking.requestedStartDate,
        preBooking.requestedEndDate,
        confirmSettings.dayBillingMode
      ),
      paymentMethod: 'cash',
      amount: 0,
      totalDue: 0,
      notes: preBooking.notes || 'Converted from pre-booking',
      metadata: {
        convertedFromPreBookingId: preBooking.id,
        dayBillingMode: confirmSettings.dayBillingMode,
      },
      createdBy: getUserId(req),
      updatedBy: getUserId(req)
    }, { transaction });

    const rentalDays = getDayCount(
      preBooking.requestedStartDate,
      preBooking.requestedEndDate,
      confirmSettings.dayBillingMode
    );

    for (const item of preBooking.items) {
      const product = await Product.findByPk(item.productId, { transaction });
      const subtotal = Number((Number(item.quantity || 0) * Number(item.requestedRatePerDay || 0) * rentalDays).toFixed(2));
      await RentalItem.create({
        rentalId: rental.id,
        productId: item.productId,
        branchId: item.branchId || preBooking.branchId,
        quantity: Number(item.quantity || 0),
        rentalRatePerDay: Number(item.requestedRatePerDay || product?.rentalRatePerDay || 0),
        subtotal
      }, { transaction });
    }

    const confirmedItems = await RentalItem.findAll({ where: { rentalId: rental.id }, transaction });
    const summary = calculateRentalTotals(confirmedItems.map((item) => ({
      quantity: Number(item.quantity || 0),
      rentalRatePerDay: Number(item.rentalRatePerDay || 0)
    })), rental.startDate, rental.endDate, { dayBillingMode: confirmSettings.dayBillingMode });

    await rental.update({
      amount: summary.total,
      totalDue: summary.total,
      status: getInitialRentalStatus(rental.startDate),
      metadata: { ...((rental.metadata && typeof rental.metadata === 'object') ? rental.metadata : {}), convertedFromPreBookingId: preBooking.id },
      updatedBy: getUserId(req)
    }, { transaction });

    await preBooking.update({ status: 'converted', convertedToRentalId: rental.id }, { transaction });

    await transaction.commit();

    await generateRentalInvoice(rental.id, { applyHeldDeposit: false }).catch((invoiceError) => {
      console.error('[rental] Auto-invoice failed after pre-booking confirm', rental.id, invoiceError);
    });

    enqueuePostRentalAutomation({
      event: 'prebooking_confirmed',
      rentalId: rental.id,
      tenantId: preBooking.tenantId,
      userId: getUserId(req),
    });

    const confirmedRental = await Rental.findByPk(rental.id, { include: RENTAL_DETAIL_INCLUDES });
    return res.status(200).json({
      success: true,
      data: { rental: await serializeRental(confirmedRental), preBooking },
    });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode === 400) {
      return rejectAvailabilityError(res, error);
    }
    return next(error);
  }
};

const cancelPreBooking = async (req, res, next) => {
  try {
    const preBooking = await PreBooking.findOne({
      where: { id: req.params.id, tenantId: getTenantScope(req) },
      include: [
        { model: Customer, as: 'customer' },
        { model: PreBookingItem, as: 'items', include: [{ model: Product, as: 'product' }] },
      ],
    });

    if (!preBooking) {
      return res.status(404).json({ success: false, message: 'Pre-booking not found' });
    }

    if (preBooking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel pre-booking with status "${preBooking.status}"`
      });
    }

    await preBooking.update({ status: 'cancelled' });

    return res.status(200).json({ success: true, data: preBooking });
  } catch (error) {
    return next(error);
  }
};

const buildProductSummary = (items = []) => {
  const names = items
    .map((item) => item?.product?.name)
    .filter(Boolean);
  if (!names.length) return 'Items';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(', ');
  return `${names[0]} +${names.length - 1} more`;
};

const mapRentalToCalendarEvent = (rental) => {
  const plain = rental.get ? rental.get({ plain: true }) : rental;
  const customerName = plain.customer?.name || 'Customer';
  const productSummary = buildProductSummary(plain.items);

  return {
    id: plain.id,
    type: 'rental',
    status: plain.status,
    startDate: plain.startDate,
    endDate: plain.endDate,
    title: `${customerName} — ${productSummary}`,
    customerName,
    productSummary,
    raw: plain,
  };
};

const mapPreBookingToCalendarEvent = (preBooking) => {
  const plain = preBooking.get ? preBooking.get({ plain: true }) : preBooking;
  const customerName = plain.customer?.name || 'Customer';
  const productSummary = buildProductSummary(plain.items);

  return {
    id: plain.id,
    type: 'pre-booking',
    status: plain.status,
    startDate: plain.requestedStartDate,
    endDate: plain.requestedEndDate,
    title: `${customerName} — ${productSummary}`,
    customerName,
    productSummary,
    raw: plain,
  };
};

/**
 * Calendar feed: open rentals and pending/confirmed pre-bookings overlapping a date range.
 * Query: start, end (YYYY-MM-DD, required), branchId (optional).
 */
const getRentalCalendar = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { start, end, branchId } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'start and end query parameters are required (YYYY-MM-DD)',
      });
    }

    const branchWhere = {};
    if (branchId) {
      branchWhere.branchId = branchId;
    }

    const rentalWhere = {
      tenantId,
      ...branchWhere,
      status: { [Op.in]: ['pending', 'confirmed', 'active', 'overdue'] },
      startDate: { [Op.lte]: end },
      endDate: { [Op.gte]: start },
    };

    const preBookingWhere = {
      tenantId,
      ...branchWhere,
      status: { [Op.in]: ['pending', 'confirmed'] },
      requestedStartDate: { [Op.lte]: end },
      requestedEndDate: { [Op.gte]: start },
    };

    const [rentals, preBookings] = await Promise.all([
      Rental.findAll({
        where: rentalWhere,
        include: [
          { model: RentalItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] },
          { model: Customer, as: 'customer', attributes: ['id', 'name'] },
        ],
        order: [['startDate', 'ASC']],
      }),
      PreBooking.findAll({
        where: preBookingWhere,
        include: [
          { model: PreBookingItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] },
          { model: Customer, as: 'customer', attributes: ['id', 'name'] },
        ],
        order: [['requestedStartDate', 'ASC']],
      }),
    ]);

    await syncRentalsInList(rentals);

    const events = [
      ...rentals.map(mapRentalToCalendarEvent),
      ...preBookings.map(mapPreBookingToCalendarEvent),
    ];

    return res.status(200).json({ success: true, data: events });
  } catch (error) {
    return next(error);
  }
};

const getRentalDashboard = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const todayDate = new Date().toISOString().slice(0, 10);
    const branchWhere = {};
    if (req.shopFilterId) {
      branchWhere.branchId = req.shopFilterId;
    } else if (req.shopScoped && !req.canAccessAllShops && req.allowedShopIds?.length) {
      branchWhere.branchId = { [Op.in]: req.allowedShopIds };
    }

    const [activeRentals, overdueRentals, completedRentals, dueBackToday, upcomingPreBookings] = await Promise.all([
      Rental.count({ where: { tenantId, status: 'active', ...branchWhere } }),
      Rental.count({ where: { tenantId, status: 'overdue', ...branchWhere } }),
      Rental.count({ where: { tenantId, status: 'completed', ...branchWhere } }),
      Rental.count({
        where: {
          tenantId,
          status: { [Op.in]: ['active', 'confirmed', 'overdue'] },
          endDate: todayDate,
          ...branchWhere,
        },
      }),
      PreBooking.count({ where: { tenantId, status: 'pending', ...branchWhere } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        activeRentals,
        overdueRentals,
        completedRentals,
        dueBackToday,
        upcomingPreBookings,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getAvailability = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { productId, branchId, startDate, endDate } = req.query;

    if (!productId || !branchId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'productId, branchId, startDate and endDate are required'
      });
    }

    const result = await checkRentalAvailability({
      tenantId,
      productId,
      branchId,
      startDate,
      endDate
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

const checkAvailability = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { branchId: bodyBranchId, startDate, endDate, items = [] } = req.body;

    const branchId = await resolveBranchId(req, bodyBranchId);
    if (!branchId || !startDate || !endDate || !items.length) {
      return res.status(400).json({
        success: false,
        message: 'branchId, startDate, endDate and items are required'
      });
    }

    const results = await checkBatchAvailability({
      tenantId,
      branchId,
      startDate,
      endDate,
      items
    });

    const canFulfillAll = results.length > 0 && results.every((row) => row.canFulfill);

    return res.status(200).json({
      success: true,
      data: {
        canFulfillAll,
        items: results
      }
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * @desc    Rental agreement document payload for client-side PDF generation
 * @route   GET /api/rentals/:id/pdf/agreement
 * @access  Private
 */
const getRentalAgreementPdf = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const document = await buildRentalAgreementDocument(tenantId, req.params.id);
    return res.status(200).json({ success: true, data: document });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * @desc    Return inspection document payload for client-side PDF generation
 * @route   GET /api/rentals/:id/pdf/return-inspection
 * @access  Private
 */
const getRentalReturnInspectionPdf = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const document = await buildRentalReturnInspectionDocument(tenantId, req.params.id);
    return res.status(200).json({ success: true, data: document });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * Record a hire payment on a rental and sync the linked invoice.
 * POST /api/rentals/:id/payment
 * Body: { amount, paymentMethod?, referenceNumber?, paymentDate?, notes? }
 */
const recordRentalPayment = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const rental = await Rental.findOne({
      where: { id: req.params.id, tenantId },
      include: RENTAL_DETAIL_INCLUDES,
    });

    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    if (rental.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot record payment on a cancelled rental' });
    }

    await ensureRentalInvoice(rental);
    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });

    const totalDue = Number(rental.totalDue || 0);
    const currentPaid = Number(rental.amountPaid || 0);
    const balanceDue = Math.max(totalDue - currentPaid, 0);

    if (balanceDue <= 0.01) {
      return res.status(400).json({ success: false, message: 'Rental is already fully paid' });
    }

    const paymentAmount = Number(req.body.amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
    }
    if (paymentAmount > balanceDue + 0.01) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed balance due (₵ ${balanceDue.toFixed(2)})`,
      });
    }

    const newAmountPaid = Number(Math.min(currentPaid + paymentAmount, totalDue).toFixed(2));
    const paymentMethod = req.body.paymentMethod || rental.paymentMethod || 'cash';
    const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();

    await rental.update({
      amountPaid: newAmountPaid,
      paymentMethod,
      updatedBy: getUserId(req),
    });

    const payment = await Payment.create({
      paymentNumber: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'income',
      customerId: rental.customerId,
      tenantId,
      amount: Number(paymentAmount.toFixed(2)),
      paymentMethod: rentalPaymentMethodToPaymentModel(paymentMethod),
      paymentDate,
      referenceNumber: req.body.referenceNumber || null,
      status: 'completed',
      description: `rental:${rental.id}`,
      notes: req.body.notes || req.body.paymentNotes || null,
    });

    const invoice = await syncRentalInvoiceAndRefreshCustomerBalance(rental, { tenantId });

    await rental.reload({ include: RENTAL_DETAIL_INCLUDES });
    return res.status(200).json({
      success: true,
      data: await serializeRental(rental),
      payment,
      invoice,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Manual trigger for rental scheduled notifications (dev/support).
 * POST /api/rentals/notifications/run
 * Body: { force?: boolean, types?: string[] }
 */
const runRentalNotifications = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { force = false, types = null } = req.body || {};
    const summary = await rentalNotificationService.checkAndSendReminders({
      force: force === true,
      tenantId,
      types: Array.isArray(types) ? types : null,
    });
    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listRentals,
  getRental,
  createRental,
  updateRental,
  extendRental,
  previewExtendRental,
  checkoutRental,
  previewReturnRental,
  returnRental,
  recordRentalPayment,
  waiveLateCharge,
  refundDeposit,
  applyDeposit,
  recordDamage,
  listPreBookings,
  createPreBooking,
  confirmPreBooking,
  cancelPreBooking,
  getRentalDashboard,
  getRentalCalendar,
  getAvailability,
  checkAvailability,
  getRentalAgreementPdf,
  getRentalReturnInspectionPdf,
  runRentalNotifications,
};
