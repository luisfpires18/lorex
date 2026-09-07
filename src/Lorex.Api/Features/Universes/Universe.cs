using Lorex.Api.Features.Auth;

namespace Lorex.Api.Features.Universes;

/// <summary>
/// A private world owned by exactly one user. Ownership is the privacy invariant of
/// Lorex: every query and mutation is scoped by <see cref="OwnerId"/>.
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
}
