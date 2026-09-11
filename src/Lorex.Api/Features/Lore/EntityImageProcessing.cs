using System.Globalization;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Lorex.Api.Features.Lore;

/// <summary>What passed validation, and everything the write path needs from the bytes.</summary>
/// <param name="Width">Displayed width - after orientation, see <see cref="EntityImageProcessing"/>.</param>
/// <param name="Height">Displayed height.</param>
/// <param name="Framing">How the thumbnail was made.</param>
/// <param name="Crop">
/// The square actually cut, as fractions. Always set for a cropped thumbnail, even when none was
/// asked for; never set for a fitted one, which cuts nothing.
/// </param>
internal sealed record PreparedEntityImage(
    string ContentType,
    string Extension,
    int Width,
    int Height,
    EntityImageFraming Framing,
    EntityImageCrop? Crop,
    byte[] Thumbnail);

/// <summary>Why an image was not accepted, and which part of the request to blame.</summary>
internal sealed record EntityImageRejection(string Field, string Message);

/// <summary>A crop, placed on pixels: a square, inside the image, in whole pixels.</summary>
internal readonly record struct CropSquare(int Left, int Top, int Side);

/// <summary>
/// The upload gate: what Lorex will accept as an entry's picture, and the thumbnail it makes
/// from it.
///
/// Nothing here trusts the request. The filename is a label, the browser's content type is a
/// claim, and both are ignored - the format is whatever the bytes decode as, and an upload
/// whose bytes are not one of the three accepted formats is refused however it was named. The
/// crop is a request too: the browser says which square it wants, and the thumbnail is still
/// cut here, from the original, never accepted ready-made.
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
    public const string FileField = "file";

    public const string CropField = "crop";

    public const string FramingField = "framing";

    /// <summary>The refusal for a framing that is neither of the two there are.</summary>
    public const string UnknownFraming =
        "Choose how the thumbnail is framed: crop a square, or fit the whole picture.";

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

    /// <summary>
    /// How far a fraction may overshoot the edge of the image and still count as the edge. It
    /// absorbs floating-point noise in a crop computed by a browser, and nothing larger: a crop
    /// that genuinely runs off the picture is refused.
    /// </summary>
    private const double EdgeTolerance = 1e-6;

    private static readonly Dictionary<string, string> AcceptedFormats = new(StringComparer.Ordinal)
    {
        [JpegFormat.Instance.Name] = "jpg",
        [PngFormat.Instance.Name] = "png",
        [WebpFormat.Instance.Name] = "webp",
    };

    /// <summary>
    /// Deterministic by construction: a fixed sampler, a fixed encoder and a size derived only
    /// from the square being cut, or the picture being fitted, so the same original and the same
    /// framing always produce the same thumbnail bytes - which is what lets an importer regenerate
    /// one rather than carry it. A fitted thumbnail's transparent margin is kept as an alpha plane.
    /// </summary>
    private static readonly WebpEncoder ThumbnailEncoder = new()
    {
        Quality = 80,
        FileFormat = WebpFileFormatType.Lossy,
        SkipMetadata = true,
    };

    /// <summary>
    /// A crop's own shape, checked before a byte of the image is read: four finite fractions
    /// describing a non-empty rectangle that stays inside the picture. Whether it is square can
    /// only be decided against the picture's pixels, and <see cref="Place"/> does that.
    /// </summary>
    public static string? CheckCrop(EntityImageCrop crop)
    {
        if (!double.IsFinite(crop.X) || !double.IsFinite(crop.Y)
            || !double.IsFinite(crop.Width) || !double.IsFinite(crop.Height))
        {
            return "The thumbnail selection must be four numbers.";
        }

        if (crop.Width <= 0 || crop.Height <= 0)
        {
            return "The thumbnail selection must have a size.";
        }

        if (crop.X < -EdgeTolerance || crop.Y < -EdgeTolerance
            || crop.X + crop.Width > 1 + EdgeTolerance
            || crop.Y + crop.Height > 1 + EdgeTolerance)
        {
            return "The thumbnail selection must lie inside the image.";
        }

        return null;
    }

    /// <summary>
    /// Reads the framing a request names: its number, as the JSON contract writes it, or its name.
    /// Nothing at all means <see cref="EntityImageFraming.Crop"/>, which is what every request
    /// meant before there was a choice.
    /// </summary>
    public static bool TryReadFraming(string? value, out EntityImageFraming framing)
    {
        framing = EntityImageFraming.Crop;

        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var text = value.Trim();

        if (int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var number))
        {
            framing = (EntityImageFraming)number;
            return Enum.IsDefined(framing);
        }

        foreach (var candidate in Enum.GetValues<EntityImageFraming>())
        {
            if (string.Equals(candidate.ToString(), text, StringComparison.OrdinalIgnoreCase))
            {
                framing = candidate;
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Validates the upload and produces its thumbnail, or says in one sentence why it will not
    /// be stored. The sentence is shown to the author, so it says what to do about it.
    ///
    /// <paramref name="framing"/> decides what the thumbnail is. For
    /// <see cref="EntityImageFraming.Crop"/>, <paramref name="crop"/> is the square the author chose;
    /// without one the thumbnail is the centred square, and the crop that describes it is returned
    /// anyway, so every cropped picture stored from here on records its framing. For
    /// <see cref="EntityImageFraming.Fit"/> the whole picture is kept, so there is no square to
    /// choose and <paramref name="crop"/> is not read at all.
    /// </summary>
    public static async Task<(PreparedEntityImage? Image, EntityImageRejection? Rejection)> PrepareAsync(
        Stream upload,
        long byteLength,
        EntityImageFraming framing,
        EntityImageCrop? crop,
        CancellationToken cancellationToken)
    {
        if (byteLength <= 0)
        {
            return Refuse(FileField, "That file is empty.");
        }

        if (byteLength > MaxUploadBytes)
        {
            return Refuse(FileField, $"Images must be {MaxUploadBytes / (1024 * 1024)} MB or smaller.");
        }

        if (!Enum.IsDefined(framing))
        {
            return Refuse(FramingField, UnknownFraming);
        }

        if (framing == EntityImageFraming.Fit)
        {
            crop = null;
        }

        if (crop is not null && CheckCrop(crop) is { } badCrop)
        {
            return Refuse(CropField, badCrop);
        }

        ImageInfo info;
        try
        {
            info = await Image.IdentifyAsync(upload, cancellationToken);
        }
        catch (Exception exception) when (exception is UnknownImageFormatException or InvalidImageContentException)
        {
            return Refuse(FileField, "That file is not an image Lorex can read. Use a JPEG, PNG or WebP.");
        }

        var format = info.Metadata.DecodedImageFormat;

        if (format is null || !AcceptedFormats.TryGetValue(format.Name, out var extension))
        {
            return Refuse(FileField, "Images must be a JPEG, PNG or WebP.");
        }

        if (info.Width <= 0 || info.Height <= 0)
        {
            return Refuse(FileField, "That image has no size Lorex can use.");
        }

        // Both limits are symmetric, so they hold whichever way round the picture is displayed.
        if (info.Width > MaxSide || info.Height > MaxSide)
        {
            return Refuse(FileField, $"Images must be {MaxSide} pixels or smaller on each side.");
        }

        if ((long)info.Width * info.Height > MaxPixels)
        {
            return Refuse(FileField, $"That image is too large to process - {MaxPixels / 1_000_000} megapixels is the limit.");
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
            return Refuse(FileField, "That image could not be read. It may be incomplete or damaged.");
        }

        using (decoded)
        {
            if (HonoursOrientation(format))
            {
                // Before anything is measured, cropped or stripped: a phone photo carries its
                // rotation in EXIF, the author framed it the right way up, and the fractions they
                // sent are fractions of that upright picture.
                decoded.Mutate(context => context.AutoOrient());
            }

            // Measured now, because rendering the thumbnail cuts this same image down in place.
            var width = decoded.Width;
            var height = decoded.Height;

            if (framing == EntityImageFraming.Fit)
            {
                var fitted = await RenderFittedThumbnailAsync(decoded, cancellationToken);

                return (
                    new PreparedEntityImage(
                        format.DefaultMimeType,
                        extension,
                        width,
                        height,
                        EntityImageFraming.Fit,
                        null,
                        fitted),
                    null);
            }

            var (square, rejection) = Place(crop, width, height);

            if (rejection is not null)
            {
                return Refuse(CropField, rejection);
            }

            var thumbnail = await RenderThumbnailAsync(decoded, square, cancellationToken);

            return (
                new PreparedEntityImage(
                    format.DefaultMimeType,
                    extension,
                    width,
                    height,
                    EntityImageFraming.Crop,
                    Describe(square, width, height),
                    thumbnail),
                null);
        }
    }

    /// <summary>
    /// Whether a format's EXIF orientation is applied - decided by what browsers draw, because the
    /// author frames the picture the browser shows them and the thumbnail has to be that square.
    ///
    /// Chromium rotates a JPEG and a PNG by their orientation tag and draws a WebP exactly as its
    /// pixels are stored, tag or no tag; that was checked against a browser rather than assumed.
    /// ImageSharp would rotate all three, so a WebP carrying a tag would otherwise come out turned
    /// sideways against what its author framed.
    /// </summary>
    private static bool HonoursOrientation(IImageFormat format) =>
        !string.Equals(format.Name, WebpFormat.Instance.Name, StringComparison.Ordinal);

    /// <summary>
    /// Puts a crop on whole pixels of a picture <paramref name="width"/> by <paramref name="height"/>.
    ///
    /// Each edge is rounded to the nearest pixel on its own, so a crop that was computed from
    /// whole pixels - as the cropper's is, and as a stored one is - lands back on exactly those
    /// pixels. A crop that is square to within a pixel, or one percent, is squared by trimming the
    /// longer side evenly; anything further from square is refused rather than stretched.
    ///
    /// No crop means the largest centred square, which is what every thumbnail was before an
    /// author could choose.
    /// </summary>
    internal static (CropSquare Square, string? Rejection) Place(EntityImageCrop? crop, int width, int height)
    {
        if (crop is null)
        {
            var edge = Math.Min(width, height);
            return (new CropSquare((width - edge) / 2, (height - edge) / 2, edge), null);
        }

        var left = Math.Clamp(Pixel(crop.X * width), 0, width);
        var top = Math.Clamp(Pixel(crop.Y * height), 0, height);
        var right = Math.Clamp(Pixel((crop.X + crop.Width) * width), 0, width);
        var bottom = Math.Clamp(Pixel((crop.Y + crop.Height) * height), 0, height);

        var across = right - left;
        var down = bottom - top;

        if (across < 1 || down < 1)
        {
            return (default, "The thumbnail selection is smaller than a pixel.");
        }

        var slack = Math.Max(1, (int)Math.Ceiling(Math.Max(across, down) * 0.01));

        if (Math.Abs(across - down) > slack)
        {
            return (default, "The thumbnail selection must be square.");
        }

        var side = Math.Min(across, down);

        return (new CropSquare(left + (across - side) / 2, top + (down - side) / 2, side), null);
    }

    /// <summary>The square that was cut, back as fractions - the form it is stored and exported in.</summary>
    private static EntityImageCrop Describe(CropSquare square, int width, int height) =>
        new(
            (double)square.Left / width,
            (double)square.Top / height,
            (double)square.Side / width,
            (double)square.Side / height);

    private static int Pixel(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);

    /// <summary>
    /// The chosen square, cut from the upright original and scaled to the portrait size.
    ///
    /// Cut first, then scale, and nothing else: the square is already square, so scaling it
    /// cannot stretch it, and nothing outside it can leak in at the edges.
    ///
    /// It never enlarges. A square already smaller than the target is kept at its own resolution,
    /// because upscaling would store more bytes to show the same detail blurrier.
    /// </summary>
    private static async Task<byte[]> RenderThumbnailAsync(
        Image image,
        CropSquare square,
        CancellationToken cancellationToken)
    {
        var edge = Math.Min(ThumbnailSize, square.Side);

        image.Mutate(context =>
        {
            context.Crop(new Rectangle(square.Left, square.Top, square.Side, square.Side));

            if (edge != square.Side)
            {
                context.Resize(new ResizeOptions
                {
                    Size = new Size(edge, edge),
                    Mode = ResizeMode.Stretch,
                    Sampler = KnownResamplers.Lanczos3,
                });
            }
        });

        return await EncodeAsync(image, cancellationToken);
    }

    /// <summary>
    /// The whole upright original, scaled to fit inside the portrait square and centred on it.
    ///
    /// The longer side meets the square's edge and the shorter one keeps the picture's own
    /// proportion, rounded to the nearest pixel - so nothing is cut off and nothing is stretched.
    /// The rest of the square is left transparent rather than painted: a card draws the thumbnail
    /// on its own surface, so the empty part takes whatever colour that surface is, in a light or a
    /// dark scheme alike, where a baked-in colour would be right in at most one of them.
    ///
    /// It never enlarges, by the same rule as a cropped thumbnail. The square is the target size, or
    /// the picture's longer side when that is smaller, and the picture is then drawn at its own
    /// resolution.
    ///
    /// Deterministic for the same reason the cropped one is: the size and the offset are derived only
    /// from the picture's dimensions, and the sampler and encoder are fixed.
    /// </summary>
    private static async Task<byte[]> RenderFittedThumbnailAsync(Image image, CancellationToken cancellationToken)
    {
        var edge = Math.Min(ThumbnailSize, Math.Max(image.Width, image.Height));
        var (width, height) = FitInside(image.Width, image.Height, edge);

        if (width != image.Width || height != image.Height)
        {
            image.Mutate(context => context.Resize(new ResizeOptions
            {
                // Stretch only in name: the size was worked out to keep the proportion already.
                Size = new Size(width, height),
                Mode = ResizeMode.Stretch,
                Sampler = KnownResamplers.Lanczos3,
            }));
        }

        // A new image starts fully transparent, and it has never had metadata to strip.
        using var square = new Image<Rgba32>(edge, edge);
        square.Mutate(context => context.DrawImage(image, new Point((edge - width) / 2, (edge - height) / 2), 1f));

        return await EncodeAsync(square, cancellationToken);
    }

    /// <summary>
    /// The size a <paramref name="width"/> by <paramref name="height"/> picture is drawn at to fit a
    /// square of <paramref name="edge"/>: the longer side becomes the edge, the shorter one is
    /// scaled by the same factor and rounded, and neither is ever less than a pixel.
    /// </summary>
    internal static (int Width, int Height) FitInside(int width, int height, int edge) =>
        width >= height
            ? (edge, Math.Max(1, Pixel((double)height * edge / width)))
            : (Math.Max(1, Pixel((double)width * edge / height)), edge);

    private static async Task<byte[]> EncodeAsync(Image image, CancellationToken cancellationToken)
    {
        // The thumbnail is a derived preview, so it carries nothing the original said about
        // itself - no EXIF, no camera, and in particular no GPS coordinates.
        image.Metadata.ExifProfile = null;
        image.Metadata.IptcProfile = null;
        image.Metadata.XmpProfile = null;

        using var buffer = new MemoryStream();
        await image.SaveAsync(buffer, ThumbnailEncoder, cancellationToken);
        return buffer.ToArray();
    }

    private static (PreparedEntityImage? Image, EntityImageRejection? Rejection) Refuse(string field, string message) =>
        (null, new EntityImageRejection(field, message));
}
