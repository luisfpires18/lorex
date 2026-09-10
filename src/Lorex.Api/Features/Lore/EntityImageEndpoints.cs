using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// The one primary image on one entry: set it, read it, remove it.
///
/// <para><b>Why the bytes come through Lorex rather than straight from Cloudflare.</b> Two
/// models were available for a private bucket. A short-lived presigned URL takes the server out
/// of the read path, but it also turns the URL itself into the credential: it survives in
/// history and in anything the author pastes it into, it cannot be withdrawn before it expires,
/// and it has to be reissued and threaded back into every <c>img</c> tag as it does. The
/// alternative is this one - an authenticated route that proves ownership per request and
/// streams the object - and it costs bandwidth Lorex already pays for everything else it
/// serves. Ownership is then checked in exactly the same place as every other lore read, the
/// browser sends the session cookie it already has, and no URL anywhere points at Cloudflare.
/// See <c>docs/architecture/decisions/0019-entity-primary-image.md</c>.</para>
///
/// <para><b>Why uploads are mediated too.</b> The server has to see the bytes: it is what
/// decides whether the file is an image at all, and it is what makes the thumbnail. A browser
/// uploading straight to R2 would put both decisions on the client, and would need CORS opened
/// on the bucket to do it.</para>
///
/// <para><b>What the URL shape buys.</b> The asset id is in the path, and a new one is minted
/// for every upload, so a given URL always names the same bytes. A replacement is a different
/// URL rather than the same URL with different content, which is what lets the response be
/// cached honestly and what stops a stale thumbnail surviving a replace.</para>
///
/// <para>Every route is universe-owner scoped through <see cref="LoreAccess"/>, so an entry in
/// someone else's world answers 404 and stays indistinguishable from one that is not there.
/// Nothing in a response, an error or a log carries a bucket name, an endpoint or a
/// credential.</para>
/// </summary>
public static partial class EntityImageEndpoints
{
    /// <summary>The two objects an asset is made of, named in the route.</summary>
    private const string VariantOriginal = "original";

    private const string VariantThumbnail = "thumbnail";

    /// <summary>
    /// A backstop well above <see cref="EntityImageProcessing.MaxUploadBytes"/>, not a second
    /// limit. The friendly refusal is the validation one; this only stops a request that is
    /// gross rather than merely too big.
    /// </summary>
    private const long RequestBodyCeiling = EntityImageProcessing.MaxUploadBytes * 2;

    public static IEndpointRouteBuilder MapEntityImageEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/image")
            .WithTags("Entity images")
            .RequireAuthorization();

