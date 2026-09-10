# Azure DEV

The DEV environment, end to end. Rationale for the shape lives in
[ADR 0018](../architecture/decisions/0018-azure-dev-single-app-service.md); this file is the
runbook.

DEV only. Nothing here describes production, and nothing here should be reused for it
unchanged.

## Topology

One Azure App Service (Linux) and the plan it runs on. That is the whole environment.

```
                      https://<app-name>.azurewebsites.net
                                    |
                  Azure front end - terminates TLS, forwards http
                                    |
                        App Service (Linux, B1, 1 worker)
                                    |
    dotnet Lorex.Api.dll  ---  wwwroot/  (the built React client)
                                    |
                              /home/data/
                          lorex.db   keys/
```

- **One process serves both halves.** The API is published with the built client in its
  `wwwroot`, so the browser talks to a single origin: no CORS, and the session cookie stays
  same-origin exactly as it does behind the Vite proxy in development.
- **`/home` is persistent.** On Linux App Service it is an Azure Files share mounted into the
  site, and it survives restarts and redeploys. The deployed content directory does not, which
  is why nothing that must last is kept there.
- **One worker, on purpose.** SQLite has one writer. `numberOfWorkers` is 1 and there is no
  autoscale rule; do not add one.

## Prerequisites

- An Azure subscription and a resource group you may deploy into.
- Contributor on that resource group, and enough Entra ID rights to create an app
  registration with a federated credential.
- `az` CLI, signed in (`az login`).
- Admin on the GitHub repository, to create the `dev` environment and its variables.

## Azure resources

Two, both created by [`infra/main.bicep`](../../infra/main.bicep): an App Service plan and the
site. The template declares no secret and outputs none.

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters appName=<globally-unique-app-name>
```

Parameters worth knowing: `appName` (becomes `<appName>.azurewebsites.net`, must be globally
unique), `location` (defaults to the resource group's), `skuName` (`B1` - the smallest tier
with Always On), `linuxFxVersion` (`DOTNETCORE|10.0`), `allowedHosts` (`*` by default) and
`environmentName` (`AzureDev`).

Confirm the runtime exists in your region before deploying, and override `linuxFxVersion` if
it does not:

```bash
az webapp list-runtimes --os linux | grep -i dotnet
```

### Sign-in for the workflow

The deployment signs in with OIDC federated identity, so **no credential is stored in GitHub
or in this repository**. Create an app registration, give it Contributor on the resource
group, and add a federated credential for this repository's `dev` environment (entity type
*Environment*, environment name `dev`). Azure's portal blade for this is
*App registrations -> Certificates & secrets -> Federated credentials*.

## GitHub variables

Repository or `dev`-environment **variables** - not secrets. All four are identifiers, none is
a credential.

| Name | Holds |
| --- | --- |
| `AZURE_CLIENT_ID` | Application (client) ID of the app registration. |
| `AZURE_TENANT_ID` | Directory (tenant) ID. |
| `AZURE_SUBSCRIPTION_ID` | Subscription the resource group is in. |
| `AZURE_WEBAPP_NAME` | The `appName` used above. |

Also create the GitHub environment named `dev`. The deploy job targets it, which is what binds
the federated credential and gives the owner a place to add a required reviewer later.

## Workflows

| File | Runs on | Does |
| --- | --- | --- |
| [`ci.yml`](../../.github/workflows/ci.yml) | Pull requests into `dev`; called by the deploy workflow | Backend Release build, tests, pending-model check; web typecheck, lint, format, build; Playwright |
| [`deploy-dev.yml`](../../.github/workflows/deploy-dev.yml) | Push to `dev`, or manual | Calls `ci.yml`, then builds the client, publishes the API, deploys, and waits for `/health` |

`dev` is the only branch that deploys, and the job is additionally guarded by
`if: github.ref == 'refs/heads/dev'`.

## First deploy

1. Deploy the Bicep template (above).
2. Create the app registration, the federated credential, the `dev` GitHub environment and the
   four variables.
3. Push to `dev`, or run **Deploy DEV** from the Actions tab.
4. The workflow's last step polls `/health` and fails the run if DEV never answers 200.

## The database, and who migrates it

- The connection string lives in `appsettings.AzureDev.json`:
  `Data Source=/home/data/lorex.db`. It is not a secret and there is nothing to hide in it.
- Override it without a redeploy with the app setting `ConnectionStrings__LorexDb`.
- **The app migrates itself at startup.** `LorexDatabaseInitializer` runs before anything
  queries a table, in every environment, and the search-index backfill waits on it. A cold
  start on an empty file therefore builds the whole schema and then serves.
- To hand migrations to something else, set `Database__MigrateOnStartup` to `false`. The app
  will then start against whatever schema it finds, and say so in its log.
- `/home/data` outlives redeploys, so authored lore survives them. It does **not** outlive
  deleting the App Service.

## Data Protection

`DataProtection__KeyRingPath` defaults to `/home/data/keys`. The key ring is what encrypts the
session cookie; keeping it on `/home` is what stops a restart from signing everyone out.

The keys are written **unencrypted at rest**, protected only by the file system - App Service
logs `No XML encryptor configured` on every start to say so. That is accepted for DEV. See
Limitations.

## Redeploy and rollback

- **Redeploy:** push to `dev`, or re-run the workflow. The site restarts; `/home/data` is
  untouched.
- **Roll back:** re-run the **Deploy DEV** workflow from the last good commit
  (Actions -> Deploy DEV -> Run workflow, choosing that ref), or use App Service's own
  deployment history: `az webapp deployment list-publishing-profiles` shows what is deployed,
  and the portal's *Deployment Center -> Logs* can redeploy a previous package.
- **A rollback does not roll the database back.** Migrations are forward-only and there is no
  down-migration path, so a deployment that adds a migration cannot be undone by redeploying
  the previous build. Restore from a backup instead - see below.
- **Backup:** each universe exports as a JSON file from Settings. There is no automated
  database backup in DEV; taking the file off `/home` is a manual act
  (`az webapp ssh` and copy it out).

## Known DEV limitations

Accepted deliberately. Each one is a reason this topology is not a production topology.

- **SQLite on an SMB share.** `/home` is Azure Files. SQLite's locking over SMB is weaker than
  on local disk, and a second writer could corrupt the file. Mitigated by one worker and no
  autoscale, not by anything in the code.
- **One instance means downtime on deploy.** No slots, no zero-downtime swap. A redeploy is a
  short outage.
- **Data Protection keys are unencrypted at rest**, with no rotation policy and no Key Vault.
  Anyone who can read `/home/data/keys` can forge a session cookie.
- **No automated backup, and no restore path** beyond the per-universe export archive.
- **`AllowedHosts` is `*` by default.** Narrow it to the site hostname
  (`az webapp config appsettings set --settings AllowedHosts=<app-name>.azurewebsites.net`)
  once DEV is reachable; adding a custom domain later means updating it again.
- **Migrations run on the web process.** A long migration delays the first response after a
  deploy, and two instances would race - another reason there is only one.
- **Nothing works offline.** The service worker caches build output only, by design - ADR 0017.
- **Entry images need Cloudflare R2, which is a separate owner setup.** Until the bucket, the
  token and the five `Media__*` app settings exist, every image route answers 503 and nothing
  else is affected. Steps, config keys and limitations: [cloudflare-r2.md](cloudflare-r2.md).
- **A backup is a ZIP, and it does carry image bytes.** The per-universe export is
  `backup.json` plus every entry's original picture, so it does not depend on R2 surviving -
  ADR 0014. It is still a manual, per-universe download and still not a disaster-recovery story.

## Verifying the PWA

Over HTTPS, which the site is (`httpsOnly` is set), from a Chromium browser:

1. Open `https://<app-name>.azurewebsites.net/`. DevTools -> Application -> Manifest should
   show `Lorex`, `standalone`, start URL `/app`, and four icons that all load.
