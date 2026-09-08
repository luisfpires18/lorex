namespace Lorex.Api.Features.CanonIntegrity;

/// <summary>
/// One record a conflict points at, resolved enough to render a link without a second
/// request. <see cref="Name"/> is null when the record has since been deleted and the
/// conflict has not been re-evaluated yet.
/// </summary>
public sealed record CanonConflictSubjectResponse(
    CanonSubjectKind Kind,
    Guid SubjectId,
    string Role,
    string? Name);

/// <summary>
/// A conflict as the review screen needs it. The fingerprint is deliberately absent: it is
/// an internal key, and the conflict id is already stable across evaluations.
/// </summary>
public sealed record CanonConflictResponse(
    Guid Id,
    string RuleCode,
    CanonConflictSeverity Severity,
    CanonConflictStatus Status,
    string Title,
    string Explanation,
    IReadOnlyList<CanonConflictSubjectResponse> Subjects,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? ResolvedAt);

public sealed record CanonConflictPage(
    IReadOnlyList<CanonConflictResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>What an evaluation run did, so a client can say so without diffing the list.</summary>
public sealed record CanonEvaluationResponse(
    int Detected,
    int Created,
    int Reopened,
    int Persisted,
    int Resolved,
    DateTime EvaluatedAt);
