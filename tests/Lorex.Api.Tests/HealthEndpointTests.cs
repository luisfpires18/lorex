using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Health;

namespace Lorex.Api.Tests;

/// <summary>Proves the backend test infrastructure boots the real host end to end.</summary>
public sealed class HealthEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task Health_check_endpoint_reports_healthy()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Api_health_endpoint_returns_service_payload()
    {
        using var client = _factory.CreateClient();

        var payload = await client.GetFromJsonAsync<HealthResponse>("/api/health");

        Assert.NotNull(payload);
        Assert.Equal("healthy", payload.Status);
        Assert.Equal("Lorex.Api", payload.Service);
    }
}
