namespace Lorex.Api.Features.Media;

/// <summary>
/// One object read back out of the store. The caller owns <see cref="Content"/> and disposes it.
/// </summary>
public sealed record StoredMediaObject(Stream Content, string ContentType, long Length) : IAsyncDisposable
{
    public ValueTask DisposeAsync() => Content.DisposeAsync();
}

/// <summary>
/// The object store, as narrowly as Lorex actually needs it: put one object, read one object,
/// delete one object.
///
/// Deliberately not a cloud-storage framework. There is no bucket management, no listing, no
/// copy, no multipart upload and no lifecycle policy here, because nothing in the product wants
/// any of it - a lore entry has one primary image and that is the whole requirement. The
/// interface exists so tests never reach Cloudflare, not so a second provider could be slotted
/// in one day.
///
/// Keys are opaque to this interface. The convention that produces them lives with the feature
/// that owns the objects, in <c>Features/Lore/EntityImageKeys.cs</c>.
/// </summary>
public interface IMediaObjectStore
{
    /// <summary>Writes one object, replacing anything already at <paramref name="key"/>.</summary>
    Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken);

    /// <summary>The object, or null when there is nothing at that key. A miss is not an error.</summary>
    Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken);

    /// <summary>Removes one object. Idempotent: deleting nothing succeeds.</summary>
    Task DeleteAsync(string key, CancellationToken cancellationToken);
}

/// <summary>
/// Thrown when a request needs object storage and none is configured. The endpoints turn it
/// into a 503 that says so, rather than a 500 that says nothing.
/// </summary>
public sealed class MediaStorageUnavailableException(string message) : InvalidOperationException(message);

/// <summary>
/// What is registered when no provider is configured. Every call fails the same way, loudly and
/// immediately, so a deployment missing its R2 settings cannot look like a deployment whose
/// images have simply gone missing.
/// </summary>
public sealed class UnavailableMediaObjectStore : IMediaObjectStore
{
    private const string Message = "Image storage is not configured.";

    public Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken) =>
        throw new MediaStorageUnavailableException(Message);

    public Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken) =>
        throw new MediaStorageUnavailableException(Message);

    public Task DeleteAsync(string key, CancellationToken cancellationToken) =>
        throw new MediaStorageUnavailableException(Message);
}
