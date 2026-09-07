import { expect, test } from "bun:test"
import {
  parseAlbum,
  parseAlbumSearch,
  parseArtistSearch,
  parseSongSearch,
  parseWatchQueue,
  radioPlaylistId,
} from "./internal-api"

const artistRun = (name: string, browseId = "UC1234567890123456789012") => ({
  text: name,
  navigationEndpoint: {
    browseEndpoint: {
      browseId,
      browseEndpointContextSupportedConfigs: {
        browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" },
      },
    },
  },
})

const albumRun = (title: string, browseId = "MPREb_album") => ({
  text: title,
  navigationEndpoint: {
    browseEndpoint: {
      browseId,
      browseEndpointContextSupportedConfigs: {
        browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" },
      },
    },
  },
})

const titleRun = (text: string, videoId: string, musicVideoType = "MUSIC_VIDEO_TYPE_ATV") => ({
  text,
  navigationEndpoint: {
    watchEndpoint: {
      videoId,
      watchEndpointMusicSupportedConfigs: {
        watchEndpointMusicConfig: { musicVideoType },
      },
    },
  },
})

const thumbnails = {
  musicThumbnailRenderer: {
    thumbnail: {
      thumbnails: [
        { url: "small", width: 120 },
        { url: "large", width: 600 },
      ],
    },
  },
}

const songItem = (
  detailRuns: readonly unknown[],
  title = titleRun("Karma Police", "videoOne"),
) => ({
  musicResponsiveListItemRenderer: {
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [title] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: detailRuns } } },
    ],
    thumbnail: thumbnails,
  },
})

const albumItem = {
  musicResponsiveListItemRenderer: {
    navigationEndpoint: { browseEndpoint: { browseId: "MPRE_album" } },
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Heroes" }] } } },
      {
        musicResponsiveListItemFlexColumnRenderer: {
          text: {
            runs: [
              {
                text: "David Bowie",
                navigationEndpoint: { browseEndpoint: { browseId: "UC1234567890123456789012" } },
              },
              { text: "1977" },
            ],
          },
        },
      },
    ],
    thumbnail: {
      musicThumbnailRenderer: {
        thumbnail: {
          thumbnails: [
            { url: "small", width: 120 },
            { url: "large", width: 600 },
          ],
        },
      },
    },
  },
}

test("generic search walker extracts album identity", () => {
  expect(parseAlbumSearch({ nested: [albumItem] })).toEqual([
    {
      externalId: "MPRE_album",
      title: "Heroes",
      artist: "David Bowie",
      year: 1977,
      artworkUrl: "large",
    },
  ])
})

test("album browse parsing uses header fallback and only the deduplicated track shelf", () => {
  const track = (id: string, title: string, duration: string) => ({
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [] } } },
      ],
      fixedColumns: [
        { musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: duration }] } } },
      ],
    },
  })
  const response = {
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicShelfRenderer: {
              contents: [track("related", "Unrelated promotion", "3:00")],
            },
          },
          {
            musicShelfRenderer: {
              contents: [
                track("one", "Beauty and the Beast", "LIVE"),
                track("one", "Beauty and the Beast", "LIVE"),
                track("two", "Heroes", "6:12"),
              ],
            },
          },
        ],
      },
    },
    header: {
      musicResponsiveHeaderRenderer: {
        title: { runs: [{ text: "Heroes" }] },
        straplineTextOne: {
          runs: [
            {
              text: "David Bowie",
              navigationEndpoint: { browseEndpoint: { browseId: "UC1234567890123456789012" } },
            },
          ],
        },
        subtitle: { runs: [{ text: "1977" }, { text: "2 songs" }] },
      },
    },
  }

  expect(parseAlbum(response, "MPRE_album")).toEqual({
    externalId: "MPRE_album",
    title: "Heroes",
    artist: "David Bowie",
    year: 1977,
    tracks: [
      {
        externalId: "one",
        title: "Beauty and the Beast",
        artist: "David Bowie",
        trackNumber: 1,
      },
      {
        externalId: "two",
        title: "Heroes",
        artist: "David Bowie",
        durationMs: 372000,
        trackNumber: 2,
      },
    ],
  })
})

