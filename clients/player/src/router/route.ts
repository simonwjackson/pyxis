/// Where the person is, as a value.
///
/// Deliberately free of `location`, `history` and React. Parsing a path is arithmetic on a
/// string and belongs nowhere near the browser; the binding that owns the URL imports this
/// and does the reading. That split is what lets the route table be tested without a DOM
/// and keeps the gate's rule — only a binding reads the URL — cheap to obey.

/// A surface the person can be looking at.
///
/// A closed union rather than a string, so adding a surface fails every exhaustive switch
/// that has not been updated instead of falling through to a default at runtime.
export type Route = { readonly name: "stacks" } | { readonly name: "library" }

export const STACKS: Route = { name: "stacks" }
export const LIBRARY: Route = { name: "library" }

/// Every route, in the order a navigation control should offer them.
export const ROUTES: readonly Route[] = [STACKS, LIBRARY]

const PATHS: Record<Route["name"], string> = {
  stacks: "/",
  library: "/library",
}

/// The title a navigation control shows. Sentence case, because these are labels in a
/// product and not headings in a magazine.
const TITLES: Record<Route["name"], string> = {
  stacks: "Stacks",
  library: "All albums",
}

export const routePath = (route: Route): string => PATHS[route.name]
export const routeTitle = (route: Route): string => TITLES[route.name]

/// Read a pathname into a route.
///
/// An unrecognised path resolves to the home surface rather than to a not-found screen.
/// This client is served from a device the person owns and has no deep-link surface area
/// worth a 404; sending them somewhere real is the better answer. If that ever stops being
/// true, this is the one place that has to change.
export function readRoute(pathname: string): Route {
  const normalised = pathname.replace(/\/+$/, "")
  if (normalised === "") return STACKS
  const found = ROUTES.find((route) => routePath(route) === normalised)
  return found ?? STACKS
}

/// True when two routes address the same surface. Used to avoid pushing a duplicate
/// history entry, which would make the back button appear broken.
export const sameRoute = (left: Route, right: Route): boolean => left.name === right.name
