const crypto = require('crypto');
const { Quote, QuoteItem, Customer, User, Job, JobItem, JobStatusHistory, QuoteActivity, Invoice, Sale, SaleItem, SaleActivity, Setting, Tenant, Shop, StudioLocation } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { getPagination } = require('../utils/paginationUtils');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const {
  applyStudioLocationFilter,
  attachStudioLocationToPayload,
  resolveStudioLocationIdForJobFromQuote,
} = require('../utils/studioLocationUtils');
const {
  applyScopedFilters,
  attachScopedToPayload,
  assertShopRecordAccess,
} = require('../utils/shopUtils');
const activityLogger = require('../services/activityLogger');
const { getTaxConfigForTenant } = require('../utils/taxConfig');
const { runQuoteSentAutomations } = require('../services/automationEngineService');
const { computeQuoteTaxSummary, computeDocumentTax } = require('../utils/taxCalculation');
const {
  resolveDocumentOrganization,
  organizationToEmailCompany,
} = require('../utils/documentOrganizationUtils');
const { resolveQuoteItemCategory } = require('../utils/resolveQuoteItemCategory');
const { resolveJobCreatePaymentIntent } = require('../utils/jobCreatePayment');
const { v4: uuidv4 } = require('uuid');

const QUOTE_ATTACHMENT_TYPES = new Set(['proposal', 'requirements', 'agreement', 'other']);
const QUOTE_ATTACHMENT_EDITABLE_STATUSES = new Set(['draft', 'sent']);

const quoteBranchIncludes = () => [
  { model: Shop, as: 'shop', required: false },
  { model: StudioLocation, as: 'studioLocation', required: false },
];

/**
 * Normalize a quote attachment for API responses.
 * @param {object} attachment
 * @param {{ includeFile?: boolean }} [options]
 * @returns {object|null}
 */
const formatQuoteAttachment = (attachment, { includeFile = true } = {}) => {
  if (!attachment) return null;
  const normalized = {
    id: attachment.id,
    type: attachment.type || 'other',
    originalName: attachment.originalName || attachment.name || 'Attachment',
    name: attachment.originalName || attachment.name || 'Attachment',
    mimeType: attachment.mimeType || 'application/octet-stream',
    size: attachment.size || 0,
    uploadedAt: attachment.uploadedAt || null,
    uploadedBy: attachment.uploadedBy || null,
  };

  if (includeFile) {
    if (attachment.fileData) {
      normalized.url = attachment.fileData;
    } else if (attachment.url) {
      normalized.url = attachment.url;
    }
  }

  return normalized;
};

const formatQuoteAttachments = (attachments, options = {}) => (
  (Array.isArray(attachments) ? attachments : [])
    .map((item) => formatQuoteAttachment(item, options))
    .filter(Boolean)
);

const generateQuoteNumber = async (tenantId) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  const lastQuote = await Quote.findOne({
    where: {
      tenantId,
      quoteNumber: {
        [Op.like]: `QTE-${year}${month}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastQuote) {
    const lastSequence = parseInt(lastQuote.quoteNumber.split('-')[2], 10);
    sequence = lastSequence + 1;
  }

  return `QTE-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

const formatQuoteResponse = (quote, { includeAttachmentFiles = true } = {}) => ({
  id: quote.id,
  quoteNumber: quote.quoteNumber,
  title: quote.title,
  description: quote.description,
  status: quote.status,
  validUntil: quote.validUntil,
  subtotal: quote.subtotal,
  discountTotal: quote.discountTotal,
  taxRate: quote.taxRate,
  taxAmount: quote.taxAmount,
  totalAmount: quote.totalAmount,
  notes: quote.notes,
  scopeOfWork: quote.scopeOfWork ?? null,
  termsAndConditions: quote.termsAndConditions ?? null,
  paymentSchedule: Array.isArray(quote.paymentSchedule) ? quote.paymentSchedule : [],
  createdBy: quote.createdBy,
  acceptedAt: quote.acceptedAt,
  createdAt: quote.createdAt,
  updatedAt: quote.updatedAt,
  customer: quote.customer,
  creator: quote.creator,
  items: quote.items,
  shopId: quote.shopId || null,
  studioLocationId: quote.studioLocationId || null,
  shop: quote.shop || null,
  studioLocation: quote.studioLocation || null,
  convertedJobId: quote.convertedJobId || null,
  convertedJobNumber: quote.convertedJobNumber || null,
  attachments: formatQuoteAttachments(quote.attachments, { includeFile: includeAttachmentFiles }),
});

const normalizePaymentSchedule = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const label = String(row.label || '').trim();
      if (!label) return null;
      const amount = row.amount != null && row.amount !== '' ? Number(row.amount) : null;
      const percent = row.percent != null && row.percent !== '' ? Number(row.percent) : null;
      return {
        label,
        ...(Number.isFinite(amount) ? { amount } : {}),
        ...(Number.isFinite(percent) ? { percent } : {}),
      };
    })
    .filter(Boolean);
};

const pickStudioQuotationFields = (quoteData = {}) => {
  const next = {};
  if (Object.prototype.hasOwnProperty.call(quoteData, 'scopeOfWork')) {
    next.scopeOfWork = quoteData.scopeOfWork != null ? String(quoteData.scopeOfWork) : null;
  }
  if (Object.prototype.hasOwnProperty.call(quoteData, 'termsAndConditions')) {
    next.termsAndConditions = quoteData.termsAndConditions != null
      ? String(quoteData.termsAndConditions)
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(quoteData, 'paymentSchedule')) {
    next.paymentSchedule = normalizePaymentSchedule(quoteData.paymentSchedule);
  }
  return next;
};

const calculateTotals = (items = []) => {
  let subtotal = 0;
  let discountTotal = 0;

  items.forEach((item) => {
    const qty = parseFloat(item.quantity || 0);
    const price = parseFloat(item.unitPrice || 0);
    const lineSubtotal = qty * price;
    const discount = parseFloat(item.discountAmount || 0);

    subtotal += lineSubtotal;
    discountTotal += discount;
  });

  const totalAmount = subtotal - discountTotal;

  return {
    subtotal: subtotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    totalAmount: totalAmount.toFixed(2)
  };
};

const quoteWhere = (req, extra = {}) =>
  applyScopedFilters(req, applyTenantFilter(req.tenantId, extra));

exports.getQuotes = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const status = req.query.status;
    const customerId = req.query.customerId;
    const search = req.query.search || '';

    let where = applyScopedFilters(req, applyTenantFilter(req.tenantId, {}));
    // Staff see only quotes they created; admin/manager see all
    const effectiveRole = (req.tenantRole && ['owner', 'admin'].includes(req.tenantRole)) ? 'admin' : req.user?.role;
    if (effectiveRole === 'staff') {
      where.createdBy = req.user.id;
    }
    if (status && status !== 'all') {
      where.status = status;
    }
    if (customerId && customerId !== 'null' && customerId !== 'undefined') {
      where.customerId = customerId;
    }
    if (search) {
      where[Op.or] = [
        { quoteNumber: { [Op.iLike]: `%${search}%` } },
        { title: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Quote.findAndCountAll({
      where,
      limit,
      offset,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'company', 'email']
        },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
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
      data: rows.map((row) => formatQuoteResponse(row, { includeAttachmentFiles: false }))
    });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    next(error);
  }
};

