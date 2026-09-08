using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A relationship marked Canon whose source or target entity is not Canon.
///
/// Structural, not semantic: it reads only the canon status the author already set on
/// records the model already links, so it holds for any universe without knowing what any
/// of it means. Canon lore resting on lore that is still an Idea is a likely inconsistency
/// rather than an impossibility, so Medium: either the endpoint should be promoted or the
/// relationship should not be Canon yet.
/// </summary>
public sealed class CanonRelationshipEntityStatusRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-REL-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.Relationships.AsNoTracking()
            .Where(relationship =>
                relationship.UniverseId == context.UniverseId
                && relationship.CanonStatus == CanonStatus.Canon
                && (relationship.SourceEntity!.CanonStatus != CanonStatus.Canon
                    || relationship.TargetEntity!.CanonStatus != CanonStatus.Canon))
            .Select(relationship => new Row(
                relationship.Id,
                relationship.RelationshipType!.Name,
                relationship.SourceEntityId,
                relationship.SourceEntity!.Name,
                relationship.SourceEntity.CanonStatus,
                relationship.TargetEntityId,
                relationship.TargetEntity!.Name,
                relationship.TargetEntity.CanonStatus))
            .ToListAsync(cancellationToken);

        return [.. rows.Select(Finding)];
    }

    private CanonFinding Finding(Row row)
    {
        // Both endpoints may be at fault. They are reported as one conflict rather than
        // two, because the problem is the relationship, not each entity separately - and
        // fixing only one of them is a materially different situation, which the
        // fingerprint picks up because the offender ids are part of it.
        List<Offender> offenders = [];

        if (row.SourceStatus != CanonStatus.Canon)
        {
            offenders.Add(new Offender(row.SourceId, row.SourceName, row.SourceStatus, "source"));
        }

        if (row.TargetStatus != CanonStatus.Canon)
        {
            offenders.Add(new Offender(row.TargetId, row.TargetName, row.TargetStatus, "target"));
        }

        var reading = $"{row.SourceName} {row.TypeName} {row.TargetName}";

        var named = CanonRuleText.List(
            [.. offenders.Select(offender => $"{CanonRuleText.Quoted(offender.Name)} is {CanonRuleText.StatusWord(offender.Status)}")]);

        var title = offenders.Count == 1
            ? $"Canon relationship {CanonRuleText.Quoted(reading)} rests on {CanonRuleText.Quoted(offenders[0].Name)}, which is not Canon"
            : $"Canon relationship {CanonRuleText.Quoted(reading)} rests on two entries that are not Canon";

        var explanation =
            $"The relationship {CanonRuleText.Quoted(reading)} is marked Canon, but {named}. " +
            "Canon should not depend on lore that is not settled yet. Either promote the " +
            "entries this relationship links, or lower the relationship's own status until " +
            "they are ready.";

        return new CanonFinding(
            RuleCode,
            Severity,
            CanonFingerprint.From(
                RuleCode,
                CanonFingerprint.Id(row.RelationshipId),
                CanonFingerprint.Ids(offenders.Select(offender => offender.Id))),
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.Relationship, row.RelationshipId, "relationship"),
                .. offenders.Select(offender =>
                    new CanonFindingSubject(CanonSubjectKind.Entity, offender.Id, offender.Role)),
            ]);
    }

    private sealed record Row(
        Guid RelationshipId,
        string TypeName,
        Guid SourceId,
        string SourceName,
        CanonStatus SourceStatus,
        Guid TargetId,
        string TargetName,
        CanonStatus TargetStatus);

    private sealed record Offender(Guid Id, string Name, CanonStatus Status, string Role);
}
