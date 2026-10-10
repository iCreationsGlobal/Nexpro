const { Sale, Invoice, Tenant } = require('../models');
const mobileMoneyService = require('../services/mobileMoneyService');
const { getResolvedMtnConfigForTenant } = require('../services/tenantMomoCollectionService');
const {
  initiateDirectMoMoCharge,
  checkDirectMoMoStatus,
  buildMobileMoneyRefMeta
} = require('../services/directMoMoChargeService');
const {
  parseHubtelCallback,
  getResolvedHubtelConfigForTenant
} = require('../services/tenantHubtelCollectionService');
const { sequelize } = require('../config/database');
const { emitNewSale } = require('../services/websocketService');
const { Op } = require('sequelize');

async function loadMtnRuntimeForTenant(tenantId) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return null;
  return getResolvedMtnConfigForTenant(tenant);
}

async function loadTenant(tenantId) {
  return Tenant.findByPk(tenantId);
}

/**
 * Initiate mobile money payment for a sale
 * @route POST /api/mobile-money/pay
 */
exports.initiatePayment = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { 
      saleId, 
      invoiceId, 
      phoneNumber, 
      amount, 
      currency = 'GHS',
      provider,
      payerMessage 
    } = req.body;

    // Validate required fields
    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    // Generate external reference (stable client/reference mapping)
    const externalId = String(saleId || invoiceId || `PAY-${Date.now()}`).slice(0, 64);
    
    // Detect or use provided provider
    const detectedProvider = provider || mobileMoneyService.detectProvider(phoneNumber);
    
    if (detectedProvider === 'UNKNOWN') {
      return res.status(400).json({
        success: false,
        error: 'Unable to detect mobile money provider. Please specify provider (MTN or AIRTEL).'
      });
    }

    const tenant = await loadTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    const result = await initiateDirectMoMoCharge({
      tenant,
      phoneNumber,
      amount: parseFloat(amount),
      currency,
      provider: detectedProvider,
      externalId,
      payerMessage: payerMessage || 'Payment for your purchase'
    });

    if (!result.success) {
      const status =
        result.rail === 'none' ? 503 : result.allowPaystackFallback ? 503 : 400;
      return res.status(status).json({
        success: false,
        error: result.error || 'Failed to initiate payment',
        provider: result.provider || detectedProvider,
        rail: result.rail,
        allowPaystackFallback: Boolean(result.allowPaystackFallback)
      });
    }

    const refMeta = buildMobileMoneyRefMeta(result, {
      saleId: saleId || undefined,
      invoiceId: invoiceId || undefined,
      tenantId
    });

    // Store payment reference in metadata
    if (saleId) {
      await Sale.update(
        { 
          metadata: sequelize.fn('jsonb_set', 
            sequelize.fn('COALESCE', sequelize.col('metadata'), '{}'),
            '{mobileMoneyRef}',
            JSON.stringify(refMeta)
          )
        },
        { where: { id: saleId, tenantId } }
      );
    }

    if (invoiceId) {
      await Invoice.update(
        {
          metadata: sequelize.fn('jsonb_set',
            sequelize.fn('COALESCE', sequelize.col('metadata'), '{}'),
            '{mobileMoneyRef}',
            JSON.stringify(refMeta)
          )
        },
        { where: { id: invoiceId, tenantId } }
      );
    }

    res.json({
      success: true,
      data: {
        referenceId: result.referenceId,
        provider: result.provider,
        status: result.status,
        message: result.message,
        rail: result.rail,
        saleId,
        invoiceId
      }
    });
  } catch (error) {
    console.error('Error initiating mobile money payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment'
    });
  }
};

/**
 * Check payment status
 * @route GET /api/mobile-money/status/:referenceId
 */
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { referenceId } = req.params;
    const { provider } = req.query;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: 'Provider query parameter is required (MTN or AIRTEL)'
      });
    }

    const prov = provider.toUpperCase();
    const tenant = await loadTenant(req.tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    if (prov === 'MTN') {
      const mtnConfig = await loadMtnRuntimeForTenant(req.tenantId);
      if (!mtnConfig) {
        return res.status(503).json({
          success: false,
          error: 'MTN MoMo is not configured for this workspace'
        });
      }
    }
    if (prov === 'HUBTEL' && !getResolvedHubtelConfigForTenant(tenant)) {
      return res.status(503).json({
        success: false,
        error: 'Hubtel is not configured for this workspace'
      });
    }

    const result = await checkDirectMoMoStatus({
      tenant,
      referenceId,
      provider: prov
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check payment status'
    });
  }
};

/**
 * Poll and update payment status for a sale
 * @route POST /api/mobile-money/poll/:saleId
 */
