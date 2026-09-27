/** Route groups are omitted from pathnames: both index and (tabs)/index can be '/'. */
export function isStartupDestinationReady(fontsReady: boolean, loading: boolean, sessionSyncing: boolean, segments: readonly string[], pinGateActive = false): boolean {
  const first = segments[0];
  return fontsReady && !loading && !sessionSyncing && (pinGateActive || (!!first && first !== 'index'));
}
