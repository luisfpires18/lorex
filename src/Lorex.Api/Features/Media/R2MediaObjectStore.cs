using System.Net;
using Amazon.S3;
using Amazon.S3.Model;

namespace Lorex.Api.Features.Media;

/// <summary>
/// Cloudflare R2, over its S3-compatible API.
///
/// R2 is not S3 and the three places it differs are all settled in <see cref="MediaSetup"/>,
/// not here: the endpoint is the account's own, addressing is path-style, and the region is the
/// literal string <c>auto</c>. What is left is three calls.
///
/// The bucket is private. Nothing in this class makes an object public, sets an ACL, or hands
/// out a URL that points at Cloudflare - reads go through Lorex's own authenticated route, so
/// the credentials and the endpoint never leave the server. See ADR 0019.
/// </summary>
public sealed class R2MediaObjectStore(IAmazonS3 client, string bucket) : IMediaObjectStore
{
    public async Task PutAsync(
        string key,
        Stream content,
        string contentType,
        CancellationToken cancellationToken)
    {
        await client.PutObjectAsync(
            new PutObjectRequest
            {
                BucketName = bucket,
                Key = key,
                InputStream = content,
                ContentType = contentType,

                // Nothing is inferred from the key's extension. The content type was decided by
                // decoding the bytes, and this is the only thing that should be able to set it.
                AutoCloseStream = false,
            },
            cancellationToken);
    }

    public async Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            var response = await client.GetObjectAsync(bucket, key, cancellationToken);
            return new StoredMediaObject(
                response.ResponseStream,
                response.Headers.ContentType ?? "application/octet-stream",
                response.ContentLength);
        }
        catch (AmazonS3Exception exception) when (IsMissing(exception))
        {
            // A key the database still names but the bucket no longer holds. That is a gap
            // between two stores, not a server fault, and the caller answers 404 for it.
            return null;
        }
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            await client.DeleteObjectAsync(bucket, key, cancellationToken);
        }
        catch (AmazonS3Exception exception) when (IsMissing(exception))
        {
            // Deleting what is not there is the outcome the caller wanted. S3 itself answers
            // 204 for this; R2 is not required to, so it is absorbed rather than assumed.
        }
    }

    private static bool IsMissing(AmazonS3Exception exception) =>
        exception.StatusCode is HttpStatusCode.NotFound
        || string.Equals(exception.ErrorCode, "NoSuchKey", StringComparison.Ordinal)
        || string.Equals(exception.ErrorCode, "NoSuchBucket", StringComparison.Ordinal);
}
