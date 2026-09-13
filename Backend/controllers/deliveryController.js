const { Op } = require('sequelize');
const { Job, Sale, Rental, Customer, SaleActivity, User, UserTenant, MarketplaceOrderPayment } = require('../models');
const { sequelize } = require('../config/database');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { applyShopReadFilter } = require('../utils/shopUtils');
const { applyStudioLocationFilter } = require('../utils/studioLocationUtils');
const { parseDeliveryStatusInput } = require('../utils/deliveryStatus');
const { invalidateSaleListCache } = require('../middleware/cache');
const { getEffectiveRole } = require('../middleware/auth');
const { markDeliveryReleaseWindowForSale } = require('../services/tradeAssuranceService');
const {
  CUSTOMER_CONFIRMED_DELIVERY_ERROR_CODE,
  CUSTOMER_CONFIRMED_DELIVERY_ERROR_MESSAGE,
  hasCustomerConfirmedDelivery,
} = require('../utils/marketplaceOrderStatus');
const {
  expandRentalDeliveryRows,
  applyRentalBranchReadFilter,
  rentalHasScheduledDeliveryCondition,
  updateRentalDeliveryLeg,
  RENTAL_DELIVERY_LEGS,
} = require('../services/rentalDeliveryService');

const DELIVERY_LABELS = {
  ready_for_delivery: 'Ready for delivery',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  returned: 'Returned'
};

const MAX_BULK_UPDATES = 40;
const DRIVER_ROLE = 'driver';
const ONLINE_STORE_SOURCE = 'online_store';
const PAID_ONLINE_PAYMENT_STATUSES = ['paid_held', 'released', 'disputed'];

const ACTIVE_DELIVERY_OR_NULL = {
  [Op.or]: [
    { deliveryStatus: null },
    { deliveryStatus: 'ready_for_delivery' },
    { deliveryStatus: 'out_for_delivery' }
  ]
};

const DRIVER_ACTIVE_DELIVERY_ONLY = {
  [Op.or]: [{ deliveryStatus: 'ready_for_delivery' }, { deliveryStatus: 'out_for_delivery' }],
};

const DRIVER_ALLOWED_NEXT_STATUSES = {
  ready_for_delivery: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
};

const appendSaleDeliveryTrackingMetadata = (metadata, deliveryStatus, actorUserId = null) => {
  const nextMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
  const deliveryTracking = nextMetadata.deliveryTracking && typeof nextMetadata.deliveryTracking === 'object'
    ? { ...nextMetadata.deliveryTracking }
    : {};
  const history = Array.isArray(deliveryTracking.history) ? deliveryTracking.history.slice(-19) : [];
  const timestamp = new Date().toISOString();
  nextMetadata.deliveryTracking = {
    ...deliveryTracking,
    status: deliveryStatus || null,
    deliveredAt: deliveryStatus === 'delivered' ? timestamp : null,
    history: [
      ...history,
      {
        status: deliveryStatus || null,
        at: timestamp,
        source: 'abs_delivery_queue',
        actorUserId,
      },
    ],
  };
  return nextMetadata;
};

const isDriverRequest = (req) => getEffectiveRole(req) === DRIVER_ROLE;

const canAssignDriver = (req) => ['admin', 'manager'].includes(getEffectiveRole(req));

const normalizeAssignedDriver = (value) => {
  if (value == null || value === '') return null;
  return String(value);
};

const getSaleMetadata = (sale) => {
  const metadata = sale?.metadata || {};
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
};

const isOnlineStoreSale = (sale) => getSaleMetadata(sale).source === ONLINE_STORE_SOURCE;

const saleMetadataText = (key) => sequelize.literal(`"Sale"."metadata"->>'${key}'`);

const saleMetadataNestedText = (parent, key) => sequelize.literal(`"Sale"."metadata"->'${parent}'->>'${key}'`);

const onlineStoreSourceCondition = () => sequelize.where(saleMetadataText('source'), ONLINE_STORE_SOURCE);

const nonOnlineStoreSourceCondition = () => (
  sequelize.literal(`COALESCE("Sale"."metadata"->>'source', '') <> '${ONLINE_STORE_SOURCE}'`)
);

const paidOnlinePaymentCondition = () => ({
  [Op.or]: [
    { status: 'completed' },
    { '$marketplacePayment.status$': { [Op.in]: PAID_ONLINE_PAYMENT_STATUSES } },
    sequelize.where(
      saleMetadataNestedText('tradeAssurance', 'paymentStatus'),
      { [Op.in]: PAID_ONLINE_PAYMENT_STATUSES }
    ),
  ],
});

