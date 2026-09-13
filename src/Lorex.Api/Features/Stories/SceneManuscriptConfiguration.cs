using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Stories;

public sealed class SceneManuscriptConfiguration : IEntityTypeConfiguration<SceneManuscript>
{
    public void Configure(EntityTypeBuilder<SceneManuscript> builder)
    {
        builder.ToTable("SceneManuscripts");
        builder.HasKey(manuscript => manuscript.SceneId);

        // Long text: the column has no length. One save is bounded by the API (StoryLimits.ManuscriptMaxLength), which
        // is a limit on a request, not on what a scene may hold in the schema.
        builder.Property(manuscript => manuscript.Content).IsRequired();

        // Owned by the scene and deleted with it, so with its story and its universe too. A chapter's delete moves its
        // scenes and deletes none, so it reaches no manuscript. Nothing on Scene points back here: reading or tracking a
        // scene - a reorder, a move, the story read - can never pull its prose along.
        builder.HasOne(manuscript => manuscript.Scene)
            .WithOne()
            .HasForeignKey<SceneManuscript>(manuscript => manuscript.SceneId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
