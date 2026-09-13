require('dotenv').config();
const { sequelize } = require('../config/database');
const { reconcilePayments } = require('../services/partnerPaymentService');
(async () => {
  let result;
  let failed = 0;
  do { result = await reconcilePayments(); failed += result.failed || 0; console.log(result); } while (result.more);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
