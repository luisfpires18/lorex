using Microsoft.AspNetCore.Identity;

namespace Lorex.Api.Features.Auth;

/// <summary>
/// Application user. Identity already supplies Id, UserName, Email and the security
/// stamps, so nothing is redeclared here. Profile fields land here when they are needed.
/// </summary>
public sealed class LorexUser : IdentityUser
{
}
