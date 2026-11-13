const { sequelize } = require('../config/database');
const { DataTypes, Op } = require('sequelize');

/**
 * Add apple_id to users for Sign in with Apple (the `sub` Apple gives each user of our app).
 * Safe to run again: skips when the column is already there.
 */

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  const tableDesc = await queryInterface.describeTable('users');
  if (tableDesc.apple_id) {
    console.log('[Migration] apple_id already exists on users, skipping.');
    return;
  }

  console.log('Adding apple_id to users table...');
  await queryInterface.addColumn('users', 'apple_id', {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Apple subject ID for Sign in with Apple',
  });

  await queryInterface.addIndex('users', ['apple_id'], {
    name: 'idx_users_apple_id',
    unique: true,
    where: {
      apple_id: { [Op.ne]: null },
    },
  });

  console.log('[Migration] apple_id added successfully!');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  console.log('Removing apple_id from users table...');
  await queryInterface.removeIndex('users', 'idx_users_apple_id');
  await queryInterface.removeColumn('users', 'apple_id');
  console.log('[Migration] apple_id removed');
}

if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration completed successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
