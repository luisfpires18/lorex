using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.CollaboratorInvitationTests;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Who may claim an invitation, now that an email address is known not to be an identity (ADR 0041 amendment, the 030
/// correction). Lorex does not verify the address an account registers with, so typing the invited address proves
/// nothing. An invitation is claimed by the account it was privately bound to when that account already existed, or with
/// the protected link the owner sent - the email then only a consistency check. The owner is never told which.
/// </summary>
public sealed class InvitationClaimTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task An_existing_account_is_bound_privately_and_alone_sees_and_accepts_it()
    {
        var w = await NewSharedWorld(_factory, "claim-bound");
        var (ana, anaId) = await Register("claim-bound-ana");
        var (other, _) = await Register("claim-bound-other");

        var created = await Invite(w.Owner, w.U, "claim-bound-ana@example.test");
        var nobody = await Invite(w.Owner, w.U, "claim-bound-nobody@example.test");

        // 1, 5: bound to Ana's id, inside; the address no account held stays unbound.
        await WithDb(_factory, async db =>
        {
            Assert.Equal(anaId, await db.UniverseInvitations.Where(row => row.Id == created.Invitation.Id).Select(row => row.TargetUserId).SingleAsync());
            Assert.Null(await db.UniverseInvitations.Where(row => row.Id == nobody.Invitation.Id).Select(row => row.TargetUserId).SingleAsync());
        });

        // 2, 15: the owner's answers cannot tell the two apart - same status, same fields, no account id anywhere.
        Assert.Equal(created.Status, nobody.Status);
        Assert.Equal(Fields(created.Body), Fields(nobody.Body));
        Assert.DoesNotContain(anaId, created.Body, StringComparison.Ordinal);
        Assert.DoesNotContain("target", created.Body, StringComparison.OrdinalIgnoreCase);
        var listed = await w.Owner.GetStringAsync($"/api/universes/{w.U}/collaborators");
        Assert.DoesNotContain(anaId, listed, StringComparison.Ordinal);
        Assert.DoesNotContain("target", listed, StringComparison.OrdinalIgnoreCase);

        // 3: only Ana is shown it.
        Assert.Equal(created.Invitation.Id, Assert.Single(await Mine(ana)).Id);
        Assert.Empty(await Mine(other));
        foreach (var who in new[] { w.Editor, w.Reviewer, w.Viewer, w.Outsider })
        {
            Assert.Empty(await Mine(who));
        }

        // 4: nobody else claims it by id, and its link answers only Ana.
        await AssertCode(await other.PostAsync($"/api/invitations/{created.Invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertCode(await other.PostAsync($"{Claim(created.Invitation.ClaimToken)}/accept", null), HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);

        await Ok(ana.PostAsync($"/api/invitations/{created.Invitation.Id}/accept", null));
        await AssertMember(w.U, anaId, UniverseRole.Editor);
    }

    [Fact]
    public async Task An_account_made_later_with_the_invited_address_is_not_given_the_invitation()
    {
        var w = await NewSharedWorld(_factory, "claim-later");
        var created = await Invite(w.Owner, w.U, "claim-later-ana@example.test");

        // 6, 4: someone registers the address afterwards. Nothing surfaces, and nothing opens by id.
        var (impostor, impostorId) = await Register("claim-later-ana");
        Assert.Empty(await Mine(impostor));
        await AssertCode(await impostor.PostAsync($"/api/invitations/{created.Invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertCode(await impostor.PostAsync($"/api/invitations/{created.Invitation.Id}/decline", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertNotMember(w.U, impostorId);

        await WithDb(_factory, async db =>
        {
            var row = await db.UniverseInvitations.SingleAsync(candidate => candidate.Id == created.Invitation.Id);
            Assert.Null(row.TargetUserId);
        });
    }

    [Fact]
    public async Task The_link_opens_an_unbound_invitation_for_the_matching_account_and_nobody_else()
    {
        var w = await NewSharedWorld(_factory, "claim-link");
        var created = await Invite(w.Owner, w.U, "claim-link-ana@example.test", UniverseRole.Reviewer);
        var (ana, anaId) = await Register("claim-link-ana");
        var (other, otherId) = await Register("claim-link-other");
        var link = Claim(created.Invitation.ClaimToken);

        // 9: the link in another account's hands is someone else's, and says nothing more.
        var wrong = await other.GetAsync(link);
        await AssertCode(wrong, HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);
        var body = await wrong.Content.ReadAsStringAsync();
        foreach (var secret in new[] { "Shared claim-link", "claim-link-ana", w.U.ToString(), "Reviewer" })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }

        await AssertCode(await other.PostAsync($"{link}/accept", null), HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);
        await AssertNotMember(w.U, otherId);

        // 7: the matching account reads it.
        var read = (await ana.GetFromJsonAsync<ReceivedInvitationResponse>(link))!;
        Assert.Equal(new ReceivedInvitationResponse(created.Invitation.Id, w.U, "Shared claim-link", UniverseRole.Reviewer, created.Invitation.ExpiresAt), read);

        // A second link minted for the same invitation is just as good.
        var again = (await w.Owner.GetFromJsonAsync<CollaboratorsResponse>($"/api/universes/{w.U}/collaborators"))!.Invitations.Single();
        Assert.NotEqual(created.Invitation.ClaimToken, again.ClaimToken);
        Assert.Equal(read, await ana.GetFromJsonAsync<ReceivedInvitationResponse>(Claim(again.ClaimToken)));

        // 8: and accepts it.
        var accepted = await ana.PostAsync($"{link}/accept", null);
        Assert.Equal(new AcceptedInvitationResponse(w.U, UniverseRole.Reviewer), await accepted.Content.ReadFromJsonAsync<AcceptedInvitationResponse>());
        await AssertMember(w.U, anaId, UniverseRole.Reviewer);

        // 14: spent - every link to it, old or new, opens nothing now.
        await AssertCode(await ana.PostAsync($"{link}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertCode(await ana.GetAsync(Claim(again.ClaimToken)), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await WithDb(_factory, async db => Assert.Equal(1, await db.UniverseMemberships.CountAsync(row => row.UniverseId == w.U && row.UserId == anaId)));
    }

    [Fact]
    public async Task No_token_a_forged_token_or_an_edited_one_opens_nothing()
    {
        var w = await NewSharedWorld(_factory, "claim-forge");
        var created = await Invite(w.Owner, w.U, "claim-forge-ana@example.test");
        var (ana, anaId) = await Register("claim-forge-ana");
        var token = created.Invitation.ClaimToken;

        // 10, 11: nothing, garbage, an id instead of a token, a token edited by one character, or truncated.
        var edited = token[..^3] + (token[^3] == 'A' ? 'B' : 'A') + token[^2..];
        foreach (var bad in new[] { "not-a-token", created.Invitation.Id.ToString(), Convert.ToBase64String(Guid.NewGuid().ToByteArray()), edited, token[..(token.Length / 2)] })
        {
            await AssertCode(await ana.GetAsync(Claim(bad)), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
            await AssertCode(await ana.PostAsync($"{Claim(bad)}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        }

        await AssertCode(await ana.PostAsync($"/api/invitations/{created.Invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertNotMember(w.U, anaId);

        // A token issued for one invitation never opens another one, not even one to the same address after a revoke.
        await Ok(w.Owner.DeleteAsync($"/api/universes/{w.U}/invitations/{created.Invitation.Id}"));
        var fresh = await Invite(w.Owner, w.U, "claim-forge-ana@example.test");
        await AssertCode(await ana.GetAsync(Claim(token)), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        Assert.Equal(fresh.Invitation.Id, (await ana.GetFromJsonAsync<ReceivedInvitationResponse>(Claim(fresh.Invitation.ClaimToken)))!.Id);
    }

    [Fact]
    public async Task A_link_issued_before_expiry_revoke_or_decline_opens_nothing_after()
    {
        var w = await NewSharedWorld(_factory, "claim-after");
        var (ana, anaId) = await Register("claim-after-ana");

        // 12: expired.
        var expiring = await Invite(w.Owner, w.U, "claim-after-ana@example.test");
        await WithDb(_factory, db => db.UniverseInvitations.Where(row => row.Id == expiring.Invitation.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.ExpiresAt, DateTime.UtcNow.AddMinutes(-1))));
        await AssertCode(await ana.GetAsync(Claim(expiring.Invitation.ClaimToken)), HttpStatusCode.Gone, InvitationEndpoints.ExpiredCode);
        await AssertCode(await ana.PostAsync($"{Claim(expiring.Invitation.ClaimToken)}/accept", null), HttpStatusCode.Gone, InvitationEndpoints.ExpiredCode);

        // 13: revoked (the fresh invitation replaces the lapsed one).
        var revoked = await Invite(w.Owner, w.U, "claim-after-ana@example.test");
        await Ok(w.Owner.DeleteAsync($"/api/universes/{w.U}/invitations/{revoked.Invitation.Id}"));
        await AssertCode(await ana.PostAsync($"{Claim(revoked.Invitation.ClaimToken)}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);

        // 14: declined.
        var declined = await Invite(w.Owner, w.U, "claim-after-ana@example.test");
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsync($"{Claim(declined.Invitation.ClaimToken)}/decline", null)).StatusCode);
        await AssertCode(await ana.PostAsync($"{Claim(declined.Invitation.ClaimToken)}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertCode(await ana.PostAsync($"/api/invitations/{declined.Invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);

        await AssertNotMember(w.U, anaId);
    }

    // ---------- Helpers ----------

    private sealed record Created(HttpStatusCode Status, string Body, PendingInvitationResponse Invitation);

    private async Task<(HttpClient Client, string UserId)> Register(string name)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest($"user-{name}", $"{name}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static async Task<Created> Invite(HttpClient owner, Guid universeId, string email, UniverseRole role = UniverseRole.Editor)
    {
        var response = await owner.PostAsJsonAsync($"/api/universes/{universeId}/invitations", new InvitationRequest(email, role));
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, body);
        return new Created(response.StatusCode, body, JsonSerializer.Deserialize<PendingInvitationResponse>(body, JsonSerializerOptions.Web)!);
    }

    private static async Task<List<ReceivedInvitationResponse>> Mine(HttpClient client) =>
        (await client.GetFromJsonAsync<List<ReceivedInvitationResponse>>("/api/invitations"))!;

    private static List<string> Fields(string json) =>
        [.. JsonDocument.Parse(json).RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal)];

    private Task AssertMember(Guid universeId, string userId, UniverseRole role) =>
        WithDb(_factory, async db => Assert.Equal(role, (await db.UniverseMemberships.SingleAsync(row => row.UniverseId == universeId && row.UserId == userId)).Role));

    private Task AssertNotMember(Guid universeId, string userId) =>
        WithDb(_factory, async db => Assert.False(await db.UniverseMemberships.AnyAsync(row => row.UniverseId == universeId && row.UserId == userId)));

    private static async Task AssertCode(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.True(response.StatusCode == status, $"expected {(int)status}, got {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        Assert.Equal(code, await PublishingTestClient.ProblemCode(response));
    }
}
