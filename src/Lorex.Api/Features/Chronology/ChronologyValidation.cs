namespace Lorex.Api.Features.Chronology;

/// <summary>
/// Shape checks for a reckoning, before anything is read from the database. What needs the
/// stored eras - an id from somewhere else, an era still in use - is the endpoint's to decide.
/// </summary>
public static class ChronologyValidation
{
    public static Dictionary<string, string[]>? Validate(ChronologyRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Eras is not { } eras)
        {
            errors["eras"] = ["Send the whole list of eras, even when it is empty."];
            return errors;
        }

        if (eras.Count > ChronologyLimits.MaxEras)
        {
            errors["eras"] = [$"A universe can name at most {ChronologyLimits.MaxEras} eras."];
            return errors;
        }

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var labels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var ids = new HashSet<Guid>();

        for (var index = 0; index < eras.Count; index++)
        {
            var era = eras[index];
            var key = $"eras[{index}]";

            if (era.Id is { } id && !ids.Add(id))
            {
                errors[$"{key}.id"] = ["The same era is listed twice."];
            }

            var name = Normalize(era.Name);
            var abbreviation = Normalize(era.Abbreviation);

            if (name is null)
            {
                errors[$"{key}.name"] = ["Give the era a name, like \"After the Fall\"."];
            }
            else if (name.Length > ChronologyLimits.NameMaxLength)
            {
                errors[$"{key}.name"] = [$"Keep an era's name under {ChronologyLimits.NameMaxLength} characters."];
            }
            else if (!names.Add(name))
            {
                errors[$"{key}.name"] = ["Another era already has this name."];
            }

            if (abbreviation is { Length: > ChronologyLimits.AbbreviationMaxLength })
            {
                errors[$"{key}.abbreviation"] =
                    [$"Keep a short label to {ChronologyLimits.AbbreviationMaxLength} characters or fewer."];
            }
            else if ((abbreviation ?? name) is { } label && !labels.Add(label))
            {
                // What is written beside a year has to say which era it is, so two eras may not
                // read the same even when their full names differ.
                errors[abbreviation is null ? $"{key}.name" : $"{key}.abbreviation"] =
                    [$"Another era is already written as \"{label}\". Give each era a label of its own."];
            }

            if (!Enum.IsDefined(era.Direction))
            {
                errors[$"{key}.direction"] = ["That is not a direction Lorex knows."];
            }

            if (!Enum.IsDefined(era.LabelPosition))
            {
                errors[$"{key}.labelPosition"] = ["That is not a label position Lorex knows."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
