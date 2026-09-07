using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// The single gate every lore route passes through. Nothing under a universe is read or
/// written without first proving the caller owns that universe, and the id the client
/// supplies is never trusted on its own.
/// </summary>
public static class LoreAccess
{
    /// <summary>
    /// Returns true when the universe exists and belongs to the caller. Callers turn a
    /// false into a 404, so a universe someone else owns is indistinguishable from one
    /// that does not exist.
    /// </summary>
    public static Task<bool> OwnsUniverseAsync(
        LorexDbContext db,
        Guid universeId,
        string ownerId,
        CancellationToken cancellationToken) =>
        db.Universes.AnyAsync(
            universe => universe.Id == universeId && universe.OwnerId == ownerId,
            cancellationToken);
}
