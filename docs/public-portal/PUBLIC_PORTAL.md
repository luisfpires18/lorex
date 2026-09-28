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
| Routes | `/app/...` behind `RequireAuth` | `/explore`, `/worlds/{slug}`, `/worlds/{slug}/lore/{loreSlug}`, `/worlds/{slug}/stories/{storySlug}`, `/authors/{slug}`, outside every guard |
| Layout | Rail, universe sidebar, universe search | `PublicLayout`: its own bar, none of the workspace chrome |
| API | Owner-scoped `/api/...` | `/api/public/universes...` and `/api/public/authors...`, anonymous, read-only |
| Identity | Warm editorial workbench (Design refactor 001-007) | Dark, image-led discovery and reading (Tasks 009, 011) |
| Account | `/app/profile`: email, account id, photo, public name - private | `/authors/{slug}`: public name, chosen photo, public worlds (ADR 0037) |

One React application, two layouts: the session, router and build are shared, so a signed-in visitor sees "My
workspace" in the portal bar and a signed-out one sees "Sign in" and "Create account".

## 3. Privacy model

Private by default; publication explicit at every level; allow-list only. No route infers publication, no save or
restore sets it, and no public response is an internal object with fields removed. A private universe overrides
everything inside it, and a public one publishes nothing inside it (section 15).

## 4. Universe visibility

`Private` (every universe, including every one that existed before 008) or `Public`. Changed only by
`POST /api/universes/{id}/publish` (refused until complete; mints the address the first time; sets `publishedAt`
once) and `POST /api/universes/{id}/unpublish` (immediate; keeps details, address and first publication date).
Both idempotent, owner-only. While public, nothing publishing needs can be removed - make it private first; artwork
can be replaced.

## 5. What a public universe exposes

Exactly `PublicUniverse`: `slug`, `name`, `publicSummary`, `category`, `genres`, `authorDisplayName`, `authorSlug`
(the author's page, ADR 0037), `cardImageUrl`, `publishedAt` (first publication). None is ever null.

## 6. What stays private

Everything else: the description, colour, archive state, ids, owner, username, email, audit dates, storage keys, the
original artwork, and all content - except the listing metadata of lore entries and stories their author published one
by one (section 15). Articles, fields, relationships, family trees, chapters, scenes, manuscripts, plot, timeline,
ideas, world rules, Canon, the Trash, history and drafts stay private whatever is published.

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

Since 011 (ADR 0037) an author also has an address, `PublicAuthorSlug`, minted from the public name at first publication
(`author` fallback, `-2` on collision) and never changed after, and a page at `/authors/{slug}` that resolves only while
they have a public universe. Their photo is shown there only if they choose, per picture (section 16).

## 10. Universe artwork

One per universe (`UniverseArtworks`): the untouched original and one 16:10 card, at most 960 px wide, never
enlarged, cut on the server from the frame the author chose in the shared cropper, metadata stripped. 16:10 because
the portal card is about as tall as wide with the picture as its top five eighths. Only the card is ever public. A
hero cut for Task 011 is a new frame of the same original. The static Explore background is not universe artwork:
`src/Lorex.Web/src/portal/explore-worlds-background.png`, owner-approved, 1916 x 821, 2,370,934 bytes, SHA-256
`31e6995251e1145f792664fac61de586fd730f63b3f30dc7d4b8850fce5abe49`. Never edited, recompressed or converted; CSS crops
it. Vite emits it unchanged under a content-hashed name, which the service worker may cache for good. Since 012 it is
delivered as a derivative beside it, `explore-worlds-background.webp` (250,016 bytes, same 1916 x 821, PSNR 43 dB against
the PNG, made with `ffmpeg -i explore-worlds-background.png -c:v libwebp -quality 86 -compression_level 6 -preset photo`),
through `<picture>` with the untouched PNG as the fallback (section 19).

## 11. Slug model

Minted at first publication from the name: ASCII `a-z0-9-`, accents folded, other scripts are word breaks, `world`
when nothing remains, at most 60 characters, then `-2`, `-3` on collision. Unique index. Never changes after -
renames and unpublishing keep it. No manual editing yet.

## 12. Public API boundary

| Route | Answers |
| --- | --- |
| `GET /api/public/universes?page=&pageSize=&category=&genre=&q=&sort=&author=` | Public universes, 24 per page (max 48), filtered and ordered as below; `author` is an author address (011). |
| `GET /api/public/universes/{slug}` | One public universe, or 404 (private and missing alike). |
| `GET /api/public/universes/{slug}/artwork/card/{cardId}` | Its current card (WebP), ETag = card id, 304 when current, 404 otherwise. |
| `GET /api/public/universes/{slug}/lore?page=&pageSize=` | Its published lore entries (010), 24 per page (max 48). 404 unless the universe is public. |
| `GET /api/public/universes/{slug}/lore/{loreSlug}/thumbnail/{thumbnailId}` | A published entry's current square thumbnail (WebP), as the card route. |
| `GET /api/public/universes/{slug}/stories?page=&pageSize=` | Its published stories (010), as the lore listing. |
| `GET /api/public/universes/{slug}/lore/{loreSlug}` | One published entry's page (011): `PublicLoreDetail`. 404 alike for private, trashed and missing. |
| `GET /api/public/universes/{slug}/stories/{storySlug}` | One published story's page (011): `PublicStory`. Same 404. |
| `GET /api/public/authors/{slug}` | An author (011): `PublicAuthor`, only while they have a public universe; otherwise 404. |
| `GET /api/public/authors/{slug}/avatar/{thumbnailId}` | Their photo's current square, only if they chose to show it; as the card route. |

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
with inline confirmations, "View public page") is unchanged, except that since 010 its note and its publish
confirmation say that each entry and story is published from its own page. Later: "Edit this world" for an owner viewing
their own world (011).

