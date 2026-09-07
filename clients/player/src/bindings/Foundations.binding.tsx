import { useState } from "react"
import { AlbumTile } from "../shapes/AlbumTile.tsx"
import { Action } from "../system-next/Action.tsx"
import { Avatar } from "../system-next/Avatar.tsx"
import { ChoiceChip } from "../system-next/ChoiceChip.tsx"
import { Field } from "../system-next/Field.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { Heading } from "../system-next/Heading.tsx"
import { IconButton } from "../system-next/IconButton.tsx"
import { Notice } from "../system-next/Notice.tsx"
import { Progress } from "../system-next/Progress.tsx"
import { Row } from "../system-next/Row.tsx"
import { SearchForm } from "../system-next/SearchForm.tsx"
import { Text } from "../system-next/Text.tsx"

// Development composition root, not a product page or a fake playback authority.
// Interaction state belongs here; all actual visual units are the production components.
export function FoundationsBinding({
  scopeId,
  artworkUrl,
}: {
  readonly scopeId: string
  readonly artworkUrl: string
}) {
  const [selected, setSelected] = useState(false)
  const [query, setQuery] = useState("")
  const [opened, setOpened] = useState(false)
  return (
    <Flow gap="large">
      <Flow gap="small">
        <Heading text="Pyxis · Foundations" level={1} scale="title" />
        <Text
          text="Component review. Not connected to your library or playback."
          tone="muted"
          size="small"
        />
      </Flow>
      <Flow direction="row" gap="large">
        <AlbumTile
          title="GET COLOR"
          artist="HEALTH"
          artworkUrl={artworkUrl}
          availability="available"
          onOpen={() => setOpened(true)}
        />
        <AlbumTile
          title="An album with no artwork"
          artist="Unknown artist"
          availability="unknown"
        />
        <Flow gap="small">
          <Heading text="GET COLOR" scale="display" />
          <Text text="HEALTH · 2009" tone="muted" weight="strong" />
          <Text
            text={opened ? "Artwork selected" : "Select the cover to exercise the real callback"}
            size="small"
          />
        </Flow>
      </Flow>
      <Flow direction="row">
        <IconButton label="Previous" icon="previous" />
        <IconButton label="Play (preview only)" icon="play" emphasis="primary" />
        <IconButton label="Next" icon="next" />
        <IconButton label="Close" icon="down" />
        <IconButton label="Volume unavailable" icon="sound" disabled />
        <Action label="Add to collection" emphasis="primary" />
        <Action label="Unavailable" disabled />
      </Flow>
      <Flow direction="row">
        <ChoiceChip
          label="Downloaded"
          count={8}
          selected={selected}
          onClick={() => setSelected(!selected)}
        />
        <ChoiceChip
          label="All albums"
          count={370}
          selected={!selected}
          onClick={() => setSelected(false)}
        />
        <ChoiceChip label="No source" disabled />
      </Flow>
      <Row
        title="Living Room"
        detail="Unavailable · sound remains on this device"
        tone="danger"
        leading={<Avatar label="Living Room" initials="LR" />}
        actions={<Action label="Retry" />}
      />
      <Row
        title="A long album title that must wrap without hiding its actions or widening a phone"
        detail="A second, deliberately long line to test how the reusable row handles real content."
        actions={<Action label="Open album" />}
      />
      <SearchForm id={`${scopeId}-search`} label="Search for an album" onSearch={setQuery} />
      <Text
        text={query ? `Submitted: ${query}` : "No search submitted"}
        tone="muted"
        size="small"
      />
      <Field
        id={`${scopeId}-password`}
        label="Password"
        type="password"
        error="Password was not accepted."
        autoComplete="off"
      />
      <Progress label="Download progress" percentage={37} />
      <Notice
        message="This album was not moved. Your library is unchanged."
        tone="failure"
        actions={<Action label="Retry move" />}
      />
    </Flow>
  )
}
