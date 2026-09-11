using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// The starter set of entity types. Seeding is idempotent: it inserts only the names a
/// universe is missing, so it is safe to run on a new universe and on one created before
/// this feature existed.
///
/// Each carries an icon key from <see cref="EntityTypeIcons"/>, written here as data. That is the
/// only way a type gets an icon it was not given by its author: nothing maps a name to one.
/// </summary>
public static class EntityTypeDefaults
{
    public static readonly IReadOnlyList<(string Name, string Description, string Icon, string Accent)> Defaults =
    [
        ("Character", "People, and anything else with a will of its own.", "character", "#4f6bd6"),
        ("Location", "Places, from a room to a continent.", "location", "#1f8f74"),
        ("Organization", "Groups that act together: houses, guilds, armies, cults.", "organization", "#7a4bbd"),
        ("Event", "Things that happened, and things that will.", "event", "#a8562c"),
        ("Item", "Objects that matter enough to name.", "item", "#b3922f"),
        ("Species", "Kinds of living thing.", "species", "#2f8fa8"),
        ("Concept", "Ideas, forces, languages, laws, magic systems.", "concept", "#3c4a57"),
    ];

    /// <summary>Adds any missing default type. Returns how many were created.</summary>
    public static async Task<int> EnsureAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var existing = await db.EntityTypes
            .Where(type => type.UniverseId == universeId)
            .Select(type => type.Name)
            .ToListAsync(cancellationToken);

        var present = new HashSet<string>(existing, StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;
        var order = 0;
        var created = 0;

        foreach (var (name, description, icon, accent) in Defaults)
        {
            order++;
            if (present.Contains(name))
            {
                continue;
            }

            db.EntityTypes.Add(new EntityType
            {
                Id = Guid.NewGuid(),
                UniverseId = universeId,
                Name = name,
                Description = description,
                Icon = icon,
                AccentColor = accent,
                DisplayOrder = order,
                CreatedAt = now,
                UpdatedAt = now,
            });
            created++;
        }

        if (created > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return created;
    }
}
