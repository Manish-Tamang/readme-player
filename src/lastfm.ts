/*
 * Last.fm "now playing", ported from manishtamang.com (lib/services/lastfm.ts).
 * Spotify's Web API needs Premium, so plays are read from Last.fm scrobbles.
 */
const RECENT_TRACKS_ENDPOINT = "https://ws.audioscrobbler.com/2.0/"
const ITUNES_SEARCH_ENDPOINT = "https://itunes.apple.com/search"
// Last.fm serves this grey star image when a track has no artwork
const PLACEHOLDER_IMAGE_ID = "2a96cbd8b46e442fc41c2b86b821562f"
const ARTWORK_TTL = 24 * 60 * 60 * 1000
// Last.fm asks API clients to send an identifiable User-Agent
const USER_AGENT = "readme-player"

export type Bindings = {
  LASTFM_API_KEY: string
  LASTFM_USERNAME: string
}

export interface NowPlaying {
  isPlaying: boolean
  title?: string
  artist?: string
  album?: string
  albumImageUrl?: string
  songUrl?: string
}

interface LastfmImage {
  size: string
  "#text": string
}

interface LastfmTrack {
  name: string
  artist: { "#text": string }
  album: { "#text": string }
  image: LastfmImage[]
  "@attr"?: { nowplaying?: string }
}

const fetchRecentTrack = async (env: Bindings): Promise<LastfmTrack | undefined> => {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
    throw new Error("Missing LASTFM_API_KEY or LASTFM_USERNAME")
  }

  const params = new URLSearchParams({
    method: "user.getrecenttracks",
    user: env.LASTFM_USERNAME,
    api_key: env.LASTFM_API_KEY,
    format: "json",
    limit: "1",
  })

  const response = await fetch(`${RECENT_TRACKS_ENDPOINT}?${params}`, {
    headers: { "user-agent": USER_AGENT },
    // The README requests a light and a dark card per view, so share one Last.fm call
    cf: { cacheEverything: true, cacheTtl: 30 },
  })
  if (!response.ok) {
    throw new Error(`Last.fm request failed with status ${response.status}`)
  }

  const data = await response.json<{
    error?: number
    message?: string
    recenttracks?: { track?: LastfmTrack[] }
  }>()
  if (data.error) {
    throw new Error(`Last.fm error ${data.error}: ${data.message}`)
  }

  return data.recenttracks?.track?.[0]
}

const largeImage = (images: LastfmImage[]) => {
  const image = images.find((img) => img.size === "extralarge")?.["#text"]
  return image && !image.includes(PLACEHOLDER_IMAGE_ID) ? image : undefined
}

export const getNowPlaying = async (env: Bindings): Promise<NowPlaying> => {
  const track = await fetchRecentTrack(env)
  if (!track) return { isPlaying: false }

  const title = track.name
  const artist = track.artist["#text"]

  return {
    isPlaying: track["@attr"]?.nowplaying === "true",
    title,
    artist,
    album: track.album["#text"] || undefined,
    albumImageUrl: largeImage(track.image) ?? (await getItunesArtwork(title, artist)),
    // Spotify's exact track URL needs their (Premium-only) Web API, so link to a search instead
    songUrl: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
  }
}

// Artwork rarely changes, so remember lookups for a day per Worker isolate
const artworkCache = new Map<string, { url?: string; expires: number }>()

// Last.fm lacks artwork for many smaller releases, so fall back to the iTunes catalog
const getItunesArtwork = async (title: string, artist: string) => {
  const key = `${artist}\u0000${title}`
  const cached = artworkCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.url

  try {
    const params = new URLSearchParams({ term: `${artist} ${title}`, entity: "song", limit: "5" })
    const response = await fetch(`${ITUNES_SEARCH_ENDPOINT}?${params}`, {
      headers: { "user-agent": USER_AGENT },
    })
    if (!response.ok) return undefined

    const { results } = await response.json<{
      results: { artistName: string; artworkUrl100?: string }[]
    }>()
    const wanted = artist.toLowerCase()
    // Only trust a result by the same artist, so we never show an unrelated cover
    const match = results.find((r) => {
      const name = r.artistName.toLowerCase()
      return name.includes(wanted) || wanted.includes(name)
    })

    const url = match?.artworkUrl100?.replace("100x100bb", "600x600bb")
    artworkCache.set(key, { url, expires: Date.now() + ARTWORK_TTL })
    return url
  } catch {
    return undefined
  }
}
