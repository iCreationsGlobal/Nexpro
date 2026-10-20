/**
 * Bulk Operations Utility
 * 
 * Provides common bulk operation patterns for CRUD operations.
 */

const { sequelize } = require('../config/database');

/**
 * Default bulk operation options
 */
const DEFAULT_OPTIONS = {
  maxBatchSize: 100,
  returnCreated: true,
  continueOnError: false,
};

/**
 * Run one item of a batch. With continueOnError the item gets its own savepoint: Postgres aborts the
 * whole transaction on any failed statement (e.g. a duplicate SKU), so without one every later row
 * would fail too and the final commit would silently roll back the rows reported as done.
 */
const runItem = (transaction, continueOnError, work) =>
  continueOnError
    ? sequelize.transaction({ transaction }, (savepoint) => work(savepoint))
    : work(transaction);

/**
 * Perform bulk create operation
 * @param {Object} Model - Sequelize model
 * @param {Array} records - Array of records to create
 * @param {Object} options - Operation options
 * @returns {Promise<Object>} - Result with success, errors, and created records
 */
const bulkCreate = async (Model, records, options = {}) => {
  const { maxBatchSize, returnCreated, continueOnError, tenantId, userId, shopId, studioLocationId } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (!Array.isArray(records) || records.length === 0) {
    return {
      success: false,
      error: 'No records provided',
      created: [],
      errors: [],
    };
  }

  if (records.length > maxBatchSize) {
    return {
      success: false,
      error: `Batch size exceeds maximum of ${maxBatchSize}`,
      created: [],
      errors: [],
    };
  }

  const transaction = await sequelize.transaction();
  const created = [];
  const errors = [];

  try {
    for (let i = 0; i < records.length; i++) {
      try {
        const recordData = {
          ...records[i],
          ...(tenantId && { tenantId }),
          ...(shopId && { shopId }),
          ...(studioLocationId && { studioLocationId }),
          ...(userId && { createdBy: userId }),
        };

        const record = await runItem(transaction, continueOnError, (t) => Model.create(recordData, { transaction: t }));
        created.push({
          index: i,
          id: record.id,
          ...(returnCreated && { record: record.toJSON() }),
        });
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: records[i],
        });

        if (!continueOnError) {
          throw error;
        }
      }
    }

    await transaction.commit();

    return {
      success: errors.length === 0,
      totalProcessed: records.length,
      successCount: created.length,
      errorCount: errors.length,
      created,
      errors,
    };
  } catch (error) {
    await transaction.rollback();

    return {
      success: false,
      error: error.message,
      totalProcessed: records.length,
      successCount: created.length,
      errorCount: errors.length + 1,
      created,
      errors,
    };
  }
};

/**
 * Perform bulk update operation
 * @param {Object} Model - Sequelize model
 * @param {Array} updates - Array of updates with id and data
 * @param {Object} options - Operation options
 * @returns {Promise<Object>} - Result with success, errors, and updated records
 */
const bulkUpdate = async (Model, updates, options = {}) => {
  const { maxBatchSize, continueOnError, tenantId, userId } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    return {
      success: false,
      error: 'No updates provided',
      updated: [],
      errors: [],
    };
  }

  if (updates.length > maxBatchSize) {
    return {
      success: false,
      error: `Batch size exceeds maximum of ${maxBatchSize}`,
      updated: [],
      errors: [],
    };
  }

  const transaction = await sequelize.transaction();
  const updated = [];
  const errors = [];

  try {
    for (let i = 0; i < updates.length; i++) {
      try {
        const { id, ...data } = updates[i];

        if (!id) {
          throw new Error('Record ID is required');
        }

        const where = { id };
        if (tenantId) {
          where.tenantId = tenantId;
        }

        await runItem(transaction, continueOnError, async (t) => {
          const record = await Model.findOne({ where, transaction: t });

          if (!record) {
            throw new Error(`Record with ID ${id} not found`);
          }

          const updateData = {
            ...data,
            ...(userId && { updatedBy: userId }),
          };

          await record.update(updateData, { transaction: t });
        });
        updated.push({ index: i, id });
      } catch (error) {
        errors.push({
          index: i,
          id: updates[i]?.id,
          error: error.message,
        });

        if (!continueOnError) {
          throw error;
        }
      }
    }

    await transaction.commit();

    return {
      success: errors.length === 0,
      totalProcessed: updates.length,
      successCount: updated.length,
      errorCount: errors.length,
      updated,
      errors,
    };
  } catch (error) {
    await transaction.rollback();

    return {
      success: false,
      error: error.message,
      totalProcessed: updates.length,
      successCount: updated.length,
      errorCount: errors.length + 1,
      updated,
      errors,
    };
  }
};