exports.pollSalePayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const tenantId = req.tenantId;
    const { saleId } = req.params;

    const sale = await Sale.findOne({
      where: { id: saleId, tenantId },
      transaction
    });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Sale not found'
      });
    }

    const mobileMoneyRef = sale.metadata?.mobileMoneyRef;
    
    if (!mobileMoneyRef?.referenceId || !mobileMoneyRef?.provider) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'No mobile money payment found for this sale'
      });
    }

    const tenant = await loadTenant(tenantId);
    if (!tenant) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    if (mobileMoneyRef.provider === 'MTN') {
      const mtnConfig = await loadMtnRuntimeForTenant(tenantId);
      if (!mtnConfig) {
        await transaction.rollback();
        return res.status(503).json({
          success: false,
          error: 'MTN MoMo is not configured for this workspace'
        });
      }
    }
    if (mobileMoneyRef.provider === 'HUBTEL' && !getResolvedHubtelConfigForTenant(tenant)) {
      await transaction.rollback();
      return res.status(503).json({
        success: false,
        error: 'Hubtel is not configured for this workspace'
      });
    }

    const result = await checkDirectMoMoStatus({
      tenant,
      referenceId: mobileMoneyRef.referenceId,
      provider: mobileMoneyRef.provider
    });

    // Update sale metadata with latest status
    const updatedMetadata = {
      ...sale.metadata,
      mobileMoneyRef: {
        ...mobileMoneyRef,
        status: result.status,
        lastChecked: new Date().toISOString(),
        financialTransactionId: result.financialTransactionId
      }
    };

    // If payment successful, update sale status
    if (result.status === 'SUCCESSFUL') {
      await sale.update({
        status: 'completed',
        paymentMethod: 'mobile_money',
        amountPaid: sale.total,
        metadata: updatedMetadata
      }, { transaction });

      // Emit real-time update
      try {
        emitNewSale(tenantId, sale);
      } catch (e) {
        console.error('WebSocket emit error:', e);
      }
    } else {
      await sale.update({
        metadata: updatedMetadata
      }, { transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      data: {
        saleId,
        paymentStatus: result.status,
        saleStatus: result.status === 'SUCCESSFUL' ? 'completed' : sale.status,
        provider: mobileMoneyRef.provider,
        referenceId: mobileMoneyRef.referenceId
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error polling sale payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to poll payment status'
    });
  }
};

/**
 * Validate phone number for mobile money
 * @route GET /api/mobile-money/validate/:phoneNumber
 */
exports.validatePhoneNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { provider } = req.query;

    const detectedProvider = provider || mobileMoneyService.detectProvider(phoneNumber);

    let mtnConfig;
    if (detectedProvider === 'MTN') {
      mtnConfig = await loadMtnRuntimeForTenant(req.tenantId);
    }

    const result = await mobileMoneyService.validateAccount(phoneNumber, detectedProvider, mtnConfig);

    res.json({
      success: true,
      data: {
        phoneNumber,
        provider: result.provider || detectedProvider,
        valid: result.valid,
        name: result.name
      }
    });
  } catch (error) {
    console.error('Error validating phone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate phone number'
    });
  }
};

/**
 * Detect provider from phone number
 * @route GET /api/mobile-money/detect-provider/:phoneNumber
 */
exports.detectProvider = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const provider = mobileMoneyService.detectProvider(phoneNumber);

    res.json({
      success: true,
      data: {
        phoneNumber,
        provider,
        supported: provider !== 'UNKNOWN'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to detect provider'
    });
  }
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const matchesMobileMoneyReference = (ref) => ({
  [Op.or]: [
    sequelize.where(sequelize.json('metadata.mobileMoneyRef.referenceId'), ref),
    sequelize.where(sequelize.json('metadata.mobileMoneyRef.clientReference'), ref)
  ]
});

/**
 * Find sale/invoice by the provider reference stored in metadata.mobileMoneyRef.
 * Uses parameterized JSON path (no string-interpolated SQL).
 * @param {string} reference
 */
async function findRecordsByMobileMoneyReference(reference) {
  const ref = String(reference || '').trim();
  if (!ref) return { sale: null, invoice: null };

  const [sale, invoice] = await Promise.all([
    Sale.findOne({ where: matchesMobileMoneyReference(ref) }),
    Invoice.findOne({ where: matchesMobileMoneyReference(ref) })
  ]);
  return { sale, invoice };
}

/**
 * Charges are initiated with externalId = the sale or invoice id (see initiatePayment), which is all
 * MTN echoes back in its callback body.
 * @param {string} externalId
 */
async function findRecordsByExternalId(externalId) {
  const id = String(externalId || '').trim();
  if (!UUID_PATTERN.test(id)) return { sale: null, invoice: null };

  const [sale, invoice] = await Promise.all([Sale.findByPk(id), Invoice.findByPk(id)]);
  return { sale, invoice };
}

/**
 * Ask the provider for the status of the record's own stored reference. Returns null when there is
 * nothing to check or the provider could not give a definite answer.
 */
