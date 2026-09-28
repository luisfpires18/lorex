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

`/explore` answers one question - what worlds can I explore? - with one card per public universe. The layout follows
the owner's portal reference: a solid bar with the search in it, a compact panoramic band holding the title and the
category row, then a wide grid of dark card panels. Its metrics, ratings, avatars and extra nav items are not copied:
no such data or destinations exist.

- **Bar.** Brand, Explore (marked by a rule along the bar's foot), the search, then Log in and Create account - or
  My workspace and the account menu. Below 52rem the search takes its own row; below 40rem the brand alone leads to
  Explore.
- **Band.** The approved panorama behind "Explore Worlds", one line of support, the category pills and the genre and
  sort selects. On a wide screen the picture is drawn 1.3x from its left edge (a CSS transform; the file is
  untouched), which carries the castle out from under the title; narrower, it is cropped at 38% 35% and shaded
  whole. A shade on the reading side and a fall into the page keep it legible. Loaded eagerly: it is above the fold.
- **Categories.** Pills: All plus the eight, each a link to Explore filtered to it, dark translucent so they read
  over the picture, the chosen one `aria-current` and filled cream. Below 52rem they scroll sideways in their own
  strip, edge to edge, rather than stacking.
- **Genre and sort.** Native selects, labelled "Genre" and "Sort by": one genre or all; Recently published or A-Z. No
  popularity, trending or rating sort exists, because no such data does.
- **Search.** In the bar, on every portal page. On Explore it is `q`: sent 300 ms after typing stops, at once on
  Enter or when emptied; earlier requests are aborted and a stale answer is never shown; starting or clearing a
  search adds a history entry, refining one replaces it. Elsewhere, Enter opens Explore with the search.
- **Address.** `q`, `category`, `genre`, `sort=az`, each omitted at its default - `/explore?category=games&genre=fantasy`.
  Back, Forward and refresh restore it; an unknown value in a hand-edited address is ignored, not an error.
- **Paging.** "Show more worlds", under "Showing 24 of 52 worlds", appends the next page, keeps the filters and drops
  any world already shown (a publish in between shifts pages by one). No infinite scroll. The loaded pages are not in
  the address; a refresh starts from the first page with the same filters. The count is also a polite status.
- **Grid.** Four across from 75rem, three from 56rem, two from 34rem, one below: steps, so a wide screen never
  shrinks the cards to fit a fifth.
- **Card.** One dark panel and one link to `/worlds/{slug}`: the author's whole 16:10 card picture across the top
  (lazy-loaded, never cropped further), fading into the panel; the name (serif, two lines, `dir="auto"`) set over the
  picture's lower edge; the genres as chips tinted per genre, the word always there; then "by" the public name (one
  line, cut with an ellipsis, full name in `title`) and the category where a streaming card puts its numbers. Every
  authored string in `<bdi>`. No summary, counts or dates. A picture that fails keeps the panel with the Lorex mark.
- **States.** Card-shaped skeletons while loading; "No worlds have been published yet." for an empty platform; "No
  published worlds match." with Clear search and filters; an error with Try again, never mistaken for empty.
- **Visual boundary.** The portal is dark in either scheme. `.portal` redefines the shared tokens inside it (so shared
  buttons, notices and menus draw dark) plus a few `--portal-*` values; the workspace's tokens are untouched. Motion
  is a panel edge brightening and a 3% image lift on hover, the lift only without reduced motion.
- `/worlds/{slug}` keeps its 008 content inside the dark frame; the real public universe page is 011's.

## 14. Public and private navigation

The portal is the front door: `/` opens `/explore`, and `/explore` and `/worlds/{slug}` answer without a session -
directly, after a refresh, in a new browser. Signing in is a choice made from it, and it comes back:

- **Log in** and **Create account** in the portal bar pass the current page (path and query) as router state
  (`{ from }`) - the same mechanism `RequireAuth` uses. Signing in or registering returns there, not to the workspace;
  the Login and Register screens' links to each other carry it along. Signing out from the portal stays on the page.
- **My workspace ↗** is the one way into the workspace from the portal; the universes header's **Explore worlds ↗**
  is the way back. Visibility belongs to universes; the two sides are the portal and the workspace, never "public
  mode" and "private mode".
- **Return safety.** The page travels in history state, never in the address, so no link anyone else writes can choose
  it. `auth/returnPath.ts` still checks it, since anything on the page can write history state: it resolves the value
  against the site's own origin and follows only a same-origin path that is not Login or Register itself; `//host`,
  `/\host`, tab-smuggled `//`, absolute and `javascript:` values fall back to `/app`. `RequireGuest` redirects to the
  same answer, so it cannot race a successful sign-in somewhere else.

Settings' Public portal section (status in words, public details, artwork, author, checklist, publish and make private
with inline confirmations, "View public page") is unchanged. Later: "Edit this world" for an owner viewing their own
world (011).

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
