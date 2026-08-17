const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
  Job,
  Customer,
  User,
  Payment,
  Expense,
  ExpenseActivity,
  JobItem,
  Invoice,
  Quote,
  JobStatusHistory,
  MaterialMovement,
  MaterialItem,
  Lead,
  Setting,
  StudioLocation,
  Sale,
  PartnerCommission,
  StorefrontReview,
} = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { getPagination } = require('../utils/paginationUtils');
const { baseUploadDir } = require('../middleware/upload');
const activityLogger = require('../services/activityLogger');
const { createInvoiceRevenueJournal } = require('../services/invoiceAccountingService');
const { updateCustomerBalance } = require('../services/customerBalanceService');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const { invalidateInvoiceListCache, invalidateAfterMutation } = require('../middleware/cache');
const {
  applyStudioLocationFilter,
  attachStudioLocationToPayload,
} = require('../utils/studioLocationUtils');
const { parseDeliveryStatusInput } = require('../utils/deliveryStatus');
const {
  resolveJobCreatePaymentIntent,
  amountForInvoice,
  extractJobCreatePaymentBody,
} = require('../utils/jobCreatePayment');
const { getJobItemCategories, resolveMaterialStudioType } = require('../config/jobItemCategories');
const { getMaterialTypesForStudioType } = require('../config/studioTypes');
const { buildCustomerFacingJobTitle } = require('../utils/jobCustomerMessageText');
const { getTaxConfigForTenant } = require('../utils/taxConfig');
const { convertLineItemsFromTaxInclusive } = require('../utils/taxCalculation');
const { runReviewRequestAutomations, runJobCompletedAutomations } = require('../services/automationEngineService');

const jobWhere = (req, extra = {}) =>
  applyStudioLocationFilter(req, applyTenantFilter(req.tenantId, extra));

const WHATSAPP_TEMPLATE_CREATED = 'job_created';
const WHATSAPP_TEMPLATE_COMPLETED = 'job_completed';
const MONEY_TOLERANCE = 0.01;

const toMoneyNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round(toMoneyNumber(value) * 100) / 100;

const calculateJobItemTotalPrice = (item = {}) => {
  const quantity = Math.max(0, toMoneyNumber(item.quantity || 0));
  const unitPrice = Math.max(0, toMoneyNumber(item.unitPrice || 0));
  const lineGross = quantity * unitPrice;
  const discountAmount = Math.max(0, toMoneyNumber(item.discountAmount || 0));
  return roundMoney(Math.max(0, lineGross - Math.min(discountAmount, lineGross)));
};

const normalizeBillableJobItems = (items = []) =>
  (Array.isArray(items) ? items : []).map((item) => {
    const quantity = toMoneyNumber(item.quantity);
    const unitPrice = toMoneyNumber(item.unitPrice);
    const lineGross = quantity * unitPrice;
    const totalPrice = item.totalPrice != null
      ? toMoneyNumber(item.totalPrice)
      : lineGross;

    return {
      category: item.category || '',
      description: item.description || '',
      paperSize: item.paperSize || '',
      quantity,
      unitPrice,
      totalPrice: roundMoney(totalPrice),
    };
  });

const getBillableJobSignature = (jobLike) => JSON.stringify({
  finalPrice: roundMoney(jobLike?.finalPrice || 0),
  items: normalizeBillableJobItems(jobLike?.items || []),
});

const hasBillableJobChange = ({ currentJob, updatePayload, incomingItems }) => {
  if (updatePayload.finalPrice !== undefined) {
    const currentFinalPrice = roundMoney(currentJob.finalPrice || 0);
    const nextFinalPrice = roundMoney(updatePayload.finalPrice || 0);
    if (Math.abs(currentFinalPrice - nextFinalPrice) > MONEY_TOLERANCE) {
      return true;
    }
  }

  if (!Array.isArray(incomingItems)) {
    return false;
  }

  const proposedJob = {
    ...currentJob.get({ plain: true }),
    ...updatePayload,
    items: incomingItems.map((item) => ({
      ...sanitizePayload(item),
      totalPrice: calculateJobItemTotalPrice(item),
    })),
  };

  return getBillableJobSignature(currentJob) !== getBillableJobSignature(proposedJob);
};

/**
 * Normalize job item fields used for equality checks during update sync.
 * @param {object} item
 * @returns {object}
 */
const normalizeJobItemForCompare = (item = {}) => ({
  category: String(item.category || ''),
  description: String(item.description || ''),
  paperSize: String(item.paperSize || ''),
  quantity: toMoneyNumber(item.quantity),
  unitPrice: roundMoney(item.unitPrice),
  totalPrice: roundMoney(
    item.totalPrice != null ? item.totalPrice : calculateJobItemTotalPrice(item)
  ),
  quoteItemId: item.quoteItemId || null,
  specifications: JSON.stringify(item.specifications || {}),
});

/**
 * True when existing rows match incoming payload (same ids + comparable fields).
 * @param {object[]} existingItems
 * @param {object[]} preparedIncoming
 * @returns {boolean}
 */
const jobItemsUnchanged = (existingItems, preparedIncoming) => {
  const existing = Array.isArray(existingItems) ? existingItems : [];
  if (existing.length !== preparedIncoming.length) return false;

  const byId = new Map(existing.map((row) => [row.id, row]));
  const usedIds = new Set();

  for (const item of preparedIncoming) {
    if (!item.id || !byId.has(item.id)) return false;
    usedIds.add(item.id);
    const existingRow = byId.get(item.id);
    if (
      JSON.stringify(normalizeJobItemForCompare(existingRow)) !==
      JSON.stringify(normalizeJobItemForCompare(item))
    ) {
      return false;
    }
  }

  return usedIds.size === byId.size;
};

/**
 * Diff/upsert job items instead of destroy-all + bulkCreate.
 * @param {{ jobId: string, tenantId: string, existingItems: object[], incomingItems: object[], transaction: import('sequelize').Transaction }} args
 * @returns {Promise<boolean>} whether any item row was written
 */
const syncJobItemsForUpdate = async ({
  jobId,
  tenantId,
  existingItems,
  incomingItems,
  transaction,
}) => {
  const existing = Array.isArray(existingItems) ? existingItems : [];
  const prepared = (Array.isArray(incomingItems) ? incomingItems : []).map((item) => {
    const sanitized = sanitizePayload(item);
    delete sanitized.createdAt;
    delete sanitized.updatedAt;
    delete sanitized.jobId;
    delete sanitized.tenantId;
    return {
      ...sanitized,
      jobId,
      tenantId,
      totalPrice: calculateJobItemTotalPrice(item),
    };
  });

  if (jobItemsUnchanged(existing, prepared)) {
    return false;
  }

  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keepIds = new Set();
  const toCreate = [];
  const toUpdate = [];

  for (const item of prepared) {
    if (item.id && existingById.has(item.id)) {
      keepIds.add(item.id);
      const existingRow = existingById.get(item.id);
      if (
        JSON.stringify(normalizeJobItemForCompare(existingRow)) !==
        JSON.stringify(normalizeJobItemForCompare(item))
      ) {
        toUpdate.push(item);
      }
    } else {
      const { id: _unusedId, ...rest } = item;
      toCreate.push(rest);
    }
  }

  const deleteIds = existing.map((row) => row.id).filter((id) => !keepIds.has(id));
  if (deleteIds.length > 0) {
    await JobItem.destroy({
      where: { id: { [Op.in]: deleteIds }, jobId, tenantId },
      transaction,
    });
  }

  for (const item of toUpdate) {
    const { id, jobId: _jobId, tenantId: _tenantId, createdAt, updatedAt, ...fields } = item;
    await JobItem.update(fields, {
      where: { id, jobId, tenantId },
      transaction,
    });
  }

  if (toCreate.length > 0) {
    await JobItem.bulkCreate(toCreate, { transaction });
  }

  return true;
};

const isInvoicePaymentLocked = (invoice) =>
  ['paid', 'partial'].includes(invoice.status) || toMoneyNumber(invoice.amountPaid || 0) > 0;

