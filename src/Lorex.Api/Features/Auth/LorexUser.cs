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

    /// <summary>
    /// The account's public author address, <c>/authors/{slug}</c> (ADR 0037). Minted once, from
    /// <see cref="PublicDisplayName"/>, the first time the account publishes a universe, and never changed after -
    /// renaming the public name keeps it. Never taken from the username or the email. Resolves publicly only while
    /// the account has a public universe.
    /// </summary>
    public string? PublicAuthorSlug { get; set; }

    /// <summary>
    /// How many bytes of pictures the universes this account owns may hold (ADR 0042). Every account starts at
    /// <see cref="Storage.StorageQuota.DefaultBytes"/>; there is no unlimited value and no route an account can change
    /// its own with - only something trusted on the server, such as billing one day, may raise it.
    /// </summary>
    public long StorageQuotaBytes { get; set; } = Storage.StorageQuota.DefaultBytes;
}
