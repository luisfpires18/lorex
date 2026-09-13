using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Stories;

public static class StoryLimits
{
    public const int TitleMaxLength = 200;
    public const int PremiseMaxLength = 2000;
    public const int SceneSummaryMaxLength = 2000;
    public const int SceneNotesMaxLength = 10_000;
    public const int ChapterSummaryMaxLength = 2000;
    public const int ChapterNotesMaxLength = 10_000;
    public const int PlotDescriptionMaxLength = 2000;
    public const int PlotNotesMaxLength = 10_000;

    /// <summary>The same bound a timeline moment has: enough for a crowded scene, one request stays small.</summary>
    public const int MaxLinkedEntities = 100;

    /// <summary>The same bound for the scenes one beat plays out in.</summary>
    public const int MaxLinkedScenes = 100;
}

public sealed class ChapterConfiguration : IEntityTypeConfiguration<Chapter>
{
    public void Configure(EntityTypeBuilder<Chapter> builder)
    {
        builder.ToTable("Chapters");
        builder.HasKey(chapter => chapter.Id);

        builder.Property(chapter => chapter.Title).IsRequired().HasMaxLength(StoryLimits.TitleMaxLength);
        builder.Property(chapter => chapter.Summary).HasMaxLength(StoryLimits.ChapterSummaryMaxLength);
        builder.Property(chapter => chapter.Notes).HasMaxLength(StoryLimits.ChapterNotesMaxLength);

        // A chapter belongs to its story, and goes with it.
        builder.HasOne(chapter => chapter.Story)
            .WithMany(story => story.Chapters)
            .HasForeignKey(chapter => chapter.StoryId)
            .OnDelete(DeleteBehavior.Cascade);

        // Chapter order is contiguous and unique per story, like scene order inside a container.
        builder.HasIndex(chapter => new { chapter.StoryId, chapter.SortOrder }).IsUnique();
    }
}

public sealed class StoryConfiguration : IEntityTypeConfiguration<Story>
{
    public void Configure(EntityTypeBuilder<Story> builder)
    {
        builder.ToTable("Stories");
        builder.HasKey(story => story.Id);

        builder.Property(story => story.Title).IsRequired().HasMaxLength(StoryLimits.TitleMaxLength);
        builder.Property(story => story.Premise).HasMaxLength(StoryLimits.PremiseMaxLength);
        builder.Property(story => story.Status).HasConversion<int>();

        builder.HasOne(story => story.Universe)
            .WithMany()
            .HasForeignKey(story => story.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // The listing: one universe's stories, by title.
        builder.HasIndex(story => new { story.UniverseId, story.Title });
    }
}

public sealed class SceneConfiguration : IEntityTypeConfiguration<Scene>
{
    public void Configure(EntityTypeBuilder<Scene> builder)
    {
        builder.ToTable("Scenes");
        builder.HasKey(scene => scene.Id);

        builder.Property(scene => scene.Title).IsRequired().HasMaxLength(StoryLimits.TitleMaxLength);
        builder.Property(scene => scene.Summary).HasMaxLength(StoryLimits.SceneSummaryMaxLength);
        builder.Property(scene => scene.Notes).HasMaxLength(StoryLimits.SceneNotesMaxLength);

        // A scene belongs to its story, and goes with it.
        builder.HasOne(scene => scene.Story)
            .WithMany(story => story.Scenes)
            .HasForeignKey(scene => scene.StoryId)
            .OnDelete(DeleteBehavior.Cascade);

        // A reference, not ownership: an entry disappearing for good clears the point of view and
        // leaves the scene exactly where it was - the same rule an entity-reference value on another
        // entry follows. Trashing an entry deletes nothing, so today only deleting the whole universe
        // reaches this, and the scene is going too.
        builder.HasOne(scene => scene.PovEntity)
            .WithMany()
            .HasForeignKey(scene => scene.PovEntityId)
            .OnDelete(DeleteBehavior.SetNull);

        // No action, as for every other year counted in an era (ADR 0022): the chronology route
        // refuses to remove an era a scene is placed in, and this holds against a race. Checked at
        // the end of the statement, so deleting a whole universe still cascades.
        builder.HasOne(scene => scene.Era)
            .WithMany()
            .HasForeignKey(scene => scene.EraId)
            .OnDelete(DeleteBehavior.NoAction);

        // No action, deliberately not SET NULL. Emptying a chapter is the chapter route's work: it moves
        // the scenes to the end of Unchaptered and renumbers them first. A bare SET NULL would drop them
        // into Unchaptered carrying their old positions, colliding with the scenes already there. So a
        // chapter that still holds a scene cannot be removed on its own. Checked at the end of the
        // statement, so deleting a whole story or universe still cascades through both.
        builder.HasOne(scene => scene.Chapter)
            .WithMany(chapter => chapter.Scenes)
            .HasForeignKey(scene => scene.ChapterId)
            .OnDelete(DeleteBehavior.NoAction);

        // Narrative order is contiguous and unique per container: one chapter, or the story's
        // Unchaptered scenes. Two filtered indexes rather than one over (StoryId, ChapterId, SortOrder),
        // because a unique index treats every null as distinct - it would guard each chapter and leave
        // Unchaptered, the one container every existing scene is in, unguarded.
        builder.HasIndex(scene => new { scene.StoryId, scene.SortOrder })
            .IsUnique()
            .HasFilter("\"ChapterId\" IS NULL");

        builder.HasIndex(scene => new { scene.ChapterId, scene.SortOrder })
            .IsUnique()
            .HasFilter("\"ChapterId\" IS NOT NULL");

        // The story read and the story list take every scene in a story whatever its container, which
        // neither filtered index can answer.
        builder.HasIndex(scene => scene.StoryId);
    }
}

public sealed class SceneEntityLinkConfiguration : IEntityTypeConfiguration<SceneEntityLink>
{
    public void Configure(EntityTypeBuilder<SceneEntityLink> builder)
    {
        builder.ToTable("SceneEntityLinks");
        builder.HasKey(link => new { link.SceneId, link.EntityId });

        builder.HasOne(link => link.Scene)
            .WithMany(scene => scene.EntityLinks)
            .HasForeignKey(link => link.SceneId)
            .OnDelete(DeleteBehavior.Cascade);

        // Like a timeline participation: the link means nothing once the entry is gone for good, and
        // losing it never takes the scene with it. Trashing an entry deletes nothing.
        builder.HasOne(link => link.Entity)
            .WithMany()
            .HasForeignKey(link => link.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(link => link.EntityId);
    }
}
