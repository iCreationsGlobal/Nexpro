jest.mock('../../../config/database', () => {
  const describeTable = jest.fn();
  return { sequelize: { query: jest.fn(), getQueryInterface: () => ({ describeTable }), describeTable } };
});

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../../../config/database');
const { up } = require('../../../migrations/add-account-lockout-fields');

const added = () => sequelize.query.mock.calls.map(([sql]) => sql.match(/IF NOT EXISTS (\w+)/)[1]);

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
});

describe('account lockout migration', () => {
  it.each([
    ['both columns on a database without them', {}, ['failed_login_attempts', 'lockout_until']],
    ['only the missing one', { failed_login_attempts: {} }, ['lockout_until']],
    ['nothing when both exist', { failed_login_attempts: {}, lockout_until: {} }, []],
  ])('adds %s', async (_, columns, expected) => {
    sequelize.describeTable.mockResolvedValue(columns);
    await up();
    expect(added()).toEqual(expected);
  });

  it('runs on every deploy', () => {
    const runner = fs.readFileSync(path.join(__dirname, '../../../migrations/migrate.js'), 'utf8');
    expect(runner).toContain("require('./add-account-lockout-fields').up()");
  });
});
