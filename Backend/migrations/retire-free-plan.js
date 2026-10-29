const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');
const { Tenant, Setting, SubscriptionPlan } = require('../models');
const { resetTenantTrial } = require('../services/subscriptionBillingService');

const FREE_PLAN_ID = 'free_plan';
/** What the Free plan's 12 free months left on a business and its subscription setting. */
const FREE_PLAN_TENANT_METADATA_KEYS = ['accessEndsAt', 'freeAccessMonths', 'freePlanName'];
const FREE_PLAN_SUBSCRIPTION_KEYS = ['accessEndsAt', 'complimentary', 'complimentaryReason'];

const withoutKeys = (value, keys) => {
  const next = { ...(value && typeof value === 'object' ? value : {}) };
  for (const key of keys) delete next[key];
  return next;
};

/**
 * There is no Free plan: every business starts on the trial. App signups used to be put on
 * `free_plan` (which had every feature switched off), so move each of those businesses to a fresh
 * trial from today, the same as an admin's "Reset trial", and switch the `free_plan` row off so it
 * leaves the pricing page. Safe to run again: once moved, nothing is left on `free_plan`.
 */
async function up(options = {}) {
  const { closeConnection = true } = options;
  try {
    const tenants = await Tenant.findAll({ where: { plan: FREE_PLAN_ID }, attributes: ['id', 'name'] });
    let moved = 0;
    for (const { id, name } of tenants) {
      try {
        await resetTenantTrial(id, { reason: 'Free plan retired: moved to the free trial' });
        const tenant = await Tenant.findByPk(id);
        await tenant.update({ metadata: withoutKeys(tenant.metadata, FREE_PLAN_TENANT_METADATA_KEYS) });
        const setting = await Setting.findOne({ where: { tenantId: id, key: 'subscription' } });
        if (setting) {
          await setting.update({ value: withoutKeys(setting.value, FREE_PLAN_SUBSCRIPTION_KEYS) });
        }
        moved += 1;
      } catch (error) {
        console.error(`[Migration] retire-free-plan: could not move ${name} (${id}) to the trial:`, error.message);
      }
    }

    const [switchedOff] = await SubscriptionPlan.update(
      { isActive: false },
      { where: { planId: FREE_PLAN_ID, isActive: true } }
    );
    console.log(
      `[Migration] retire-free-plan: moved ${moved} of ${tenants.length} business(es) to the trial; ` +
        `switched off ${switchedOff} Free plan row(s).`
    );
  } finally {
    if (closeConnection) await sequelize.close();
  }
}

module.exports = { up };

if (require.main === module) {
  up();
}
