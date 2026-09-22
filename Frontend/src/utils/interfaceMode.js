/**
 * Simple/Full interface preference — per-membership (UserTenant.metadata.interfaceMode), not
 * tied to role. Mirrors Backend/services/interfaceModeHelper.js and mobile/utils/interfaceMode.ts.
 */

export function getInterfaceMode(membership) {
  const metadata = membership?.metadata;
  return metadata?.interfaceMode === 'simple' ? 'simple' : 'full';
}
