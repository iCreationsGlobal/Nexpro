const crypto = require('crypto');
const paystackService = require('../services/paystackService');
const {
  getTenantCreditsSummary,
  getCreditPacks,
  findCreditPack,
  grantCredits,
  applyCreditsFromPaystackTransaction,
} = require('../services/absCreditsService');

/**
 * GET /api/credits — balance, packs, free quota, recent ledger
 */
exports.getCreditsSummary = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context is required' });
    }
    const data = await getTenantCreditsSummary(req.tenantId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/credits/packs
 */
exports.listCreditPacks = async (req, res, next) => {
  try {
    const packs = await getCreditPacks();
    return res.status(200).json({ success: true, data: { packs } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/credits/initialize — Paystack checkout for an ABS Credits pack
 */
exports.initializeCreditPurchase = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user;
    const packId = String(req.body?.packId || '').trim();
    const paymentMethod = String(req.body?.paymentMethod || 'card').trim().toLowerCase();

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context is required' });
    }
    if (!user?.email) {
      return res.status(400).json({ success: false, message: 'User email is required' });
    }
    if (!['card', 'mobile_money'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method selected' });
    }
    if (!paystackService.secretKey) {
      return res.status(503).json({ success: false, message: 'Payment provider is not configured' });
    }

    const packs = await getCreditPacks();
    const pack = findCreditPack(packId, packs);
    if (!pack) {
      return res.status(400).json({ success: false, message: 'Invalid credit pack selected' });
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const callbackUrl = `${frontendUrl}/messages/credits?paystack=1`;

    const initPayload = {
      email: user.email,
      amount: pack.amountPesewas,
      callback_url: callbackUrl,
      reference: `ABSCR_${tenantId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      metadata: {
        type: 'abs_credits',
        tenantId,
        userId: user.id,
        packId: pack.id,
        credits: pack.credits,
        amountPesewas: pack.amountPesewas,
        paymentMethod,
      },
      channels: paymentMethod === 'mobile_money' ? ['mobile_money'] : ['card'],
    };

    let result;
    try {
      result = await paystackService.initializeTransaction(initPayload);
    } catch (paystackErr) {
      const status = paystackErr?.response?.status;
      if (paymentMethod === 'mobile_money' && [400, 403].includes(status)) {
        return res.status(400).json({
          success: false,
          message:
            'Mobile money checkout is not enabled for this Paystack account or currency. Enable Paystack Mobile Money for Ghana payments, or pay by card.',
        });
      }
      throw paystackErr;
    }

    if (!result?.status || !result?.data?.authorization_url) {
      return res.status(502).json({
        success: false,
        message: result?.message || 'Failed to initialize payment',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        authorization_url: result.data.authorization_url,
        access_code: result.data.access_code,
        reference: result.data.reference || initPayload.reference,
        pack,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/credits/verify/:reference
 */
exports.verifyCreditPurchase = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { reference } = req.params;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context is required' });
    }
    if (!reference) {
      return res.status(400).json({ success: false, message: 'Payment reference is required' });
    }
    if (!paystackService.secretKey) {
      return res.status(503).json({ success: false, message: 'Payment provider is not configured' });
    }

    const result = await paystackService.verifyTransaction(reference);
    const paymentData = result?.data || {};

    if (!result?.status || paymentData?.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: result?.message || 'Payment verification failed',
      });
    }

    const metadata = paymentData?.metadata || {};
    if (metadata?.tenantId && metadata.tenantId !== tenantId) {
      return res.status(403).json({ success: false, message: 'Payment does not belong to this tenant' });
    }

    const applied = await applyCreditsFromPaystackTransaction(paymentData, 'verify');
    if (!applied) {
      return res.status(400).json({
        success: false,
        message: 'Payment was successful but could not be applied as ABS Credits',
      });
    }

    const summary = await getTenantCreditsSummary(tenantId);

    return res.status(200).json({
      success: true,
      message: applied.alreadyRecorded
        ? 'Payment already recorded for this ABS Credits purchase'
        : 'ABS Credits added successfully',
      data: {
        reference,
        alreadyRecorded: applied.alreadyRecorded,
        balance: applied.balance,
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Used by Paystack webhook (charge.success).
 * @param {object} paymentData
 * @param {string} [source]
 */
exports.applyCreditsFromTransaction = async (paymentData, source = 'webhook') => {
  return applyCreditsFromPaystackTransaction(paymentData, source);
};

/**
 * POST /api/credits/admin-grant — platform or workspace admin grant (workspace manager for now)
 * Body: { credits, reason?, notes? }
 */
exports.adminGrantCredits = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const credits = parseInt(req.body?.credits, 10);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context is required' });
    }
    if (!Number.isFinite(credits) || credits <= 0 || credits > 100000) {
      return res.status(400).json({ success: false, message: 'credits must be between 1 and 100000' });
    }

    const grant = await grantCredits({
      tenantId,
      credits,
      reason: 'admin_grant',
      referenceType: 'admin',
      referenceId: req.user?.id || null,
      metadata: {
        notes: req.body?.notes || null,
        grantedBy: req.user?.id || null,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Granted ${credits} ABS Credits`,
      data: { balance: grant.balance },
    });
  } catch (error) {
    if (error?.code === 'ABS_CREDITS_NOT_READY') {
      return res.status(503).json({ success: false, message: error.message });
    }
    next(error);
  }
};
