using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Trash;

/// <summary>What a row in the Trash is. Stored nowhere: each kind is its own table's marker (ADR 0015, ADR 0029, ADR 0033).</summary>
public enum TrashItemKind
{
    Entry = 0,
    Story = 1,
    Chapter = 2,
    Scene = 3,
    PlotArc = 4,
    PlotBeat = 5,
    WorldRule = 6,
}

/// <summary>Why a row in the Trash cannot be put back yet, if it cannot. Never inferred from a name.</summary>
public enum TrashRestoreBlock
{
    /// <summary>It can be restored now.</summary>
    None = 0,

    /// <summary>The story it belongs to is in the Trash as well: the story comes back first.</summary>
    StoryInTrash = 1,

    /// <summary>The arc a beat belongs to is in the Trash as well: the arc comes back first.</summary>
    ArcInTrash = 2,
}

/// <summary>
/// One row in the Trash, as the list shows it.
///
/// Deliberately thin. The Trash is a recovery surface, not a second browser: it answers "what did I throw away, where was
/// it, and when". Nothing a row held - an article, fields, prose, notes, links - is reported here, and every word of it is
/// readable again the moment it is restored.
///
/// <paramref name="Kind"/> says what it is. The entry members - type and Canon status - are set for an entry only; a world
/// rule carries none of the context members, because it sits in nothing but its universe.
/// <paramref name="StoryId"/> is set for everything from a story: the story itself, and the chapter, scene, arc or beat's
/// own story, whose <paramref name="StoryTitle"/> says where it was. <paramref name="PlotArcId"/> and
/// <paramref name="PlotArcTitle"/> are a beat's arc. <paramref name="BlockedBy"/> says the row cannot come back until what
/// it belongs to does.
/// </summary>
public sealed record TrashItem(
    TrashItemKind Kind,
    Guid Id,
    string Name,
    DateTime TrashedAt,
    Guid? EntityTypeId,
    string? EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus? CanonStatus,
    Guid? StoryId,
    string? StoryTitle,
    Guid? PlotArcId,
    string? PlotArcTitle,
    TrashRestoreBlock BlockedBy);

public sealed record TrashPage(
    IReadOnlyList<TrashItem> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>What a restore of story content put back, and the story it is in: enough for a client to open it.</summary>
public sealed record TrashRestored(TrashItemKind Kind, Guid Id, Guid StoryId);
