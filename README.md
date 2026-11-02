# readme-player

Show what you're listening to on your GitHub profile README, as a spinning vinyl with the album cover in the middle.

<a href="https://manishtamang.com/api/now-playing/open">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://manishtamang.com/api/now-playing/svg?theme=dark" />
    <img src="https://manishtamang.com/api/now-playing/svg?theme=light" alt="What I'm listening to on Spotify" />
  </picture>
</a>

- Spins while a song is playing and stops on the last played song when nothing is
- Matches GitHub's light and dark themes
- Clicking the card opens the current song on Spotify
- Works with a free Spotify account, because plays are read from Last.fm
- Runs on the Cloudflare Workers free plan, built with [Hono](https://hono.dev)

## How it works

A GitHub README can't run JavaScript, but it can show an image. Each deployment serves an SVG that is rendered on request from your latest Last.fm scrobble.

```
Spotify → Last.fm scrobbles → readme-player on Cloudflare → SVG in your README
```

Each deployment shows one Last.fm user, so everyone hosts their own.

## Setup

You need [Node.js](https://nodejs.org) 20 or newer, [pnpm](https://pnpm.io), and free [Last.fm](https://www.last.fm/join) and [Cloudflare](https://dash.cloudflare.com/sign-up) accounts.

For a longer walkthrough of the Last.fm side, including connecting Spotify and getting an API key, read [Show What You're Listening To with Last.fm and Next.js](https://manishtamang.com/blog/now-playing-with-last-fm-and-next-js).

### 1. Connect Spotify to Last.fm

1. Open [Last.fm application settings](https://www.last.fm/settings/applications) and connect your Spotify account.
2. Play a song, then check that it shows up on your Last.fm profile.
3. In [Last.fm privacy settings](https://www.last.fm/settings/privacy), make sure **Hide recent listening** is off. The API can't read your plays otherwise.

### 2. Get a Last.fm API key

Open [Create API account](https://www.last.fm/api/account/create), enter any application name and description, and copy the **API key**. The callback and homepage fields can stay empty.

### 3. Install

```bash
git clone https://github.com/Manish-Tamang/readme-player.git
```

```bash
cd readme-player
```

```bash
pnpm install
```

### 4. Run it locally

Copy the example env file:

```bash
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars`:

```
LASTFM_API_KEY=your_api_key
LASTFM_USERNAME=your_lastfm_username
```

Start the Worker:

```bash
pnpm dev
```

Open [http://localhost:8787/svg](http://localhost:8787/svg) to see your card.

### 5. Deploy to Cloudflare

Log in to Cloudflare:

```bash
pnpm wrangler login
```

Add both values as secrets. Each command asks you to paste the value:

```bash
pnpm wrangler secret put LASTFM_API_KEY
```

```bash
pnpm wrangler secret put LASTFM_USERNAME
```

Deploy:

```bash
pnpm run deploy
```

Wrangler prints your URL, which looks like `https://readme-player.<your-subdomain>.workers.dev`.

### 6. Add it to your README

Open your deployment's URL for a snippet with your URL already filled in, or paste this into your `<username>/<username>` repository's `README.md` and replace `YOUR_URL`:

```html
<a href="https://YOUR_URL/open">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://YOUR_URL/svg?theme=dark" />
    <img src="https://YOUR_URL/svg?theme=light" alt="What I'm listening to on Spotify" />
  </picture>
</a>
```

## Use your own domain

The domain has to be on your Cloudflare account. In [wrangler.jsonc](wrangler.jsonc), uncomment `routes` and set your subdomain:

```jsonc
"routes": [{ "pattern": "player.example.com", "custom_domain": true }]
```

Add a comma after the `observability` line, then deploy again.

## Endpoints

| Route | Returns |
| --- | --- |
| `/` | A README snippet for this deployment |
| `/svg?theme=light` | The card for light backgrounds. This is the default |
| `/svg?theme=dark` | The card for dark backgrounds |
| `/open` | A redirect to the current song on Spotify |
| `/json` | The current song as JSON, with CORS enabled |

Example `/json` response:

```json
{
  "isPlaying": true,
  "title": "Chindai Janchu Ma",
  "artist": "Shailu Rai",
  "album": "Chindai Janchu Ma",
  "albumImageUrl": "https://...",
  "songUrl": "https://open.spotify.com/search/..."
}
```

## Customize

Colors, fonts and the vinyl are in [src/card.ts](src/card.ts). Text colors are in `THEMES`, and everything else is in `renderCard`.

`/open` links to a Spotify search for the song, because the exact track URL needs Spotify's Premium-only Web API.

## Troubleshooting

**The image is broken or `/svg` returns 503.** There's no song to show yet. Run `pnpm wrangler tail`, reload `/svg`, and read the error:

- `Missing LASTFM_API_KEY or LASTFM_USERNAME`: add the secrets from step 5.
- `Last.fm error 10`: the API key is wrong.
- `Last.fm error 6`: the username is wrong. Use your Last.fm username, not your Spotify one.
- `Last.fm error 17`: turn off **Hide recent listening** from step 1.

**The card shows an old song.** Check that your Last.fm profile has the new song first, since scrobbles can lag behind Spotify. GitHub also caches images for a short time, so reload the page after a minute.

**The card has no album cover.** Last.fm and iTunes both have no artwork for that song, so the vinyl shows a plain label.

## Project structure

```
src/
  index.ts    Hono routes
  lastfm.ts   Last.fm and iTunes lookups
  card.ts     SVG rendering
wrangler.jsonc  Cloudflare Workers config
```
