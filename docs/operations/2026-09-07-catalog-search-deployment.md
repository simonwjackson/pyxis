# Catalog search deployment, 2026-09-07

Three-kind source search is deployed and answering on the tailnet. Song search now reads the
YouTube Music catalog instead of general YouTube, and one request returns albums, artists and
songs. No speaker command was issued and no queue was altered.

## What was deployed

| Item | Value |
|---|---|
| Revision | `a63036e` on `main` |
| Profile entry | `git+file:///home/simonwjackson/code/github/simonwjackson/pyxis?ref=refs/heads/main&rev=a63036e9b12d8cc6f0d70253818d09db052ec7f5#pyxis`, priority 11 |
| Store path | `/nix/store/h3lqhy1f11xn5y12a3kxjpc29b0vmi6q-pyxis-2.0.0` |
| Previous store path | `/nix/store/6jfrc5wlad9m7gjw5y1xgq1snn0az69p-pyxis-2.0.0` (`dcf702e`) |
| ytmusic plugin | `/nix/store/9z268gliscbw3a1giysb73a9396mhr02-pyxis-plugin-ytmusic-1.0.0` |
| Served client bundle | `/assets/index-Ca-i7Mb_.js` |

The revision was built from the pinned git URL before the profile was touched, so the deployed
bytes are reproducible from git alone rather than from a working tree. The deploy refuses to
claim success when the profile store path does not change.

This deployment also carries `9c0efb7` and `d62f174`, the queued-session-intent correction that
landed on `main` from separate work. It was not tested again here.

## Pre-deployment state

Read-only. Kitchen and Living Room were both reachable and stopped with empty queues. Three
sessions reported `playing`, all unreachable: they are abandoned browser tabs from earlier
test rounds, not live playback. The library held 370 albums.

## Verification after deployment

`tools/verify-api-example` passed against the running service, which is the gate that fails
when the published API document stops matching the server:

```text
albums: 5, artists: 3
{ "track": "David Bowie — \"Heroes\"", "transport": "playing",
  "contentType": "audio/webm", "bytes": 65536 }
```

Before this change the same worked example returned
`David Bowie - "Heroes" (Official Video) [HD]`, a general YouTube upload with the channel name
standing in for the artist.

A read-only query for "Radiohead" through the HTTPS origin returned all three kinds:

```text
artists: Radiohead, Thom Yorke, Noordpool Orchestra, Ed O'Brien
albums:  OK Computer, In Rainbows, Kid A, The Bends — all Radiohead
songs:   Creep [Creep], Let Down [OK Computer OKNOTOK 1997 2017],
         All I Need [In Rainbows], Everything In Its Right Place [Kid A]
```

The failure list held exactly one entry, `pandora: plugin.search`, because Pandora has no
credentials for this account. That failure predates this change. Pandora implements neither
album nor artist search, and it produced no additional failures, which is the unsupported-kind
rule working as intended.

The served client bundle contains the `Artists (`, `Albums (` and `Songs (` sections. Local and
tailnet health return 200. `pyxis.service`, `pyxis-tsnet.service` and
`pyxis-ytdlp-update.timer` are active.

## Limits of this evidence

- No audio was played through a speaker, and no Sonos command was sent. Streaming is proven
  only by the worked example's 65,536-byte range read over loopback.
- Search quality was checked with two queries. It is not a survey of the catalog.
- The reference client lists artists and albums but cannot act on them yet. Queueing a song
  works as before.
- The checks created two device grants, `pre-deploy check` and `deployed search check`, and the
  worked example created a session named `worked example`. These are durable records, in line
  with earlier verification rounds.
- `tools/verify-api-example-local` was added for the case this deployment exposed: the
  published example can only be checked against the installed build, so a contract change
  cannot be verified before it ships. It runs the same example against a core built from the
  working tree.
