using System.Security.Claims;
using Lorex.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Universes;

/// <summary>
/// The signed-in account's own invitations (ADR 0041 amendment). Lorex does not verify email addresses, so an address is
/// never permission by itself. An invitation reaches an account in exactly two ways:
///
/// <para><b>Bound</b> - an account already held the address when the owner invited it, so the invitation carries that
/// account's id. Only that account lists it in My workspace and accepts or declines it there, by id
/// (<c>/api/invitations/{id}</c>).</para>
///
/// <para><b>By its link</b> - the protected token the owner copies (<see cref="InvitationClaims"/>), at
/// <c>/api/invitations/claim/{token}</c>. A bound invitation still answers only its own account; an unbound one answers
/// the account whose normalized email matches, the link being the proof and the email a consistency check. Anyone else
/// learns only that it is for a different account - never the universe, role, owner or address. A token that is missing,
/// forged or edited opens nothing.</para>
///
/// <para>The database decides the rest: the invitation must still exist, be live, and the role is read from it at the
/// moment of acceptance - so a revoke, expiry, accept or decline ends every link ever issued for it. Accepting is one
/// transaction, begun IMMEDIATE by Microsoft.Data.Sqlite, so a second accept, a revoke or a role change racing it is
/// serialised behind it and meets its result. Nothing here answers a signed-out caller.</para>
/// </summary>
public static class InvitationEndpoints
{
    public const string NotFoundCode = "invitation_not_found";
    public const string OtherAccountCode = "invitation_other_account";
    public const string ExpiredCode = "invitation_expired";
    public const string OwnUniverseCode = "invitation_own_universe";

    public static IEndpointRouteBuilder MapInvitationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/invitations")
            .WithTags("Invitations")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListMyInvitations");
        group.MapPost("/{invitationId:guid}/accept", AcceptBoundAsync).WithName("AcceptInvitation");
        group.MapPost("/{invitationId:guid}/decline", DeclineBoundAsync).WithName("DeclineInvitation");
        group.MapGet("/claim/{token}", GetClaimAsync).WithName("GetClaimedInvitation");
        group.MapPost("/claim/{token}/accept", AcceptClaimAsync).WithName("AcceptClaimedInvitation");
        group.MapPost("/claim/{token}/decline", DeclineClaimAsync).WithName("DeclineClaimedInvitation");