2. Application -> Service workers should show `sw.js` **activated** with scope `/`.
3. Application -> Cache storage should hold `lorex-static-v1`, and it must contain
   **only** `/assets/...` entries. If anything under `/api` ever appears there, that is a bug -
   see `public/sw.js`, which refuses those requests outright.
4. The install affordance appears in the address bar. It will not on plain HTTP; installability
   needs a secure context.

## Startup troubleshooting

Read the log first: `az webapp log tail --name <app-name> --resource-group <resource-group>`.

| What you see | What it means |
| --- | --- |
| `Applying N migration(s) to '/home/data/lorex.db'` | Normal cold start on a new or upgraded database. |
| `Database schema at '...' is up to date` | Normal restart. |
| `SQLite Error 1: 'no such table: Entities'` | The schema was not applied before startup work ran. Check `Database__MigrateOnStartup`; if it is `false`, something else owes the migration. |
| `Database__MigrateOnStartup is false: starting ... without applying migrations` | Deliberate. Remove the app setting to hand the job back to the app. |
| `SQLite Error 14: 'unable to open database file'` | `/home/data` is not writable, or the path in `ConnectionStrings__LorexDb` is wrong. |
| `No XML encryptor configured` | Expected. See Data Protection above. |
| Sessions dropped after every restart | `DataProtection__KeyRingPath` is unset or points somewhere ephemeral. |
| A 400 on every request | `AllowedHosts` does not match the hostname being used. |
| The app shell loads but every API call 404s | `wwwroot` was published but the API routes were not - check the publish step, not the client. |

## Running the deployed shape locally

Same two commands the workflow runs, which is the point of it being two commands:

```bash
npm --prefix src/Lorex.Web ci && npm --prefix src/Lorex.Web run build
```

```bash
rm -rf src/Lorex.Api/wwwroot && mkdir -p src/Lorex.Api/wwwroot && cp -r src/Lorex.Web/dist/. src/Lorex.Api/wwwroot/ && dotnet run --project src/Lorex.Api --no-launch-profile
```

`src/Lorex.Api/wwwroot` is build output and is gitignored. Set `ASPNETCORE_ENVIRONMENT`,
`ConnectionStrings__LorexDb` and `DataProtection__KeyRingPath` to try the deployed
configuration without writing to the paths App Service uses.