// @desc    Export quotes to CSV
// @route   GET /api/quotes/export
// @access  Private (admin, manager)
exports.exportQuotes = async (req, res, next) => {
  try {
    const { sendCSV, COLUMN_DEFINITIONS } = require('../utils/dataExport');
    const where = quoteWhere(req, {});

    const quotes = await Quote.findAll({
      where,
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email'] }],
      order: [['createdAt', 'DESC']],
      raw: false,
    });
    const rows = quotes.map((q) => {
      const plain = q.get({ plain: true });
      return { ...plain, customer: plain.customer || {} };
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No quotes to export' });
    }

    const filename = `quotes_${new Date().toISOString().split('T')[0]}`;
    sendCSV(res, rows, `${filename}.csv`, COLUMN_DEFINITIONS.quotes);
  } catch (error) {
    next(error);
  }
};

exports.getQuote = async (req, res, next) => {
  try {
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Staff may only view quotes they created
    const effectiveRole = (req.tenantRole && ['owner', 'admin'].includes(req.tenantRole)) ? 'admin' : req.user?.role;
    if (effectiveRole === 'staff' && quote.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this quote'
      });
    }

    const existingJob = await Job.findOne({
      where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
      attributes: ['id', 'jobNumber']
    });

    if (existingJob) {
      quote.setDataValue('convertedJobId', existingJob.id);
      quote.setDataValue('convertedJobNumber', existingJob.jobNumber);
    }

    res.status(200).json({
      success: true,
      data: formatQuoteResponse(quote)
    });
  } catch (error) {
    console.error(`Error fetching quote ${req.params.id}:`, error);
    next(error);
  }
};

const DEFAULT_QUOTE_SEND_MESSAGE = 'Please find your quote below. Click the button to view the full details and accept when you are ready.';

