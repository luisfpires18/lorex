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
hero cut for Task 011 is a new frame of the same original. The static Explore background
(`explore-worlds-background.png`, repository root, owner-approved) is not universe artwork; Task 009 places it.

## 11. Slug model

Minted at first publication from the name: ASCII `a-z0-9-`, accents folded, other scripts are word breaks, `world`
when nothing remains, at most 60 characters, then `-2`, `-3` on collision. Unique index. Never changes after -
renames and unpublishing keep it. No manual editing yet.

## 12. Public API boundary

| Route | Answers |
| --- | --- |
| `GET /api/public/universes?page=&pageSize=` | Public universes, first published most recently first, 24 per page (max 48). |
| `GET /api/public/universes/{slug}` | One public universe, or 404 (private and missing alike). |
| `GET /api/public/universes/{slug}/artwork/card/{cardId}` | Its current card (WebP), ETag = card id, 304 when current, 404 otherwise. |

All `Cache-Control: no-cache`, no session needed, no cookie set. Filters (category, genre, search) and a second sort
(A-Z) are Task 009's to add to the list query, before its projection.

## 13. Public and private navigation

Now: Settings' Public portal section (status in words, public details, artwork, author, checklist, publish and make
private with inline confirmations, "View public page"); "Explore worlds" in the universes header; the portal bar's
"My workspace" or "Sign in" / "Create account". Later: portal header and search (009), "Edit this world" for an
owner viewing their own world (011).

## 14. Preview

Planned for Task 011: an authenticated owner-scoped route that renders the same allow-listed shape from saved
details, with owner-scoped image addresses, so "what would anyone see" never needs anonymous access.

## 15. Roadmap

| Task | Scope |
| --- | --- |
| 008 | Publication foundation: visibility, public metadata, artwork, slug, anonymous API, settings, privacy tests. |
| 009 | Explore Worlds portal from the owner's visual references and the approved background. |
| 010 | Explicit publishing of individual lore entries and stories. |
| 011 | The public universe page and browsing published content; owner preview and "Edit this world". |
| 012 | Portal polish, accessibility, SEO and Open Graph, caching and performance, security audit, remaining 007 polish. |

## 16. Non-goals

No likes, ratings, comments, follows, view counts, popularity, trending, recommendations, feeds, bookmarks or public
editing. No fake data, metrics or placeholder artwork. No creator profile pages yet.
