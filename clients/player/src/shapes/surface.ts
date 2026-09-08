// What a surface has to draw, in the vocabulary a surface speaks.
//
// This deliberately restates `Remote<T>` from the model rather than importing it. Nothing
// below a binding may reach for the edge, and a type-only import is still an import: it
// couples every page to the shape of the worker's answers, and the next person to need one
// more field reaches through the same door for a value. The binding translates once, at the
// seam, and the compiler checks the translation.
//
// The differences from `Remote<T>` are the point rather than an accident. A surface does not
// care whether data is absent because nobody asked or because a request is in flight — both
// are "wait, and say so". It does care about the difference between an empty library and an
// unreadable one, which `Remote` leaves to the caller to work out from `value.length`.

/// How much to trust what is shown. `local` is not a failure: a device that has never
/// reconciled still holds real data the person put there.
export type SurfaceFreshness = "live" | "local" | "stale"

export type SurfaceState<T> =
  /// Not asked yet, or asked and still waiting. Never draw "nothing here" from this.
  | { readonly state: "pending" }
  /// Asked, answered, and the answer is genuinely nothing. `reason` is set when the answer
  /// came from this device alone and reconciling failed, so the screen can say both "there
  /// is nothing here" and "and I could not check with the server".
  | { readonly state: "empty"; readonly reason?: string }
  /// Nothing to show and no way to show it. Distinct from `empty`: this is not an empty
  /// library, it is an unreadable one, and the offer is to retry rather than to add music.
  | { readonly state: "blocked"; readonly reason: string }
  /// There is something to draw. `reason` is set when it is being shown despite a failure,
  /// which must degrade the caption rather than blank the surface.
  | {
      readonly state: "shown"
      readonly value: T
      readonly freshness: SurfaceFreshness
      readonly reason?: string
    }
