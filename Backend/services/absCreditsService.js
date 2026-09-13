const { sequelize } = require('../config/database');
const {
  DEFAULT_ABS_CREDIT_PACKS,
  normalizeCreditPacks,
  findCreditPack,
} = require('../config/absCreditPacks');
const { getTenantUsageSummary } = require('./platformSmsUsageService');

const PLATFORM_ABS_CREDITS_SETTINGS_KEY = 'platform:abs_credits';

const isMissingCreditsTableError = (error) => {
  const code = error?.parent?.code || error?.original?.code;
  const message = String(error?.message || error?.parent?.message || '');
  return (
    code === '42P01'
    || /relation ["']?tenant_abs_credits["']? does not exist/i.test(message)
    || /relation ["']?tenant_abs_credit_ledger["']? does not exist/i.test(message)
    || /relation ["']?abs_credit_purchases["']? does not exist/i.test(message)
  );
};

/**
 * @returns {Promise<Array>}
 */
async function getCreditPacks() {
  try {
    const { Setting } = require('../models');
    const setting = await Setting.findOne({
      where: { tenantId: null, key: PLATFORM_ABS_CREDITS_SETTINGS_KEY },
    });
    return normalizeCreditPacks(setting?.value?.packs);
  } catch (_) {
    return DEFAULT_ABS_CREDIT_PACKS.map((pack) => ({ ...pack }));
  }
}

/**
 * @param {string} tenantId
 * @returns {Promise<number>}
 */
async function getBalance(tenantId) {
  if (!tenantId) return 0;
  try {
    const [rows] = await sequelize.query(
      `
        SELECT balance
        FROM tenant_abs_credits
        WHERE tenant_id = :tenantId
        LIMIT 1
      `,
      { replacements: { tenantId } }
    );
    return Math.max(0, parseInt(rows?.[0]?.balance, 10) || 0);
  } catch (error) {
    if (isMissingCreditsTableError(error)) return 0;
    throw error;
  }
}

/**
 * @param {string} tenantId
 * @param {number} [limit=25]
 * @returns {Promise<Array>}
 */
async function listLedger(tenantId, limit = 25) {
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  try {
    const [rows] = await sequelize.query(
      `
        SELECT
          id,
          delta,
          balance_after AS "balanceAfter",
          reason,
          reference_type AS "referenceType",
          reference_id AS "referenceId",
          metadata,
          "createdAt"
        FROM tenant_abs_credit_ledger
        WHERE tenant_id = :tenantId
        ORDER BY "createdAt" DESC
        LIMIT :limit
      `,
      { replacements: { tenantId, limit: safeLimit } }
    );
    return rows || [];
  } catch (error) {
    if (isMissingCreditsTableError(error)) return [];
    throw error;
  }
}

/**
 * Decide how a platform SMS should be billed: free monthly grant, then ABS Credits.
 * @param {string} tenantId
 * @param {number} [count=1]
 * @returns {Promise<{
 *   allowed: boolean,
 *   billType: 'free'|'credits'|null,
 *   errorCode?: string,
 *   error?: string,
 *   freeSummary: object,
 *   creditsBalance: number,
 * }>}
 */
async function resolvePlatformSmsBilling(tenantId, count = 1) {
  const requested = Math.max(1, parseInt(count, 10) || 1);
  const freeSummary = await getTenantUsageSummary(tenantId);
  const creditsBalance = await getBalance(tenantId);

  const freeRemaining = freeSummary.monthlyLimitEnabled
    ? Math.max(0, (freeSummary.remaining ?? 0))
    : Number.POSITIVE_INFINITY;

  if (!freeSummary.monthlyLimitEnabled || freeRemaining >= requested) {
    return {
      allowed: true,
      billType: 'free',
      freeSummary,
      creditsBalance,
    };
  }

  if (creditsBalance >= requested) {
    return {
      allowed: true,
      billType: 'credits',
      freeSummary,
      creditsBalance,
    };
  }

  return {
    allowed: false,
    billType: null,
    errorCode: 'ABS_CREDITS_INSUFFICIENT',
    error:
      `ABS SMS credits exhausted (free ${freeSummary.sentCount}/${freeSummary.monthlyLimit} this month, `
      + `${creditsBalance} paid credits left). Buy ABS Credits or connect your own SMS provider.`,
    freeSummary,
    creditsBalance,
  };
}

/**
 * Atomically credit a tenant balance and write a ledger row.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {number} params.delta - Positive for credit, negative for debit
 * @param {string} params.reason
 * @param {string} [params.referenceType]
 * @param {string} [params.referenceId]
 * @param {object} [params.metadata]
 * @param {import('sequelize').Transaction} [params.transaction]
 * @returns {Promise<{ balance: number, ledgerId: string }>}
 */
async function applyLedgerDelta({
  tenantId,
  delta,
  reason,
  referenceType = null,
  referenceId = null,
  metadata = {},
  transaction = null,
}) {
  const amount = parseInt(delta, 10);
  if (!tenantId || !Number.isFinite(amount) || amount === 0) {
    throw new Error('Invalid ABS Credits ledger delta');
  }
  if (!reason) {
    throw new Error('ABS Credits ledger reason is required');
  }

  const run = async (t) => {
    await sequelize.query(
      `
        INSERT INTO tenant_abs_credits (tenant_id, balance, "createdAt", "updatedAt")
        VALUES (:tenantId, 0, NOW(), NOW())
        ON CONFLICT (tenant_id) DO NOTHING
      `,
      { replacements: { tenantId }, transaction: t }
    );

    const [rows] = await sequelize.query(
      `
        UPDATE tenant_abs_credits
        SET
          balance = balance + :amount,
          "updatedAt" = NOW()
        WHERE tenant_id = :tenantId
          AND balance + :amount >= 0
        RETURNING balance
      `,
      { replacements: { tenantId, amount }, transaction: t }
    );

    const balance = rows?.[0]?.balance;
    if (balance == null) {
      const err = new Error('Insufficient ABS Credits');
      err.code = 'ABS_CREDITS_INSUFFICIENT';
      throw err;
    }

    const [ledgerRows] = await sequelize.query(
      `
        INSERT INTO tenant_abs_credit_ledger (
          tenant_id, delta, balance_after, reason, reference_type, reference_id, metadata, "createdAt"
        )
        VALUES (
          :tenantId, :amount, :balanceAfter, :reason, :referenceType, :referenceId, :metadata::jsonb, NOW()
        )
        RETURNING id
      `,
      {
        replacements: {
          tenantId,
          amount,
          balanceAfter: balance,
          reason,
          referenceType,
          referenceId,
          metadata: JSON.stringify(metadata || {}),
        },
        transaction: t,
      }
    );

    return {
      balance: parseInt(balance, 10) || 0,
      ledgerId: ledgerRows?.[0]?.id,
    };
  };

  try {
    if (transaction) {
      return run(transaction);
    }
    return sequelize.transaction(run);
  } catch (error) {
    if (isMissingCreditsTableError(error)) {
      const err = new Error('ABS Credits tables are not migrated yet');
      err.code = 'ABS_CREDITS_NOT_READY';
      throw err;
    }
    throw error;
  }
}

/**
 * Debit credits for a successful platform SMS send.
 * @param {string} tenantId
 * @param {number} [count=1]
 * @param {object} [metadata]
 * @returns {Promise<{ balance: number }>}
 */
async function debitForSend(tenantId, count = 1, metadata = {}) {
  const amount = Math.max(1, parseInt(count, 10) || 1);
  return applyLedgerDelta({
    tenantId,
    delta: -amount,
    reason: 'send',
    referenceType: 'sms_send',
    referenceId: metadata.messageId || null,
    metadata,
  });
}

/**
 * Grant credits (purchase, admin, refund, monthly_grant).
 * @param {object} params
 * @returns {Promise<{ balance: number, ledgerId: string }>}
 */
async function grantCredits(params) {
  const amount = Math.max(1, parseInt(params.credits, 10) || 0);
  return applyLedgerDelta({
    tenantId: params.tenantId,
    delta: amount,
    reason: params.reason || 'admin_grant',
    referenceType: params.referenceType || null,
    referenceId: params.referenceId || null,
    metadata: params.metadata || {},
    transaction: params.transaction,
  });
}

/**
 * Idempotently apply a successful Paystack ABS Credits purchase.
 * @param {object} paymentData - Paystack verify/webhook transaction payload
 * @param {string} [source]
 * @returns {Promise<{ alreadyRecorded: boolean, purchase: object, balance: number }|null>}
 */
async function applyCreditsFromPaystackTransaction(paymentData, source = 'webhook') {
  const metadata = paymentData?.metadata || {};
  const type = String(metadata.type || '').toLowerCase();
  if (type !== 'abs_credits' && type !== 'sms_credits') {
    return null;
  }

  const tenantId = metadata.tenantId || metadata.tenant_id;
  const packId = metadata.packId || metadata.pack_id;
  const credits = parseInt(metadata.credits, 10);
  const reference = paymentData?.reference;
  if (!tenantId || !packId || !Number.isFinite(credits) || credits <= 0 || !reference) {
    return null;
  }

  const amountPesewas = parseInt(
    metadata.amountPesewas ?? paymentData?.amount ?? 0,
    10
  ) || 0;

  try {
    return await sequelize.transaction(async (transaction) => {
      const [existing] = await sequelize.query(
        `
          SELECT id, status, credits, "tenantId"
          FROM abs_credit_purchases
          WHERE provider = 'paystack' AND "providerReference" = :reference
          LIMIT 1
        `,
        { replacements: { reference }, transaction }
      );

      if (existing?.[0]?.id) {
        const balance = await getBalance(tenantId);
        return {
          alreadyRecorded: true,
          purchase: existing[0],
          balance,
        };
      }

      const [inserted] = await sequelize.query(
        `
          INSERT INTO abs_credit_purchases (
            "tenantId", "packId", credits, amount, currency, status, provider,
            "providerReference", "recordedBy", metadata, "createdAt", "updatedAt"
          )
          VALUES (
            :tenantId, :packId, :credits, :amount, 'GHS', 'success', 'paystack',
            :reference, :recordedBy, :metadata::jsonb, NOW(), NOW()
          )
          RETURNING id, "tenantId", "packId", credits, amount, status, "providerReference"
        `,
        {
          replacements: {
            tenantId,
            packId,
            credits,
            amount: amountPesewas,
            reference,
            recordedBy: metadata.userId || metadata.user_id || null,
            metadata: JSON.stringify({
              source,
              paystackStatus: paymentData?.status || null,
              channel: paymentData?.channel || null,
              paidAt: paymentData?.paid_at || null,
            }),
          },
          transaction,
        }
      );

      const purchase = inserted?.[0];
      const grant = await grantCredits({
        tenantId,
        credits,
        reason: 'purchase',
        referenceType: 'abs_credit_purchase',
        referenceId: purchase?.id || reference,
        metadata: { packId, source, providerReference: reference },
        transaction,
      });

      return {
        alreadyRecorded: false,
        purchase,
        balance: grant.balance,
      };
    });
  } catch (error) {
    if (isMissingCreditsTableError(error)) {
      console.error('[ABS Credits] Tables missing; run create-abs-credits migration');
      return null;
    }
    // Unique race: another webhook/verify won
    if (error?.parent?.code === '23505' || /unique/i.test(String(error?.message || ''))) {
      const balance = await getBalance(tenantId);
      return { alreadyRecorded: true, purchase: { providerReference: reference }, balance };
    }
    throw error;
  }
}

/**
 * Tenant-facing summary for Settings / Messages Credits.
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
async function getTenantCreditsSummary(tenantId) {
  const [balance, packs, freeSummary, ledger] = await Promise.all([
    getBalance(tenantId),
    getCreditPacks(),
    getTenantUsageSummary(tenantId),
    listLedger(tenantId, 10),
  ]);

  return {
    balance,
    packs,
    freeQuota: {
      sentThisMonth: freeSummary.sentCount,
      monthlyLimit: freeSummary.monthlyLimit,
      monthlyLimitEnabled: freeSummary.monthlyLimitEnabled,
      remaining: freeSummary.remaining,
      resetsAt: freeSummary.resetsAt,
    },
    ledger,
  };
}

module.exports = {
  PLATFORM_ABS_CREDITS_SETTINGS_KEY,
  getCreditPacks,
  getBalance,
  listLedger,
  resolvePlatformSmsBilling,
  applyLedgerDelta,
  debitForSend,
  grantCredits,
  applyCreditsFromPaystackTransaction,
  getTenantCreditsSummary,
  findCreditPack,
  DEFAULT_ABS_CREDIT_PACKS,
};
