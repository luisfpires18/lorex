# ADR 0027 - A scene's manuscript is plain prose in a row of its own, read and written on its own route

Status: accepted (2026-09-13), amended 2026-09-13 (Phase 2 closeout: the shared header, Write and Show in Scenes,
Sign out asks, Back and Forward decided)

## Context

A story so far describes and plans. Scenes have a title, a summary, notes, a point of view, a place in the world and
linked lore (ADR 0024); chapters group them (ADR 0025); plot arcs and beats say what the author means to develop
(ADR 0026). None of it is the writing. The manuscript is the first Story feature whose content is free-form prose - "The
hall had emptied long before Arlen understood why Mira would not meet his eyes..." - and it differs from everything
around it in size (a scene's prose is tens of thousands of characters, its summary a sentence), in how often it is
written, and in when it is needed: only while that one scene is being written.

The shapes available were a text column on `Scenes`; a dedicated one-to-one row; a rich-text document like the lore
article's Tiptap JSON; or files beside the database.

## Decision

**Prose is not planning.** A scene's manuscript is the telling itself. It replaces none of the scene's summary, notes,
point of view, chronology, chapter, lore links or plot beats, and none of those is written into it. Lore is what is true,
story structure is what is shown and in what order, plot is intent, and the manuscript is the prose.

**It belongs to the scene, in a row of its own.** `SceneManuscripts` - `SceneId` as both key and foreign key, `Content`
as text with no column length, `UpdatedAt` - lives in `Features/Stories`. `Scene` gains no column and no navigation. A
column would have been as small a migration, but the story read is not the only thing that reads a scene: a reorder, a
move, a scene edit, a delete and the backup builder all load whole tracked `Scene` rows, so a `Content` column would drag
every scene's prose in a chapter through every Move up. A separate row keeps that impossible rather than merely avoided,
and it leaves room for manuscript history later without touching a scene's identity.

**No row until the first save.** A scene with nothing written has no row, and the API still answers with one shape:
`content: ""` and `updatedAt: null`. Saving an empty string keeps an empty row - clearing is a save like any other.

**Plain text, stored exactly.** V1 stores what the author typed: Unicode, paragraphs, line breaks, deliberate blank lines,
indentation, trailing spaces and quotation marks, with no trimming, normalising, sanitising, Markdown or HTML. JSON
escaping in transport is the only transformation, and the logical string round-trips unchanged - pinned by a test through
the API, the column and the backup. The lore article's Tiptap document is deliberately not reused: a document format is a
commitment, and formatting prose is deferred.

**Its own route, and nowhere else.** `GET` and `PUT /api/universes/{u}/stories/{s}/scenes/{scene}/manuscript`. The
request is `{ content, expectedUpdatedAt }` and the response `{ sceneId, content, updatedAt }`: no title, chapter or point
of view, which stay the scene route's. Ownership is proved universe, then story in universe, then scene in story; a
foreign or unknown id at any level is the same 404, and validation runs after ownership, so a stranger's malformed body
is a 404 too. Null `content` is refused, so a malformed body can never wipe prose.

**No prose in any other payload.** The story list, the story read, the scene list and read, the chapter reads, the plot
read and every structural write that answers with a story's structure carry none. A test saves a manuscript of over four
hundred thousand characters and holds each of those responses to its length before the save. The Manuscript view's
outline is drawn from the story read; the manuscript of one scene is read when that scene is opened, never one per scene.

**A generous, explicit bound.** One save is at most `StoryLimits.ManuscriptMaxLength` - 1,000,000 characters as .NET and
JavaScript both count them - refused with a 400 and nothing written. The web client mirrors the number as
`MANUSCRIPT_MAX_LENGTH` and says so before a save, without a `maxLength` that would silently truncate a paste. The column
itself is unbounded; the bound is there so one request stays a bounded body (worst-case escaping keeps it far under
Kestrel's 30 MB default).

**No silent overwrite.** Lorex had no optimistic-concurrency pattern to reuse, and none is built here beyond one
comparison. A save names the `updatedAt` it was written over - null for "nothing was saved yet". Inside the write's own
transaction, SQLite's single writer, a mismatch is refused with 409 `scene_manuscript_changed` carrying the stored
`updatedAt`, and nothing is written. The client keeps the author's text on screen and offers two choices: save it over
the other version, which re-sends the stored moment and is a person's decision, never a retry; or load the saved version,
after a confirmation. There is no merge, lock, presence or collaboration - this exists only so one author's two windows
cannot quietly lose each other's prose.

**Saving is explicit.** Lorex has no autosave to reuse, so there is none: a Save button and Ctrl+S / Cmd+S, which works
from anywhere on the page while a scene is open and never opens the browser's own save. Unsaved means the text differs
from what the API last confirmed; it clears only when a save succeeds, so a failed save leaves the text and the state
exactly as they were, and trying again is pressing Save again. The status is a live region beside the button.

**Leaving asks first.** The app runs on a plain `BrowserRouter`, where React Router's blocker is unavailable, so
`useLeaveGuard` covers what can be caught: a capture-phase click on any same-origin link - the outline, the story's
views, the sidebar, a lore or plot chip - asks with the browser's own confirm and cancels the click when the author
stays, and `beforeunload` covers reload, close and a typed address. It is local to the editor, not a form framework.

**Timestamps.** A save updates the manuscript's `UpdatedAt` and the story's, because the author worked on the story. It
does not update the scene's: the scene's planning did not change.

**No meaning is read from prose.** No Canon gate, finding or reconciliation, timeline entry, relationship, lore change,
plot link or search index entry comes from a manuscript. Names in it are not parsed and link to nothing; "The king died
before sunrise" gives nobody a death year. A test writes exactly that and finds nothing changed. The scene's point of view
and the plot beats that point at it are shown beside the prose, read-only, from the story and plot reads the page already
holds; they are edited where they are owned.

**Deleting.** Deleting a scene deletes its manuscript (cascade). Deleting a chapter moves its scenes and deletes none, so
every manuscript survives; moving and reordering keep the same scene row and so the same prose. Deleting a story or a
universe cascades through its scenes to their prose. Trashing an entry touches no manuscript.

**A backup carries prose, and that is format version 8** (ADR 0014): each scene's `manuscript` is `{ content, updatedAt }`
or null.

**The Manuscript view is a third view of the story.** `/stories/:storyId/manuscript/:sceneId`, beside Scenes and Plot
under the same header; no sidebar entry. Without a scene in the address the first scene in reading order opens, replacing
the address; a scene id that is not in the story shows a notice and reads nothing. The outline lists Unchaptered first
while it holds a scene, then every chapter in order with its scenes, as real links marked `aria-current`; it navigates and
never reorders. The open scene shows where it is told ("Chapter 2 — Arrival · Scene 1 of 3"), its title, its date, point
of view and plot beats, and an Edit scene button that opens the existing scene drawer in place with the draft untouched.
The prose is a plain textarea at a 46rem measure with a sticky save bar. At 1100px and below the outline folds into a
disclosure that names the open scene; choosing a scene closes it and puts the focus on it. No word count.

## Amendment - Phase 2 closeout (2026-09-13)

Reviewed as one product with Scenes and Plot, nothing about the manuscript's storage, route, bound or concurrency
changed. What changed is how the three views meet.

- **The shared header is short.** Title and facts; the premise on the Scenes view only; one bar holding the three
  views and Edit and Delete story, which are icon-only below 640px and keep their names. On a phone the header
  used to fill the first screen and push the text box below it.
- **A scene and its prose are a link apart, both ways.** Every scene card has Write, to this view's address for that
  scene - the same editor, not a second one. The manuscript page gains Show in Scenes and a Lore row beside the point
  of view and beats, drawn by the same `SceneContext` components as the scene card. A link that lands on a scene or a
  beat scrolls to it, focuses it and marks it for a moment.
- **The leave guard asks on Sign out too.** Signing out is a button, so the link check never saw it and unsaved prose
  went silently; `confirmLeaving` asks the same question first.
- **Back and Forward stay uncaught, and this is now a decision rather than a gap.** A browser pop cannot be cancelled,
  only undone by moving the history again. React Router's blocker does exactly that, and is the tested way to, but only
  under a data router - moving the whole app off `BrowserRouter` to protect one editor, and still reverting a pop after
  it happened. Not done. The manual test plan tells the owner so. Deferred below, unchanged.

## Deferred

- Rich text of any kind: formatting, headings, Markdown, scene-break markup, comments, footnotes, inline lore mentions.
- Manuscript revisions and history, track changes, collaboration, presence, merging.
- Autosave and offline drafts.
- Story and manuscript search. Lore search stays lore (ADR 0016).
- Word counts, writing goals and statistics.
- Export to documents, publishing, and reading a backup back in.
- Advisory Story-versus-Lore checks against prose, and any AI assistance.
- Catching the browser's Back and Forward buttons with unsaved prose, which needs a data router.

## Consequences

- Migration `AddSceneManuscripts` creates one table. Existing scenes read as empty manuscripts. Rolling back drops every
  manuscript and touches no scene, chapter or plot row. `SceneManuscriptMigrationTests` walks it down and up over a story
  in chapters with a plot on a file, and reads the key, the columns and the delete action back from SQLite.
- Every save sends the whole text: a scene at the bound re-sends megabytes each time. Fine for explicit saves; autosave
  would need to revisit it.
- Backups grow by the prose. `backup.json` is deflated in the archive and prose compresses well, but the archive is still
  assembled in memory (ADR 0014).
