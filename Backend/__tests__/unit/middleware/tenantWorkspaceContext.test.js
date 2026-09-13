const { attachWorkspaceContext } = require('../../../middleware/tenant');

describe('attachWorkspaceContext', () => {
  it('attaches manifest fields from tenant metadata', () => {
    const req = {
      tenant: {
        id: 'tenant-rental',
        businessType: 'rental',
        metadata: {
          workspaceManifest: {
            kind: 'rental',
            lockedAt: '2026-08-29T00:00:00.000Z',
            defaultBranchId: 'branch-1',
            enabledFeatures: ['rentals', 'crm', 'shopsModule'],
          },
        },
      },
    };

    attachWorkspaceContext(req);

    expect(req.workspaceManifest?.kind).toBe('rental');
    expect(req.workspaceKind).toBe('rental');
    expect(req.defaultBranchId).toBe('branch-1');
    expect(req.enabledFeatures).toEqual(['rentals', 'crm', 'shopsModule']);
  });

  it('sets null enabledFeatures when manifest is missing', () => {
    const req = {
      tenant: {
        id: 'tenant-shop',
        businessType: 'shop',
        metadata: {},
      },
    };

    attachWorkspaceContext(req);

    expect(req.workspaceManifest).toBeNull();
    expect(req.workspaceKind).toBeNull();
    expect(req.defaultBranchId).toBeNull();
    expect(req.enabledFeatures).toBeNull();
  });
});
