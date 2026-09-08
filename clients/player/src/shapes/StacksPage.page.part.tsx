import { Action } from "../system-next/Action.tsx"
import { GET_COLOR, REVIEW_ALBUMS } from "./album-fixtures.ts"
import type { StacksContent } from "./StacksPage.tsx"
import { StacksPage, type StacksPageProps } from "./StacksPage.tsx"
import type { SurfaceState } from "./surface.ts"

export const name = "Stacks page"

const CONTENT: StacksContent = {
  lead: GET_COLOR,
  leadContext: "Most recently added",
  shelves: [
    { id: "collection", title: "In your collection", albums: REVIEW_ALBUMS.slice(1, 6) },
    { id: "downloaded", title: "On this device", albums: REVIEW_ALBUMS.slice(2, 5) },
    { id: "discovery", title: "Waiting in discovery", albums: REVIEW_ALBUMS.slice(5) },
  ],
}

/// The four edge states are the reason this part exists. Switching `library` in the
/// inspector is how someone sees the difference between waiting and empty without having to
/// unplug a network cable.
const SHOWN: SurfaceState<StacksContent> = {
  state: "shown",
  value: CONTENT,
  freshness: "live",
}

export default function StacksPagePart(props: Partial<StacksPageProps>) {
  return (
    <StacksPage
      library={props.library ?? SHOWN}
      emptyAction={<Action label="Add music" emphasis="primary" />}
      onRetry={() => undefined}
    />
  )
}
