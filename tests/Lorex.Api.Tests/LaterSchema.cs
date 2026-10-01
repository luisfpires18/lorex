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

    /// <summary>Whether an index or trigger name (or "name on table") predates nested types.</summary>
    public static bool BeforeNestedTypes(string name) =>
        !NestedTypes.Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));
}