## 15. Content publication (010)

A lore entry or a story is published on its own, by its owner, from its own page. Publishing a universe publishes none
of them; publishing one of them publishes nothing of its universe.

**Model.** `Entities` and `Stories` carry `Visibility` (`ContentVisibility`: `Private` 0 - every existing and new item -
or `Public` 1), `PublicSlug` and `PublishedAt`. Set only by `POST /api/universes/{id}/entities/{entityId}/publish` and
`/unpublish`, and the same under `/stories/{storyId}`; read by `GET .../publication`, which also says whether the
universe is public. Owner-only (401 anonymous, 404 anyone else, as every universe route), idempotent, no body. No entry
or story save binds any of the three. Publishing needs nothing the item does not always have; it mints the address and
the date the first time and keeps both through unpublishing and renames. It is not an edit: `UpdatedAt`, history and
search are untouched.

**Effective visibility.** One predicate per kind - `PublicationRules.PublicLore`, `PublicStories` - holding the universe
predicate inside it:

| Universe | Item | In the Trash | Anyone can list it |
| --- | --- | --- | --- |
| Private | Private | - | No |
| Private | Public (selected) | - | No |
| Public | Private | - | No |
| Public | Public | No | **Yes** |
| any | any | Yes | No |

**Preparing while private.** An owner may publish an item while its universe is private. It is then *selected*: the
page says "Selected" and why nothing shows yet, and it appears the moment the universe is published. Making the universe
private hides every selected item at once and clears nothing, so publishing it again brings back exactly those.

**Lore listing contract** - `PublicLoreEntry`, exactly: `slug`, `name`, `summary` (the entry's own "what this is"
lead, null when empty), `typeName`, `thumbnailUrl` (null without a picture), `publishedAt` (first publication). Its
page (011) is `PublicLoreDetail`: the same plus `article` - see section 16. Ordered
by name, case aside, then address. The summary is published because it is the entry's authored lead - shown under its
name in its own header - and the publish panel says it is listed. Never the article, fields, aliases, tags, Canon status,
relationships, history, ids or keys.

**Story listing contract** - `PublicStory`, exactly: `slug`, `title`, `publicSummary` (011), `publishedAt`. Ordered by title, case aside, then
address - the workspace's own order; stories have no order an author sets. The premise is not published: it is the
author's planning text and may give the story away, as the universe description is not. No chapter, scene, manuscript,
plot, note or status. Since 011 a story is published only with a public summary its author writes for readers
(section 16).

**Thumbnail.** The entry's existing square thumbnail (the upload gate's WebP, metadata stripped) - never the original -
through the lore predicate by both addresses and the current thumbnail id; ETag = thumbnail id, checked after
visibility, `no-cache`. It stops answering when the entry or universe goes private, the entry goes to the Trash, or the
picture is replaced, reframed or removed. No picture is fine: pictures are not required.

**Addresses.** The universe generator (section 11), falling back to `entry` or `story`, unique per universe and kind -
an entry and a story may share one. A trashed item keeps its address, so it stays taken.

**Trash and status.** Trash hides an item whatever its selection; restoring it brings the selection back, so it is
public again only if it and its universe still are. Canon status (Idea, Draft, Canon) and story status (Planning,
Drafting, Complete) are workflow, not visibility, and change nothing here. Entries have an `IsArchived` column no route
sets; publication ignores it, as it ignores a universe's archive state.

**Backup.** Format 15 is unchanged and carries no item's visibility, address or date. Every restore - any version, or a
forged file - has every entry and story private.

**UI.** On an entry, a pill before Edit; on a story, a pill in its line of facts (the story bar is full at 360px). The
pill says Private, Public or Selected, and opens a panel (the `ActionMenu` disclosure) saying what that means, what is
listed, what is not, and the one action - Publish entry/story or Make private. The panel is the confirmation.