/**
 * Perform bulk delete operation
 * @param {Object} Model - Sequelize model
 * @param {Array} ids - Array of IDs to delete
 * @param {Object} options - Operation options
 * @returns {Promise<Object>} - Result with success and errors
 */
const bulkDelete = async (Model, ids, options = {}) => {
  const { maxBatchSize, continueOnError, tenantId, softDelete } = {
    ...DEFAULT_OPTIONS,
    ...options,
    softDelete: false,
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    return {
      success: false,
      error: 'No IDs provided',
      deleted: [],
      errors: [],
    };
  }

  if (ids.length > maxBatchSize) {
    return {
      success: false,
      error: `Batch size exceeds maximum of ${maxBatchSize}`,
      deleted: [],
      errors: [],
    };
  }

  const transaction = await sequelize.transaction();
  const deleted = [];
  const errors = [];

  try {
    for (let i = 0; i < ids.length; i++) {
      try {
        const id = ids[i];
        const where = { id };
        
        if (tenantId) {
          where.tenantId = tenantId;
        }

        await runItem(transaction, continueOnError, async (t) => {
          const record = await Model.findOne({ where, transaction: t });

          if (!record) {
            throw new Error(`Record with ID ${id} not found`);
          }

          if (softDelete) {
            await record.update({ isArchived: true, archivedAt: new Date() }, { transaction: t });
          } else {
            await record.destroy({ transaction: t });
          }
        });

        deleted.push({ index: i, id });
      } catch (error) {
        errors.push({
          index: i,
          id: ids[i],
          error: error.message,
        });

        if (!continueOnError) {
          throw error;
        }
      }
    }

    await transaction.commit();

    return {
      success: errors.length === 0,
      totalProcessed: ids.length,
      successCount: deleted.length,
      errorCount: errors.length,
      deleted,
      errors,
    };
  } catch (error) {
    await transaction.rollback();

    return {
      success: false,
      error: error.message,
      totalProcessed: ids.length,
      successCount: deleted.length,
      errorCount: errors.length + 1,
      deleted,
      errors,
    };
  }
};

/**
 * Perform bulk status update
 * @param {Object} Model - Sequelize model
 * @param {Array} ids - Array of IDs to update
 * @param {string} status - New status value
 * @param {Object} options - Operation options
 * @returns {Promise<Object>} - Result with success and errors
 */
const bulkStatusUpdate = async (Model, ids, status, options = {}) => {
  const { maxBatchSize, tenantId, statusField = 'status' } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    return {
      success: false,
      error: 'No IDs provided',
      updated: [],
    };
  }

  if (ids.length > maxBatchSize) {
    return {
      success: false,
      error: `Batch size exceeds maximum of ${maxBatchSize}`,
      updated: [],
    };
  }

  const transaction = await sequelize.transaction();

  try {
    const where = { id: ids };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const [affectedCount] = await Model.update(
      { [statusField]: status },
      { where, transaction }
    );

    await transaction.commit();

    return {
      success: true,
      affectedCount,
    };
  } catch (error) {
    await transaction.rollback();

    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  bulkCreate,
  bulkUpdate,
  bulkDelete,
  bulkStatusUpdate,
  DEFAULT_OPTIONS,
};
