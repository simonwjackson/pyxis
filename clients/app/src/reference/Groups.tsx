import { useState } from "react"
import type {
  RpcGroupMember,
  RpcGroupPage,
  RpcLibraryGroup,
} from "../../../../contracts/generated/pyxis"
import { createSupportRpc } from "../rpc/support"
import { useReference } from "./Reference.context"

const liveRpc = createSupportRpc()

export function ReferenceGroups() {
  const { grant } = useReference()
  return <ReferenceGroupTools token={grant?.bearerToken} />
}

export function ReferenceGroupTools({
  token,
  rpc = liveRpc,
}: {
  readonly token: string | undefined
  readonly rpc?: typeof liveRpc
}) {
  const [groups, setGroups] = useState<readonly RpcLibraryGroup[]>([])
  const [selected, setSelected] = useState<string>()
  const [page, setPage] = useState<RpcGroupPage>()
  const [error, setError] = useState<string>()
  const run = async (action: () => Promise<void>) => {
    setError(undefined)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const load = async () => {
    if (token === undefined) return
    const { outcome } = await rpc(token, { _tag: "library.groups.list", payload: {} })
    if (outcome.status !== "ready") throw new Error(outcome.value.message)
    setGroups(outcome.value)
  }
  const items = async (groupId: string, cursor?: string) => {
    if (token === undefined) return
    const { outcome } = await rpc(token, {
      _tag: "library.group.items.list",
      payload: { groupId, limit: 25, ...(cursor === undefined ? {} : { cursor }) },
    })
    if (outcome.status !== "ready")
      throw new Error("value" in outcome ? outcome.value.message : outcome.status)
    setSelected(groupId)
    setPage(outcome.value)
  }
  return (
    <section>
      <h2>Library groups</h2>
      <button type="button" disabled={token === undefined} onClick={() => void run(load)}>
        Load groups
      </button>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            <button type="button" onClick={() => void run(() => items(group.id))}>
              {group.label} ({group.count ?? "count unavailable"})
            </button>
            {group.availability.status === "partial" ? (
              <pre>
                {group.availability.value
                  .map((source) => `${source.pluginId}: ${source.failure.message}`)
                  .join("\n")}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
      <ul>
        {page?.items.map((item) => (
          <li key={`${selected}:${memberId(item)}`}>
            {memberLabel(item)}
            {item._tag === "album" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const form = new FormData(event.currentTarget)
                  const tags = String(form.get("tags") ?? "")
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                  void run(async () => {
                    if (token === undefined) return
                    const { outcome } = await rpc(token, {
                      _tag: "library.album.command.run",
                      payload: {
                        albumId: item.payload.id,
                        command: { _tag: "tags.set", payload: { tags } },
                      },
                    })
                    if (outcome.status !== "applied")
                      throw new Error("value" in outcome ? outcome.value.message : outcome.status)
                    await load()
                    if (selected !== undefined) await items(selected)
                  })
                }}
              >
                <label>
                  Tags (comma separated){" "}
                  <input name="tags" defaultValue={item.payload.tags.join(", ")} />
                </label>
                <button type="submit">Set tags</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {selected === undefined || page?.cursor === undefined ? null : (
        <button type="button" onClick={() => void run(() => items(selected, page.cursor))}>
          Next page
        </button>
      )}
      {error === undefined ? null : <p role="alert">{error}</p>}
    </section>
  )
}

function memberLabel(item: RpcGroupMember): string {
  switch (item._tag) {
    case "album":
      return `${item.payload.artist} — ${item.payload.title}`
    case "bookmark":
      return item.payload.track?.title ?? `${item.payload.bookmark.trackId} (unavailable)`
    case "station":
      return `${item.payload.name} (${item.payload.sourcePluginId})`
    case "playlist":
      return `${item.payload.title} (${item.payload.trackIds.length} tracks)`
  }
}

function memberId(item: RpcGroupMember): string {
  switch (item._tag) {
    case "album":
      return item.payload.id
    case "bookmark":
      return item.payload.bookmark.id
    case "station":
      return `${item.payload.sourcePluginId}:${item.payload.externalId}`
    case "playlist":
      return item.payload.id
  }
}