        // PUT rather than POST, and that is a security choice as well as a semantic one. The
        // session cookie is SameSite=Strict, so a cross-site request never carries it in the
        // first place; PUT closes the same hole a second time, because an HTML form can only
        // issue GET and POST and a scripted PUT is forced through a CORS preflight. Antiforgery
        // is disabled because there is no token to check on an API called by fetch - the cookie
        // policy and the method are what defend it.
        group.MapPut("/", UploadAsync)
            .WithName("SetEntityImage")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling));

        group.MapDelete("/", RemoveAsync).WithName("RemoveEntityImage");

        group.MapGet("/{assetId:guid}/{variant}", ReadAsync).WithName("ReadEntityImage");

        return endpoints;
    }

    // ---------- Upload and replace ----------

    /// <summary>
    /// Stores a new asset and points the entry at it.
    ///
    /// The order is the whole design, because R2 and SQLite are two stores and there is no
    /// transaction across them. Both new objects are written first, under an asset id nothing
    /// is using; only then does the database move; and only after that commit is the previous
    /// pair deleted. So a failure anywhere before the commit leaves the entry pointing at the
    /// image it had, still whole, and a failure after it leaves the entry pointing at the new
    /// image with two objects to sweep up. What cannot happen is the database naming objects
    /// that are gone.
    /// </summary>
    private static async Task<IResult> UploadAsync(
        Guid universeId,
        Guid entityId,
        IFormFile? file,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        // Trashed is not editable, exactly as the entity update path has it.
        var exists = await db.Entities.AnyAsync(
            candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt == null,
            cancellationToken);

        if (!exists)
        {
            return Results.NotFound();
        }

        if (file is null || file.Length == 0)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["file"] = ["Choose an image to upload."],
            });
        }

        await using var upload = file.OpenReadStream();

        // Buffered rather than streamed to R2 directly, because the bytes are read three times:
        // once for the header, once to decode, and once to store. The size ceiling above is what
        // makes that safe to hold.
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await EntityImageProcessing.PrepareAsync(
            bytes, bytes.Length, cancellationToken);

        if (prepared is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["file"] = [rejection!],
            });
        }

        var logger = loggerFactory.CreateLogger("Lorex.EntityImages");

        var existing = await db.EntityImages
            .FirstOrDefaultAsync(image => image.EntityId == entityId, cancellationToken);

        var supersededOriginal = existing?.OriginalKey;
        var supersededThumbnail = existing?.ThumbnailKey;

        var assetId = Guid.NewGuid();
        var originalKey = EntityImageKeys.Original(universeId, entityId, assetId, prepared.Extension);
        var thumbnailKey = EntityImageKeys.Thumbnail(universeId, entityId, assetId);

        try
        {
            bytes.Position = 0;
            await store.PutAsync(originalKey, bytes, prepared.ContentType, cancellationToken);

            using var thumbnail = new MemoryStream(prepared.Thumbnail, writable: false);
            await store.PutAsync(thumbnailKey, thumbnail, "image/webp", cancellationToken);
        }
        catch (MediaStorageUnavailableException exception)
        {
            return Unavailable(exception);
        }
        catch (Exception)
        {
            // Nothing points at these yet, so removing them is safe and is the only thing that
            // keeps a failed upload from leaving litter in the bucket.
            await SweepAsync(store, logger, cancellationToken, originalKey, thumbnailKey);
            throw;
        }

        var now = DateTime.UtcNow;

        try
        {
            // The association and the version that records it commit together or not at all.
            // A history that had lost the moment the picture changed would be worse than one
            // that never claimed to hold it - see ADR 0013 and ADR 0019.
            await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

            if (existing is null)
            {
                db.EntityImages.Add(new EntityImage
                {
                    EntityId = entityId,
                    AssetId = assetId,
                    OriginalKey = originalKey,
                    ThumbnailKey = thumbnailKey,
                    ContentType = prepared.ContentType,
                    FileName = TrimFileName(file.FileName),
                    Width = prepared.Width,
                    Height = prepared.Height,
                    ByteSize = bytes.Length,
                    UploadedAt = now,
                });
            }
            else
            {
                existing.AssetId = assetId;
                existing.OriginalKey = originalKey;
                existing.ThumbnailKey = thumbnailKey;
                existing.ContentType = prepared.ContentType;
                existing.FileName = TrimFileName(file.FileName);
                existing.Width = prepared.Width;
                existing.Height = prepared.Height;
                existing.ByteSize = bytes.Length;
                existing.UploadedAt = now;
            }

            // The entry's own UpdatedAt is left alone. It says when the lore was last authored,
            // and the image carries its own timestamp - the same reasoning the Trash marker uses.
            await db.SaveChangesAsync(cancellationToken);

            // No snapshot can see this, because a revision holds no image: the objects a past
            // version pointed at are deleted when it is superseded, so a key kept in history
            // would name nothing. The change is recorded rather than copied.
            await EntityRevisions.CaptureAsync(
                db,
                entityId,
                EntityRevisionKind.Edited,
                restoredFromRevisionId: null,
                cancellationToken,
                also: EntityRevisionChange.Image);

            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception)
        {
            // The association never moved, so the old image is still the live one and the new
            // objects are unreferenced. Take them back out.
            await SweepAsync(store, logger, cancellationToken, originalKey, thumbnailKey);
            throw;
        }

        // Past the commit. The new image is the entry's image whatever happens next, so a
        // failure here is litter to be reported, never a reason to undo the write.
        if (supersededOriginal is not null)
        {
            await SweepAsync(store, logger, cancellationToken, supersededOriginal, supersededThumbnail!);
        }

        return Results.Ok(new EntityImageRef(
            assetId,
            prepared.Width,
            prepared.Height,
            prepared.ContentType,
            TrimFileName(file.FileName),
            bytes.Length,
            now));
    }

    // ---------- Remove ----------

    /// <summary>
    /// Clears the association, then cleans the bucket.
    ///
    /// The reverse order of the upload, for the same reason: the database is the thing that says
    /// what exists, so it moves first and the objects follow. An entry with no image is a
    /// correct state; an entry naming two objects that were deliberately deleted is not.
    /// </summary>
    private static async Task<IResult> RemoveAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var image = await db.EntityImages
            .Where(candidate => candidate.EntityId == entityId
                && candidate.Entity!.UniverseId == universeId
                && candidate.Entity.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null)
        {
            // Nothing to remove is the outcome the caller asked for, and saying so with a 404
            // would make "no image" and "no entry" the same answer.
            return Results.NoContent();
        }

        var originalKey = image.OriginalKey;
        var thumbnailKey = image.ThumbnailKey;

        await using (var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken))
        {
            db.EntityImages.Remove(image);
            await db.SaveChangesAsync(cancellationToken);

            await EntityRevisions.CaptureAsync(
                db,
                entityId,
                EntityRevisionKind.Edited,
                restoredFromRevisionId: null,
                cancellationToken,
                also: EntityRevisionChange.Image);

            await transaction.CommitAsync(cancellationToken);
        }

        // Only past the commit, so the objects are removed after the entry has stopped naming
        // them - never the other way round.
        await SweepAsync(
            store,
            loggerFactory.CreateLogger("Lorex.EntityImages"),
            cancellationToken,
            originalKey,
            thumbnailKey);

        return Results.NoContent();
    }

    // ---------- Read ----------

    /// <summary>
    /// Streams one object to its owner.
    ///
    /// The asset id in the route is checked against the association rather than trusted, so an
    /// old asset id stops resolving the moment it is replaced - a URL cannot outlive the row
    /// that authorised it.
    ///
    /// A trashed entry's image is still readable. Trashing hides lore from the ordinary surface;
    /// it does not withdraw the owner's access to what they have not thrown away irrecoverably,
    /// and a Trash that could not show what it holds would be worse at its job.
    /// </summary>
    private static async Task<IResult> ReadAsync(
        Guid universeId,
        Guid entityId,
        Guid assetId,
        string variant,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        if (variant is not (VariantOriginal or VariantThumbnail))
        {
            return Results.NotFound();
        }

        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var image = await db.EntityImages.AsNoTracking()
            .Where(candidate => candidate.EntityId == entityId
                && candidate.AssetId == assetId
                && candidate.Entity!.UniverseId == universeId)
            .Select(candidate => new
            {
                candidate.OriginalKey,
                candidate.ThumbnailKey,
                candidate.ContentType,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null)
        {
            return Results.NotFound();
        }

        var key = variant == VariantOriginal ? image.OriginalKey : image.ThumbnailKey;

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(key, cancellationToken);
        }
        catch (MediaStorageUnavailableException exception)
        {
            return Unavailable(exception);
        }

        if (stored is null)
        {
            // The row names an object the bucket does not hold. Two stores can disagree and this
            // is what that looks like from here: not found, not a server error, and nothing said
            // about which store was missing it.
            return Results.NotFound();
        }

        // Private, and cacheable for a long time because the URL is content-addressed: the asset
        // id is in the path and is never reused, so these bytes cannot change under this URL.
        // `private` keeps the response out of any shared cache, and the service worker refuses
        // everything under /api by construction - ADR 0017 - so it never reaches the app shell
        // cache either.
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        var contentType = variant == VariantOriginal ? image.ContentType : "image/webp";

        return Results.Stream(stored.Content, contentType, enableRangeProcessing: false);
    }

    // ---------- Shared ----------

    /// <summary>
    /// Deletes objects nothing points at any more, and never lets that failure reach the caller.
    ///
    /// Both callers have already decided what the truth is - either the write did not happen and
    /// these are litter, or it did and the old pair is litter. Either way the request succeeded.
    /// A key that will not delete is logged with its key and left; there is no retry queue,
    /// because at one image per entry the cost of an orphan is a few hundred kilobytes and the
    /// cost of a queue is a subsystem.
    /// </summary>
    private static async Task SweepAsync(
        IMediaObjectStore store,
        ILogger logger,
        CancellationToken cancellationToken,
        params string[] keys)
    {
        foreach (var key in keys)
        {
            try
            {
                // Deliberately not the request's token: cleanup after a commit must not be
                // abandoned because the client hung up.
                await store.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception exception)
            {
                LogOrphanedObject(logger, key, exception);
            }
        }
    }

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Orphaned media object left behind at '{ObjectKey}'. Nothing references it and it is safe to delete.")]
    private static partial void LogOrphanedObject(ILogger logger, string objectKey, Exception exception);

    private static IResult Unavailable(MediaStorageUnavailableException exception) =>
        Results.Problem(
            title: "Image storage is unavailable.",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);

    /// <summary>The author's own filename, kept only as a label and never used to build a key.</summary>
    private static string? TrimFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        var name = Path.GetFileName(fileName.Trim());

        return name.Length switch
        {
            0 => null,
            > EntityImageLimits.FileNameMaxLength => name[..EntityImageLimits.FileNameMaxLength],
            _ => name,
        };
    }
}
