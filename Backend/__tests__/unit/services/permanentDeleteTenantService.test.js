jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(async (fn) => fn({})),
  },
}));

jest.mock('../../../models', () => ({
  Tenant: { findByPk: jest.fn() },
}));

jest.mock('../../../utils/deleteTenantData', () => ({
  PLATFORM_TENANT_SLUG: 'platform',
  deleteTenantData: jest.fn(),
  deleteOrphanUsersWithoutTenants: jest.fn(),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateCache: jest.fn(),
  invalidateAuthBootstrapCache: jest.fn(),
}));

const { sequelize } = require('../../../config/database');
const { Tenant } = require('../../../models');
const {
  deleteTenantData,
  deleteOrphanUsersWithoutTenants,
} = require('../../../utils/deleteTenantData');
const { invalidateCache, invalidateAuthBootstrapCache } = require('../../../middleware/cache');
const {
  confirmMatchesTenant,
  permanentlyDeleteTenant,
} = require('../../../services/permanentDeleteTenantService');

const actor = {
  id: 'admin-1',
  isPlatformAdmin: true,
  tenantId: 'platform-tenant-id',
};

const tenant = {
  id: 'tenant-1',
  name: 'Acme Print Shop',
  slug: 'acme-print-shop',
};

describe('permanentDeleteTenantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (fn) => fn({}));
    Tenant.findByPk.mockResolvedValue(tenant);
    deleteTenantData.mockResolvedValue(undefined);
    deleteOrphanUsersWithoutTenants.mockResolvedValue(undefined);
  });

  it('matches exact tenant name or DELETE', () => {
    expect(confirmMatchesTenant(tenant, 'Acme Print Shop')).toBe(true);
    expect(confirmMatchesTenant(tenant, 'DELETE')).toBe(true);
    expect(confirmMatchesTenant(tenant, 'acme print shop')).toBe(false);
    expect(confirmMatchesTenant(tenant, 'acme-print-shop')).toBe(false);
    expect(confirmMatchesTenant(tenant, '')).toBe(false);
  });

  it('hard-deletes tenant-scoped data then the tenant when confirmName matches', async () => {
    const result = await permanentlyDeleteTenant({
      tenantId: tenant.id,
      confirmName: tenant.name,
      actor,
    });

    expect(Tenant.findByPk).toHaveBeenCalledWith(tenant.id, {
      attributes: ['id', 'name', 'slug'],
    });
    expect(deleteTenantData).toHaveBeenCalledWith(tenant.id, expect.anything());
    expect(deleteOrphanUsersWithoutTenants).toHaveBeenCalled();
    expect(invalidateCache).toHaveBeenCalledWith(tenant.id, '*');
    expect(invalidateAuthBootstrapCache).toHaveBeenCalledWith({ tenantId: tenant.id });
    expect(result).toEqual({ id: tenant.id, name: tenant.name, slug: tenant.slug });
  });

  it('accepts DELETE as confirmation', async () => {
    await permanentlyDeleteTenant({
      tenantId: tenant.id,
      confirmName: 'DELETE',
      actor,
    });
    expect(deleteTenantData).toHaveBeenCalledWith(tenant.id, expect.anything());
  });

  it('rejects a wrong confirm name without deleting', async () => {
    await expect(
      permanentlyDeleteTenant({
        tenantId: tenant.id,
        confirmName: 'Wrong Name',
        actor,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'CONFIRM_NAME_REQUIRED',
    });
    expect(deleteTenantData).not.toHaveBeenCalled();
  });

  it('returns 404 when the tenant does not exist', async () => {
    Tenant.findByPk.mockResolvedValue(null);
    await expect(
      permanentlyDeleteTenant({
        tenantId: 'missing',
        confirmName: 'DELETE',
        actor,
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'RESOURCE_NOT_FOUND',
    });
    expect(deleteTenantData).not.toHaveBeenCalled();
  });

  it('forbids non-platform-admin callers', async () => {
    await expect(
      permanentlyDeleteTenant({
        tenantId: tenant.id,
        confirmName: tenant.name,
        actor: { id: 'user-1', isPlatformAdmin: false, tenantId: tenant.id },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'FORBIDDEN',
    });
    expect(Tenant.findByPk).not.toHaveBeenCalled();
    expect(deleteTenantData).not.toHaveBeenCalled();
  });

  it('blocks deleting the platform workspace', async () => {
    Tenant.findByPk.mockResolvedValue({
      id: 'platform-tenant-id',
      name: 'Platform',
      slug: 'platform',
    });
    await expect(
      permanentlyDeleteTenant({
        tenantId: 'platform-tenant-id',
        confirmName: 'Platform',
        actor: { ...actor, tenantId: 'other-tenant' },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'PLATFORM_TENANT_PROTECTED',
    });
    expect(deleteTenantData).not.toHaveBeenCalled();
  });

  it('blocks deleting the actor’s current workspace', async () => {
    await expect(
      permanentlyDeleteTenant({
        tenantId: tenant.id,
        confirmName: tenant.name,
        actor: { ...actor, tenantId: tenant.id },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'CANNOT_DELETE_ACTIVE_WORKSPACE',
    });
    expect(deleteTenantData).not.toHaveBeenCalled();
  });
});
