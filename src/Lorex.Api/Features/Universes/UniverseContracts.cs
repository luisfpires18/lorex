namespace Lorex.Api.Features.Universes;

/// <summary>Create input. Bound explicitly so no client can set ownership or timestamps.</summary>
public sealed record CreateUniverseRequest(string? Name, string? Description, string? AccentColor);

/// <summary>Update input. Same reason: the entity is never model-bound.</summary>
public sealed record UpdateUniverseRequest(string? Name, string? Description, string? AccentColor);

/// <summary>List row. Deliberately carries no owner information.</summary>
public sealed record UniverseSummary(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime UpdatedAt);

/// <summary>Single-universe view.</summary>
public sealed record UniverseDetail(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>One page of the caller's own universes.</summary>
public sealed record UniversePage(
    IReadOnlyList<UniverseSummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
