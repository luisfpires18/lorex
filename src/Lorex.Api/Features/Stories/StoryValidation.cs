using Lorex.Api.Features.Chronology;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// Input checks for stories and scenes. Structural only: a story makes no claim about the world, so
/// nothing here compares a scene with the lore, with the timeline or with another scene. In
/// particular a scene placed earlier in the world than the scene told before it is not an error -
/// nonlinear stories are valid.
/// </summary>
public static class StoryValidation
{
    /// <summary>A scene's chronology errors are reported under its request member: "chronology.year".</summary>
    public static readonly ChronologyPointKeys ChronologyKeys = ChronologyPointKeys.Nested("chronology");

    public static Dictionary<string, string[]>? ValidateStory(StoryRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the story a title.", errors);

        if (request.Premise?.Trim() is { Length: > StoryLimits.PremiseMaxLength })
        {
            errors["premise"] = [$"Keep the premise under {StoryLimits.PremiseMaxLength} characters."];
        }

        if (!Enum.IsDefined(request.Status))
        {
            errors["status"] = ["That is not a story status Lorex knows."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>A chapter is plain planning text: a title it needs, and a summary and notes it may have.</summary>
    public static Dictionary<string, string[]>? ValidateChapter(ChapterRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the chapter a title, like \"Arrival\".", errors);

        if (request.Summary?.Trim() is { Length: > StoryLimits.ChapterSummaryMaxLength })
        {
            errors["summary"] = [$"Keep the summary under {StoryLimits.ChapterSummaryMaxLength} characters."];
        }

        if (request.Notes?.Trim() is { Length: > StoryLimits.ChapterNotesMaxLength })
        {
            errors["notes"] = [$"Keep the notes under {StoryLimits.ChapterNotesMaxLength} characters."];
        }

        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? ValidateScene(
        SceneRequest request,
        UniverseChronology chronology)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the scene a title, like \"The Council\".", errors);

        if (request.Summary?.Trim() is { Length: > StoryLimits.SceneSummaryMaxLength })
        {
            errors["summary"] = [$"Keep the summary under {StoryLimits.SceneSummaryMaxLength} characters."];
        }

        if (request.Notes?.Trim() is { Length: > StoryLimits.SceneNotesMaxLength })
        {
            errors["notes"] = [$"Keep the notes under {StoryLimits.SceneNotesMaxLength} characters."];
        }

        if (request.EntityIds is { Count: > StoryLimits.MaxLinkedEntities })
        {
            errors["entityIds"] = [$"Link at most {StoryLimits.MaxLinkedEntities} entries to one scene."];
        }

        if (request.Chronology is { } point)
        {
            ChronologyPointValidation.ValidatePoint(point, ChronologyKeys, chronology, errors);
        }

        return errors.Count == 0 ? null : errors;
    }

    private static void ValidateTitle(string? value, string missing, Dictionary<string, string[]> errors)
    {
        var title = value?.Trim();

        if (string.IsNullOrWhiteSpace(title))
        {
            errors["title"] = [missing];
        }
        else if (title.Length > StoryLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title under {StoryLimits.TitleMaxLength} characters."];
        }
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
