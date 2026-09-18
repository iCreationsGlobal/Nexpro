const { sequelize } = require('../config/database');
const { formatToE164 } = require('../utils/phoneUtils');

/**
 * Migration: Email case-insensitivity and global uniqueness for email/phone
 * 1. Normalize existing emails to lowercase
 * 2. Normalize existing phones to E.164 where possible
 * 3. Add unique constraints (globally across tenants) for email and phone
 *
 * Each row is normalized independently (no shared transaction) so one row that conflicts with
 * an existing unique index (e.g. two customers sharing a phone within the same tenant+shop)
 * is skipped with a warning instead of aborting every remaining row — and every migration that
 * runs after this one in migrate.js, since migrate() stops on the first thrown error.
 */
const addEmailPhoneUniqueConstraints = async () => {
  console.log('📧 Adding email/phone case-insensitivity and uniqueness...');

  try {
    // 1. Normalize users.email to lowercase
    console.log('  ➡️  Normalizing users.email to lowercase...');
    await sequelize.query(`
      UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email != '';
    `);

    // 2. Normalize invite_tokens.email to lowercase
    console.log('  ➡️  Normalizing invite_tokens.email to lowercase...');
    try {
      await sequelize.query(`
        UPDATE invite_tokens SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email != '';
      `);
    } catch (e) {
      if (!e.message?.includes('does not exist')) throw e;
    }

    // Normalize one table's email/phone row by row, skipping (with a warning) any row that
    // conflicts with an existing unique index instead of aborting the whole table.
    const normalizeTable = async (table) => {
      let rows;
      try {
        [rows] = await sequelize.query(
          `SELECT id, email, phone FROM ${table} WHERE (email IS NOT NULL AND email != '') OR (phone IS NOT NULL AND phone != '')`
        );
      } catch (e) {
        if (e.message?.includes('does not exist')) return;
        throw e;
      }

      let skipped = 0;
      for (const row of rows) {
        const updates = [];
        const params = { id: row.id };
        if (row.email) {
          updates.push('email = LOWER(TRIM(:email))');
          params.email = row.email;
        }
        if (row.phone) {
          const e164 = formatToE164(row.phone);
          if (e164) {
            updates.push('phone = :phoneE164');
            params.phoneE164 = e164;
          } else {
            updates.push('phone = TRIM(:phone)');
            params.phone = row.phone;
          }
        }
        if (!updates.length) continue;

        try {
          await sequelize.query(
            `UPDATE ${table} SET ${updates.join(', ')} WHERE id = :id`,
            { replacements: params }
          );
        } catch (e) {
          if (e.code === '23505' || e.parent?.code === '23505' || e.name === 'SequelizeUniqueConstraintError') {
            skipped += 1;
          } else {
            throw e;
          }
        }
      }
      if (skipped > 0) {
        console.warn(`  ⚠️  ${table}: skipped ${skipped} row(s) that conflict with an existing unique email/phone — resolve the duplicates manually if they need normalizing.`);
      }
    };

    console.log('  ➡️  Normalizing customers email and phone...');
    await normalizeTable('customers');

    console.log('  ➡️  Normalizing vendors email and phone...');
    await normalizeTable('vendors');

    console.log('  ➡️  Normalizing leads email and phone...');
    await normalizeTable('leads');

    console.log('  ➡️  Normalizing employees email and phone...');
    await normalizeTable('employees');

    // 7. Add unique indexes (globally unique across tenants)
    const tryUniqueIndex = async (name, sql) => {
      try {
        await sequelize.query(sql);
      } catch (e) {
        if (e.code === '23505' || e.parent?.code === '23505' || e.message?.includes('duplicate key') || e.name === 'SequelizeUniqueConstraintError') {
          console.warn(`  ⚠️  Skipped ${name}: duplicate values exist. Resolve duplicates and re-run migration to enforce.`);
        } else {
          throw e;
        }
      }
    };

    console.log('  ➡️  Adding unique constraints...');

    // Customers
    await tryUniqueIndex('idx_customers_email_unique', `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
      ON customers (LOWER(TRIM(email)))
      WHERE email IS NOT NULL AND TRIM(email) != '';
    `);
    await tryUniqueIndex('idx_customers_phone_unique', `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
      ON customers (TRIM(phone))
      WHERE phone IS NOT NULL AND TRIM(phone) != '';
    `);

    // Vendors
    try {
      await tryUniqueIndex('idx_vendors_email_unique', `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_email_unique
        ON vendors (LOWER(TRIM(email)))
        WHERE email IS NOT NULL AND TRIM(email) != '';
      `);
      await tryUniqueIndex('idx_vendors_phone_unique', `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_phone_unique
        ON vendors (TRIM(phone))
        WHERE phone IS NOT NULL AND TRIM(phone) != '';
      `);
    } catch (e) {
      if (!e.message?.includes('does not exist')) throw e;
    }

    // Leads
    try {
      await tryUniqueIndex('idx_leads_email_unique', `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_unique
        ON leads (LOWER(TRIM(email)))
        WHERE email IS NOT NULL AND TRIM(email) != '';
      `);
      await tryUniqueIndex('idx_leads_phone_unique', `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_unique
        ON leads (TRIM(phone))
        WHERE phone IS NOT NULL AND TRIM(phone) != '';
      `);
    } catch (e) {
      if (!e.message?.includes('does not exist')) throw e;
    }

    // Employees
    try {
      await tryUniqueIndex('idx_employees_email_unique', `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_unique
        ON employees (LOWER(TRIM(email)))
        WHERE email IS NOT NULL AND TRIM(email) != '';
      `);
      await tryUniqueIndex('idx_employees_phone_unique', `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_phone_unique
        ON employees (TRIM(phone))
        WHERE phone IS NOT NULL AND TRIM(phone) != '';
      `);
    } catch (e) {
      if (!e.message?.includes('does not exist')) throw e;
    }

    console.log('✅ Email/phone normalization and uniqueness constraints applied');
  } catch (error) {
    console.error('❌ Error in add-email-phone-unique-constraints:', error.message);
    throw error;
  }
};

if (require.main === module) {
  addEmailPhoneUniqueConstraints()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = addEmailPhoneUniqueConstraints;
