export const STARTUP_DATA_WAIT_MS = 15000;

/** Existing successful data can render immediately while its refresh continues. */
export function canRevealStartupData(state?: { data?: unknown; status: string; fetchStatus: string }) {
  return !!state && (state.data !== undefined && state.data !== null);
}