const onlineDeliveryOrderEligibilityCondition = () => ({
  [Op.and]: [
    onlineStoreSourceCondition(),
    { deliveryRequired: true },
    paidOnlinePaymentCondition(),
  ],
});

const saleDeliveryQueueEligibilityCondition = (deliveryStatusCondition, extraConditions = []) => ({
  [Op.or]: [
    {
      [Op.and]: [
        { status: 'completed' },
        nonOnlineStoreSourceCondition(),
        deliveryStatusCondition,
        ...extraConditions,
      ],
    },
    {
      [Op.and]: [
        onlineDeliveryOrderEligibilityCondition(),
        deliveryStatusCondition,
        ...extraConditions,
      ],
    },
  ],
});

const isPaidOnlineDeliverySale = (sale, payment = null) => {
  if (!isOnlineStoreSale(sale) || sale.deliveryRequired !== true) return false;
  const metadata = getSaleMetadata(sale);
  const paymentStatus = payment?.status || metadata.tradeAssurance?.paymentStatus || null;
  return sale.status === 'completed' || PAID_ONLINE_PAYMENT_STATUSES.includes(paymentStatus);
};

const assertAssignedDriverIsValid = async (tenantId, userId) => {
  if (!userId) return { ok: true };
  const membership = await UserTenant.findOne({
    where: {
      tenantId,
      userId,
      role: DRIVER_ROLE,
      status: 'active',
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'isActive'],
        required: true,
      },
    ],
  });
  if (!membership || membership.user?.isActive === false) {
    return { ok: false, message: 'deliveryAssignedTo must be an active driver in this workspace' };
  }
  return { ok: true };
};

const enforceDriverStatusTransition = ({ currentStatus, nextStatus }) => {
  if (!nextStatus) {
    return { ok: false, message: 'Drivers cannot clear delivery status' };
  }
  if (nextStatus === 'returned') {
    return { ok: false, message: 'Drivers cannot mark deliveries as returned' };
  }
  const from = currentStatus || 'ready_for_delivery';
  const allowed = DRIVER_ALLOWED_NEXT_STATUSES[from] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      message: `Driver status transition not allowed (${from} -> ${nextStatus})`,
    };
  }
  return { ok: true };
};

