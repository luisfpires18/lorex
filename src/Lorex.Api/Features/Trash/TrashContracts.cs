using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Trash;

/// <summary>
/// One entry in the Trash, as the list shows it.
///
/// Deliberately thinner than <see cref="EntitySummary"/>. The Trash is a recovery surface, not
/// a second browser: it answers "what did I throw away, and when", and everything else about
/// an entry becomes readable again the moment it is restored. Aliases, tags, the summary and
/// the article are all still stored and none of them are reported here.
/// </summary>
public sealed record TrashedEntity(
    Guid Id,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus CanonStatus,
    DateTime TrashedAt);

public sealed record TrashPage(
    IReadOnlyList<TrashedEntity> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
