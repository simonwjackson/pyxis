`album.json` is an excerpt of ytmusicapi's recorded `tests/data/2026_05_get_album.json`
(7122aed7ed6331b5597d1b8d337d90a311dceec1, MIT, see LICENSE). Tracking, unrelated shelves
and all but the first track were removed. The header keeps one button: the "Start mix"
menu item (icon `MIX`) that issues the album radio endpoint.

`search-playlists.json` is the `searchPlaylists` API response excerpt from
zS1L3NT/ts-npm-ytmusic-api `src/tests/fixtures/youtube-music.json` (ea59bc1).
`artist-mixes.json` contains only the header mix endpoints from ytmusicapi's
`tests/data/2026_05_get_artist1.json` (same revision as `album.json`).
`singles.json` reduces the same artist recording to its title and two singles.
`queue-track.json` takes one panel row from the `next` response in ea59bc1.
`lyrics.json` takes the MPLY tab and a single description line from the same recording.
`song-pages.json` takes the song columns and continuations from `searchSongs` and `searchSongsPage` in ea59bc1.
`artist-grid.json` uses a Radiohead row from `browse_artist_albums.json` and the second
response shape and Radiohead row from `get_library_albums_continuation_mock.json` in
nick42d/youtui (`ytmapi-rs/test_json`, c489567, MIT). The selector and short token join
these excerpts in the test; this is not a live artist session. `playlist-rows.json`
keeps only columns and identity from three entries in `2024_03_get_playlist.json`.
