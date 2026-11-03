const cron = require('node-cron');

/**
 * Every 10 minutes: pending Online Store domains are put on the store's hosting if they aren't yet and checked; the
 * ones whose records point here turn "verified" (services/storeDomainHosting.js). Does nothing without the hosting's
 * settings.
 */
let job;

const run = async () => {
  const hosting = require('./storeDomainHosting');
  if (!hosting.isConfigured()) return { checked: 0, connected: 0 };
  const { Op } = require('sequelize');
  const { OnlineStoreSettings } = require('../models');
  const pending = await OnlineStoreSettings.findAll({
    where: { customDomain: { [Op.ne]: null }, customDomainStatus: 'pending' },
    order: [['updatedAt', 'DESC']],
    limit: 200,
  });
  let connected = 0;
  for (const settings of pending) {
    const found = await hosting.checkStoreDomain(settings);
    if (found?.state === 'connected') connected += 1;
  }
  return { checked: pending.length, connected };
};

module.exports = {
  run,
  start() {
    if (job) return;
    job = cron.schedule('*/10 * * * *', () => {
      run().catch((error) => console.error('[StoreDomain] Scheduled check failed:', error?.message || error));
    }, { timezone: 'UTC' });
  },
  stop() { if (job) { job.stop(); job = null; } },
};
