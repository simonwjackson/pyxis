# YouTube Music prior art and Pyxis gaps

Researched on 2026-11-24 with five researchers and one evidence audit. The raw briefs and the audit are in
`~/.cache/research/ytmusic-prior-art-20261125T000421/`. Each item is labelled *checked* (the
auditor read the source) or *brief* (a researcher cited it and nobody checked it again).

## Who else did this

| Project | Language | Status | Notes |
|---|---|---|---|
| [ytmusicapi](https://github.com/sigma67/ytmusicapi) | Python | Active, v1.12.3 | The most complete. The reference for params and continuations |
| [YouTube.js / youtubei.js](https://github.com/LuanRT/YouTube.js) | TS | Active | Session bootstrap and typed node parsers |
| [ytmusic-api](https://github.com/zS1L3NT/ts-npm-ytmusic-api) | TS | Active | Small; retries; OLAK→MPREb conversion |
| [muse](https://github.com/vixalien/muse) | Deno | | A port of ytmusicapi; visitorData; playlist radio |
| [InnerTune](https://github.com/z-huang/InnerTune) | Kotlin | Last pushed 2025-11-13 | Automix, sw.js_data visitorData, get_queue |
| [Kaset](https://github.com/sozercan/kaset) | Swift | Active | `docs/api-discovery.md` has guest probes dated 2026 |

## Gaps, ranked for Pyxis

| Gap | Status | Plan home |
|---|---|---|
| Artist radio and shuffle ids must be read from the artist header buttons. Building `RDEM`/`RDAO` + channelId is wrong | checked (ytmusicapi `get_artist`) | U60 |
| Radio and shuffle `params` on `next`: `wAEB`, and the literal `wAEB8gECKAE%3D` | checked (ytmusicapi `watch.py`) | U60 |
| Playlist radio: `RDAMPL`+id with `wAEB8gECeAE%3D` | checked (muse `queue.ts`) | U60 |
| Endless radio through `automixPreviewVideoRenderer`, with a depth cap that InnerTune lacks | checked (InnerTune `YouTube.kt`) | M10 |
| Accept both `nextRadioContinuationData` and `nextContinuationData` | checked (the libraries disagree) | U60, M10 |
| 2025 `continuationItemRenderer` POST-body paging for playlist and album browse | checked (ytmusicapi 334798f, 2025-02-02) | U57, U59 |
| visitorData bootstrap, sent as the `X-Goog-Visitor-Id` header and as `context.client.visitorData` | checked (ytmusicapi, muse, InnerTune) | M16, new |
| Lyrics (`MPLY`) and related (`MPTR`) browseIds are already in the `next` tabs | checked (Kaset, ytmusicapi) | U61 |
| OLAK→MPREb: the album run from a `VL` browse, with no HTML scrape needed | checked (ytmusic-api) | U57 |
| `music/get_queue` batch track metadata. The 1000 limit is unverified, and parsers must handle both renderer shapes | partly checked | U40 helper, M10 |
| Date-based clientVersion | checked as a technique; **no evidence of current rejection** (Kaset ran a 2023 version in July 2026) | M16 hedge |
| Retry with backoff on 429/5xx | brief | U58 |
| Search without spelling correction (exact match) | brief | U59 |
| Search suggestions (`music/get_search_suggestions`) | brief | not planned |
| Synced lyrics through an `ANDROID_MUSIC` context | brief | not planned |
| High-resolution artwork through `=w…-h…` URL rewriting | brief | not planned |
| EU consent cookie `SOCS=CAI` | brief; low risk for a US host | not planned |
| A fuller browser disguise: Pyxis sends user-agent `Mozilla/5.0` and a 5-field client | Pyxis code, `internal-api.ts:92-120` | M16 hedge |

## Contradictions

- **Stale clientVersion.** One brief rated it the top risk, citing an IOS `/player` issue. Kaset's July 2026 guest audit shows WEB_REMIX search unchanged on a 2023 version. Treat the date-based version as a hedge.
- **The continuation key for PL/OLA queues.** ytmusicapi and muse disagree, so accept both.
- **Artist mix ids.** One brief said they are built from the channelId, and ytmusicapi's example contradicts that.
