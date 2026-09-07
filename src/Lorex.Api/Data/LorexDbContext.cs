using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Data;

/// <summary>
/// Single application DbContext for the Lorex modular monolith. Also hosts the
/// ASP.NET Core Identity schema. Feature modules add their own entity configurations via
/// <see cref="ModelBuilder.ApplyConfigurationsFromAssembly(System.Reflection.Assembly, System.Func{System.Type, bool})"/>.
/// </summary>
public class LorexDbContext(DbContextOptions<LorexDbContext> options)
    : IdentityDbContext<LorexUser>(options)
{
    public DbSet<Universe> Universes => Set<Universe>();

    public DbSet<EntityType> EntityTypes => Set<EntityType>();

    public DbSet<EntityFieldDefinition> EntityFieldDefinitions => Set<EntityFieldDefinition>();

    public DbSet<EntityFieldOption> EntityFieldOptions => Set<EntityFieldOption>();

    public DbSet<LoreEntity> Entities => Set<LoreEntity>();

    public DbSet<EntityAlias> EntityAliases => Set<EntityAlias>();

    public DbSet<EntityFieldValue> EntityFieldValues => Set<EntityFieldValue>();

    public DbSet<Tag> Tags => Set<Tag>();

    public DbSet<EntityTag> EntityTags => Set<EntityTag>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(LorexDbContext).Assembly);
    }
}
