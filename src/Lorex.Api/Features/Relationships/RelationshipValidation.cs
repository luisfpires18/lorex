namespace Lorex.Api.Features.Relationships;

/// <summary>Input checks for the relationship feature. Nothing invalid reaches EF Core.</summary>
public static class RelationshipValidation
{
    public static Dictionary<string, string[]>? ValidateType(RelationshipTypeRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["name"] = ["Give the relationship type a name, like \"rules\"."];
        }
        else if (name.Length > RelationshipLimits.NameMaxLength)
        {
            errors["name"] = [$"Keep the name under {RelationshipLimits.NameMaxLength} characters."];
        }

        var inverse = request.InverseName?.Trim();

        // A symmetric type reads the same from both ends, so a second wording is not asked
        // for and anything sent is dropped rather than stored as a contradiction.
        if (!request.IsSymmetric)
        {
            if (string.IsNullOrWhiteSpace(inverse))
            {
                errors["inverseName"] =
                    ["Give the reverse reading, like \"ruled by\", or mark the type symmetric."];
            }
            else if (inverse.Length > RelationshipLimits.NameMaxLength)
            {
                errors["inverseName"] =
                    [$"Keep the reverse name under {RelationshipLimits.NameMaxLength} characters."];
            }
        }

        if (request.Description?.Trim() is { Length: > RelationshipLimits.DescriptionMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? ValidateRelationship(RelationshipRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (!Enum.IsDefined(request.CanonStatus))
        {
            errors["canonStatus"] = ["That is not a canon status Lorex knows."];
        }

        if (request.SourceEntityId == request.TargetEntityId)
        {
            errors["targetEntityId"] = ["Relate two different entries."];
        }

        if (request.StartDate is { } start && request.EndDate is { } end
            && Utc(end) < Utc(start))
        {
            errors["endDate"] = ["The end date cannot come before the start date."];
        }

        if (request.Notes?.Trim() is { Length: > RelationshipLimits.NotesMaxLength })
        {
            errors["notes"] = ["Those notes are too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Stored timestamps are UTC <see cref="DateTime"/> values, because SQLite cannot order
    /// by <c>DateTimeOffset</c>. A kind-less value from a client is read as UTC.
    /// </summary>
    public static DateTime? Utc(DateTime? value) => value is { } moment ? Utc(moment) : null;

    public static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    /// <summary>The wording to show when a link is read from <paramref name="perspective"/>.</summary>
    public static string LabelFor(
        string name,
        string? inverseName,
        bool isSymmetric,
        RelationshipPerspective perspective) =>
        perspective == RelationshipPerspective.Forward || isSymmetric
            ? name
            : inverseName ?? name;
}
