namespace Lorex.Api.Features.Universes;

/// <summary>Create input. Bound explicitly so no client can set ownership or timestamps.</summary>
public sealed record CreateUniverseRequest(string? Name, string? Description, string? AccentColor);

/// <summary>Update input. Same reason: the entity is never model-bound.</summary>
public sealed record UpdateUniverseRequest(string? Name, string? Description, string? AccentColor);

/// <summary>
/// List row. Carries the caller's own effective role and nothing about anyone else: no owner, no other member, no
/// membership id (ADR 0041).
/// </summary>
public sealed record UniverseSummary(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime UpdatedAt,
    UniverseRole AccessRole);

/// <summary>Single-universe view, with the caller's effective role as on <see cref="UniverseSummary"/>.</summary>
public sealed record UniverseDetail(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    UniverseRole AccessRole);

/// <summary>One page of the universes the caller owns or is a member of.</summary>
public sealed record UniversePage(
    IReadOnlyList<UniverseSummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
