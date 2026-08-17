/**
 * Seed standard default automations for existing tenants.
 *
 * Usage:
 *   node scripts/ensure-default-automations.js --dry-run
 *   node scripts/ensure-default-automations.js --execute
 *   node scripts/ensure-default-automations.js --execute --tenant-id <uuid>
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize, testConnection } = require('../config/database');
const { Tenant } = require('../models');
const { ensureDefaultAutomations } = require('../services/defaultAutomationService');

const isExecute = process.argv.includes('--execute');
const isDryRun = process.argv.includes('--dry-run') || !isExecute;

const getArgValue = (name, fallback) => {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
};

const requestedTenantId = getArgValue('--tenant-id', null)?.trim() || null;

async function main() {
  console.log(`[ensure-default-automations] mode=${isDryRun ? 'dry-run' : 'execute'}`);
  await testConnection();

  const where = requestedTenantId ? { id: requestedTenantId } : {};
  const tenants = await Tenant.findAll({
    where,
    attributes: ['id', 'name', 'businessType', 'metadata'],
    order: [['createdAt', 'ASC']],
  });
  if (requestedTenantId && tenants.length === 0) {
    throw new Error(`Tenant not found: ${requestedTenantId}`);
  }

  const summary = { tenants: tenants.length, created: 0, updated: 0, skipped: 0 };

  for (const tenant of tenants) {
    console.log(`\nTenant ${tenant.name} (${tenant.id}) type=${tenant.businessType || 'unset'}`);
    if (isDryRun) {
      const { getDefaultTemplates, filterTemplatesForTenant } = require('../services/automationEngineService');
      const templates = filterTemplatesForTenant(getDefaultTemplates(), tenant);
      console.log(`  would ensure ${templates.length} default templates`);
      summary.skipped += templates.length;
      continue;
    }
    const result = await ensureDefaultAutomations(tenant.id, { tenant });
    summary.created += result.created;
    summary.updated += result.updated;
    summary.skipped += result.skipped;
    console.log(`  created=${result.created} updated=${result.updated} skipped=${result.skipped}`);
  }

  console.log('\nSummary:', summary);
  if (isDryRun) {
    console.log('Dry run complete. Re-run with --execute to apply changes.');
  }
}

main()
  .catch((error) => {
    console.error('[ensure-default-automations] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch (_error) {
      // ignore close errors
    }
  });
