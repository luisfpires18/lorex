using System.Security.Claims;
using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Universes;

/// <summary>
/// The signed-in account's own invitations (ADR 0041 amendment): listed in My workspace, opened from a link, accepted or
/// declined.
///
/// <para><b>The id finds an invitation; it never opens one.</b> Every route matches the invitation's normalized email
/// against the signed-in account's own, read from the account itself - never from the request. A link opened by any
/// other account learns only that it is someone else's: not the universe, the role, the owner or the address. Nothing
/// here answers a signed-out caller.</para>
///
/// <para>Accepting is one transaction, begun IMMEDIATE by Microsoft.Data.Sqlite: the invitation is read, checked, turned
/// into a membership with the role it holds at that moment, and deleted, so a second accept, a revoke or a role change
/// racing it is serialised behind it and meets its result rather than a half-written one.</para>
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
        group.MapGet("/{invitationId:guid}", GetAsync).WithName("GetMyInvitation");
        group.MapPost("/{invitationId:guid}/accept", AcceptAsync).WithName("AcceptInvitation");
        group.MapPost("/{invitationId:guid}/decline", DeclineAsync).WithName("DeclineInvitation");

        return endpoints;
    }

    /// <summary>Live invitations to the account's address, to universes it neither owns nor already works on.</summary>
    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var email = await EmailOfAsync(db, userId, cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;

        var invitations = await db.UniverseInvitations.AsNoTracking()
            .Where(invitation => invitation.NormalizedEmail == email
                && invitation.ExpiresAt > now
                && invitation.Universe!.OwnerId != userId
                && !db.UniverseMemberships.Any(membership => membership.UniverseId == invitation.UniverseId && membership.UserId == userId))
            .OrderByDescending(invitation => invitation.CreatedAt)
            .Select(invitation => new ReceivedInvitationResponse(
                invitation.Id, invitation.UniverseId, invitation.Universe!.Name, invitation.Role, invitation.ExpiresAt))
            .ToListAsync(cancellationToken);

        return Results.Ok(invitations);
    }

    private static async Task<IResult> GetAsync(
        Guid invitationId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var invitation = await db.UniverseInvitations.AsNoTracking()
            .Include(candidate => candidate.Universe)
            .FirstOrDefaultAsync(candidate => candidate.Id == invitationId, cancellationToken);

        if (await RefusalAsync(db, invitation, userId, clock, cancellationToken) is { } refused)
        {
            return refused;
        }

        return Results.Ok(new ReceivedInvitationResponse(
            invitation!.Id, invitation.UniverseId, invitation.Universe!.Name, invitation.Role, invitation.ExpiresAt));
    }

    private static async Task<IResult> AcceptAsync(
        Guid invitationId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var invitation = await db.UniverseInvitations
            .Include(candidate => candidate.Universe)
            .FirstOrDefaultAsync(candidate => candidate.Id == invitationId, cancellationToken);

        if (await RefusalAsync(db, invitation, userId, clock, cancellationToken) is { } refused)
        {
            return refused;
        }

        if (invitation!.Universe!.OwnerId == userId)
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

    /// <summary>Spends the invitation and makes nothing. The owner is not told; there is no history of it.</summary>
    private static async Task<IResult> DeclineAsync(
        Guid invitationId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var invitation = await db.UniverseInvitations
            .FirstOrDefaultAsync(candidate => candidate.Id == invitationId, cancellationToken);

        if (await RefusalAsync(db, invitation, userId, clock, cancellationToken, allowExpired: true) is { } refused)
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

    // ---------- Helpers ----------

    /// <summary>
    /// Why this account cannot have this invitation, or null. In this order, so nothing past the first refusal is
    /// disclosed: no such invitation; one for another address (whether or not it is still live); one that has lapsed.
    /// </summary>
    private static async Task<IResult?> RefusalAsync(
        LorexDbContext db,
        UniverseInvitation? invitation,
        string userId,
        TimeProvider clock,
        CancellationToken cancellationToken,
        bool allowExpired = false)
    {
        if (invitation is null)
        {
            return NotFoundProblem();
        }

        if (invitation.NormalizedEmail != await EmailOfAsync(db, userId, cancellationToken))
        {
            return Problem(
                StatusCodes.Status403Forbidden,
                OtherAccountCode,
                "Invitation for another account",
                "This invitation is for a different account.");
        }

        return !allowExpired && invitation.ExpiresAt <= clock.GetUtcNow().UtcDateTime
            ? Problem(StatusCodes.Status410Gone, ExpiredCode, "Invitation expired", "This invitation has expired.")
            : null;
    }

    /// <summary>The account's normalized email, as Identity stored it - the one thing an invitation is matched on.</summary>
    private static Task<string?> EmailOfAsync(LorexDbContext db, string userId, CancellationToken cancellationToken) =>
        db.Users.Where(user => user.Id == userId).Select(user => user.NormalizedEmail).FirstOrDefaultAsync(cancellationToken);

    /// <summary>Missing, revoked, declined or already accepted: all the same to whoever asks.</summary>
    internal static IResult NotFoundProblem() =>
        Problem(StatusCodes.Status404NotFound, NotFoundCode, "Invitation not available", "This invitation is no longer available.");

    private static IResult Problem(int status, string code, string title, string detail) =>
        Results.Problem(
            title: title,
            detail: detail,
            statusCode: status,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
