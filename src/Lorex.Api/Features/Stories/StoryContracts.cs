using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// Everything a client may set on a story. Explicit, so the universe, the id and the timestamps
/// cannot be reached by posting extra fields.
/// </summary>
public sealed record StoryRequest(string? Title, string? Premise, StoryStatus Status);

/// <summary>One story in a universe's list, with how many scenes it has so far.</summary>
public sealed record StorySummary(
    Guid Id,
    string Title,
    string? Premise,
    StoryStatus Status,
    int SceneCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One story with every scene in it, in narrative order, and every lore reference already resolved,
/// so the story page is one request however many scenes it holds.
/// </summary>
public sealed record StoryDetail(
    Guid Id,
    string Title,
    string? Premise,
    StoryStatus Status,
    IReadOnlyList<SceneResponse> Scenes,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// Everything a client may set on a scene. <c>SortOrder</c> is deliberately absent: a new scene is
/// appended, and only the order route moves one.
///
/// <paramref name="EntityIds"/> is the scene's whole set of linked lore, replaced on every save.
/// <paramref name="Chronology"/> is null for a scene not placed in time.
/// </summary>
public sealed record SceneRequest(
    string? Title,
    string? Summary,
    string? Notes,
    Guid? PovEntityId,
    ChronologyValue? Chronology,
    IReadOnlyList<Guid>? EntityIds);

/// <summary>
/// A lore entry as a scene shows it, read from the entry itself on every request - never stored on
/// the scene.
///
/// <paramref name="IsTrashed"/> says the entry is in the Trash. It is still reported, deliberately:
/// the form sends the scene's point of view and links back whole on every save, so dropping it here
/// would delete the reference the next time the author edited an unrelated field. The client shows
/// it as unavailable and does not link it.
/// </summary>
public sealed record SceneLoreReference(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    bool IsTrashed,
    EntityImageRef? Image);

/// <summary>
/// One scene. <paramref name="SortOrder"/> is its place in the telling, from 0;
/// <paramref name="Chronology"/> is where it happens in the world, or null. The two are independent.
/// </summary>
public sealed record SceneResponse(
    Guid Id,
    Guid StoryId,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    SceneLoreReference? Pov,
    ChronologyValue? Chronology,
    IReadOnlyList<SceneLoreReference> Entities,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// The story's whole narrative order: every scene id in the story, each exactly once, first told
/// first.
/// </summary>
public sealed record SceneOrderRequest(IReadOnlyList<Guid>? SceneIds);
