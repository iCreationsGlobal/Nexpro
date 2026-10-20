/**
 * Unit Tests for Bulk Operations Utility
 *
 * The fake database behaves like Postgres: a failed statement aborts the transaction it ran in,
 * every later statement in it fails, and COMMIT of an aborted transaction quietly rolls back.
 * A savepoint (nested transaction) contains the failure.
 */

const persisted = [];

jest.mock('../../../config/database', () => {
  const makeScope = (parent = null) => ({ parent, aborted: false, rows: [] });
  const isAborted = (scope) => Boolean(scope && (scope.aborted || isAborted(scope.parent)));
  const transaction = jest.fn(async (options, work) => {
    if (typeof options === 'object' && options?.transaction && typeof work === 'function') {
      const savepoint = makeScope(options.transaction);
      try {
        const result = await work(savepoint);
        options.transaction.rows.push(...savepoint.rows); // RELEASE SAVEPOINT
        return result;
      } catch (err) {
        throw err; // ROLLBACK TO SAVEPOINT: its rows and its abort are discarded
      }
    }
    const outer = makeScope();
    outer.commit = jest.fn(async () => { if (!outer.aborted) persisted.push(...outer.rows); });
    outer.rollback = jest.fn(async () => {});
    return outer;
  });
  return { sequelize: { transaction }, __isAborted: isAborted };
});

const { __isAborted: isAborted } = require('../../../config/database');
const { DEFAULT_OPTIONS, bulkCreate, bulkUpdate, bulkDelete } = require('../../../utils/bulkOperations');

/** A model whose writes fail on "DUP" like a unique-key clash, and fail after an abort like Postgres. */
const fakeModel = () => {
  const run = (scope, label, fail) => {
    if (isAborted(scope)) throw new Error('current transaction is aborted, commands ignored until end of transaction block');
    if (fail) {
      scope.aborted = true;
      throw new Error('duplicate key value violates unique constraint');
    }
    scope.rows.push(label);
  };
  return {
    create: jest.fn(async (data, { transaction }) => {
      run(transaction, data.sku, data.sku === 'DUP');
      return { id: `id-${data.sku}`, toJSON: () => data };
    }),
    findOne: jest.fn(async ({ where, transaction }) => {
      if (isAborted(transaction)) throw new Error('current transaction is aborted');
      return {
        update: async (_data, { transaction: t }) => run(t, `updated-${where.id}`, where.id === 'DUP'),
        destroy: async ({ transaction: t }) => run(t, `deleted-${where.id}`, where.id === 'DUP'),
      };
    }),
  };
};

beforeEach(() => { persisted.length = 0; });

describe('Bulk Operations Utility', () => {
  describe('DEFAULT_OPTIONS', () => {
    it('should have maxBatchSize of 100', () => {
      expect(DEFAULT_OPTIONS.maxBatchSize).toBe(100);
    });

    it('should have returnCreated as true', () => {
      expect(DEFAULT_OPTIONS.returnCreated).toBe(true);
    });

    it('should have continueOnError as false', () => {
      expect(DEFAULT_OPTIONS.continueOnError).toBe(false);
    });
  });

  describe('continueOnError: one bad row does not undo the others', () => {
    it('bulkCreate keeps the rows before and after a duplicate', async () => {
      const result = await bulkCreate(fakeModel(), [{ sku: 'A' }, { sku: 'DUP' }, { sku: 'C' }], { continueOnError: true });

      expect(result.successCount).toBe(2);
      expect(result.errors).toEqual([expect.objectContaining({ index: 1 })]);
      expect(persisted).toEqual(['A', 'C']);
    });

    it('bulkUpdate keeps the updates around a failing one', async () => {
      const result = await bulkUpdate(fakeModel(), [{ id: 'a' }, { id: 'DUP' }, { id: 'c' }], { continueOnError: true });

      expect(result.successCount).toBe(2);
      expect(persisted).toEqual(['updated-a', 'updated-c']);
    });

    it('bulkDelete keeps the deletes around a failing one', async () => {
      const result = await bulkDelete(fakeModel(), ['a', 'DUP', 'c'], { continueOnError: true });

      expect(result.successCount).toBe(2);
      expect(persisted).toEqual(['deleted-a', 'deleted-c']);
    });
  });

  it('without continueOnError, a bad row rolls back the whole batch', async () => {
    const result = await bulkCreate(fakeModel(), [{ sku: 'A' }, { sku: 'DUP' }, { sku: 'C' }]);

    expect(result.success).toBe(false);
    expect(persisted).toEqual([]);
  });
});
