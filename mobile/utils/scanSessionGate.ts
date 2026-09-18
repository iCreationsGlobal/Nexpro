/** Synchronous gate: camera callbacks can repeat before React renders new state. */
export function createScanSessionGate() {
  let accepting = false;
  return {
    open() { accepting = true; },
    close() { accepting = false; },
    accept(data: string): boolean {
      if (!accepting || !data.trim()) return false;
      accepting = false;
      return true;
    },
  };
}