exports.createQuote = async (req, res, next) => {
  try {
    const payload = sanitizePayload(req.body);
    const { items = [], autoSendToCustomer = true, sendMessage, taxRate: bodyTaxRate, ...quoteData } = payload;

    const quoteNumber = await generateQuoteNumber(req.tenantId);
    const totals = calculateTotals(items);
    const taxConfig = await getTaxConfigForTenant(req.tenantId);
    const taxSummary = computeQuoteTaxSummary(
      parseFloat(totals.subtotal),
      parseFloat(totals.discountTotal),
      taxConfig,
      bodyTaxRate
    );

    const quote = await Quote.create(
      attachScopedToPayload(req, {
        ...quoteData,
        ...pickStudioQuotationFields(quoteData),
        paymentSchedule: normalizePaymentSchedule(quoteData.paymentSchedule),
        tenantId: req.tenantId,
        quoteNumber,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxRate: taxSummary.appliedTaxRate.toFixed(2),
        taxAmount: taxSummary.taxAmount.toFixed(2),
        totalAmount: taxSummary.total.toFixed(2),
        createdBy: req.user?.id || null,
      })
    );

    if (items.length) {
      const quoteItems = items.map((item) => ({
        quoteId: quote.id,
        tenantId: req.tenantId,
        productId: item.productId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        discountPercent: item.discountPercent || 0,
        discountReason: item.discountReason || null,
        total: item.total || ((parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)) - parseFloat(item.discountAmount || 0)),
        metadata: item.metadata || {}
      }));
      await QuoteItem.bulkCreate(quoteItems);
    }

    const fullQuote = await Quote.findOne({
      where: applyTenantFilter(req.tenantId, { id: quote.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    let viewToken = fullQuote.viewToken;
    if (!viewToken) {
      viewToken = crypto.randomBytes(32).toString('hex');
      await Quote.update({ viewToken }, { where: applyTenantFilter(req.tenantId, { id: quote.id }) });
      fullQuote.viewToken = viewToken;
    }
    const quoteLink = `${frontendUrl}/view-quote/${viewToken}`;
    const shouldSendToCustomer = autoSendToCustomer !== false && autoSendToCustomer !== 'false';

    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId: req.tenantId,
      type: 'note',
      subject: 'Quote Created',
      notes: shouldSendToCustomer
        ? `Quote ${quoteNumber} created. Sending notifications to customer…`
        : `Quote ${quoteNumber} created.`,
      createdBy: req.user?.id || null,
      metadata: {
        action: 'created',
        ...(shouldSendToCustomer && { deliveryQueued: true })
      }
    });

    res.status(201).json({
      success: true,
      data: formatQuoteResponse(fullQuote),
      ...(shouldSendToCustomer && { delivery: { queued: true } })
    });

    if (!shouldSendToCustomer) {
      return;
    }

    const tenantId = req.tenantId;
    const actorUserId = req.user?.id || null;
    const customSendMessage = sendMessage;

    setImmediate(async () => {
      const delivery = {};
      let quoteSentViaAnyChannel = false;

      try {
        const whatsappService = require('../services/whatsappService');
        const whatsappTemplates = require('../services/whatsappTemplates');
        const config = await whatsappService.getConfig(tenantId);

        if (config && fullQuote.customer && fullQuote.customer.phone) {
          const phoneNumber = whatsappService.validatePhoneNumber(fullQuote.customer.phone);
          if (phoneNumber) {
            const parameters = whatsappTemplates.prepareQuoteDelivery(
              fullQuote,
              fullQuote.customer,
              quoteLink
            );

            const whatsappResult = await whatsappService.sendMessage(
              tenantId,
              phoneNumber,
              'quote_delivery',
              parameters
            ).catch(error => {
              console.error('[Quote] WhatsApp send failed:', error);
              return { success: false, error: error?.message || 'WhatsApp send failed' };
            });
            if (whatsappResult?.success) {
              quoteSentViaAnyChannel = true;
              delivery.whatsappSent = true;
              console.log('[Quote] WhatsApp delivery quoteNumber=%s result=sent', fullQuote.quoteNumber);
            } else {
              delivery.whatsappSent = false;
              delivery.whatsappError = whatsappResult?.error || 'WhatsApp send failed';
              console.log('[Quote] WhatsApp delivery quoteNumber=%s result=failed: %s', fullQuote.quoteNumber, delivery.whatsappError);
            }
          }
        }
      } catch (error) {
        console.error('[Quote] WhatsApp integration error:', error);
        delivery.whatsappSent = false;
        delivery.whatsappError = error?.message || 'WhatsApp integration error';
      }

      try {
        const smsService = require('../services/smsService');
        const smsTemplateService = require('../services/smsTemplateService');
        const smsConfig = await smsService.getResolvedConfig(tenantId);
        if (smsConfig && fullQuote.customer && fullQuote.customer.phone) {
          const smsPhone = smsService.validatePhoneNumber(fullQuote.customer.phone);
          if (smsPhone) {
            const organization = await resolveDocumentOrganization({
              tenantId,
              shop: fullQuote.shop || null,
              studioLocation: fullQuote.studioLocation || null,
            });
            const { resolveSmsDisplayName } = require('../utils/smsMessageUtils');
            const branchName = resolveSmsDisplayName(organization);
            const variables = {
              customerName: fullQuote.customer.name || fullQuote.customer.company || 'Customer',
              businessName: organization?.name || branchName,
              branchName,
              quoteNumber: fullQuote.quoteNumber || `#${fullQuote.id}`,
              paymentLink: quoteLink,
            };
            const smsMessage = await smsTemplateService.renderForTenant(
              tenantId,
              'quote_sent',
              variables
            );
            if (!smsMessage) {
              delivery.smsSent = false;
              delivery.smsError = 'SMS template render failed';
            } else {
              const smsResult = await smsService.sendMessage(tenantId, smsPhone, smsMessage).catch(error => {
                console.error('[Quote] SMS send failed:', error);
                return { success: false, error: error?.message || 'SMS send failed' };
              });
              if (smsResult?.success) {
                quoteSentViaAnyChannel = true;
                delivery.smsSent = true;
                console.log('[Quote] SMS delivery quoteNumber=%s result=sent', fullQuote.quoteNumber);
              } else {
                delivery.smsSent = false;
                delivery.smsError = smsResult?.error || 'SMS send failed';
                console.log('[Quote] SMS delivery quoteNumber=%s result=failed: %s', fullQuote.quoteNumber, delivery.smsError);
              }
            }
          }
        }
      } catch (error) {
        console.error('[Quote] SMS integration error:', error);
        delivery.smsSent = false;
        delivery.smsError = error?.message || 'SMS integration error';
      }

      let quoteSentViaEmail = false;
      let quoteEmailReason = '';
      try {
        const emailService = require('../services/emailService');
        const emailTemplates = require('../services/emailTemplates');
        const emailConfig = await emailService.getConfig(tenantId);
        const customerEmail = fullQuote.customer?.email?.trim();
        if (!emailConfig) {
          quoteEmailReason = 'tenant email not configured';
          delivery.emailSent = false;
          delivery.emailError = 'Turn on and configure Email in Settings → Integrations to send quotes by email.';
        } else if (!customerEmail) {
          quoteEmailReason = 'customer has no email address';
          delivery.emailSent = false;
          delivery.emailError = 'Customer has no email address. Add email in Customers to send the quote by email.';
        } else {
          const organization = await resolveDocumentOrganization({
            tenantId,
            shop: fullQuote.shop || null,
            studioLocation: fullQuote.studioLocation || null,
          });
          const company = organizationToEmailCompany(organization);
          const customMessage = (typeof customSendMessage === 'string' && customSendMessage.trim())
            ? customSendMessage.trim()
            : DEFAULT_QUOTE_SEND_MESSAGE;
          const quoteForEmail = {
            quoteNumber: fullQuote.quoteNumber,
            title: fullQuote.title || 'Your quote',
            totalAmount: fullQuote.totalAmount,
            currency: fullQuote.currency || 'GHS',
            items: (fullQuote.items || []).map(i => ({
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.total
            }))
          };
          const { subject, html, text } = emailTemplates.quoteNotification(
            quoteForEmail,
            fullQuote.customer,
            quoteLink,
            company,
            customMessage
          );
          const result = await emailService.sendMessage(tenantId, customerEmail, subject, html, text);
          if (result.success) {
            quoteSentViaEmail = true;
            quoteSentViaAnyChannel = true;
            quoteEmailReason = `messageId=${result.messageId || 'n/a'}`;
            delivery.emailSent = true;
          } else {
            quoteEmailReason = `send failed: ${result.error}`;
            delivery.emailSent = false;
            delivery.emailError = result.error;
          }
        }
      } catch (error) {
        quoteEmailReason = `error: ${error.message}`;
        delivery.emailSent = false;
        delivery.emailError = error.message || 'Email send failed';
      }
      console.log('[Quote] Email delivery quoteNumber=%s result=%s', fullQuote.quoteNumber, quoteSentViaEmail ? 'sent' : `failed: ${quoteEmailReason}`);

      const sentChannels = [];
      if (delivery.emailSent) sentChannels.push('Email');
      if (delivery.whatsappSent) sentChannels.push('WhatsApp');
      if (delivery.smsSent) sentChannels.push('SMS');

      if (quoteSentViaAnyChannel) {
        try {
          await Quote.update({ status: 'sent' }, { where: applyTenantFilter(tenantId, { id: quote.id }) });
          fullQuote.status = 'sent';
          runQuoteSentAutomations({
            tenantId,
            quote: fullQuote,
            customer: fullQuote.customer || null,
            quoteLink,
            actorUserId,
          }).catch((error) =>
            console.error('[Quote] quote_sent automations failed:', error?.message || error)
          );
        } catch (statusErr) {
          console.error('[Quote] Failed to mark quote as sent:', statusErr?.message || statusErr);
        }
      }

      try {
        const sentNote = sentChannels.length > 0
          ? ` Quote sent to customer via ${sentChannels.join(', ')}.`
          : ' Customer notification delivery completed with no successful channels.';
        await QuoteActivity.create({
          quoteId: quote.id,
          tenantId,
          type: 'note',
          subject: 'Quote Delivery',
          notes: `Quote ${quoteNumber}.${sentNote}`.trim(),
          createdBy: actorUserId,
          metadata: {
            action: 'delivery',
            delivery,
            ...(sentChannels.length > 0 && { sentToCustomerVia: sentChannels })
          }
        });
      } catch (activityErr) {
        console.error('[Quote] Delivery activity failed:', activityErr?.message || activityErr);
      }
    });
  } catch (error) {
    console.error('Error creating quote:', error);
    next(error);
  }
};

/**
 * Get quote by view token (public – no auth). Used for customer-facing "View your quote" links.
 * @route GET /api/public/quotes/view/:token
 */
/**
 * Public: customer responds to quote (accept / reject / comment) via view link.
 * @route   POST /api/public/quotes/view/:token/respond
 * @body    { action: 'accept'|'reject'|'comment', comment?: string }
 */
exports.respondToQuoteByToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { action, comment } = req.body || {};
    const normalizedAction = (action || '').toLowerCase();

    if (!['accept', 'reject', 'comment'].includes(normalizedAction)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use accept, reject, or comment.'
      });
    }

    const quote = await Quote.findOne({
      where: { viewToken: token },
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email', 'phone'] }]
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found or link has expired'
      });
    }

    const tenantId = quote.tenantId;

    if (normalizedAction === 'comment') {
      const noteText = (typeof comment === 'string' && comment.trim()) ? comment.trim() : 'No comment provided';
      await QuoteActivity.create({
        quoteId: quote.id,
        tenantId,
        type: 'note',
        subject: 'Customer comment',
        notes: noteText,
        createdBy: null,
        metadata: { source: 'customer_response', action: 'comment' }
      });
      return res.status(200).json({
        success: true,
        data: { quote: formatQuoteResponse(quote), message: 'Thank you. Your comment has been sent to the team.' }
      });
    }

    if (quote.status === 'accepted' || quote.status === 'declined') {
      return res.status(400).json({
        success: false,
        message: 'This quote has already been responded to.'
      });
    }

    if (normalizedAction === 'reject') {
      await quote.update({ status: 'declined' });
      const reason = (typeof comment === 'string' && comment.trim()) ? comment.trim() : '';
      await QuoteActivity.create({
        quoteId: quote.id,
        tenantId,
        type: 'status_change',
        subject: 'Customer declined',
        notes: reason ? `Customer declined. Reason: ${reason}` : 'Customer declined.',
        createdBy: null,
        metadata: { source: 'customer_response', action: 'reject', reason }
      });
      const updated = await Quote.findOne({
        where: { id: quote.id },
        include: [
          { model: Customer, as: 'customer' },
          { model: QuoteItem, as: 'items' },
          ...quoteBranchIncludes()
        ]
      });
      return res.status(200).json({
        success: true,
        data: { quote: formatQuoteResponse(updated), message: 'Thank you for letting us know.' }
      });
    }

    // accept
    await quote.update({ status: 'accepted', acceptedAt: new Date() });
    const acceptNote = (typeof comment === 'string' && comment.trim()) ? ` Customer note: ${comment.trim()}` : '';
    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId,
      type: 'status_change',
      subject: 'Customer accepted',
      notes: `Customer accepted this quote.${acceptNote}`.trim(),
      createdBy: null,
      metadata: { source: 'customer_response', action: 'accept', comment: comment || '' }
    });

    const workflowResult = await runQuoteAcceptWorkflow(tenantId, quote, null);
    const { jobId, invoiceId, isShop } = workflowResult;

    const updatedQuote = await Quote.findOne({
      where: { id: quote.id },
      include: [
        { model: Customer, as: 'customer' },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    // Notify tenant by email when quote is accepted (don't block customer response)
    setImmediate(async () => {
      try {
        const {
          shouldUseAutomationInsteadOfBuiltIn,
          TEMPLATE_KEYS,
        } = require('../services/customerNotificationBridgeService');
        const useAutomation = await shouldUseAutomationInsteadOfBuiltIn(
          tenantId,
          TEMPLATE_KEYS.QUOTE_ACCEPTED_STAFF
        );
        if (!useAutomation) {
          const organization = await resolveDocumentOrganization({
            tenantId,
            shop: updatedQuote.shop || null,
            studioLocation: updatedQuote.studioLocation || null,
          });
          const tenantEmail = organization.email || null;
          if (tenantEmail && typeof tenantEmail === 'string' && tenantEmail.includes('@')) {
            const emailService = require('../services/emailService');
            const emailTemplates = require('../services/emailTemplates');
            const frontendUrl = process.env.FRONTEND_URL || '';
            const { subject, html, text } = emailTemplates.quoteAcceptedNotifyTenant(
              updatedQuote,
              organizationToEmailCompany(organization),
              frontendUrl
            );
            await emailService.sendMessage(tenantId, tenantEmail, subject, html, text);
          }
        }
      } catch (emailErr) {
        console.error('[Quote] respondToQuoteByToken notify-tenant email failed:', emailErr?.message);
      }
    });

    setImmediate(async () => {
      try {
        const { runQuoteAcceptedStaffAutomations } = require('../services/automationEngineService');
        await runQuoteAcceptedStaffAutomations({
          tenantId,
          quote: updatedQuote,
          customer: updatedQuote.customer || null,
          actorUserId: null,
        });
      } catch (automationErr) {
        console.error('[Quote] quote_accepted_staff automations failed:', automationErr?.message || automationErr);
      }
    });

    const message = invoiceId
      ? (isShop
        ? 'Thank you for accepting. An invoice has been created; you will receive it by email shortly. Once paid, your order will be completed.'
        : 'Thank you for accepting. A job and invoice have been created; you will receive the invoice by email shortly.')
      : 'Thank you for accepting. The team has been notified.';

    return res.status(200).json({
      success: true,
      data: {
        quote: formatQuoteResponse(updatedQuote),
        message,
        ...(jobId && { jobId }),
        ...(invoiceId && { invoiceId })
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Internal: convert quote to job (used by authenticated convertQuoteToJob and by public respond when auto-flow is on).
 * @param {string} tenantId
 * @param {string} quoteId
 * @param {string|null} createdBy
 * @returns {Promise<{ job: Object }|null>}
 */
async function convertQuoteToJobInternal(tenantId, quoteId, createdBy) {
  const transaction = await sequelize.transaction();
  try {
    const quote = await Quote.findOne({
      where: applyTenantFilter(tenantId, { id: quoteId }),
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!quote) {
      await transaction.rollback();
      return null;
    }

    const existingJob = await Job.findOne({
      where: applyTenantFilter(tenantId, { quoteId: quote.id }),
      transaction
    });
    if (existingJob) {
      await transaction.commit();
      return { job: existingJob };
    }

    const quoteItems = await QuoteItem.findAll({
      where: applyTenantFilter(tenantId, { quoteId: quote.id }),
      transaction
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const lastJob = await Job.findOne({
      where: { tenantId, jobNumber: { [Op.like]: `JOB-${year}${month}%` } },
      order: [['createdAt', 'DESC']],
      transaction
    });
    let sequence = 1;
    if (lastJob) {
      const lastSequence = parseInt(lastJob.jobNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }
    const jobNumber = `JOB-${year}${month}-${String(sequence).padStart(4, '0')}`;

    const job = await Job.create({
      jobNumber,
      quoteId: quote.id,
      customerId: quote.customerId,
      title: quote.title,
      description: quote.description,
      status: 'new',
      priority: 'medium',
      quotedPrice: quote.totalAmount,
      finalPrice: quote.totalAmount,
      notes: quote.notes,
      tenantId,
      studioLocationId: resolveStudioLocationIdForJobFromQuote(null, quote),
      createdBy: createdBy || null
    }, { transaction });

    if (quoteItems.length) {
      const jobItems = quoteItems.map(item => ({
        jobId: job.id,
        quoteItemId: item.id,
        tenantId,
        category: resolveQuoteItemCategory(item),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        discountPercent: item.discountPercent || 0,
        discountReason: item.discountReason || null,
        totalPrice: item.total,
        specifications: item.metadata || {}
      }));
      await JobItem.bulkCreate(jobItems, { transaction });
    }

    if (quoteItems.length) {
      const primaryCategory = resolveQuoteItemCategory(quoteItems[0]);
      if (primaryCategory) {
        await job.update({ jobType: primaryCategory }, { transaction });
      }
    }

    await JobStatusHistory.create({
      jobId: job.id,
      status: 'new',
      comment: `Job created from quote ${quote.quoteNumber} (customer accepted)`,
      changedBy: createdBy || null,
      tenantId
    }, { transaction });

    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId,
      type: 'conversion',
      subject: 'Quote Converted to Job',
      notes: `Quote converted to job ${jobNumber} (customer accepted online)`,
      createdBy: createdBy || null,
      metadata: { jobId: job.id, jobNumber }
    }, { transaction });

    await transaction.commit();

    // Invoice creation is handled by callers (public accept, in-app accept workflow, convertQuoteToJob)
    // so this helper stays free of request context and does not duplicate invoices.

    try {
      await activityLogger.logJobCreated(job, createdBy);
      if (job.assignedTo) {
        await activityLogger.logJobAssigned(job, createdBy);
      }
    } catch (logErr) {
      console.error('[convertQuoteToJobInternal] Job activity log failed:', logErr?.message);
    }

    try {
      const { maybeSendJobTrackingNotificationsOnJobCreated } = require('../services/jobCustomerTrackingService');
      await maybeSendJobTrackingNotificationsOnJobCreated({
        tenantId,
        jobId: job.id,
        triggeredByUserId: createdBy
      });
    } catch (trackNotifyErr) {
      console.error('[convertQuoteToJobInternal] Job tracking notification failed:', trackNotifyErr?.message);
    }

    return { job };
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    throw err;
  }
}

/**
 * Run quote accept workflow (record only OR create job/invoice/send) for authenticated in-app actions.
 * Returns created entity IDs when workflow is enabled and succeeds.
 */
async function runQuoteAcceptWorkflow(tenantId, quote, actorUserId) {
  let jobId = null;
  let invoiceId = null;

  const tenant = await Tenant.findByPk(tenantId, { attributes: ['businessType'] });
  const businessType = tenant?.businessType || 'printing_press';
  const isShop = businessType === 'shop';
  const workflowSetting = await Setting.findOne({ where: { tenantId, key: 'quote-workflow' } });
  const onAccept = workflowSetting?.value?.onAccept || 'record_only';

  const shouldRunShopWorkflow = isShop && ['create_sale_invoice_and_send', 'create_job_invoice_and_send'].includes(onAccept);
  const shouldRunStudioWorkflow = !isShop && onAccept === 'create_job_invoice_and_send';

  if (!shouldRunShopWorkflow && !shouldRunStudioWorkflow) {
    return { jobId, invoiceId, isShop };
  }

  try {
    const { createInvoiceFromQuoteInternal, createInvoiceFromJobInternal, sendInvoiceToCustomer } = require('./invoiceController');
    if (isShop) {
      const invoice = await createInvoiceFromQuoteInternal(tenantId, quote.id, actorUserId || quote.createdBy || null);
      if (invoice) {
        invoiceId = invoice.id;
        setImmediate(async () => {
          try {
            await sendInvoiceToCustomer(tenantId, invoice, {
              userId: actorUserId || quote.createdBy || null,
              deliverySource: 'quote_accept_shop_workflow'
            });
          } catch (sendErr) {
            console.error('[Quote] Background sendInvoiceToCustomer (shop accept) failed:', sendErr?.message || sendErr);
          }
        });
      }
    } else {
      const jobResult = await convertQuoteToJobInternal(tenantId, quote.id, actorUserId || null);
      if (jobResult?.job) {
        jobId = jobResult.job.id;
        const invoice = await createInvoiceFromJobInternal(tenantId, jobResult.job.id, actorUserId || quote.createdBy || null);
        if (invoice) {
          invoiceId = invoice.id;
          setImmediate(async () => {
            try {
              await sendInvoiceToCustomer(tenantId, invoice, {
                userId: actorUserId || quote.createdBy || null,
                deliverySource: 'quote_accept_job_workflow'
              });
            } catch (sendErr) {
              console.error('[Quote] Background sendInvoiceToCustomer (job accept) failed:', sendErr?.message || sendErr);
            }
          });
        }
      }
    }
  } catch (err) {
    console.error('[Quote] runQuoteAcceptWorkflow failed:', err?.message);
  }

  return { jobId, invoiceId, isShop };
}

exports.getQuoteByViewToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    const quote = await Quote.findOne({
      where: { viewToken: token },
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email', 'phone'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found or link has expired'
      });
    }

    const tenantId = quote.tenantId;
    const organization = await resolveDocumentOrganization({
      tenantId,
      shop: quote.shop || null,
      studioLocation: quote.studioLocation || null,
    });

    // So the view-quote page can show "Your comment has been sent" after refresh (comment doesn't change quote status)
    const latestCustomerResponse = await QuoteActivity.findOne({
      where: { quoteId: quote.id, tenantId },
      order: [['createdAt', 'DESC']],
      attributes: ['metadata'],
      raw: true
    });
    const meta = latestCustomerResponse?.metadata || {};
    const customerResponseSummary = (meta.source === 'customer_response' && meta.action)
      ? { responded: true, lastAction: meta.action }
      : null;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).json({
      success: true,
      data: {
        quote: formatQuoteResponse(quote),
        organization,
        ...(customerResponseSummary && { customerResponseSummary })
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateQuote = async (req, res, next) => {
  try {
    const { items = [], taxRate: bodyTaxRate, ...quoteData } = sanitizePayload(req.body);

    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id }),
      include: [{ model: QuoteItem, as: 'items' }]
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (quote.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Accepted quotes cannot be modified'
      });
    }

    const previousStatus = quote.status;

    // Replace line items first so accept → job/invoice uses the same lines the user saved.
    await QuoteItem.destroy({ where: applyTenantFilter(req.tenantId, { quoteId: quote.id }) });
    if (items.length) {
      const quoteItems = items.map((item) => ({
        quoteId: quote.id,
        tenantId: req.tenantId,
        productId: item.productId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        discountPercent: item.discountPercent || 0,
        discountReason: item.discountReason || null,
        total: item.total || ((parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)) - parseFloat(item.discountAmount || 0)),
        metadata: item.metadata || {}
      }));
      await QuoteItem.bulkCreate(quoteItems);
    }

    const totals = calculateTotals(items);
    const taxConfig = await getTaxConfigForTenant(req.tenantId);
    const rateOverride = bodyTaxRate !== undefined ? bodyTaxRate : quote.taxRate;
    const taxSummary = computeQuoteTaxSummary(
      parseFloat(totals.subtotal),
      parseFloat(totals.discountTotal),
      taxConfig,
      rateOverride
    );

    await quote.update({
      ...quoteData,
      ...pickStudioQuotationFields(quoteData),
      ...(quoteData.status === 'accepted' && previousStatus !== 'accepted' ? { acceptedAt: new Date() } : {}),
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxRate: taxSummary.appliedTaxRate.toFixed(2),
      taxAmount: taxSummary.taxAmount.toFixed(2),
      totalAmount: taxSummary.total.toFixed(2)
    });

    let workflowResult = { jobId: null, invoiceId: null, isShop: false };

    if (quoteData.status && quoteData.status !== previousStatus && quoteData.status) {
      const statusLabels = {
        draft: 'Draft',
        sent: 'Sent',
        accepted: 'Accepted',
        declined: 'Declined',
        expired: 'Expired'
      };
      const oldStatusLabel = statusLabels[previousStatus] || previousStatus;
      const newStatusLabel = statusLabels[quoteData.status] || quoteData.status;
      await QuoteActivity.create({
        quoteId: quote.id,
        tenantId: req.tenantId,
        type: 'status_change',
        subject: 'Status Updated',
        notes: `Status changed from ${oldStatusLabel} to ${newStatusLabel}`,
        createdBy: req.user?.id || null,
        metadata: {
          oldStatus: previousStatus,
          newStatus: quoteData.status
        }
      });

      if (quoteData.status === 'accepted' && previousStatus !== 'accepted') {
        workflowResult = await runQuoteAcceptWorkflow(req.tenantId, quote, req.user?.id || null);
      }
    } else {
      await QuoteActivity.create({
        quoteId: quote.id,
        tenantId: req.tenantId,
        type: 'note',
        subject: 'Quote Updated',
        notes: 'Details were updated',
        createdBy: req.user?.id || null,
        metadata: {}
      });
    }

    const fullQuote = await Quote.findOne({
      where: applyTenantFilter(req.tenantId, { id: quote.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        ...formatQuoteResponse(fullQuote),
        ...(workflowResult.jobId && { jobId: workflowResult.jobId }),
        ...(workflowResult.invoiceId && { invoiceId: workflowResult.invoiceId })
      }
    });
  } catch (error) {
    console.error(`Error updating quote ${req.params.id}:`, error);
    next(error);
  }
};

const STATUS_NEXT = { draft: 'sent', sent: 'accepted' };
const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };

exports.updateQuoteStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id })
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    const nextStatus = STATUS_NEXT[quote.status];
    if (!nextStatus || status !== nextStatus) {
      return res.status(400).json({
        success: false,
        message: `Quote can only be marked as ${STATUS_LABELS[nextStatus] || 'next status'} from ${STATUS_LABELS[quote.status]}`
      });
    }

    const previousStatus = quote.status;
    await quote.update({
      status,
      ...(status === 'accepted' ? { acceptedAt: new Date() } : {})
    });

    let workflowResult = { jobId: null, invoiceId: null, isShop: false };
    if (status === 'accepted' && previousStatus !== 'accepted') {
      workflowResult = await runQuoteAcceptWorkflow(req.tenantId, quote, req.user?.id || null);
    }

    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId: req.tenantId,
      type: 'status_change',
      subject: 'Status Updated',
      notes: `Status changed from ${STATUS_LABELS[previousStatus]} to ${STATUS_LABELS[status]}`,
      createdBy: req.user?.id || null,
      metadata: { oldStatus: previousStatus, newStatus: status }
    });

    const updated = await Quote.findOne({
      where: applyTenantFilter(req.tenantId, { id: quote.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        ...formatQuoteResponse(updated),
        ...(workflowResult.jobId && { jobId: workflowResult.jobId }),
        ...(workflowResult.invoiceId && { invoiceId: workflowResult.invoiceId })
      }
    });
  } catch (error) {
    console.error(`Error updating quote status ${req.params.id}:`, error);
    next(error);
  }
};

