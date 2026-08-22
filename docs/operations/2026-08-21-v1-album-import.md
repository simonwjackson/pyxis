# v1 album reacquisition report

Created: 2026-08-21

## Result

| Check | Result |
|---|---:|
| Live v1 artist/title manifest | 386 |
| Resolved through public v2 RPC | 370 |
| Manual resolutions after candidate review | 4 |
| Albums refreshed through the corrected track parser | 370 |
| Unresolved after manual review | 16 |
| Failed requests after retry | 0 |
| Albums in the v2 library | 370 |
| Duplicate normalized artist/title pairs | 0 |

All 370 reacquired albums are in Discovery. Placement counts: `discovery=370`.

The importer read only the legacy artist and album title. It called `source.album.search`, `matching.evaluate`, `source.album.get`, and `library.album.add`. No v1 ids, source references, track rows, placements, or listen events crossed into v2. The source plugin supplied fresh source ids and track metadata.

## Manual resolutions

The scorer rejected these releases because the legacy album artist named one contributor, used `Unknown`, or did not match the source album artist. Each source release was inspected through `source.album.get` before import.

| Requested | Reacquired release | Reason | Evidence |
|---|---|---|---|
| Iron & Wine — American Football (Covers) | American Football — American Football (Covers) | Exact release title. The compilation credits Iron & Wine on track 1 and uses American Football as the album artist. | [source](https://americanfootball.bandcamp.com/album/american-football-covers) |
| Planes Mistaken For Stars — The Appleseed Cast / Planes Mistaken For Stars / Race Car Riot | The Appleseed Cast / Planes Mistaken For Stars / Race Car Riot — The Appleseed Cast / Planes Mistaken For Stars / Race Car Riot | Exact six-track split release. The source uses all three bands as the album artist. | [source](http://deepelmdigital.com/album/the-appleseed-cast-race-car-riot-planes-mistaken-for-stars) |
| Unknown — You Come Before You (U.S. Version) | Poison The Well — You Come Before You (U.S. Version) | Exact release title and year. The legacy artist was Unknown. The release artist is Poison The Well. | [source](https://en.wikipedia.org/wiki/You_Come_Before_You) |
| Whirr — Whirr & Nothing | Nothing — Whirr & Nothing | Exact four-track split release. The source uses Nothing as the album artist. | [source](https://en.wikipedia.org/wiki/Whirr_/_Nothing) |

## Accepted automatic variation

| Requested | Reacquired release | Review |
|---|---|---|
| Minus the Bear — Bands Like It When You Yell 'YAR' At Them | Minus the Bear — Bands Like It When You Yell “YAR!” At Them | Accepted. Artist is exact. The title differs only in quote style and the retained exclamation mark. |

## Unresolved after manual review

These entries remain absent from the v2 library. Pyxis did not substitute a different release.

| Artist | Legacy title | Best source candidate | Score | Decision | Manual review |
|---|---|---|---:|---|---|
| Coaltar Of The Deepers | "hello there" | Boris — "hello there" | 669 | reject | Rejected. The only exact-title result is a 2024 Boris album. Coaltar Of The Deepers results have different titles. |
| Farewell My Enemy | Casting For Funerals | Ever We Fall — Casting For Funerals | 731 | reject | Rejected. The exact-title result is by Ever We Fall. Alternate searches found no Farewell My Enemy release. |
| Guttermouth | Hopelessly Devoted To You | none | 0 | none | Unresolved. YouTube Music album search returned other Guttermouth releases but not this album. |
| KilikaBeats | Final Fantasy 7 LoFi Mix - [1Hour] | KilikaBeats — Final Fantasy 7 LoFi - City of Mako | 828 | review | Unresolved. The candidate is the different 16-track album Final Fantasy 7 LoFi - City of Mako, not the one-hour mix. |
| Marble Pawns | Ｚｅｌｄａｗａｖｅ ＩＩ | none | 0 | none | Unresolved. Full-width and ASCII alternate searches returned no matching album. |
| Remix Tavern | Chrono Trigger Music but it's Cyberpunk | none | 0 | none | Unresolved. No album candidate. This appears to be a video mix. |
| Remix Tavern | Final Fantasy 7 Music but it's Cyberpunk | none | 0 | none | Unresolved. No album candidate. This appears to be a video mix. |
| Remix Tavern | Super Mario Music but it's Cyberpunk | none | 0 | none | Unresolved. No album candidate. This appears to be a video mix. |
| Remix Tavern | Zelda Music but it's Cyberpunk (1 Hour) | none | 0 | none | Unresolved. No album candidate. This appears to be a one-hour video mix. |
| SaudadeArcade | ☕ Sonic the Hedgehog – Bossa Nova Jazz Soundtrack (Green Hill Bossa☕ | none | 0 | none | Unresolved. No album candidate. This appears to be a video soundtrack mix. |
| SaudadeArcade | ☕ Super Mario 64 – Bossa Nova Jazz Soundtrack (Super Bossa 64)☕ | none | 0 | none | Unresolved. No album candidate. This appears to be a video soundtrack mix. |
| SaudadeArcade | ☕Chrono Trigger – Bossa Nova Jazz Soundtrack(Sunset in Guardia)☕ | none | 0 | none | Unresolved. No album candidate. This appears to be a video soundtrack mix. |
| SaudadeArcade | ☕Super Mario World – Bossa Nova Jazz Soundtrack☕ | none | 0 | none | Unresolved. No album candidate. This appears to be a video soundtrack mix. |
| SaudadeArcade | ☕The Legend of Zelda: Ocarina of Time – Bossa Nova Jazz Remix Soundtrack☕ | none | 0 | none | Unresolved. No album candidate. This appears to be a video soundtrack mix. |
| Unknown | Super Mario Galaxy & Chill (Lofi) | none | 0 | none | Unresolved. Alternate title searches returned different Mario piano and lofi albums. |
| Wubba Lubba Lo Fi | Legend of Zelda - Vaporwave/Synthwave Ultimate Mix ( Z E L D A W A V E ) | none | 0 | none | Unresolved. No album candidate. This appears to be a video mix. |

## Integrity checks

- Manifest SHA-256: `00d7fd4d58e62b445111213955548523c1a9fcafc4e18a42e04215a48826403c`.
- Accounted manifest keys: 386 of 386.
- Resolved records missing from the live library: 0.
- Unexpected checkpoint keys: 0.
- Missing checkpoint keys: 0.
- Suspicious automatic accepted matches: 0.
- Tracks still using the `Unknown` artist placeholder: 0.
- Duplicate track ids within an album: 0.
- Current ProseQL YAML decodes: true.
- A complete importer rerun left the library count unchanged.
- Pyxis restarted from the completed store and returned the same audit counts.
- `tools/import-legacy/` does not exist in the final tree.

## Persistence defect found during import

The track title `Note to Self:` exposed a ProseQL YAML encoder defect. ProseQL wrote the title as an unquoted plain scalar, so Pyxis could not reopen the generated v2 store. Pyxis now applies a narrow dependency patch that quotes scalar values ending in `:`. A library integration test closes and reopens a store containing the exact title.

The repair changed one generated v2 YAML line. The legacy manifest remained read-only. Its source file still has the SHA-256 value recorded above.

## Provider metadata defect found during review

The first live pass exposed another defect during code review. The YouTube Music parser walked track rows before it knew the album artist, and it accepted playable rows outside the selected album shelf. That pass left 3,740 tracks in 360 albums with the `Unknown` artist placeholder.

The parser now reads header metadata first, selects the shelf that matches the header track count, deduplicates video ids, rejects missing album identity, and omits invalid duration labels. Pyxis then reacquired all 370 resolved albums again through public v2 RPC. The final audit reports zero `Unknown` track artists and zero duplicate track ids within an album.

Shared track identity now keeps title, artist, and duration on the shared track while each album relationship owns its track number. Sixteen albums that share track ids received one final targeted reacquisition after that schema change.

## Remaining cost

The 16 unresolved entries are mostly video mixes, niche releases absent from YouTube Music album search, or exact-title collisions with another artist. This migration does not recover those items. A future source plugin can reacquire them without importing v1 ids or wire data.
