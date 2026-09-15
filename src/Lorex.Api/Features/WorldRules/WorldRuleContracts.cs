namespace Lorex.Api.Features.WorldRules;

/// <summary>
/// Creating a world rule, or saving one whole.
///
/// <paramref name="Title"/> is required and trimmed. <paramref name="Description"/> is plain text stored exactly as sent; null
/// reads as <c>""</c>.
///
/// <paramref name="ExpectedUpdatedAt"/> is the <c>updatedAt</c> the edit was written over, on an update. When the rule has
/// changed since - or none is named - the save is refused with 409 <c>world_rule_changed</c> and nothing is written. Ignored on
/// create.
/// </summary>
public sealed record WorldRuleRequest(string? Title, string? Description, DateTime? ExpectedUpdatedAt);

/// <summary>
/// A list row: enough to find a rule again, never its whole description. <paramref name="Excerpt"/> is the start of the
/// description, and <paramref name="IsExcerptShortened"/> says there is more.
/// </summary>
public sealed record WorldRuleSummary(
    Guid Id,
    string Title,
    string Excerpt,
    bool IsExcerptShortened,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record WorldRulePage(
    IReadOnlyList<WorldRuleSummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>One rule, whole. Nothing derived travels with it: no status, no finding, no "valid" flag - it is what was written.</summary>
public sealed record WorldRuleDetail(
    Guid Id,
    string Title,
    string Description,
    DateTime CreatedAt,
    DateTime UpdatedAt);