exports.deleteQuote = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id }),
      transaction
    });

    if (!quote) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (quote.status === 'accepted') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Accepted quotes cannot be deleted'
      });
    }

    const [linkedJobs, linkedInvoices] = await Promise.all([
      Job.count({
        where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
        transaction
      }),
      Invoice.count({
        where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
        transaction
      })
    ]);

    if (linkedJobs > 0 || linkedInvoices > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete quote with linked jobs or invoices'
      });
    }

    await QuoteActivity.destroy({
      where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
      transaction
    });
    await QuoteItem.destroy({
      where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
      transaction
    });
    await quote.destroy({ transaction });
    await transaction.commit();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error(`Error deleting quote ${req.params.id}:`, error);
    next(error);
  }
};

exports.convertQuoteToJob = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    // First, fetch quote without includes to avoid FOR UPDATE with JOIN issue
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id }),
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!quote) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Check if a job already exists for this quote
    const existingJob = await Job.findOne({
      where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
      transaction
    });

    if (existingJob) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'A job has already been created from this quote',
        data: {
          jobId: existingJob.id,
          jobNumber: existingJob.jobNumber
        }
      });
    }

    // Fetch related data separately (customer and items)
    const customer = await Customer.findOne({
      where: applyTenantFilter(req.tenantId, { id: quote.customerId }),
      transaction
    });

    const quoteItems = await QuoteItem.findAll({
      where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
      transaction
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const lastJob = await Job.findOne({
      where: {
        tenantId: req.tenantId,
        jobNumber: {
          [Op.like]: `JOB-${year}${month}%`
        }
      },
      order: [['createdAt', 'DESC']],
      transaction
    });

    let sequence = 1;
    if (lastJob) {
      const lastSequence = parseInt(lastJob.jobNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }

    const jobNumber = `JOB-${year}${month}-${String(sequence).padStart(4, '0')}`;

    // Optional job fields from request body (startDate, dueDate, assignedTo)
    const { startDate, dueDate, assignedTo } = req.body || {};

    const paymentIntent = resolveJobCreatePaymentIntent(req.body || {}, {
      jobTotal: quote.totalAmount,
    });
    if (!paymentIntent.ok) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: paymentIntent.error,
      });
    }

    // Normalize optional dates to Date objects if provided
    const parseDate = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const job = await Job.create({
      jobNumber,
      quoteId: quote.id,
      customerId: quote.customerId,
      title: quote.title,
      description: quote.description,
      status: 'new',
      priority: 'medium',
      quotedPrice: quote.totalAmount,
      finalPrice: quote.totalAmount,
      notes: quote.notes,
      attachments: Array.isArray(quote.attachments) ? quote.attachments : [],
      tenantId: req.tenantId,
      studioLocationId: resolveStudioLocationIdForJobFromQuote(req, quote),
      createdBy: req.user?.id || null,
      startDate: parseDate(startDate),
      dueDate: parseDate(dueDate),
      assignedTo: assignedTo || null
    }, { transaction });

    if (quoteItems && quoteItems.length) {
      const jobItems = quoteItems.map(item => ({
        jobId: job.id,
        quoteItemId: item.id,
        tenantId: req.tenantId,
        category: resolveQuoteItemCategory(item),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        discountPercent: item.discountPercent || 0,
        discountReason: item.discountReason || null,
        totalPrice: item.total,
        specifications: item.metadata || {}
      }));
      await JobItem.bulkCreate(jobItems, { transaction });
    }

    if (quoteItems.length) {
      const primaryCategory = resolveQuoteItemCategory(quoteItems[0]);
      if (primaryCategory) {
        await job.update({ jobType: primaryCategory }, { transaction });
      }
    }

    await JobStatusHistory.create({
      jobId: job.id,
      status: 'new',
      comment: `Job created from quote ${quote.quoteNumber}`,
      changedBy: req.user?.id || null,
      tenantId: req.tenantId
    }, { transaction });

    await quote.update({
      status: 'accepted',
      acceptedAt: new Date()
    }, { transaction });

    // Create activity for quote-to-job conversion
    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId: req.tenantId,
      type: 'conversion',
      subject: 'Quote Converted to Job',
      notes: `Quote converted to job ${jobNumber}`,
      createdBy: req.user?.id || null,
      metadata: {
        jobId: job.id,
        jobNumber: jobNumber
      }
    }, { transaction });

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

    const updatedQuote = await Quote.findOne({
      where: applyTenantFilter(req.tenantId, { id: quote.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    try {
      await activityLogger.logJobCreated(jobWithDetails, req.user?.id || null);
      if (jobWithDetails.assignedTo) {
        await activityLogger.logJobAssigned(jobWithDetails, req.user?.id || null);
      }
    } catch (logErr) {
      console.error('Failed to log job created/assigned activity:', logErr?.message);
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
          const {
            runJobAssignedStaffAutomations,
            runJobCreatedStaffAutomations,
          } = require('../services/automationEngineService');
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
          console.error('[convertQuoteToJob] staff automations failed:', automationErr?.message || automationErr);
        }
      });
    }

    try {
      const { maybeSendJobTrackingNotificationsOnJobCreated } = require('../services/jobCustomerTrackingService');
      await maybeSendJobTrackingNotificationsOnJobCreated({
        tenantId: req.tenantId,
        jobId: jobWithDetails.id,
        triggeredByUserId: req.user?.id || null
      });
    } catch (trackNotifyErr) {
      console.error('[convertQuoteToJob] Job tracking notification failed:', trackNotifyErr?.message);
    }

    try {
      await activityLogger.logQuoteAccepted(updatedQuote, req.user?.id || null);
    } catch (logErr) {
      console.error('Failed to log quote accepted activity:', logErr?.message);
    }

    let createdInvoice = null;
    try {
      const workflowSetting = await Setting.findOne({ where: { tenantId: req.tenantId, key: 'quote-workflow' } });
      const onAccept = workflowSetting?.value?.onAccept || 'record_only';
      if (onAccept === 'create_job_invoice_and_send') {
        const { createInvoiceFromJobInternal, sendInvoiceToCustomer } = require('./invoiceController');
        const { applyJobCreatePaymentToInvoice } = require('./jobController');
        createdInvoice = await createInvoiceFromJobInternal(req.tenantId, jobWithDetails.id, req.user?.id || null);
        if (createdInvoice) {
          const payResult = await applyJobCreatePaymentToInvoice({
            tenantId: req.tenantId,
            userId: req.user?.id || null,
            invoice: createdInvoice,
            paymentIntent,
          });
          createdInvoice = payResult.invoice || createdInvoice;
          await sendInvoiceToCustomer(req.tenantId, createdInvoice, {
            userId: req.user?.id || null,
            deliverySource: 'quote_to_job_workflow',
            skipPaidReceipt: payResult.skipPaidReceipt,
          });
        }
      }
    } catch (invoiceErr) {
      console.error('[convertQuoteToJob] Invoice creation/send failed:', invoiceErr?.message);
    }

    res.status(200).json({
      success: true,
      data: {
        quote: formatQuoteResponse(updatedQuote),
        job: jobWithDetails,
        ...(createdInvoice && { invoice: createdInvoice })
      }
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error(`Error converting quote ${req.params.id} to job:`, error);
    next(error);
  }
};

exports.addQuoteActivity = async (req, res, next) => {
  try {
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id })
    });
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    const payload = sanitizePayload(req.body);

    const activity = await QuoteActivity.create({
      quoteId: quote.id,
      tenantId: req.tenantId,
      type: payload.type || 'note',
      subject: payload.subject || null,
      notes: payload.notes || null,
      createdBy: req.user?.id || null,
      nextStep: payload.nextStep || null,
      followUpDate: payload.followUpDate || null,
      metadata: payload.metadata || {}
    });

    const populatedActivity = await QuoteActivity.findOne({
      where: applyTenantFilter(req.tenantId, { id: activity.id }),
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(201).json({ success: true, data: populatedActivity });
  } catch (error) {
    next(error);
  }
};

