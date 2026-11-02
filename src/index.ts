import { Hono } from "hono"
import { renderCard, toDataUri } from "./card"
import { getNowPlaying, type Bindings, type NowPlaying } from "./lastfm"

const app = new Hono<{ Bindings: Bindings }>()

// Last good song, so a Last.fm hiccup still shows the last thing listened to.
// Lives in the Worker isolate, so a fresh isolate starts without one.
let lastSong: NowPlaying | undefined

// The snippet to paste into a README, filled in with this deployment's URL
app.get("/", (c) => {
  const { origin } = new URL(c.req.url)

  return c.text(`readme-player

Add this to your README:

<a href="${origin}/open">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="${origin}/svg?theme=dark" />
    <img src="${origin}/svg?theme=light" alt="What I'm listening to on Spotify" />
  </picture>
</a>
`)
})

app.get("/svg", async (c) => {
  const theme = c.req.query("theme") === "dark" ? "dark" : "light"

  try {
    const song = await getNowPlaying(c.env)
    if (song.title && song.artist) lastSong = song
  } catch (error) {
    console.error(error)
    // Can't tell if the remembered song is still playing, so stop the spin
    if (lastSong) lastSong = { ...lastSong, isPlaying: false }
  }

  if (!lastSong?.title || !lastSong.artist) {
    // Nothing to show yet; don't let GitHub cache an empty card
    return c.body(null, 503, { "cache-control": "no-store" })
  }

  const svg = renderCard(lastSong, theme, await toDataUri(lastSong.albumImageUrl))

  return c.body(svg, 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    // max-age=0 makes GitHub's image proxy refetch instead of holding an old song
    "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30",
  })
})

// A README link can't change, so it points here and gets sent to whatever is playing
app.get("/open", async (c) => {
  let songUrl = "https://open.spotify.com"
  try {
    songUrl = (await getNowPlaying(c.env)).songUrl ?? songUrl
  } catch (error) {
    console.error(error)
  }

  c.header("cache-control", "no-store")
  return c.redirect(songUrl, 307)
})

app.get("/json", async (c) => {
  c.header("access-control-allow-origin", "*")

  try {
    const song = await getNowPlaying(c.env)
    c.header("cache-control", "public, s-maxage=30, stale-while-revalidate=30")
    return c.json(song)
  } catch (error) {
    console.error(error)
    return c.json({ isPlaying: false })
  }
})

export default app
