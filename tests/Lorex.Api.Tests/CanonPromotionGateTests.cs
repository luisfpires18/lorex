using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// The promotion gate: the point at which High severity finally stops something.
///
/// Two claims are being tested against each other here, and they pull in opposite
/// directions. A write that would make a universe newly self-contradictory is refused
/// outright, and the refusal has to be total - nothing of the candidate survives, in the lore
/// or in the recorded conflicts. A universe that is *already* contradictory, meanwhile, has to
/// stay fully writable, because a half-finished world is the normal state of one and freezing
/// it would punish the author for using the tool. Most of what follows is the second claim:
/// proving that an existing High conflict, dismissed or not, blocks nothing at all.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class CanonPromotionGateTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- What the gate refuses ----------

    [Fact]
    public async Task An_edit_that_makes_a_character_die_before_it_is_born_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("gate001");
        var fields = await LifespanFields(client, universe.Id);
        var character = await Character(client, universe.Id, "Ancalagon", fields, birth: 500, death: null);

        var response = await Put(client, universe.Id, character, Years(fields, 500, 400));

        var blocked = await Blocked(response);
        Assert.Equal(CanonPromotionGate.BlockedCode, blocked.Code);
        Assert.Equal("CANON-LIFE-001", Assert.Single(blocked.BlockingFindings).RuleCode);
    }

    [Fact]
    public async Task A_canon_moment_before_a_participant_was_born_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("gate002");
        var fields = await LifespanFields(client, universe.Id);
        var character = await Character(client, universe.Id, "Beren", fields, birth: 500, death: null);

        var response = await PostMoment(
            client, universe.Id, "The Oath", startYear: 400, participants: [character.Id]);

        var blocked = await Blocked(response);
        Assert.Equal("CANON-LIFE-002", Assert.Single(blocked.BlockingFindings).RuleCode);
    }

    [Fact]
    public async Task A_canon_moment_after_a_participant_died_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("gate003");
        var fields = await LifespanFields(client, universe.Id);
        var character = await Character(client, universe.Id, "Fingolfin", fields, birth: 100, death: 200);

        var response = await PostMoment(
            client, universe.Id, "The Last Ride", startYear: 300, participants: [character.Id]);

        var blocked = await Blocked(response);
        Assert.Equal("CANON-LIFE-003", Assert.Single(blocked.BlockingFindings).RuleCode);
    }

    /// <summary>
    /// The whole 409 body, once. A client has to be able to act on this without parsing prose:
    /// the code says why it was refused, and each finding names its rule, its severity, its
    /// fingerprint and the records that disagree.
    /// </summary>
    [Fact]
    public async Task A_refusal_says_which_rule_and_which_records()
    {
        var (client, universe) = await SignedInWithUniverse("gatebody");
        var fields = await LifespanFields(client, universe.Id);
        var character = await Character(client, universe.Id, "Maeglin", fields, birth: 316, death: null);

        var response = await Put(client, universe.Id, character, Years(fields, 316, 300));
        var blocked = await Blocked(response);

        Assert.Equal(409, blocked.Status);
        Assert.Equal(CanonPromotionGate.BlockedCode, blocked.Code);

        var finding = Assert.Single(blocked.BlockingFindings);
        Assert.Equal("CANON-LIFE-001", finding.RuleCode);
        Assert.Equal(CanonConflictSeverity.High, finding.Severity);
        Assert.NotEmpty(finding.Fingerprint);
        Assert.NotEmpty(finding.Title);
        Assert.NotEmpty(finding.Explanation);

        Assert.Contains(
            finding.Subjects,
            subject => subject.Kind == CanonSubjectKind.Entity && subject.SubjectId == character.Id);
        Assert.Contains(
            finding.Subjects,
            subject => subject.Kind == CanonSubjectKind.EntityField && subject.Role == "death");
    }

    // ---------- What a refusal leaves behind ----------

    [Fact]
    public async Task A_refused_edit_leaves_the_lore_exactly_as_it_was()
    {
        var (client, universe) = await SignedInWithUniverse("gateatomic");
        var fields = await LifespanFields(client, universe.Id);
        var character = await Character(client, universe.Id, "Turin", fields, birth: 473, death: null);

        var response = await Put(
            client, universe.Id, character with { Name = "Turin Turambar" }, Years(fields, 473, 400));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        // Not just the death year: the rename rode along on the same request, and it must be
        // gone too. A refusal rolls back the whole candidate, not the offending part of it.
        var stored = await Entity(client, universe.Id, character.Id);
        Assert.Equal("Turin", stored.Name);
        Assert.Equal(473, Number(stored, fields.Birth.Id));
        Assert.Null(Number(stored, fields.Death.Id));
    }

    [Fact]
    public async Task A_refused_moment_is_never_written()
    {
        var (client, universe) = await SignedInWithUniverse("gatenomoment");
        var fields = await LifespanFields(client, universe.Id);
        var character = await Character(client, universe.Id, "Huor", fields, birth: 444, death: 472);

        var response = await PostMoment(
            client, universe.Id, "A Later Battle", startYear: 500, participants: [character.Id]);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var page = await client.GetFromJsonAsync<TimelineEntryPage>(
            $"/api/universes/{universe.Id}/timeline?pageSize=100");
        Assert.Empty(page!.Items);
    }

    /// <summary>
    /// The subtler half of atomicity. Detecting the candidate must not reconcile anything: a
    /// dismissal already on record survives untouched, no conflict is opened for the finding
    /// that caused the refusal, and nothing is resolved because the candidate briefly existed.
    /// </summary>
    [Fact]
    public async Task A_refused_edit_does_not_disturb_the_conflicts_already_on_record()
    {
        var (client, universe) = await SignedInWithUniverse("gatelifecycle");
        var fields = await LifespanFields(client, universe.Id);
        var broken = await LorePredatingTheGate(client, universe.Id, "Ar-Pharazon", fields, 3118, 3000);
        var other = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: null);

        await Evaluate(client, universe.Id);
        var before = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal("CANON-LIFE-001", before.RuleCode);

        await Dismiss(client, universe.Id, before.Id);
        var dismissed = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(CanonConflictStatus.Dismissed, dismissed.Status);

        var response = await Put(client, universe.Id, other, Years(fields, 3119, 3000));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var after = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(dismissed.Id, after.Id);
        Assert.Equal(CanonConflictStatus.Dismissed, after.Status);
        Assert.Equal(dismissed.UpdatedAt, after.UpdatedAt);
        Assert.Null(after.ResolvedAt);

        // And the rejected character is unchanged, so the second conflict has nothing to be
        // about the next time evaluation runs.
        Assert.Null(Number(await Entity(client, universe.Id, other.Id), fields.Death.Id));

        // The dismissed conflict is still about a real problem, so evaluation still finds it
        // and still leaves the dismissal alone. Nothing the refusal did changed that.
        await Evaluate(client, universe.Id);
        var settled = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(CanonConflictStatus.Dismissed, settled.Status);
        Assert.Equal(
            broken.Id,
            Assert.Single(settled.Subjects, subject => subject.Kind == CanonSubjectKind.Entity).SubjectId);
    }

    // ---------- What the gate must never block ----------

    [Fact]
    public async Task An_existing_high_conflict_does_not_block_an_unrelated_edit()
    {
        var (client, universe) = await SignedInWithUniverse("gateunrelated");
        var fields = await LifespanFields(client, universe.Id);
        await LorePredatingTheGate(client, universe.Id, "Ar-Pharazon", fields, 3118, 3000);
        await Evaluate(client, universe.Id);

        var bystander = await Character(client, universe.Id, "Amandil", fields, birth: 3100, death: null);
        var response = await Put(
            client, universe.Id, bystander with { Summary = "Lord of Andunie." }, Years(fields, 3100, 3119));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await Entity(client, universe.Id, bystander.Id);
        Assert.Equal("Lord of Andunie.", saved.Summary);
        Assert.Equal(3119, Number(saved, fields.Death.Id));
    }

    /// <summary>
    /// Re-saving lore that is already contradictory. The candidate carries the very same High
    /// fingerprint the universe already has, so it is not one the write introduced, and the
    /// write goes through - otherwise a mistake would be unfixable by any route except the one
    /// that removes it.
    /// </summary>
    [Fact]
    public async Task A_high_conflict_already_on_record_does_not_block_the_lore_it_is_about()
    {
        var (client, universe) = await SignedInWithUniverse("gatesame");
        var fields = await LifespanFields(client, universe.Id);
        var broken = await LorePredatingTheGate(client, universe.Id, "Celebrimbor", fields, 1697, 1600);
        await Evaluate(client, universe.Id);

        var response = await Put(
            client,
            universe.Id,
            broken with { Summary = "Still being worked out." },
            Years(fields, 1697, 1600));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Still being worked out.", (await Entity(client, universe.Id, broken.Id)).Summary);
    }

    [Fact]
    public async Task A_medium_finding_never_blocks_a_write()
    {
        var (client, universe) = await SignedInWithUniverse("gatemedium");
        var draft = await CreateEntity(client, universe.Id, "A Rumoured Figure", CanonStatus.Draft);

        // CANON-TIME-001: a Canon moment resting on a participant that is not Canon. Medium,
        // because unsettled lore is ordinary, so the write stands and the finding is reported.
        var response = await PostMoment(
            client, universe.Id, "The Council", startYear: 3018, participants: [draft.Id]);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal("CANON-TIME-001", conflict.RuleCode);
        Assert.Equal(CanonConflictSeverity.Medium, conflict.Severity);
    }

    [Fact]
    public async Task A_low_or_medium_producing_edit_is_never_refused_even_beside_a_high_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("gatemixed");
        var fields = await LifespanFields(client, universe.Id);
        await LorePredatingTheGate(client, universe.Id, "Ar-Pharazon", fields, 3118, 3000);
        await Evaluate(client, universe.Id);

        var draft = await CreateEntity(client, universe.Id, "An Unfinished Idea", CanonStatus.Draft);

        var response = await PostMoment(
            client, universe.Id, "A Half-Written Scene", startYear: 3200, participants: [draft.Id]);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    // ---------- Which write paths are gated ----------

    /// <summary>
    /// Promotion proper: the moment is legal as a draft and impossible as Canon, and only the
    /// status changes between the two requests.
    /// </summary>
    [Fact]
    public async Task Promoting_a_timeline_entry_to_canon_is_gated()
    {
        var (client, universe) = await SignedInWithUniverse("gatepromote");
        var fields = await LifespanFields(client, universe.Id);
        var character = await Character(client, universe.Id, "Earendil", fields, birth: 503, death: null);

        var draft = await Moment(
            client, universe.Id, "A Voyage", startYear: 400, participants: [character.Id],
            status: CanonStatus.Draft);

        var response = await PutMoment(
            client, universe.Id, draft.Id, "A Voyage", startYear: 400, participants: [character.Id],
            status: CanonStatus.Canon);

        var blocked = await Blocked(response);
        Assert.Equal("CANON-LIFE-002", Assert.Single(blocked.BlockingFindings).RuleCode);

        var stored = await client.GetFromJsonAsync<TimelineEntryResponse>(
            $"/api/universes/{universe.Id}/timeline/{draft.Id}");
        Assert.Equal(CanonStatus.Draft, stored!.CanonStatus);
    }

    /// <summary>
    /// Declaring what a field means is a write like any other. The numbers were already there
    /// and were harmless while the field meant nothing; saying it holds death years is what
    /// makes them contradict, so that request is the one refused.
    /// </summary>
    [Fact]
    public async Task Declaring_a_meaning_on_a_field_that_already_holds_values_is_gated()
    {
        var (client, universe) = await SignedInWithUniverse("gatesemantic");
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(
            client, universe.Id, type.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        var ended = await AddField(client, universe.Id, type.Id, "Ended", EntityFieldKind.Number);

        await CreateEntity(
            client, universe.Id, "Gil-galad", CanonStatus.Canon,
            [NumberValue(born.Id, 3300), NumberValue(ended.Id, 3200)]);

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{ended.Id}",
            new FieldDefinitionRequest(
                "Ended", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.DeathYear));

        var blocked = await Blocked(response);
        Assert.Equal("CANON-LIFE-001", Assert.Single(blocked.BlockingFindings).RuleCode);

        var reloaded = await CharacterType(client, universe.Id);
        Assert.Null(reloaded.Fields.Single(field => field.Id == ended.Id).Semantic);
    }

    /// <summary>
    /// The other half of entity promotion: years that are merely a draft's business become a
    /// contradiction the moment the entity is Canon, so it is the promotion that is refused and
    /// the draft is left exactly as it was, still holding both years.
    /// </summary>
    [Fact]
    public async Task Promoting_a_draft_character_with_impossible_years_to_canon_is_gated()
    {
        var (client, universe) = await SignedInWithUniverse("gatedraft");
        var fields = await LifespanFields(client, universe.Id);
        var draft = await CreateEntity(
            client, universe.Id, "A Rough Sketch", CanonStatus.Draft, Years(fields, 700, 600));

        var response = await Put(
            client, universe.Id, draft with { CanonStatus = CanonStatus.Canon }, Years(fields, 700, 600));

        var blocked = await Blocked(response);
        Assert.Equal("CANON-LIFE-001", Assert.Single(blocked.BlockingFindings).RuleCode);

        var stored = await Entity(client, universe.Id, draft.Id);
        Assert.Equal(CanonStatus.Draft, stored.CanonStatus);
        Assert.Equal(700, Number(stored, fields.Birth.Id));
        Assert.Equal(600, Number(stored, fields.Death.Id));
    }

    [Fact]
    public async Task Creating_a_canon_entity_that_is_born_after_it_dies_is_gated()
    {
        var (client, universe) = await SignedInWithUniverse("gatecreate");
        var fields = await LifespanFields(client, universe.Id);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(
                (await CharacterType(client, universe.Id)).Id,
                "An Impossible Life",
                null,
                null,
                CanonStatus.Canon,
                null,
                null,
                Years(fields, 900, 800)));

        var blocked = await Blocked(response);
        Assert.Equal("CANON-LIFE-001", Assert.Single(blocked.BlockingFindings).RuleCode);

        var page = await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universe.Id}/entities?pageSize=50");
        Assert.DoesNotContain(page!.Items, item => item.Name == "An Impossible Life");
    }

    /// <summary>
    /// Relationships are not behind the gate, because no High rule reads one - see the note on
    /// <c>RelationshipEndpoints</c>. What has to hold is that the path stays fully usable while
    /// the universe carries a High conflict, which is precisely the freeze this phase exists to
    /// avoid.
    /// </summary>
    [Fact]
    public async Task Relationship_writes_still_work_beside_a_high_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("gaterel");
        var fields = await LifespanFields(client, universe.Id);
        var broken = await LorePredatingTheGate(client, universe.Id, "Ar-Pharazon", fields, 3118, 3000);
        var other = await Character(client, universe.Id, "Tar-Palantir", fields, birth: 3035, death: 3255);
        await Evaluate(client, universe.Id);

        var kind = await RelationshipType(client, universe.Id, "Heir of", "Predecessor of");

        var created = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(kind.Id, broken.Id, other.Id, CanonStatus.Canon, null, null, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var relationship = (await created.Content.ReadFromJsonAsync<RelationshipDetail>())!;

        var updated = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships/{relationship.Id}",
            new RelationshipRequest(
                kind.Id, broken.Id, other.Id, CanonStatus.Canon, null, null, "Contested."));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        // The relationship changed nothing about severity: the one High conflict is still the
        // only High conflict, and it is still the lifespan.
        await Evaluate(client, universe.Id);
        var high = (await List(client, universe.Id)).Items
            .Where(conflict => conflict.Severity == CanonConflictSeverity.High)
            .ToList();
        Assert.Equal("CANON-LIFE-001", Assert.Single(high).RuleCode);
    }

    // ---------- The boundary the gate must not weaken ----------

    /// <summary>
    /// Ownership is proved before the gate is entered, so another owner gets the same empty 404
    /// as before and never learns whether the universe, the entity or the conflict exists - and
    /// never causes a rule sweep over lore that is not theirs.
    /// </summary>
    [Fact]
    public async Task Another_owner_cannot_reach_a_gated_route()
    {
        var (owner, universe) = await SignedInWithUniverse("gateowner");
        var fields = await LifespanFields(owner, universe.Id);
        var character = await Character(owner, universe.Id, "Numenor's Last King", fields, 3118, null);

        var intruder = await SignedInClient("user-gateintruder");

        var edit = await intruder.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entities/{character.Id}",
            new EntityRequest(
                character.EntityTypeId, "Renamed", null, null, CanonStatus.Canon, null, null,
                Years(fields, 3118, 3000)));
        Assert.Equal(HttpStatusCode.NotFound, edit.StatusCode);
        Assert.Equal(0, edit.Content.Headers.ContentLength ?? 0);

        var moment = await PostMoment(
            intruder, universe.Id, "Not Theirs", startYear: 400, participants: [character.Id]);
        Assert.Equal(HttpStatusCode.NotFound, moment.StatusCode);

        // The owner's lore is untouched, by the refused edit and by the 404 alike.
        var stored = await Entity(owner, universe.Id, character.Id);
        Assert.Equal("Numenor's Last King", stored.Name);
        Assert.Null(Number(stored, fields.Death.Id));
    }

    // ---------- Helpers ----------

    private sealed record LifespanFieldPair(FieldDefinitionResponse Birth, FieldDefinitionResponse Death);

    /// <summary>
    /// A Canon character whose years cannot both be true, already in place before the write
    /// under test happens.
    ///
    /// It has to be planted rather than authored, and that is the gate working rather than a
    /// gap in it: with the gate in place there is no request that will introduce a High
    /// finding, which
    /// <see cref="Promoting_a_draft_character_with_impossible_years_to_canon_is_gated"/> pins
    /// from the other side. What this stands for is lore promoted before the gate existed -
    /// which is the case the whole phase is about, because that lore must not freeze the
    /// universe around it.
    ///
    /// The lore itself is authored through the API, so it is ordinary and fully validated. Only
    /// the promotion is done behind the gate's back.
    /// </summary>
    private async Task<EntityDetail> LorePredatingTheGate(
        HttpClient client,
        Guid universeId,
        string name,
        LifespanFieldPair fields,
        double birth,
        double death)
    {
        var draft = await CreateEntity(
            client, universeId, name, CanonStatus.Draft, Years(fields, birth, death));

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            var stored = await db.Entities.FirstAsync(candidate => candidate.Id == draft.Id);
            stored.CanonStatus = CanonStatus.Canon;
            await db.SaveChangesAsync();
        }

        return await Entity(client, universeId, draft.Id);
    }

    private static async Task<CanonPromotionBlockedResponse> Blocked(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CanonPromotionBlockedResponse>())!;
    }

    private static async Task<LifespanFieldPair> LifespanFields(HttpClient client, Guid universeId)
    {
        var type = await CharacterType(client, universeId);

        return new LifespanFieldPair(
            await AddField(client, universeId, type.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear),
            await AddField(client, universeId, type.Id, "Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear));
    }

    private static Task<EntityDetail> Character(
        HttpClient client,
        Guid universeId,
        string name,
        LifespanFieldPair fields,
        double? birth,
        double? death) =>
        CreateEntity(client, universeId, name, CanonStatus.Canon, Years(fields, birth, death));

    private static List<FieldValueInput> Years(LifespanFieldPair fields, double? birth, double? death)
    {
        var values = new List<FieldValueInput>();

        if (birth is { } bornIn)
        {
            values.Add(NumberValue(fields.Birth.Id, bornIn));
        }

        if (death is { } diedIn)
        {
            values.Add(NumberValue(fields.Death.Id, diedIn));
        }

        return values;
    }

    private static FieldValueInput NumberValue(Guid fieldId, double value) =>
        new(fieldId, null, value, null, null, null, null);

    private static double? Number(EntityDetail entity, Guid fieldId) =>
        entity.Fields.FirstOrDefault(field => field.FieldDefinitionId == fieldId)?.Number;

    private static Task<HttpResponseMessage> Put(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        IReadOnlyList<FieldValueInput> fields) =>
        client.PutAsJsonAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.Content,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                fields));

    private static async Task<EntityDetail> Entity(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>(
            $"/api/universes/{universeId}/entities/{entityId}"))!;

    private static Task<HttpResponseMessage> PostMoment(
        HttpClient client,
        Guid universeId,
        string title,
        int startYear,
        IReadOnlyList<Guid> participants,
        CanonStatus status = CanonStatus.Canon) =>
        client.PostAsJsonAsync(
            $"/api/universes/{universeId}/timeline",
            new TimelineEntryRequest(
                title, null, status, TimelineDateKind.Exact, startYear, null, null, null, null, null,
                null, participants));

    private static Task<HttpResponseMessage> PutMoment(
        HttpClient client,
        Guid universeId,
        Guid entryId,
        string title,
        int startYear,
        IReadOnlyList<Guid> participants,
        CanonStatus status) =>
        client.PutAsJsonAsync(
            $"/api/universes/{universeId}/timeline/{entryId}",
            new TimelineEntryRequest(
                title, null, status, TimelineDateKind.Exact, startYear, null, null, null, null, null,
                null, participants));

    private static async Task<TimelineEntryResponse> Moment(
        HttpClient client,
        Guid universeId,
        string title,
        int startYear,
        IReadOnlyList<Guid> participants,
        CanonStatus status)
    {
        var response = await PostMoment(client, universeId, title, startYear, participants, status);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    private static async Task<RelationshipTypeResponse> RelationshipType(
        HttpClient client,
        Guid universeId,
        string name,
        string inverse)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest(name, inverse, false, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

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

        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest($"World {tag}", null, null));
        response.EnsureSuccessStatusCode();

        return (client, (await response.Content.ReadFromJsonAsync<UniverseDetail>())!);
    }

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character");
    }

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldKind kind,
        EntityFieldSemantic? semantic = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, false, null, null, null, semantic));
        response.EnsureSuccessStatusCode();

        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        string name,
        CanonStatus canonStatus,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var type = await CharacterType(client, universeId);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(type.Id, name, null, null, canonStatus, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<CanonEvaluationResponse> Evaluate(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsync(
            $"/api/universes/{universeId}/canon-conflicts/evaluate", content: null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonEvaluationResponse>())!;
    }

    private static async Task Dismiss(HttpClient client, Guid universeId, Guid conflictId)
    {
        var response = await client.PostAsync(
            $"/api/universes/{universeId}/canon-conflicts/{conflictId}/dismiss", content: null);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<CanonConflictPage> List(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universeId}/canon-conflicts?pageSize=100"))!;
}
