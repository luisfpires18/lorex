using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Lorex.Api.Tests;

/// <summary>
/// An entry's one primary image: what Lorex will store, who may touch it, and what the two
/// stores are allowed to disagree about.
///
/// Six claims carry this file. An owner - and only an owner - can set, read and remove the
/// image on their own entry. What is stored is an image, proved by decoding it and not by what
/// the request called it. The object keys say what they are supposed to say, in ids and nothing
/// else. A replacement never destroys the working image before the new one is the entry's
/// image, and it never leaves the database naming objects that were deliberately deleted. The
/// Trash keeps an image and a restore brings it back. And nothing about Cloudflare - a bucket,
/// an endpoint, a key - reaches a response.
///
/// No test here touches Cloudflare. The host runs against <see cref="TestMediaObjectStore"/>,
/// which is a real implementation of the same contract, so the ordering being asserted is the
/// ordering R2 would see.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class EntityImageTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Uploading ----------

    [Fact]
    public async Task An_owner_uploads_an_image_and_it_becomes_the_entrys_own()
    {
        var (client, universe, type) = await World("imgup");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(client, universe.Id, entry.Id, Png(900, 600), "portrait.png");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stored = (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;

        Assert.NotEqual(Guid.Empty, stored.AssetId);
        Assert.Equal(900, stored.Width);
        Assert.Equal(600, stored.Height);
        Assert.Equal("image/png", stored.ContentType);
        Assert.Equal("portrait.png", stored.FileName);
        Assert.True(stored.ByteSize > 0);

        // The entry now carries it, on the page and on the card, without a second request.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(stored.AssetId, detail.Image!.AssetId);

        var card = Assert.Single((await Page(client, universe.Id)).Items, item => item.Id == entry.Id);
        Assert.Equal(stored.AssetId, card.Image!.AssetId);
    }

    [Fact]
    public async Task Both_objects_are_stored_and_the_association_is_persisted()
    {
        var (client, universe, type) = await World("imgpair");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(900, 600), "portrait.png");

        var originalKey = Key(universe.Id, entry.Id, stored.AssetId, "original.png");
        var thumbnailKey = Key(universe.Id, entry.Id, stored.AssetId, "thumbnail.webp");

        Assert.True(_factory.Media.Contains(originalKey));
        Assert.True(_factory.Media.Contains(thumbnailKey));

        // The original is the bytes that were uploaded, untouched.
        Assert.Equal("image/png", _factory.Media.ContentType(originalKey));

        // The thumbnail is a square WebP that was never enlarged past the target.
        Assert.Equal("image/webp", _factory.Media.ContentType(thumbnailKey));
        using var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(thumbnailKey));
        Assert.Equal(320, thumbnail.Width);
        Assert.Equal(320, thumbnail.Height);

        // And the row says exactly which objects those are.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        var row = await db.EntityImages.AsNoTracking()
            .SingleAsync(image => image.EntityId == entry.Id);

        Assert.Equal(stored.AssetId, row.AssetId);
        Assert.Equal(originalKey, row.OriginalKey);
        Assert.Equal(thumbnailKey, row.ThumbnailKey);
        Assert.Equal(900, row.Width);
        Assert.Equal(600, row.Height);
    }

    [Fact]
    public async Task Object_keys_carry_ids_and_nothing_an_author_wrote()
    {
        var (client, universe, type) = await World("imgkeys");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance of Tidewatch");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "Alenna Vance.png");

        var keys = _factory.Media.Keys
            .Where(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal))
            .ToList();

        Assert.Equal(2, keys.Count);

        var prefix = $"universes/{universe.Id:D}/entities/{entry.Id:D}/primary/{stored.AssetId:D}";
        Assert.Contains($"{prefix}/original.png", keys);
        Assert.Contains($"{prefix}/thumbnail.webp", keys);

        // Not the world's name, not the entry's, not the author's, and not the filename.
        foreach (var key in keys)
        {
            Assert.DoesNotContain("Alenna", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Tidewatch", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("imgkeys", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("example.test", key, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task A_tiny_image_is_cropped_square_and_never_enlarged()
    {
        var (client, universe, type) = await World("imgtiny");
        var entry = await Entry(client, universe.Id, type, "Sigil");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(120, 80), "sigil.png");

        using var thumbnail = Image.Load<Rgba32>(
            _factory.Media.Bytes(Key(universe.Id, entry.Id, stored.AssetId, "thumbnail.webp")));

        // The shorter side, not the 320 target: storing more bytes to show the same detail
        // blurrier is not an improvement.
        Assert.Equal(80, thumbnail.Width);
        Assert.Equal(80, thumbnail.Height);
    }

    // ---------- What is refused ----------

    [Theory]
    [InlineData("notes.txt", "text/plain")]
    [InlineData("portrait.png", "image/png")]
    public async Task A_file_that_is_not_an_image_is_refused_however_it_is_named(
        string fileName,
        string contentType)
    {
        var (client, universe, type) = await World($"imgnot{fileName.Length}");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(
            client,
            universe.Id,
            entry.Id,
            Encoding.UTF8.GetBytes("This is not a picture, whatever the request called it."),
            fileName,
            contentType);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
        Assert.DoesNotContain(
            _factory.Media.Keys,
            key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal));
    }

    [Fact]
    public async Task An_svg_is_refused()
    {
        var (client, universe, type) = await World("imgsvg");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var svg = Encoding.UTF8.GetBytes(
            """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>""");

        var response = await Upload(client, universe.Id, entry.Id, svg, "portrait.svg", "image/svg+xml");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_image_in_an_unaccepted_format_is_refused()
    {
        var (client, universe, type) = await World("imggif");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A real, decodable image - just not one of the three Lorex stores.
        using var source = new Image<Rgba32>(64, 64);
        using var buffer = new MemoryStream();
        source.SaveAsGif(buffer);

        var response = await Upload(client, universe.Id, entry.Id, buffer.ToArray(), "portrait.gif", "image/gif");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("JPEG", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_oversized_upload_is_refused()
    {
        var (client, universe, type) = await World("imgbig");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(
            client,
            universe.Id,
            entry.Id,
            new byte[EntityImageProcessing.MaxUploadBytes + 1],
            "portrait.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_image_with_too_many_pixels_is_refused_before_it_is_decoded()
    {
        var (client, universe, type) = await World("imgbomb");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A few hundred bytes on the wire, declaring 81 megapixels. Nothing may try to allocate
        // that in order to find out it is too big - this is the whole decompression-bomb case,
        // and it is why the header is read before the pixels.
        var response = await Upload(
            client, universe.Id, entry.Id, PngClaiming(9000, 9000), "bomb.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_image_larger_than_the_side_limit_is_refused()
    {
        var (client, universe, type) = await World("imgwide");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(
            client, universe.Id, entry.Id, Png(EntityImageProcessing.MaxSide + 1, 4), "banner.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_empty_file_is_refused()
    {
        var (client, universe, type) = await World("imgzero");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(client, universe.Id, entry.Id, [], "portrait.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task A_truncated_image_is_refused()
    {
        var (client, universe, type) = await World("imgcut");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A valid header over a body that stops halfway. It gets past Identify and dies in the
        // decoder, which is a different branch and still the author's file that is wrong.
        var whole = Png(600, 600);
        var response = await Upload(client, universe.Id, entry.Id, whole[..(whole.Length / 2)], "portrait.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    // ---------- Reading ----------

    [Fact]
    public async Task An_owner_reads_both_variants_and_the_response_is_private()
    {
        var (client, universe, type) = await World("imgread");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(900, 600), "portrait.png");

        var original = await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"));
        Assert.Equal(HttpStatusCode.OK, original.StatusCode);
        Assert.Equal("image/png", original.Content.Headers.ContentType!.MediaType);
        Assert.NotEmpty(await original.Content.ReadAsByteArrayAsync());

        var thumbnail = await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "thumbnail"));
        Assert.Equal(HttpStatusCode.OK, thumbnail.StatusCode);
        Assert.Equal("image/webp", thumbnail.Content.Headers.ContentType!.MediaType);

        // Private, never shared, and never public: a proxy or a shared cache must not keep one
        // author's picture. The service worker refuses everything under /api by construction
        // (ADR 0017), and this route is under /api, so it is out of the app-shell cache too.
        var cache = original.Headers.CacheControl!;
        Assert.True(cache.Private);
        Assert.False(cache.Public);
        Assert.StartsWith("/api/", ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unknown_variant_or_asset_is_not_found()
    {
        var (client, universe, type) = await World("imgvar");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "full"))).StatusCode);

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, Guid.NewGuid(), "original"))).StatusCode);
    }

    [Fact]
    public async Task An_object_the_bucket_no_longer_holds_answers_not_found()
    {
        var (client, universe, type) = await World("imggone");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        // The row still names it; the bucket has lost it. Two stores disagreeing is not a server
        // fault, and it must not become a 500.
        _factory.Media.Evict(Key(universe.Id, entry.Id, stored.AssetId, "original.png"));

        var response = await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // The thumbnail is a separate object and is still there.
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "thumbnail"))).StatusCode);
    }

    // ---------- Replacing ----------

    [Fact]
    public async Task A_replacement_mints_a_new_asset_switches_to_it_and_sweeps_the_old_pair()
    {
        var (client, universe, type) = await World("imgswap");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var first = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");
        var second = await Uploaded(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg");

        // A new identity, never the old one written over.
        Assert.NotEqual(first.AssetId, second.AssetId);
        Assert.Equal("image/jpeg", second.ContentType);

        // The entry points at the new pair.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(second.AssetId, detail.Image!.AssetId);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        var row = await db.EntityImages.AsNoTracking().SingleAsync(image => image.EntityId == entry.Id);
        Assert.Equal(Key(universe.Id, entry.Id, second.AssetId, "original.jpg"), row.OriginalKey);
        Assert.Equal(Key(universe.Id, entry.Id, second.AssetId, "thumbnail.webp"), row.ThumbnailKey);

        // And the pair it replaced is gone from the bucket.
        Assert.False(_factory.Media.Contains(Key(universe.Id, entry.Id, first.AssetId, "original.png")));
        Assert.False(_factory.Media.Contains(Key(universe.Id, entry.Id, first.AssetId, "thumbnail.webp")));

        // A URL for the replaced asset stops resolving, so nothing can serve the old picture.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, first.AssetId, "original"))).StatusCode);
    }

    [Fact]
    public async Task A_failed_replacement_leaves_the_working_image_active_and_cleans_up_after_itself()
    {
        var (client, universe, type) = await World("imgfail");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var first = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");

        // The original lands and the thumbnail does not: the half-finished upload, which is the
        // case the whole ordering exists for.
        _factory.Media.FailPut = key =>
            key.EndsWith("thumbnail.webp", StringComparison.Ordinal) && !key.Contains(first.AssetId.ToString("D"), StringComparison.Ordinal)
                ? new InvalidOperationException("The bucket refused the thumbnail.")
                : null;

        try
        {
            await Assert.ThrowsAnyAsync<Exception>(() =>
                Upload(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg"));
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        // The image the author had is still the image the author has.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(first.AssetId, detail.Image!.AssetId);
        Assert.True(_factory.Media.Contains(Key(universe.Id, entry.Id, first.AssetId, "original.png")));
        Assert.True(_factory.Media.Contains(Key(universe.Id, entry.Id, first.AssetId, "thumbnail.webp")));
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, first.AssetId, "original"))).StatusCode);

        // And the half of the new asset that did land was taken back out. Exactly two objects
        // belong to this entry, and both are the first asset's.
        var mine = _factory.Media.Keys
            .Where(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal))
            .ToList();

        Assert.Equal(2, mine.Count);
        Assert.All(mine, key => Assert.Contains(first.AssetId.ToString("D"), key, StringComparison.Ordinal));
    }

    [Fact]
    public async Task A_sweep_that_cannot_run_does_not_fail_the_write()
    {
        var (client, universe, type) = await World("imgsweep");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var first = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");

        _factory.Media.FailDelete = _ => new InvalidOperationException("The bucket refused the delete.");

        EntityImageRef second;
        try
        {
            // Past the commit the new image is the entry's image. An orphan left in the bucket
            // is litter to be logged, never a reason to put the old asset back.
            second = await Uploaded(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg");
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(second.AssetId, detail.Image!.AssetId);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, second.AssetId, "thumbnail"))).StatusCode);
    }

    // ---------- Removing ----------

    [Fact]
    public async Task Removing_clears_the_association_and_cleans_the_objects()
    {
        var (client, universe, type) = await World("imgdel");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var response = await client.DeleteAsync(ImageRoute(universe.Id, entry.Id));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Null(detail.Image);
        Assert.False(await HasImage(entry.Id));

        Assert.False(_factory.Media.Contains(Key(universe.Id, entry.Id, stored.AssetId, "original.png")));
        Assert.False(_factory.Media.Contains(Key(universe.Id, entry.Id, stored.AssetId, "thumbnail.webp")));

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"))).StatusCode);
    }

    [Fact]
    public async Task Removing_an_image_that_is_not_there_succeeds()
    {
        var (client, universe, type) = await World("imgdel2");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await client.DeleteAsync(ImageRoute(universe.Id, entry.Id));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    // ---------- The Trash ----------

    [Fact]
    public async Task Trashing_keeps_the_image_and_restoring_reconnects_it()
    {
        var (client, universe, type) = await World("imgtrash");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entry.Id}"))
            .EnsureSuccessStatusCode();

        // Nothing was erased: the row, both objects and the owner's access to them all survive
        // the Trash, because trashing marks an entry rather than deleting it.
        Assert.True(await HasImage(entry.Id));
        Assert.True(_factory.Media.Contains(Key(universe.Id, entry.Id, stored.AssetId, "original.png")));
        Assert.True(_factory.Media.Contains(Key(universe.Id, entry.Id, stored.AssetId, "thumbnail.webp")));
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "thumbnail"))).StatusCode);

        // A trashed entry is not editable, and its image is part of what may not be edited.
        var upload = await Upload(client, universe.Id, entry.Id, Png(300, 300), "other.png");
        Assert.Equal(HttpStatusCode.NotFound, upload.StatusCode);

        var restore = await client.PostAsync($"/api/universes/{universe.Id}/trash/{entry.Id}/restore", null);
        restore.EnsureSuccessStatusCode();

        var restored = (await restore.Content.ReadFromJsonAsync<EntityDetail>())!;
        Assert.Equal(stored.AssetId, restored.Image!.AssetId);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"))).StatusCode);
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task Another_owner_can_neither_read_set_nor_remove_an_image()
    {
        var (mine, universe, type) = await World("imgmine");
        var entry = await Entry(mine, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(mine, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var theirs = await SignedInClient("user-imgtheirs");

        // Every route answers the same 404 an absent universe answers, so nothing distinguishes
        // "not yours" from "not there" - including whether the entry has an image at all.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await theirs.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await theirs.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "thumbnail"))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Upload(theirs, universe.Id, entry.Id, Png(300, 300), "theirs.png")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await theirs.DeleteAsync(ImageRoute(universe.Id, entry.Id))).StatusCode);

        // And the owner's image is untouched by any of it.
        Assert.Equal(
            HttpStatusCode.OK,
            (await mine.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"))).StatusCode);
    }

    [Fact]
    public async Task An_image_cannot_be_read_through_another_universe()
    {
        var (client, universe, type) = await World("imgcross");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        // The same owner's other world. The entry is theirs, the image is theirs, and the route
        // still refuses it, because the universe in the path is the one that grants access.
        var other = await CreateUniverse(client, "World imgcross-two");

        var response = await client.GetAsync(ImageUrl(other.Id, entry.Id, stored.AssetId, "original"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_anonymous_caller_is_refused()
    {
        var (client, universe, type) = await World("imganon");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        using var anonymous = _factory.CreateClient();

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"))).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await Upload(anonymous, universe.Id, entry.Id, Png(300, 300), "anon.png")).StatusCode);
    }

    // ---------- Disclosure ----------

    [Fact]
    public async Task Nothing_about_the_bucket_reaches_a_response()
    {
        var (client, universe, type) = await World("imgleak");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var accepted = await Upload(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");
        var refused = await Upload(client, universe.Id, entry.Id, [1, 2, 3, 4], "portrait.png");

        foreach (var response in new[] { accepted, refused })
        {
            var body = await response.Content.ReadAsStringAsync();

            // Not the provider, not the endpoint, not a credential, and not an object key -
            // a key is an internal address and belongs in the database and the log, not the wire.
            Assert.DoesNotContain("r2.cloudflarestorage", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("cloudflare", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("AccessKey", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("SecretAccessKey", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("universes/", body, StringComparison.OrdinalIgnoreCase);
        }

        // The entry's own payloads carry identifiers and shape, never a URL to anywhere.
        var detail = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{entry.Id}");
        Assert.DoesNotContain("cloudflarestorage", detail, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("originalKey", detail, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("thumbnailKey", detail, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- History ----------

    [Fact]
    public async Task Setting_replacing_and_removing_a_picture_are_each_recorded_as_history()
    {
        var (client, universe, type) = await World("imghist");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var created = await History(client, universe.Id, entry.Id);
        Assert.Single(created);

        // Three writes, three versions. An image change is author-visible state, so a history
        // that stayed the same length across all three would be quietly omitting what was done.
        await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");
        await Uploaded(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg");
        (await client.DeleteAsync(ImageRoute(universe.Id, entry.Id))).EnsureSuccessStatusCode();

        var versions = await History(client, universe.Id, entry.Id);

        Assert.Equal(4, versions.Count);

        // Newest first, and each of the three says the same thing: the picture moved, and
        // nothing else did.
        foreach (var version in versions.Take(3))
        {
            Assert.Equal(EntityRevisionChange.Image, version.Changes);
            Assert.Equal(EntityRevisionKind.Edited, version.Kind);
        }

        Assert.Equal([4, 3, 2, 1], versions.Select(version => version.Number));
    }

    [Fact]
    public async Task A_version_holds_no_trace_of_the_picture_it_was_taken_beside()
    {
        var (client, universe, type) = await World("imghistbare");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var version = (await History(client, universe.Id, entry.Id))[0];
        var raw = await client.GetStringAsync(
            $"/api/universes/{universe.Id}/entities/{entry.Id}/revisions/{version.Id}");

        // No bytes, no asset id, no key. A replacement deletes the objects it supersedes, so a
        // key recorded here would name nothing - the change is remembered, the picture is not.
        Assert.DoesNotContain(stored.AssetId.ToString("D"), raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("universes/", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("portrait.png", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("image", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Putting_an_old_version_back_leaves_the_current_picture_alone()
    {
        var (client, universe, type) = await World("imghistrestore");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A version written before there was ever a picture.
        (await client.PutAsJsonAsync(
            Entity(universe.Id, entry.Id),
            new EntityRequest(type, "Alenna of Tidewatch", null, null, CanonStatus.Idea, null, null, null)))
            .EnsureSuccessStatusCode();

        var beforeAnyPicture = (await History(client, universe.Id, entry.Id))
            .Single(version => version.Number == 1);

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var restore = await client.PostAsync(
            $"/api/universes/{universe.Id}/entities/{entry.Id}/revisions/{beforeAnyPicture.Id}/restore",
            null);
        restore.EnsureSuccessStatusCode();

        var restored = (await restore.Content.ReadFromJsonAsync<EntityDetail>())!;

        // The lore went back; the picture did not move. Restoring cannot put back an image whose
        // objects were deleted when it was superseded, so it does not pretend to - it leaves the
        // entry's current picture exactly where it is, which is what the history screen says.
        Assert.Equal("Alenna Vance", restored.Name);
        Assert.Equal(stored.AssetId, restored.Image!.AssetId);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ImageUrl(universe.Id, entry.Id, stored.AssetId, "original"))).StatusCode);
    }

    [Fact]
    public async Task A_picture_that_would_not_store_records_no_history()
    {
        var (client, universe, type) = await World("imghistfail");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var before = await History(client, universe.Id, entry.Id);

        // Refused at the gate, so nothing was stored and nothing happened to remember.
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await Upload(client, universe.Id, entry.Id, [1, 2, 3, 4], "portrait.png")).StatusCode);

        // And a removal of an image that is not there is not an event either.
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync(ImageRoute(universe.Id, entry.Id))).StatusCode);

        Assert.Equal(before.Count, (await History(client, universe.Id, entry.Id)).Count);
    }

    // ---------- Routes ----------

    private static string ImageRoute(Guid universeId, Guid entityId) =>
        $"/api/universes/{universeId}/entities/{entityId}/image";

    private static string ImageUrl(Guid universeId, Guid entityId, Guid assetId, string variant) =>
        $"{ImageRoute(universeId, entityId)}/{assetId}/{variant}";

    private static string Key(Guid universeId, Guid entityId, Guid assetId, string leaf) =>
        $"universes/{universeId:D}/entities/{entityId:D}/primary/{assetId:D}/{leaf}";

    // ---------- Calling ----------

    private static async Task<HttpResponseMessage> Upload(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        byte[] bytes,
        string fileName,
        string contentType = "image/png")
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);

        return await client.PutAsync(ImageRoute(universeId, entityId), form);
    }

    private static async Task<EntityImageRef> Uploaded(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        byte[] bytes,
        string fileName)
    {
        var contentType = fileName.EndsWith(".jpg", StringComparison.Ordinal) ? "image/jpeg" : "image/png";
        var response = await Upload(client, universeId, entityId, bytes, fileName, contentType);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;
    }

    private static async Task<EntityDetail> Detail(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{entityId}"))!;

    private static string Entity(Guid universeId, Guid entityId) =>
        $"/api/universes/{universeId}/entities/{entityId}";

    private static async Task<IReadOnlyList<EntityRevisionSummary>> History(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"{Entity(universeId, entityId)}/revisions"))!;

    private static async Task<EntityPage> Page(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universeId}/entities?page=1&pageSize=50"))!;

    private async Task<bool> HasImage(Guid entityId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        return await db.EntityImages.AsNoTracking().AnyAsync(image => image.EntityId == entityId);
    }

    // ---------- Building a world ----------

    private async Task<(HttpClient Client, UniverseDetail Universe, Guid CharacterTypeId)> World(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        var universe = await CreateUniverse(client, $"World {tag}");
        return (client, universe, await CharacterType(client, universe.Id));
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<Guid> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character").Id;
    }

    private static async Task<EntityDetail> Entry(HttpClient client, Guid universeId, Guid typeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, null, CanonStatus.Idea, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    // ---------- Building an image ----------

    private static byte[] Png(int width, int height)
    {
        using var image = Painted(width, height);
        using var buffer = new MemoryStream();
        image.SaveAsPng(buffer);
        return buffer.ToArray();
    }

    private static byte[] Jpeg(int width, int height)
    {
        using var image = Painted(width, height);
        using var buffer = new MemoryStream();
        image.SaveAsJpeg(buffer);
        return buffer.ToArray();
    }

    /// <summary>Not a flat colour: a resampler given one has nothing to prove it worked on.</summary>
    private static Image<Rgba32> Painted(int width, int height)
    {
        var image = new Image<Rgba32>(width, height);
        image.Mutate(context => context.BackgroundColor(Color.CornflowerBlue));
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y += 3)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x += 3)
                {
                    row[x] = new Rgba32(220, 40, 60);
                }
            }
        });
        return image;
    }

    /// <summary>
    /// A real, well-formed PNG header declaring dimensions its body does not contain.
    ///
    /// This is what a decompression bomb looks like from the wire: a handful of bytes describing
    /// an image whose decoded form would be gigabytes. Only a check that reads the header before
    /// the pixels can refuse it, so this is how that check is proved rather than assumed.
    /// </summary>
    private static byte[] PngClaiming(int width, int height)
    {
        var png = Png(4, 4);

        // Signature is 8 bytes; the first chunk is IHDR, whose length and type occupy the next
        // 8, so the declared size lives at 16 and the chunk's CRC covers type and data alike.
        WriteBigEndian(png, 16, width);
        WriteBigEndian(png, 20, height);
        WriteBigEndian(png, 29, (int)Crc32(png.AsSpan(12, 17)));

        return png;
    }

    private static void WriteBigEndian(byte[] buffer, int offset, int value)
    {
        buffer[offset] = (byte)(value >> 24);
        buffer[offset + 1] = (byte)(value >> 16);
        buffer[offset + 2] = (byte)(value >> 8);
        buffer[offset + 3] = (byte)value;
    }

    private static uint Crc32(ReadOnlySpan<byte> data)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var value in data)
        {
            crc ^= value;
            for (var bit = 0; bit < 8; bit++)
            {
                crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
            }
        }

        return crc ^ 0xFFFFFFFFu;
    }
}
