/**
 * Run rental-related schema migrations only, in dependency order.
 * All steps are idempotent (safe to re-run).
 *
 * Usage: node scripts/run-rental-migrations.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize, testConnection } = require('../config/database');
const addRentalBusinessType = require('../migrations/add-rental-business-type');
const addMetadataToCustomers = require('../migrations/add-metadata-to-customers');
const createRentalModule = require('../migrations/create-rental-module');
const createRentalUnits = require('../migrations/create-rental-units');

const STEPS = [
  { name: 'add-rental-business-type', run: () => addRentalBusinessType({ closeConnection: false }) },
  { name: 'add-metadata-to-customers', run: () => addMetadataToCustomers.up() },
  { name: 'create-rental-module', run: () => createRentalModule() },
  { name: 'create-rental-units', run: () => createRentalUnits() },
];

const runRentalMigrations = async () => {
  console.log('🔄 Running rental migrations only...\n');
  await testConnection();

  for (const step of STEPS) {
    console.log(`--- ${step.name} ---`);
    await step.run();
    console.log('');
  }

  console.log('✅ All rental migrations completed.\n');
  await sequelize.close();
};

if (require.main === module) {
  runRentalMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Rental migrations failed:', error);
      sequelize.close().finally(() => process.exit(1));
    });
}

module.exports = runRentalMigrations;
