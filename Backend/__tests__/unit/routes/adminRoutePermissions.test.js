const fs = require('fs');
const path = require('path');

const readRoutes = (file) => fs.readFileSync(path.join(__dirname, '../../../routes', file), 'utf8');

/** Every `router.<verb>(` declaration in the file, joined onto one line so multi-line ones can be matched. */
const routeDeclarations = (source) =>
  source
    .split(/\n(?=router\.(?:get|post|put|patch|delete)\()/)
    .filter((chunk) => /^router\.(get|post|put|patch|delete)\(/.test(chunk))
    .map((chunk) => chunk.split(/\);\s*\n/)[0].replace(/\s+/g, ' '));

describe('platform admin route permissions', () => {
  it('requires a specific permission on every platform-admin management route', () => {
    const declarations = routeDeclarations(readRoutes('platformAdminRoutes.js'));

    expect(declarations.length).toBeGreaterThan(0);
    declarations.forEach((declaration) => {
      expect(declaration).toMatch(/require(Any)?PlatformAdminPermission\(/);
    });
    expect(declarations.join('\n')).toMatch(
      /router\.put\('\/:id', requirePlatformAdminPermission\('users\.manage'\), updatePlatformAdmin/
    );
    expect(declarations.join('\n')).toMatch(
      /router\.post\('\/', requirePlatformAdminPermission\('users\.manage'\), createPlatformAdmin/
    );
  });

  it('requires settings.manage for every platform settings write', () => {
    const declarations = routeDeclarations(readRoutes('platformSettingsRoutes.js'));
    const writes = declarations.filter((d) => !d.startsWith('router.get('));

    expect(writes.length).toBeGreaterThan(0);
    writes.forEach((declaration) => {
      expect(declaration).toMatch(/requirePlatformAdminPermission\('settings\.manage'\)/);
    });
  });

  it('requires leads and jobs permissions on the admin leads and jobs routes', () => {
    const declarations = routeDeclarations(readRoutes('adminRoutes.js'));
    const leadsAndJobs = declarations.filter((d) => /^router\.\w+\('\/(leads|jobs)\b/.test(d));

    expect(leadsAndJobs.length).toBe(16);
    leadsAndJobs.forEach((declaration) => {
      const area = declaration.match(/'\/(leads|jobs)/)[1];
      const key = declaration.startsWith('router.get(') ? `${area}.view` : `${area}.manage`;
      expect(declaration).toContain(`requirePlatformAdminPermission('${key}')`);
    });
  });
});

describe('public invoice routes', () => {
  it('has no endpoint that records a payment without the payment provider confirming it', () => {
    const source = readRoutes('publicRoutes.js');

    expect(source).not.toMatch(/'\/invoices\/:token\/pay'/);
    expect(source).toMatch(/'\/invoices\/:token\/verify-paystack'/);
  });
});
