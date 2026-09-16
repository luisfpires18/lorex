# Lorex.E2E

Playwright end-to-end tests.

`playwright.config.ts` boots the API (`http://localhost:5180`) and the Vite dev server
(`http://localhost:5173`) via `webServer`, reusing anything already running locally.

```
npm install
npx playwright install chromium
npm test
```

## Which database a run writes to

Unset, the API writes to the database `appsettings.Development.json` names - the developer's own
worlds, which a full run then adds hundreds of universes to. `LOREX_E2E_DB` points the API at a
file of its own instead, built from nothing by the startup migration:

```
LOREX_E2E_DB=App_Data/lorex.e2e.db npm test
```

A relative path is resolved against the API's own folder, `src/Lorex.Api`, exactly as the
configured one is; an absolute path is left where it points. Either way `*.db` is gitignored.
Delete the file to start from nothing again.

Use it for anything being measured, and whenever authored work should stay out of the way.
It is also the one setting that has been shown to change how the suite behaves: on a database
the suite made itself, all 155 passed three runs out of three with nothing logged about a locked
database; on a copy of a long-lived development one, two runs out of two lost tests to
`SQLite Error 5: 'database is locked'`, which is contention on the single SQLite writer rather
than anything the specs did.

## How many browsers at once

Locally, Playwright's own default: half the logical processors. `LOREX_E2E_WORKERS` overrides it.

```
LOREX_E2E_WORKERS=4 npm test
```

The default was measured rather than assumed, on 16 logical processors, so eight browsers:

| Database        | Workers | Passed                | Wall clock    | `SQLite Error 5` lines |
| --------------- | ------- | --------------------- | ------------- | ---------------------- |
| fresh           | 8       | 155/155, three runs   | 2m12s - 2m16s | 0, 0, 0                |
| long-lived copy | 8       | 154/155, then 152/155 | 2m25s, 2m25s  | 3, 9                   |
| long-lived copy | 4       | 153/155               | 4m08s         | 3                      |

Halving the workers left the contention exactly where it was and took 1.7x as long, so nothing
below Playwright's default is committed as the default. CI still runs one worker.
