import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { getAudioUrl, getYouTubeAudioUrl } from "./yt-dlp.js";

const originalYtDlpBin = process.env.PYXIS_YT_DLP_BIN;

afterEach(() => {
  if (originalYtDlpBin === undefined) {
    delete process.env.PYXIS_YT_DLP_BIN;
  } else {
    process.env.PYXIS_YT_DLP_BIN = originalYtDlpBin;
  }
});

async function useControlledYtDlp(
  scriptFor: (callsLog: string) => string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pyxis-yt-dlp-test-"));
  const bin = join(dir, "yt-dlp");
  const callsLog = join(dir, "calls.log");
  await writeFile(bin, scriptFor(callsLog), { mode: 0o755 });
  process.env.PYXIS_YT_DLP_BIN = bin;
  return callsLog;
}

describe("getAudioUrl", () => {
  it("falls back to a playable audio-bearing format when audio-only extraction is unavailable", async () => {
    const callsLog = await useControlledYtDlp(
      (path) => `#!/usr/bin/env bash
set -euo pipefail
format=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      format="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s\n' "$format" >> "${path}"
if [[ "$format" == "bestaudio" ]]; then
  echo 'ERROR: [youtube] track: Requested format is not available. Use --list-formats for a list of available formats' >&2
  exit 1
fi
if [[ "$format" == "bestaudio/best[acodec!=none]" ]]; then
  echo 'https://example.test/fallback.mp4'
  exit 0
fi
echo "unexpected format: $format" >&2
exit 2
`,
    );

    await expect(getAudioUrl("track-id")).resolves.toBe(
      "https://example.test/fallback.mp4",
    );
    expect(await Bun.file(callsLog).text()).toBe(
      "bestaudio\nbestaudio/best[acodec!=none]\n",
    );
  });

  it("does not retry unavailable videos with a different format", async () => {
    const callsLog = await useControlledYtDlp(
      (path) => `#!/usr/bin/env bash
set -euo pipefail
format=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      format="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s\n' "$format" >> "${path}"
echo 'ERROR: [youtube] track: Video unavailable' >&2
exit 1
`,
    );

    await expect(getAudioUrl("track-id")).rejects.toThrow(
      "Video unavailable",
    );
    expect(await Bun.file(callsLog).text()).toBe("bestaudio\n");
  });
});

describe("getYouTubeAudioUrl", () => {
  it("uses the same playable fallback for chapter-based YouTube streams", async () => {
    const callsLog = await useControlledYtDlp(
      (path) => `#!/usr/bin/env bash
set -euo pipefail
format=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      format="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s\n' "$format" >> "${path}"
if [[ "$format" == "bestaudio" ]]; then
  echo 'ERROR: [youtube] track: Requested format is not available. Use --list-formats for a list of available formats' >&2
  exit 1
fi
echo 'https://example.test/youtube-fallback.mp4'
`,
    );

    await expect(getYouTubeAudioUrl("video-id")).resolves.toBe(
      "https://example.test/youtube-fallback.mp4",
    );
    expect(await Bun.file(callsLog).text()).toBe(
      "bestaudio\nbestaudio/best[acodec!=none]\n",
    );
  });
});
