import { Action } from "../system-next/Action.tsx"
import type { AlbumSummary } from "./album.ts"
import { REVIEW_ALBUMS } from "./album-fixtures.ts"
import { LibraryPage, type LibraryPageProps } from "./LibraryPage.tsx"
import type { SurfaceState } from "./surface.ts"

export const name = "All albums page"

const SHOWN: SurfaceState<readonly AlbumSummary[]> = {
  state: "shown",
  value: REVIEW_ALBUMS,
  freshness: "live",
}

export default function LibraryPagePart(props: Partial<LibraryPageProps>) {
  return (
    <LibraryPage
      library={props.library ?? SHOWN}
      emptyAction={<Action label="Add music" emphasis="primary" />}
      onRetry={() => undefined}
    />
  )
}
