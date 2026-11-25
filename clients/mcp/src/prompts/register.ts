import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

const message = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
})
export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "DJ",
    {
      description: "Pick and play music for a mood or moment.",
      argsSchema: z.strictObject({
        mood: z.string().trim().min(1).max(1000).describe("Mood, moment, or activity"),
      }),
    },
    ({ mood }) =>
      message(
        `Pick music for this mood or moment: ${mood}. Use library.tags and library.byTag or library.search to find a fitting album. Use session.list to find a reachable target; ask me which one if unclear. Play your selection with playback.album and tell me the album, artist, and target.`,
      ),
  )
  server.registerPrompt(
    "Rediscover",
    { description: "Find neglected library albums and offer to play one." },
    () =>
      message(
        "Use history.neglected with a cutoff of 90 days ago, then organizer.snapshot to find tags and tracks for those albums. Explain the cutoff and respect historyMayBeTruncated: no observed play is not proof an album was never played. Suggest up to three albums with a reason for each. Offer to play my choice with playback.album; wait for my selection and target first.",
      ),
  )
}
