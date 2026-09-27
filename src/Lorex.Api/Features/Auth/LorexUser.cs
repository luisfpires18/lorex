using Microsoft.AspNetCore.Identity;

namespace Lorex.Api.Features.Auth;

/// <summary>
/// Application user. Identity already supplies Id, UserName, Email and the security
/// stamps, so nothing is redeclared here. Profile fields land here when they are needed.
/// </summary>
public sealed class LorexUser : IdentityUser
{
    /// <summary>
    /// The name the public portal shows as the author of this account's published universes, and
    /// nothing else of the account ever is: not the username (a login), not the email. Chosen, never
    /// derived from either. Read live, so a change reaches every published world at once (ADR 0036).
    /// </summary>
    public string? PublicDisplayName { get; set; }
}
