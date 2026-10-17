/**
 * Pull-to-refresh in the phone/tablet app shell. The layout owns the gesture; pages that do
 * more than React Query refetches listen for this event (see usePullToRefresh).
 */
export const APP_REFRESH_EVENT = 'app:pull-refresh';

/**
 * Refetch every query on screen and let listening pages refresh too.
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @returns {Promise<void>} Resolves when everything has settled
 */
export function requestAppRefresh(queryClient) {
  const pending = [];
  const waitUntil = (work) => {
    pending.push(Promise.resolve(work).catch(() => {}));
  };
  window.dispatchEvent(new CustomEvent(APP_REFRESH_EVENT, { detail: { waitUntil } }));
  pending.push(queryClient.refetchQueries({ type: 'active' }).catch(() => {}));
  return Promise.all(pending).then(() => {});
}
