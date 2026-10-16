const { sequelize } = require('../config/database');

/**
 * ABS Watch agents paired to a workspace (device keys instead of an owner's email/password),
 * and removal of camera logins that were saved inside stream URLs (rtsp://user:pass@host/...).
 */
async function up() {
  try {
    console.log('🔄 Creating watch_devices...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS watch_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
        "shopId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
        name VARCHAR(120) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        "pairingCodeHash" VARCHAR(64),
        "pairingExpiresAt" TIMESTAMPTZ,
        "keyHash" VARCHAR(64),
        "pairedAt" TIMESTAMPTZ,
        "lastSeenAt" TIMESTAMPTZ,
        "agentVersion" VARCHAR(40),
        platform VARCHAR(60),
        health JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdBy" UUID,
        "revokedAt" TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query('CREATE INDEX IF NOT EXISTS watch_devices_tenant_idx ON watch_devices ("tenantId");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS watch_devices_tenant_shop_idx ON watch_devices ("tenantId", "shopId");');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS watch_devices_pending_code_idx
      ON watch_devices ("pairingCodeHash") WHERE status = 'pending';
    `);

    console.log('🔄 Removing camera logins from saved stream URLs...');
    await sequelize.query(`
      UPDATE vision_cameras
      SET "streamUrl" = regexp_replace("streamUrl", '^([A-Za-z][A-Za-z0-9+.-]*://)[^/]*@', '\\1')
      WHERE "streamUrl" ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^/]*@';
    `);
    console.log('✅ watch_devices ready; stream URLs no longer hold camera passwords');
  } catch (error) {
    console.error('❌ create-watch-devices failed:', error);
    throw error;
  }
}

async function down() {
  try {
    await sequelize.query('DROP TABLE IF EXISTS watch_devices;');
  } catch (error) {
    console.error('❌ create-watch-devices down failed:', error);
    throw error;
  }
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { up, down };
