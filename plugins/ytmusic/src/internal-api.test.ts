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

test("generic browse walker extracts ordered playable tracks", () => {
  const track = (id: string, title: string, duration: string) => ({
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: {
              runs: [
                {
                  text: "David Bowie",
                  navigationEndpoint: { browseEndpoint: { browseId: "UC1234567890123456789012" } },
                },
              ],
            },
          },
        },
      ],
      fixedColumns: [
        { musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: duration }] } } },
      ],
    },
  })
  const response = {
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
        subtitle: { runs: [{ text: "1977" }] },
      },
    },
    tracks: [track("one", "Beauty and the Beast", "3:36"), track("two", "Heroes", "6:12")],
  }

  expect(parseAlbum(response, "MPRE_album")).toMatchObject({
    title: "Heroes",
    artist: "David Bowie",
    year: 1977,
    tracks: [
      { externalId: "one", title: "Beauty and the Beast", durationMs: 216000, trackNumber: 1 },
      { externalId: "two", title: "Heroes", durationMs: 372000, trackNumber: 2 },
    ],
  })
})
