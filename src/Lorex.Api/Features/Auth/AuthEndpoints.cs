using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Lorex.Api.Features.Auth;

/// <summary>Registration, login, logout and the current-user probe.</summary>
public static class AuthEndpoints
{
    /// <summary>
    /// One message for every failed sign-in, so the response cannot be used to tell a
    /// wrong password from an account that does not exist.
    /// </summary>
    private const string InvalidCredentials = "That username or email and password combination is not correct.";

    private static readonly EmailAddressAttribute EmailValidator = new();

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", RegisterAsync).WithName("Register");
        group.MapPost("/login", LoginAsync).WithName("Login");
        group.MapPost("/logout", LogoutAsync).WithName("Logout").RequireAuthorization();
        group.MapGet("/me", GetCurrentUser).WithName("GetCurrentUser").RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> RegisterAsync(
        [FromBody] RegisterRequest request,
        UserManager<LorexUser> userManager,
        SignInManager<LorexUser> signInManager,
        CancellationToken cancellationToken)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        var email = request.Email?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(username))
        {
            errors["username"] = ["Choose a username."];
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            errors["email"] = ["Enter your email address."];
        }
        else if (EmailValidator.GetValidationResult(email, new ValidationContext(email)) != ValidationResult.Success)
        {
            errors["email"] = ["Enter a valid email address."];
        }

        if (string.IsNullOrEmpty(password))
        {
            errors["password"] = ["Choose a password."];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        cancellationToken.ThrowIfCancellationRequested();

        if (await userManager.FindByNameAsync(username) is not null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["username"] = ["That username is already taken."],
            });
        }

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["email"] = ["That email address is already registered."],
            });
        }

        var user = new LorexUser { UserName = username, Email = email };
        var result = await userManager.CreateAsync(user, password);

        if (!result.Succeeded)
        {
            return Results.ValidationProblem(ToValidationErrors(result));
        }

        await signInManager.SignInAsync(user, isPersistent: true);
        return Results.Ok(ToResponse(user));
    }

    private static async Task<IResult> LoginAsync(
        [FromBody] LoginRequest request,
        UserManager<LorexUser> userManager,
        SignInManager<LorexUser> signInManager,
        CancellationToken cancellationToken)
    {
        var identifier = request.UsernameOrEmail?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        if (string.IsNullOrWhiteSpace(identifier) || string.IsNullOrEmpty(password))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["credentials"] = [InvalidCredentials],
            });
        }

        cancellationToken.ThrowIfCancellationRequested();

        // An identifier containing "@" is treated as an email first, then falls back to a
        // username, so a username that happens to contain "@" still works.
        var user = identifier.Contains('@', StringComparison.Ordinal)
            ? await userManager.FindByEmailAsync(identifier) ?? await userManager.FindByNameAsync(identifier)
            : await userManager.FindByNameAsync(identifier) ?? await userManager.FindByEmailAsync(identifier);

        if (user is null)
        {
            return InvalidCredentialsProblem();
        }

        var signIn = await signInManager.PasswordSignInAsync(
            user, password, isPersistent: true, lockoutOnFailure: true);

        if (signIn.IsLockedOut)
        {
            return Results.Problem(
                title: "Account temporarily locked",
                detail: "Too many failed sign-in attempts. Try again in a few minutes.",
                statusCode: StatusCodes.Status423Locked);
        }

        if (!signIn.Succeeded)
        {
            return InvalidCredentialsProblem();
        }

        return Results.Ok(ToResponse(user));
    }

    private static async Task<IResult> LogoutAsync(SignInManager<LorexUser> signInManager)
    {
        await signInManager.SignOutAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetCurrentUser(
        ClaimsPrincipal principal,
        UserManager<LorexUser> userManager)
    {
        var user = await userManager.GetUserAsync(principal);
        return user is null ? Results.Unauthorized() : Results.Ok(ToResponse(user));
    }

    private static IResult InvalidCredentialsProblem() =>
        Results.Problem(
            title: "Sign-in failed",
            detail: InvalidCredentials,
            statusCode: StatusCodes.Status401Unauthorized);

    private static AuthUserResponse ToResponse(LorexUser user) =>
        new(user.Id, user.UserName ?? string.Empty, user.Email ?? string.Empty);

    private static Dictionary<string, string[]> ToValidationErrors(IdentityResult result)
    {
        var errors = new Dictionary<string, List<string>>();

        foreach (var error in result.Errors)
        {
            // Identity codes are prefixed by the field they concern (PasswordTooShort, ...).
            var key = error.Code.StartsWith("Password", StringComparison.Ordinal) ? "password"
                : error.Code.Contains("Email", StringComparison.Ordinal) ? "email"
                : error.Code.Contains("UserName", StringComparison.Ordinal) ? "username"
                : "request";

            if (!errors.TryGetValue(key, out var list))
            {
                list = [];
                errors[key] = list;
            }

            list.Add(error.Description);
        }

        return errors.ToDictionary(pair => pair.Key, pair => pair.Value.ToArray());
    }
}
