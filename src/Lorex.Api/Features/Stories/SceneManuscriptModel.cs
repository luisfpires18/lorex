namespace Lorex.Api.Features.Stories;

/// <summary>
/// The prose of one scene: what the author actually writes, as opposed to what the scene plans.
///
/// A scene's title, summary, notes, point of view, chronology, chapter and lore links describe the scene - planning,
/// structure and references. Its manuscript is the telling itself. The two differ in size and in how often they are
/// written, so they are different rows: a story read, a reorder or a move never loads a word of prose, and only the
/// manuscript route reads or writes this one. <see cref="Scene"/> has no navigation back to it for the same reason.
///
/// <b>Plain text, kept exactly.</b> <see cref="Content"/> is stored as the author sent it - line breaks, blank lines,
/// punctuation, quotation marks and every Unicode character - with no trimming, no Markdown, no HTML and no editor
/// document structure.
///
/// <b>Narrative, not lore.</b> Nothing reads the text for meaning: no Canon finding, timeline entry, relationship, lore
/// link, plot link or search hit comes from a sentence in it.
///
/// At most one per scene, keyed by the scene and deleted with it. A scene with no row has an empty manuscript; the row
/// appears on the first save and stays, even when a later save empties it. See
/// <c>docs/architecture/decisions/0027-scene-manuscript.md</c>.
/// </summary>
public sealed class SceneManuscript
{
    /// <summary>The scene this is the prose of: both the key and the foreign key.</summary>
    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }

    public required string Content { get; set; }

    /// <summary>When the prose was last saved - and what a save names to show it was written over the latest text.</summary>
    public DateTime UpdatedAt { get; set; }
}
