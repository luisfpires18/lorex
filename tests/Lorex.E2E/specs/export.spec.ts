import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/**
 * One journey, for the one thing only a browser can prove.
 *
 * What a backup contains, what it leaves out and who may ask for one is settled by the API
 * tests, which can build lore this screen cannot reach. What they cannot show is that the
 * click actually produces a file on disk: the response is a blob, and the download is driven
 * by an object URL and an anchor. That is this file, and nothing more.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('archivist')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

test.describe('export', () => {
  test('an owner downloads a backup of their universe', async ({ page }) => {
    await signUp(page)

    await page.getByTestId('new-universe').click()
    await page.getByLabel('Name').fill(unique('Tidewatch '))
    await page.getByRole('button', { name: 'Create universe' }).click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)

    const name = unique('Alenna Vance ')
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    await page.getByTestId('workspace-settings').click()
    await page.waitForURL(/\/settings$/)

    const downloading = page.waitForEvent('download')
    await page.getByTestId('export-universe').click()
    const download = await downloading

    // Named for the world and the day, so a folder of these stays legible.
    expect(download.suggestedFilename()).toMatch(/^lorex-tidewatch-[a-z0-9]+-\d{8}\.json$/)

    const path = await download.path()
    const backup = JSON.parse(await readFile(path, 'utf8')) as {
      format: string
      formatVersion: number
      payload: { entities: { name: string }[] }
    }

    expect(backup.format).toBe('lorex.universe.backup')
    expect(backup.formatVersion).toBe(2)
    expect(backup.payload.entities.map((entity) => entity.name)).toContain(name)

    // And the page says which file to go and look for.
    await expect(page.getByTestId('export-done')).toContainText(download.suggestedFilename())
  })
})
