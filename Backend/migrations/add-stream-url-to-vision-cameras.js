const { sequelize } = require('../config/database');

/**
 * Optional RTSP/HTTP URL for a shop camera. Video is processed on a shop PC, not ingested live.
 */
async function up() {
  try {
    console.log('🔄 Adding streamUrl to vision_cameras...');
    await sequelize.query(`
      ALTER TABLE IF EXISTS vision_cameras
      ADD COLUMN IF NOT EXISTS "streamUrl" VARCHAR(500);
    `);
    console.log('✅ streamUrl ready on vision_cameras');
  } catch (error) {
    console.error('❌ add-stream-url-to-vision-cameras failed:', error);
    throw error;
  }
}

async function down() {
  try {
    await sequelize.query(`
      ALTER TABLE IF EXISTS vision_cameras
      DROP COLUMN IF EXISTS "streamUrl";
    `);
  } catch (error) {
    console.error('❌ add-stream-url-to-vision-cameras down failed:', error);
    throw error;
  }
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { up, down };
