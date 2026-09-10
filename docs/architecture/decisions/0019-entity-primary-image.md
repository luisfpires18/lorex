# ADR 0019 - An entry has one image, held in a private bucket and served by Lorex

Status: accepted (2026-09-10). The two decisions it left open were taken the same day; see Consequences.

## Context

An entry could carry a picture, and until now nothing in Lorex could hold one. SQLite is the
only store the product has, and it is the wrong place for image bytes: it is one file on one
share (ADR 0018), every backup and every read would carry the blobs, and the row that a card
projection touches would stop being small.

So this is the first time Lorex has two stores that must agree, and that - not resizing - is the
part worth deciding carefully. Object storage and a relational database cannot be committed
together. Whatever is built has to say what happens when one of them succeeds and the other does
not, and the answer has to be one an author would accept.

ADR 0014's premise is affected. It argued for a single JSON backup partly on the grounds that
"media is not in the product". It is now, and ADR 0014 has been amended: version 3 of the format
is an archive carrying the originals.

## Decision

**One primary image, in its own table, keyed by the entry.** `EntityImages.EntityId` is both the
primary key and the foreign key, so "at most one" is a constraint rather than something every
write path has to remember. It cascades with the entry, which is why the Trash needs no special
case: trashing sets `LoreEntity.DeletedAt` and deletes nothing (ADR 0015), so the association
survives untouched and a restore reconnects it with nothing to rebuild.

The row holds identifiers, never a URL: asset id, both object keys, the decoded content type,
the original's dimensions and byte size, the author's filename as a label, and when it was
uploaded. The keys are stored as written rather than recomputed from the convention, so changing
the convention later cannot orphan objects that already exist.

**Keys are ids and nothing else.**

```
universes/{universeId}/entities/{entityId}/primary/{assetId}/original.{ext}
universes/{universeId}/entities/{entityId}/primary/{assetId}/thumbnail.webp
```

No username, no email, no world name, no entry name. A bucket listing is a disclosure surface
even on a private bucket, and names are authored content. It also means renaming a world or a
character moves nothing.

**`{assetId}` is new for every upload, replacements included.** Nothing is ever written over the
pair that is currently live. That single rule is what makes the replacement flow safe and what
makes a served URL immutable.

**Uploads are mediated by the API; they do not go to R2 from the browser.** A presigned PUT
would take the server out of the write path, but the server is the thing that decides whether a
file is an image at all - by decoding it, not by reading its name - and the thing that makes the
thumbnail. Handing both to the client would mean trusting the client with both. It would also
mean opening CORS on the bucket.

**Reads are an authenticated Lorex route, not a presigned URL.** Both were viable for a private
bucket. A presigned URL turns the URL itself into the credential: it survives in history and in
anything the author pastes it into, it cannot be withdrawn before it expires, and it has to be
reissued and threaded back into every `img` tag as it does.
`GET /api/universes/{u}/entities/{e}/image/{assetId}/{variant}` instead proves ownership through
the same `LoreAccess` check as every other lore read (ADR 0006), streams the object, and points
at nothing outside Lorex. The cost is bandwidth the product already pays for everything else it
serves. For a single-owner world with one picture per entry, that is not a trade worth making
the other way.

Because the asset id is in the path and is never reused, the response is
`Cache-Control: private, max-age=31536000, immutable` - honest, because those bytes cannot change
under that URL - plus `X-Content-Type-Options: nosniff`. `private` keeps it out of any shared
cache, and the route is under `/api`, which the service worker refuses outright (ADR 0017), so a
private picture never reaches the app-shell cache.

**A replacement is ordered so the working image is never the thing at risk.**

1. Mint a new asset id.
2. Write the new original, then the new thumbnail.
3. Move the database association, and commit.
4. Only then delete the previous pair.

A failure before the commit leaves the entry pointing at the image it had, whole, and the new
objects - which nothing references - are swept. A failure after the commit leaves the new image
active with two objects to clean up. What cannot happen is the database naming objects that are
gone. Removal is the same ordering in reverse: clear the association, commit, then delete.

Sweeping is best-effort and never fails the request. A key that will not delete is logged with
its key and left. There is no retry queue: at one image per entry the cost of an orphan is a few
hundred kilobytes, and the cost of a queue is a subsystem.

**What is accepted, and what is refused.** JPEG, PNG and WebP, decided by decoding the bytes -
the filename is a label and the browser's content type is a claim. At most 8 MB, at most 10,000
pixels on a side, and at most 24 megapixels, checked from the header before anything decodes the
pixels, because only a pixel-count check sees a decompression bomb coming. One frame. Empty and
truncated files are refused with a sentence that says what to do about it.

