/** Path a route opens, without route groups or query: '/(tabs)/store?section=orders' → '/store'. */
export const routePath = (route: string) => route.split(/[?#]/)[0].replace(/\/\([^/]+\)/g, '') || '/';

const sectionOf = (route: string) => /[?&]section=([^&#]*)/.exec(route)?.[1];

/**
 * Whether the tab slot that opens `route` is the screen on show. The swappable slots (focus area,
 * Orders) open hidden screens, so the tab navigator never marks them as the focused tab itself.
 * A route with `?section=` only counts on that section of its screen.
 */
export function isSlotRouteActive(pathname: string, route: string, section?: string | null) {
  const path = routePath(route);
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  const wanted = sectionOf(route);
  return wanted ? section === wanted : true;
}
