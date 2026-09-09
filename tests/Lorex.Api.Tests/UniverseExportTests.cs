using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Tests;

/// <summary>
/// The backup a universe hands back.
///
/// Four claims carry this file. A backup holds everything the author wrote and nothing the
/// installation owns - no account, no configuration, no path. It is internally coherent, so
/// every id in it resolves inside the same file. It is deterministic, so two exports of
/// unchanged lore differ only in the moment stamped on the envelope. And it is reachable
/// only by the one person who owns the universe.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class UniverseExportTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private const string Article =
        """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"She kept the tide's ledger."}]}]}""";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Who may take one ----------

    [Fact]
    public async Task An_owner_can_export_their_own_universe()
    {
        var (client, universe) = await SignedInWithUniverse("expown");

        var response = await client.GetAsync(Route(universe.Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        var backup = await Read(response);

        Assert.Equal(UniverseBackup.FormatName, backup.Format);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.Equal(universe.Id, backup.Payload.Universe.Id);
        Assert.Equal(universe.Name, backup.Payload.Universe.Name);
    }

    [Fact]
    public async Task Someone_else_cannot_export_or_discover_a_universe()
    {
        var (owner, universe) = await SignedInWithUniverse("expmine");
        await BuildRichUniverse(owner, universe.Id);

        var stranger = await SignedInClient("user-expyours");

        var response = await stranger.GetAsync(Route(universe.Id));

        // 404, not 403: someone else's universe is indistinguishable from one that is not there.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("Alenna", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_anonymous_caller_is_challenged_rather_than_answered()
    {
        var (owner, universe) = await SignedInWithUniverse("expanon");
        var anonymous = _factory.CreateClient();

        var response = await anonymous.GetAsync(Route(universe.Id));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        _ = owner;
    }

    [Fact]
    public async Task A_universe_that_is_not_there_and_an_id_that_is_not_one_both_answer_not_found()
    {
        var client = await SignedInClient("user-expmissing");

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(Route(Guid.NewGuid()))).StatusCode);

        // The route constraint refuses a malformed id before any handler sees it.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync("/api/universes/not-a-guid/export")).StatusCode);
    }

    [Fact]
    public async Task An_archived_universe_still_exports()
    {
        var (client, universe) = await SignedInWithUniverse("exparchived");
        await BuildRichUniverse(client, universe.Id);

        (await client.PostAsync($"/api/universes/{universe.Id}/archive", null)).EnsureSuccessStatusCode();

        var backup = await Backup(client, universe.Id);

        // Archiving takes a universe out of a list, not out of the owner's hands - and a backup
        // taken just before deleting one is when a backup is worth most.
        Assert.True(backup.Payload.Universe.IsArchived);
        Assert.NotEmpty(backup.Payload.Entities);
    }

    // ---------- The file itself ----------

    [Fact]
    public async Task An_empty_universe_exports_a_valid_file()
    {
        var (client, universe) = await SignedInWithUniverse("expempty");

        var backup = await Backup(client, universe.Id);

        Assert.Equal(UniverseBackup.FormatName, backup.Format);
        Assert.Equal(universe.Id, backup.Payload.Universe.Id);
        Assert.Empty(backup.Payload.Entities);
        Assert.Empty(backup.Payload.Tags);
        Assert.Empty(backup.Payload.Relationships);
        Assert.Empty(backup.Payload.RelationshipTypes);
        Assert.Empty(backup.Payload.TimelineEntries);
        Assert.Empty(backup.Payload.DismissedConflicts);

        // The starter types are lore the author now owns and may rename, so they travel too.
        Assert.NotEmpty(backup.Payload.EntityTypes);
    }

    [Fact]
    public async Task The_download_is_named_for_the_universe_and_the_day()
    {
        var client = await SignedInClient("user-expname");
        var universe = await CreateUniverse(client, "Tide & Ash: the Drowned Coast!");

        var response = await client.GetAsync(Route(universe.Id));
        var disposition = response.Content.Headers.ContentDisposition;

        Assert.Equal("attachment", disposition?.DispositionType);
        Assert.StartsWith("lorex-tide-ash-the-drowned-coast-", disposition?.FileName?.Trim('"'), StringComparison.Ordinal);
        Assert.EndsWith(".json", disposition?.FileName?.Trim('"'), StringComparison.Ordinal);
    }

    [Fact]
    public void A_universe_named_in_a_script_without_ascii_still_gets_a_usable_filename()
    {
        var moment = new DateTime(2026, 9, 9, 12, 0, 0, DateTimeKind.Utc);

        Assert.Equal("lorex-universe-20260909.json", UniverseExportEndpoints.FileNameFor("世界", moment));
        Assert.Equal("lorex-universe-20260909.json", UniverseExportEndpoints.FileNameFor("...", moment));
    }

    [Fact]
    public async Task No_account_or_installation_data_reaches_the_file()
    {
        var client = await SignedInClient("user-expsecrets");
        var universe = await CreateUniverse(client, "Quiet World");
        await BuildRichUniverse(client, universe.Id);

        var raw = await (await client.GetAsync(Route(universe.Id))).Content.ReadAsStringAsync();

        foreach (var forbidden in (string[])
        [
            "ownerId", "user-expsecrets", "@example.test", Password,
            "passwordHash", "securityStamp", "normalizedEmail", "connectionString",
            "AspNetUsers", "D:\\", "/home/",
        ])
        {
            Assert.DoesNotContain(forbidden, raw, StringComparison.OrdinalIgnoreCase);
        }

        // And structurally, not only by string search: the universe object has no owner at all.
        using var document = JsonDocument.Parse(raw);
        var properties = document.RootElement.GetProperty("payload").GetProperty("universe")
            .EnumerateObject().Select(property => property.Name);

        Assert.DoesNotContain(properties, name => name.Contains("owner", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Unchanged_lore_exports_the_same_bytes_apart_from_when_it_was_taken()
    {
        var (client, universe) = await SignedInWithUniverse("expstable");
        await BuildRichUniverse(client, universe.Id);

        var first = await RawExport(client, universe.Id);
        var second = await RawExport(client, universe.Id);

        // The payload is the deterministic half. Byte for byte, on unchanged lore.
        Assert.Equal(PayloadText(first), PayloadText(second));

        // The envelope is the volatile half, and carries exactly one volatile member.
        using var document = JsonDocument.Parse(first);
        var envelope = document.RootElement.EnumerateObject().Select(property => property.Name).ToList();
        Assert.Equal(["format", "formatVersion", "generatedAt", "payload"], envelope);
    }

    [Fact]
    public async Task A_change_to_the_lore_does_change_the_payload()
    {
        var (client, universe) = await SignedInWithUniverse("expmoves");
        var built = await BuildRichUniverse(client, universe.Id);

        var before = PayloadText(await RawExport(client, universe.Id));

        await Save(client, universe.Id, built.Warden with { Summary = "Warden of the drowned coast." });

        Assert.NotEqual(before, PayloadText(await RawExport(client, universe.Id)));
    }

    // ---------- What a backup holds ----------

    [Fact]
    public async Task A_rich_universe_exports_every_kind_of_authored_data()
    {
        var (client, universe) = await SignedInWithUniverse("exprich");
        var built = await BuildRichUniverse(client, universe.Id);

        var payload = (await Backup(client, universe.Id)).Payload;

        Assert.Equal("World exprich", payload.Universe.Name);

        var character = payload.EntityTypes.Single(type => type.Id == built.CharacterTypeId);
        Assert.Contains(character.Fields, field => field.Name == "Title" && field.Kind == EntityFieldKind.ShortText);
        Assert.Contains(character.Fields, field => field.Name == "Notes" && field.Kind == EntityFieldKind.LongText);

        var warden = payload.Entities.Single(entity => entity.Id == built.Warden.Id);
        Assert.Equal(CanonStatus.Canon, warden.CanonStatus);
        Assert.Equal(Article, warden.Content);
        Assert.Equal(["The Warden", "Vance"], warden.Aliases);
        Assert.Equal(2, warden.TagIds.Count);

        Assert.Equal(
            ["coast", "wardens"],
            warden.TagIds.Select(id => payload.Tags.Single(tag => tag.Id == id).Name).Order(StringComparer.Ordinal));

        Assert.Equal("Warden", Value(warden, built.TitleFieldId).TextValue);
        Assert.Equal("A ledger of tides.", Value(warden, built.NotesFieldId).TextValue);
        Assert.False(Value(warden, built.AliveFieldId).BooleanValue);
        Assert.Equal(new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc), Value(warden, built.SwornFieldId).DateValue);
        Assert.Equal(built.CrownOptionId, Value(warden, built.AllegianceFieldId).OptionId);

        // A multi-select is one row per chosen option, exactly as it is stored.
        Assert.Equal(2, warden.FieldValues.Count(value => value.FieldDefinitionId == built.MarksFieldId));

        // An entry the author has not touched since creating it is still whole.
        var coast = payload.Entities.Single(entity => entity.Id == built.Coast.Id);
        Assert.Empty(coast.Aliases);
        Assert.Empty(coast.TagIds);
        Assert.Null(coast.Content);
    }

    /// <summary>
    /// The Trash is authored lore the owner has not thrown away irrecoverably, so a backup that
    /// omitted it would turn a recoverable mistake into a permanent one the moment the file was
    /// read back. It travels whole, and it travels marked: <c>deletedAt</c> is what tells a
    /// reader which entries are live, and it is why the format is at version 2.
    /// </summary>
    [Fact]
    public async Task A_trashed_entry_is_carried_whole_and_marked_as_trashed()
    {
        var (client, universe) = await SignedInWithUniverse("exptrash");
        var built = await BuildRichUniverse(client, universe.Id);

        (await client.DeleteAsync(
            $"/api/universes/{universe.Id}/entities/{built.Coast.Id}")).EnsureSuccessStatusCode();

        var backup = await Backup(client, universe.Id);

        // The version says the entities collection no longer means "everything here is live".
        Assert.Equal(2, backup.FormatVersion);

        var coast = backup.Payload.Entities.Single(entity => entity.Id == built.Coast.Id);

        Assert.NotNull(coast.DeletedAt);
        Assert.Equal(DateTimeKind.Utc, coast.DeletedAt!.Value.Kind);
        Assert.Equal("Drowned Coast", coast.Name);
        Assert.Equal(built.CharacterTypeId, coast.EntityTypeId);
        Assert.NotEmpty(coast.Revisions);

        // Everything that pointed at it is still stored, so the backup still carries it: a
        // backup taken while an entry is in the Trash is a backup of a restorable world.
        Assert.Contains(
            backup.Payload.Relationships,
            relationship => relationship.TargetEntityId == built.Coast.Id);
        Assert.Contains(
            backup.Payload.TimelineEntries,
            entry => entry.ParticipantEntityIds.Contains(built.Coast.Id));

        // A live entry says so by carrying nothing.
        Assert.Null(backup.Payload.Entities.Single(entity => entity.Id == built.Warden.Id).DeletedAt);
    }

    [Fact]
    public async Task A_null_value_stays_a_null_and_never_becomes_an_empty_one()
    {
        var (client, universe) = await SignedInWithUniverse("expnulls");
        var built = await BuildRichUniverse(client, universe.Id);

        var payload = (await Backup(client, universe.Id)).Payload;
        var warden = payload.Entities.Single(entity => entity.Id == built.Warden.Id);

        var title = Value(warden, built.TitleFieldId);
        Assert.Null(title.NumberValue);
        Assert.Null(title.BooleanValue);
        Assert.Null(title.DateValue);
        Assert.Null(title.OptionId);
        Assert.Null(title.ReferencedEntityId);

        Assert.Null(payload.Universe.Description);
        Assert.Null(payload.Entities.Single(entity => entity.Id == built.Coast.Id).Summary);

        // Written out, not omitted: "never filled in" and "not in the format" are different facts.
        var raw = await RawExport(client, universe.Id);
        Assert.Contains("\"description\": null", raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task What_a_field_means_survives_the_trip()
    {
        var (client, universe) = await SignedInWithUniverse("expsemantic");
        var built = await BuildRichUniverse(client, universe.Id);

        var fields = (await Backup(client, universe.Id)).Payload
            .EntityTypes.Single(type => type.Id == built.CharacterTypeId).Fields;

        Assert.Equal(
            EntityFieldSemantic.BirthYear,
            fields.Single(field => field.Id == built.BornFieldId).Semantic);
        Assert.Equal(
            EntityFieldSemantic.DeathYear,
            fields.Single(field => field.Id == built.DiedFieldId).Semantic);

        // Declared meaning is authored and never inferred (ADR 0011), so the normal case is null.
        Assert.Null(fields.Single(field => field.Id == built.TitleFieldId).Semantic);

        // The options an author invented travel with the field that offers them.
        var allegiance = fields.Single(field => field.Id == built.AllegianceFieldId);
        Assert.Equal(["Crown", "Guild"], allegiance.Options.Select(option => option.Value));
    }

    [Fact]
    public async Task Relationships_keep_their_type_their_direction_and_their_wording()
    {
        var (client, universe) = await SignedInWithUniverse("exprel");
        var built = await BuildRichUniverse(client, universe.Id);

        var payload = (await Backup(client, universe.Id)).Payload;

        var type = payload.RelationshipTypes.Single(candidate => candidate.Id == built.RelationshipTypeId);
        Assert.Equal("rules", type.Name);
        Assert.Equal("ruled by", type.InverseName);
        Assert.False(type.IsSymmetric);

        var relationship = Assert.Single(payload.Relationships);
        Assert.Equal(built.RelationshipTypeId, relationship.RelationshipTypeId);
        Assert.Equal(built.Warden.Id, relationship.SourceEntityId);
        Assert.Equal(built.Coast.Id, relationship.TargetEntityId);
        Assert.Equal(CanonStatus.Canon, relationship.CanonStatus);
        Assert.Equal("Sworn at the seawall.", relationship.Notes);
    }

    [Fact]
    public async Task The_timeline_keeps_its_signed_years_its_precision_and_who_took_part()
    {
        var (client, universe) = await SignedInWithUniverse("exptimeline");
        var built = await BuildRichUniverse(client, universe.Id);

        var entry = Assert.Single((await Backup(client, universe.Id)).Payload.TimelineEntries);

        Assert.Equal("The Salt Accord", entry.Title);
        Assert.Equal(TimelineDateKind.Range, entry.DateKind);

        // A year before a universe's own zero is a negative number, not a Gregorian date.
        Assert.Equal(-312, entry.StartYear);
        Assert.Equal(3, entry.StartMonth);
        Assert.Equal(4, entry.StartDay);
        Assert.Equal(-300, entry.EndYear);

        // An unspecified component is null, which is a different claim from zero.
        Assert.Null(entry.EndMonth);
        Assert.Null(entry.EndDay);

        Assert.Equal("Before the Drowning", entry.EraLabel);
        Assert.Equal([built.Coast.Id], entry.ParticipantEntityIds);
    }

    [Fact]
    public async Task Every_version_of_every_entry_travels_with_it()
    {
        var (client, universe) = await SignedInWithUniverse("exphistory");
        var built = await BuildRichUniverse(client, universe.Id);

        var edited = await Save(client, universe.Id, built.Warden with { Name = "Alenna Vance the Elder" });
        await Save(client, universe.Id, edited with { Summary = "Keeper of the ledger." });

        var revisions = (await Backup(client, universe.Id)).Payload
            .Entities.Single(entity => entity.Id == built.Warden.Id).Revisions;

        // Oldest first, which is the order they were written in.
        Assert.Equal([1, 2, 3], revisions.Select(revision => revision.Number));
        Assert.Equal(EntityRevisionKind.Created, revisions[0].Kind);
        Assert.Equal("Alenna Vance", revisions[0].Name);
        Assert.Equal("Alenna Vance the Elder", revisions[2].Name);
        Assert.Equal(EntityRevisionChange.Summary, revisions[2].Changes);

        // A snapshot carries both halves of every reference (ADR 0013): the id, and the text
        // that reference displayed at the time.
        var first = revisions[0];
        Assert.Equal(Article, first.Content);
        Assert.Equal(["The Warden", "Vance"], first.Aliases);
        Assert.Equal(["coast", "wardens"], first.Tags);

        var allegiance = first.FieldValues.Single(value => value.FieldDefinitionId == built.AllegianceFieldId);
        Assert.Equal("Allegiance", allegiance.FieldName);
        Assert.Equal("Crown", allegiance.OptionValue);
        Assert.Equal(built.CrownOptionId, allegiance.OptionId);

        var mentor = first.FieldValues.Single(value => value.FieldDefinitionId == built.MentorFieldId);
        Assert.Equal(built.Mentor.Id, mentor.ReferencedEntityId);
        Assert.Equal("Corin Ash", mentor.ReferencedEntityName);
    }

    [Fact]
    public async Task A_restore_and_what_it_came_from_are_both_preserved()
    {
        var (client, universe) = await SignedInWithUniverse("exprestore");
        var built = await BuildRichUniverse(client, universe.Id);

        await Save(client, universe.Id, built.Warden with { Name = "Alenna the Drowned" });

        var history = (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universe.Id}/entities/{built.Warden.Id}/revisions"))!;
        var original = history.Single(revision => revision.Number == 1);

        (await client.PostAsync(
            $"/api/universes/{universe.Id}/entities/{built.Warden.Id}/revisions/{original.Id}/restore",
            null)).EnsureSuccessStatusCode();

        var revisions = (await Backup(client, universe.Id)).Payload
            .Entities.Single(entity => entity.Id == built.Warden.Id).Revisions;

        var restore = revisions.Single(revision => revision.Number == 3);
        Assert.Equal(EntityRevisionKind.Restored, restore.Kind);
        Assert.Equal(original.Id, restore.RestoredFromRevisionId);

        // And what it points at is in the same file, under the same entry.
        Assert.Contains(revisions, revision => revision.Id == restore.RestoredFromRevisionId);
    }

    // ---------- Canon lifecycle ----------

    [Fact]
    public async Task Only_the_dismissals_are_carried_because_only_they_are_authored()
    {
        var (client, universe) = await SignedInWithUniverse("expcanon");
        await BuildRichUniverse(client, universe.Id);

        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts"))!;

        // The lore is deliberately built to produce more than one finding, so leaving one
        // pending proves the filter is a filter and not an empty table.
        Assert.True(conflicts.Items.Count > 1);

        var chosen = conflicts.Items.OrderBy(conflict => conflict.RuleCode, StringComparer.Ordinal).First();
        (await client.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{chosen.Id}/dismiss", null))
            .EnsureSuccessStatusCode();

        var payload = (await Backup(client, universe.Id)).Payload;

        // A conflict is a derived finding and regenerates from the lore in this same file
        // (ADR 0010). A dismissal is the author's own judgement and nothing re-derives it.
        var dismissed = Assert.Single(payload.DismissedConflicts);
        Assert.Equal(chosen.RuleCode, dismissed.RuleCode);
        Assert.Equal(chosen.Severity, dismissed.Severity);
        Assert.NotEmpty(dismissed.Fingerprint);
        Assert.NotEqual(default, dismissed.DismissedAt);

        // Nothing pending or resolved leaked in alongside it, and no conflict wording either:
        // both are rebuilt, and carrying them would let a backup disagree with the lore in it.
        var raw = await RawExport(client, universe.Id);
        Assert.DoesNotContain(chosen.Explanation, raw, StringComparison.Ordinal);
        Assert.DoesNotContain("\"Pending\"", raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_dismissal_can_be_matched_back_to_the_finding_it_suppressed()
    {
        var (client, universe) = await SignedInWithUniverse("expcanonkey");
        await BuildRichUniverse(client, universe.Id);

        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts"))!;
        var chosen = conflicts.Items[0];

        (await client.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{chosen.Id}/dismiss", null))
            .EnsureSuccessStatusCode();

        var dismissed = Assert.Single((await Backup(client, universe.Id)).Payload.DismissedConflicts);

        // The fingerprint hashes the rule code and the ids of the records at fault, and this
        // backup preserves those ids - so a reader can recompute it and re-apply the dismissal.
        // Re-evaluating changes nothing about it, which is the property that makes it a key.
        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var again = Assert.Single((await Backup(client, universe.Id)).Payload.DismissedConflicts);
        Assert.Equal(dismissed.Fingerprint, again.Fingerprint);
        Assert.Equal(dismissed.DismissedAt, again.DismissedAt);
    }

    // ---------- Coherence ----------

    [Fact]
    public async Task Every_id_in_a_backup_resolves_inside_the_same_backup()
    {
        var (client, universe) = await SignedInWithUniverse("expcoherent");
        var built = await BuildRichUniverse(client, universe.Id);
        await Save(client, universe.Id, built.Warden with { Name = "Alenna Vance the Elder" });

        var payload = (await Backup(client, universe.Id)).Payload;

        var typeIds = payload.EntityTypes.Select(type => type.Id).ToHashSet();
        var fieldIds = payload.EntityTypes.SelectMany(type => type.Fields).Select(field => field.Id).ToHashSet();
        var optionIds = payload.EntityTypes
            .SelectMany(type => type.Fields).SelectMany(field => field.Options)
            .Select(option => option.Id).ToHashSet();
        var entityIds = payload.Entities.Select(entity => entity.Id).ToHashSet();
        var tagIds = payload.Tags.Select(tag => tag.Id).ToHashSet();

        foreach (var entity in payload.Entities)
        {
            Assert.Contains(entity.EntityTypeId, typeIds);
            Assert.All(entity.TagIds, id => Assert.Contains(id, tagIds));

            foreach (var value in entity.FieldValues)
            {
                Assert.Contains(value.FieldDefinitionId, fieldIds);

                if (value.OptionId is { } optionId)
                {
                    Assert.Contains(optionId, optionIds);
                }

                if (value.ReferencedEntityId is { } referencedId)
                {
                    Assert.Contains(referencedId, entityIds);
                }
            }

            // A revision's ids are raw and deliberately unkeyed (ADR 0013), so they may point
            // at lore since deleted - but nothing here has been deleted, so they all resolve.
            foreach (var revision in entity.Revisions)
            {
                Assert.Contains(revision.EntityTypeId, typeIds);
                Assert.All(revision.FieldValues, value => Assert.Contains(value.FieldDefinitionId, fieldIds));

                if (revision.RestoredFromRevisionId is { } source)
                {
                    Assert.Contains(entity.Revisions, candidate => candidate.Id == source);
                }
            }
        }

        foreach (var relationship in payload.Relationships)
        {
            Assert.Contains(
                relationship.RelationshipTypeId,
                payload.RelationshipTypes.Select(type => type.Id));
            Assert.Contains(relationship.SourceEntityId, entityIds);
            Assert.Contains(relationship.TargetEntityId, entityIds);
        }

        foreach (var entry in payload.TimelineEntries)
        {
            Assert.All(entry.ParticipantEntityIds, id => Assert.Contains(id, entityIds));
        }
    }

    [Fact]
    public async Task A_backup_holds_one_universe_and_never_reaches_into_another()
    {
        var client = await SignedInClient("user-exponly");
        var kept = await CreateUniverse(client, "Kept World");
        var other = await CreateUniverse(client, "Other World");

        await BuildRichUniverse(client, kept.Id);
        await BuildRichUniverse(client, other.Id);

        var payload = (await Backup(client, kept.Id)).Payload;
        var raw = await RawExport(client, kept.Id);

        Assert.Equal(kept.Id, payload.Universe.Id);
        Assert.DoesNotContain(other.Id.ToString(), raw, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(3, payload.Entities.Count);
    }

    // ---------- Helpers ----------

    private static string Route(Guid universeId) => $"/api/universes/{universeId}/export";

    private static async Task<UniverseBackup> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        var raw = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<UniverseBackup>(raw, UniverseBackupJson.Options)!;
    }

    private static async Task<UniverseBackup> Backup(HttpClient client, Guid universeId) =>
        await Read(await client.GetAsync(Route(universeId)));

    private static async Task<string> RawExport(HttpClient client, Guid universeId)
    {
        var response = await client.GetAsync(Route(universeId));
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }

    /// <summary>The deterministic half of the file, as text, so two exports can be compared.</summary>
    private static string PayloadText(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.GetProperty("payload").GetRawText();
    }

    private static BackupFieldValue Value(BackupEntity entity, Guid fieldId) =>
        entity.FieldValues.First(value => value.FieldDefinitionId == fieldId);

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

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    /// <summary>
    /// Everything a universe can currently hold, in one world: a type with a field of every
    /// kind including two declared meanings, three entries with aliases, tags, an article and
    /// values, a relationship, a timeline entry with a negative year and a participant, and
    /// enough disagreement in the lore to produce more than one Canon finding.
    ///
    /// Deliberately no impossible lifespan and no moment before a birth, so nothing here is a
    /// High finding and the promotion gate has nothing to refuse.
    /// </summary>
    private static async Task<RichUniverse> BuildRichUniverse(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        var character = types.First(type => type.Name == "Character");

        var born = await AddField(client, universeId, character.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        var died = await AddField(client, universeId, character.Id, "Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear);
        var title = await AddField(client, universeId, character.Id, "Title", EntityFieldKind.ShortText);
        var notes = await AddField(client, universeId, character.Id, "Notes", EntityFieldKind.LongText);
        var alive = await AddField(client, universeId, character.Id, "Alive", EntityFieldKind.Boolean);
        var sworn = await AddField(client, universeId, character.Id, "Sworn On", EntityFieldKind.Date);
        var allegiance = await AddField(
            client, universeId, character.Id, "Allegiance", EntityFieldKind.Select, options: ["Crown", "Guild"]);
        var marks = await AddField(
            client, universeId, character.Id, "Marks", EntityFieldKind.MultiSelect, options: ["Ash", "Salt"]);
        var mentor = await AddField(client, universeId, character.Id, "Mentor", EntityFieldKind.EntityReference);

        // A Draft the Canon warden will point at, which is one CANON-FIELD-001 finding.
        var mentorEntity = await Create(client, universeId, character.Id, "Corin Ash", CanonStatus.Draft);

        // An Idea the Canon relationship will land on, which is one CANON-REL-001 finding.
        var coast = await Create(client, universeId, character.Id, "Drowned Coast", CanonStatus.Idea);

        var warden = await Create(
            client,
            universeId,
            character.Id,
            "Alenna Vance",
            CanonStatus.Canon,
            content: Article,
            aliases: ["The Warden", "Vance"],
            tags: ["coast", "wardens"],
            fields:
            [
                new FieldValueInput(born.Id, null, 100, null, null, null, null),
                new FieldValueInput(died.Id, null, 200, null, null, null, null),
                new FieldValueInput(title.Id, "Warden", null, null, null, null, null),
                new FieldValueInput(notes.Id, "A ledger of tides.", null, null, null, null, null),
                new FieldValueInput(alive.Id, null, null, false, null, null, null),
                new FieldValueInput(
                    sworn.Id, null, null, null, new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc), null, null),
                new FieldValueInput(allegiance.Id, null, null, null, null, [OptionId(allegiance, "Crown")], null),
                new FieldValueInput(
                    marks.Id, null, null, null, null, [OptionId(marks, "Ash"), OptionId(marks, "Salt")], null),
                new FieldValueInput(mentor.Id, null, null, null, null, null, mentorEntity.Id),
            ]);

        var relationshipType = (await (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest("rules", "ruled by", false, "Who answers to whom.", null)))
            .Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;

        (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new RelationshipRequest(
                relationshipType.Id, warden.Id, coast.Id, CanonStatus.Canon, null, null, "Sworn at the seawall.")))
            .EnsureSuccessStatusCode();

        (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/timeline",
            new TimelineEntryRequest(
                "The Salt Accord",
                "The coast swore to the crown.",
                CanonStatus.Idea,
                TimelineDateKind.Range,
                -312, 3, 4,
                -300, null, null,
                "Before the Drowning",
                [coast.Id])))
            .EnsureSuccessStatusCode();

        return new RichUniverse(
            character.Id, born.Id, died.Id, title.Id, notes.Id, alive.Id, sworn.Id,
            allegiance.Id, OptionId(allegiance, "Crown"), marks.Id, mentor.Id,
            relationshipType.Id, warden, mentorEntity, coast);
    }

    private static Guid OptionId(FieldDefinitionResponse field, string value) =>
        field.Options.First(option => option.Value == value).Id;

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldKind kind,
        EntityFieldSemantic? semantic = null,
        IReadOnlyList<string>? options = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, false, null, null, options, semantic));
        response.EnsureSuccessStatusCode();

        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    private static async Task<EntityDetail> Create(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        CanonStatus canonStatus,
        string? content = null,
        IReadOnlyList<string>? aliases = null,
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, content, canonStatus, aliases, tags, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    /// <summary>Re-saves an entry from its own detail, which is what the client does.</summary>
    private static async Task<EntityDetail> Save(HttpClient client, Guid universeId, EntityDetail entity)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.Content,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                [.. entity.Fields.Select(field => new FieldValueInput(
                    field.FieldDefinitionId,
                    field.Text,
                    field.Number,
                    field.Boolean,
                    field.Date,
                    field.OptionIds,
                    field.ReferencedEntityId))]));

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private sealed record RichUniverse(
        Guid CharacterTypeId,
        Guid BornFieldId,
        Guid DiedFieldId,
        Guid TitleFieldId,
        Guid NotesFieldId,
        Guid AliveFieldId,
        Guid SwornFieldId,
        Guid AllegianceFieldId,
        Guid CrownOptionId,
        Guid MarksFieldId,
        Guid MentorFieldId,
        Guid RelationshipTypeId,
        EntityDetail Warden,
        EntityDetail Mentor,
        EntityDetail Coast);
}