**SVG is refused.** It is a document format with scripting and external references in it, not a
picture, and making one safe means writing and maintaining a sanitiser - a project of its own,
with a long history of bypasses. It also has no pixels to resample, so the thumbnail path could
not treat it like the others. Refusing it is one line; sanitising it would be a phase.

**The thumbnail is generated server-side, 320px square, centre-cropped, WebP.** The lore grid
lays cards out at a 17.5rem minimum and draws the portrait at well under half that, so 320
leaves room for a high-density screen without storing a second near-full-size copy. Crop rather
than fit, because the card slot is a fixed square and letterboxing every non-square image would
put grey bars on the most-scrolled screen in the product. It never enlarges: an image already
smaller than the target is cropped square at its own resolution. EXIF orientation is applied
before metadata is dropped, and the thumbnail carries no EXIF, IPTC or XMP - no camera, and in
particular no GPS. The original is stored exactly as uploaded, metadata included, because it is
the author's own file, is served only to them, and re-encoding it would lose fidelity for
nothing.

**Two dependencies, both justified.** `SixLabors.ImageSharp` decodes and resizes: it is fully
managed, so there is no native asset to carry onto a Linux App Service and no per-RID build, and
Windows development and Linux deployment behave identically. Its licence is the Six Labors Split
License, which is free for personal use and for organisations under $1M revenue - true of Lorex
today, and worth revisiting if that ever changes. `AWSSDK.S3` (Apache-2.0) speaks R2's
S3-compatible API; hand-rolling SigV4 would be a few hundred lines of security-critical crypto
to avoid a well-maintained package.

**Storage is behind a three-method interface, and not one method more.** `IMediaObjectStore` puts
one object, gets one object and deletes one object. No listing, no copy, no multipart, no bucket
management, no lifecycle - because nothing in the product wants any of it. It exists so tests
never reach Cloudflare, not so a second provider could be slotted in. Three implementations: R2,
in-memory (local development and Playwright), and one that fails every call with a 503 when
nothing is configured. There is no silent fallback: a deployment that lost its credentials must
not quietly start storing images in a dictionary.

**A new entry's picture waits for the entry.** Object keys are built from the entry's id, so
there is nowhere to put a file before the create call comes back. The editor holds it in the
browser and shows it from an object URL; the upload follows the create. Nothing is written to
the bucket before there is an entry for it to belong to, so an abandoned form leaves nothing
behind - and no temporary path is invented that nobody would come back to clean up.

## Consequences

- **A backup carries the originals, so it stays lossless.** ADR 0014 moved to version 3: the
  download is a ZIP holding `backup.json` plus `media/entities/{entityId}/original.{ext}`, and it
  does not depend on this bucket - or any bucket - still being there. Only the original travels;
  the thumbnail is regenerated, because it is derived from the original by a fixed recipe and a
  second copy would be one more thing to keep in step. An object the store cannot produce fails
  the export loudly rather than thinning it. No object key, bucket, endpoint or URL is in the
  file: they describe this installation, not the picture.
- **Superseded objects are still deleted, and revision restore still does not restore an image.**
  Nothing historical is retained - a replacement or a removal cleans the previous original and
  thumbnail exactly as described above, and that was chosen over keeping every version's picture
  forever, which would grow storage without bound and needs a cleanup story tied to a history
  pruning design that does not exist. What follows is that an old version cannot put back bytes
  that are gone, so it does not pretend to: restoring leaves the entry's current picture alone.
  The change itself *is* recorded - setting, replacing and removing an image each write a version
  flagged `Image` (ADR 0013) - so history is truthful about what an author did, and the history
  screen states the limit rather than leaving it to be discovered.
- **The image is not lore the Canon rules read.** No rule looks at it, so setting one is not
  gated by the promotion gate (ADR 0012) and is not a revision-worthy write. The entry's
  `UpdatedAt` is left alone for the same reason the Trash marker leaves it alone: it says when
  the lore was last authored, and the image carries its own `UploadedAt`.
- **Two stores can disagree, and one direction is handled.** A row naming an object the bucket no
  longer holds answers 404 - not a 500, and without saying which store was missing it. The
  reverse, an object nothing names, is an orphan and is invisible to the product.
- **Nothing about Cloudflare reaches a response.** Not the provider, not the endpoint, not a
  credential, and not an object key: a key is an internal address and belongs in the database and
  the log. Contracts carry the asset id and the picture's shape, and the client composes the
  route from them.
- **No Cloudflare resource is created by this repository.** Bucket, token and App Service settings
  are owner steps: `docs/deployment/cloudflare-r2.md`.
- **Permanent deletion is still deferred** (ADR 0015), so no route hard-deletes an entry and
  nothing needs to clean up a hard-deleted entry's objects. When one arrives it will have to,
  and the cascade on `EntityImages` covers the row but not the bucket.
