using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Lore;

public static class LoreLimits
{
    public const int NameMaxLength = 160;
    public const int SummaryMaxLength = 1000;
    public const int DescriptionMaxLength = 1000;
    public const int TextValueMaxLength = 4000;
    public const int TagMaxLength = 60;
    public const int IconMaxLength = 40;
    public const int AccentColorLength = 7;
    public const int ContentMaxLength = 200_000;
    public const int OptionMaxLength = 120;
}

public sealed class EntityTypeConfiguration : IEntityTypeConfiguration<EntityType>
{
    public void Configure(EntityTypeBuilder<EntityType> builder)
    {
        builder.ToTable("EntityTypes");
        builder.HasKey(type => type.Id);

        builder.Property(type => type.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(type => type.Description).HasMaxLength(LoreLimits.DescriptionMaxLength);
        builder.Property(type => type.Icon).HasMaxLength(LoreLimits.IconMaxLength);
        builder.Property(type => type.AccentColor).HasMaxLength(LoreLimits.AccentColorLength);

        builder.HasOne(type => type.Universe)
            .WithMany()
            .HasForeignKey(type => type.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Names are unique per universe, which is also what makes default seeding idempotent.
        builder.HasIndex(type => new { type.UniverseId, type.Name }).IsUnique();
        builder.HasIndex(type => new { type.UniverseId, type.DisplayOrder });
    }
}

public sealed class EntityFieldDefinitionConfiguration : IEntityTypeConfiguration<EntityFieldDefinition>
{
    public void Configure(EntityTypeBuilder<EntityFieldDefinition> builder)
    {
        builder.ToTable("EntityFieldDefinitions");
        builder.HasKey(field => field.Id);

        builder.Property(field => field.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(field => field.DefaultValue).HasMaxLength(LoreLimits.TextValueMaxLength);
        builder.Property(field => field.Kind).HasConversion<int>();
        builder.Property(field => field.Semantic).HasConversion<int?>();

        builder.HasOne(field => field.EntityType)
            .WithMany(type => type.Fields)
            .HasForeignKey(field => field.EntityTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(field => new { field.EntityTypeId, field.Name }).IsUnique();

        // One meaning per type at most. Filtered, because the ordinary case is a type with
        // several semantic-free fields and a unique index over nulls would forbid that.
        builder.HasIndex(field => new { field.EntityTypeId, field.Semantic })
            .IsUnique()
            .HasFilter("\"Semantic\" IS NOT NULL");
    }
}

public sealed class EntityFieldOptionConfiguration : IEntityTypeConfiguration<EntityFieldOption>
{
    public void Configure(EntityTypeBuilder<EntityFieldOption> builder)
    {
        builder.ToTable("EntityFieldOptions");
        builder.HasKey(option => option.Id);

        builder.Property(option => option.Value).IsRequired().HasMaxLength(LoreLimits.OptionMaxLength);

        builder.HasOne(option => option.FieldDefinition)
            .WithMany(field => field.Options)
            .HasForeignKey(option => option.FieldDefinitionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(option => new { option.FieldDefinitionId, option.Value }).IsUnique();
    }
}

public sealed class LoreEntityConfiguration : IEntityTypeConfiguration<LoreEntity>
{
    public void Configure(EntityTypeBuilder<LoreEntity> builder)
    {
        builder.ToTable("Entities");
        builder.HasKey(entity => entity.Id);

        builder.Property(entity => entity.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(entity => entity.Summary).HasMaxLength(LoreLimits.SummaryMaxLength);
        builder.Property(entity => entity.Content).HasMaxLength(LoreLimits.ContentMaxLength);
        builder.Property(entity => entity.CanonStatus).HasConversion<int>();

        builder.HasOne(entity => entity.Universe)
            .WithMany()
            .HasForeignKey(entity => entity.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Removing a type would orphan its entities, so the type cannot be deleted while
        // any entity still uses it.
        builder.HasOne(entity => entity.EntityType)
            .WithMany()
            .HasForeignKey(entity => entity.EntityTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Browse and Trash are the same shape read from opposite sides of DeletedAt, so one
        // index serves both: every ordinary listing is UniverseId + DeletedAt is null, and the
        // Trash is UniverseId + DeletedAt is not null.
        builder.HasIndex(entity => new
        {
            entity.UniverseId,
            entity.DeletedAt,
            entity.IsArchived,
            entity.UpdatedAt,
        });
        builder.HasIndex(entity => new { entity.UniverseId, entity.EntityTypeId });
        builder.HasIndex(entity => new { entity.UniverseId, entity.Name });
    }
}

public sealed class EntityAliasConfiguration : IEntityTypeConfiguration<EntityAlias>
{
    public void Configure(EntityTypeBuilder<EntityAlias> builder)
    {
        builder.ToTable("EntityAliases");
        builder.HasKey(alias => alias.Id);

        builder.Property(alias => alias.Value).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);

        builder.HasOne(alias => alias.Entity)
            .WithMany(entity => entity.Aliases)
            .HasForeignKey(alias => alias.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(alias => new { alias.EntityId, alias.Value }).IsUnique();
    }
}

public sealed class EntityFieldValueConfiguration : IEntityTypeConfiguration<EntityFieldValue>
{
    public void Configure(EntityTypeBuilder<EntityFieldValue> builder)
    {
        builder.ToTable("EntityFieldValues");
        builder.HasKey(value => value.Id);

        builder.Property(value => value.TextValue).HasMaxLength(LoreLimits.TextValueMaxLength);

        builder.HasOne(value => value.Entity)
            .WithMany(entity => entity.FieldValues)
            .HasForeignKey(value => value.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, not Cascade: deleting a field definition that still holds values would
        // destroy authored data silently. The API refuses that deletion instead.
        builder.HasOne(value => value.FieldDefinition)
            .WithMany(field => field.Values)
            .HasForeignKey(value => value.FieldDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(value => value.Option)
            .WithMany()
            .HasForeignKey(value => value.OptionId)
            .OnDelete(DeleteBehavior.Cascade);

        // A referenced entity disappearing clears the reference rather than deleting the
        // referring entity.
        builder.HasOne(value => value.ReferencedEntity)
            .WithMany()
            .HasForeignKey(value => value.ReferencedEntityId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(value => new { value.EntityId, value.FieldDefinitionId });
    }
}

public sealed class TagConfiguration : IEntityTypeConfiguration<Tag>
{
    public void Configure(EntityTypeBuilder<Tag> builder)
    {
        builder.ToTable("Tags");
        builder.HasKey(tag => tag.Id);

        builder.Property(tag => tag.Name).IsRequired().HasMaxLength(LoreLimits.TagMaxLength);
        builder.Property(tag => tag.Slug).IsRequired().HasMaxLength(LoreLimits.TagMaxLength);

        builder.HasOne(tag => tag.Universe)
            .WithMany()
            .HasForeignKey(tag => tag.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(tag => new { tag.UniverseId, tag.Slug }).IsUnique();
    }
}

public sealed class EntityTagConfiguration : IEntityTypeConfiguration<EntityTag>
{
    public void Configure(EntityTypeBuilder<EntityTag> builder)
    {
        builder.ToTable("EntityTags");
        builder.HasKey(link => new { link.EntityId, link.TagId });

        builder.HasOne(link => link.Entity)
            .WithMany(entity => entity.EntityTags)
            .HasForeignKey(link => link.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(link => link.Tag)
            .WithMany(tag => tag.EntityTags)
            .HasForeignKey(link => link.TagId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
