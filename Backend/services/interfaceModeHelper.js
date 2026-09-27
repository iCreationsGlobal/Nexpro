const INTERFACE_MODES = Object.freeze(['full', 'simple']);
const DEFAULT_INTERFACE_MODE = 'full';

/**
 * Normalize a requested interface mode, falling back to 'full' for anything unrecognized.
 * @param {unknown} value
 * @returns {'full'|'simple'}
 */
function sanitizeInterfaceMode(value) {
  return INTERFACE_MODES.includes(value) ? value : DEFAULT_INTERFACE_MODE;
}

/**
 * Build the API payload for a member's interface-mode preference (per-membership, not tied to role).
 * `showAdvanced` brings the full menu back while staying in Simple Mode.
 * @param {object|null|undefined} membership - UserTenant instance or plain object
 * @returns {{ interfaceMode: 'full'|'simple', showAdvanced: boolean, source: 'user'|'none' }}
 */
function getInterfaceMode(membership) {
  const metadata =
    membership?.metadata && typeof membership.metadata === 'object' ? membership.metadata : {};
  const showAdvanced = metadata.simpleModeShowAdvanced === true;
  if (INTERFACE_MODES.includes(metadata.interfaceMode)) {
    return { interfaceMode: metadata.interfaceMode, showAdvanced, source: 'user' };
  }
  return { interfaceMode: DEFAULT_INTERFACE_MODE, showAdvanced, source: 'none' };
}

module.exports = {
  INTERFACE_MODES,
  DEFAULT_INTERFACE_MODE,
  sanitizeInterfaceMode,
  getInterfaceMode,
};