test("a four-digit album title is not mistaken for the release year", () => {
  const response = {
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicShelfRenderer: {
              contents: [
                {
                  musicResponsiveListItemRenderer: {
                    playlistItemData: { videoId: "one" },
                    flexColumns: [
                      {
                        musicResponsiveListItemFlexColumnRenderer: {
                          text: { runs: [{ text: "Toilet" }] },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    header: {
      musicResponsiveHeaderRenderer: {
        title: { runs: [{ text: "1234" }] },
        straplineTextOne: {
          runs: [
            {
              text: "Clown Core",
              navigationEndpoint: { browseEndpoint: { browseId: "UC1234567890123456789012" } },
            },
          ],
        },
        subtitle: { runs: [{ text: "2021" }, { text: "1 song" }] },
      },
    },
  }

  const album = parseAlbum(response, "MPRE_album")
  expect(album.title).toBe("1234")
  expect(album.year).toBe(2021)
})

test("an implausible four-digit header value is not accepted as a year", () => {
  const response = {
    contents: {
      musicShelfRenderer: {
        contents: [
          {
            musicResponsiveListItemRenderer: {
              playlistItemData: { videoId: "one" },
              flexColumns: [
                {
                  musicResponsiveListItemFlexColumnRenderer: {
                    text: { runs: [{ text: "Track One" }] },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    header: {
      musicResponsiveHeaderRenderer: {
        title: { runs: [{ text: "Catalogue" }] },
        straplineTextOne: {
          runs: [
            {
              text: "Some Artist",
              navigationEndpoint: { browseEndpoint: { browseId: "UC1234567890123456789012" } },
            },
          ],
        },
        subtitle: { runs: [{ text: "0451" }, { text: "1 song" }] },
      },
    },
  }

  expect(parseAlbum(response, "MPRE_album").year).toBeUndefined()
})

test("song search reads catalog identity from the music renderer", () => {
  const response = {
    nested: [
      songItem([
        artistRun("Radiohead"),
        { text: " • " },
        albumRun("OK Computer"),
        { text: " • " },
        { text: "4:24" },
      ]),
    ],
  }

  expect(parseSongSearch(response, 10)).toEqual([
    {
      externalId: "videoOne",
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
      albumExternalId: "MPREb_album",
      durationMs: 264000,
      artworkUrl: "large",
    },
  ])
})

test("song search rejects entries that are not catalog recordings", () => {
  const musicVideo = songItem(
    [artistRun("Radiohead"), { text: " • " }, { text: "12M views" }, { text: "4:24" }],
    titleRun("Karma Police", "videoTwo", "MUSIC_VIDEO_TYPE_OMV"),
  )
  const withoutVideoId = {
    musicResponsiveListItemRenderer: {
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Orphan" }] } } },
      ],
    },
  }

  expect(parseSongSearch({ nested: [musicVideo, withoutVideoId] }, 10)).toEqual([])
})

test("song search falls back to the leading detail run when no artist page is linked", () => {
  const response = {
    nested: [songItem([{ text: "Various Artists" }, { text: " • " }, { text: "4:24" }])],
  }

  expect(parseSongSearch(response, 10)[0]?.artist).toBe("Various Artists")
})

test("song search deduplicates recordings and honours the requested limit", () => {
  const detail = [artistRun("Radiohead"), { text: "4:24" }]
  const response = {
    nested: [
      songItem(detail, titleRun("One", "videoOne")),
      songItem(detail, titleRun("One again", "videoOne")),
      songItem(detail, titleRun("Two", "videoTwo")),
      songItem(detail, titleRun("Three", "videoThree")),
    ],
  }

  expect(parseSongSearch(response, 2).map((song) => song.externalId)).toEqual([
    "videoOne",
    "videoTwo",
  ])
})

test("artist search reads channel identity and artwork", () => {
  const response = {
    nested: [
      {
        musicResponsiveListItemRenderer: {
          navigationEndpoint: { browseEndpoint: { browseId: "UC1234567890123456789012" } },
          flexColumns: [
            {
              musicResponsiveListItemFlexColumnRenderer: {
                text: { runs: [{ text: "Radiohead" }] },
              },
            },
          ],
          thumbnail: thumbnails,
        },
      },
    ],
  }

  expect(parseArtistSearch(response, 10)).toEqual([
    { externalId: "UC1234567890123456789012", name: "Radiohead", artworkUrl: "large" },
  ])
})

test("artist search rejects references that are not artist channels", () => {
  const albumEntry = {
    musicResponsiveListItemRenderer: {
      navigationEndpoint: { browseEndpoint: { browseId: "MPREb_album" } },
      flexColumns: [
        {
          musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "OK Computer" }] } },
        },
      ],
    },
  }
  const shortReference = {
    musicResponsiveListItemRenderer: {
      navigationEndpoint: { browseEndpoint: { browseId: "UCshort" } },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Truncated" }] } } },
      ],
    },
  }

  expect(parseArtistSearch({ nested: [albumEntry, shortReference] }, 10)).toEqual([])
})

test("track durations are omitted unless every component is a valid in-range number", () => {
  const durations = [":", "1:", "", "LIVE", "1:2x", "999999999:00", "4:70", "1:2:3:4"]
  for (const duration of durations) {
    const song = parseSongSearch(
      { nested: [songItem([artistRun("Radiohead"), { text: duration }])] },
      10,
    )[0]
    expect(song?.durationMs).toBeUndefined()
  }

  const valid = parseSongSearch(
    { nested: [songItem([artistRun("Radiohead"), { text: "1:02:03" }])] },
    10,
  )[0]
  expect(valid?.durationMs).toBe(3723000)
})

test("album browse parsing refuses tracks without real header identity", () => {
  expect(() =>
    parseAlbum(
      {
        contents: {
          musicShelfRenderer: {
            contents: [
              {
                musicResponsiveListItemRenderer: {
                  playlistItemData: { videoId: "one" },
                  flexColumns: [
                    {
                      musicResponsiveListItemFlexColumnRenderer: {
                        text: { runs: [{ text: "Track One" }] },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      "MPRE_album",
    ),
  ).toThrow("did not contain album metadata and tracks")
})

const queueItem = (
  videoId: string,
  title: string,
  musicVideoType = "MUSIC_VIDEO_TYPE_ATV",
  extra: Record<string, unknown> = {},
) => ({
  playlistPanelVideoRenderer: {
    title: { runs: [{ text: title }] },
    longBylineText: { runs: [{ text: "David Bowie" }] },
    lengthText: { runs: [{ text: "3:45" }] },
    navigationEndpoint: {
      watchEndpoint: {
        videoId,
        watchEndpointMusicSupportedConfigs: {
          watchEndpointMusicConfig: { musicVideoType },
        },
      },
    },
    ...extra,
  },
})

const watchResponse = (contents: readonly unknown[], continuations?: readonly unknown[]) => ({
  contents: {
    singleColumnMusicWatchNextResultsRenderer: {
      tabbedRenderer: {
        watchNextTabbedResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  musicQueueRenderer: {
                    content: {
                      playlistPanelRenderer: {
                        contents,
                        ...(continuations === undefined ? {} : { continuations }),
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
})

test("a radio playlist id is derived from the seed recording", () => {
  expect(radioPlaylistId("videoOne")).toBe("RDAMVMvideoOne")
})

test("a watch queue reads catalog recordings with duration and artist", () => {
  const queue = parseWatchQueue(
    watchResponse(
      [queueItem("videoOne", "Heroes")],
      [{ nextRadioContinuationData: { continuation: "page-two" } }],
    ),
    10,
  )

  expect(queue.tracks).toEqual([
    expect.objectContaining({
      externalId: "videoOne",
      title: "Heroes",
      artist: "David Bowie",
      durationMs: 225000,
    }),
  ])
  expect(queue.continuation).toBe("page-two")
})

test("an ordinary upload in a radio queue is dropped, keeping D18 honest", () => {
  const queue = parseWatchQueue(
    watchResponse([
      queueItem("videoOne", "Heroes"),
      queueItem("upload", "Live Bootleg", "MUSIC_VIDEO_TYPE_UGC"),
    ]),
    10,
  )

  expect(queue.tracks.map((track) => track.externalId)).toEqual(["videoOne"])
})

test("a repeated recording appears once and the limit is honoured", () => {
  const queue = parseWatchQueue(
    watchResponse([
      queueItem("videoOne", "Heroes"),
      queueItem("videoOne", "Heroes"),
      queueItem("videoTwo", "Fame"),
      queueItem("videoThree", "Fashion"),
    ]),
    2,
  )

  expect(queue.tracks.map((track) => track.externalId)).toEqual(["videoOne", "videoTwo"])
})

test("a queue with no continuation reports none rather than inventing one", () => {
  const queue = parseWatchQueue(watchResponse([queueItem("videoOne", "Heroes")]), 10)

  expect(queue.continuation).toBeUndefined()
})

test("an empty but well-formed panel is an empty queue, not a failure", () => {
  const queue = parseWatchQueue(watchResponse([]), 10)

  expect(queue.tracks).toEqual([])
})

test("an unreadable layout fails loudly instead of looking like an exhausted station", () => {
  expect(() => parseWatchQueue({ contents: { somethingElse: {} } }, 10)).toThrow(
    "no playlist panel",
  )
})

test("a continuation page is read, not mistaken for an unknown layout", () => {
  // A live check found this: the first page nests `playlistPanelRenderer`, but a continuation
  // returns `playlistPanelContinuation` at the top level. Reading only the first shape made
  // every continued batch fail with ytmusic.unknownLayout.
  const queue = parseWatchQueue(
    {
      continuationContents: {
        playlistPanelContinuation: {
          contents: [queueItem("videoTwo", "Everything In Its Right Place")],
          continuations: [{ nextRadioContinuationData: { continuation: "page-three" } }],
        },
      },
    },
    10,
  )

  expect(queue.tracks.map((track) => track.externalId)).toEqual(["videoTwo"])
  expect(queue.continuation).toBe("page-three")
})
