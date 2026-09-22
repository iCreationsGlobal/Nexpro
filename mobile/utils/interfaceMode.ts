/**
 * Simple/Full interface preference — per-membership (UserTenant.metadata.interfaceMode), not
 * tied to role. A fully literate admin can prefer Simple; an illiterate owner can hold full
 * admin rights while running Simple day to day. Mirrors Backend/services/interfaceModeHelper.js.
 */

export type InterfaceMode = 'full' | 'simple';

type MembershipLike = {
  metadata?: { interfaceMode?: unknown } | null;
  dataValues?: { metadata?: { interfaceMode?: unknown } | null } | null;
};

export function getInterfaceMode(membership: MembershipLike | null | undefined): InterfaceMode {
  const metadata = membership?.metadata ?? membership?.dataValues?.metadata;
  return metadata?.interfaceMode === 'simple' ? 'simple' : 'full';
}
