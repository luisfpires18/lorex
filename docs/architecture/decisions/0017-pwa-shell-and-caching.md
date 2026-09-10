# ADR 0017 - Lorex installs as an app shell and caches build output only

Status: accepted (2026-09-10)

## Context

Phase 021 made Lorex usable on a phone. Installing it - a home-screen entry, its own window,
no browser chrome - is the part of that which is not CSS: it needs a web app manifest, icons a
platform will accept, and, before a browser will offer to install anything, a registered
service worker with a fetch handler.

A service worker is also the single most dangerous file in a frontend. It sits in front of every
request the page makes, it outlives the page, and anything it writes to a cache is on the device
until something deletes it. Lorex is server-backed and authenticated: every route past `/login`
is somebody's private worldbuilding, read through a cookie session (ADR 0005) and gated on
ownership in every query (ADR 0006). A worker that "helpfully" cached responses would put a
readable copy of a universe in `CacheStorage`, where it would survive sign-out, survive the
cookie expiring, and be visible to the next person to open the browser.

There is also no offline design. Nothing in the product authors, queues or reconciles a change
made without a network. Caching enough to make the app *appear* to work offline would be a
promise the API cannot keep.

## Decision

**A manifest and icons, hand-written, with no build plugin.** `public/manifest.webmanifest` and
four icon files are static assets Vite copies verbatim. No `vite-plugin-pwa`, no generated
precache manifest, no new dependency: the whole PWA surface is four files a reviewer can read in
a minute, and there is nothing in the build that can silently start caching more.

**One service worker, `public/sw.js`, that caches build output and nothing else.** It handles a
request only when all of these hold: the method is `GET`, the request mode is not `navigate`,
the origin is our own, and the path is either under `/assets/` or a root static file matching a
short extension list. Everything else is not passed to `respondWith` at all, so the browser
handles it exactly as it would with no worker installed.

Stated as the four refusals, because they are the decision:

| Never touched | Why |
| --- | --- |
| `/api/**` and `/health` | Private, per-user, and the API is the authority on all of it |
| Any non-`GET` | A mutation must reach the server or fail visibly, never be absorbed |
| Navigation requests | `index.html` stays fresh, so nobody is stranded on a frontend build that no longer matches the API |
| Cross-origin | Nothing is known about what it holds or who it belongs to |

Cache-first is safe for what remains only because Vite content-hashes it: a changed asset is a
changed URL, so a cached entry can never be the wrong version of anything. That property is
what the policy rests on, not a heuristic about freshness.

**Nothing is precached.** The asset filenames are only known to the build, and a hard-coded
precache list that drifts is worse than a first load that goes to the network. Install does
`skipWaiting()` and nothing more.

**Registration is production-only.** `src/pwa.ts` returns immediately unless
`import.meta.env.PROD`. In development Vite serves unhashed modules and rewrites them on every
edit, so cache-first would serve yesterday's code; the end-to-end suite runs against that dev
server. `sw.js` is still *served* in development, which is what lets `pwa.spec.ts` register it
deliberately and assert what it refuses to keep.

**The update strategy is one constant.** `CACHE_VERSION` in `sw.js`. A new worker calls
`skipWaiting()` on install and `clients.claim()` on activate, and activate deletes every cache
whose name is not the current one. Because navigations are never cached, the next page load
already carries the new asset URLs - so there is no waiting worker to prompt about, no "reload
to update" banner, and no way to be held on stale frontend assets indefinitely.

**Offline is not claimed anywhere.** There is no offline fallback page, no navigation cache and
no background sync. Opening Lorex without a network fails the way it does in a normal tab.

## Consequences

- **Lorex does not work offline, installed or not.** This is the intended behaviour. An
  installed Lorex is the same app in its own window; it is not a local copy of a universe.
- **Nothing authenticated is ever written to device storage by the worker.** `pwa.spec.ts`
  proves it against the real `sw.js` and a real session: it fetches `/api/auth/me`,
  `/api/universes`, one universe, its entities and a `PUT`, then asserts every cache is free of
  `/api` and of navigation documents - and, in the same test, that static assets *were* kept, so
  the assertion cannot pass by the worker having done nothing.
- **Cached asset entries accumulate across deploys within one `CACHE_VERSION`.** Hashed URLs are
  immutable, so old entries are never wrong, only unused. The lever is bumping `CACHE_VERSION`,
  which drops the lot on the next activate. A per-release bump keeps it bounded; forgetting it
  costs a few hundred kilobytes per deploy and nothing else.
- **Installability needs a secure context**, so it works on `localhost` today and will need
  HTTPS in whatever Phase 022 deploys to. Nothing in the app has to change for that.
- **iOS installs are shallower than Android ones** - no install prompt, `display: standalone`
  honoured through `apple-mobile-web-app-capable`, and the home-screen icon taken from
  `apple-touch-icon.png` rather than from the manifest. That is why a PNG apple touch icon
  exists alongside the SVG.
- **The mark on the icons is the wordmark, not the old `favicon.svg`.** The favicon shipped
  before this phase was a violet bolt from a template - a different palette and a different
  shape from the graphite plate and serif `L` the app has drawn in `styles.css` since the first
  phase. An installed app whose icon is unrelated to the app is a defect, so `icon.svg` draws the
  mark the product already uses and the document now points at it. `favicon.svg` and the
  `icons.svg` sprite - a sheet of Bluesky, Discord, GitHub and X glyphs from the same template -
  were both deleted once a search confirmed nothing referenced either: not the document, not the
  manifest, not the worker, which matches root static files by pattern and names no file at all.