exports.getQuoteActivities = async (req, res, next) => {
  try {
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id })
    });
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    const activities = await QuoteActivity.findAll({
      where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'createdByUser', attributes: ['id', 'name', 'email'] }]
    });

    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
};

exports.convertQuoteToSale = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    // First, fetch quote without includes to avoid FOR UPDATE with JOIN issue
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id }),
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!quote) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (quote.status === 'accepted') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Quote has already been converted'
      });
    }

    // Check if a sale already exists for this quote
    const existingSale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { 
        metadata: { quoteId: quote.id }
      }),
      transaction
    });

    if (existingSale) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'A sale has already been created from this quote',
        data: {
          saleId: existingSale.id,
          saleNumber: existingSale.saleNumber
        }
      });
    }

    // Fetch related data separately
    const customer = await Customer.findOne({
      where: applyTenantFilter(req.tenantId, { id: quote.customerId }),
      transaction
    });

    const quoteItems = await QuoteItem.findAll({
      where: applyTenantFilter(req.tenantId, { quoteId: quote.id }),
      transaction
    });    // Get payment method from request body (default to 'credit' for quote conversions)
    const paymentMethod = req.body.paymentMethod || 'credit';
    const shopId = req.body.shopId || null;
    if (paymentMethod === 'credit' && !quote.customerId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Customer is required for credit or partially unpaid sales'
      });
    }

    // Generate sale number
    const prefix = 'SALE';
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    
    const count = await Sale.count({
      where: {
        tenantId: req.tenantId,
        createdAt: {
          [Op.between]: [startOfDay, endOfDay]
        }
      },
      transaction
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    const saleNumber = `${prefix}-${dateStr}-${sequence}`;

    const subtotal = parseFloat(quote.subtotal || 0);
    const discount = parseFloat(quote.discountTotal || 0);
    const tax = parseFloat(quote.taxAmount || 0);
    const total = parseFloat(quote.totalAmount || 0);
    const amountPaid = paymentMethod === 'credit' ? 0 : total;
    const change = 0;

    const taxConfig = await getTaxConfigForTenant(req.tenantId);
    const taxSummary = computeQuoteTaxSummary(subtotal, discount, taxConfig, quote.taxRate);

    // Create sale
    const sale = await Sale.create({
      tenantId: req.tenantId,
      shopId: shopId,
      saleNumber,
      customerId: quote.customerId,
      subtotal,
      discount,
      tax,
      total,
      paymentMethod,
      amountPaid,
      change,
      status: paymentMethod === 'credit' ? 'pending' : 'completed',
      soldBy: req.user?.id || null,
      notes: `Converted from quote ${quote.quoteNumber}`,
      metadata: {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        taxDetail: {
          ratePercent: parseFloat(quote.taxRate) || 0,
          pricesAreTaxInclusive: taxConfig.pricesAreTaxInclusive,
          taxableExclusive: taxSummary.netTaxable,
          taxAmount: tax
        }
      }
    }, { transaction });

    // Create sale items from quote items
    // Note: SaleItems require productId, but quotes may not have products
    // For now, we'll create sale items with minimal product info
    // In production, you might want to require products to be linked to quotes first
    const linesForTax = (quoteItems || []).map((qi) => ({
      quantity: qi.quantity,
      unitPrice: qi.unitPrice,
      discount: qi.discountAmount || 0
    }));
    const lineTaxBreakdown =
      linesForTax.length > 0
        ? computeDocumentTax({
            lines: linesForTax,
            cartDiscount: 0,
            config: {
              ...taxConfig,
              enabled: tax > 0,
              defaultRatePercent: parseFloat(quote.taxRate) || taxConfig.defaultRatePercent
            }
          }).lineResults
        : [];

    if (quoteItems && quoteItems.length) {
      for (let qi = 0; qi < quoteItems.length; qi++) {
        const quoteItem = quoteItems[qi];
        const productId = quoteItem.metadata?.productId || null;

        if (!productId) {
          console.warn(`Skipping quote item ${quoteItem.id} - no productId found`);
          continue;
        }
        const itemSubtotal = parseFloat(quoteItem.quantity || 0) * parseFloat(quoteItem.unitPrice || 0);
        const itemDiscount = parseFloat(quoteItem.discountAmount || 0);
        const lr = lineTaxBreakdown[qi] || { tax: 0, exclusive: 0, gross: 0 };
        const itemTax = lr.tax;
        const itemTotal = Math.round((lr.exclusive + lr.tax) * 100) / 100;

        await SaleItem.create({
          saleId: sale.id,
          productId: productId,
          productVariantId: quoteItem.metadata?.productVariantId || null,
          name: quoteItem.description,
          sku: quoteItem.metadata?.sku || null,
          quantity: quoteItem.quantity,
          unitPrice: quoteItem.unitPrice,
          discount: itemDiscount,
          tax: itemTax,
          subtotal: itemSubtotal,
          total: itemTotal,
          metadata: {
            quoteItemId: quoteItem.id,
            ...quoteItem.metadata
          }
        }, { transaction });
      }
    }

    // Update quote status
    await quote.update({
      status: 'accepted',
      acceptedAt: new Date()
    }, { transaction });    // Create activity for quote-to-sale conversion
    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId: req.tenantId,
      type: 'conversion',
      subject: 'Quote Converted to Sale',
      notes: `Quote converted to sale ${saleNumber}`,
      createdBy: req.user?.id || null,
      metadata: {
        saleId: sale.id,
        saleNumber: saleNumber,
        paymentMethod: paymentMethod
      }
    }, { transaction });    // Create activity for sale creation
    await SaleActivity.create({
      saleId: sale.id,
      tenantId: req.tenantId,
      type: 'note',
      subject: 'Sale Created from Quote',
      notes: `Sale created from quote ${quote.quoteNumber}`,
      createdBy: req.user?.id || null,
      metadata: {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        action: 'created_from_quote'
      }
    }, { transaction });

    await transaction.commit();

    // Auto-create invoice for credit sales (outside transaction)
    if (paymentMethod === 'credit') {
      try {
        const { autoCreateInvoiceFromSale } = require('./saleController');
        console.log(`[ConvertQuoteToSale] Attempting to auto-create invoice for sale ${sale.id}`);
        const autoGeneratedInvoice = await autoCreateInvoiceFromSale(sale.id, req.tenantId);
        if (autoGeneratedInvoice) {
          console.log(`[ConvertQuoteToSale] ✅ Invoice auto-created: ${autoGeneratedInvoice.invoiceNumber}`);
        } else {
          throw new Error('Failed to create invoice for credit sale');
        }
      } catch (invoiceError) {
        console.error('[ConvertQuoteToSale] ❌ Failed to auto-create invoice:', invoiceError);
        throw invoiceError;
      }
    }    // Fetch sale with relations
    const createdSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'seller', attributes: ['id', 'name', 'email'] },
        {
          model: SaleItem,
          as: 'items',
          include: [
            { model: require('../models').Product, as: 'product' },
            { model: require('../models').ProductVariant, as: 'variant' }
          ]
        }
      ]
    });

    const updatedQuote = await Quote.findOne({
      where: applyTenantFilter(req.tenantId, { id: quote.id }),
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: QuoteItem, as: 'items' },
        ...quoteBranchIncludes()
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        quote: formatQuoteResponse(updatedQuote),
        sale: createdSale
      }
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error(`Error converting quote ${req.params.id} to sale:`, error);
    next(error);
  }
};