**For 011.** Reading pages at `/worlds/{universeSlug}/lore/{loreSlug}` and `/worlds/{universeSlug}/stories/{storySlug}`,
each with its own detail DTO read through the same predicate - never the workspace DTOs. Built in 011 (section 16).
Relationships, family trees and the timeline stay private until a decision says otherwise.

## 16. Public reading (011)

What an Explore card leads to. Every page is under `PublicLayout` - the portal bar, the search (which still opens
Explore), Log in and Create account returning to this exact page, or My workspace - and answers signed in or out.

**A universe** (`/worlds/{slug}`). A cinematic hero built from the one public picture a universe has, its 16:10 card:
drawn crisp at no more than its own 960 pixels beside the title, and blurred behind the band, where the blur hides that
it is enlarged - no new derivative, and never the private original. The category, the name, "by" the author (a link to
their page), the genres and the public summary. Under it, what the author published: Lore (the entry's square or its
initial, type, name, lead) and Stories (title, public summary), each 24 at a time with Show more, in the 010 order. A
section with nothing in it is left out; with nothing at all, "No lore or stories have been published here yet." Nothing
counts or hints at anything private. Anchors to Lore and Stories only when both exist.

**An entry** (`/worlds/{slug}/lore/{loreSlug}`). A reference page: "← World / Lore", the type, the name, the entry's lead,
its public square beside a reading column (40rem), and its article, rendered by the workspace's own read-only renderer.
The API has already unwrapped every link that is not absolute http, https or mailto, and read its first-level headings
as second-level ones, so the page has one `h1`. Never its fields, aliases, tags, Canon status, relationships or history.

**A story** (`/worlds/{slug}/stories/{storySlug}`). A landing page, not a reader: its title, its public summary, "by" the
author, when it was first published, and the world it is set in. **Public summary**: `Stories.PublicSummary`, at most
300, written in the story's publication panel ("Write public summary…", a guarded drawer - "Shown to readers on the
public portal. Your premise stays private."), saved on its own route, required to publish and not removable while the
story is selected; never taken from the premise. A story selected in 010 without one stays selected and hidden, and its
panel says "needs a public summary before readers can see it". Publishing a story's prose needs a decision about
chapters and scenes; it is not made here.

