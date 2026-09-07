using Lorex.Api.Data;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;

namespace Lorex.Api.Features.Auth;

/// <summary>Registers ASP.NET Core Identity with cookie authentication.</summary>
public static class AuthSetup
{
    /// <summary>Cookie lifetime. Sliding, so an active session is not interrupted.</summary>
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(7);

    public static IServiceCollection AddLorexAuth(this IServiceCollection services, IHostEnvironment environment)
    {
        services.AddAuthentication(IdentityConstants.ApplicationScheme)
            .AddIdentityCookies();

        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "lorex.session";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;

            // The SPA is served same-origin through the Vite proxy in development and behind
            // TLS in production, so the cookie can stay Strict. Development and the test host
            // run plain HTTP, where demanding Secure would silently drop the cookie; any
            // HTTPS request still gets a Secure cookie under SameAsRequest.
            options.Cookie.SecurePolicy = environment.IsProduction()
                ? CookieSecurePolicy.Always
                : CookieSecurePolicy.SameAsRequest;

            options.ExpireTimeSpan = SessionLifetime;
            options.SlidingExpiration = true;

            // This is an API, not a server-rendered app: answer with status codes rather than
            // redirecting the fetch call to a login page that does not exist server-side.
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        services.AddIdentityCore<LorexUser>(options =>
            {
                // Deliberately simple for development, without switching protections off.
                options.Password.RequiredLength = 8;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;

                options.User.RequireUniqueEmail = true;

                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
                options.Lockout.AllowedForNewUsers = true;
            })
            .AddEntityFrameworkStores<LorexDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders();

        services.AddAuthorization();

        return services;
    }
}
