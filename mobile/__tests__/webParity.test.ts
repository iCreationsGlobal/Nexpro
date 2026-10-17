import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { BUSINESS_OPTIONS } from '@/constants/businessTypes';
import { SCANNING_CONFIG_DEFAULTS, isScanningEnabled } from '@/utils/posScanningConfig';
import { FOCUS_AREA_DEFINITIONS } from '@/constants/focusAreas';

function readWebExports(relativePath: string) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../Frontend/src', relativePath), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/export /g, '');
  const context = vm.createContext({ STUDIO_LIKE_TYPES: [] });
  vm.runInContext(`${source}\nthis.result = { ${relativePath.includes('businessTypes') ? 'BUSINESS_OPTIONS' : 'SCANNING_CONFIG_DEFAULTS'} };`, context);
  return context.result;
}

/** The web copy of the focus areas (fills the phone/tablet tab bar), icons stubbed out. */
function readWebFocusAreas() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../Frontend/src/config/focusAreas.js'), 'utf8');
  const iconImport = source.match(/import \{([^}]*)\} from 'lucide-react';/);
  const icons = Object.fromEntries(
    (iconImport?.[1] || '').split(',').map((name) => name.trim()).filter(Boolean).map((name) => [name, {}])
  );
  const studioSource = fs.readFileSync(path.resolve(__dirname, '../../Frontend/src/constants/studioLikeTypes.js'), 'utf8');
  const studioTypes = JSON.parse(
    (studioSource.match(/STUDIO_LIKE_TYPES = Object\.freeze\((\[[\s\S]*?\])\)/)?.[1] || '[]').replace(/'/g, '"').replace(/,\s*\]/, ']')
  );
  const context = vm.createContext({ ...icons, STUDIO_LIKE_TYPES: studioTypes });
  vm.runInContext(
    `${source.replace(/^import [\s\S]*?;$/gm, '').replace(/export /g, '')}\nthis.result = FOCUS_AREA_DEFINITIONS;`,
    context
  );
  return context.result as Array<{ id: string; requiredFeature?: string; appliesTo: (bt: string) => boolean }>;
}

describe('shared web/mobile release behavior', () => {
  it('offers the same focus areas on web (tab bar slot) as on mobile', () => {
    const web = readWebFocusAreas();
    expect(web.map((def) => def.id)).toEqual(FOCUS_AREA_DEFINITIONS.map((def) => def.id));
    expect(web.map((def) => def.requiredFeature ?? null)).toEqual(
      FOCUS_AREA_DEFINITIONS.map((def) => def.requiredFeature ?? null)
    );
    for (const businessType of ['shop', 'pharmacy', 'rental', 'printing_press', 'studio', 'barber', 'salon']) {
      expect(web.map((def) => def.appliesTo(businessType))).toEqual(
        FOCUS_AREA_DEFINITIONS.map((def) => def.appliesTo(businessType))
      );
    }
  });

  it('offers the same onboarding catalog, with the mobile studio workflow alias', () => {
    const web = readWebExports('constants/businessTypes.js').BUSINESS_OPTIONS;
    expect(BUSINESS_OPTIONS).toEqual(web.map((option: { coreType: string }) => ({
      ...option, coreType: option.coreType === 'printing_press' ? 'studio' : option.coreType,
    })));
  });

  it('matches web scanning defaults and respects an explicit disable', () => {
    expect(SCANNING_CONFIG_DEFAULTS).toEqual(readWebExports('utils/posScanningConfig.js').SCANNING_CONFIG_DEFAULTS);
    expect(isScanningEnabled()).toBe(true);
    expect(isScanningEnabled({ scanning: { enabled: false } })).toBe(false);
  });
});