**An author** (`/authors/{slug}`, ADR 0037). Their public name, their photo's square only if they chose to show it -
otherwise their initial in a ring - "Creator on Lorex", how many public worlds, and those worlds as the Explore cards (the
author's name unlinked, since it would lead here). Only while they have a public world; otherwise the same not-found
page as an address nobody holds. The address is minted from the public name at first publication and kept for good.

**Public and private profile.** `/app/profile` is the workspace's account screen and stays so: email, account id, the
photo, the public name, and now "Author page" - a link to the public page when it is live, and "Show my photo on my
author page", off by default and off again when the photo is replaced. The photo's hint says it is private unless shown.

**Cards.** An Explore card has two links and no nesting: the world's name, stretched over the whole card so the card is
still one target, and the author's name laid above it.

**Owner bridge.** Signed in as the owner, a world shows "Edit this world" and an entry or story a quiet "Edit in
workspace", from `GET /api/universes/by-address/{slug}?lore=&story=`, which answers only the owner. Nothing public names
an owner or an id; nobody else sees either link.

**Not found.** One portal page for every hidden thing - private world, private or trashed entry or story, an author
with nothing public, an address nobody held: "This page is not available. Its address may be wrong, or it is not
public." A page that fails to load says so, with Try again, and is never mistaken for missing.

**Front door.** `/` opens Explore, and so does the installed app: the manifest's `start_url` is `/explore` (its `id`
stays `/app`, the install's identity). Signed in or out, and whatever was used last, the portal comes first; My
workspace is the way in. Deep links are unaffected.

**Owner preview** of a still-private universe was planned for 011 and is not built: an owner sees the real public page
once published, and Settings' checklist before that.

## 17. Roadmap

| Task | Scope |
| --- | --- |
| 008 | Publication foundation: visibility, public metadata, artwork, slug, anonymous API, settings, privacy tests. |
| 009 | Explore Worlds portal from the owner's visual references and the approved background. |
| 010 | Explicit publishing of individual lore entries and stories: selection, addresses, listings, thumbnail, owner controls. Done. |
| 011 | Public reading: the universe page, entry and story pages, a story's public summary, author pages and photos, "Edit this world", the portal as the installed app's start. Done (owner preview not built). |
| 012 | Portal polish, accessibility, SEO and Open Graph, caching and performance, security audit, remaining 007 polish. Done (section 19). |

## 18. Non-goals

No likes, ratings, comments, follows, view counts, popularity, trending, recommendations, feeds, bookmarks or public
editing. No fake data, metrics or placeholder artwork. Author pages (011) hold a public name, a chosen photo and public
worlds - no bio, followers, contact or counts of anything private.

## 19. Final polish and hardening (012)

**Route set, final.** Public: `/explore`, `/worlds/{slug}`, `/worlds/{slug}/lore/{loreSlug}`,
`/worlds/{slug}/stories/{storySlug}`, `/authors/{slug}`; `/` redirects to `/explore`. Everything else is the workspace or
sign-in and is never indexed.

**SEO (ADR 0038).** The API writes each public page's head into the shell on the server: `<title>` ("Explore Worlds |
Lorex", "World | Lorex", "Entry — World | Lorex", "Story — World | Lorex", "Author | Lorex"), description from public text
only (public summary; an entry's lead; a story's public summary - never the premise; "Name, creator on Lorex. Worlds: …"),
robots, canonical, Open Graph (`og:site_name`, `type`, `title`, `description`, `url`, `image`) and `twitter:card`.
Images are the public derivatives (card, thumbnail, a shown photo) or `icon-512.png`. Hidden and missing public addresses
are a 404 with a generic `noindex` head. Workspace, sign-in, profile and unknown paths are `noindex,nofollow`, header and
meta. **The body is still rendered in the browser**: a crawler that runs no JavaScript reads the head, not the article.
The app keeps the tab title in the same words on client navigation. No structured data.

**Indexing.** Explore itself is indexable; any `q`/`category`/`genre`/`sort` state is `noindex,follow`, canonical
`/explore`. `robots.txt` allows `/explore`, `/worlds/`, `/authors/`, `/api/public/`; disallows `/api/`, `/app`, `/login`,
`/register`; names the sitemap. `/sitemap.xml` lists Explore, public universes, effective-public entries and stories and
authors with a public world, computed per request (`no-cache`), so unpublishing removes an address from the next read. API
responses carry `X-Robots-Tag: noindex`. Robots and noindex are courtesy, never protection: authorization is.

**Origin.** `PublicSite:Origin` and `PublicSite:AllowIndexing` (default false) - configuration, never the `Host` header.
Unset (DEV today): no canonical or absolute URL, `robots.txt` disallows everything, no sitemap. Production sets
`PublicSite__Origin=https://<its host>` and `PublicSite__AllowIndexing=true` as app settings; no code change.

**Publication edge cases.**
- *Trash restore.* The Trash listing now says what a restore would do (`publication`: `None`, `Hidden`, `Visible`, from the
  same predicates). Restoring a selected entry or story asks first: in a public universe "Restoring “X” makes it public
  again - This entry was public before it was moved to the Trash…", with Restore and publish, Restore as private (restore,
  then unpublish at once) and Cancel; in a private universe (or a story without a public summary) it says it is still
  selected and readers cannot see it now, and never claims it becomes visible. No second publication state.
- *Archive.* Archive and publication stay separate: an archived public universe remains public until made private.
  Archiving a public universe asks first ("It stays public"), offers "Make it private first" (which leads to Public
  portal's own control), and an archived public universe's Settings says "Still public." Restoring from the archive
  never asks. Deleting (archived only) says a public page goes with it.

**Performance.** Explore's hero ships as WebP (250 kB, was 2.37 MB) with the PNG fallback. Cards and thumbnails were
already lazy with explicit dimensions; the hero is eager (above the fold). Page screens are split chunks; the rich-text
editor (393 kB) loads only on screens that render an article. `/assets/*` is `immutable` for a year; the shell,
manifest, icons and `sw.js` are `no-cache`. A public hero stays the 960-wide card (blurred behind): privacy over
sharpness; a larger public derivative is future image-pipeline work.

**PWA and cache.** `start_url` `/explore`, `id` `/app` (unchanged identity). The service worker caches only same-origin
`GET` build output and root static files; it never touches `/api`, navigations, non-`GET` or cross-origin requests, so no
public or private API response, picture or page is persisted by it and an unpublish is never bypassed. The browser's own
HTTP cache may hold a public picture it already fetched; `no-cache` makes it revalidate, and revalidation of something no
longer public is a 404 (visibility is checked before the 304). Verified in code and by `pwa.spec.ts`; installed-device
behaviour was not manually re-tested.

**Dates.** Timestamps are stored in UTC and serialize without a zone (`2026-09-28T10:00:00`). The client's
`parseApiDate` reads a zone-less value as UTC everywhere (`lib/dates.ts`); the API contract is unchanged.

**Polish.** One action order - primary first, then the way out, in sight and in Tab order - in drawers, inline forms,
confirmations and now the entry form and article bars too. New-item drawers no longer say "A new moment" over "New
moment". Settings' delete is a ruled danger panel with a quiet danger-ink first step and a filled last step; its
confirmations take and return focus. A network failure reads "Lorex could not be reached…", never the browser's words.
