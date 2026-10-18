const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { sequelize } = require('../config/database');

/** Removed with AI, advanced automations and ABS Watch (they move to Lynk). No data is kept. */
const DROPPED_TABLES = [
  'automation_delayed_runs',
  'automation_runs',
  'automation_rules',
  'vision_incidents',
  'vision_events',
  'vision_cameras',
  'watch_devices',
];

const REMOVED_FEATURE_KEYS = ['automations', 'watch'];

/** Plan copy that promised removed features → wording that is still true (see config/plans.js). */
const PLAN_COPY_REPLACEMENTS = {
  'Advanced reporting & automation': 'Advanced reporting & data exports',
  'Automated reminders & notifications': 'Invoice reminders & customer receipts',
};

const tableExists = async (tableName, transaction) => {
  const [rows] = await sequelize.query(
    'SELECT to_regclass(:tableName) AS "tableName";',
    { replacements: { tableName: `public.${tableName}` }, transaction }
  );
  return Boolean(rows?.[0]?.tableName);
};

const withoutRemovedKeys = (flags) => {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return flags;
  const next = { ...flags };
  for (const key of REMOVED_FEATURE_KEYS) delete next[key];
  return next;
};

const replacePlanCopy = (list) => (
  Array.isArray(list)
    ? list.map((item) => (typeof item === 'string' && PLAN_COPY_REPLACEMENTS[item]) || item)
    : list
);

/**
 * Drop automation and Watch tables, delete stored AI settings, strip removed feature keys from
 * plans and tenants, and rename the platform permission automations.view → messaging.view.
 * Safe to run on every deploy.
 * @param {{ closeConnection?: boolean }} [options]
 */
