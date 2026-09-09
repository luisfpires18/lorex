using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Export;

/// <summary>
/// One route: hand the owner a portable copy of their universe.
///
/// Read-only, authenticated, and gated by the same <see cref="LoreAccess"/> check the rest of
/// the lore surface uses, so a universe someone else owns is a 404 and stays indistinguishable
/// from one that does not exist. Archiving does not change any of this: an archived universe
/// stays owned and readable (ADR 0006), and a backup taken just before deleting one is exactly
/// when a backup is worth most.
///
/// This phase exports only. Nothing here reads a file back in.
/// </summary>
public static class UniverseExportEndpoints
{
    /// <summary>
    /// Plain JSON rather than a vendor type. The file *is* JSON, every tool already handles
    /// it, and <see cref="UniverseBackup.Format"/> inside the file is what identifies it.
    /// </summary>
    private const string MediaType = "application/json";

    public static IEndpointRouteBuilder MapUniverseExportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/export")
            .WithTags("Universes")
            .RequireAuthorization();

        group.MapGet("/", ExportAsync).WithName("ExportUniverse");

        return endpoints;
    }

    private static async Task<IResult> ExportAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var payload = await new UniverseBackupBuilder(db).BuildAsync(universeId, cancellationToken);

        if (payload is null)
        {
            // Only reachable if the universe was deleted between the ownership check and the
            // read. Answering 404 keeps that race indistinguishable from every other miss.
            return Results.NotFound();
        }

        var generatedAt = DateTime.UtcNow;
        var backup = UniverseBackup.Of(payload, generatedAt);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(backup, UniverseBackupJson.Options);

        return Results.File(bytes, MediaType, FileNameFor(payload.Universe.Name, generatedAt));
    }

    /// <summary>
    /// A filename an author can recognise months later: the world's name and the day it was
    /// taken. The name is the author's own and carries nothing about their account, and it is
    /// reduced to lowercase ASCII so the file lands intact on any filesystem.
    /// </summary>
    internal static string FileNameFor(string universeName, DateTime generatedAt) =>
        $"lorex-{Slug(universeName)}-{generatedAt.ToString("yyyyMMdd", CultureInfo.InvariantCulture)}.json";

    private static string Slug(string name)
    {
        const int MaxLength = 48;

        var slug = new StringBuilder(MaxLength);

        foreach (var character in name)
        {
            if (slug.Length == MaxLength)
            {
                break;
            }

            if (char.IsAsciiLetterOrDigit(character))
            {
                slug.Append(char.ToLowerInvariant(character));
            }
            else if (slug.Length > 0 && slug[^1] != '-')
            {
                slug.Append('-');
            }
        }

        // A name of nothing but punctuation or non-ASCII script leaves nothing usable behind.
        return slug.ToString().Trim('-') is { Length: > 0 } trimmed ? trimmed : "universe";
    }
}

/// <summary>
/// How a backup is written. Shared with the tests, because a format the tests serialise
/// differently is not the format that ships.
/// </summary>
public static class UniverseBackupJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web)
    {
        // Indented, because a backup that cannot be read or diffed by a human is a backup
        // nobody can check. The cost is whitespace in a file that is already large.
        WriteIndented = true,

        // Names, not numbers. A reader of the file should not have to know that a canon
        // status of 2 means Canon, and a member added to an enum must not silently re-mean
        // an old file. Flags serialise as a comma-separated list of names.
        Converters = { new JsonStringEnumConverter() },

        // Nulls stay. "This field was never filled in" and "this field is not in the format"
        // are different facts, and only writing the null keeps them apart.
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,

        // The relaxed encoder escapes only what JSON itself requires. The default one also
        // escapes '&', '<', '>', '+', '\'' and every non-ASCII character, which is protection
        // against being pasted into HTML - and this file never is. It is written to disk,
        // served as an attachment, and read back by a parser. Paying for that protection here
        // would turn a world written in Cyrillic, or a character called Ilúvatar, into a wall
        // of \uXXXX in the one artefact an author may want to read with their own eyes.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