const buildInvoicePayloadFromJob = ({ job, taxRate = 0, pricesAreTaxInclusive = false }) => {
  const jobItems = Array.isArray(job.items) ? job.items : [];
  let subtotal = 0;
  let invoiceItems = [];
  let totalItemDiscount = 0;

  if (jobItems.length > 0) {
    invoiceItems = jobItems.map((item) => {
      const quantity = toMoneyNumber(item.quantity);
      const unitPrice = toMoneyNumber(item.unitPrice);
      const lineGross = quantity * unitPrice;
      const storedTotal = item.totalPrice != null ? toMoneyNumber(item.totalPrice) : lineGross;
      const explicitDiscount = toMoneyNumber(item.discountAmount || 0);
      const derivedDiscount = Math.max(0, lineGross - storedTotal);
      const lineDiscount = explicitDiscount > 0 ? explicitDiscount : derivedDiscount;

      return {
        description: item.description || item.category,
        category: item.category,
        paperSize: item.paperSize,
        quantity,
        unitPrice,
        discountAmount: roundMoney(lineDiscount),
        discountPercent: toMoneyNumber(item.discountPercent || 0),
        discountReason: item.discountReason || (lineDiscount > 0 ? 'Discount from job line' : null),
        total: roundMoney(lineGross - lineDiscount),
      };
    });
    subtotal = invoiceItems.reduce(
      (sum, item) => sum + (toMoneyNumber(item.quantity) * toMoneyNumber(item.unitPrice)),
      0
    );
    totalItemDiscount = invoiceItems.reduce((sum, item) => sum + toMoneyNumber(item.discountAmount || 0), 0);
  } else {
    subtotal = toMoneyNumber(job.finalPrice || 0);
    invoiceItems = [{
      description: job.title,
      quantity: 1,
      unitPrice: roundMoney(subtotal),
      total: roundMoney(subtotal),
    }];
  }

  if (pricesAreTaxInclusive && taxRate > 0) {
    const converted = convertLineItemsFromTaxInclusive(invoiceItems, taxRate);
    invoiceItems = converted.items;
    subtotal = converted.subtotal;
    totalItemDiscount = converted.discountTotal ?? invoiceItems.reduce(
      (sum, item) => sum + toMoneyNumber(item.discountAmount || 0),
      0
    );
  }

  const comparableFinalPrice = pricesAreTaxInclusive && taxRate > 0
    ? roundMoney(toMoneyNumber(job.finalPrice || 0) / (1 + taxRate / 100))
    : toMoneyNumber(job.finalPrice || 0);
  const jobLevelDiscountFallback = Math.max(0, toMoneyNumber(subtotal) - comparableFinalPrice);
  const effectiveDiscount = totalItemDiscount > 0 ? totalItemDiscount : jobLevelDiscountFallback;

  return {
    customerId: job.customerId,
    studioLocationId: job.studioLocationId || null,
    sourceType: 'job',
    subtotal: roundMoney(subtotal),
    taxRate,
    discountType: 'fixed',
    discountValue: roundMoney(effectiveDiscount),
    discountAmount: roundMoney(effectiveDiscount),
    discountReason: effectiveDiscount > 0
      ? (invoiceItems.find((item) => item.discountReason)?.discountReason || 'Discounts from job')
      : null,
    items: invoiceItems,
  };
};

const syncEditableInvoicesForJob = async ({ job, invoices, tenantId, transaction }) => {
  const activeInvoices = (invoices || []).filter((invoice) => invoice.status !== 'cancelled');
  if (activeInvoices.length === 0) {
    return [];
  }

  const taxConfig = await getTaxConfigForTenant(tenantId);
  const syncedInvoices = [];

  for (const invoice of activeInvoices) {
    if (isInvoicePaymentLocked(invoice)) {
      const error = new Error(
        `Cannot update job price because invoice ${invoice.invoiceNumber || invoice.id} already has payments. Update the invoice manually or create an adjustment.`
      );
      error.statusCode = 400;
      throw error;
    }

    const taxRate = toMoneyNumber(invoice.taxRate || 0);
    const pricesAreTaxInclusive = taxConfig.enabled && taxConfig.pricesAreTaxInclusive && taxRate > 0;
    const payload = buildInvoicePayloadFromJob({
      job,
      taxRate,
      pricesAreTaxInclusive,
    });

    await invoice.update(payload, { transaction });
    syncedInvoices.push(invoice);
  }

  return syncedInvoices;
};

const sendJobLifecycleWhatsApp = async ({ tenantId, job, eventType }) => {
  try {
    const { isChannelEnabledForEvent } = require('../services/messageDeliveryRulesService');
    const ruleEventKey = eventType === 'completed' ? 'job_completed' : 'order_status';
    const whatsappAllowed = await isChannelEnabledForEvent(tenantId, ruleEventKey, 'whatsapp');
    if (!whatsappAllowed) return;

    const whatsappService = require('../services/whatsappService');
    const config = await whatsappService.getConfig(tenantId);
    if (!config || !job?.customer?.phone) return;

    const phoneNumber = whatsappService.validatePhoneNumber(job.customer.phone);
    if (!phoneNumber) return;

    const customerName = job.customer?.name || job.customer?.company || 'Customer';
    const jobNumber = job.jobNumber || 'N/A';
    const plain = typeof job?.toJSON === 'function' ? job.toJSON() : job;
    const jobTitle = buildCustomerFacingJobTitle(plain);

    const preferredLanguage = typeof config?.templateLanguage === 'string' && config.templateLanguage.trim()
      ? config.templateLanguage.trim()
      : 'en_US';
    const alternateLanguage = preferredLanguage === 'en_US' ? 'en' : 'en_US';

    const sendWithLanguageFallback = async (templateName, templateParams, options) => {
      const firstAttempt = await whatsappService.sendMessage(
        tenantId,
        phoneNumber,
        templateName,
        templateParams,
        preferredLanguage,
        options
      );
      if (firstAttempt?.success || firstAttempt?.meta?.metaCode !== 132001) {
        return firstAttempt;
      }
      return whatsappService.sendMessage(
        tenantId,
        phoneNumber,
        templateName,
        templateParams,
        alternateLanguage,
        options
      );
    };

    if (eventType === 'created') {
      const { ensureJobViewToken } = require('../services/jobCustomerTrackingService');
      const viewToken = await ensureJobViewToken(job.id, tenantId);
      const trackingPathParam = viewToken ? `track-job/${viewToken}` : null;
      let createdResult = await sendWithLanguageFallback(
        WHATSAPP_TEMPLATE_CREATED,
        [
          { name: 'customer_name', text: customerName },
          { name: 'job_id', text: jobNumber },
          { name: 'job_title', text: jobTitle }
        ],
        trackingPathParam ? { buttonParameters: [trackingPathParam], buttonIndex: 0 } : undefined
      );

      if (
        !createdResult?.success &&
        createdResult?.meta?.metaCode === 132018 &&
        /does not require parameters/i.test(createdResult?.meta?.errorBodyPreview || '')
      ) {
        createdResult = await sendWithLanguageFallback(
          WHATSAPP_TEMPLATE_CREATED,
          [
            { name: 'customer_name', text: customerName },
            { name: 'job_id', text: jobNumber },
            { name: 'job_title', text: jobTitle }
          ]
        );
      }
      return;
    }

    if (eventType === 'completed') {
      await sendWithLanguageFallback(
        WHATSAPP_TEMPLATE_COMPLETED,
        [
          { name: 'customer_name', text: customerName },
          { name: 'job_id', text: jobNumber },
          { name: 'job_title', text: jobTitle }
        ]
      );
    }
  } catch (error) {
    console.error('[Job] WhatsApp lifecycle message error:', error?.message || error);
  }
};

