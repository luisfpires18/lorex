import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const webBaseUrl = process.env.LOREX_WEB_URL ?? 'http://localhost:5173'
const apiBaseUrl = process.env.LOREX_API_URL ?? 'http://localhost:5180'
const isCi = !!process.env.CI

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
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
      env: { ASPNETCORE_ENVIRONMENT: 'Development' },
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
