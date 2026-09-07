using System.Text.RegularExpressions;

namespace Lorex.Api.Features.Lore;

/// <summary>Shared input checks for the lore feature.</summary>
public static partial class LoreValidation
{
    public static Dictionary<string, string[]>? ValidateEntityType(EntityTypeRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        RequireName(errors, request.Name, "Give the type a name.");

        if (request.Description is { Length: > LoreLimits.DescriptionMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        if (request.Icon is { Length: > LoreLimits.IconMaxLength })
        {
            errors["icon"] = ["That icon name is too long."];
        }

        ValidateAccent(errors, request.AccentColor);

        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? ValidateField(FieldDefinitionRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        RequireName(errors, request.Name, "Give the field a name.");

        if (!Enum.IsDefined(request.Kind))
        {
            errors["kind"] = ["That is not a field type Lorex knows."];
        }

        var needsOptions = request.Kind is EntityFieldKind.Select or EntityFieldKind.MultiSelect;
        var optionCount = request.Options?.Count(option => !string.IsNullOrWhiteSpace(option)) ?? 0;

        if (needsOptions && optionCount == 0)
        {
            errors["options"] = ["A select field needs at least one option."];
        }

        if (request.Options is not null
            && request.Options.Any(option => (option?.Length ?? 0) > LoreLimits.OptionMaxLength))
        {
            errors["options"] = ["One of those options is too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? ValidateEntity(EntityRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        RequireName(errors, request.Name, "Give it a name.");

        if (request.Summary?.Trim() is { Length: > LoreLimits.SummaryMaxLength })
        {
            errors["summary"] = ["That summary is too long."];
        }

        if (!Enum.IsDefined(request.CanonStatus))
        {
            errors["canonStatus"] = ["That is not a canon status Lorex knows."];
        }

        if (!LoreContent.TryValidate(request.Content, out var contentError))
        {
            errors["content"] = [contentError!];
        }

        // A JSON array can carry nulls, so entries are length-checked defensively.
        if (request.Aliases is not null
            && request.Aliases.Any(alias => (alias?.Trim().Length ?? 0) > LoreLimits.NameMaxLength))
        {
            errors["aliases"] = ["One of those aliases is too long."];
        }

        if (request.Tags is not null
            && request.Tags.Any(tag => (tag?.Trim().Length ?? 0) > LoreLimits.TagMaxLength))
        {
            errors["tags"] = ["One of those tags is too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static string? NormalizeAccent(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    /// <summary>Escapes LIKE wildcards so a search for "%" cannot match everything.</summary>
    public static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

    private static void RequireName(Dictionary<string, string[]> errors, string? name, string message)
    {
        var trimmed = name?.Trim();

        if (string.IsNullOrWhiteSpace(trimmed))
        {
            errors["name"] = [message];
        }
        else if (trimmed.Length > LoreLimits.NameMaxLength)
        {
            errors["name"] = [$"Keep the name under {LoreLimits.NameMaxLength} characters."];
        }
    }

    private static void ValidateAccent(Dictionary<string, string[]> errors, string? accentColor)
    {
        if (!string.IsNullOrWhiteSpace(accentColor) && !AccentColorPattern().IsMatch(accentColor.Trim()))
        {
            errors["accentColor"] = ["Use a colour like #4f6bd6."];
        }
    }

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex AccentColorPattern();
}
