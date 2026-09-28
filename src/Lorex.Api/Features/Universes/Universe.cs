using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Publishing;

namespace Lorex.Api.Features.Universes;

/// <summary>
/// A private world owned by exactly one user. Ownership is the privacy invariant of
/// Lorex: every query and mutation is scoped by <see cref="OwnerId"/>.
///
/// The one exception is its public shell, readable by anyone while <see cref="Visibility"/> is
/// public, and only through the allow-listed projection in <c>Features/Publishing</c> (ADR 0036).
/// </summary>
public sealed class Universe
{
    public Guid Id { get; set; }

    public required string OwnerId { get; set; }

    public LorexUser? Owner { get; set; }

    public required string Name { get; set; }

    public string? Description { get; set; }

    /// <summary>Optional identity colour, stored as <c>#rrggbb</c>.</summary>
    public string? AccentColor { get; set; }

    /// <summary>Archived universes stay owned and readable, just out of the default list.</summary>
    public bool IsArchived { get; set; }

    /// <summary>UTC. Stored as <see cref="DateTime"/> because SQLite cannot order by
    /// <c>DateTimeOffset</c>, and Lorex has no use for per-row offsets.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>UTC. See <see cref="CreatedAt"/>.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>Private until its owner publishes it. Changed only by the publish and unpublish routes.</summary>
    public UniverseVisibility Visibility { get; set; }

    /// <summary>
    /// What the public portal says about the world. Its own text: <see cref="Description"/> is the
    /// author's, and is never published or copied here.
    /// </summary>
    public string? PublicSummary { get; set; }

    public UniverseCategory? Category { get; set; }

    public UniverseGenres Genres { get; set; }

    /// <summary>
    /// Its public address, minted from the name the first time it is published and never changed
    /// after - not by a rename, and not by unpublishing - so a link to it keeps working.
    /// </summary>
    public string? PublicSlug { get; set; }

    /// <summary>
    /// UTC. When it was first published. Unpublishing and publishing again keep it, so toggling
    /// visibility cannot move a world to the front of "recently published".
    /// </summary>
    public DateTime? PublishedAt { get; set; }
}
