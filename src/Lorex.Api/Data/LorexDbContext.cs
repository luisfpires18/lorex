using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Data;

/// <summary>
/// Single application DbContext for the Lorex modular monolith.
/// Feature modules add their own entity configurations via
/// <see cref="ModelBuilder.ApplyConfigurationsFromAssembly(System.Reflection.Assembly, System.Func{System.Type, bool})"/>.
/// </summary>
public class LorexDbContext(DbContextOptions<LorexDbContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(LorexDbContext).Assembly);
    }
}
