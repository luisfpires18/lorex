using System.Globalization;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Timeline;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.CanonIntegrity.Rules;

/// <summary>One year an author declared about an entity, and the field that declared it.</summary>
internal sealed record LifespanFact(Guid FieldDefinitionId, string FieldName, double Year);

/// <summary>
/// What one Canon entity says about when it existed. Either end may be missing: most lore
/// records a birth and nothing else, and a rule that needed both would fire on almost nothing.
/// </summary>
internal sealed record CanonLifespan(
    Guid EntityId,
    string EntityName,
    LifespanFact? Birth,
    LifespanFact? Death);

/// <summary>
/// A moment that makes a comparable claim about when it happened.
///
/// Only <see cref="TimelineDateKind.Exact"/> and <see cref="TimelineDateKind.Range"/> reach
/// here. <c>Unknown</c> claims nothing, and <c>Approximate</c> claims a year with an
/// unstated margin - "around 400" cannot be shown to contradict anything, because nothing
/// in the model says how far around. Guessing a tolerance would be inventing a fact.
/// </summary>
internal sealed record CanonMoment(
    Guid EntryId,
    string Title,
    TimelineDateKind Kind,
    int? StartYear,
    int? EndYear,
    IReadOnlyList<Guid> Participants);

/// <summary>
/// The reading half of the chronology rules: which entities declared a lifespan, which
/// moments are comparable to one, and whether comparing them is sound at all.
///
/// Kept apart from the rules themselves because three rules ask the same questions of the
/// same tables, and because what counts as a *provable* contradiction is the delicate part
/// - it is easier to review in one place than spread across three.
/// </summary>
internal static class CanonLifespanReader
{
    /// <summary>
    /// Every Canon entity in this universe that declares a birth or death year, keyed by id.
    ///
    /// Meaning comes from <see cref="EntityFieldDefinition.Semantic"/> and nothing else. No
    /// field name is read, so renaming "Born" to "Year of birth" changes the wording of a
    /// conflict and never whether it is found.
    /// </summary>
    public static async Task<Dictionary<Guid, CanonLifespan>> LoadLifespansAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.EntityFieldValues.AsNoTracking()
            .Where(value =>
                value.Entity!.UniverseId == context.UniverseId

                // A trashed entry declares nothing. Its values are still stored and come back
                // intact on restore, but while it is in the Trash it is not part of the world
                // and no rule may reason from it.
                && value.Entity.DeletedAt == null
                && value.Entity.CanonStatus == CanonStatus.Canon
                && value.NumberValue != null
                && (value.FieldDefinition!.Semantic == EntityFieldSemantic.BirthYear
                    || value.FieldDefinition.Semantic == EntityFieldSemantic.DeathYear))
            .Select(value => new Row(
                value.EntityId,
                value.Entity!.Name,
                value.FieldDefinitionId,
                value.FieldDefinition!.Name,
                value.FieldDefinition.Semantic!.Value,
                value.NumberValue!.Value))
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.EntityId)
            .ToDictionary(group => group.Key, Lifespan);
    }

    /// <summary>
    /// Every Canon moment in this universe that dates itself precisely enough to compare,
    /// with the Canon participants that declared a lifespan.
    ///
    /// Returns nothing at all when the universe keeps time in more than one reckoning. Era
    /// labels are display metadata with no arithmetic behind them, and a birth year on an
    /// entity carries no era of its own, so "Second Age 3441" and a birth year of 3441 are
    /// not two points on one line. Rather than guess which reckoning an entity's year is
    /// on, the chronology rules stand down for that universe. See the deferred cross-era
    /// ordering note in STATE.md.
    /// </summary>
    public static async Task<IReadOnlyList<CanonMoment>> LoadComparableMomentsAsync(
        CanonRuleContext context,
        IReadOnlyDictionary<Guid, CanonLifespan> lifespans,
        CancellationToken cancellationToken)
    {
        if (lifespans.Count == 0 || !await HasSingleReckoningAsync(context, cancellationToken))
        {
            return [];
        }

        var subjects = lifespans.Keys.ToHashSet();

        var rows = await context.Db.TimelineEntries.AsNoTracking()
            .Where(entry =>
                entry.UniverseId == context.UniverseId
                && entry.CanonStatus == CanonStatus.Canon
                && (entry.DateKind == TimelineDateKind.Exact || entry.DateKind == TimelineDateKind.Range)
                && entry.EntityLinks.Any(link =>
                    link.Entity!.DeletedAt == null
                    && link.Entity.CanonStatus == CanonStatus.Canon
                    && subjects.Contains(link.EntityId)))
            .Select(entry => new CanonMoment(
                entry.Id,
                entry.Title,
                entry.DateKind,
                entry.StartYear,
                entry.EndYear,
                entry.EntityLinks
                    .Where(link => link.Entity!.DeletedAt == null
                        && link.Entity.CanonStatus == CanonStatus.Canon
                        && subjects.Contains(link.EntityId))
                    .Select(link => link.EntityId)
                    .ToList()))
            .ToListAsync(cancellationToken);

        return rows;
    }

    /// <summary>
    /// True when this universe's timeline uses at most one named era, which is the only
    /// case where a bare year on an entity and a year on a moment mean the same thing.
    /// Entries with no label count as the default reckoning, not as a second one.
    /// </summary>
    private static async Task<bool> HasSingleReckoningAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken) =>
        await context.Db.TimelineEntries.AsNoTracking()
            .Where(entry => context.UniverseId == entry.UniverseId && entry.EraLabel != null && entry.EraLabel != "")
            .Select(entry => entry.EraLabel)
            .Distinct()
            .CountAsync(cancellationToken) <= 1;

    /// <summary>
    /// The last year a moment could possibly fall in, or null when it does not say. A range
    /// ends where it ends; an exact date is its own last year.
    /// </summary>
    public static int? LatestYear(CanonMoment moment) =>
        moment.Kind == TimelineDateKind.Range ? moment.EndYear : moment.StartYear;

    /// <summary>The first year a moment could possibly fall in, or null when it does not say.</summary>
    public static int? EarliestYear(CanonMoment moment) => moment.StartYear;

    /// <summary>
    /// How the moment's date reads in a sentence. A range is described by the end that
    /// proves the contradiction, so the author sees the same number the rule compared.
    /// </summary>
    public static string DatePhrase(CanonMoment moment, bool byLatest) =>
        (moment.Kind, byLatest) switch
        {
            (TimelineDateKind.Range, true) => $"ends in {Year(moment.EndYear!.Value)}",
            (TimelineDateKind.Range, false) => $"starts in {Year(moment.StartYear!.Value)}",
            _ => $"is dated {Year(moment.StartYear!.Value)}",
        };

    /// <summary>
    /// A year as the author wrote it. Values are stored as doubles because every custom
    /// number is, so a whole year must not come back as "3441.0".
    /// </summary>
    public static string Year(double value) => value.ToString("0.####", CultureInfo.InvariantCulture);

    public static string Year(int value) => value.ToString(CultureInfo.InvariantCulture);

    /// <summary>
    /// Collapses one entity's declared years. Ordering before taking the first keeps the
    /// choice deterministic if a legacy row predates the one-meaning-per-type index.
    /// </summary>
    private static CanonLifespan Lifespan(IGrouping<Guid, Row> group)
    {
        var ordered = group.OrderBy(row => row.FieldDefinitionId).ToList();

        return new CanonLifespan(
            group.Key,
            ordered[0].EntityName,
            Fact(ordered, EntityFieldSemantic.BirthYear),
            Fact(ordered, EntityFieldSemantic.DeathYear));
    }

    private static LifespanFact? Fact(List<Row> rows, EntityFieldSemantic semantic) =>
        rows.Where(row => row.Semantic == semantic)
            .Select(row => new LifespanFact(row.FieldDefinitionId, row.FieldName, row.Year))
            .FirstOrDefault();

    private sealed record Row(
        Guid EntityId,
        string EntityName,
        Guid FieldDefinitionId,
        string FieldName,
        EntityFieldSemantic Semantic,
        double Year);
}
