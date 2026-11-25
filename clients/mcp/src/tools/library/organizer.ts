import type { McpServer, ServerContext } from "@modelcontextprotocol/server"
import { z } from "zod"
import { confirmAction } from "../../mrtr"
import { type PyxisClient, PyxisError } from "../../pyxis-client"
import { albums, data, expression, id, invalid, outcome, page, sort, tool } from "./tools"

const tags = z.array(z.string()).max(64)
const change = z.strictObject({ albumId: id, tags })
const changes = z.array(change).min(1).max(100)
function normalized(labels: string[]) {
  // Rust's str::trim uses Unicode White_Space, and its String ordering is bytewise.
  const values = labels.map((raw) =>
    raw.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "").toLowerCase(),
  )
  if (values.some((s) => !s || [...s].length > 64 || /\p{Cc}|\p{Cs}/u.test(s)))
    invalid("Tags must be 1–64 characters without control characters after normalization.")
  return [...new Set(values)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
}
async function tagPlan(pyxis: PyxisClient, changes: z.infer<typeof change>[], ctx?: ServerContext) {
  const library = new Map((await albums(pyxis)).map((a) => [a.id, a])),
    seen = new Set<string>()
  const plan = changes.map(({ albumId, tags }) => {
    const album = library.get(albumId)
    if (!album) invalid(`Unknown album: ${albumId}`)
    if (seen.has(albumId)) invalid(`Duplicate album: ${albumId}`)
    seen.add(albumId)
    return { albumId, before: album.tags, after: normalized(tags) }
  })
  if (ctx) {
    const confirmation = confirmAction(
      ctx,
      `Replace album tags as follows? ${JSON.stringify(plan)}`,
    )
    if (confirmation) return confirmation
    const applied: string[] = []
    for (const { albumId, after } of plan) {
      try {
        const result = await pyxis.call({
          _tag: "library.album.command.run",
          payload: { albumId, command: { _tag: "tags.set", payload: { tags: after } } },
        })
        if (result.status !== "applied")
          return data({ status: result.status, albumId, applied }, true)
        applied.push(albumId)
      } catch (error) {
        if (!(error instanceof PyxisError)) throw error
        return data({ ...error.failure, albumId, applied }, true)
      }
    }
  }
  return data({ status: "ready", changes: plan })
}
export function registerOrganizer(server: McpServer, pyxis: PyxisClient) {
  tool(
    server,
    "organizer.snapshot",
    "Read all library albums, tracks, tags and revisions in one snapshot.",
    {},
    "read",
    async () => data({ albums: await albums(pyxis) }),
  )
  tool(
    server,
    "organizer.tags.preview",
    "Preview complete replacement tag sets. No changes are written.",
    { changes },
    "read",
    async ({ changes }) => tagPlan(pyxis, changes),
  )
  tool(
    server,
    "organizer.tags.apply",
    "Apply complete replacement tag sets. Preflight and confirmation precede the first write.",
    { changes },
    "write",
    async ({ changes }, ctx) => tagPlan(pyxis, changes, ctx),
  )
  tool(
    server,
    "library.tags.bulk",
    "Replace the tags on all named albums with the supplied set.",
    { albumIds: z.array(id).min(1).max(100), tags },
    "write",
    async ({ albumIds, tags }, ctx) =>
      tagPlan(
        pyxis,
        albumIds.map((albumId) => ({ albumId, tags })),
        ctx,
      ),
  )
  tool(
    server,
    "library.tags.set",
    "Replace all tags on one album.",
    { albumId: id, tags },
    "write",
    async ({ albumId, tags }, ctx) => {
      const values = normalized(tags)
      return (
        confirmAction(ctx, `Replace all tags on ${albumId} with ${JSON.stringify(values)}?`) ??
        outcome(
          await pyxis.call({
            _tag: "library.album.command.run",
            payload: { albumId, command: { _tag: "tags.set", payload: { tags: values } } },
          }),
        )
      )
    },
  )
  tool(
    server,
    "shelves.save",
    "Save a named tag query. Supply both shelfId and expectedRevision to replace it.",
    {
      shelfId: id.optional(),
      expectedRevision: z.int().positive().optional(),
      name: id,
      tagExpression: expression,
      sort,
    },
    "write",
    async ({ shelfId, expectedRevision, ...definition }, ctx) => {
      if (!!shelfId !== (expectedRevision !== undefined))
        invalid("shelfId and expectedRevision must be supplied together.")
      if (shelfId) {
        const prompt = confirmAction(
          ctx,
          `Replace shelf ${shelfId} revision ${expectedRevision} with ${JSON.stringify(definition)}?`,
        )
        if (prompt) return prompt
      }
      return outcome(
        await pyxis.call({
          _tag: "library.shelf.save",
          payload: {
            ...definition,
            ...(shelfId && { shelfId }),
            ...(expectedRevision && { expectedRevision }),
          },
        }),
      )
    },
  )
  tool(server, "shelves.list", "List saved album queries.", {}, "read", async () =>
    outcome(await pyxis.call({ _tag: "library.shelves.list", payload: {} })),
  )
  tool(
    server,
    "shelves.remove",
    "Delete a saved query at its expected revision.",
    { shelfId: id, expectedRevision: z.int().positive() },
    "write",
    async (args, ctx) =>
      confirmAction(ctx, `Remove shelf ${args.shelfId} at revision ${args.expectedRevision}?`) ??
      outcome(await pyxis.call({ _tag: "library.shelf.remove", payload: args })),
  )
  tool(
    server,
    "shelves.albums",
    "Page albums matching a shelf. Pass the same shelfId with its continuation.",
    { shelfId: id, ...page },
    "read",
    async ({ shelfId, cursor, limit }) =>
      outcome(
        await pyxis.call({
          _tag: "library.shelf.albums.list",
          payload: { shelfId, ...(limit && { limit }), ...(cursor && { cursor }) },
        }),
      ),
  )
}
