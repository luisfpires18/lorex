using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Health;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

builder.Services.AddLorexDatabase(builder.Configuration, builder.Environment);
builder.Services.AddLorexAuth(builder.Environment);
builder.Services.AddCanonIntegrity();

var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (corsOrigins.Length > 0)
{
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
        .WithOrigins(corsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (corsOrigins.Length > 0)
{
    app.UseCors();
}

// Dev runs over plain HTTP so the local launcher does not depend on a trusted dev certificate.
// Production hosting is expected to terminate TLS in front of the app.

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapUniverseEndpoints();
app.MapEntityTypeEndpoints();
app.MapEntityEndpoints();
app.MapEntityRevisionEndpoints();
app.MapRelationshipTypeEndpoints();
app.MapRelationshipEndpoints();
app.MapTimelineEndpoints();
app.MapCanonIntegrityEndpoints();
app.MapTrashEndpoints();
app.MapUniverseExportEndpoints();

await app.MigrateLorexDatabaseAsync();

app.Run();

/// <summary>Exposed so integration tests can boot the real host through WebApplicationFactory.</summary>
public partial class Program;