/**
 * Upload a typed attachment on a quote (proposal / requirements / agreement / other).
 * @route POST /api/quotes/:id/attachments
 */
exports.uploadQuoteAttachment = async (req, res, next) => {
  try {
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id }),
    });
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }
    if (!QUOTE_ATTACHMENT_EDITABLE_STATUSES.has(quote.status)) {
      return res.status(400).json({
        success: false,
        message: 'Attachments can only be added while the quote is draft or sent',
      });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const attachmentType = String(req.body?.type || req.query?.type || 'other').toLowerCase();
    if (!QUOTE_ATTACHMENT_TYPES.has(attachmentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attachment type. Use proposal, requirements, agreement, or other.',
      });
    }

    const mimeType = req.file.mimetype || 'application/octet-stream';
    let fileData;
    if (req.file.buffer) {
      fileData = `data:${mimeType};base64,${req.file.buffer.toString('base64')}`;
    } else {
      return res.status(400).json({ success: false, message: 'Unable to process uploaded file' });
    }

    const attachment = {
      id: uuidv4(),
      type: attachmentType,
      originalName: req.file.originalname,
      mimeType,
      size: req.file.size,
      fileData,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user
        ? { id: req.user.id, name: req.user.name, email: req.user.email }
        : null,
    };

    const attachments = Array.isArray(quote.attachments) ? [...quote.attachments] : [];
    attachments.push(attachment);
    quote.attachments = attachments;
    quote.changed('attachments', true);
    await quote.save();

    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId: req.tenantId,
      type: 'note',
      subject: 'Attachment added',
      notes: `Added ${attachmentType} file: ${attachment.originalName}`,
      createdBy: req.user?.id || null,
      metadata: {
        action: 'attachment_added',
        attachmentId: attachment.id,
        attachmentType,
        originalName: attachment.originalName,
      },
    });

    return res.status(201).json({
      success: true,
      data: formatQuoteAttachment(attachment, { includeFile: true }),
      attachments: formatQuoteAttachments(attachments, { includeFile: true }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a quote attachment.
 * @route DELETE /api/quotes/:id/attachments/:attachmentId
 */
exports.deleteQuoteAttachment = async (req, res, next) => {
  try {
    const quote = await Quote.findOne({
      where: quoteWhere(req, { id: req.params.id }),
    });
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }
    if (!QUOTE_ATTACHMENT_EDITABLE_STATUSES.has(quote.status)) {
      return res.status(400).json({
        success: false,
        message: 'Attachments can only be removed while the quote is draft or sent',
      });
    }

    const attachments = Array.isArray(quote.attachments) ? [...quote.attachments] : [];
    const index = attachments.findIndex((item) => item.id === req.params.attachmentId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const [removed] = attachments.splice(index, 1);
    quote.attachments = attachments;
    quote.changed('attachments', true);
    await quote.save();

    await QuoteActivity.create({
      quoteId: quote.id,
      tenantId: req.tenantId,
      type: 'note',
      subject: 'Attachment removed',
      notes: `Removed ${removed?.type || 'other'} file: ${removed?.originalName || 'Attachment'}`,
      createdBy: req.user?.id || null,
      metadata: {
        action: 'attachment_removed',
        attachmentId: removed?.id,
        attachmentType: removed?.type,
        originalName: removed?.originalName,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Attachment removed',
      attachments: formatQuoteAttachments(attachments, { includeFile: true }),
    });
  } catch (error) {
    next(error);
  }
};

// Exported for unit tests
exports._formatQuoteResponse = formatQuoteResponse;
exports._formatQuoteAttachments = formatQuoteAttachments;
exports._QUOTE_ATTACHMENT_TYPES = QUOTE_ATTACHMENT_TYPES;