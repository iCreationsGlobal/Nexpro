const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { sequelize } = require('../config/database');

const createWatchModule = async () => {
  console.log('Starting ABS Watch schema creation...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS vision_cameras (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "shopId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'counter',
      "deviceId" VARCHAR(255),
      "streamUrl" VARCHAR(500),
      zones JSONB NOT NULL DEFAULT '[]'::jsonb,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS vision_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "shopId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
      "cameraId" UUID REFERENCES vision_cameras(id) ON UPDATE CASCADE ON DELETE SET NULL,
      "clientEventId" VARCHAR(255),
      "eventType" VARCHAR(60) NOT NULL,
      "trackId" VARCHAR(255),
      "startedAt" TIMESTAMPTZ NOT NULL,
      "endedAt" TIMESTAMPTZ,
      confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
      zone VARCHAR(60),
      "clipReference" VARCHAR(255),
      attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS vision_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "shopId" UUID REFERENCES shops(id) ON UPDATE CASCADE ON DELETE SET NULL,
      kind VARCHAR(40) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      "eventId" UUID REFERENCES vision_events(id) ON UPDATE CASCADE ON DELETE SET NULL,
      "saleId" UUID REFERENCES sales(id) ON UPDATE CASCADE ON DELETE SET NULL,
      "trackId" VARCHAR(255),
      "startedAt" TIMESTAMPTZ NOT NULL,
      "endedAt" TIMESTAMPTZ,
      confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
      "clipReference" VARCHAR(255),
      "reviewNote" TEXT,
      "reviewedBy" UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      "reviewedAt" TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_cameras_tenant_idx ON vision_cameras ("tenantId");`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_cameras_shop_idx ON vision_cameras ("shopId");`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_events_tenant_shop_started_idx ON vision_events ("tenantId", "shopId", "startedAt");`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_events_type_idx ON vision_events ("eventType");`);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS vision_events_tenant_client_event_unique
    ON vision_events ("tenantId", "clientEventId")
    WHERE "clientEventId" IS NOT NULL;
  `);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_incidents_tenant_shop_started_idx ON vision_incidents ("tenantId", "shopId", "startedAt");`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_incidents_kind_idx ON vision_incidents (kind);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_incidents_status_idx ON vision_incidents (status);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_incidents_event_idx ON vision_incidents ("eventId");`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS vision_incidents_sale_idx ON vision_incidents ("saleId");`);

  console.log('ABS Watch tables ready.');
};

if (require.main === module) {
  createWatchModule()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('ABS Watch migration failed:', error);
      process.exit(1);
    });
}

module.exports = createWatchModule;
