using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Timeline;

/// <summary>
/// Everything a client may set on a timeline entry. Explicit, so nothing else on the
/// stored row - ownership, timestamps, the universe - can be reached by posting extra
/// fields.
/// </summary>
public sealed record TimelineEntryRequest(
    string? Title,
    string? Description,
    CanonStatus CanonStatus,
    TimelineDateKind DateKind,
    int? StartYear,
    int? StartMonth,
    int? StartDay,
    int? EndYear,
    int? EndMonth,
    int? EndDay,
    string? EraLabel,
    IReadOnlyList<Guid>? EntityIds);

/// <summary>
/// The chronology of one entry, already normalized. The components come back as numbers
/// and the precision as an enum, so a client formats the date it wants without ever
/// parsing a string back into parts.
/// </summary>
public sealed record TimelineDate(
    TimelineDateKind Kind,
    int? StartYear,
    int? StartMonth,
    int? StartDay,
    int? EndYear,
    int? EndMonth,
    int? EndDay,
    string? EraLabel,
    TimelineDatePrecision StartPrecision,
    TimelineDatePrecision EndPrecision);

/// <summary>One entity taking part, resolved enough to render without a second request.</summary>
public sealed record TimelineEntityLink(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus CanonStatus);

public sealed record TimelineEntryResponse(
    Guid Id,
    string Title,
    string? Description,
    CanonStatus CanonStatus,
    TimelineDate Date,
    IReadOnlyList<TimelineEntityLink> Entities,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record TimelineEntryPage(
    IReadOnlyList<TimelineEntryResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
