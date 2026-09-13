namespace Lorex.Api.Features.Chronology;

/// <summary>
/// The names errors about one point are reported under. A timeline entry has two points, keyed
/// flat ("startYear", "endEraId"); a scene has one, nested under its request member
/// ("chronology.year").
/// </summary>
public sealed record ChronologyPointKeys(string Year, string Month, string Day, string Era)
{
    public static ChronologyPointKeys Prefixed(string prefix) =>
        new($"{prefix}Year", $"{prefix}Month", $"{prefix}Day", $"{prefix}EraId");

    public static ChronologyPointKeys Nested(string member) =>
        new($"{member}.year", $"{member}.month", $"{member}.day", $"{member}.eraId");
}

/// <summary>
/// Structural checks for one point on a universe's line, shared by everything that stores one - a
/// timeline entry's start and end, and a scene's position - so a year is refused in the same words
/// wherever it is written.
///
/// Deliberately not a calendar engine: month and day ranges are the ordinary ones, and no fictional
/// calendar's own month lengths are enforced or invented. Where a year sits is the universe's
/// reckoning to say (ADR 0022), and comparing two points is <see cref="ChronologyPoint"/>'s job and
/// nothing here.
/// </summary>
public static class ChronologyPointValidation
{
    public const string NoErasMessage =
        "This universe does not name any eras. Add them in Settings, or leave the era out.";

    /// <summary>
    /// Shape of the components on their own. Years are signed on purpose; only months and days are
    /// bounded, and a day without a month is meaningless.
    /// </summary>
    public static void ValidateParts(
        int? year,
        int? month,
        int? day,
        ChronologyPointKeys keys,
        Dictionary<string, string[]> errors)
    {
        if (month is < 1 or > 12)
        {
            errors[keys.Month] = ["A month runs from 1 to 12."];
        }

        if (day is < 1 or > 31)
        {
            errors[keys.Day] = ["A day runs from 1 to 31."];
        }

        if (day is not null && month is null)
        {
            errors[keys.Month] = ["Give the month as well when you give a day."];
        }

        if (month is not null && year is null)
        {
            errors[keys.Year] = ["Give the year as well when you give a month."];
        }
    }

    /// <summary>
    /// A year on a universe that names its eras: it needs one of them, and counts up from 1 inside it.
    /// Says nothing when there is no year to place.
    /// </summary>
    public static void ValidateEraYear(
        int? year,
        Guid? eraId,
        ChronologyPointKeys keys,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        if (year is not { } value)
        {
            return;
        }

        if (eraId is null)
        {
            errors.TryAdd(keys.Era, ["Choose the era this year is counted in."]);
        }
        else if (chronology.Era(eraId) is null)
        {
            // Said the same way for an id that is not an era at all and for one from another
            // universe, so the answer discloses nothing about the second.
            errors.TryAdd(keys.Era, ["Choose an era this universe names."]);
        }

        if (!ChronologyPoint.IsEraYear(value))
        {
            errors.TryAdd(keys.Year, ["Years inside an era count up from 1."]);
        }
    }

    /// <summary>
    /// One whole point that stands on its own: a year is required, its parts must be shaped, and it
    /// must be written the way this universe keeps time - plain signed years with no era, or a year
    /// from 1 inside one of the universe's eras.
    /// </summary>
    public static void ValidatePoint(
        ChronologyValue value,
        ChronologyPointKeys keys,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        ValidateParts(value.Year, value.Month, value.Day, keys, errors);

        if (value.Year is null)
        {
            errors.TryAdd(keys.Year, ["Give the year, or leave the chronology out."]);
        }

        if (!chronology.NamesEras)
        {
            if (value.EraId is not null)
            {
                errors.TryAdd(keys.Era, [NoErasMessage]);
            }
        }
        else
        {
            ValidateEraYear(value.Year, value.EraId, keys, chronology, errors);
        }
    }
}
