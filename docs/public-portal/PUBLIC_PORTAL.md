# Public portal

The durable decision is ADR 0036. This document is the portal's working reference: what it is for, what it may
show, and the order it is being built in.

## 1. Goals

Let visitors discover universes their authors chose to share, without ever exposing an author's private work. The
foundation (008) makes publishing explicit, complete and reversible, and gives the portal one anonymous, read-only,
allow-listed API to build on.

## 2. Workspace and portal

| | Workspace | Public portal |
| --- | --- | --- |
| Who | The signed-in owner | Anyone, signed in or not |
| Routes | `/app/...` behind `RequireAuth` | `/explore`, `/worlds/{slug}`, outside every guard |
| Layout | Rail, universe sidebar, universe search | `PublicLayout`: its own bar, none of the workspace chrome |
| API | Owner-scoped `/api/...` | `/api/public/universes...`, anonymous, read-only |
| Identity | Warm editorial workbench (Design refactor 001-007) | Dark, image-led discovery (Task 009) |

One React application, two layouts: the session, router and build are shared, so a signed-in visitor sees "My
workspace" in the portal bar and a signed-out one sees "Sign in" and "Create account".

## 3. Privacy model

Private by default; publication explicit; allow-list only. No route infers publication, no save or restore sets it,
and no public response is an internal object with fields removed. A private universe overrides everything inside it.

## 4. Universe visibility

`Private` (every universe, including every one that existed before 008) or `Public`. Changed only by
`POST /api/universes/{id}/publish` (refused until complete; mints the address the first time; sets `publishedAt`
once) and `POST /api/universes/{id}/unpublish` (immediate; keeps details, address and first publication date).
Both idempotent, owner-only. While public, nothing publishing needs can be removed - make it private first; artwork
can be replaced.

## 5. What a public universe exposes

Exactly `PublicUniverse`: `slug`, `name`, `publicSummary`, `category`, `genres`, `authorDisplayName`,
`cardImageUrl`, `publishedAt` (first publication). None is ever null.

## 6. What stays private

Everything else: the description, colour, archive state, ids, owner, username, email, audit dates, storage keys, the
original artwork, and all content - lore entries and articles, relationships, family trees, stories, scenes,
manuscripts, plot, timeline, ideas, world rules, Canon, the Trash, history and drafts. Task 010 adds explicit
per-item publication; nothing inside a universe is public before then.

## 7. Category taxonomy

One per universe: Original, Movies & TV, Games, Books, Comics, Tabletop & RPG, Audio, Other. Stored as integers
1-8 (`UniverseCategory`), null for none. Answers "what kind of property is this".

## 8. Genre taxonomy

Up to three per universe: Fantasy, Science fiction, Adventure, Horror, Mystery, Historical, Romance, Thriller,
Supernatural, Post-apocalyptic, Contemporary, Other. One bit each (`UniverseGenres`, `[Flags]`), always listed in
that order. Answers "what kind of fiction is this". No free text, no aliases. New members append a bit.

## 9. Public author identity

The account's `PublicDisplayName`, chosen on the Profile. Never filled from the username or email; up to 60
characters; no control characters or bidi overrides. Read live by the public API, so renaming it renames the author
of every published world. Required to publish; cannot be cleared while any universe is public.

## 10. Universe artwork

One per universe (`UniverseArtworks`): the untouched original and one 16:10 card, at most 960 px wide, never
enlarged, cut on the server from the frame the author chose in the shared cropper, metadata stripped. 16:10 because
the portal card is about as tall as wide with the picture as its top five eighths. Only the card is ever public. A
hero cut for Task 011 is a new frame of the same original. The static Explore background is not universe artwork:
`src/Lorex.Web/src/portal/explore-worlds-background.png`, owner-approved, 1916 x 821, 2,370,934 bytes, SHA-256
`31e6995251e1145f792664fac61de586fd730f63b3f30dc7d4b8850fce5abe49`. Never edited, recompressed or converted; CSS crops
it. Vite emits it unchanged under a content-hashed name, which the service worker may cache for good.

## 11. Slug model

Minted at first publication from the name: ASCII `a-z0-9-`, accents folded, other scripts are word breaks, `world`
when nothing remains, at most 60 characters, then `-2`, `-3` on collision. Unique index. Never changes after -
renames and unpublishing keep it. No manual editing yet.

## 12. Public API boundary

| Route | Answers |
| --- | --- |
| `GET /api/public/universes?page=&pageSize=&category=&genre=&q=&sort=` | Public universes, 24 per page (max 48), filtered and ordered as below. |
| `GET /api/public/universes/{slug}` | One public universe, or 404 (private and missing alike). |
| `GET /api/public/universes/{slug}/artwork/card/{cardId}` | Its current card (WebP), ETag = card id, 304 when current, 404 otherwise. |

All `Cache-Control: no-cache`, no session needed, no cookie set.

The list query (009). Every parameter narrows the one public predicate before counting, ordering and projecting, so a
private or incomplete universe is never matched, counted or ordered, and the response is still the eight-member
allow-list.