// Generate unique job number with transaction support for advisory locks
const generateJobNumber = async (tenantId, transaction = null) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  try {
    // Use advisory lock if we have a transaction to prevent race conditions
    if (transaction) {
      const lockId = `job_number_${tenantId}_${year}${month}`.replace(/-/g, '_').substring(0, 63);
      const [lockHash] = await sequelize.query(
        `SELECT hashtext(:lockId) as lock_hash`,
        {
          replacements: { lockId },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      const lockKey = Math.abs(lockHash?.lock_hash || 0);
      
      // Acquire advisory lock (blocks until available, releases on transaction commit/rollback)
      await sequelize.query(`SELECT pg_advisory_xact_lock(:lockKey)`, {
        replacements: { lockKey },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });
    }
    
    // Query for max sequence (advisory lock ensures no race conditions)
    // Use a simpler query that definitely finds existing jobs
    const queryResults = await sequelize.query(
      `SELECT "jobNumber",
              CAST(SPLIT_PART("jobNumber", '-', 3) AS INTEGER) as sequence
       FROM "jobs" 
       WHERE "tenantId" = :tenantId 
         AND "jobNumber" LIKE :pattern
         AND SPLIT_PART("jobNumber", '-', 3) ~ '^[0-9]+$'
       ORDER BY CAST(SPLIT_PART("jobNumber", '-', 3) AS INTEGER) DESC
       LIMIT 1`,
      {
        replacements: {
          tenantId: tenantId,
          pattern: `JOB-${year}${month}-%`
        },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );
    
    console.log(`[JobNumber] Query results for pattern JOB-${year}${month}-%:`, queryResults);
    console.log(`[JobNumber] Query results type:`, typeof queryResults, 'isArray:', Array.isArray(queryResults));
    
    let sequence = 1;
    // Handle both array and single object results from sequelize.query
    let result = null;
    if (Array.isArray(queryResults) && queryResults.length > 0) {
      result = queryResults[0];
    } else if (queryResults && typeof queryResults === 'object' && queryResults.sequence !== undefined) {
      // Handle case where query returns a single object instead of array
      result = queryResults;
    }
    
    if (result && result.sequence !== null && result.sequence !== undefined) {
      const maxSequence = parseInt(result.sequence, 10);
      if (!isNaN(maxSequence) && maxSequence >= 1) {
        sequence = maxSequence + 1;
        console.log(`[JobNumber] ✅ Found max sequence: ${maxSequence}, generating next: ${sequence}`);
      } else {
        console.log(`[JobNumber] ⚠️ Invalid sequence value: ${result.sequence}, starting at 1`);
      }
    } else {
      console.log(`[JobNumber] ℹ️ No existing jobs found for pattern JOB-${year}${month}-%, starting at 1`);
    }

    const generatedNumber = `JOB-${year}${month}-${String(sequence).padStart(4, '0')}`;
    console.log(`[JobNumber] Generated: ${generatedNumber} for tenant: ${tenantId}`);
    
    return generatedNumber;
  } catch (error) {
    console.error(`[JobNumber] Error with advisory lock, using fallback query:`, error.message);
    // Fallback to simple MAX query without transaction to ensure we see all committed jobs
    try {
      const fallbackResults = await sequelize.query(
        `SELECT MAX(CAST(SPLIT_PART("jobNumber", '-', 3) AS INTEGER)) as max_sequence
         FROM "jobs" 
         WHERE "tenantId" = :tenantId 
           AND "jobNumber" LIKE :pattern
           AND SPLIT_PART("jobNumber", '-', 3) ~ '^[0-9]+$'`,
        {
          replacements: {
            tenantId: tenantId,
            pattern: `JOB-${year}${month}-%`
          },
          type: sequelize.QueryTypes.SELECT
          // No transaction - query committed data directly
        }
      );
      
      let sequence = 1;
      if (fallbackResults && Array.isArray(fallbackResults) && fallbackResults.length > 0) {
        const result = fallbackResults[0];
        if (result?.max_sequence !== null && result?.max_sequence !== undefined) {
          const maxSeq = parseInt(result.max_sequence, 10);
          if (!isNaN(maxSeq) && maxSeq >= 1) {
            sequence = maxSeq + 1;
            console.log(`[JobNumber] Fallback found max sequence: ${maxSeq}, generating: ${sequence}`);
          }
        }
      }
      
      return `JOB-${year}${month}-${String(sequence).padStart(4, '0')}`;
    } catch (fallbackError) {
      console.error(`[JobNumber] Fallback query also failed:`, fallbackError);
      // Last resort - just use timestamp-based to ensure uniqueness
      const timestamp = Date.now().toString().slice(-6);
      return `JOB-${year}${month}-${timestamp}`;
    }
  }
};

// Generate unique invoice number
const generateInvoiceNumber = async (tenantId) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  const lastInvoice = await Invoice.findOne({
    where: {
      tenantId,
      invoiceNumber: {
        [Op.like]: `INV-${year}${month}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastInvoice) {
    const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-').pop());
    sequence = lastSequence + 1;
  }

  return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

// Helper function to automatically create invoice for completed job
const autoCreateInvoice = async (jobId, tenantId) => {
  try {
    console.log(`[AutoInvoice] Starting invoice creation for jobId: ${jobId}, tenantId: ${tenantId}`);
    
    // Check if invoice already exists for this job
    const existingInvoice = await Invoice.findOne({ where: applyTenantFilter(tenantId, { jobId }) });
    if (existingInvoice) {
      console.log(`[AutoInvoice] Invoice already exists for job ${jobId}, skipping creation`);
      return null; // Invoice already exists, skip creation
    }

    // Fetch job with items
    const job = await Job.findOne({
      where: applyTenantFilter(tenantId, { id: jobId }),
      include: [
        {
          model: JobItem,
          as: 'items'
        },
        {
          model: Customer,
          as: 'customer'
        }
      ]
    });

    if (!job) {
      console.log(`[AutoInvoice] Job ${jobId} not found, cannot create invoice`);
      return null;
    }
    
    console.log(`[AutoInvoice] Job found: ${job.jobNumber}, items: ${job.items?.length || 0}, finalPrice: ${job.finalPrice}`);

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(tenantId);

    // Calculate subtotal from job items or finalPrice
    let subtotal = 0;
    let items = [];

    if (job.items && job.items.length > 0) {
      items = job.items.map(item => {
        const itemSubtotal = parseFloat(item.quantity) * parseFloat(item.unitPrice);
        const storedTotal = parseFloat(item.totalPrice || itemSubtotal || 0);
        const explicitDiscount = parseFloat(item.discountAmount || 0);
        // Some flows persist only discounted line total (totalPrice) without explicit discount fields.
        // Derive discount from gross-vs-stored totals so quote discounts survive invoice generation.
        const derivedDiscount = Math.max(0, itemSubtotal - storedTotal);
        const itemDiscount = explicitDiscount > 0 ? explicitDiscount : derivedDiscount;
        return {
          description: item.description || item.category,
          category: item.category,
          paperSize: item.paperSize,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          discountAmount: itemDiscount,
          discountPercent: parseFloat(item.discountPercent || 0),
          discountReason: item.discountReason || (itemDiscount > 0 ? 'Discount from quote' : null),
          total: itemSubtotal - itemDiscount
        };
      });
      subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0);
      
      // Calculate total discount from all items; fallback to job-level finalPrice delta
      // when item-level discount fields are unavailable.
      const totalItemDiscount = items.reduce((sum, item) => sum + parseFloat(item.discountAmount || 0), 0);
      const jobLevelDiscountFallback = Math.max(
        0,
        (parseFloat(subtotal || 0) - parseFloat(job.finalPrice || 0))
      );
      const totalDiscount = totalItemDiscount > 0 ? totalItemDiscount : jobLevelDiscountFallback;
      console.log(
        `[AutoInvoice] Items processed: ${items.length}, subtotal: ${subtotal}, totalItemDiscount: ${totalItemDiscount}, jobLevelDiscountFallback: ${jobLevelDiscountFallback}`
      );
      
      // If there are discounts, set invoice-level discount
      if (totalDiscount > 0) {
        console.log(`[AutoInvoice] Creating invoice with discounts: ${totalDiscount}`);
        const invoice = await Invoice.create({
          invoiceNumber,
          jobId,
          customerId: job.customerId,
          tenantId,
          studioLocationId: job.studioLocationId || null,
          sourceType: 'job', // Set source type for business type filtering
          invoiceDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subtotal,
          taxRate: 0,
          discountType: 'fixed',
          discountValue: totalDiscount,
          discountAmount: totalDiscount,
          discountReason: items.find(i => i.discountReason)?.discountReason || 'Item discounts applied',
          paymentTerms: 'Net 30',
          items,
          notes: null,
          termsAndConditions: 'Payment is due within the specified payment terms. Late payments may incur additional charges.'
        });

        // Send webhook to Sabito (async, don't block)
        try {
          const sabitoWebhookService = require('../services/sabitoWebhookService');
          const customer = job.customer;
          
          if (customer && customer.sabitoCustomerId) {
            sabitoWebhookService.sendInvoiceWebhook(invoice, customer, tenantId)
              .then(async (result) => {
                if (result.success) {
                  await invoice.update({
                    sabitoProjectId: result.projectId,
                    sabitoSyncedAt: new Date(),
                    sabitoSyncStatus: 'synced'
                  });
                } else if (result.skipped) {
                  await invoice.update({
                    sabitoSyncStatus: 'skipped'
                  });
                }
              })
              .catch(async (error) => {
                console.error('Failed to send Sabito webhook for auto-generated invoice:', error);
                await invoice.update({
                  sabitoSyncStatus: 'failed',
                  sabitoSyncError: error.message
                });
              });
          }
        } catch (error) {
          console.error('Error sending Sabito webhook for auto-generated invoice:', error);
        }

        return invoice;
      } else {
        console.log(`[AutoInvoice] Items exist but no discounts, will create invoice without discounts`);
      }
    } else {
      // If no items, use finalPrice from job
      console.log(`[AutoInvoice] No items found, using finalPrice: ${job.finalPrice}`);
      subtotal = parseFloat(job.finalPrice || 0);
      items = [{
        description: job.title,
        quantity: 1,
        unitPrice: subtotal,
        total: subtotal
      }];
    }

    // Create invoice without discounts (regular flow) - runs for items without discounts OR no items
    console.log(`[AutoInvoice] Creating invoice with subtotal: ${subtotal}, items count: ${items.length}`);
    const invoice = await Invoice.create({
      invoiceNumber,
      jobId,
      customerId: job.customerId,
      tenantId,
      studioLocationId: job.studioLocationId || null,
      sourceType: 'job', // Set source type for business type filtering
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
      subtotal,
      totalAmount: subtotal,
      taxRate: 0,
      discountType: 'fixed',
      discountValue: 0,
      discountAmount: 0,
      paymentTerms: 'Net 30',
      items,
      notes: null,
      termsAndConditions: 'Payment is due within the specified payment terms. Late payments may incur additional charges.'
    });

    try {
      await createInvoiceRevenueJournal(invoice);
    } catch (journalError) {
      console.error('[AutoInvoice] Failed to create accounting revenue entry:', journalError?.message);
    }

    console.log(`[AutoInvoice] ✅ Invoice created successfully: ${invoice.invoiceNumber} (ID: ${invoice.id})`);

    // Send webhook to Sabito (async, don't block)
    try {
      const sabitoWebhookService = require('../services/sabitoWebhookService');
      const customer = job.customer;
      
      if (customer && customer.sabitoCustomerId) {
        sabitoWebhookService.sendInvoiceWebhook(invoice, customer, tenantId)
          .then(async (result) => {
            if (result.success) {
              await invoice.update({
                sabitoProjectId: result.projectId,
                sabitoSyncedAt: new Date(),
                sabitoSyncStatus: 'synced'
              });
            } else if (result.skipped) {
              await invoice.update({
                sabitoSyncStatus: 'skipped'
              });
            }
          })
          .catch(async (error) => {
            console.error('Failed to send Sabito webhook for auto-generated invoice:', error);
            await invoice.update({
              sabitoSyncStatus: 'failed',
              sabitoSyncError: error.message
            });
          });
      }
    } catch (error) {
      console.error('Error sending Sabito webhook for auto-generated invoice:', error);
    }

    return invoice;
  } catch (error) {
    console.error('Error auto-creating invoice:', error);
    return null;
  }
};

/**
 * Record job-create payment on the auto-created invoice (Payment row + journals + thank-you).
 * @param {{ tenantId: string, userId?: string|null, invoice: object, paymentIntent: object }} params
 * @returns {Promise<{ invoice: object, skipPaidReceipt: boolean, payment: object|null }>}
 */
async function applyJobCreatePaymentToInvoice({ tenantId, userId = null, invoice, paymentIntent }) {
  if (!invoice || !paymentIntent || paymentIntent.status === 'unpaid' || !paymentIntent.ok) {
    return { invoice, skipPaidReceipt: false, payment: null };
  }
  const mapped = amountForInvoice(paymentIntent, invoice.totalAmount);
  if (!mapped) {
    return { invoice, skipPaidReceipt: false, payment: null };
  }
  try {
    const { applyInvoicePaymentInternal } = require('./invoiceController');
    const result = await applyInvoicePaymentInternal({
      tenantId,
      userId,
      invoice,
      amount: mapped.amount,
      paymentMethod: paymentIntent.paymentMethod,
      paymentDate: paymentIntent.paymentDate,
      referenceNumber: paymentIntent.referenceNumber,
      notes: paymentIntent.notes,
    });
    return {
      invoice: result.invoice || invoice,
      skipPaidReceipt: true,
      payment: result.payment || null,
    };
  } catch (err) {
    console.error('[Job] apply create payment failed:', err?.message || err);
    return { invoice, skipPaidReceipt: false, payment: null };
  }
}

exports.applyJobCreatePaymentToInvoice = applyJobCreatePaymentToInvoice;

/**
 * If tenant enabled auto-send, mark invoice sent and notify customer; log invoice sent for the team.
 * @param {string} tenantId
 * @param {object} invoice
 * @param {string|null} userId
 * @param {{ skipPaidReceipt?: boolean }} [options]
 */
async function maybeAutoSendInvoiceOnJobCreation(tenantId, invoice, userId, options = {}) {
  if (!invoice?.id || !tenantId) return;
  const {
    TEMPLATE_KEYS,
    isCustomerNotificationEffectiveEnabled,
  } = require('../services/customerNotificationBridgeService');
  const row = await Setting.findOne({ where: { tenantId, key: 'job-invoice' } });
  const settingOn = row?.value?.autoSendInvoiceOnJobCreation === true;
  const effective = await isCustomerNotificationEffectiveEnabled(tenantId, {
    settingEnabled: settingOn,
    templateKey: TEMPLATE_KEYS.JOB_CREATED_SEND_INVOICE,
  });
  if (!effective) {
    return;
  }
  try {
    const { sendInvoiceToCustomer } = require('./invoiceController');
    await sendInvoiceToCustomer(tenantId, invoice, {
      forceCustomerChannels: true,
      userId: userId || null,
      deliverySource: 'job_creation_auto_send',
      skipPaidReceipt: options.skipPaidReceipt === true,
    });
    const sentInvoice = await Invoice.findOne({
      where: applyTenantFilter(tenantId, { id: invoice.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: Job, as: 'job', attributes: ['id', 'createdBy', 'assignedTo'], required: false }
      ]
    });
    if (sentInvoice) {
      try {
        await activityLogger.logInvoiceSent(sentInvoice, userId || null);
      } catch (logErr) {
        console.error('[Job] logInvoiceSent after auto-send on job creation failed:', logErr?.message);
      }
    }
  } catch (e) {
    console.error('[Job] Auto-send invoice on job creation failed:', e?.message);
  }
}

// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Private
// @desc    Get job item categories for current tenant (based on studio type)
// @route   GET /api/jobs/categories
// @access  Private
exports.getJobCategories = async (req, res, next) => {
  try {
    const tenant = req.tenant || (req.tenantMembership && await req.tenantMembership.getTenant());
    const businessType = tenant?.businessType || 'printing_press';
    const metadata = { ...(tenant?.metadata || {}) };

    if (req.studioLocationFilterId) {
      const location = await StudioLocation.findOne({
        where: {
          id: req.studioLocationFilterId,
          tenantId: req.tenantId,
          isActive: true,
        },
        attributes: ['id', 'studioType'],
      });
      if (location?.studioType) {
        // Branch studioType is the source of truth for this request's catalog.
        // Keep businessSubType as fallback only when location has no type.
        metadata.studioType = location.studioType;
        metadata.businessSubType = location.studioType;
      }
    }

    const categories = getJobItemCategories(businessType, metadata);
    const materialStudioType = resolveMaterialStudioType(businessType, metadata);
    const materialTypes = getMaterialTypesForStudioType(materialStudioType);

    res.status(200).json({
      success: true,
      data: categories,
      materialTypes
    });
  } catch (error) {
    next(error);
  }
};

exports.getJobs = async (req, res, next) => {
  try {
    // Ensure tenantId is available (set by tenantContext middleware)
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    const { page, limit, offset } = getPagination(req);
    const search = req.query.search || '';
    const status = req.query.status;
    const customerId = req.query.customerId;
    const assignedTo = req.query.assignedTo;
    const priority = req.query.priority;
    const dueDateFilter = req.query.dueDate;

    // Start with tenant filter - CRITICAL for data isolation
    let where = jobWhere(req, {});
    
    if (search) {
      where[Op.or] = [
        { jobNumber: { [Op.iLike]: `%${search}%` } },
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (status) {
      where.status = status;
    }
    if (customerId) {
      where.customerId = customerId;
    }
    if (assignedTo) {
      where.assignedTo = assignedTo;
    }
    if (priority) {
      where.priority = priority;
    }
    if (dueDateFilter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      if (dueDateFilter === 'overdue') {
        where.dueDate = { [Op.lt]: today };
      } else if (dueDateFilter === 'today') {
        where.dueDate = { [Op.between]: [today, tomorrow] };
      } else if (dueDateFilter === 'this_week') {
        where.dueDate = { [Op.between]: [today, nextWeek] };
      }
    }

    const { count, rows } = await Job.findAndCountAll({
      where,
      // Omit description on list — large text; full job (incl. description) from GET /api/jobs/:id
      attributes: [
        'id',
        'jobNumber',
        'title',
        'status',
        'priority',
        'finalPrice',
        'dueDate',
        'customerId',
        'assignedTo',
        'createdBy',
        'createdAt',
        'updatedAt'
      ],
      limit,
      offset,
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Quote, as: 'quote', attributes: ['id', 'quoteNumber', 'status', 'title'] }
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

// @desc    Export jobs to CSV
// @route   GET /api/jobs/export
// @access  Private (admin, manager)
exports.exportJobs = async (req, res, next) => {
  try {
    const { sendCSV, COLUMN_DEFINITIONS } = require('../utils/dataExport');
    const where = jobWhere(req, {});

    const jobs = await Job.findAll({
      where,
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
      raw: false,
    });
    const rows = jobs.map((j) => {
      const plain = j.get({ plain: true });
      return { ...plain, customer: plain.customer || {}, assignedUser: plain.assignedUser || {} };
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No jobs to export' });
    }

    const filename = `jobs_${new Date().toISOString().split('T')[0]}`;
    sendCSV(res, rows, `${filename}.csv`, COLUMN_DEFINITIONS.jobs);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
// @access  Private
exports.getJob = async (req, res, next) => {
  try {
    const job = await Job.findOne({
      where: jobWhere(req, { id: req.params.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        {
          model: JobStatusHistory,
          as: 'statusHistory',
          include: [{ model: User, as: 'changedByUser', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'ASC']]
        },
        { model: Payment, as: 'payments' },
        { model: Expense, as: 'expenses' },
        { model: JobItem, as: 'items' }
      ],
      order: [[{ model: JobStatusHistory, as: 'statusHistory' }, 'createdAt', 'ASC']]
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (!Array.isArray(job.attachments)) {
      job.attachments = [];
    }

    res.status(200).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new job
// @route   POST /api/jobs
// @access  Private
exports.createJob = async (req, res, next) => {
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    // Use a transaction to ensure atomicity for each retry attempt
    let transaction = await sequelize.transaction();
    
    try {
      const { items, ...rawJobData } = req.body;
      const { paymentBody, rest: sanitizedJobData } = extractJobCreatePaymentBody(sanitizePayload(rawJobData));
      const jobData = sanitizedJobData;

      if (jobData.deliveryStatus !== undefined) {
        const parsed = parseDeliveryStatusInput(jobData.deliveryStatus);
        if (parsed === undefined) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Invalid deliveryStatus'
          });
        }
        jobData.deliveryStatus = parsed;
      }

      if (jobData.deliveryRequired !== undefined) {
        jobData.deliveryRequired = Boolean(jobData.deliveryRequired);
      } else {
        jobData.deliveryRequired = !!jobData.deliveryStatus;
      }
      if (!jobData.deliveryRequired) {
        jobData.deliveryStatus = null;
      }

      // Generate job number INSIDE the transaction with advisory lock
      // This ensures no race conditions - the lock serializes job number generation
      const jobNumber = await generateJobNumber(req.tenantId, transaction);
      
      if (req.user?.id) {
        jobData.createdBy = req.user.id;
      }
      
      // If status is completed, set completion date
      if (jobData.status === 'completed') {
        jobData.completionDate = new Date();
      }
      if (jobData.status === 'in_progress' && !jobData.startDate) {
        jobData.startDate = new Date();
      }

      const itemsTotal = Array.isArray(items)
        ? items.reduce((sum, item) => sum + calculateJobItemTotalPrice(item), 0)
        : 0;
      const jobTotal = roundMoney(jobData.finalPrice != null && jobData.finalPrice !== '' ? jobData.finalPrice : itemsTotal);
      const paymentIntent = resolveJobCreatePaymentIntent(paymentBody, { jobTotal });
      if (!paymentIntent.ok) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: paymentIntent.error,
        });
      }

      const job = await Job.create(
        attachStudioLocationToPayload(req, {
          ...jobData,
          tenantId: req.tenantId,
          jobNumber,
        }),
        { transaction }
      );

      // Create job items if provided
      if (items && Array.isArray(items) && items.length > 0) {
        const jobItems = items.map(item => ({
          ...sanitizePayload(item),
          jobId: job.id,
          tenantId: req.tenantId,
          totalPrice: calculateJobItemTotalPrice(item)
        }));
        await JobItem.bulkCreate(jobItems, { transaction });
      }

      await JobStatusHistory.create({
        jobId: job.id,
        tenantId: req.tenantId,
        status: job.status,
        comment: 'Job created',
        changedBy: req.user?.id || null
      }, { transaction });
      
      // Commit transaction before auto-creating invoice (invoice creation is separate)
      await transaction.commit();
      
      const jobWithDetails = await Job.findOne({
        where: applyTenantFilter(req.tenantId, { id: job.id }),
        include: [
          { model: Customer, as: 'customer' },
          { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
          { model: Quote, as: 'quote', attributes: ['id', 'quoteNumber', 'status', 'title'] },
          {
            model: JobStatusHistory,
            as: 'statusHistory',
            include: [{ model: User, as: 'changedByUser', attributes: ['id', 'name', 'email'] }],
            order: [['createdAt', 'ASC']]
          },
          { model: JobItem, as: 'items' }
        ],
        order: [[{ model: JobStatusHistory, as: 'statusHistory' }, 'createdAt', 'ASC']]
      });

      if (!Array.isArray(jobWithDetails.attachments)) {
        jobWithDetails.attachments = [];
      }

      try {
        await activityLogger.logJobCreated(jobWithDetails, req.user?.id || null);
      } catch (logErr) {
        console.error('[CreateJob] logJobCreated failed:', logErr?.message);
      }

      if (jobWithDetails.assignedTo) {
        await activityLogger.logJobAssigned(jobWithDetails, req.user?.id || null);
      }

      if (jobWithDetails.assignedTo && jobWithDetails.assignedUser?.email) {
        const { sendJobAssignedEmailToAssignee } = require('../services/jobAssigneeEmailService');
        sendJobAssignedEmailToAssignee({
          tenantId: req.tenantId,
          job: jobWithDetails,
          assignee: jobWithDetails.assignedUser,
          assignedByUser: req.user || null
        });
      }

      if (jobWithDetails.assignedTo) {
        setImmediate(async () => {
          try {
            const { runJobAssignedStaffAutomations, runJobCreatedStaffAutomations } = require('../services/automationEngineService');
            await runJobAssignedStaffAutomations({
              tenantId: req.tenantId,
              job: jobWithDetails,
              assignee: jobWithDetails.assignedUser || null,
              customer: jobWithDetails.customer || null,
              assignedByUser: req.user || null,
              actorUserId: req.user?.id || null,
            });
            await runJobCreatedStaffAutomations({
              tenantId: req.tenantId,
              job: jobWithDetails,
              customer: jobWithDetails.customer || null,
              actorUserId: req.user?.id || null,
            });
          } catch (automationErr) {
            console.error('[CreateJob] staff automations failed:', automationErr?.message || automationErr);
          }
        });
      } else {
        setImmediate(async () => {
          try {
            const { runJobCreatedStaffAutomations } = require('../services/automationEngineService');
            await runJobCreatedStaffAutomations({
              tenantId: req.tenantId,
              job: jobWithDetails,
              customer: jobWithDetails.customer || null,
              actorUserId: req.user?.id || null,
            });
          } catch (automationErr) {
            console.error('[CreateJob] job_created_staff automations failed:', automationErr?.message || automationErr);
          }
        });
      }

      const response = {
        success: true,
        data: jobWithDetails,
        invoice: {
          queued: true,
          message: 'Invoice generation is processing in the background'
        }
      };

      res.status(201).json(response);

      // Messaging + invoice after response so job creation never waits on integrations.
      setImmediate(async () => {
        try {
          await sendJobLifecycleWhatsApp({
            tenantId: req.tenantId,
            job: jobWithDetails,
            eventType: 'created'
          });
        } catch (whatsAppErr) {
          console.error('[CreateJob] Lifecycle WhatsApp failed:', whatsAppErr?.message || whatsAppErr);
        }

        try {
          const { maybeSendJobTrackingNotificationsOnJobCreated } = require('../services/jobCustomerTrackingService');
          await maybeSendJobTrackingNotificationsOnJobCreated({
            tenantId: req.tenantId,
            jobId: jobWithDetails.id,
            triggeredByUserId: req.user?.id || null
          });
        } catch (trackNotifyErr) {
          console.error('[CreateJob] Job tracking notification failed:', trackNotifyErr?.message);
        }

        try {
          console.log(`[CreateJob] Background invoice processing started for job ${job.id}`);
          const autoGeneratedInvoice = await autoCreateInvoice(job.id, req.tenantId);
          if (autoGeneratedInvoice) {
            console.log(`[CreateJob] ✅ Background invoice auto-created: ${autoGeneratedInvoice.invoiceNumber}`);
            const payResult = await applyJobCreatePaymentToInvoice({
              tenantId: req.tenantId,
              userId: req.user?.id || null,
              invoice: autoGeneratedInvoice,
              paymentIntent,
            });
            await maybeAutoSendInvoiceOnJobCreation(
              req.tenantId,
              payResult.invoice || autoGeneratedInvoice,
              req.user?.id || null,
              { skipPaidReceipt: payResult.skipPaidReceipt }
            );
          } else {
            console.log(`[CreateJob] ℹ️ Background invoice: no invoice created for job ${job.id}`);
          }
        } catch (invoiceError) {
          console.error('[CreateJob] ❌ Background invoice processing failed:', invoiceError?.message || invoiceError);
        }
      });
      
      // Success - break out of retry loop
      return;
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      
      // Check if it's a duplicate key error for jobNumber
      // Handle both Sequelize errors and raw PostgreSQL errors
      // For composite unique constraints, check the constraint name directly
      const constraintName = error?.original?.constraint || error?.constraint;
      const isJobNumberConstraint = constraintName === 'jobs_tenantId_jobNumber_key' || 
                                    constraintName === 'jobs_jobNumber_key' ||
                                    constraintName?.includes('jobNumber') ||
                                    constraintName?.includes('job_number');
      
      const hasJobNumberField = error?.fields?.jobNumber || 
                                (Array.isArray(error?.fields) && error.fields.includes('jobNumber')) ||
                                (error?.errors && Array.isArray(error.errors) && error.errors.some(e => e.path === 'jobNumber'));
      
      const hasJobNumberInMessage = error?.message?.includes('jobNumber') ||
                                    error?.message?.includes('job_number') ||
                                    error?.original?.message?.includes('jobNumber') ||
                                    error?.original?.message?.includes('job_number');
      
      const isSequelizeUniqueError = error?.name === 'SequelizeUniqueConstraintError';
      const isPostgresDuplicate = error?.original?.code === '23505';
      
      // It's a duplicate job number if:
      // 1. It's a unique constraint error AND
      // 2. The constraint is related to jobNumber OR the fields include jobNumber OR message mentions jobNumber
      const isDuplicateJobNumber = (isSequelizeUniqueError || isPostgresDuplicate) && 
                                    (isJobNumberConstraint || hasJobNumberField || hasJobNumberInMessage);
      
      if (isDuplicateJobNumber && retryCount < maxRetries - 1) {
        // Retry with a new job number
        retryCount++;
        console.log(`⚠️  Duplicate job number detected, retrying (attempt ${retryCount + 1}/${maxRetries})...`);
        console.log(`   Error details:`, {
          name: error?.name,
          code: error?.original?.code,
          constraint: constraintName,
          fields: error?.fields,
          errors: error?.errors?.map(e => ({ path: e.path, value: e.value })),
          message: error?.message,
          originalMessage: error?.original?.message,
          isJobNumberConstraint,
          hasJobNumberField,
          hasJobNumberInMessage
        });
        // Small delay to reduce race condition likelihood
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        // Create new transaction for retry
        transaction = await sequelize.transaction();
        continue;
      } else {
        // Either not a duplicate error or max retries reached
        console.error(`❌ Job creation failed after ${retryCount + 1} attempts:`, error);
        next(error);
        return;
      }
    }
  }
  
  // If we get here, max retries exceeded
  next(new Error('Failed to create job after multiple attempts due to job number conflicts'));
};

// @desc    Update job
// @route   PUT /api/jobs/:id
// @access  Private
exports.updateJob = async (req, res, next) => {
  try {
    const job = await Job.findOne({
      where: jobWhere(req, { id: req.params.id }),
      include: [{ model: JobItem, as: 'items' }]
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const { statusComment, items, ...rawPayload } = req.body;
    const updatePayload = sanitizePayload(rawPayload);

    if (updatePayload.deliveryStatus !== undefined) {
      const parsed = parseDeliveryStatusInput(updatePayload.deliveryStatus);
      if (parsed === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Invalid deliveryStatus'
        });
      }
      updatePayload.deliveryStatus = parsed;
    }

    if (updatePayload.deliveryRequired !== undefined) {
      updatePayload.deliveryRequired = Boolean(updatePayload.deliveryRequired);
      if (!updatePayload.deliveryRequired) {
        updatePayload.deliveryStatus = null;
      }
    } else if (updatePayload.deliveryStatus !== undefined && updatePayload.deliveryStatus) {
      updatePayload.deliveryRequired = true;
    }

    const oldStatus = job.status;
    const newStatus = updatePayload.status;
    const oldAssignedTo = job.assignedTo;
    const billableChanged = hasBillableJobChange({
      currentJob: job,
      updatePayload,
      incomingItems: items,
    });
    const linkedInvoices = billableChanged
      ? await Invoice.findAll({ where: applyTenantFilter(req.tenantId, { jobId: job.id }) })
      : [];
    const lockedInvoice = linkedInvoices.find(
      (invoice) => invoice.status !== 'cancelled' && isInvoicePaymentLocked(invoice)
    );

    if (lockedInvoice) {
      return res.status(400).json({
        success: false,
        message: `Cannot update job price because invoice ${lockedInvoice.invoiceNumber || lockedInvoice.id} already has payments. Update the invoice manually or create an adjustment.`
      });
    }

    // If status is changing to completed, set completion date
    if (newStatus === 'completed' && oldStatus !== 'completed') {
      updatePayload.completionDate = new Date();
    }

    // When work starts, persist start date for customer tracking / timeline if not already set
    if (newStatus === 'in_progress' && oldStatus !== 'in_progress' && !job.startDate) {
      if (updatePayload.startDate == null) {
        updatePayload.startDate = new Date();
      }
    }

    const syncedInvoiceCustomerIds = new Set();
    let syncedInvoices = [];
    const statusChanged = Boolean(newStatus && newStatus !== oldStatus);
    const transaction = await sequelize.transaction();
    try {
      await job.update(updatePayload, { transaction });

      if (items !== undefined && Array.isArray(items)) {
        await syncJobItemsForUpdate({
          jobId: job.id,
          tenantId: req.tenantId,
          existingItems: job.items || [],
          incomingItems: items,
          transaction,
        });
      }

      if (billableChanged && linkedInvoices.length > 0) {
        linkedInvoices.forEach((invoice) => {
          if (invoice.customerId) syncedInvoiceCustomerIds.add(invoice.customerId);
        });
        const jobForInvoiceSync = await Job.findOne({
          where: applyTenantFilter(req.tenantId, { id: job.id }),
          include: [{ model: JobItem, as: 'items' }],
          transaction
        });
        syncedInvoices = await syncEditableInvoicesForJob({
          job: jobForInvoiceSync,
          invoices: linkedInvoices,
          tenantId: req.tenantId,
          transaction
        });
        syncedInvoices.forEach((invoice) => {
          if (invoice.customerId) syncedInvoiceCustomerIds.add(invoice.customerId);
        });
        if (jobForInvoiceSync?.customerId) syncedInvoiceCustomerIds.add(jobForInvoiceSync.customerId);
      }

      // Only audit status changes (or an explicit status comment). Skip no-op "Details updated".
      if (statusChanged || statusComment) {
        await JobStatusHistory.create({
          jobId: job.id,
          tenantId: req.tenantId,
          status: statusChanged ? newStatus : job.status,
          comment: statusComment || null,
          changedBy: req.user?.id || null
        }, { transaction });
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    if (syncedInvoices.length > 0) {
      await Promise.all([...syncedInvoiceCustomerIds].map((customerId) =>
        updateCustomerBalance(customerId, null, req.tenantId).catch((balanceError) => {
          console.error('[Job] Failed to update customer balance after invoice sync:', balanceError?.message);
        })
      ));
      invalidateAfterMutation(req.tenantId);
      invalidateInvoiceListCache(req.tenantId);
    }

    // Auto-create invoice in the background (mirrors createJob). Skip when we already know one exists.
    const resultingStatus = updatePayload.status !== undefined ? updatePayload.status : oldStatus;
    const knownHasInvoice = billableChanged && linkedInvoices.length > 0;
    const shouldQueueAutoInvoice = resultingStatus !== 'cancelled' && !knownHasInvoice;
    if (shouldQueueAutoInvoice) {
      setImmediate(async () => {
        try {
          console.log(`[UpdateJob] Background invoice processing started for job ${job.id}`);
          const autoGeneratedInvoice = await autoCreateInvoice(job.id, req.tenantId);
          if (autoGeneratedInvoice) {
            console.log(`[UpdateJob] ✅ Background invoice auto-created: ${autoGeneratedInvoice.invoiceNumber}`);
          } else {
            console.log(`[UpdateJob] ℹ️ Background invoice: no invoice created for job ${job.id}`);
          }
        } catch (invoiceError) {
          console.error('[UpdateJob] ❌ Background invoice processing failed:', invoiceError?.message || invoiceError);
        }
      });
    }

    const updatedJob = await Job.findOne({
      where: applyTenantFilter(req.tenantId, { id: job.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Quote, as: 'quote', attributes: ['id', 'quoteNumber', 'status', 'title'] },
        { model: JobItem, as: 'items' }
      ]
    });

    if (!Array.isArray(updatedJob.attachments)) {
      updatedJob.attachments = [];
    }

    if (updatePayload.assignedTo && updatePayload.assignedTo !== oldAssignedTo) {
      await activityLogger.logJobAssigned(updatedJob, req.user?.id || null);
    }

    if (
      updatePayload.assignedTo &&
      updatePayload.assignedTo !== oldAssignedTo &&
      updatedJob.assignedUser?.email
    ) {
      const { sendJobAssignedEmailToAssignee } = require('../services/jobAssigneeEmailService');
      sendJobAssignedEmailToAssignee({
        tenantId: req.tenantId,
        job: updatedJob,
        assignee: updatedJob.assignedUser,
        assignedByUser: req.user || null
      });
    }

    if (updatePayload.assignedTo && updatePayload.assignedTo !== oldAssignedTo) {
      setImmediate(async () => {
        try {
          const { runJobAssignedStaffAutomations } = require('../services/automationEngineService');
          await runJobAssignedStaffAutomations({
            tenantId: req.tenantId,
            job: updatedJob,
            assignee: updatedJob.assignedUser || null,
            customer: updatedJob.customer || null,
            assignedByUser: req.user || null,
            actorUserId: req.user?.id || null,
          });
        } catch (automationErr) {
          console.error('[Job] job_assigned_staff automations failed:', automationErr?.message || automationErr);
        }
      });
    }

    if (statusChanged) {
      await activityLogger.logJobStatusChanged(updatedJob, oldStatus, newStatus, req.user?.id || null);
      if (newStatus === 'completed') {
        await activityLogger.logJobCompleted(updatedJob, req.user?.id || null).catch((err) =>
          console.error('[Job] logJobCompleted failed:', err?.message)
        );
      }

      // Customer messaging policy: only notify on creation and completion.
      if (newStatus === 'completed' && oldStatus !== 'completed') {
        setImmediate(async () => {
          try {
            await sendJobLifecycleWhatsApp({
              tenantId: req.tenantId,
              job: updatedJob,
              eventType: 'completed'
            });
          } catch (whatsappErr) {
            console.error('[Job] WhatsApp completed notification failed:', whatsappErr?.message || whatsappErr);
          }
          try {
            await runJobCompletedAutomations({
              tenantId: req.tenantId,
              job: updatedJob,
              customer: updatedJob.customer || null,
              actorUserId: req.user?.id || null,
            });
            try {
              const { runJobCompletedStaffAutomations } = require('../services/automationEngineService');
              await runJobCompletedStaffAutomations({
                tenantId: req.tenantId,
                job: updatedJob,
                customer: updatedJob.customer || null,
                actorUserId: req.user?.id || null,
              });
            } catch (staffErr) {
              console.error('[Job] job_completed_staff automations failed:', staffErr?.message || staffErr);
            }
          } catch (error) {
            console.error('[Job] job_completed automations failed:', error?.message || error);
          }
          try {
            await runReviewRequestAutomations({
              tenantId: req.tenantId,
              sourceType: 'job',
              source: updatedJob,
              customer: updatedJob.customer || null,
              actorUserId: req.user?.id || null,
            });
          } catch (error) {
            console.error('[Job] review_request automations failed:', error?.message || error);
          }
        });
      }
    }

    const response = {
      success: true,
      data: updatedJob
    };

    if (shouldQueueAutoInvoice) {
      response.invoice = {
        queued: true,
        message: 'Invoice generation is processing in the background'
      };
    } else if (syncedInvoices.length > 0) {
      response.invoice = {
        id: syncedInvoices[0].id,
        invoiceNumber: syncedInvoices[0].invoiceNumber,
        synced: true,
        message: syncedInvoices.length === 1
          ? 'Invoice automatically updated to match job'
          : `${syncedInvoices.length} invoices automatically updated to match job`
      };
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Cascade-delete job-linked financial and operational records (admin delete).
 * Restores material stock for usage movements; unlinks leads (does not delete lead CRM rows).
 * @param {{ tenantId: string, jobId: string, transaction: import('sequelize').Transaction }} args
 * @returns {Promise<{ invoiceIds: string[], customerIds: string[], deleted: object }>}
 */
async function cascadeDeleteJobRelatedRecords({ tenantId, jobId, transaction }) {
  const tenantJobWhere = applyTenantFilter(tenantId, { jobId });
  const deleted = {
    invoices: 0,
    payments: 0,
    expenses: 0,
    expenseActivities: 0,
    materialMovements: 0,
    partnerCommissions: 0,
    storefrontReviews: 0,
    leadsUnlinked: 0,
    salesUnlinked: 0,
  };

  const invoices = await Invoice.findAll({
    where: tenantJobWhere,
    attributes: ['id', 'customerId'],
    transaction,
  });
  const invoiceIds = invoices.map((row) => row.id);
  const customerIds = [...new Set(
    invoices.map((row) => row.customerId).filter(Boolean)
  )];

  const payments = await Payment.findAll({
    where: tenantJobWhere,
    attributes: ['id'],
    transaction,
  });
  const paymentIds = payments.map((row) => row.id);

  const expenses = await Expense.findAll({
    where: tenantJobWhere,
    attributes: ['id'],
    transaction,
  });
  const expenseIds = expenses.map((row) => row.id);

  if (invoiceIds.length || paymentIds.length) {
    const commissionWhere = {
      tenantId,
      [Op.or]: [
        ...(invoiceIds.length ? [{ invoiceId: { [Op.in]: invoiceIds } }] : []),
        ...(paymentIds.length ? [{ paymentId: { [Op.in]: paymentIds } }] : []),
      ],
    };
    deleted.partnerCommissions = await PartnerCommission.destroy({
      where: commissionWhere,
      transaction,
    });
  }

  if (invoiceIds.length) {
    const [salesUnlinked] = await Sale.update(
      { invoiceId: null },
      {
        where: applyTenantFilter(tenantId, { invoiceId: { [Op.in]: invoiceIds } }),
        transaction,
      }
    );
    deleted.salesUnlinked = salesUnlinked;
  }

  if (expenseIds.length) {
    deleted.expenseActivities = await ExpenseActivity.destroy({
      where: { expenseId: { [Op.in]: expenseIds } },
      transaction,
    });
  }

  deleted.expenses = await Expense.destroy({
    where: tenantJobWhere,
    transaction,
  });

  deleted.payments = await Payment.destroy({
    where: tenantJobWhere,
    transaction,
  });

  const materialMovements = await MaterialMovement.findAll({
    where: tenantJobWhere,
    transaction,
  });
  for (const movement of materialMovements) {
    const delta = parseFloat(movement.quantityDelta);
    if (Number.isFinite(delta) && delta !== 0 && movement.itemId) {
      const item = await MaterialItem.findOne({
        where: applyTenantFilter(tenantId, { id: movement.itemId }),
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (item) {
        const current = parseFloat(item.quantityOnHand) || 0;
        item.quantityOnHand = current - delta;
        await item.save({ transaction });
      }
    }
  }
  deleted.materialMovements = await MaterialMovement.destroy({
    where: tenantJobWhere,
    transaction,
  });

  deleted.storefrontReviews = await StorefrontReview.destroy({
    where: applyTenantFilter(tenantId, { jobId }),
    transaction,
  });

  const [leadsUnlinked] = await Lead.update(
    { convertedJobId: null },
    {
      where: applyTenantFilter(tenantId, { convertedJobId: jobId }),
      transaction,
    }
  );
  deleted.leadsUnlinked = leadsUnlinked;

  deleted.invoices = await Invoice.destroy({
    where: tenantJobWhere,
    transaction,
  });

  return { invoiceIds, customerIds, deleted };
}

// @desc    Delete job (admin). Cascades linked invoices, payments, expenses, material movements; unlinks leads.
// @route   DELETE /api/jobs/:id
// @access  Private (Admin only)
exports.deleteJob = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const job = await Job.findOne({
      where: jobWhere(req, { id: req.params.id }),
      transaction
    });

    if (!job) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const customerIds = new Set();
    if (job.customerId) customerIds.add(job.customerId);

    const cascade = await cascadeDeleteJobRelatedRecords({
      tenantId: req.tenantId,
      jobId: job.id,
      transaction,
    });
    cascade.customerIds.forEach((id) => customerIds.add(id));

    await JobStatusHistory.destroy({
      where: applyTenantFilter(req.tenantId, { jobId: job.id }),
      transaction
    });
    await JobItem.destroy({
      where: applyTenantFilter(req.tenantId, { jobId: job.id }),
      transaction
    });
    await job.destroy({ transaction });
    await transaction.commit();

    for (const customerId of customerIds) {
      try {
        await updateCustomerBalance(customerId, null, req.tenantId);
      } catch (balanceError) {
        console.error('[deleteJob] Failed to refresh customer balance:', balanceError?.message || balanceError);
      }
    }

    invalidateAfterMutation(req.tenantId);
    invalidateInvoiceListCache(req.tenantId);

    res.status(200).json({
      success: true,
      data: {},
      cascade: cascade.deleted,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// @desc    Get job statistics
// @route   GET /api/jobs/stats/overview
// @access  Private
exports.getJobStats = async (req, res, next) => {
  try {
    const { sequelize } = require('../config/database');

    const stats = await Job.findAll({
      where: jobWhere(req, {}),
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('finalPrice')), 'totalRevenue']
      ],
      group: ['status']
    });

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

const buildAttachmentResponse = (req, attachment) => {
  if (!attachment) return attachment;
  const normalized = { ...attachment };
  
  // If fileData exists (base64), use it as url
  if (normalized.fileData) {
    normalized.url = normalized.fileData;
  } else if (normalized.storagePath && !normalized.url) {
    // Legacy support for file paths
    normalized.url = `${req.protocol}://${req.get('host')}/uploads/${normalized.storagePath.replace(/\\/g, '/')}`;
  }
  
  // Don't expose full fileData in response, just url
  if (normalized.fileData && normalized.url) {
    delete normalized.fileData;
  }
  
  return normalized;
};

exports.uploadJobAttachment = async (req, res, next) => {
  try {
    console.log('[Job Attachment Upload] Starting upload...');
    const job = await Job.findOne({
      where: jobWhere(req, { id: req.params.id })
    });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (!req.file) {
      console.log('[Job Attachment Upload] ❌ No file uploaded');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    console.log('[Job Attachment Upload] File info:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: !!req.file.buffer,
      hasPath: !!req.file.path
    });

    // Convert file to base64 and store in database
    let fileData;
    const mimeType = req.file.mimetype || 'application/octet-stream';
    
    try {
      if (req.file.buffer) {
        console.log('[Job Attachment Upload] File is in memory, converting to base64...');
        const base64String = req.file.buffer.toString('base64');
        fileData = `data:${mimeType};base64,${base64String}`;
        console.log('[Job Attachment Upload] ✅ Base64 conversion complete. Length:', fileData.length);
      } else if (req.file.path) {
        console.log('[Job Attachment Upload] File is on disk, reading from path:', req.file.path);
        
        if (!fs.existsSync(req.file.path)) {
          console.log('[Job Attachment Upload] ❌ File path does not exist');
          return res.status(400).json({ success: false, message: 'Uploaded file not found on server' });
        }
        
        const fileBuffer = fs.readFileSync(req.file.path);
        const base64String = fileBuffer.toString('base64');
        fileData = `data:${mimeType};base64,${base64String}`;
        console.log('[Job Attachment Upload] ✅ Base64 conversion complete. Length:', fileData.length);
        
        // Delete the temporary file since we're storing in DB
        try {
          fs.unlinkSync(req.file.path);
          console.log('[Job Attachment Upload] ✅ Temporary file deleted');
        } catch (unlinkError) {
          console.log('[Job Attachment Upload] ⚠️  Warning: Could not delete temporary file:', unlinkError.message);
        }
      } else {
        console.log('[Job Attachment Upload] ❌ File has neither buffer nor path');
        return res.status(400).json({ success: false, message: 'Unable to process uploaded file' });
      }
    } catch (processingError) {
      console.error('[Job Attachment Upload] ❌ Error processing file:', processingError);
      return res.status(500).json({ success: false, message: 'Error processing uploaded file', error: processingError.message });
    }

    const attachment = {
      id: uuidv4(),
      originalName: req.file.originalname,
      mimeType: mimeType,
      size: req.file.size,
      fileData: fileData, // Store base64 data
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user
        ? {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email
          }
        : null
    };

    const attachments = Array.isArray(job.attachments) ? [...job.attachments] : [];
    attachments.push(attachment);
    job.attachments = attachments;
    await job.save();

    console.log('[Job Attachment Upload] ✅ Upload completed successfully');
    res.status(201).json({
      success: true,
      data: buildAttachmentResponse(req, attachment),
      attachments: attachments.map((item) => buildAttachmentResponse(req, item))
    });
  } catch (error) {
    console.error('[Job Attachment Upload] ❌ Error:', error);
    next(error);
  }
};

exports.deleteJobAttachment = async (req, res, next) => {
  try {
    const job = await Job.findOne({
      where: jobWhere(req, { id: req.params.id })
    });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const attachments = Array.isArray(job.attachments) ? [...job.attachments] : [];
    const index = attachments.findIndex((attachment) => attachment.id === req.params.attachmentId);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const [removed] = attachments.splice(index, 1);
    job.attachments = attachments;
    await job.save();

    // Only delete file if it's a file path (legacy support), not base64
    if (removed?.storagePath && !removed?.fileData) {
      console.log('[Job Attachment Delete] Deleting file from disk...');
      const filePath = path.join(baseUploadDir, removed.storagePath);
      fs.promises
        .access(filePath, fs.constants.F_OK)
        .then(() => {
          fs.promises.unlink(filePath);
          console.log('[Job Attachment Delete] ✅ File deleted from disk');
        })
        .catch(() => {
          console.log('[Job Attachment Delete] File not found on disk (may already be deleted)');
        });
    } else {
      console.log('[Job Attachment Delete] Attachment stored as base64, no file to delete');
    }

    res.status(200).json({
      success: true,
      message: 'Attachment removed',
      attachments: attachments.map((item) => buildAttachmentResponse(req, item))
    });
  } catch (error) {
    next(error);
  }
};


