using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Health;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;
using Lorex.Api.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

builder.Services.AddLorexForwardedHeaders(builder.Configuration);
builder.Services.AddLorexDataProtection(builder.Configuration, builder.Environment);
builder.Services.AddLorexDatabase(builder.Configuration, builder.Environment);
builder.Services.AddLorexAuth(builder.Environment);
builder.Services.AddCanonIntegrity();
builder.Services.AddLoreSearch();
builder.Services.AddLorexMedia(builder.Configuration);

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

// First: everything after this point may read the request scheme, and behind a TLS-terminating
// proxy the scheme is only correct once the forwarded header has been applied.
app.UseLorexForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (corsOrigins.Length > 0)
{
    app.UseCors();
}

// Dev runs the client on the Vite dev server over plain HTTP, so the local launcher does not
// depend on a trusted dev certificate. A deployment serves the built client from wwwroot and
// terminates TLS in front of the app.
app.UseLorexFrontend();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapUniverseEndpoints();
app.MapEntityTypeEndpoints();
app.MapEntityEndpoints();
app.MapEntityImageEndpoints();
app.MapEntityRevisionEndpoints();
app.MapRelationshipTypeEndpoints();
app.MapRelationshipEndpoints();
app.MapTimelineEndpoints();
app.MapCanonIntegrityEndpoints();
app.MapTrashEndpoints();
app.MapUniverseExportEndpoints();

// Last: the client-side routing fallback only answers what no route above claimed.
app.MapLorexFrontendFallback();

app.Run();

/// <summary>Exposed so integration tests can boot the real host through WebApplicationFactory.</summary>
public partial class Program;
