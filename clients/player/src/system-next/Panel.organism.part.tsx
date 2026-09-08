import { Action } from "./Action.tsx"
import { Avatar } from "./Avatar.tsx"
import { Panel } from "./Panel.tsx"
import { Row } from "./Row.tsx"
import { StatusMark } from "./StatusMark.tsx"
export const name = "Panel"
// Three rows in three states, because a panel where every row is healthy hides the two things
// the design has to survive: a row that needs a verb, and a row that is present but not usable.
export default function PanelPart() {
  return (
    <Panel title="Sources" count={3} note="A signed-out source keeps its albums but cannot play.">
      <Row
        title="YouTube Music"
        detail="Streaming and library · 366 albums"
        leading={<Avatar label="YouTube Music" initials="YT" />}
        actions={<StatusMark label="Connected" state="ready" />}
      />
      <Row
        title="Pandora"
        detail="Session expired"
        tone="danger"
        leading={<Avatar label="Pandora" initials="PA" />}
        actions={<Action label="Reconnect" />}
      />
      <Row
        title="Soulseek"
        detail="Library only, never uploads"
        leading={<Avatar label="Soulseek" initials="SL" />}
        actions={<Action label="Install" />}
      />
    </Panel>
  )
}
