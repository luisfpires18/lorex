using Microsoft.AspNetCore.StaticFiles;

namespace Lorex.Api.Hosting;

/// <summary>
/// Serves the built React client from the API's own <c>wwwroot</c>, so a deployment is one
/// process on one origin: no CORS, no second host, and the session cookie stays same-origin
/// exactly as it is behind the Vite proxy in development.
///
/// Everything here is conditional on <c>wwwroot/index.html</c> actually being present. The
/// frontend is copied in at publish time and is not part of the repository, so development and
/// the test host see no static-file middleware and no fallback route at all - their behaviour
/// is unchanged.
/// </summary>
public static class FrontendHosting
{
    /// <summary>True when a built client has been published alongside the API.</summary>
    public static bool HasBuiltFrontend(this IWebHostEnvironment environment) =>
        !string.IsNullOrEmpty(environment.WebRootPath)
        && File.Exists(Path.Combine(environment.WebRootPath, "index.html"));

    /// <summary>
    /// Static files, before authentication: build output is public by definition, and the app
    /// shell has to load before anyone can sign in.
    /// </summary>
    public static WebApplication UseLorexFrontend(this WebApplication app)
    {
        if (!app.Environment.HasBuiltFrontend())
        {
            return app;
        }

        app.UseDefaultFiles();
        app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = SetCacheHeaders });
        return app;
    }

    /// <summary>
    /// The client-side routing fallback. Mapped after every API route, and paired with a
    /// catch-all under <c>/api</c> so an unknown API path stays a 404 instead of being answered
    /// with the app shell and a 200.
    /// </summary>
    public static WebApplication MapLorexFrontendFallback(this WebApplication app)
    {
        if (!app.Environment.HasBuiltFrontend())
        {
            return app;
        }

        app.Map("/api/{**path}", () => Results.NotFound());
        app.MapFallbackToFile("index.html", new StaticFileOptions { OnPrepareResponse = SetCacheHeaders });
        return app;
    }

    /// <summary>
    /// Vite content-hashes everything under <c>/assets/</c>, so those URLs are immutable and can
    /// be cached for a year. Everything else - the app shell, the manifest, the icons and above
    /// all <c>sw.js</c> - is revalidated on every load, because a stale service worker or a stale
    /// index.html would pin a browser to a frontend build the API no longer matches.
    /// </summary>
    private static void SetCacheHeaders(StaticFileResponseContext context)
    {
        var isHashedAsset = context.Context.Request.Path.StartsWithSegments("/assets");
        context.Context.Response.Headers.CacheControl = isHashedAsset
            ? "public, max-age=31536000, immutable"
            : "no-cache";
    }
}