function formatAddressSummary(customer) {
  if (!customer) return null;
  const parts = [customer.address, customer.city, customer.state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function formatDeliveryAddressSummary(deliveryAddress) {
  if (!deliveryAddress || typeof deliveryAddress !== 'object') return null;
  const parts = [
    deliveryAddress.line1 || deliveryAddress.address,
    deliveryAddress.line2,
    deliveryAddress.city,
    deliveryAddress.region || deliveryAddress.state,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function formatJobRow(job) {
  const j = job.toJSON ? job.toJSON() : job;
  const c = j.customer;
  return {
    entityType: 'job',
    id: j.id,
    reference: j.jobNumber,
    title: j.title,
    customerName: c?.name || c?.company || null,
    customerPhone: c?.phone || null,
    addressSummary: formatAddressSummary(c),
    completedAt: j.completionDate || j.updatedAt,
    deliveryStatus: j.deliveryStatus || null,
    deliveryAssignedTo: j.deliveryAssignedTo || null,
    deliveryAssignedAt: j.deliveryAssignedAt || null,
    deliveredBy: j.deliveredBy || null,
    deliveredAt: j.deliveredAt || null,
    total: null
  };
}

function formatSaleRow(sale) {
  const s = sale.toJSON ? sale.toJSON() : sale;
  const c = s.customer;
  const metadata = getSaleMetadata(s);
  const deliveryAddress = metadata.deliveryAddress && typeof metadata.deliveryAddress === 'object'
    ? metadata.deliveryAddress
    : null;
  return {
    entityType: 'sale',
    id: s.id,
    reference: s.saleNumber,
    title: metadata.source === ONLINE_STORE_SOURCE ? 'Online delivery order' : null,
    customerName: deliveryAddress?.recipientName || c?.name || c?.company || 'Walk-in',
    customerPhone: deliveryAddress?.phone || c?.phone || null,
    addressSummary: formatDeliveryAddressSummary(deliveryAddress) || formatAddressSummary(c),
    completedAt: s.updatedAt,
    deliveryStatus: s.deliveryStatus || null,
    deliveryAssignedTo: s.deliveryAssignedTo || null,
    deliveryAssignedAt: s.deliveryAssignedAt || null,
    deliveredBy: s.deliveredBy || null,
    deliveredAt: s.deliveredAt || null,
    total: s.total != null ? Number(s.total) : null
  };
}

function applyJobScope(req, where) {
  return applyStudioLocationFilter(req, where);
}

function applySaleScope(req, where) {
  return applyShopReadFilter(req, where);
}

function applyRentalScope(req, where) {
  return applyRentalBranchReadFilter(req, where);
}

/**
 * @desc    List completed jobs and sales in the delivery queue (or recent finished deliveries)
 * @route   GET /api/deliveries/queue
 * @access  Private (tenant)
 */
exports.getDeliveryQueue = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const scope = req.query.scope === 'done' ? 'done' : 'active';
    const isDriver = isDriverRequest(req);

    const customerInclude = {
      model: Customer,
      as: 'customer',
      attributes: ['id', 'name', 'company', 'phone', 'address', 'city', 'state']
    };
    const marketplacePaymentInclude = {
      model: MarketplaceOrderPayment,
      as: 'marketplacePayment',
      attributes: ['id', 'status'],
      required: false,
    };

    if (scope === 'active') {
      const activeSaleDeliveryStatus = isDriver ? DRIVER_ACTIVE_DELIVERY_ONLY : ACTIVE_DELIVERY_OR_NULL;
      const jobWhere = applyJobScope(req, applyTenantFilter(tenantId, {
        status: 'completed',
        ...(isDriver ? DRIVER_ACTIVE_DELIVERY_ONLY : ACTIVE_DELIVERY_OR_NULL),
        ...(isDriver ? { deliveryAssignedTo: req.user.id } : {}),
      }));
      const saleWhere = applySaleScope(req, applyTenantFilter(tenantId, {
        [Op.and]: [
          saleDeliveryQueueEligibilityCondition(activeSaleDeliveryStatus),
        ],
        ...(isDriver ? { deliveryAssignedTo: req.user.id } : {}),
      }));

      const rentalWhere = applyRentalScope(req, applyTenantFilter(tenantId, {
        status: { [Op.notIn]: ['cancelled'] },
        [Op.and]: [rentalHasScheduledDeliveryCondition()],
      }));

      const [jobs, sales, rentals] = await Promise.all([
        Job.findAll({
          where: jobWhere,
          include: [customerInclude],
          order: [
            ['completionDate', 'DESC'],
            ['updatedAt', 'DESC']
          ]
        }),
        Sale.findAll({
          where: saleWhere,
          include: [customerInclude, marketplacePaymentInclude],
          order: [['updatedAt', 'DESC']]
        }),
        Rental.findAll({
          where: rentalWhere,
          include: [customerInclude],
          order: [['updatedAt', 'DESC']],
        }),
      ]);

      const rentalRows = expandRentalDeliveryRows(rentals, 'active', {
        isDriver,
        driverUserId: req.user?.id || null,
      });
      const rows = [
        ...jobs.map(formatJobRow),
        ...sales.map(formatSaleRow),
        ...rentalRows,
      ].sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );

      return res.status(200).json({ success: true, data: { scope, rows } });
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const terminal = { [Op.in]: ['delivered', 'returned'] };

    const jobWhere = applyJobScope(req, applyTenantFilter(tenantId, {
      status: 'completed',
      deliveryStatus: terminal,
      updatedAt: { [Op.gte]: ninetyDaysAgo },
      ...(isDriver ? { deliveredBy: req.user.id } : {}),
    }));
    const saleWhere = applySaleScope(req, applyTenantFilter(tenantId, {
      [Op.and]: [
        saleDeliveryQueueEligibilityCondition(
          { deliveryStatus: terminal },
          [{ updatedAt: { [Op.gte]: ninetyDaysAgo } }]
        ),
      ],
      ...(isDriver ? { deliveredBy: req.user.id } : {}),
    }));

    const rentalWhere = applyRentalScope(req, applyTenantFilter(tenantId, {
      [Op.and]: [rentalHasScheduledDeliveryCondition()],
      updatedAt: { [Op.gte]: ninetyDaysAgo },
    }));

    const [jobs, sales, rentals] = await Promise.all([
      Job.findAll({
        where: jobWhere,
        include: [customerInclude],
        order: [['updatedAt', 'DESC']]
      }),
      Sale.findAll({
        where: saleWhere,
        include: [customerInclude, marketplacePaymentInclude],
        order: [['updatedAt', 'DESC']]
      }),
      Rental.findAll({
        where: rentalWhere,
        include: [customerInclude],
        order: [['updatedAt', 'DESC']],
      }),
    ]);

    const rentalRows = expandRentalDeliveryRows(rentals, 'done', {
      isDriver,
      driverUserId: req.user?.id || null,
    });
    const rows = [
      ...jobs.map(formatJobRow),
      ...sales.map(formatSaleRow),
      ...rentalRows,
    ].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

    return res.status(200).json({ success: true, data: { scope: 'done', rows } });
  } catch (err) {
    next(err);
  }
};

async function updateJobDeliveryStatus(
  req,
  { tenantId, jobId, deliveryStatus, deliveryAssignedTo, hasAssignedDriverField, userId }
) {
  const isDriver = isDriverRequest(req);
  const normalizedAssignedDriver = normalizeAssignedDriver(deliveryAssignedTo);
  const parsed = parseDeliveryStatusInput(deliveryStatus);
  if (parsed === undefined && deliveryStatus !== undefined) {
    return { ok: false, message: 'Invalid deliveryStatus' };
  }
  if (isDriver && hasAssignedDriverField) {
    return { ok: false, message: 'Drivers cannot assign deliveries' };
  }
  if (!isDriver && hasAssignedDriverField) {
    if (!canAssignDriver(req)) return { ok: false, message: 'Only managers/admins can assign drivers' };
  }
  if (!isDriver && hasAssignedDriverField && normalizedAssignedDriver) {
    const validAssignee = await assertAssignedDriverIsValid(tenantId, normalizedAssignedDriver);
    if (!validAssignee.ok) return { ok: false, message: validAssignee.message };
  }

  const job = await Job.findOne({
    where: applyJobScope(req, applyTenantFilter(tenantId, { id: jobId }))
  });
  if (!job) {
    return { ok: false, message: 'Job not found' };
  }
  if (job.status !== 'completed') {
    return { ok: false, message: 'Only completed jobs can use delivery status here' };
  }
  if (isDriver && job.deliveryAssignedTo !== userId) {
    return { ok: false, message: 'This delivery is not assigned to you' };
  }

  if (isDriver) {
    const guard = enforceDriverStatusTransition({
      currentStatus: job.deliveryStatus || null,
      nextStatus: parsed,
    });
    if (!guard.ok) return { ok: false, message: guard.message };
  }

  const updates = {};
  if (deliveryStatus !== undefined) {
    updates.deliveryStatus = parsed;
    if (parsed) updates.deliveryRequired = true;
    if (parsed === 'delivered' || parsed === 'returned') {
      updates.deliveredBy = userId || null;
      updates.deliveredAt = new Date();
    } else {
      updates.deliveredBy = null;
      updates.deliveredAt = null;
    }
  }
  if (hasAssignedDriverField) {
    updates.deliveryAssignedTo = normalizedAssignedDriver;
    updates.deliveryAssignedAt = new Date();
  }

  await job.update(updates);
  return { ok: true };
}

async function updateSaleDeliveryStatus(
  req,
  { tenantId, saleId, deliveryStatus, deliveryAssignedTo, hasAssignedDriverField, userId }
) {
  const isDriver = isDriverRequest(req);
  const normalizedAssignedDriver = normalizeAssignedDriver(deliveryAssignedTo);
  const parsed = parseDeliveryStatusInput(deliveryStatus);
  if (parsed === undefined && deliveryStatus !== undefined) {
    return { ok: false, message: 'Invalid deliveryStatus' };
  }
  if (isDriver && hasAssignedDriverField) {
    return { ok: false, message: 'Drivers cannot assign deliveries' };
  }
  if (!isDriver && hasAssignedDriverField) {
    if (!canAssignDriver(req)) return { ok: false, message: 'Only managers/admins can assign drivers' };
  }
  if (!isDriver && hasAssignedDriverField && normalizedAssignedDriver) {
    const validAssignee = await assertAssignedDriverIsValid(tenantId, normalizedAssignedDriver);
    if (!validAssignee.ok) return { ok: false, message: validAssignee.message };
  }

  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findOne({
      where: applySaleScope(req, applyTenantFilter(tenantId, { id: saleId })),
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sale) {
      await transaction.rollback();
      return { ok: false, message: 'Sale not found' };
    }
    const marketplacePayment = await MarketplaceOrderPayment.findOne({
      where: { saleId: sale.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (isOnlineStoreSale(sale) && !isPaidOnlineDeliverySale(sale, marketplacePayment)) {
      await transaction.rollback();
      return { ok: false, message: 'Only paid online delivery orders can use delivery status here' };
    }
    if (!isOnlineStoreSale(sale) && sale.status !== 'completed') {
      await transaction.rollback();
      return { ok: false, message: 'Only completed sales can use delivery status here' };
    }
    if (isDriver && sale.deliveryAssignedTo !== userId) {
      await transaction.rollback();
      return { ok: false, message: 'This delivery is not assigned to you' };
    }

    const previousDeliveryStatus = sale.deliveryStatus || null;
    const deliveryStatusChanged = (
      deliveryStatus !== undefined &&
      String(previousDeliveryStatus || '') !== String(parsed || '')
    );
    if (deliveryStatusChanged && hasCustomerConfirmedDelivery(sale)) {
      await transaction.rollback();
      return {
        ok: false,
        message: CUSTOMER_CONFIRMED_DELIVERY_ERROR_MESSAGE,
        errorCode: CUSTOMER_CONFIRMED_DELIVERY_ERROR_CODE,
      };
    }

    if (isDriver) {
      const guard = enforceDriverStatusTransition({
        currentStatus: previousDeliveryStatus,
        nextStatus: parsed,
      });
      if (!guard.ok) {
        await transaction.rollback();
        return { ok: false, message: guard.message };
      }
    }

    if (
      String(previousDeliveryStatus || '') === String(parsed || '') &&
      (!hasAssignedDriverField || String(sale.deliveryAssignedTo || '') === String(normalizedAssignedDriver || ''))
    ) {
      await transaction.commit();
      return { ok: true, unchanged: true };
    }

    const saleUpdates = {};
    if (deliveryStatus !== undefined) {
      saleUpdates.deliveryStatus = parsed;
      saleUpdates.metadata = appendSaleDeliveryTrackingMetadata(sale.metadata, parsed, userId);
      if (parsed === 'delivered' || parsed === 'returned') {
        saleUpdates.deliveredBy = userId || null;
        saleUpdates.deliveredAt = new Date();
      } else {
        saleUpdates.deliveredBy = null;
        saleUpdates.deliveredAt = null;
      }
    }
    if (hasAssignedDriverField) {
      saleUpdates.deliveryAssignedTo = normalizedAssignedDriver;
      saleUpdates.deliveryAssignedAt = new Date();
    }

    await sale.update(saleUpdates, { transaction });
    if (parsed === 'delivered') {
      await markDeliveryReleaseWindowForSale({
        sale,
        deliveredAt: saleUpdates.deliveredAt || new Date(),
        transaction,
      });
    }

    const oldL = previousDeliveryStatus
      ? DELIVERY_LABELS[previousDeliveryStatus] || previousDeliveryStatus
      : 'Not set';
    const newL = parsed ? DELIVERY_LABELS[parsed] || parsed : 'Not set';
    if (deliveryStatus !== undefined) {
      await SaleActivity.create(
        {
          saleId: sale.id,
          tenantId,
          type: 'note',
          subject: 'Delivery status updated',
          notes: `Delivery status changed from ${oldL} to ${newL}`,
          createdBy: userId || null,
          metadata: {
            deliveryStatusChange: true,
            oldDeliveryStatus: previousDeliveryStatus,
            newDeliveryStatus: parsed
          }
        },
        { transaction }
      );
    }

    if (hasAssignedDriverField) {
      await SaleActivity.create(
        {
          saleId: sale.id,
          tenantId,
          type: 'note',
          subject: 'Delivery reassigned',
          notes: `Delivery assigned to user ${normalizedAssignedDriver}`,
          createdBy: userId || null,
          metadata: {
            deliveryAssignmentChange: true,
            deliveryAssignedTo: normalizedAssignedDriver,
          },
        },
        { transaction }
      );
    }

    await transaction.commit();
    return { ok: true };
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

async function updateRentalDeliveryStatus(
  req,
  { tenantId, rentalId, deliveryLeg, deliveryStatus, deliveryAssignedTo, hasAssignedDriverField, userId }
) {
  const isDriver = isDriverRequest(req);

  if (!RENTAL_DELIVERY_LEGS.includes(deliveryLeg)) {
    return { ok: false, message: 'deliveryLeg must be "pickup" or "return" for rental deliveries' };
  }

  if (!isDriver && hasAssignedDriverField) {
    if (!canAssignDriver(req)) return { ok: false, message: 'Only managers/admins can assign drivers' };
  }

  const normalizedAssignedDriver = normalizeAssignedDriver(deliveryAssignedTo);
  if (!isDriver && hasAssignedDriverField && normalizedAssignedDriver) {
    const validAssignee = await assertAssignedDriverIsValid(tenantId, normalizedAssignedDriver);
    if (!validAssignee.ok) return { ok: false, message: validAssignee.message };
  }

  const rental = await Rental.findOne({
    where: applyRentalScope(req, applyTenantFilter(tenantId, { id: rentalId })),
  });
  if (!rental) {
    return { ok: false, message: 'Rental not found' };
  }

  const result = updateRentalDeliveryLeg({
    rental,
    leg: deliveryLeg,
    deliveryStatus,
    deliveryAssignedTo,
    hasAssignedDriverField,
    userId,
    isDriver,
    assertAssignedDriverIsValid,
    enforceDriverStatusTransition,
    normalizeAssignedDriver,
  });

  if (!result.ok) return result;
  if (result.unchanged) return { ok: true, unchanged: true };

  await rental.update({ metadata: result.metadata });
  return { ok: true };
}

/**
 * @desc    Set deliveryStatus on one or more jobs / sales / rentals (tenant-scoped)
 * @route   PATCH /api/deliveries/status
 * @body    { updates: [{ entityType: 'job'|'sale'|'rental', id: uuid, deliveryStatus: string|null, deliveryLeg?: 'pickup'|'return' }] }
 * @access  Private (tenant)
 */
exports.patchDeliveryStatuses = async (req, res, next) => {
  try {
    const raw = req.body?.updates;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'updates must be a non-empty array'
      });
    }
    if (raw.length > MAX_BULK_UPDATES) {
      return res.status(400).json({
        success: false,
        message: `At most ${MAX_BULK_UPDATES} updates per request`
      });
    }

    const tenantId = req.tenantId;
    const userId = req.user?.id || null;
    const results = [];
    let saleTouched = false;

    for (const item of raw) {
      const entityType = item?.entityType;
      const id = item?.id;
      if (!id || !['job', 'sale', 'rental'].includes(entityType)) {
        results.push({
          entityType: entityType || null,
          id: id || null,
          ok: false,
          message: 'Each update needs entityType "job", "sale", or "rental" and id'
        });
        continue;
      }
      if (
        !Object.prototype.hasOwnProperty.call(item || {}, 'deliveryStatus') &&
        !Object.prototype.hasOwnProperty.call(item || {}, 'deliveryAssignedTo')
      ) {
        results.push({
          entityType,
          id,
          ok: false,
          message: 'Provide deliveryStatus and/or deliveryAssignedTo',
        });
        continue;
      }

      try {
        let r;
        if (entityType === 'job') {
          r = await updateJobDeliveryStatus(req, {
            tenantId,
            jobId: id,
            deliveryStatus: item.deliveryStatus,
            deliveryAssignedTo: item.deliveryAssignedTo,
            hasAssignedDriverField: Object.prototype.hasOwnProperty.call(item || {}, 'deliveryAssignedTo'),
            userId
          });
        } else if (entityType === 'sale') {
          r = await updateSaleDeliveryStatus(req, {
            tenantId,
            saleId: id,
            deliveryStatus: item.deliveryStatus,
            deliveryAssignedTo: item.deliveryAssignedTo,
            hasAssignedDriverField: Object.prototype.hasOwnProperty.call(item || {}, 'deliveryAssignedTo'),
            userId
          });
          if (r.ok) saleTouched = true;
        } else {
          r = await updateRentalDeliveryStatus(req, {
            tenantId,
            rentalId: id,
            deliveryLeg: item.deliveryLeg || 'pickup',
            deliveryStatus: item.deliveryStatus,
            deliveryAssignedTo: item.deliveryAssignedTo,
            hasAssignedDriverField: Object.prototype.hasOwnProperty.call(item || {}, 'deliveryAssignedTo'),
            userId,
          });
        }
        results.push({ entityType, id, ...r });
      } catch (err) {
        results.push({
          entityType,
          id,
          ok: false,
          message: err?.message || 'Update failed'
        });
      }
    }

    if (saleTouched) {
      invalidateSaleListCache(tenantId);
    }

    const allOk = results.every((r) => r.ok);
    return res.status(allOk ? 200 : 207).json({
      success: allOk,
      data: { results }
    });
  } catch (err) {
    next(err);
  }
};
