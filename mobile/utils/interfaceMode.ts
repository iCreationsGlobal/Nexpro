/**
 * Simple/Full interface preference — per-membership (UserTenant.metadata.interfaceMode), not
 * tied to role. A fully literate admin can prefer Simple; an illiterate owner can hold full
 * admin rights while running Simple day to day. Mirrors Backend/services/interfaceModeHelper.js.
 */

export type InterfaceMode = 'full' | 'simple';

type MembershipLike = {
  metadata?: { interfaceMode?: unknown; simpleModeShowAdvanced?: unknown } | null;
  dataValues?: { metadata?: { interfaceMode?: unknown; simpleModeShowAdvanced?: unknown } | null } | null;
};

export function getInterfaceMode(membership: MembershipLike | null | undefined): InterfaceMode {
  const metadata = membership?.metadata ?? membership?.dataValues?.metadata;
  return metadata?.interfaceMode === 'simple' ? 'simple' : 'full';
}

/**
 * Whether a Simple Mode member chose to bring back the full app (Settings → Show advanced
 * features). Personal to the member, like interfaceMode. Mirrors Frontend/src/utils/interfaceMode.js.
 */
export function getSimpleModeShowAdvanced(membership: MembershipLike | null | undefined): boolean {
  const metadata = membership?.metadata ?? membership?.dataValues?.metadata;
  return metadata?.simpleModeShowAdvanced === true;
}
