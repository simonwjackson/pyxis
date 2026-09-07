import { expect, test } from "bun:test"
import { parseAlbum, parseAlbumSearch, parseArtistSearch, parseSongSearch } from "./internal-api"

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
