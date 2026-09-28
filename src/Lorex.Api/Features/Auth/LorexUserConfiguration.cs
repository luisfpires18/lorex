using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Auth;

/// <summary>
/// Identity only indexes the normalized email, it does not make it unique, so
/// <c>RequireUniqueEmail</c> is enforced by an application-level check that two concurrent
/// registrations can slip past. The unique index makes the database the arbiter.
/// </summary>
public sealed class LorexUserConfiguration : IEntityTypeConfiguration<LorexUser>
{
    public void Configure(EntityTypeBuilder<LorexUser> builder)
    {
        builder.HasIndex(user => user.NormalizedEmail)
            .HasDatabaseName("EmailIndex")
            .IsUnique();

        builder.Property(user => user.PublicDisplayName)
            .HasMaxLength(Publishing.PublicationLimits.DisplayNameMaxLength);

        // The public author address (ADR 0037): unique across accounts; nulls - every account never published -
        // do not collide.
        builder.Property(user => user.PublicAuthorSlug)
            .HasMaxLength(Publishing.PublicationLimits.SlugMaxLength);
        builder.HasIndex(user => user.PublicAuthorSlug).IsUnique();
    }
}
