/**
 * Collapse phone numbers that were saved with the dial code twice ("+233+233555155979" →
 * "+233555155979"). Saves are cleaned going forward (model hooks + onboarding/settings controllers);
 * this fixes numbers stored before that, including business phones in tenant metadata and settings.
 *
 * Dry-run is the default. Writes require --execute (plus --allow-non-local-db for a remote DATABASE_URL).
 * A row whose cleaned number would clash with a unique phone already on file is skipped and listed.
 *
 * Usage:
 *   node scripts/fix-doubled-dial-codes.js
 *   node scripts/fix-doubled-dial-codes.js --execute --allow-non-local-db
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { Op } = require('sequelize');
const { sequelize, testConnection } = require('../config/database');
const models = require('../models');
const { collapseRepeatedDialCode } = require('../utils/phoneUtils');

const isExecute = process.argv.includes('--execute');
const allowNonLocalDb = process.argv.includes('--allow-non-local-db');
const SAMPLE_LIMIT = 10;

const PHONE_COLUMNS = [
  ['Customer', 'phone'],
  ['Vendor', 'phone'],
  ['Lead', 'phone'],
  ['Shop', 'phone'],
  ['Pharmacy', 'phone'],
  ['Prescription', 'prescriberPhone'],
  ['StorefrontCustomer', 'phone'],
  ['Dealer', 'phone'],
  ['OnlineStoreSettings', 'contactPhone'],
  ['OnlineStoreSettings', 'whatsappNumber'],
];

const PHONE_KEY = /phone|whatsapp/i;

const isLocalDatabaseUrl = () => {
  try {
    const hostname = new URL(process.env.DATABASE_URL || '').hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

/** Only rows that could hold a repeat: a second "+", or "233" appearing twice. */
const candidateWhere = (field) => ({
  [Op.or]: [{ [field]: { [Op.like]: '%+%+%' } }, { [field]: { [Op.like]: '%233%233%' } }],
});

/** Copy of a JSON object with its top-level phone/WhatsApp values cleaned; null when nothing changes. */
const cleanPhoneKeys = (object) => {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  let changed = false;
  const next = { ...object };
  Object.entries(object).forEach(([key, value]) => {
    if (!PHONE_KEY.test(key) || typeof value !== 'string') return;
    const cleaned = collapseRepeatedDialCode(value);
    if (cleaned !== value.trim()) {
      next[key] = cleaned;
      changed = true;
    }
  });
  return changed ? next : null;
};

const summary = { found: 0, updated: 0, conflicts: [] };

const report = (label, id, before, after) => {
  summary.found += 1;
  if (summary.found <= SAMPLE_LIMIT) {
    console.log(`  ${label} ${id}: ${before} → ${after}`);
  }
};

async function fixColumn(modelName, field) {
  const Model = models[modelName];
  const rows = await Model.findAll({ where: candidateWhere(field), attributes: ['id', field] });
  for (const row of rows) {
    const before = row.get(field);
    const after = collapseRepeatedDialCode(before);
    if (after === String(before).trim()) continue;
    report(`${modelName}.${field}`, row.id, before, after);
    if (!isExecute) continue;
    try {
      await Model.update({ [field]: after }, { where: { id: row.id }, hooks: false });
      summary.updated += 1;
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
      summary.conflicts.push(`${modelName}.${field} ${row.id} (${after} is already on file)`);
    }
  }
}

async function fixJsonColumn(modelName, column) {
  const Model = models[modelName];
  const asText = sequelize.cast(sequelize.col(column), 'text');
  const rows = await Model.findAll({
    where: {
      [Op.or]: [
        sequelize.where(asText, { [Op.like]: '%+%+%' }),
        sequelize.where(asText, { [Op.like]: '%233%233%' }),
      ],
    },
    attributes: ['id', column],
  });
  for (const row of rows) {
    const next = cleanPhoneKeys(row.get(column));
    if (!next) continue;
    const before = row.get(column);
    Object.keys(next)
      .filter((key) => next[key] !== before[key])
      .forEach((key) => report(`${modelName}.${column}.${key}`, row.id, before[key], next[key]));
    if (!isExecute) continue;
    await Model.update({ [column]: next }, { where: { id: row.id }, hooks: false });
    summary.updated += 1;
  }
}

async function main() {
  if (isExecute && !isLocalDatabaseUrl() && !allowNonLocalDb) {
    throw new Error('Refusing to write to a non-local DATABASE_URL. Pass --allow-non-local-db if you intend to.');
  }
  await testConnection();
  console.log(isExecute ? 'Fixing doubled dial codes…' : 'Dry run — no changes will be written. Pass --execute to apply.');

  for (const [modelName, field] of PHONE_COLUMNS) {
    await fixColumn(modelName, field);
  }
  await fixJsonColumn('Tenant', 'metadata');
  await fixJsonColumn('Setting', 'value');

  if (summary.found > SAMPLE_LIMIT) {
    console.log(`  …and ${summary.found - SAMPLE_LIMIT} more`);
  }
  console.log(`\nNumbers with a doubled dial code: ${summary.found}`);
  if (isExecute) {
    console.log(`Updated: ${summary.updated}`);
    if (summary.conflicts.length) {
      console.log(`Skipped (cleaned number already belongs to another record): ${summary.conflicts.length}`);
      summary.conflicts.forEach((line) => console.log(`  ${line}`));
    }
  }
}

main()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error(error.message || error);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
