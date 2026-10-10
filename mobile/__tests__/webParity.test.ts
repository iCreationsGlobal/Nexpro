import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { BUSINESS_OPTIONS } from '@/constants/businessTypes';
import { SCANNING_CONFIG_DEFAULTS, isScanningEnabled } from '@/utils/posScanningConfig';

function readWebExports(relativePath: string) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../Frontend/src', relativePath), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/export /g, '');
  const context = vm.createContext({ STUDIO_LIKE_TYPES: [] });
  vm.runInContext(`${source}\nthis.result = { ${relativePath.includes('businessTypes') ? 'BUSINESS_OPTIONS' : 'SCANNING_CONFIG_DEFAULTS'} };`, context);
  return context.result;
}

describe('shared web/mobile release behavior', () => {
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