        return endpoints;
    }

    /// <summary>
    /// Live invitations bound to this account, to universes it neither owns nor already works on. Never one matched by
    /// email alone: an unbound invitation is reached through its link.
    /// </summary>
    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var now = clock.GetUtcNow().UtcDateTime;

        var invitations = await db.UniverseInvitations.AsNoTracking()
            .Where(invitation => invitation.TargetUserId == userId
                && invitation.ExpiresAt > now
                && invitation.Universe!.OwnerId != userId
                && !db.UniverseMemberships.Any(membership => membership.UniverseId == invitation.UniverseId && membership.UserId == userId))
            .OrderByDescending(invitation => invitation.CreatedAt)
            .Select(invitation => new ReceivedInvitationResponse(
                invitation.Id, invitation.UniverseId, invitation.Universe!.Name, invitation.Role, invitation.ExpiresAt))
            .ToListAsync(cancellationToken);

        return Results.Ok(invitations);
    }

    // ---------- Bound, from My workspace ----------

    private static Task<IResult> AcceptBoundAsync(
        Guid invitationId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken) =>
        AcceptAsync(db, principal.RequireUserId(), clock, Bound(invitationId), cancellationToken);

    private static Task<IResult> DeclineBoundAsync(
        Guid invitationId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken) =>
        DeclineAsync(db, principal.RequireUserId(), clock, Bound(invitationId), cancellationToken);

    /// <summary>Only the account an invitation is bound to finds it by id; for anyone else it is not there.</summary>
    private static Locate Bound(Guid invitationId) => async (db, userId, cancellationToken) =>
    {
        var invitation = await db.UniverseInvitations
            .Include(candidate => candidate.Universe)
            .FirstOrDefaultAsync(candidate => candidate.Id == invitationId, cancellationToken);

        return invitation is not null && invitation.TargetUserId == userId
            ? (invitation, null)
            : (null, NotFoundProblem());
    };

    // ---------- By its protected link ----------

    private static async Task<IResult> GetClaimAsync(
        string token,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        IDataProtectionProvider protection,
        CancellationToken cancellationToken)
    {
        var (invitation, refused) = await Claimed(protection, token)(db, principal.RequireUserId(), cancellationToken);
        if (refused is not null)
        {
            return refused;
        }

        if (invitation!.ExpiresAt <= clock.GetUtcNow().UtcDateTime)
        {
            return ExpiredProblem();
        }

        return Results.Ok(new ReceivedInvitationResponse(
            invitation.Id, invitation.UniverseId, invitation.Universe!.Name, invitation.Role, invitation.ExpiresAt));
    }

    private static Task<IResult> AcceptClaimAsync(
        string token,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        IDataProtectionProvider protection,
        CancellationToken cancellationToken) =>
        AcceptAsync(db, principal.RequireUserId(), clock, Claimed(protection, token), cancellationToken);

    private static Task<IResult> DeclineClaimAsync(
        string token,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        IDataProtectionProvider protection,
        CancellationToken cancellationToken) =>
        DeclineAsync(db, principal.RequireUserId(), clock, Claimed(protection, token), cancellationToken);

    /// <summary>
    /// The invitation a link's token names, if this account may have it. In this order, so nothing past the first refusal
    /// is disclosed: a token this host did not issue, or one for an invitation no longer there, is not found; one for
    /// another account - bound to someone else, or unbound and addressed to another email - is someone else's.
    /// </summary>
    private static Locate Claimed(IDataProtectionProvider protection, string token) => async (db, userId, cancellationToken) =>
    {
        if (InvitationClaims.Read(protection, token) is not { } claim)
        {
            return (null, NotFoundProblem());
        }

        var invitation = await db.UniverseInvitations
            .Include(candidate => candidate.Universe)
            .FirstOrDefaultAsync(candidate => candidate.Id == claim.InvitationId, cancellationToken);

        // The token names the address it was issued for; an invitation that no longer carries it is not the one issued.
        if (invitation is null || invitation.NormalizedEmail != claim.NormalizedEmail)
        {
            return (null, NotFoundProblem());
        }

        var entitled = invitation.TargetUserId is { } target
            ? target == userId
            : invitation.NormalizedEmail == await db.Users
                .Where(user => user.Id == userId)
                .Select(user => user.NormalizedEmail)
                .FirstOrDefaultAsync(cancellationToken);

        return entitled
            ? (invitation, null)
            : (null, Problem(
                StatusCodes.Status403Forbidden,
                OtherAccountCode,
                "Invitation for another account",
                "This invitation is for a different account."));
    };

    // ---------- Accepting and declining, however the invitation was reached ----------

    private delegate Task<(UniverseInvitation? Invitation, IResult? Refused)> Locate(
        LorexDbContext db, string userId, CancellationToken cancellationToken);

    private static async Task<IResult> AcceptAsync(
        LorexDbContext db,
        string userId,
        TimeProvider clock,
        Locate locate,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var (invitation, refused) = await locate(db, userId, cancellationToken);
        if (refused is not null)
        {
            return refused;
        }

        if (invitation!.ExpiresAt <= clock.GetUtcNow().UtcDateTime)
        {
            return ExpiredProblem();
        }

        if (invitation.Universe!.OwnerId == userId)
        {
            return Problem(StatusCodes.Status409Conflict, OwnUniverseCode, "Your own universe", "You already own this universe.");
        }

        var existing = await db.UniverseMemberships.FirstOrDefaultAsync(
            membership => membership.UniverseId == invitation.UniverseId && membership.UserId == userId,
            cancellationToken);

        // Already a member - an earlier accept, say: the invitation is spent, and no second membership is made.
        var role = existing?.Role ?? invitation.Role;
        if (existing is null)
        {
            var now = DateTime.UtcNow;
            db.UniverseMemberships.Add(new UniverseMembership
            {
                UniverseId = invitation.UniverseId,
                UserId = userId,
                Role = invitation.Role,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        db.UniverseInvitations.Remove(invitation);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (failure is DbUpdateConcurrencyException || DatabaseFailures.IsUniqueViolation(failure))
        {
            // Spent or answered by a request that got there first: nothing of this one was written.
            return NotFoundProblem();
        }

        return Results.Ok(new AcceptedInvitationResponse(invitation.UniverseId, role));
    }

    /// <summary>Spends the invitation, lapsed or not, and makes nothing. The owner is not told; there is no history of it.</summary>
    private static async Task<IResult> DeclineAsync(
        LorexDbContext db,
        string userId,
        TimeProvider clock,
        Locate locate,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var (invitation, refused) = await locate(db, userId, cancellationToken);
        if (refused is not null)
        {
            return refused;
        }

        db.UniverseInvitations.Remove(invitation!);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return NotFoundProblem();
        }

        return Results.NoContent();
    }

    /// <summary>Missing, revoked, declined, already accepted, or a link not issued here: all the same to whoever asks.</summary>
    internal static IResult NotFoundProblem() =>
        Problem(StatusCodes.Status404NotFound, NotFoundCode, "Invitation not available", "This invitation is no longer available.");

    private static IResult ExpiredProblem() =>
        Problem(StatusCodes.Status410Gone, ExpiredCode, "Invitation expired", "This invitation has expired.");

    private static IResult Problem(int status, string code, string title, string detail) =>
        Results.Problem(
            title: title,
            detail: detail,
            statusCode: status,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
