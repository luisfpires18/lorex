using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Chronology;

public static class ChronologyLimits
{
    public const int NameMaxLength = 60;

    /// <summary>A short label is written beside every year, so it has to stay short.</summary>
    public const int AbbreviationMaxLength = 12;

    /// <summary>Generous for any reckoning a story needs, small enough to stay one screen of settings.</summary>
    public const int MaxEras = 20;
}

public sealed class ChronologyEraConfiguration : IEntityTypeConfiguration<ChronologyEra>
{
    public void Configure(EntityTypeBuilder<ChronologyEra> builder)
    {
        builder.ToTable("ChronologyEras");
        builder.HasKey(era => era.Id);

        builder.Property(era => era.Name).IsRequired().HasMaxLength(ChronologyLimits.NameMaxLength);
        builder.Property(era => era.Abbreviation).HasMaxLength(ChronologyLimits.AbbreviationMaxLength);
        builder.Property(era => era.Direction).HasConversion<int>();
        builder.Property(era => era.LabelPosition).HasConversion<int>();

        builder.HasOne(era => era.Universe)
            .WithMany()
            .HasForeignKey(era => era.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // One era per position. The order is what every comparison ranks by, so two eras
        // sharing a place would make "which came first" a question with no answer.
        builder.HasIndex(era => new { era.UniverseId, era.SortOrder }).IsUnique();
    }
}
