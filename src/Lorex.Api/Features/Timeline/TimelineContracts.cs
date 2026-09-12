using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Timeline;

/// <summary>
/// Everything a client may set on a timeline entry. Explicit, so nothing else on the
/// stored row - ownership, timestamps, the universe - can be reached by posting extra
/// fields.
///
/// <paramref name="StartEraId"/> and <paramref name="EndEraId"/> say which of the universe's
/// eras each year is counted in. A universe that names eras requires them on every dated
/// moment and refuses <paramref name="EraLabel"/>; one that does not refuses them and keeps
/// plain signed years with an optional label, exactly as before eras existed.
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
    IReadOnlyList<Guid>? EntityIds,
    Guid? StartEraId = null,
    Guid? EndEraId = null);

/// <summary>
/// The chronology of one entry, already normalized. The components come back as numbers
/// and the precision as an enum, so a client formats the date it wants without ever
/// parsing a string back into parts. The eras come back as ids, formatted by the client
/// from the universe's own chronology.
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
    TimelineDatePrecision EndPrecision,
    Guid? StartEraId,
    Guid? EndEraId);

/// <summary>
/// One entity taking part, resolved enough to render without a second request.
///
/// <paramref name="IsTrashed"/> says the participant is currently in the Trash. It is still
/// reported, deliberately: the client sends a moment's whole participant set back on every
/// save, so dropping it from the response would delete the participation the next time the
/// author edited the moment's date. The client shows it as unavailable and does not link it.
/// </summary>
public sealed record TimelineEntityLink(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus CanonStatus,
    bool IsTrashed);

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
