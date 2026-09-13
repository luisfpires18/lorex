using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// How far along the telling of one story is. Closed and deliberately small: it says where the
/// author is with the narrative, never whether anything in it is true - truth is Lore's, and a
/// story has no Canon status at all.
/// </summary>
public enum StoryStatus
{
    Planning = 0,
    Drafting = 1,
    Complete = 2,
}

/// <summary>
/// One narrative an author tells using a universe.
///
/// Lore is what is true about the world; a story is how an author chooses to tell something in it.
/// A story may be a draft, hypothetical, nonlinear, alternate or unfinished, so nothing in one
/// becomes a fact: no Canon finding, no timeline moment, no relationship and no change to any entry
/// is ever produced from it. Its scenes reference lore by id and never keep a copy of it.
///
/// Owned by the universe and deleted with it. Deleting a story is permanent and takes its scenes
/// with it; there is no Trash for stories. See
/// <c>docs/architecture/decisions/0024-story-scene-foundation.md</c>.
/// </summary>
public sealed class Story
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Title { get; set; }

    /// <summary>What the story is about, in a sentence or a paragraph. Optional.</summary>
    public string? Premise { get; set; }

    public StoryStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>When the story or any of its scenes was last written to.</summary>
    public DateTime UpdatedAt { get; set; }

    public ICollection<Scene> Scenes { get; } = [];
}

/// <summary>
/// One scene of one story.
///
/// <b>Two orders, never one.</b> <see cref="SortOrder"/> is where the author tells the scene: the
/// story is always presented in it, and only the author moves it. The chronology - <see cref="EraId"/>,
/// <see cref="Year"/>, <see cref="Month"/>, <see cref="Day"/> - is where the scene happens in the
/// world, and is optional. Neither is derived from, checked against or reordered by the other, so a
/// story that opens on the aftermath and flashes back to a childhood is exactly as valid as one told
/// in order.
///
/// <b>References, not copies.</b> <see cref="PovEntityId"/> and <see cref="EntityLinks"/> point at
/// lore entries. The name, type, picture and summary shown for them are read from the entry every
/// time, so an edit to the lore is reflected in every scene at once. What a link means is only
/// "relevant to this scene" - not present, not alive, not taking part.
/// </summary>
public sealed class Scene
{
    public Guid Id { get; set; }

    public Guid StoryId { get; set; }

    public Story? Story { get; set; }

    public required string Title { get; set; }

    /// <summary>What happens in the scene, briefly. Not manuscript prose.</summary>
    public string? Summary { get; set; }

    /// <summary>The author's own planning notes. Not manuscript prose either.</summary>
    public string? Notes { get; set; }

    /// <summary>
    /// The scene's place in its story's telling, from 0. Contiguous and unique per story: creating
    /// appends, deleting closes the gap, and reordering rewrites the whole sequence in one transaction.
    /// </summary>
    public int SortOrder { get; set; }

    /// <summary>
    /// The entry whose point of view the scene is told from, if any. Any entry may be chosen - Lorex
    /// never decides from a type's name that only characters have a point of view.
    /// </summary>
    public Guid? PovEntityId { get; set; }

    public LoreEntity? PovEntity { get; set; }

    /// <summary>
    /// The era <see cref="Year"/> is counted in, on a universe that names its eras; null on the plain
    /// reckoning, or when the scene is not placed in time. An id, so renaming the era moves nothing.
    /// </summary>
    public Guid? EraId { get; set; }

    public ChronologyEra? Era { get; set; }

    /// <summary>Null when the scene is not placed in time. Signed on the plain reckoning, from 1 in an era.</summary>
    public int? Year { get; set; }

    public int? Month { get; set; }

    public int? Day { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<SceneEntityLink> EntityLinks { get; } = [];
}

/// <summary>
/// One lore entry relevant to one scene. A relational row per link, never a JSON list of ids, so the
/// foreign keys are real and a pair can exist only once.
/// </summary>
public sealed class SceneEntityLink
{
    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }
}
