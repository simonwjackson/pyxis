// Throwaway prototype data layer.
//
// REAL: albums.json — 370 albums, 3,865 tracks from the live v2 library.
// REAL: art/*.jpg — covers harvested through the public source.album.search RPC.
// FAKE: placements, play counts, dates. The real library is 370/370 Discovery with no
//       listening history, so triage, Hot, and neglect would all render empty.
//
// Synthetic values derive from a hash of the album id, so they are stable across reloads
// and identical in all three prototypes.

const DAY = 86400000

export async function loadLibrary(state = "live") {
  // A library with no albums and a library with no sources look identical to this loader;
  // the surfaces tell them apart, because the recovery differs.
  if (state === "empty" || state === "nosources") return []
  if (state === "loading") await new Promise(() => {})

  const [albums, covers] = await Promise.all([
    fetch("./data/albums.json").then((response) => response.json()),
    fetch("./data/art.json")
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({})),
  ])
  const seeded = albums.map((album) => seed(album, covers[album.id]))
  assignPlacements(seeded)
  return seeded
}

function hash(value) {
  let h = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seedValue) {
  let state = seedValue || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

function seed(album, coverFile) {
  const h = hash(album.id)
  const random = rng(h)
  const playCount = Math.floor(random() * 40)
  const recentPlays = random() < 0.1 ? 5 + Math.floor(random() * 16) : 0
  const daysSincePlay = recentPlays > 0 ? Math.floor(random() * 6) : 30 + Math.floor(random() * 900)

  return {
    ...album,
    cover: coverFile ? `./art/${coverFile}` : null,
    playCount,
    recentPlays,
    lastPlayedAt: playCount === 0 ? null : Date.now() - daysSincePlay * DAY,
    daysSincePlay: playCount === 0 ? null : daysSincePlay,
    hot: recentPlays >= 8,
    // Whether the bytes are actually on this device yet. Policy decides what *should* be
    // here; downloads decide what *is*.
    downloaded: random() < 0.72,
    override: null,
    completeness: Math.min(1, random() * 1.3),
    hook: album.tracks[Math.floor(random() * album.tracks.length)] ?? null,
    capturedFrom: ["Pandora station", "YouTube Music radio", "Search"][h % 3],
    capturedDaysAgo: 1 + Math.floor(random() * 40),
    sortKey: h,
  }
}

function assignPlacements(albums) {
  const order = [...albums].sort((a, b) => a.sortKey - b.sortKey)
  order.forEach((album, index) => {
    if (index < 14) album.placement = "discovery"
    else if (index < 258) album.placement = "collection"
    else if (index < 334) album.placement = "archive"
    else album.placement = "dismissed"
  })
}

/// Covers are the only color in these designs. When one is missing, fall back to a plain
/// white-label sleeve rather than a decorative gradient.
export function sleeve(album, className = "") {
  if (album.cover) {
    return `<img class="sleeve ${className}" src="${album.cover}" alt="" loading="lazy" decoding="async" />`
  }
  return `
    <span class="sleeve blank ${className}" aria-hidden="true">
      <em>${escape(album.artist)}</em>
      <b>${escape(album.title)}</b>
    </span>
  `
}

/// Offline availability is a hybrid: placement sets the policy, and a per-album override
/// can force an album onto the device or keep it off. Neither is a promise on its own —
/// an album is only playable offline once the bytes have actually landed.
const KEPT_BY_POLICY = new Set(["collection", "discovery"])

export function wantedOffline(album) {
  if (album.override === "pin") return true
  if (album.override === "exclude") return false
  return KEPT_BY_POLICY.has(album.placement)
}

export function availability(album) {
  if (!wantedOffline(album)) return "unavailable"
  return album.downloaded ? "available" : "downloading"
}

export function policyLabel(album) {
  if (album.override === "pin") return "Kept on device"
  if (album.override === "exclude") return "Never on device"
  return KEPT_BY_POLICY.has(album.placement)
    ? `Kept because it is in ${album.placement}`
    : `Not kept because it is in ${album.placement}`
}

export function escape(value) {
  return String(value).replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
  )
}

export function duration(ms) {
  if (ms === null || ms === undefined) return "—"
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

export function runtime(album) {
  const known = album.tracks.filter((track) => track.durationMs)
  if (known.length === 0) return `${album.tracks.length} tracks`
  const total = known.reduce((sum, track) => sum + track.durationMs, 0)
  return `${album.tracks.length} tracks · ${Math.round(total / 60000)} min`
}

export function ago(timestamp) {
  if (!timestamp) return "never played"
  const days = Math.floor((Date.now() - timestamp) / DAY)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  const years = (days / 365).toFixed(1).replace(/\.0$/, "")
  return `${years} years ago`
}

/// A listening journal derived from the same hash-stable seed, so History agrees with the
/// play counts and dates the rest of the prototype shows.
export function listeningHistory(library, days = 90) {
  const events = []
  for (const album of library) {
    if (!album.lastPlayedAt) continue
    const sessions = Math.min(album.playCount, 6)
    for (let index = 0; index < sessions; index += 1) {
      // Spread each play across a plausible hour of the day, otherwise every event in the
      // journal lands at the same clock time.
      const hour = 8 + ((album.sortKey + index * 7) % 14)
      const minute = (album.sortKey >> (index + 3)) % 60
      const day = new Date(album.lastPlayedAt - index * (album.daysSincePlay > 60 ? 9 : 3) * DAY)
      day.setHours(hour, minute, 0, 0)
      const at = day.getTime()
      if (Date.now() - at > days * DAY || at > Date.now()) continue
      const track = album.tracks[index % Math.max(1, album.tracks.length)]
      events.push({
        at,
        album,
        track,
        room: ["Kitchen", "Desk", "This phone", "Living room"][(album.sortKey + index) % 4],
        context: index % 3 === 0 ? "album" : "station",
      })
    }
  }
  return events.sort((a, b) => b.at - a.at)
}

export function dayLabel(timestamp) {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(Date.now() - DAY)
  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
}

export function clockTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function element(html) {
  const template = document.createElement("template")
  template.innerHTML = html.trim()
  return template.content.firstElementChild
}

export function reveal(nodes) {
  if (!("IntersectionObserver" in window)) return
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add("in")
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  )
  for (const node of nodes) observer.observe(node)
}
