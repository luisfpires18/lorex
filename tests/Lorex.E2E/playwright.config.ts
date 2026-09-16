import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const webBaseUrl = process.env.LOREX_WEB_URL ?? 'http://localhost:5173'
const apiBaseUrl = process.env.LOREX_API_URL ?? 'http://localhost:5180'
const isCi = !!process.env.CI

/**
 * How many browsers run at once, locally.
 *
 * Playwright's own default - half the logical processors - is what this stays at, because it was
 * measured and nothing below it was steadier. Against a database the suite made itself, the full
 * 155 at that default came back green three runs out of three with no SQLite contention at all.
 * Against a copy of a long-lived development one it lost tests and logged `database is locked` in
 * both runs, and halving the workers changed neither, at 1.7x the wall clock. So the knob that
 * matters is `LOREX_E2E_DB`, below; this one is here for a machine that wants to be told rather
 * than to guess. The numbers are in `README.md`.
 */
const workers = (() => {
  if (isCi) return 1
  const asked = Number(process.env.LOREX_E2E_WORKERS)
  return Number.isInteger(asked) && asked > 0 ? asked : undefined
})()

/**
 * Where the API this run writes to keeps its database.
 *
 * Unset, the API uses whatever `appsettings.Development.json` points at - the developer's own
 * world, which the suite then writes hundreds of universes into. Set to a path of its own, the
 * run starts from an empty file the startup migration builds, which is the only way to compare
 * one run against another and the way to keep authored work out of the way of the tests.
 */
const databaseEnv: Record<string, string> = process.env.LOREX_E2E_DB
  ? { ConnectionStrings__LorexDb: `Data Source=${process.env.LOREX_E2E_DB}` }
  : {}

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `dotnet run --project src/Lorex.Api --no-launch-profile --urls ${apiBaseUrl}`,
      cwd: repoRoot,
      url: `${apiBaseUrl}/health`,
      env: { ASPNETCORE_ENVIRONMENT: 'Development', ...databaseEnv },
      reuseExistingServer: !isCi,
      timeout: 180_000,
    },
    {
      command: 'npm run dev',
      cwd: `${repoRoot}src/Lorex.Web`,
      url: webBaseUrl,
      env: { LOREX_API_URL: apiBaseUrl },
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
  ],
})
