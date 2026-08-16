const { Customer, Tenant, SabitoTenantMapping } = require('../models');
const { verifySabitoWebhook } = require('../middleware/webhookAuth');
const whatsappService = require('../services/whatsappService');
const paystackService = require('../services/paystackService');
const { handlePaystackTransferWebhook } = require('../services/marketplacePayoutService');
const {
  applyPaystackChargeToInvoiceFromTx,
  getPaystackInvoiceLinkMetadata,
  parseInvoiceIdFromPublicPaystackReference
} = require('../services/paystackPublicInvoicePayment');
const { applySubscriptionFromTransaction } = require('./subscriptionController');

/**
 * Handle WhatsApp webhook from Meta
 * GET /api/webhooks/whatsapp - Webhook verification
 * POST /api/webhooks/whatsapp - Webhook events
 */
exports.handleWhatsAppWebhook = async (req, res) => {
  try {
    // Handle webhook verification (GET request)
    if (req.method === 'GET') {
      const hub = req.query?.hub && typeof req.query.hub === 'object' ? req.query.hub : {};
      const mode = req.query['hub.mode'] || hub.mode;
      const token = req.query['hub.verify_token'] || hub.verify_token;
      const challenge = req.query['hub.challenge'] || hub.challenge;

      if (mode === 'subscribe' && await whatsappService.matchesWebhookVerifyToken(token)) {
        console.log('[WhatsApp Webhook] Verification successful');
        return res.status(200).send(challenge);
      }

      // Some providers (and occasional Meta probes) hit the callback URL
      // without hub.* query params. Return 200 so health/probe checks don't
      // get treated as hard verification failures.
      if (!mode && !token && !challenge) {
        console.log('[WhatsApp Webhook] Probe received without verification params');
        return res.status(200).send('OK');
      }

      console.error('[WhatsApp Webhook] Verification failed', { mode, hasToken: Boolean(token) });
      return res.status(403).send('Forbidden');
    }

    // Handle webhook events (POST request)
    if (req.method === 'POST') {
      const signature = req.headers['x-hub-signature-256'];
      const appSecret = process.env.WHATSAPP_APP_SECRET;
      
      // Verify signature if app secret is configured
      if (appSecret && signature) {
        const rawBody =
          req.rawBody && Buffer.isBuffer(req.rawBody)
            ? req.rawBody.toString('utf8')
            : JSON.stringify(req.body);
        const isValid = whatsappService.verifyWebhookSignature(signature, rawBody, appSecret);
        
        if (!isValid) {
          console.error('[WhatsApp Webhook] Invalid signature');
          return res.status(401).json({
            success: false,
            message: 'Invalid webhook signature'
          });
        }
      }

      const webhookData = req.body;
      let results = [];
      try {
        results = whatsappService.handleWebhook(webhookData) || [];
      } catch (handlerErr) {
        console.error('[WhatsApp Webhook] handleWebhook failed:', handlerErr?.message || handlerErr);
        return res.status(200).json({ success: true, message: 'Webhook acknowledged' });
      }

      // Process webhook results (update message status, handle incoming messages, etc.)
      for (const result of results) {
        const tenantId = await whatsappService.findTenantIdByPhoneNumberId(result.phoneNumberId);
        if (result.type === 'status') {
          console.log('[WhatsApp Webhook] Message status update:', {
            messageId: result.messageId,
            status: result.status,
            recipientId: result.recipientId?.substring(0, 7) + '***' // Partial for privacy
          });
          await whatsappService.recordEvent({
            tenantId,
            phoneNumberId: result.phoneNumberId || null,
            messageId: result.messageId || null,
            direction: 'outbound',
            eventType: 'status',
            status: result.status || null,
            recipientPhone: result.recipientId || null,
            payload: result.payload || {},
            occurredAt: result.timestamp ? new Date(Number(result.timestamp) * 1000) : new Date()
          });
        } else if (result.type === 'message') {
          console.log('[WhatsApp Webhook] Incoming message:', {
            messageId: result.messageId,
            from: result.from?.substring(0, 7) + '***',
            messageType: result.messageType
          });
          await whatsappService.recordEvent({
            tenantId,
            phoneNumberId: result.phoneNumberId || null,
            messageId: result.messageId || null,
            direction: 'inbound',
            eventType: 'message',
            status: 'received',
            senderPhone: result.from || null,
            payload: result.payload || {},
            metadata: { messageType: result.messageType, textPreview: result.text ? String(result.text).slice(0, 200) : null },
            occurredAt: result.timestamp ? new Date(Number(result.timestamp) * 1000) : new Date()
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Webhook processed'
      });
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });

  } catch (error) {
    console.error('[WhatsApp Webhook] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

/**
 * Handle customer webhook from Sabito
 * POST /api/webhooks/sabito/customer
 */
exports.handleSabitoCustomerWebhook = async (req, res) => {
  try {
    console.log('[Sabito Webhook] Received request:', {
      method: req.method,
      path: req.path,
      headers: {
        'x-api-key': req.headers['x-api-key'] ? 'present' : 'missing',
        'x-tenant-id': req.headers['x-tenant-id'] || 'missing',
        'x-sabito-signature': req.headers['x-sabito-signature'] ? 'present' : 'missing'
      },
      body: req.body
    });

    // 1. Verify webhook signature
    const isValid = verifySabitoWebhook(req);
    if (!isValid) {
      console.error('[Sabito Webhook] Authentication failed');
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature or API key'
      });
    }

    console.log('[Sabito Webhook] Authentication successful');

    const { event, data } = req.body;

    // Validate event type
    if (event !== 'customer.created') {
      return res.status(400).json({
        success: false,
        message: `Unsupported event type: ${event}`
      });
    }

    // Extract data from req.body.data
    const {
      sabitoCustomerId,
      sourceReferralId,
      sourceType,
      businessId,
      businessName,
      customer: customerData
    } = data || {};

    // Validate required fields
    if (!sabitoCustomerId || !customerData || !customerData.email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sabitoCustomerId, customer.email'
      });
    }

    // 2. Map Sabito business ID to ABS tenant ID
    if (!businessId) {
      console.error('[Sabito Webhook] Missing businessId in webhook data');
      return res.status(400).json({
        success: false,
        message: 'Missing required field: businessId in data'
      });
    }

    console.log('[Sabito Webhook] Looking up tenant mapping for businessId:', businessId);
    
    const mapping = await SabitoTenantMapping.findOne({
      where: { sabitoBusinessId: businessId },
      include: [{
        model: Tenant,
        as: 'tenant'
      }]
    });

    if (!mapping) {
      // Auto-create mapping if tenant ID is provided in header and tenant exists
      const headerTenantId = req.headers['x-tenant-id'];
      
      if (headerTenantId) {
        console.log('[Sabito Webhook] No mapping found, attempting auto-create with tenant ID from header:', headerTenantId);
        
        const tenant = await Tenant.findByPk(headerTenantId);
        
        if (tenant && tenant.status === 'active') {
          // Auto-create the mapping
          try {
            const newMapping = await SabitoTenantMapping.create({
              sabitoBusinessId: businessId,
              nexproTenantId: headerTenantId,
              businessName: businessName || tenant.name
            });
            
            console.log('[Sabito Webhook] ✅ Auto-created tenant mapping:', {
              sabitoBusinessId: businessId,
              nexproTenantId: headerTenantId,
              mappingId: newMapping.id
            });
            
            // Fetch the mapping with tenant relationship
            mapping = await SabitoTenantMapping.findByPk(newMapping.id, {
              include: [{
                model: Tenant,
                as: 'tenant'
              }]
            });
          } catch (mappingError) {
            console.error('[Sabito Webhook] Error auto-creating mapping:', mappingError);
            return res.status(500).json({
              success: false,
              message: 'Failed to auto-create tenant mapping',
              error: mappingError.message,
              businessId: businessId
            });
          }
        } else {
          console.error('[Sabito Webhook] Tenant not found or inactive:', headerTenantId);
          return res.status(404).json({
            success: false,
            message: `Tenant not found or inactive: ${headerTenantId}`,
            businessId: businessId,
            hint: 'Please ensure the tenant ID in the x-tenant-id header exists and is active.'
          });
        }
      } else {
        // No tenant ID in header, can't auto-create
        console.error('[Sabito Webhook] No tenant mapping found and no x-tenant-id header provided');
        return res.status(404).json({
          success: false,
          message: `No tenant mapping found for Sabito business ID: ${businessId}. Include a valid tenant ID in the x-tenant-id header to auto-create the mapping.`,
          businessId: businessId,
          businessName: businessName || null,
          hint: 'The mapping will be created automatically if a valid tenant ID is provided in the x-tenant-id header.'
        });
      }
    }

    const tenantId = mapping.nexproTenantId;
    const tenant = mapping.tenant;

    if (!tenant) {
      console.error('[Sabito Webhook] Tenant not found for mapped ID:', tenantId);
      return res.status(404).json({
        success: false,
        message: `Tenant not found: ${tenantId}`,
        tenantId: tenantId,
        businessId: businessId
      });
    }

    if (tenant.status !== 'active') {
      console.error('[Sabito Webhook] Tenant is not active:', tenantId, tenant.status);
      return res.status(403).json({
        success: false,
        message: `Tenant is not active: ${tenant.status}`,
        tenantId: tenantId
      });
    }

    console.log('[Sabito Webhook] Tenant mapped successfully:', {
      sabitoBusinessId: businessId,
      nexproTenantId: tenantId,
      tenantName: tenant.name
    });

    // 3. Check if customer already exists (by email + tenantId)
    const existingCustomer = await Customer.findOne({
      where: {
        email: customerData.email,
        tenantId: tenantId
      }
    });

    if (existingCustomer) {
      console.log('[Sabito Webhook] Updating existing customer:', existingCustomer.id);
      // Update existing customer with Sabito IDs
      await existingCustomer.update({
        sabitoCustomerId: sabitoCustomerId,
        sabitoSourceReferralId: sourceReferralId || null,
        sabitoSourceType: sourceType || 'referral',
        sabitoBusinessId: businessId,
        howDidYouHear: existingCustomer.howDidYouHear || 'Sabito Referral',
        referralName: sourceReferralId ? 'From Sabito' : existingCustomer.referralName
      });

      console.log('[Sabito Webhook] Customer updated successfully:', existingCustomer.id);
      return res.status(200).json({
        success: true,
        message: 'Customer updated successfully',
        data: {
          customerId: existingCustomer.id,
          sabitoCustomerId: sabitoCustomerId
        }
      });
    }

    // 4. Create new customer
    console.log('[Sabito Webhook] Creating new customer with data:', {
      tenantId,
      name: customerData.name || 'Unknown',
      email: customerData.email,
      sabitoCustomerId
    });

    const newCustomer = await Customer.create({
      tenantId: tenantId,
      name: customerData.name || 'Unknown',
      email: customerData.email,
      phone: customerData.phone || null,
      address: customerData.address || null,
      city: customerData.city || null,
      state: customerData.state || null,
      country: customerData.country || 'USA',
      sabitoCustomerId: sabitoCustomerId,
      sabitoSourceReferralId: sourceReferralId || null,
      sabitoSourceType: sourceType || 'referral',
      sabitoBusinessId: businessId || null,
      howDidYouHear: 'Sabito Referral',
      referralName: sourceReferralId ? 'From Sabito' : null,
      isActive: true // Ensure customer is active
    });

    console.log('[Sabito Webhook] Customer created successfully:', newCustomer.id);
    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: {
        customerId: newCustomer.id,
        sabitoCustomerId: sabitoCustomerId
      }
    });

  } catch (error) {
    console.error('[Sabito Webhook] Error processing webhook:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Handle Paystack webhook (charge.success, etc.)
 * POST /api/webhooks/paystack
 */
exports.handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody || (req.body ? JSON.stringify(req.body) : '');
    const body = typeof req.body === 'object' ? req.body : {};

    if (!paystackService.secretKey) {
      console.error('[Paystack Webhook] PAYSTACK_SECRET_KEY not configured');
      return res.status(503).send('Service unavailable');
    }

    if (signature && rawBody) {
      const isValid = paystackService.verifyWebhookSignature(signature, rawBody);
      if (!isValid) {
        console.error('[Paystack Webhook] Invalid signature');
        return res.status(401).send('Invalid signature');
      }
    }

    const event = body.event;
    const data = body.data || {};

    if (event === 'charge.success') {
      const reference = data.reference;
      if (!reference) {
        console.error('[Paystack Webhook] charge.success missing reference');
        return res.status(400).send('Missing reference');
      }

      const result = await paystackService.verifyTransaction(reference);
      if (!result.status || !result.data) {
        console.error('[Paystack Webhook] Verify failed:', result.message);
        return res.status(400).send('Verification failed');
      }

      const tx = result.data;
      const metadata = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});
      const invLink = getPaystackInvoiceLinkMetadata(metadata);
      const refInvoiceId = parseInvoiceIdFromPublicPaystackReference(reference);

      // Log for debugging Paystack webhook (invoice payments)
      if (String(metadata.type || '').toLowerCase() === 'invoice' || invLink.paymentToken || refInvoiceId) {
        console.log('[Paystack Webhook] charge.success for invoice payment', {
          reference,
          paymentToken: invLink.paymentToken,
          invoiceId: invLink.invoiceId,
          tenantId: invLink.tenantId,
          refInvoiceId,
          metadataKeys: Object.keys(metadata || {})
        });
      }

      // POS sale: metadata has sale_id and tenant_id (no plan)
      if (metadata.sale_id && metadata.tenant_id && !metadata.plan) {
        const { Sale, Tenant } = require('../models');
        const sale = await Sale.findOne({
          where: { id: metadata.sale_id, tenantId: metadata.tenant_id }
        });
        const saleTotal = parseFloat(sale?.total || 0);
        const currentPaid = parseFloat(sale?.amountPaid || 0);
        const balanceDue = Math.max(saleTotal - currentPaid, 0);
        if (sale && sale.status !== 'cancelled' && sale.status !== 'refunded' && balanceDue > 0) {
          const amount = parseFloat(tx.amount || 0) / 100;
          const appliedAmount = Number.isFinite(balanceDue) && balanceDue > 0 ? Math.min(amount, balanceDue) : amount;
          const newAmountPaid = Math.min(currentPaid + appliedAmount, saleTotal);
          const nextStatus = newAmountPaid >= saleTotal ? 'completed' : 'partially_paid';
          const channel = String(tx.channel || tx.authorization?.channel || '').toLowerCase();
          const nextPaymentMethod = channel.includes('mobile') || sale.paymentMethod === 'mobile_money' ? 'mobile_money' : 'card';
          const { findTenantWithOptionalColumns } = require('../utils/tenantUtils');
          const tenant = await findTenantWithOptionalColumns(metadata.tenant_id);
          const pc = tenant?.metadata?.paymentCollection || {};
          const isMoMo = pc.settlementType === 'momo' && pc.momoPhone;
          const useLegacyMomoTransfer = isMoMo && !tenant?.paystackSubaccountCode;

          await sale.update({
            status: nextStatus,
            paymentMethod: nextPaymentMethod,
            amountPaid: newAmountPaid,
            metadata: {
              ...(sale.metadata || {}),
              paystackRef: reference,
              paystackCompletedAt: new Date().toISOString()
            }
          });

          // Legacy MoMo (metadata only, no Paystack subaccount): transfer tenant share to their MoMo.
          // When subaccount exists, split/settlement is handled by Paystack — do not transfer again.
          if (useLegacyMomoTransfer) {
            try {
              const platformFeePercent = parseFloat(process.env.PAYSTACK_PLATFORM_FEE_PERCENT || '2');
              const tenantShare = appliedAmount * (1 - platformFeePercent / 100);
              const tenantSharePesewas = Math.round(tenantShare * 100);
              if (tenantSharePesewas >= 100) {
                let recipientCode = pc.paystackTransferRecipientCode;
                if (!recipientCode) {
                  const momoAccount = (pc.momoPhone || '').replace(/^\+?233/, '0');
                  const recipientRes = await paystackService.createTransferRecipient({
                    type: 'mobile_money',
                    name: tenant?.name || 'Business',
                    account_number: momoAccount || pc.momoPhone,
                    bank_code: paystackService.getMoMoBankCode(pc.momoProvider),
                    currency: 'GHS'
                  });
                  recipientCode = recipientRes?.data?.recipient_code;
                  if (recipientCode && tenant) {
                    tenant.metadata = tenant.metadata || {};
                    tenant.metadata.paymentCollection = tenant.metadata.paymentCollection || {};
                    tenant.metadata.paymentCollection.paystackTransferRecipientCode = recipientCode;
                    await tenant.save();
                  }
                }
                if (recipientCode) {
                  const transferRef = `sale_${metadata.sale_id}_${Date.now()}`.slice(0, 50);
                  await paystackService.initiateTransfer({
                    amount: tenantSharePesewas,
                    recipient: recipientCode,
                    reference: transferRef,
                    reason: `POS sale ${sale.saleNumber}`
                  });
                  console.log('[Paystack Webhook] MoMo transfer initiated for sale:', metadata.sale_id);
                }
              }
            } catch (transferErr) {
              console.error('[Paystack Webhook] MoMo transfer failed for sale:', metadata.sale_id, transferErr?.response?.data || transferErr.message);
            }
          }

          if (nextStatus === 'completed') {
            const { autoCreateInvoiceFromSale, autoSendReceiptIfEnabled } = require('./saleController');
            try {
              await autoCreateInvoiceFromSale(sale.id, metadata.tenant_id);
            } catch (invErr) {
              console.error('[Paystack Webhook] Auto-invoice failed for POS sale:', invErr.message);
            }
            await autoSendReceiptIfEnabled(metadata.tenant_id, sale.id).catch((receiptErr) =>
              console.error('[Paystack Webhook] Auto-send receipt failed for POS sale:', receiptErr?.message || receiptErr)
            );
          }
          const { emitNewSale } = require('../services/websocketService');
          try {
            emitNewSale(metadata.tenant_id, sale);
          } catch (e) {
            console.error('[Paystack Webhook] WebSocket emit error:', e);
          }
          console.log('[Paystack Webhook] POS sale payment applied:', metadata.sale_id);
        }
      } else if (
        ['storefront_order', 'online_store_order'].includes(String(metadata.type || '').toLowerCase())
        && metadata.saleId
      ) {
        const { sequelize } = require('../config/database');
        const { Sale, StorefrontCustomer, OnlineStoreSettings, SaleActivity } = require('../models');
        const {
          recordHeldPaymentForSale,
          recordDirectPaidPaymentForSale,
        } = require('../services/tradeAssuranceService');
        const {
          getSaleCommerceChannel,
          usesTradeAssurance,
          COMMERCE_CHANNELS,
          PAYSTACK_ORDER_TYPES,
        } = require('../utils/storefrontCommerceChannel');
        const { notifyOnlineStoreOrderReceived } = require('../services/notificationService');
        const transaction = await sequelize.transaction();
        try {
          const sale = await Sale.findOne({
            where: { id: metadata.saleId },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!sale) {
            await transaction.rollback();
            console.error('[Paystack Webhook] Storefront order not found:', metadata.saleId);
          } else {
            const saleMetadata = sale.metadata && typeof sale.metadata === 'object' ? { ...sale.metadata } : {};
            const orderType = String(metadata.type || '').toLowerCase();
            const channel = getSaleCommerceChannel({
              ...saleMetadata,
              commerceChannel: metadata.commerceChannel || saleMetadata.commerceChannel || (
                orderType === PAYSTACK_ORDER_TYPES.SABITO_MARKETPLACE || orderType === 'storefront_order'
                  ? COMMERCE_CHANNELS.SABITO_MARKETPLACE
                  : COMMERCE_CHANNELS.ONLINE_STORE
              ),
            });
            const holdTradeAssurance = usesTradeAssurance(channel);
            const tradeAssurance = saleMetadata.tradeAssurance || {};
            const directPayment = saleMetadata.directPayment || {};
            const currentPaymentStatus = tradeAssurance.paymentStatus || directPayment.paymentStatus;
            const paidStatuses = new Set(['paid_held', 'paid', 'paid_direct']);
            if (paidStatuses.has(currentPaymentStatus) || sale.status === 'completed') {
              await transaction.commit();
              console.log('[Paystack Webhook] Storefront order already paid:', metadata.saleId);
            } else if (currentPaymentStatus === 'awaiting_payment' && sale.status === 'pending') {
              const expectedPesewas = Math.round(Number(sale.total) * 100);
              if (Number(tx.amount) !== expectedPesewas) {
                await transaction.rollback();
                console.error('[Paystack Webhook] Storefront order amount mismatch:', metadata.saleId);
              } else {
                const shopper = metadata.storefrontCustomerId
                  ? await StorefrontCustomer.findByPk(metadata.storefrontCustomerId, { transaction })
                  : null;
                const store = await OnlineStoreSettings.findOne({
                  where: {
                    tenantId: sale.tenantId,
                    slug: metadata.storeSlug || saleMetadata.storeSlug || '',
                  },
                  transaction,
                });
                if (holdTradeAssurance) {
                  await recordHeldPaymentForSale({
                    sale,
                    store: store || { currency: 'GHS', slug: metadata.storeSlug },
                    shopper,
                    transaction,
                    provider: 'paystack',
                    providerReference: reference,
                  });
                } else {
                  await recordDirectPaidPaymentForSale({
                    sale,
                    store: store || { currency: 'GHS', slug: metadata.storeSlug },
                    shopper,
                    transaction,
                    provider: 'paystack',
                    providerReference: reference,
                  });
                }
                await SaleActivity.create({
                  saleId: sale.id,
                  tenantId: sale.tenantId,
                  type: 'payment',
                  subject: 'Online order payment confirmed (webhook)',
                  notes: `Paystack webhook confirmed payment ${reference} for order ${sale.saleNumber}`,
                  createdBy: null,
                  metadata: {
                    source: 'online_store',
                    commerceChannel: channel,
                    storefrontCustomerId: metadata.storefrontCustomerId || null,
                    paystackReference: reference,
                  },
                }, { transaction });
                await transaction.commit();
                notifyOnlineStoreOrderReceived({ sale, shopper, store }).catch((notifyError) => {
                  console.error('[Paystack Webhook] Storefront seller notification failed:', notifyError.message);
                });
                console.log('[Paystack Webhook] Storefront order payment confirmed:', metadata.saleId, channel);
              }
            } else {
              await transaction.rollback();
              console.warn('[Paystack Webhook] Storefront order not awaiting payment:', metadata.saleId);
            }
          }
        } catch (storefrontErr) {
          if (transaction && !transaction.finished) await transaction.rollback();
          console.error('[Paystack Webhook] Storefront order handler failed:', storefrontErr.message);
        }
      } else if (String(metadata.type || '').toLowerCase() === 'storefront_service_booking' && metadata.jobId) {
        const { sequelize } = require('../config/database');
        const { Job, Lead } = require('../models');
        const transaction = await sequelize.transaction();
        try {
          const job = await Job.findOne({
            where: { id: metadata.jobId, tenantId: metadata.tenantId },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!job) {
            await transaction.rollback();
            console.error('[Paystack Webhook] Service booking not found:', metadata.jobId);
          } else {
            const jobMetadata = job.metadata && typeof job.metadata === 'object' ? { ...job.metadata } : {};
            const expectedReference = jobMetadata.paystack?.reference;
            const paymentStatus = jobMetadata.paymentStatus || jobMetadata.paystack?.status;
            if (paymentStatus === 'paid' || jobMetadata.paystack?.status === 'success') {
              await transaction.commit();
              console.log('[Paystack Webhook] Service booking already paid:', metadata.jobId);
            } else if (paymentStatus === 'awaiting_payment') {
              if (expectedReference && expectedReference !== reference && expectedReference !== tx.reference) {
                await transaction.rollback();
                console.error('[Paystack Webhook] Service booking reference mismatch:', metadata.jobId);
              } else if (metadata.expectedAmount && Number(tx.amount || 0) < Number(metadata.expectedAmount)) {
                await transaction.rollback();
                console.error('[Paystack Webhook] Service booking amount mismatch:', metadata.jobId);
              } else {
                const paidAt = tx.paid_at || tx.paidAt || new Date().toISOString();
                jobMetadata.paymentStatus = 'paid';
                jobMetadata.paystack = {
                  ...(jobMetadata.paystack || {}),
                  reference: tx.reference || reference,
                  amount: Number(tx.amount || 0) / 100,
                  currency: tx.currency || jobMetadata.paystack?.currency || 'GHS',
                  status: tx.status,
                  channel: tx.channel || null,
                  paidAt,
                };
                jobMetadata.tradeAssurance = {
                  status: 'service_paid',
                  releaseTrigger: 'job_completion',
                  paidAt,
                };
                await job.update({ metadata: jobMetadata }, { transaction });

                if (metadata.leadId) {
                  const lead = await Lead.findOne({
                    where: { id: metadata.leadId, tenantId: metadata.tenantId },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                  });
                  if (lead) {
                    const leadMetadata = lead.metadata && typeof lead.metadata === 'object' ? { ...lead.metadata } : {};
                    await lead.update({
                      status: 'converted',
                      metadata: {
                        ...leadMetadata,
                        paymentStatus: 'paid',
                        paidAt,
                        paystackReference: tx.reference || reference,
                      },
                    }, { transaction });
                  }
                }

                await transaction.commit();
                console.log('[Paystack Webhook] Service booking payment confirmed:', metadata.jobId);
              }
            } else {
              await transaction.rollback();
              console.warn('[Paystack Webhook] Service booking not awaiting payment:', metadata.jobId);
            }
          }
        } catch (serviceBookingErr) {
          if (transaction && !transaction.finished) await transaction.rollback();
          console.error('[Paystack Webhook] Service booking handler failed:', serviceBookingErr.message);
        }
      } else if (
        !metadata.sale_id &&
        (String(metadata.type || '').toLowerCase() === 'invoice' ||
          invLink.paymentToken ||
          (invLink.invoiceId && invLink.tenantId) ||
          refInvoiceId)
      ) {
        const outcome = await applyPaystackChargeToInvoiceFromTx(reference, tx);
        if (outcome.duplicate) {
          return res.status(200).send('OK');
        }
        if (!outcome.applied && outcome.reason === 'invoice_not_found') {
          console.error(
            '[Paystack Webhook] Invoice not found for payment – paymentToken:',
            invLink.paymentToken,
            'invoiceId:',
            invLink.invoiceId,
            'refInvoiceId:',
            refInvoiceId
          );
        }
      } else if (
        String(metadata.type || '').toLowerCase() === 'subscription' &&
        (metadata.tenantId || metadata.tenant_id) &&
        metadata.plan
      ) {
        const activation = await applySubscriptionFromTransaction(tx, 'webhook');
        console.log(
          '[Paystack Webhook] Subscription updated for tenant:',
          metadata.tenantId || metadata.tenant_id,
          activation ? 'ok' : 'skipped'
        );
      }
    } else if (event === 'subscription.create') {
      const sub = data;
      if (sub?.subscription_code && sub?.plan?.plan_code) {
        console.log('[Paystack Webhook] subscription.create:', sub.subscription_code);
      }
    } else if (event === 'subscription.disable') {
      const sub = data;
      if (sub?.subscription_code) {
        console.log('[Paystack Webhook] subscription.disable:', sub.subscription_code);
      }
    } else if (event === 'invoice.payment_failed') {
      const inv = data;
      if (inv?.subscription) {
        console.log('[Paystack Webhook] invoice.payment_failed for subscription:', inv.subscription);
      }
    } else if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event)) {
      const outcome = await handlePaystackTransferWebhook(event, data);
      if (outcome.handled) {
        console.log('[Paystack Webhook] Marketplace payout transfer event handled:', {
          event,
          payoutId: outcome.payoutId,
          status: outcome.status,
        });
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('[Paystack Webhook] Error:', error);
    return res.status(500).send('Internal error');
  }
};


