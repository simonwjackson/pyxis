/// The URL, read once, in the only place allowed to read it.
///
/// Routing is state: it lives outside the component tree, it changes without React being
/// told, and two readers of it disagree the moment one of them navigates. So it is read
/// here and passed down as a plain value, exactly like the library is.
///
/// This file is `.binding.tsx` rather than `.ts` on purpose. The architecture gate treats
/// the binding suffix as the licence to touch `location`, and a pure-looking `route.ts`
/// that quietly read the URL is precisely the leak the rule exists to stop.

import { useCallback, useEffect, useState } from "react"
import { type Route, readRoute, routePath, sameRoute } from "../router/route.ts"

export interface RouteBinding {
  readonly route: Route
  /// Navigate, pushing a history entry so the back button works.
  readonly go: (route: Route) => void
}

export function useRoute(): RouteBinding {
  // Read lazily: the initial URL is only correct at first render, and computing it on every
  // render would discard a navigation that has already happened.
  const [route, setRoute] = useState<Route>(() => readRoute(window.location.pathname))

  useEffect(() => {
    // The back and forward buttons change the URL without going through `go`. Without this
    // the address bar and the screen drift apart, which is the classic broken-back-button.
    const onPopState = () => setRoute(readRoute(window.location.pathname))
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const go = useCallback((next: Route) => {
    // Pushing an identical entry makes one back press appear to do nothing, so re-selecting
    // the current surface updates nothing rather than stacking a duplicate.
    setRoute((current) => {
      if (sameRoute(current, next)) return current
      window.history.pushState(null, "", routePath(next))
      return next
    })
  }, [])

  return { route, go }
}
