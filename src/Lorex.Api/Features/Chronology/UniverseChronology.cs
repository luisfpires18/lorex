using System.Globalization;
using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Chronology;

/// <summary>
/// One universe's reckoning, loaded once and read by everything that places a year: the
/// timeline's validation, the birth and death years on entries, and the chronology rules.
///
/// A universe with no eras is the plain reckoning Lorex has always had - signed years on one
/// line, formatted as the number. There is no stored "mode": the eras are the configuration, so
/// a universe cannot be "custom with nothing configured" or "plain with eras lying around".
/// </summary>
public sealed class UniverseChronology
{
    private readonly Dictionary<Guid, ChronologyEra> _byId;

    private UniverseChronology(IReadOnlyList<ChronologyEra> eras)
    {
        Eras = eras;
        _byId = eras.ToDictionary(era => era.Id);
    }

    /// <summary>The plain reckoning: no eras, signed years.</summary>
    public static UniverseChronology Plain { get; } = new([]);

    /// <summary>In order, earliest era first.</summary>
    public IReadOnlyList<ChronologyEra> Eras { get; }

    /// <summary>True once the author has named at least one era.</summary>
    public bool NamesEras => Eras.Count > 0;

    public static UniverseChronology Of(IEnumerable<ChronologyEra> eras) =>
        new([.. eras.OrderBy(era => era.SortOrder).ThenBy(era => era.Id)]);

    public static async Task<UniverseChronology> LoadAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken) =>
        Of(await db.ChronologyEras.AsNoTracking()
            .Where(era => era.UniverseId == universeId)
            .ToListAsync(cancellationToken));

    /// <summary>The era with this id in this universe, or null - including for an id from anywhere else.</summary>
    public ChronologyEra? Era(Guid? eraId) =>
        eraId is { } id && _byId.TryGetValue(id, out var era) ? era : null;

    /// <summary>
    /// Where a stored year sits on this universe's line, or null when it cannot be placed.
    ///
    /// A plain year places only on a universe with no eras. Once eras exist, a year without one
    /// - written before the author named them - is not on the line at all: reading it as a year
    /// in some era would be inventing which one.
    /// </summary>
    public ChronologyPoint? Point(Guid? eraId, double? year, int? month = null, int? day = null)
    {
        if (year is not { } value)
        {
            return null;
        }

        if (!NamesEras)
        {
            return eraId is null ? ChronologyPoint.Plain(value, month, day) : null;
        }

        return Era(eraId) is { } era ? ChronologyPoint.InEra(era, value, month, day) : null;
    }

    /// <summary>
    /// A year the way the author reads it: "3441", "-42", "BF 10", "10 Third Age". The same rule
    /// the web client's formatter follows. A whole year never comes back as "3441.0".
    /// </summary>
    public string FormatYear(Guid? eraId, double year)
    {
        var number = year.ToString("0.####", CultureInfo.InvariantCulture);

        if (Era(eraId) is not { } era)
        {
            return number;
        }

        var label = Label(era);
        return era.LabelPosition == ChronologyLabelPosition.AfterYear ? $"{number} {label}" : $"{label} {number}";
    }

    /// <summary>What is written beside a year: the short label, or the name when there is none.</summary>
    public static string Label(ChronologyEra era) => era.Abbreviation ?? era.Name;
}