| Parameter | Meaning |
| --- | --- |
| `category` | One category key: `original`, `movies-and-tv`, `games`, `books`, `comics`, `tabletop-and-rpg`, `audio`, `other`. Absent is all. |
| `genre` | One genre key: `fantasy`, `science-fiction`, `adventure`, `horror`, `mystery`, `historical`, `romance`, `thriller`, `supernatural`, `post-apocalyptic`, `contemporary`, `other`. Matches a universe listing it among its genres. |
| `q` | Trimmed; a parameterized `LIKE` substring of the name, the public summary or the author's public name - never the description, username, email, ids or content. Case-insensitive for ASCII only (SQLite `LIKE`); wildcards are literal. At most 100 characters. Blank is no search. |
| `sort` | `recent` (default): first publication, most recent first; republishing does not move a universe. `az`: name, `NOCASE`. The slug breaks every tie, so pages never repeat or skip. |
| `page`, `pageSize` | Clamped to 1+ and 1-48, as every Lorex list is. |

Keys are derived from the enum names (`MoviesAndTv` -> `movies-and-tv`), exact and lower case - one spelling per
value. An unknown category, genre or sort, or a longer search, is a 400 validation problem naming each bad parameter;
nothing is reinterpreted. The web client's `publishing/types.ts` carries the same keys, and a test pins both.

## 13. Explore (009)

`/explore` answers one question - what worlds can I explore? - with one card per public universe.

- **Hero.** The approved panorama under the bar, cropped by `object-fit` (leaning left, where the castle is), with
  three washes for legibility: under the bar, into the page along the bottom, and on the reading side. "Explore
  worlds", one line of support, and the search field. Loaded eagerly (`fetchpriority="high"`); it is above the fold.
- **Categories.** Pills: All plus the eight, each a link to Explore filtered to it, the chosen one `aria-current`
  and filled. Below 52rem they scroll sideways in their own strip, edge to edge, rather than stacking.
- **Genre and sort.** Native selects, labelled: one genre or all; Recently published or A-Z. No popularity, trending
  or rating sort exists, because no such data does.
- **Search.** Sent 300 ms after typing stops, at once on Enter or when emptied. Earlier requests are aborted and a
  stale answer is never shown. Starting or clearing a search adds a history entry; refining one replaces it.
- **Address.** `q`, `category`, `genre`, `sort=az`, each omitted at its default - `/explore?category=games&genre=fantasy`.
  Back, Forward and refresh restore it; an unknown value in a hand-edited address is ignored, not an error.
- **Paging.** "Show more worlds" appends the next page, keeps the filters and drops any world already shown (a
  publish in between shifts pages by one). No infinite scroll: a button is reachable, finite and says what it does.
  The loaded pages are not in the address; a refresh starts from the first page with the same filters.
- **Card.** Artwork (the 16:10 card, lazy-loaded), name (serif, two lines, `dir="auto"`), category and genres, and
  `by` the public name - each authored string in `<bdi>`. The whole card is one link to `/worlds/{slug}`; nothing
  inside it is interactive. The summary, counts and dates are not on the card. A picture that fails keeps the
  card's shape with the Lorex mark, never someone else's art.
- **States.** Card-shaped skeletons while loading; "No worlds have been published yet." for an empty platform; "No
  published worlds match." with Clear search and filters; an error with Try again, never mistaken for empty.
- **Visual boundary.** The portal is dark in either scheme. `.portal` redefines the shared tokens inside it (so shared
  buttons, notices and menus draw dark) plus a few `--portal-*` values; the workspace's tokens are untouched. Motion
  is a colour change and a 2.5% image lift on hover, only without reduced motion.
- `/worlds/{slug}` keeps its 008 content inside the dark frame; the real public universe page is 011's.

## 14. Public and private navigation

Settings' Public portal section (status in words, public details, artwork, author, checklist, publish and make
private with inline confirmations, "View public page"). The portal bar: the brand and Explore (on a phone the brand
alone leads to Explore), then "Sign in" and "Create account", or "My workspace ↗" and the account menu. The
universes header's "Explore worlds ↗" goes the other way. Visibility belongs to universes; the two sides are the
portal and the workspace, never "public mode" and "private mode". Later: "Edit this world" for an owner viewing their
own world (011).

## 15. Preview

Planned for Task 011: an authenticated owner-scoped route that renders the same allow-listed shape from saved
details, with owner-scoped image addresses, so "what would anyone see" never needs anonymous access.

## 16. Roadmap

| Task | Scope |
| --- | --- |
| 008 | Publication foundation: visibility, public metadata, artwork, slug, anonymous API, settings, privacy tests. |
| 009 | Explore Worlds portal from the owner's visual references and the approved background. |
| 010 | Explicit publishing of individual lore entries and stories. |
| 011 | The public universe page and browsing published content; owner preview and "Edit this world". |
| 012 | Portal polish, accessibility, SEO and Open Graph, caching and performance, security audit, remaining 007 polish. |

## 17. Non-goals

No likes, ratings, comments, follows, view counts, popularity, trending, recommendations, feeds, bookmarks or public
editing. No fake data, metrics or placeholder artwork. No creator profile pages yet.
