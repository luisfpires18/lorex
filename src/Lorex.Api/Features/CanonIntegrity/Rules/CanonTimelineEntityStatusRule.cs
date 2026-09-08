using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A timeline entry marked Canon with a participant that is not Canon.
///
/// The same structural check as <see cref="CanonRelationshipEntityStatusRule"/>, over the
/// participation join instead: a moment the author has settled cannot rest on a character
/// still being sketched. No date arithmetic happens here and none is needed - this reads
/// canon status only, so it stays valid whatever calendar the universe uses.
/// </summary>
public sealed class CanonTimelineEntityStatusRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-TIME-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.TimelineEntries.AsNoTracking()
            .Where(entry =>
                entry.UniverseId == context.UniverseId
                && entry.CanonStatus == CanonStatus.Canon
                && entry.EntityLinks.Any(link => link.Entity!.CanonStatus != CanonStatus.Canon))
            .Select(entry => new Row(
                entry.Id,
                entry.Title,
                entry.EntityLinks
                    .Where(link => link.Entity!.CanonStatus != CanonStatus.Canon)
                    .Select(link => new Offender(link.EntityId, link.Entity!.Name, link.Entity.CanonStatus))
                    .ToList()))
            .ToListAsync(cancellationToken);

        return [.. rows.Select(Finding)];
    }

    private CanonFinding Finding(Row row)
    {
        // Ordered here rather than in SQL: the order decides the wording, and sorting the
        // ids into the fingerprint separately would let the two disagree.
        var offenders = row.Offenders
            .OrderBy(offender => offender.Name, StringComparer.Ordinal)
            .ThenBy(offender => offender.Id)
            .ToList();

        var named = CanonRuleText.List(
            [.. offenders.Select(offender => $"{CanonRuleText.Quoted(offender.Name)} is {CanonRuleText.StatusWord(offender.Status)}")]);

        var title = offenders.Count == 1
            ? $"Canon moment {CanonRuleText.Quoted(row.Title)} involves {CanonRuleText.Quoted(offenders[0].Name)}, which is not Canon"
            : $"Canon moment {CanonRuleText.Quoted(row.Title)} involves {offenders.Count} entries that are not Canon";

        var explanation =
            $"The timeline entry {CanonRuleText.Quoted(row.Title)} is marked Canon, but {named}. " +
            "A settled moment should not depend on lore that is not settled. Either promote " +
            "the participants, drop them from the moment, or lower the moment's own status.";

        return new CanonFinding(
            RuleCode,
            Severity,
            CanonFingerprint.From(
                RuleCode,
                CanonFingerprint.Id(row.EntryId),
                CanonFingerprint.Ids(offenders.Select(offender => offender.Id))),
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.TimelineEntry, row.EntryId, "entry"),
                .. offenders.Select(offender =>
                    new CanonFindingSubject(CanonSubjectKind.Entity, offender.Id, "participant")),
            ]);
    }

    private sealed record Row(Guid EntryId, string Title, List<Offender> Offenders);

    private sealed record Offender(Guid Id, string Name, CanonStatus Status);
}
