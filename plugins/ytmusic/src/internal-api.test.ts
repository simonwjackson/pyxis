import { expect, test } from "bun:test"
import { parseAlbum, parseAlbumSearch } from "./internal-api"

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
