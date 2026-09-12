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
  exists at all.
- **The mark on the icons is the wordmark, not the old `favicon.svg`.** The favicon shipped
  before this phase was a violet bolt from a template - a different palette and a different
  shape from the graphite plate and serif `L` the app has drawn in `styles.css` since the first
  phase. An installed app whose icon is unrelated to the app is a defect, so `icon.svg` draws the
  mark the product already uses and the document now points at it. `favicon.svg` and the
  `icons.svg` sprite - a sheet of Bluesky, Discord, GitHub and X glyphs from the same template -
  were both deleted once a search confirmed nothing referenced either: not the document, not the
  manifest, not the worker, which matches root static files by pattern and names no file at all.

## Amendment: the icon is the owner's artwork (2026-09-12)

Status: accepted

The decision above shipped a drawn stand-in: `icon.svg`, a graphite plate with a struck `X`,
chosen because it was the mark the product already drew and an installed app whose icon is
unrelated to it is a defect. The owner has since supplied the real thing - three interlocking
red rings around a four-point star - so the stand-in is gone and the supplied artwork is the
canonical mark. Nothing about the caching policy changes.

**One source, in one place.** `assets/brand/lorex-icon.png`, the owner's file unaltered: 1299 x
1211, 8-bit RGBA, with genuine transparency - every edge pixel is `(0,0,0,0)`, and the
checkerboard a viewer draws behind it is the viewer's. `scripts/render-icons.py` derives every
shipped asset from it and nothing else does. `public/icon.svg` is deleted: the artwork is a
shaded raster, and tracing it into vectors would be redrawing it, which is not this task's to do.
That also ends the SVG favicon - the document now declares PNG favicons at 48, 32 and 16.

**The generator resamples rather than draws.** It no longer reads geometry out of an SVG; it
trims the master to its own alpha bounds, fits it into each canvas at that use's padding,
area-averages it down and writes a PNG. Alpha is premultiplied before averaging, so the
transparent margin cannot bleed a dark fringe into the mark's edges. Still standard library
only: an area average is the right filter for a reduction of four to eighty times, and it is
thirty lines.

**Every platform-facing asset carries the paper ground, and that is measured rather than
tasteful.** 62% of the artwork's opaque pixels sit below luminance 40 - it is mostly very dark
red - so on a black launcher, a dark tab strip or iOS's own plate most of the symbol disappears.
So the icons are composited onto `--paper`, `#f6f2ea`, which is already the manifest's
`background_color`: invisible on a light surface, a legible plate on a dark one. Only the in-app
`brand-mark.png` keeps its transparency, because there the surface underneath is Lorex's own.

**Paddings are what each platform needs.** The maskable icon keeps the mark inside the middle
62% of the canvas, so Android cropping to a circle of 80% cannot clip it; Apple gets 12%,
because iOS redraws the corners itself; the favicons are cropped to 2-4%, because at 16px a
pixel of margin is a pixel not spent on the rings. The manifest still declares one maskable
icon and two `any` icons, and the maskable claim is now backed by real safe-zone padding.

**`CACHE_VERSION` is bumped to `v2`.** The icon filenames did not change but their bytes did,
and root static files are cached by path, so without a bump an installed or merely long-lived
browser would keep serving the old struck `X` out of `lorex-static-v1`. The policy is untouched;
only the version moved.

**Where the symbol appears in the product, and where it deliberately does not.** Large on the
auth plate above the `Lore X` wordmark, and small beside that wordmark in the two paper bars.
It is decorative in both - `alt=""` - because the wordmark beside it is the accessible name, and
a screen reader should not say "Lorex Lorex". The workspace rail keeps its drawn `L`: the symbol
was tried there and at the ~30px a 3.5rem rail allows it reads as a red tangle, and it puts the
only saturated colour in the chrome directly above the universe accent seal, which is the one
thing in the rail that carries meaning.
