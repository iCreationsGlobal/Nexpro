import { useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { STUDIO_LIKE_TYPES } from '../constants';

/**
 * Resolves workspace kind, rental branch, and feature flags from bootstrap manifest
 * with fallbacks to tenant metadata and auth feature flags.
 */
export function useWorkspaceProfile() {
  const {
    activeTenant,
    workspaceProfile,
    bootstrapAccess,
    bootstrapSettings,
    hasFeature: authHasFeature,
  } = useAuth();

  const workspace = useMemo(
    () => workspaceProfile || activeTenant?.metadata?.workspaceManifest || null,
    [workspaceProfile, activeTenant?.metadata?.workspaceManifest]
  );

  const kind = useMemo(
    () => workspace?.kind || activeTenant?.businessType || 'shop',
    [workspace?.kind, activeTenant?.businessType]
  );

  const isRental = kind === 'rental';
  const isShop = kind === 'shop';
  const isPharmacy = kind === 'pharmacy';
  const isStudio = kind === 'studio' || STUDIO_LIKE_TYPES.includes(kind);

  const hasWorkspaceFeature = useCallback(
    (featureKey) => {
      // Plan flags from /auth/me are source of truth. A locked rental/shop
      // manifest snapshot must not hide features added after provisioning.
      if (authHasFeature(featureKey)) return true;
      if (Array.isArray(workspace?.enabledFeatures)) {
        return workspace.enabledFeatures.includes(featureKey);
      }
      return false;
    },
    [workspace?.enabledFeatures, authHasFeature]
  );

  const defaultBranchId = useMemo(
    () => bootstrapAccess?.defaultBranchId || workspace?.defaultBranchId || null,
    [bootstrapAccess?.defaultBranchId, workspace?.defaultBranchId]
  );

  const rentalSettings = useMemo(
    () => bootstrapSettings?.rental || workspace?.settingsKeys?.rental || null,
    [bootstrapSettings?.rental, workspace?.settingsKeys?.rental]
  );

  const isLocked = Boolean(workspace?.lockedAt);

  const isShopScoped = useMemo(
    () => (isShop || isRental) && hasWorkspaceFeature('shopsModule'),
    [isShop, isRental, hasWorkspaceFeature]
  );

  return {
    workspace,
    kind,
    isRental,
    isShop,
    isPharmacy,
    isStudio,
    isShopScoped,
    defaultBranchId,
    rentalSettings,
    isLocked,
    hasWorkspaceFeature,
    modules: workspace?.modules || null,
    ui: workspace?.ui || null,
  };
}

export default useWorkspaceProfile;
