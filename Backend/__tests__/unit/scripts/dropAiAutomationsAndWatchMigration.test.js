jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
    close: jest.fn(),
  },
}));

const { sequelize } = require('../../../config/database');
const dropAiAutomationsAndWatch = require('../../../migrations/drop-ai-automations-and-watch');

const sqlCalls = () => sequelize.query.mock.calls.map(([sql]) => sql.replace(/\s+/g, ' ').trim());

describe('drop-ai-automations-and-watch migration', () => {
  let transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(transaction);
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('to_regclass')) return [[{ tableName: 'present' }]];
      if (sql.includes('SELECT id, highlights, marketing FROM subscription_plans')) {
        return [[
          {
            id: 'plan-pro',
            highlights: ['Up to 3 users', 'Advanced reporting & automation'],
            marketing: {
              perks: ['Automated reminders & notifications', 'Priority support'],
              featureFlags: { crm: true, automations: true, watch: false },
            },
          },
          {
            id: 'plan-clean',
            highlights: ['Up to 10 seats'],
            marketing: { perks: ['Custom workflow configuration'], featureFlags: { crm: true } },
          },
        ]];
      }
      return [[]];
    });
  });

  it('drops the automation and Watch tables and cleans stored settings in one transaction', async () => {
    await dropAiAutomationsAndWatch({ closeConnection: false });

    const sql = sqlCalls();
    for (const table of [
      'automation_delayed_runs',
      'automation_runs',
      'automation_rules',
      'vision_incidents',
      'vision_events',
      'vision_cameras',
      'watch_devices',
    ]) {
      expect(sql).toContain(`DROP TABLE IF EXISTS ${table} CASCADE;`);
    }
    expect(sql).toContain("DELETE FROM settings WHERE key = 'ai';");
    expect(sql.some((q) => q.includes("SET metadata = metadata - 'automationDefaults'"))).toBe(true);
    expect(sql.some((q) => q.includes('{entitlements,featureOverrides}'))).toBe(true);
    expect(sequelize.query.mock.calls.every(([, options]) => options?.transaction === transaction)).toBe(true);
    expect(transaction.commit).toHaveBeenCalled();
    expect(sequelize.close).not.toHaveBeenCalled();
  });

  it('rewrites only plans that mention removed features', async () => {
    await dropAiAutomationsAndWatch({ closeConnection: false });

    const planUpdates = sequelize.query.mock.calls.filter(([sql]) => sql.includes('UPDATE subscription_plans'));
    expect(planUpdates).toHaveLength(1);
    const { replacements } = planUpdates[0][1];
    expect(replacements.id).toBe('plan-pro');
    expect(JSON.parse(replacements.highlights)).toEqual(['Up to 3 users', 'Advanced reporting & data exports']);
    expect(JSON.parse(replacements.marketing)).toEqual({
      perks: ['Invoice reminders & customer receipts', 'Priority support'],
      featureFlags: { crm: true },
    });
  });

  it('renames automations.view to messaging.view before creating it, so role links are kept', async () => {
    await dropAiAutomationsAndWatch({ closeConnection: false });

    const sql = sqlCalls();
    const rename = sql.findIndex((q) => q.startsWith('UPDATE platform_admin_permissions') && q.includes("key = 'messaging.view'"));
    const insert = sql.findIndex((q) => q.startsWith('WITH inserted AS ( INSERT INTO platform_admin_permissions'));
    expect(rename).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(rename);
    expect(sql[rename]).toContain("category = 'messaging'");
    expect(sql[insert]).toContain("r.name IN ('Operations', 'Engineering', 'Support')");
  });

  it('skips table-specific cleanup when those tables are missing', async () => {
    sequelize.query.mockImplementation(async (sql) => {
      if (sql.includes('to_regclass')) return [[{ tableName: null }]];
      return [[]];
    });

    await dropAiAutomationsAndWatch({ closeConnection: false });

    const sql = sqlCalls();
    expect(sql.some((q) => q.startsWith('DELETE FROM settings'))).toBe(false);
    expect(sql.some((q) => q.startsWith('UPDATE tenants'))).toBe(false);
    expect(sql.some((q) => q.includes('platform_admin_permissions'))).toBe(false);
    expect(transaction.commit).toHaveBeenCalled();
  });

  it('rolls back and rethrows on failure', async () => {
    sequelize.query.mockRejectedValueOnce(new Error('lock timeout'));

    await expect(dropAiAutomationsAndWatch({ closeConnection: false })).rejects.toThrow('lock timeout');
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
  });
});
