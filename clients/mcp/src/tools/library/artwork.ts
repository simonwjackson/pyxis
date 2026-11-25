import type { CallToolResult } from "@modelcontextprotocol/server"
import { PyxisError } from "../../pyxis-client"

const maxBytes = 4 * 1024 * 1024
export async function artwork(rawUrl: string): Promise<CallToolResult> {
  const url = URL.parse(rawUrl)
  // Library metadata is account-writable. Never let it select arbitrary services on
  // the MCP host's network. The origin, including its port, is operator controlled.
  const origins = process.env.PYXIS_MCP_ARTWORK_ORIGINS?.split(",").map((item) => item.trim()) ?? []
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !origins.includes(url.origin)
  ) {
    throw new PyxisError({
      code: "artwork.originRefused",
      message: "Artwork requires an HTTP(S) origin listed in PYXIS_MCP_ARTWORK_ORIGINS.",
      retryable: false,
    })
  }
  const abort = new AbortController()
  try {
    const response = await fetch(url, {
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
    })
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
    if (
      !response.ok ||
      !response.body ||
      !mimeType ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType)
    )
      throw Error("Invalid artwork")
    let size = 0
    const chunks: Uint8Array[] = []
    const reader = response.body.getReader()
    while (true) {
      const { value: chunk, done } = await reader.read()
      if (done) break
      size += chunk.byteLength
      if (size > maxBytes) throw Error("Artwork too large")
      chunks.push(chunk)
    }
    if (!size) throw Error("Empty artwork")
    return {
      content: [{ type: "image", mimeType, data: Buffer.concat(chunks).toString("base64") }],
    }
  } catch {
    throw new PyxisError({
      code: "artwork.unavailable",
      message: "No supported image within the 4 MiB and 8 second limits.",
      retryable: true,
    })
  } finally {
    abort.abort()
  }
}
