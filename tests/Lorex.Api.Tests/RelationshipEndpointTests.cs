using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Tests;

/// <summary>
/// Relationships, and the two invariants that matter most: one stored row is read
/// correctly from both ends, and nothing resolves outside the caller's own universe.
/// Credentials here are obviously synthetic.
/// </summary>
public sealed class RelationshipEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Relationship types ----------

    [Fact]
    public async Task Owner_can_create_a_custom_relationship_type()
    {
        var (client, universe) = await SignedInWithUniverse("reltype");

        var created = await CreateType(client, universe.Id, "rules", "ruled by");

        Assert.Equal("rules", created.Name);
        Assert.Equal("ruled by", created.InverseName);
        Assert.False(created.IsSymmetric);
        Assert.Equal(0, created.RelationshipCount);
    }

    [Fact]
    public async Task A_symmetric_type_needs_no_inverse_name()
    {
        var (client, universe) = await SignedInWithUniverse("relsym");

        var created = await CreateType(client, universe.Id, "married to", inverseName: null, isSymmetric: true);

        Assert.True(created.IsSymmetric);
        Assert.Null(created.InverseName);
    }

    [Fact]
    public async Task A_directional_type_without_an_inverse_name_is_rejected()
    {
        var (client, universe) = await SignedInWithUniverse("relnoinverse");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types",
            new RelationshipTypeRequest("rules", null, false, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Owner_can_update_a_relationship_type()
    {
        var (client, universe) = await SignedInWithUniverse("reltypeedit");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}",
            new RelationshipTypeRequest("reigns over", "reigned over by", false, "Sovereignty.", 3));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;

        Assert.Equal("reigns over", updated.Name);
        Assert.Equal("reigned over by", updated.InverseName);
        Assert.Equal("Sovereignty.", updated.Description);
        Assert.Equal(3, updated.DisplayOrder);
    }

    [Fact]
    public async Task Turning_a_type_symmetric_clears_its_inverse_name()
    {
        var (client, universe) = await SignedInWithUniverse("relsymswitch");
        var type = await CreateType(client, universe.Id, "allied with", "allied with");

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}",
            new RelationshipTypeRequest("allied with", "ignored", true, null, null));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;

        Assert.True(updated.IsSymmetric);
        Assert.Null(updated.InverseName);
    }

    [Fact]
    public async Task A_relationship_type_still_in_use_cannot_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("reltypeinuse");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var response = await client.DeleteAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task An_unused_relationship_type_can_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("reltypefree");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.DeleteAsync(
            $"/api/universes/{universe.Id}/relationship-types/{type.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await ListTypes(client, universe.Id));
    }

    // ---------- Directional and symmetric perspective ----------

    [Fact]
    public async Task A_directional_relationship_reads_forward_from_its_source()
    {
        var (client, universe) = await SignedInWithUniverse("reldirection");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        Assert.Equal(world.First.Id, created.SourceEntityId);
        Assert.Equal(world.Second.Id, created.TargetEntityId);

        var fromAragorn = Assert.Single(await ListFor(client, universe.Id, world.First.Id));

        Assert.Equal(RelationshipPerspective.Forward, fromAragorn.Perspective);
        Assert.Equal("rules", fromAragorn.Label);
        Assert.Equal(world.Second.Id, fromAragorn.RelatedEntityId);
        Assert.Equal("Gondor", fromAragorn.RelatedEntityName);
    }

    [Fact]
    public async Task The_same_row_reads_inverted_from_its_target()
    {
        var (client, universe) = await SignedInWithUniverse("relinverse");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var fromGondor = Assert.Single(await ListFor(client, universe.Id, world.Second.Id));

        // One stored row, read from the other end: same id, inverted wording.
        Assert.Equal(created.Id, fromGondor.Id);
        Assert.Equal(RelationshipPerspective.Inverse, fromGondor.Perspective);
        Assert.Equal("ruled by", fromGondor.Label);
        Assert.Equal(world.First.Id, fromGondor.RelatedEntityId);
        Assert.Equal("Aragorn", fromGondor.RelatedEntityName);

        // The stored direction still travels with the row so it stays editable in place.
        Assert.Equal(world.First.Id, fromGondor.SourceEntityId);
        Assert.Equal(world.Second.Id, fromGondor.TargetEntityId);
    }

    [Fact]
    public async Task A_symmetric_relationship_reads_the_same_from_both_ends()
    {
        var (client, universe) = await SignedInWithUniverse("relsymread");
        var world = await Cast(client, universe.Id, "Aragorn", "Arwen");
        var type = await CreateType(client, universe.Id, "married to", inverseName: null, isSymmetric: true);
        await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var fromAragorn = Assert.Single(await ListFor(client, universe.Id, world.First.Id));
        var fromArwen = Assert.Single(await ListFor(client, universe.Id, world.Second.Id));

        Assert.Equal("married to", fromAragorn.Label);
        Assert.Equal("married to", fromArwen.Label);
        Assert.Equal(world.Second.Id, fromAragorn.RelatedEntityId);
        Assert.Equal(world.First.Id, fromArwen.RelatedEntityId);
    }

    // ---------- Stored detail ----------

    [Fact]
    public async Task Notes_canon_status_and_optional_dates_persist()
    {
        var (client, universe) = await SignedInWithUniverse("relfields");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var start = new DateTime(3019, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(3120, 3, 1, 0, 0, 0, DateTimeKind.Utc);

        var created = await CreateRelationship(
            client, universe.Id, type.Id, world.First.Id, world.Second.Id,
            canonStatus: CanonStatus.Canon,
            startDate: start,
            endDate: end,
            notes: "Crowned after the War of the Ring.");

        var fetched = (await client.GetFromJsonAsync<RelationshipDetail>(
            $"/api/universes/{universe.Id}/relationships/{created.Id}"))!;

        Assert.Equal(CanonStatus.Canon, fetched.CanonStatus);
        Assert.Equal(start, fetched.StartDate);
        Assert.Equal(end, fetched.EndDate);
        Assert.Equal("Crowned after the War of the Ring.", fetched.Notes);

        var view = Assert.Single(await ListFor(client, universe.Id, world.First.Id));
        Assert.Equal(CanonStatus.Canon, view.CanonStatus);
        Assert.Equal(start, view.StartDate);
        Assert.Equal(end, view.EndDate);
        Assert.Equal("Crowned after the War of the Ring.", view.Notes);
    }

    [Fact]
    public async Task Dates_are_optional()
    {
        var (client, universe) = await SignedInWithUniverse("reldateless");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        Assert.Null(created.StartDate);
        Assert.Null(created.EndDate);
        Assert.Null(created.Notes);
    }

    [Fact]
    public async Task An_end_date_before_the_start_date_is_rejected()
    {
        var (client, universe) = await SignedInWithUniverse("reldateorder");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(
                type.Id,
                world.First.Id,
                world.Second.Id,
                CanonStatus.Idea,
                new DateTime(3120, 3, 1, 0, 0, 0, DateTimeKind.Utc),
                new DateTime(3019, 5, 1, 0, 0, 0, DateTimeKind.Utc),
                null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_entity_cannot_be_related_to_itself()
    {
        var (client, universe) = await SignedInWithUniverse("relself");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(
                type.Id, world.First.Id, world.First.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_a_relationship_rewrites_the_single_stored_row()
    {
        var (client, universe) = await SignedInWithUniverse("reledit");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships/{created.Id}",
            new RelationshipRequest(
                type.Id,
                world.First.Id,
                world.Second.Id,
                CanonStatus.Draft,
                null,
                null,
                "Still being decided."));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;

        Assert.Equal(created.Id, updated.Id);
        Assert.Equal(CanonStatus.Draft, updated.CanonStatus);
        Assert.Equal("Still being decided.", updated.Notes);
        Assert.Single(await ListFor(client, universe.Id, world.First.Id));
    }

    [Fact]
    public async Task Deleting_a_relationship_removes_it_from_both_entities()
    {
        var (client, universe) = await SignedInWithUniverse("reldelete");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        var created = await CreateRelationship(client, universe.Id, type.Id, world.First.Id, world.Second.Id);

        var response = await client.DeleteAsync($"/api/universes/{universe.Id}/relationships/{created.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await ListFor(client, universe.Id, world.First.Id));
        Assert.Empty(await ListFor(client, universe.Id, world.Second.Id));
    }

    // ---------- Universe ownership ----------

    [Fact]
    public async Task Both_ends_must_live_in_the_same_universe()
    {
        var (client, home) = await SignedInWithUniverse("relsameuniverse");
        var world = await Cast(client, home.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, home.Id, "rules", "ruled by");

        // A second universe owned by the same author: ownership passes, the entity still
        // does not belong here.
        var away = await CreateUniverse(client, "Elsewhere");
        var awayType = await FirstDefaultType(client, away.Id);
        var outsider = await CreateEntity(client, away.Id, awayType.Id, "Someone Else");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{home.Id}/relationships",
            new RelationshipRequest(
                type.Id, world.First.Id, outsider.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_relationship_type_from_another_universe_is_rejected()
    {
        var (client, home) = await SignedInWithUniverse("relforeigntype");
        var world = await Cast(client, home.Id, "Aragorn", "Gondor");

        var away = await CreateUniverse(client, "Elsewhere");
        var awayType = await CreateType(client, away.Id, "rules", "ruled by");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{home.Id}/relationships",
            new RelationshipRequest(
                awayType.Id, world.First.Id, world.Second.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Another_owner_cannot_read_a_relationship()
    {
        var (alice, aliceUniverse, aliceWorld, aliceType) = await Populated("relread-a");
        var link = await CreateRelationship(
            alice, aliceUniverse.Id, aliceType.Id, aliceWorld.First.Id, aliceWorld.Second.Id);

        var bob = await SignedInClient("user-relread-b");

        var get = await bob.GetAsync($"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}");
        var list = await bob.GetAsync(
            $"/api/universes/{aliceUniverse.Id}/entities/{aliceWorld.First.Id}/relationships");
        var types = await bob.GetAsync($"/api/universes/{aliceUniverse.Id}/relationship-types");

        // 404 everywhere: someone else's universe is indistinguishable from one that does
        // not exist.
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, types.StatusCode);
    }

    [Fact]
    public async Task Another_owner_cannot_mutate_or_delete_a_relationship()
    {
        var (alice, aliceUniverse, aliceWorld, aliceType) = await Populated("relmutate-a");
        var link = await CreateRelationship(
            alice, aliceUniverse.Id, aliceType.Id, aliceWorld.First.Id, aliceWorld.Second.Id);

        var bob = await SignedInClient("user-relmutate-b");

        var update = await bob.PutAsJsonAsync(
            $"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}",
            new RelationshipRequest(
                aliceType.Id,
                aliceWorld.First.Id,
                aliceWorld.Second.Id,
                CanonStatus.Canon,
                null,
                null,
                "Tampered."));

        var delete = await bob.DeleteAsync($"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}");

        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);

        var untouched = (await alice.GetFromJsonAsync<RelationshipDetail>(
            $"/api/universes/{aliceUniverse.Id}/relationships/{link.Id}"))!;
        Assert.Equal(CanonStatus.Idea, untouched.CanonStatus);
        Assert.Null(untouched.Notes);
    }

    [Fact]
    public async Task Another_owner_cannot_delete_a_relationship_type()
    {
        var (alice, aliceUniverse) = await SignedInWithUniverse("reltypeown-a");
        var aliceType = await CreateType(alice, aliceUniverse.Id, "rules", "ruled by");

        var bob = await SignedInClient("user-reltypeown-b");

        var update = await bob.PutAsJsonAsync(
            $"/api/universes/{aliceUniverse.Id}/relationship-types/{aliceType.Id}",
            new RelationshipTypeRequest("hijacked", "hijacked by", false, null, null));
        var delete = await bob.DeleteAsync(
            $"/api/universes/{aliceUniverse.Id}/relationship-types/{aliceType.Id}");

        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
    }

    [Fact]
    public async Task An_entity_owned_by_someone_else_cannot_be_targeted()
    {
        var (alice, aliceUniverse, aliceWorld, _) = await Populated("reltarget-a");
        var (bob, bobUniverse, bobWorld, bobType) = await Populated("reltarget-b");

        var response = await bob.PostAsJsonAsync(
            $"/api/universes/{bobUniverse.Id}/relationships",
            new RelationshipRequest(
                bobType.Id, bobWorld.First.Id, aliceWorld.First.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        // Nothing was written into either universe.
        Assert.Empty(await ListFor(bob, bobUniverse.Id, bobWorld.First.Id));
        Assert.Empty(await ListFor(alice, aliceUniverse.Id, aliceWorld.First.Id));
    }

    [Fact]
    public async Task A_relationship_type_owned_by_someone_else_cannot_be_used()
    {
        var (alice, aliceUniverse) = await SignedInWithUniverse("reltypeuse-a");
        var aliceType = await CreateType(alice, aliceUniverse.Id, "rules", "ruled by");

        var (bob, bobUniverse, bobWorld, _) = await Populated("reltypeuse-b");

        var response = await bob.PostAsJsonAsync(
            $"/api/universes/{bobUniverse.Id}/relationships",
            new RelationshipRequest(
                aliceType.Id, bobWorld.First.Id, bobWorld.Second.Id, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await ListFor(bob, bobUniverse.Id, bobWorld.First.Id));
    }

    [Fact]
    public async Task Identity_and_timestamps_cannot_be_overposted()
    {
        var (client, universe) = await SignedInWithUniverse("reloverpost");
        var world = await Cast(client, universe.Id, "Aragorn", "Gondor");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");

        var planted = Guid.NewGuid();
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new
            {
                id = planted,
                universeId = Guid.NewGuid(),
                relationshipTypeId = type.Id,
                sourceEntityId = world.First.Id,
                targetEntityId = world.Second.Id,
                canonStatus = CanonStatus.Idea,
                createdAt = new DateTime(1999, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                updatedAt = new DateTime(1999, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;

        Assert.NotEqual(planted, created.Id);
        Assert.True(created.CreatedAt > new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        // The row landed in the caller's universe, not the one they tried to name.
        Assert.Single(await ListFor(client, universe.Id, world.First.Id));
    }

    // ---------- Helpers ----------

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }

    /// <summary>A signed-in owner with a universe, two entities and a directional type.</summary>
    private async Task<(HttpClient Client, UniverseDetail Universe, (EntityDetail First, EntityDetail Second) World,
        RelationshipTypeResponse Type)> Populated(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(tag);
        var world = await Cast(client, universe.Id, $"First {tag}", $"Second {tag}");
        var type = await CreateType(client, universe.Id, "rules", "ruled by");
        return (client, universe, world, type);
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> FirstDefaultType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character");
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, null, CanonStatus.Idea, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<(EntityDetail First, EntityDetail Second)> Cast(
        HttpClient client,
        Guid universeId,
        string first,
        string second)
    {
        var type = await FirstDefaultType(client, universeId);
        return (
            await CreateEntity(client, universeId, type.Id, first),
            await CreateEntity(client, universeId, type.Id, second));
    }

    private static async Task<List<RelationshipTypeResponse>> ListTypes(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<RelationshipTypeResponse>>(
            $"/api/universes/{universeId}/relationship-types"))!;

    private static async Task<RelationshipTypeResponse> CreateType(
        HttpClient client,
        Guid universeId,
        string name,
        string? inverseName = null,
        bool isSymmetric = false,
        string? description = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest(name, inverseName, isSymmetric, description, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    private static async Task<RelationshipDetail> CreateRelationship(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        Guid sourceId,
        Guid targetId,
        CanonStatus canonStatus = CanonStatus.Idea,
        DateTime? startDate = null,
        DateTime? endDate = null,
        string? notes = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new RelationshipRequest(typeId, sourceId, targetId, canonStatus, startDate, endDate, notes));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;
    }

    private static async Task<List<RelationshipView>> ListFor(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<RelationshipView>>(
            $"/api/universes/{universeId}/entities/{entityId}/relationships"))!;
}
