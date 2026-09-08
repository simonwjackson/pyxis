import { NowBarResting } from "../shapes/NowBarResting.tsx"
import { Action } from "./Action.tsx"
import { AppFrame } from "./AppFrame.tsx"
import { Flow } from "./Flow.tsx"
import { Heading } from "./Heading.tsx"
import { Text } from "./Text.tsx"

export const name = "App frame"

/// Filled with plain stand-ins rather than a real surface, because what is being reviewed
/// here is the arrangement: that the bar holds the bottom, the nav holds the top, and only
/// the middle scrolls. A real page in the outlet would make this a review of that page.
export default function AppFramePart() {
  return (
    <AppFrame
      nav={
        <Flow direction="row" gap="small">
          <Action label="Stacks" />
          <Action label="All albums" />
        </Flow>
      }
      bar={<NowBarResting />}
    >
      <Flow gap="regular">
        <Heading text="Surface" />
        <Text
          text="The outlet is the only part that scrolls, so the bar never rides over content."
          tone="muted"
        />
      </Flow>
    </AppFrame>
  )
}
