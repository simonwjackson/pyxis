import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createYtDlp, formatSelector, YtDlpError } from "./ytdlp"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function executable(script: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pyxis-ytdlp-"))
  roots.push(root)
  const path = join(root, "yt-dlp")
  await writeFile(path, script)
  await chmod(path, 0o755)
  return path
}

const header = `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo '2026.08.21'
  exit 0
fi
`

describe("yt-dlp adapter", () => {
  test("builds a safe provider selector from output preferences", () => {
    expect(formatSelector(["m4a", "mp3", "not-a-real-format"])).toBe(
      "bestaudio[ext=m4a]/bestaudio[ext=mp3]",
    )
    expect(formatSelector(["not-a-real-format"])).toBe("bestaudio/best[acodec!=none]")
  })

  test("search maps valid lines into canonical tracks and skips unavailable entries", async () => {
    const binary = await executable(`${header}
cat <<'JSON'
{"id":"one","title":"Heroes","uploader":"David Bowie","album":"Heroes","duration":372,"thumbnail":"https://img/one"}
{"id":"two","title":"Life on Mars?","channel":"David Bowie","duration":240}
{"title":"Private video"}
JSON
`)
    const ytdlp = createYtDlp({ fallbackBinary: binary })

    const tracks = await ytdlp.search("David Bowie", 10)

    expect(tracks).toEqual([
      {
        source: "ytmusic",
        externalId: "one",
        title: "Heroes",
        artist: "David Bowie",
        album: "Heroes",
        durationMs: 372000,
        artworkUrl: "https://img/one",
      },
      {
        source: "ytmusic",
        externalId: "two",
        title: "Life on Mars?",
        artist: "David Bowie",
        durationMs: 240000,
      },
    ])
  })

  test("stream resolution returns the direct URL, required headers, and fidelity facts", async () => {
    const binary = await executable(`${header}
cat <<'JSON'
{"url":"https://audio.example/stream","http_headers":{"User-Agent":"yt-dlp","Referer":"https://music.youtube.com/"},"ext":"webm","abr":251.5,"asr":48000,"acodec":"opus"}
JSON
`)
    const ytdlp = createYtDlp({ fallbackBinary: binary })

    const stream = await ytdlp.resolveStream("video-id")

    expect(stream).toEqual({
      kind: "remote",
      url: "https://audio.example/stream",
      headers: {
        "User-Agent": "yt-dlp",
        Referer: "https://music.youtube.com/",
      },
      format: "webm/opus",
      bitrateKbps: 251.5,
      sampleRateHz: 48000,
      lossless: false,
    })
  })

  test("plugin-directed fetch writes bytes to the exact core-owned path", async () => {
    const binary = await executable(`${header}
target=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output" ]]; then
    target="$2"
    shift 2
  else
    shift
  fi
done
printf 'downloaded audio' > "$target"
`)
    const targetRoot = await mkdtemp(join(tmpdir(), "pyxis-ytdlp-target-"))
    roots.push(targetRoot)
    const target = join(targetRoot, "core.partial")
    const ytdlp = createYtDlp({ fallbackBinary: binary })

    await ytdlp.fetchStream("video-id", target)

    expect(await Bun.file(target).text()).toBe("downloaded audio")
  })

  test("a missing binary is classified separately from a provider exit", async () => {
    const ytdlp = createYtDlp({ fallbackBinary: "/does/not/exist/yt-dlp" })

    await expect(ytdlp.check()).rejects.toMatchObject({ code: "ytDlp.missing" })
  })

  test("a non-zero exit preserves stderr as a typed provider failure", async () => {
    const binary = await executable(`${header}
echo 'Video unavailable' >&2
exit 7
`)
    const ytdlp = createYtDlp({ fallbackBinary: binary })

    try {
      await ytdlp.resolveStream("gone")
      throw new Error("expected failure")
    } catch (error) {
      expect(error).toBeInstanceOf(YtDlpError)
      expect(error).toMatchObject({
        code: "ytDlp.failed",
        message: "yt-dlp exited with code 7: Video unavailable",
      })
    }
  })

  test("a mutable nightly becomes active on the next call without a restart", async () => {
    const fallback = await executable(`${header}
echo '{"id":"old","title":"Old","uploader":"Fallback"}'
`)
    const mutableRoot = await mkdtemp(join(tmpdir(), "pyxis-ytdlp-nightly-"))
    roots.push(mutableRoot)
    const ytdlp = createYtDlp({ fallbackBinary: fallback, mutableRoot })

    expect((await ytdlp.search("x", 1))[0]?.externalId).toBe("old")

    const nightly = join(mutableRoot, "yt-dlp")
    await writeFile(nightly, `${header}\necho '{"id":"new","title":"New","uploader":"Nightly"}'\n`)
    await chmod(nightly, 0o755)

    expect((await ytdlp.search("x", 1))[0]?.externalId).toBe("new")
  })
})