const dropAiAutomationsAndWatch = async (options = {}) => {
  const { closeConnection = true } = options;
  console.log('[dropAiAutomationsAndWatch] Starting...');
  const transaction = await sequelize.transaction();

  try {
    // All columns were VARCHAR/JSONB, so these tables created no ENUM types.
    for (const tableName of DROPPED_TABLES) {
      await sequelize.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`, { transaction });
    }

    if (await tableExists('settings', transaction)) {
      await sequelize.query(`DELETE FROM settings WHERE key = 'ai';`, { transaction });
    }

    if (await tableExists('tenants', transaction)) {
      await sequelize.query(`
        UPDATE tenants
        SET metadata = metadata - 'automationDefaults'
        WHERE metadata ? 'automationDefaults';
      `, { transaction });

      await sequelize.query(`
        UPDATE tenants
        SET metadata = jsonb_set(
          metadata,
          '{entitlements,featureOverrides}',
          (metadata #> '{entitlements,featureOverrides}') - 'automations' - 'watch'
        )
        WHERE jsonb_typeof(metadata #> '{entitlements,featureOverrides}') = 'object'
          AND (metadata #> '{entitlements,featureOverrides}') ?| ARRAY['automations', 'watch'];
      `, { transaction });

      // Rental workspace manifests snapshot enabled features at provisioning time.
      await sequelize.query(`
        UPDATE tenants
        SET metadata = jsonb_set(
          metadata,
          '{workspaceManifest,enabledFeatures}',
          (metadata #> '{workspaceManifest,enabledFeatures}') - 'automations' - 'watch'
        )
        WHERE jsonb_typeof(metadata #> '{workspaceManifest,enabledFeatures}') = 'array'
          AND (metadata #> '{workspaceManifest,enabledFeatures}') ?| ARRAY['automations', 'watch'];
      `, { transaction });

      await sequelize.query(`
        UPDATE tenants
        SET metadata = jsonb_set(
          metadata,
          '{workspaceManifest,effectiveFeatureFlags}',
          (metadata #> '{workspaceManifest,effectiveFeatureFlags}') - 'automations' - 'watch'
        )
        WHERE jsonb_typeof(metadata #> '{workspaceManifest,effectiveFeatureFlags}') = 'object'
          AND (metadata #> '{workspaceManifest,effectiveFeatureFlags}') ?| ARRAY['automations', 'watch'];
      `, { transaction });

      await sequelize.query(`
        UPDATE tenants
        SET metadata = metadata #- '{workspaceManifest,provisioned,automationsSeeded}'
        WHERE jsonb_typeof(metadata #> '{workspaceManifest,provisioned}') = 'object'
          AND (metadata #> '{workspaceManifest,provisioned}') ? 'automationsSeeded';
      `, { transaction });
    }

    if (await tableExists('subscription_plans', transaction)) {
      const [plans] = await sequelize.query(
        'SELECT id, highlights, marketing FROM subscription_plans;',
        { transaction }
      );
      for (const plan of plans || []) {
        const marketing = plan.marketing && typeof plan.marketing === 'object' ? plan.marketing : {};
        const nextMarketing = {
          ...marketing,
          ...(marketing.featureFlags !== undefined && { featureFlags: withoutRemovedKeys(marketing.featureFlags) }),
          ...(marketing.perks !== undefined && { perks: replacePlanCopy(marketing.perks) }),
        };
        const nextHighlights = replacePlanCopy(plan.highlights);
        const changed = JSON.stringify(nextMarketing) !== JSON.stringify(marketing)
          || JSON.stringify(nextHighlights) !== JSON.stringify(plan.highlights);
        if (!changed) continue;
        await sequelize.query(
          `
            UPDATE subscription_plans
            SET
              marketing = CAST(:marketing AS jsonb),
              highlights = CAST(:highlights AS jsonb),
              "updatedAt" = NOW()
            WHERE id = :id;
          `,
          {
            replacements: {
              id: plan.id,
              marketing: JSON.stringify(nextMarketing),
              highlights: JSON.stringify(nextHighlights ?? []),
            },
            transaction,
          }
        );
      }
    }

    if (await tableExists('platform_admin_permissions', transaction)) {
      // Both exist (partial earlier run): move role links to messaging.view, drop the old key.
      await sequelize.query(`
        INSERT INTO platform_admin_role_permissions ("roleId", "permissionId")
        SELECT rp."roleId", newp.id
        FROM platform_admin_role_permissions rp
        INNER JOIN platform_admin_permissions oldp
          ON oldp.id = rp."permissionId" AND oldp.key = 'automations.view'
        INNER JOIN platform_admin_permissions newp ON newp.key = 'messaging.view'
        ON CONFLICT DO NOTHING;
      `, { transaction });
      await sequelize.query(`
        DELETE FROM platform_admin_permissions
        WHERE key = 'automations.view'
          AND EXISTS (SELECT 1 FROM platform_admin_permissions WHERE key = 'messaging.view');
      `, { transaction });

      // Only the old key exists: rename in place so role links stay.
      await sequelize.query(`
        UPDATE platform_admin_permissions
        SET
          key = 'messaging.view',
          name = 'View messaging usage',
          description = 'View platform SMS usage per workspace (no message bodies)',
          category = 'messaging',
          "updatedAt" = NOW()
        WHERE key = 'automations.view';
      `, { transaction });

      // Neither existed: create it for the roles that had automations.view.
      await sequelize.query(`
        WITH inserted AS (
          INSERT INTO platform_admin_permissions (key, name, description, category)
          VALUES (
            'messaging.view',
            'View messaging usage',
            'View platform SMS usage per workspace (no message bodies)',
            'messaging'
          )
          ON CONFLICT (key) DO NOTHING
          RETURNING id
        )
        INSERT INTO platform_admin_role_permissions ("roleId", "permissionId")
        SELECT r.id, inserted.id
        FROM platform_admin_roles r
        CROSS JOIN inserted
        WHERE r.name IN ('Operations', 'Engineering', 'Support')
        ON CONFLICT DO NOTHING;
      `, { transaction });
    }

    await transaction.commit();
    console.log('[dropAiAutomationsAndWatch] Done.');
  } catch (error) {
    await transaction.rollback();
    console.error('[dropAiAutomationsAndWatch] Failed:', error.message);
    throw error;
  } finally {
    if (closeConnection) {
      await sequelize.close();
    }
  }
};

module.exports = dropAiAutomationsAndWatch;

if (require.main === module) {
  dropAiAutomationsAndWatch()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
