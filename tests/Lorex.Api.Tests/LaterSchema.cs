namespace Lorex.Api.Tests;

/// <summary>
/// Schema objects that migrations later than the one a migration test rolls back over add, so a rollback past them is
/// expected to take them too. A migration test compares what it read at the latest schema with what is left after rolling
/// back; these are left out of the first list before comparing. Not a test.
/// </summary>
internal static class LaterSchema
{
    /// <summary>Nested types (AddEntityTypeHierarchy, 2026-10-01): an index and three triggers on <c>EntityTypes</c>.</summary>
    private static readonly string[] NestedTypes =
    [
        "IX_EntityTypes_UniverseId_ParentId",
        "EntityTypes_ParentInUniverse_Insert",
        "EntityTypes_ParentInUniverse_Update",
        "EntityTypes_KeepsChildren_Delete",
    ];

    /// <summary>Memberships (AddUniverseMemberships, 2026-10-02, ADR 0041): a table, its key's index and one index.</summary>
    private static readonly string[] Memberships =
    [
        "sqlite_autoindex_UniverseMemberships_1",
        "IX_UniverseMemberships_UserId",

        // Invitations (AddUniverseInvitations, 2026-10-02, ADR 0041 amendment).
        "sqlite_autoindex_UniverseInvitations_1",
        "IX_UniverseInvitations_TargetUserId",
        "IX_UniverseInvitations_UniverseId_NormalizedEmail",
    ];

    /// <summary>A link field's allowed type (AddEntityReferenceTargetType, 2026-10-05, 036): its key's index.</summary>
    private static readonly string[] ReferenceTargets =
    [
        "IX_EntityFieldDefinitions_TargetEntityTypeId",
    ];

    /// <summary>A moment's stories (AddTimelineEntryStories, 2026-10-05, 038): a table, its key's index and one index.</summary>
    private static readonly string[] TimelineStories =
    [
        "sqlite_autoindex_TimelineEntryStories_1",
        "IX_TimelineEntryStories_StoryId",
    ];

    /// <summary>Whether an index or trigger name (or "name on table") predates nested types - and so everything after them.</summary>
    public static bool BeforeNestedTypes(string name) =>
        !NestedTypes.Concat(Memberships).Concat(ReferenceTargets).Concat(TimelineStories)
            .Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates the link field's allowed type - and so everything after it.</summary>
    public static bool BeforeReferenceTargets(string name) =>
        !ReferenceTargets.Concat(TimelineStories).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates a moment's stories.</summary>
    public static bool BeforeTimelineStories(string name) =>
        !TimelineStories.Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));
}
