using Lorex.Api.Features.Auth;
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
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(LorexDbContext).Assembly);
    }
}
