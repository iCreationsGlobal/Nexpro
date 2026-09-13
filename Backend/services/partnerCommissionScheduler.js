const cron = require('node-cron');
const { reconcilePayments } = require('./partnerPaymentService');
let job;
const run = () => reconcilePayments({ persistent: true }).catch(error => console.error('[Partner reconciliation] Failed', error.message));
module.exports = {
  start() {
    if (job) return;
    job = cron.schedule('*/2 * * * *', run, { timezone: 'UTC' });
    void run();
  },
  stop() { if (job) { job.stop(); job = null; } },
};
