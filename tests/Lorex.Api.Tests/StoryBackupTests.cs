using System.IO.Compression;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Tests;

/// <summary>
/// Stories in the universe backup (format version 5).
///
/// A story is authored work, so a backup that dropped it would not be a backup. What it carries is the
/// author's structure - each story, its scenes in narrative order, the point of view, where each scene
/// sits in the world, and which lore it links - as ids and numbers only. Nothing a reader could derive
/// from the rest of the file, such as an entry's name or a formatted date, is repeated in it.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class StoryBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_carries_every_story_with_its_scenes_in_narrative_order()
    {
        var (client, universe) = await SignedInWithUniverse("storybackup");
        var world = await BuildStories(client, universe.Id);

        var backup = await Backup(client, universe.Id);

        Assert.Equal(5, backup.FormatVersion);
        var stories = backup.Payload.Stories!;

        // By title, ordinally: "Aftermath" before "The Long Winter".
        Assert.Equal(["Aftermath", "The Long Winter"], stories.Select(story => story.Title));

        var winter = stories[1];
        Assert.Equal(world.Winter, winter.Id);
        Assert.Equal("Told backwards.", winter.Premise);
        Assert.Equal(StoryStatus.Drafting, winter.Status);

        // The order the author set, not the order of creation and not the order of the world.
        Assert.Equal(["Childhood", "The Council", "The Battle"], winter.Scenes.Select(scene => scene.Title));
        Assert.Equal([0, 1, 2], winter.Scenes.Select(scene => scene.SortOrder));

        var council = winter.Scenes[1];
        Assert.Equal(world.Arlen, council.PovEntityId);
        Assert.Equal("Nine voices.", council.Summary);
        Assert.Equal("Check the vote count.", council.Notes);
        Assert.Equal(new BackupChronologyValue(world.After, 12, 3, null), council.Chronology);
        Assert.Equal(
            new[] { world.Arlen, world.Tower }.Select(id => id.ToString()).Order(StringComparer.Ordinal),
            council.LinkedEntityIds.Select(id => id.ToString()));

        var childhood = winter.Scenes[0];
        Assert.Equal(new BackupChronologyValue(world.Before, 40, null, null), childhood.Chronology);
        Assert.Null(childhood.PovEntityId);

        Assert.Null(winter.Scenes[2].Chronology);
        Assert.Empty(stories[0].Scenes);
    }

    [Fact]
    public async Task Every_reference_in_a_story_resolves_inside_the_same_file_the_Trash_included()
    {
        var (client, universe) = await SignedInWithUniverse("storybackuprefs");
        var world = await BuildStories(client, universe.Id);

        // Linked and point of view, then thrown away: the scene still holds it, so the file must too.
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{world.Arlen}")).EnsureSuccessStatusCode();

        var payload = (await Backup(client, universe.Id)).Payload;
        var entities = payload.Entities.ToDictionary(entity => entity.Id);
        var eras = payload.ChronologyEras!.Select(era => era.Id).ToHashSet();

        var scenes = payload.Stories!.SelectMany(story => story.Scenes).ToList();
        Assert.NotEmpty(scenes);

        foreach (var scene in scenes)
        {
            if (scene.PovEntityId is { } pov)
            {
                Assert.True(entities.ContainsKey(pov));
            }

            Assert.All(scene.LinkedEntityIds, id => Assert.True(entities.ContainsKey(id)));

            if (scene.Chronology?.EraId is { } era)
            {
                Assert.Contains(era, eras);
            }
        }

        Assert.NotNull(entities[world.Arlen].DeletedAt);
        Assert.Contains(scenes, scene => scene.PovEntityId == world.Arlen);
    }

    [Fact]
    public async Task A_story_in_a_backup_holds_references_and_never_the_lore_it_points_at()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupnocopy");
        await BuildStories(client, universe.Id);

        var archive = await RawArchive(client, universe.Id);
        using var document = JsonDocument.Parse(DocumentText(archive));
        var stories = document.RootElement.GetProperty("payload").GetProperty("stories").GetRawText();

        // Names of the entries and of the eras live in their own collections; a scene repeats neither.
        Assert.DoesNotContain("Arlen", stories, StringComparison.Ordinal);
        Assert.DoesNotContain("White Tower", stories, StringComparison.Ordinal);
        Assert.DoesNotContain("After the Fall", stories, StringComparison.Ordinal);
        Assert.DoesNotContain("\"AF", stories, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Unchanged_stories_produce_the_same_payload()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupstable");
        await BuildStories(client, universe.Id);

        var first = PayloadText(DocumentText(await RawArchive(client, universe.Id)));
        var second = PayloadText(DocumentText(await RawArchive(client, universe.Id)));

        Assert.Equal(first, second);
    }

    [Fact]
    public async Task A_universe_with_no_stories_carries_an_empty_list()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupnone");

        var backup = await Backup(client, universe.Id);

        Assert.NotNull(backup.Payload.Stories);
        Assert.Empty(backup.Payload.Stories);
    }

    /// <summary>
    /// Nothing reads a backup back in yet, so what a reader of an older file gets is exactly what the
    /// records make of it. A version 4 document holds no stories, and must come out as none - a null,
    /// never an error and never a guess.
    /// </summary>
    [Fact]
    public void A_version_four_document_reads_as_a_world_with_no_stories()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 4,
              "generatedAt": "2026-09-13T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "7c1e0a52-2f3b-4d6e-8a19-0b4c5d6e7f01", "name": "A world before stories", "description": null,
                  "accentColor": null, "isArchived": false,
                  "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z"
                },
                "chronologyEras": [],
                "entityTypes": [],
                "tags": [],
                "entities": [],
                "relationshipTypes": [],
                "relationships": [],
                "timelineEntries": [],
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(4, backup.FormatVersion);
        Assert.Null(backup.Payload.Stories);
        Assert.Equal("A world before stories", backup.Payload.Universe.Name);
    }

    // ---------- Building ----------

    private sealed record StoryWorld(Guid Winter, Guid Arlen, Guid Tower, Guid Before, Guid After);

    /// <summary>
    /// Two stories. One is empty; the other holds three scenes written in one order, lived in another,
    /// and then reordered by the author into a third.
    /// </summary>
    private static async Task<StoryWorld> BuildStories(HttpClient client, Guid universeId)
    {
        var eras = await PutJson<ChronologyResponse>(
            client,
            HttpMethod.Put,
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        var before = eras.Eras[0].Id;
        var after = eras.Eras[1].Id;

        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        var character = types.First(type => type.Name == "Character").Id;

        var arlen = await PutJson<EntityDetail>(
            client, HttpMethod.Post, $"/api/universes/{universeId}/entities",
            new EntityRequest(character, "Arlen", null, null, CanonStatus.Canon, null, null, null));
        var tower = await PutJson<EntityDetail>(
            client, HttpMethod.Post, $"/api/universes/{universeId}/entities",
            new EntityRequest(character, "White Tower", null, null, CanonStatus.Canon, null, null, null));

        var stories = $"/api/universes/{universeId}/stories";
        var winter = await PutJson<StoryDetail>(
            client, HttpMethod.Post, stories, new StoryRequest("The Long Winter", "Told backwards.", StoryStatus.Drafting));
        await PutJson<StoryDetail>(client, HttpMethod.Post, stories, new StoryRequest("Aftermath", null, StoryStatus.Planning));

        var scenes = $"{stories}/{winter.Id}/scenes";
        var council = await PutJson<SceneResponse>(
            client, HttpMethod.Post, scenes,
            new SceneRequest(
                "The Council", "Nine voices.", "Check the vote count.", arlen.Id,
                new ChronologyValue(after, 12, 3, null), [tower.Id, arlen.Id]));
        var battle = await PutJson<SceneResponse>(
            client, HttpMethod.Post, scenes, new SceneRequest("The Battle", null, null, null, null, null));
        var childhood = await PutJson<SceneResponse>(
            client, HttpMethod.Post, scenes,
            new SceneRequest("Childhood", null, null, null, new ChronologyValue(before, 40, null, null), [arlen.Id]));

        await PutJson<List<SceneResponse>>(
            client, HttpMethod.Put, $"{scenes}/order", new SceneOrderRequest([childhood.Id, council.Id, battle.Id]));

        return new StoryWorld(winter.Id, arlen.Id, tower.Id, before, after);
    }

    private static async Task<T> PutJson<T>(HttpClient client, HttpMethod method, string path, object body)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    // ---------- Reading the archive ----------

    private static async Task<UniverseBackup> Backup(HttpClient client, Guid universeId) =>
        JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(await RawArchive(client, universeId)),
            UniverseBackupJson.Options)!;

    private static async Task<byte[]> RawArchive(HttpClient client, Guid universeId)
    {
        var response = await client.GetAsync($"/api/universes/{universeId}/export");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }

    private static string DocumentText(byte[] archive)
    {
        using var zip = new ZipArchive(new MemoryStream(archive, writable: false), ZipArchiveMode.Read);
        var entry = zip.GetEntry(BackupArchive.DocumentPath)
            ?? throw new InvalidOperationException("No document in the archive.");

        using var reading = entry.Open();
        using var buffer = new MemoryStream();
        reading.CopyTo(buffer);
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static string PayloadText(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.GetProperty("payload").GetRawText();
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = _factory.CreateClient();
        var username = $"user-{tag}";
        (await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password))).EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest($"World {tag}", null, null));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<UniverseDetail>())!);
    }
}
