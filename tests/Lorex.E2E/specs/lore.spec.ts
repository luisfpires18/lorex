import { expect, test, type Page } from '@playwright/test'

/**
 * Each test registers its own account and builds its own universe, so nothing depends on
 * data another test left behind.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('loremaster')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function newUniverse(page: Page, name: string) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
}

async function openLore(page: Page) {
  await page.getByTestId('workspace-lore').click()
  await page.waitForURL(/\/lore$/)
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
}

test.describe('lore', () => {
  test('build an entry with fields, tags, aliases and an article, then find it again', async ({
    page,
  }) => {
    await signUp(page)
    await newUniverse(page, unique('Ashen Reach '))

    // A new universe ships with the default types.
    await page.getByTestId('workspace-types').click()
    await expect(page.getByTestId('type-list')).toContainText('Character')

    // Add a custom type with two structured fields.
    await page.getByLabel('New type').fill('Starship')
    await page.getByTestId('add-type').click()
    await expect(page.locator('[data-type-name="Starship"]')).toBeVisible()

    await page.getByTestId('fields-Starship').click()
    await page.getByLabel('Field name').fill('Registry')
    await page.getByTestId('add-field-Starship').click()
    await expect(page.getByText('Registry')).toBeVisible()

    await page.getByLabel('Field name').fill('Class')
    // Exact: the Relation kinds section on this page is labelled "Relation kinds", which
    // a loose match would also pick up.
    await page.getByLabel('Kind', { exact: true }).selectOption({ label: 'Choose one' })
    await page.getByLabel('Options, separated by commas').fill('Courier, Hauler')
    await page.getByTestId('add-field-Starship').click()
    await expect(page.getByText('Class')).toBeVisible()

    // Write the entry.
    await openLore(page)
    await expect(page.getByTestId('entity-empty')).toBeVisible()
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)

    const name = unique('The Kestrel ')
    await page.getByLabel('Entry type').selectOption({ label: 'Starship' })
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('A courier that outran the blockade.')

    await page.getByLabel('Aliases').fill('The Grey Bird')
    await page.getByLabel('Aliases').press('Enter')
    await page.getByLabel('Tags').fill('Fleet')
    await page.getByLabel('Tags').press('Enter')

    await page.getByLabel('Registry').fill('KR-118')
    await page.getByLabel('Class').selectOption({ label: 'Courier' })

    await page.getByTestId('lore-editor').click()
    await page.keyboard.type('She was built for running, and never once for fighting.')

    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // Everything comes back on the article page.
    await expect(page.getByTestId('entry-name')).toHaveText(name)
    await expect(page.getByTestId('entry-type')).toHaveText('Starship')
    await expect(page.getByTestId('entry-aliases')).toContainText('The Grey Bird')
    await expect(page.getByTestId('entry-summary')).toContainText('outran the blockade')
    await expect(page.getByTestId('entry-tags')).toContainText('Fleet')
    await expect(page.getByTestId('entry-fields')).toContainText('KR-118')
    await expect(page.getByTestId('entry-fields')).toContainText('Courier')
    await expect(page.getByTestId('lore-article')).toContainText('built for running')

    // It shows on the grid, and search finds it.
    await page.getByRole('link', { name: 'Lore' }).first().click()
    await page.waitForURL(/\/lore$/)
    await expect(card(page, name)).toBeVisible()

    await page.getByLabel('Search').fill('Grey Bird')
    await expect(card(page, name)).toBeVisible()

    // Words that appear nowhere but inside the article body find it too.
    await page.getByLabel('Search').fill('built for running')
    await expect(card(page, name)).toBeVisible()

    await page.getByLabel('Search').fill('nothing-matches-this')
    await expect(page.getByTestId('entity-empty')).toBeVisible()
  })

  test('edit an entry and walk it from idea to canon, and it survives a reload', async ({
    page,
  }) => {
    await signUp(page)
    await newUniverse(page, unique('Vaultward '))
    await openLore(page)

    const name = unique('Alenna Vance ')
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    const entryUrl = page.url()

    // A new entry starts as an idea.
    await expect(page.getByTestId('canon-idea')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('canon-draft').click()
    await expect(page.getByTestId('canon-draft')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('canon-canon').click()
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')

    // Edit in place.
    await page.getByTestId('edit-entity').click()
    await page.getByLabel('Summary').fill('Warden of the drowned coast, and its last cartographer.')
    await page.getByTestId('lore-editor').click()
    await page.keyboard.type('She kept the tide ledger by hand.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-summary')).toContainText('last cartographer')

    // Everything persists across a full reload.
    await page.reload()
    await expect(page).toHaveURL(entryUrl)
    await expect(page.getByTestId('entry-name')).toHaveText(name)
    await expect(page.getByTestId('entry-summary')).toContainText('last cartographer')
    await expect(page.getByTestId('lore-article')).toContainText('tide ledger')
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')
  })

  test('filters narrow the grid by type and status', async ({ page }) => {
    await signUp(page)
    await newUniverse(page, unique('Longmoor '))
    await openLore(page)

    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Entry type').selectOption({ label: 'Character' })
    await page.getByLabel('Name').fill('A Person')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByTestId('canon-canon').click()
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('link', { name: 'Lore' }).first().click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Entry type').selectOption({ label: 'Location' })
    await page.getByLabel('Name').fill('A Place')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    await page.getByRole('link', { name: 'Lore' }).first().click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(2)

    await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Location' })
    await expect(card(page, 'A Place')).toBeVisible()
    await expect(card(page, 'A Person')).toBeHidden()

    await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Every type' })
    await page.getByLabel('Status').selectOption({ label: 'Canon' })
    await expect(card(page, 'A Person')).toBeVisible()
    await expect(card(page, 'A Place')).toBeHidden()
  })

  test('one owner cannot open another owner entry', async ({ page }) => {
    await signUp(page)
    await newUniverse(page, unique('Private World '))
    await openLore(page)

    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill('Private Person')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    const entryUrl = page.url()

    await page.getByRole('link', { name: 'All universes' }).click()
    await page.waitForURL('/app')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL('/login')

    // A different account may not read the first account's entry by its URL.
    await signUp(page)
    await page.goto(entryUrl)
    await expect(page.getByTestId('universe-missing')).toBeVisible()
  })
})
