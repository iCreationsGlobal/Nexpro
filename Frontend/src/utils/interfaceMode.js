/**
 * Simple/Full interface preference — per-membership (UserTenant.metadata.interfaceMode), not
 * tied to role. Mirrors Backend/services/interfaceModeHelper.js and mobile/utils/interfaceMode.ts.
 */

export function getInterfaceMode(membership) {
  const metadata = membership?.metadata;
  return metadata?.interfaceMode === 'simple' ? 'simple' : 'full';
}

/**
 * Whether a Simple Mode member has chosen to bring back the full menu (Settings → Show advanced
 * features). Personal to the member, like interfaceMode itself.
 */
export function getSimpleModeShowAdvanced(membership) {
  return membership?.metadata?.simpleModeShowAdvanced === true;
}
