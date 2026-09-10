using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace Lorex.Api.Features.Lore;

/// <summary>What passed validation, and everything the write path needs from the bytes.</summary>
internal sealed record PreparedEntityImage(
    string ContentType,
    string Extension,
    int Width,
    int Height,
    byte[] Thumbnail);

/// <summary>
/// The upload gate: what Lorex will accept as an entry's picture, and the thumbnail it makes
/// from it.
///
/// Nothing here trusts the request. The filename is a label, the browser's content type is a
/// claim, and both are ignored - the format is whatever the bytes decode as, and an upload
/// whose bytes are not one of the three accepted formats is refused however it was named.
///
/// SVG is refused outright, deliberately. It is a document format with scripting and external
/// references in it, not a picture, and making one safe means writing and maintaining a
/// sanitiser - a project of its own with a long history of bypasses. It also has no pixels to
/// resample, so the thumbnail path could not treat it like the others anyway. Refusing it is
/// one line; sanitising it would be a phase.
///
/// The size checks run in the right order to matter. The byte length is checked first, then the
/// header is read for the dimensions, and only an image that passed both is fully decoded - so
/// a small file claiming to be 60,000 pixels square is refused before anything tries to
/// allocate it.
/// </summary>
internal static class EntityImageProcessing
{
    /// <summary>Largest upload accepted. One picture on one entry does not need more.</summary>
    public const long MaxUploadBytes = 8L * 1024 * 1024;

    /// <summary>Longest side accepted, before any pixel is decoded.</summary>
    public const int MaxSide = 10_000;

    /// <summary>
    /// Total pixel ceiling, which is the check that actually stops a decompression bomb: a file
    /// of a few kilobytes can describe an image whose decoded form would take gigabytes, and
    /// only the pixel count sees that coming.
    /// </summary>
    public const long MaxPixels = 24_000_000;

    /// <summary>
    /// Square edge of the generated thumbnail. The lore grid lays cards out at a 17.5rem
    /// minimum, so the portrait on one is drawn at well under half this - which leaves room
    /// for a high-density screen and for the card portrait to grow, without storing a second
    /// near-full-size copy of every image.
    /// </summary>
    public const int ThumbnailSize = 320;

    private static readonly Dictionary<string, string> AcceptedFormats = new(StringComparer.Ordinal)
    {
        [JpegFormat.Instance.Name] = "jpg",
        [PngFormat.Instance.Name] = "png",
        [WebpFormat.Instance.Name] = "webp",
    };

    /// <summary>
    /// Deterministic by construction: a fixed sampler, a fixed encoder and a size derived only
    /// from the source dimensions, so the same upload always produces the same thumbnail bytes.
    /// </summary>
    private static readonly WebpEncoder ThumbnailEncoder = new()
    {
        Quality = 80,
        FileFormat = WebpFileFormatType.Lossy,
        SkipMetadata = true,
    };

    /// <summary>
    /// Validates the upload and produces its thumbnail, or says in one sentence why it will not
    /// be stored. The sentence is shown to the author, so it says what to do about it.
    /// </summary>
    public static async Task<(PreparedEntityImage? Image, string? Rejection)> PrepareAsync(
        Stream upload,
        long byteLength,
        CancellationToken cancellationToken)
    {
        if (byteLength <= 0)
        {
            return (null, "That file is empty.");
        }

        if (byteLength > MaxUploadBytes)
        {
            return (null, $"Images must be {MaxUploadBytes / (1024 * 1024)} MB or smaller.");
        }

        ImageInfo info;
        try
        {
            info = await Image.IdentifyAsync(upload, cancellationToken);
        }
        catch (Exception exception) when (exception is UnknownImageFormatException or InvalidImageContentException)
        {
            return (null, "That file is not an image Lorex can read. Use a JPEG, PNG or WebP.");
        }

        var format = info.Metadata.DecodedImageFormat;

        if (format is null || !AcceptedFormats.TryGetValue(format.Name, out var extension))
        {
            return (null, "Images must be a JPEG, PNG or WebP.");
        }

        if (info.Width <= 0 || info.Height <= 0)
        {
            return (null, "That image has no size Lorex can use.");
        }

        if (info.Width > MaxSide || info.Height > MaxSide)
        {
            return (null, $"Images must be {MaxSide} pixels or smaller on each side.");
        }

        if ((long)info.Width * info.Height > MaxPixels)
        {
            return (null, $"That image is too large to process - {MaxPixels / 1_000_000} megapixels is the limit.");
        }

        upload.Position = 0;

        Image decoded;
        try
        {
            // One frame. An animated WebP is accepted as a picture, not as an animation, and
            // decoding only the first frame is also what stops a many-thousand-frame file from
            // multiplying the pixel ceiling that was just checked against a single frame.
            decoded = await Image.LoadAsync(
                new DecoderOptions { MaxFrames = 1 },
                upload,
                cancellationToken);
        }
        catch (Exception exception) when (exception is UnknownImageFormatException
            or InvalidImageContentException
            or ImageFormatException)
        {
            // Identify reads a header; this reads the whole file. A truncated or corrupt image
            // gets that far and no further, and it is still the author's file that is wrong.
            return (null, "That image could not be read. It may be incomplete or damaged.");
        }

        using (decoded)
        {
            var thumbnail = await RenderThumbnailAsync(decoded, cancellationToken);

            return (
                new PreparedEntityImage(
                    format.DefaultMimeType,
                    extension,
                    info.Width,
                    info.Height,
                    thumbnail),
                null);
        }
    }

    /// <summary>
    /// A square portrait, cropped from the middle.
    ///
    /// Crop rather than fit: a card portrait is a fixed square slot, and letterboxing every
    /// non-square image into it would put grey bars on the busiest screen in the product. The
    /// centre is the only defensible anchor without asking the author where to look.
    ///
    /// It never enlarges. An image already smaller than the target is cropped square at its own
    /// resolution instead, because upscaling would store more bytes to show the same detail
    /// blurrier.
    /// </summary>
    private static async Task<byte[]> RenderThumbnailAsync(Image image, CancellationToken cancellationToken)
    {
        var edge = Math.Min(ThumbnailSize, Math.Min(image.Width, image.Height));

        image.Mutate(context => context
            // Before anything is resampled or stripped: a phone photo carries its rotation in
            // EXIF, and dropping that tag without applying it would turn every portrait sideways.
            .AutoOrient()
            .Resize(new ResizeOptions
            {
                Size = new Size(edge, edge),
                Mode = ResizeMode.Crop,
                Position = AnchorPositionMode.Center,
                Sampler = KnownResamplers.Lanczos3,
            }));

        // The thumbnail is a derived preview, so it carries nothing the original said about
        // itself - no EXIF, no camera, and in particular no GPS coordinates.
        image.Metadata.ExifProfile = null;
        image.Metadata.IptcProfile = null;
        image.Metadata.XmpProfile = null;

        using var buffer = new MemoryStream();
        await image.SaveAsync(buffer, ThumbnailEncoder, cancellationToken);
        return buffer.ToArray();
    }
}
