# Lorex.Api

ASP.NET Core minimal-API host for Lorex.

- `Program.cs` - composition root.
- `Data/` - `LorexDbContext` + SQLite wiring and migrations.
- `Features/<Feature>/` - one folder per feature: endpoints, handlers, entity configuration.

No generic repository or service layers: features talk to `LorexDbContext` directly.

Local dev database: `App_Data/lorex.dev.db` (gitignored, recreated by migrations on startup).