async function fetchVerifiedStatus(record) {
  const ref = record.metadata?.mobileMoneyRef;
  if (!ref?.referenceId || !ref?.provider) return null;

  const tenant = await loadTenant(record.tenantId);
  if (!tenant) return null;

  const result = await checkDirectMoMoStatus({
    tenant,
    referenceId: ref.referenceId,
    provider: ref.provider
  });
  if (!result?.status || result.status === 'UNKNOWN') return null;

  return {
    status: result.status,
    mobileMoneyRef: {
      ...ref,
      status: result.status,
      lastChecked: new Date().toISOString(),
      ...(result.financialTransactionId ? { financialTransactionId: result.financialTransactionId } : {}),
      ...(result.status === 'SUCCESSFUL' ? { completedAt: new Date().toISOString() } : {})
    }
  };
}

async function syncSaleWithProvider(sale) {
  if (sale.status === 'completed' && sale.metadata?.mobileMoneyRef?.status === 'SUCCESSFUL') return;

  const verified = await fetchVerifiedStatus(sale);
  if (!verified) return;

  const metadata = { ...sale.metadata, mobileMoneyRef: verified.mobileMoneyRef };
  if (verified.status === 'SUCCESSFUL') {
    await sale.update({
      status: 'completed',
      paymentMethod: 'mobile_money',
      amountPaid: sale.total,
      metadata
    });
    try {
      emitNewSale(sale.tenantId, sale);
    } catch (e) {
      console.error('WebSocket emit error:', e);
    }
  } else {
    await sale.update({ metadata });
  }
}

async function syncInvoiceWithProvider(invoice) {
  if (invoice.status === 'paid') return;

  const verified = await fetchVerifiedStatus(invoice);
  if (!verified) return;

  // Mark ref only; public/auth poll finalize records the Payment row idempotently.
  await invoice.update({
    metadata: { ...invoice.metadata, mobileMoneyRef: verified.mobileMoneyRef }
  });
}

/**
 * Provider callbacks carry nothing we can authenticate, so their payload only says which payment to
 * look at. What gets recorded always comes from asking the provider about our own stored reference.
 * @param {{ references?: Array<string|undefined>, externalId?: string }} hints
 */
async function reconcileMobileMoneyCallback({ references = [], externalId } = {}) {
  const sales = new Map();
  const invoices = new Map();
  const collect = ({ sale, invoice }) => {
    if (sale) sales.set(sale.id, sale);
    if (invoice) invoices.set(invoice.id, invoice);
  };

  for (const reference of new Set(references.filter(Boolean).map(String))) {
    collect(await findRecordsByMobileMoneyReference(reference));
  }
  if (externalId) {
    collect(await findRecordsByExternalId(externalId));
  }

  for (const sale of sales.values()) {
    await syncSaleWithProvider(sale);
  }
  for (const invoice of invoices.values()) {
    await syncInvoiceWithProvider(invoice);
  }
}

/**
 * Webhook handler for MTN MoMo callbacks
 * @route POST /api/webhooks/mtn-momo
 */
exports.mtnWebhook = async (req, res) => {
  try {
    const body = req.body || {};
    console.log('[MTN Webhook] Received:', {
      status: body.status,
      hasReferenceId: Boolean(body.referenceId || req.query?.referenceId),
      hasExternalId: Boolean(body.externalId)
    });

    await reconcileMobileMoneyCallback({
      references: [body.referenceId, req.query?.referenceId],
      externalId: body.externalId
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[MTN Webhook] Error:', error?.message || error);
    res.status(200).json({ success: true }); // Always return 200 to prevent retries
  }
};

/**
 * Webhook handler for Airtel Money callbacks
 * @route POST /api/webhooks/airtel-money
 */
exports.airtelWebhook = async (req, res) => {
  try {
    const transaction = req.body?.transaction;
    console.log('[Airtel Webhook] Received:', {
      status: transaction?.status,
      hasTransactionId: Boolean(transaction?.id)
    });

    await reconcileMobileMoneyCallback({ references: [transaction?.id] });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Airtel Webhook] Error:', error?.message || error);
    res.status(200).json({ success: true });
  }
};

/**
 * Idempotent Hubtel Receive Money callback.
 * @route POST /api/webhooks/hubtel
 */
exports.hubtelWebhook = async (req, res) => {
  try {
    const parsed = parseHubtelCallback(req.body || {});
    console.log('[Hubtel Webhook] Received:', {
      clientReference: parsed.clientReference,
      status: parsed.status,
      hasTransactionId: Boolean(parsed.transactionId)
    });

    if (!parsed.clientReference) {
      return res.status(200).json({ success: true, ignored: true });
    }

    await reconcileMobileMoneyCallback({ references: [parsed.clientReference] });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Hubtel Webhook] Error:', error?.message || error);
    res.status(200).json({ success: true });
  }
};
