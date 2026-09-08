namespace Lorex.Api.Features.Timeline;

/// <summary>
/// Input checks for the timeline feature. Deliberately not a calendar engine: month and
/// day ranges are the ordinary ones, and no fictional calendar's own rules about how long
/// a month runs are enforced or invented here.
/// </summary>
public static class TimelineValidation
{
    public static Dictionary<string, string[]>? Validate(TimelineEntryRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        var title = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            errors["title"] = ["Give the moment a title, like \"Frodo leaves the Shire\"."];
        }
        else if (title.Length > TimelineLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title under {TimelineLimits.TitleMaxLength} characters."];
        }

        if (request.Description?.Trim() is { Length: > TimelineLimits.DescriptionMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        if (request.EraLabel?.Trim() is { Length: > TimelineLimits.EraLabelMaxLength })
        {
            errors["eraLabel"] = [$"Keep the era under {TimelineLimits.EraLabelMaxLength} characters."];
        }

        if (!Enum.IsDefined(request.CanonStatus))
        {
            errors["canonStatus"] = ["That is not a canon status Lorex knows."];
        }

        if (!Enum.IsDefined(request.DateKind))
        {
            errors["dateKind"] = ["That is not a date kind Lorex knows."];

            // Every rule below is written per kind, so an unknown one has nothing to say.
            return errors;
        }

        ValidateComponents(request, errors);
        ValidateKind(request, errors);

        if (request.EntityIds is { Count: > TimelineLimits.MaxLinkedEntities })
        {
            errors["entityIds"] =
                [$"Link at most {TimelineLimits.MaxLinkedEntities} entries to one moment."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// Shape of the components on their own, whatever the kind claims. Years are signed on
    /// purpose; only months and days are bounded, and a day without a month is meaningless.
    /// </summary>
    private static void ValidateComponents(
        TimelineEntryRequest request,
        Dictionary<string, string[]> errors)
    {
        if (request.StartMonth is < 1 or > 12)
        {
            errors["startMonth"] = ["A month runs from 1 to 12."];
        }

        if (request.StartDay is < 1 or > 31)
        {
            errors["startDay"] = ["A day runs from 1 to 31."];
        }

        if (request.EndMonth is < 1 or > 12)
        {
            errors["endMonth"] = ["A month runs from 1 to 12."];
        }

        if (request.EndDay is < 1 or > 31)
        {
            errors["endDay"] = ["A day runs from 1 to 31."];
        }

        if (request.StartDay is not null && request.StartMonth is null)
        {
            errors["startMonth"] = ["Give the month as well when you give a day."];
        }

        if (request.EndDay is not null && request.EndMonth is null)
        {
            errors["endMonth"] = ["Give the month as well when you give a day."];
        }

        if (request.StartMonth is not null && request.StartYear is null)
        {
            errors["startYear"] = ["Give the year as well when you give a month."];
        }

        if (request.EndMonth is not null && request.EndYear is null)
        {
            errors["endYear"] = ["Give the year as well when you give a month."];
        }
    }

    /// <summary>Which components each kind is allowed, and required, to carry.</summary>
    private static void ValidateKind(
        TimelineEntryRequest request,
        Dictionary<string, string[]> errors)
    {
        var hasEnd = request.EndYear is not null
            || request.EndMonth is not null
            || request.EndDay is not null;

        switch (request.DateKind)
        {
            case TimelineDateKind.Exact:
            case TimelineDateKind.Approximate:
                if (request.StartYear is null)
                {
                    errors["startYear"] = ["Give the year this happened in."];
                }

                if (hasEnd)
                {
                    errors["endYear"] = ["Only a range has an end. Switch the kind to Range."];
                }

                break;

            case TimelineDateKind.Range:
                if (request.StartYear is null)
                {
                    errors["startYear"] = ["Give the year the span starts in."];
                }

                if (request.EndYear is null)
                {
                    errors["endYear"] = ["Give the year the span ends in."];
                }

                if (request.StartYear is not null
                    && request.EndYear is not null
                    && SortKey(request.EndYear, request.EndMonth, request.EndDay)
                        < SortKey(request.StartYear, request.StartMonth, request.StartDay))
                {
                    errors["endYear"] = ["The span cannot end before it starts."];
                }

                break;

            case TimelineDateKind.Unknown:
                if (request.StartYear is not null
                    || request.StartMonth is not null
                    || request.StartDay is not null
                    || hasEnd)
                {
                    errors["dateKind"] =
                        ["An unknown date carries no year, month or day. Clear them or pick a kind."];
                }

                break;
        }
    }

    /// <summary>
    /// The single number the components compare as. Absent month and day count as zero, so
    /// a bare year sorts before any dated moment inside it, which is also how the listing
    /// orders. Only meaningful within one era; see the ADR on fictional chronology.
    /// </summary>
    private static long SortKey(int? year, int? month, int? day) =>
        ((long)(year ?? 0) * 10000) + ((month ?? 0) * 100) + (day ?? 0);

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>How far down a set of components actually goes.</summary>
    public static TimelineDatePrecision PrecisionOf(int? year, int? month, int? day) =>
        year is null ? TimelineDatePrecision.None
        : month is null ? TimelineDatePrecision.Year
        : day is null ? TimelineDatePrecision.Month
        : TimelineDatePrecision.Day;
}
