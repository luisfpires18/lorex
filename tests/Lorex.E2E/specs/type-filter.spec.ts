import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Lore's types as local navigation, and the icon an entity type carries.
 *
 * What a type may be given, and what the API refuses, is settled by the API tests. What only a
 * browser can show is that an author picks an icon where types are managed and sees it where lore
 * is browsed; that a type nobody gave an icon to gets the neutral shape rather than a guess from its
 * name; that the chosen type is an address - reloaded, walked back and forward, kept by an opened
 * entry and by a new one - custom types included; that the filter and status narrow within it; and
 * that it works from a keyboard, in one row on a desktop and one menu under a thumb.
 *
 * Types are made through the screen, because that is part of what is being proved. Entries are
 * made through the API: they are only the grid the bar filters.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('cartographer')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Tidewatch '))
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function typeIds(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/entity-types`)
  expect(response.ok()).toBeTruthy()
  const types = (await response.json()) as Array<{ id: string; name: string }>
  return new Map(types.map((type) => [type.name, type.id]))
}

async function createType(page: Page, universeId: string, name: string) {
  const response = await page.request.post(`/api/universes/${universeId}/entity-types`, {
    data: { name, description: null, icon: null, accentColor: null, displayOrder: null },
  })
  expect(response.ok()).toBeTruthy()
}

async function createEntry(
  page: Page,
  universeId: string,
  entityTypeId: string,
  name: string,
  summary: string,
) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId,
      name,
      summary,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { id: string }).id
}

function typeNav(page: Page) {
  return page.getByRole('navigation', { name: 'Lore types' })
}

function typeLink(page: Page, name: string) {
  return typeNav(page).getByRole('link', { name, exact: true })
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
}

function rowIcon(page: Page, typeName: string) {
  return page.getByTestId(`type-icon-${typeName}`).locator('svg')
}

function title(page: Page) {
  return page.getByRole('heading', { level: 1 })
}

function statusChoice(page: Page, name: string) {
  return page.getByRole('group', { name: 'Status' }).getByRole('button', { name, exact: true })
}

/** Types beyond the seven starters, so the row has more than it can show at once. */
const MANY_TYPES = [
  'Kingdom',
  'Starship',
  'Dynasty',
  'Artifact',
  'Ritual Circle',
  'Rumour of the Tide',
]

/** How far the document scrolls sideways. One pixel of rounding is not a defect. */
function pageOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('lore types', () => {
  test('are places in the address: chosen, reloaded, walked back and forward, and opened into', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)

    // ---------- Icons are chosen where types are managed ----------

    await page.getByTestId('workspace-types').click()
    await page.waitForURL(/\/types$/)

    // A starter type arrives with the icon it was seeded with.
    await expect(rowIcon(page, 'Character')).toHaveAttribute('data-icon', 'character')

    await page.getByLabel('New type').fill('Starship')
    await page.getByTestId('new-type-icon').getByTitle('Ship').click()
    await expect(
      page.getByTestId('new-type-icon').getByRole('radio', { name: 'Ship' }),
    ).toBeChecked()
    await page.getByTestId('add-type').click()
    await expect(rowIcon(page, 'Starship')).toHaveAttribute('data-icon', 'ship')

    // Named like something a crown would suit, and given nothing: it gets the neutral shape.
    await page.getByLabel('New type').fill('Kingdom')
    await page.getByTestId('add-type').click()
    await expect(rowIcon(page, 'Kingdom')).toHaveAttribute('data-icon', 'fallback')

    // An icon can be chosen later, and taken away again.
    await page.getByTestId('icon-Kingdom').click()
    const picker = page.getByTestId('icon-picker-Kingdom')
    await picker.getByTitle('Crown').click()
    await expect(rowIcon(page, 'Kingdom')).toHaveAttribute('data-icon', 'crown')
    await picker.getByTitle('No icon').click()
    await expect(rowIcon(page, 'Kingdom')).toHaveAttribute('data-icon', 'fallback')
    await expect(picker.getByRole('radio', { name: 'No icon' })).toBeChecked()

    // ---------- A world with entries in several types ----------

    const ids = await typeIds(page, universeId)
    await createEntry(
      page,
      universeId,
      ids.get('Character')!,
      'Alenna Vance',
      'Warden of the drowned coast.',
    )
    const brannoch = await createEntry(
      page,
      universeId,
      ids.get('Character')!,
      'Brannoch Hale',
      'Keeper of the tide ledger.',
    )
    await createEntry(
      page,
      universeId,
      ids.get('Location')!,
      'Tidewatch Keep',
      'Where the warden sleeps.',
    )
    await createEntry(
      page,
      universeId,
      ids.get('Starship')!,
      'The Kestrel',
      'Once carried the warden.',
    )

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(4)

    // ---------- Every type the world has, starters and custom, and nothing else ----------

    const labels = await typeNav(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.textContent?.trim()))
    expect(labels).toEqual([
      'All',
      'Character',
      'Location',
      'Organization',
      'Event',
      'Item',
      'Species',
      'Concept',
      'Starship',
      'Kingdom',
    ])
    await expect(typeLink(page, 'All')).toHaveAttribute('aria-current', 'page')
    await expect(typeNav(page).locator('[aria-current="page"]')).toHaveCount(1)
    await expect(title(page)).toHaveText('Lore')

    // The chosen icon, the seeded one, and the fallback - drawn where the lore is browsed.
    await expect(typeLink(page, 'Starship').locator('svg')).toHaveAttribute('data-icon', 'ship')
    await expect(typeLink(page, 'Location').locator('svg')).toHaveAttribute('data-icon', 'location')
    await expect(typeLink(page, 'Kingdom').locator('svg')).toHaveAttribute('data-icon', 'fallback')

    // ---------- A type is a place: the address says it ----------

    await typeLink(page, 'Character').click()
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${ids.get('Character')}$`))
    await expect(typeLink(page, 'Character')).toHaveAttribute('aria-current', 'page')
    await expect(title(page)).toHaveText('Character')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)
    await expect(card(page, 'Tidewatch Keep')).toBeHidden()

    // Current is drawn, not only announced.
    const background = (name: string) =>
      typeLink(page, name).evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(await background('Character')).not.toEqual(await background('Location'))

    await typeLink(page, 'Location').click()
    await expect(title(page)).toHaveText('Location')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // Back returns to Character, Forward to Location, and a reload stays where it is.
    await page.goBack()
    await expect(title(page)).toHaveText('Character')
    await expect(typeLink(page, 'Character')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)
    await page.goForward()
    await expect(title(page)).toHaveText('Location')
    await page.reload()
    await expect(title(page)).toHaveText('Location')
    await expect(typeLink(page, 'Location')).toHaveAttribute('aria-current', 'page')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // ---------- Opening an entry, and coming back to the same type ----------

    await card(page, 'Tidewatch Keep').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.goBack()
    await expect(title(page)).toHaveText('Location')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // The entry's type crumb leads back to that type too.
    await card(page, 'Tidewatch Keep').click()
    await page.getByTestId('entry-type').click()
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${ids.get('Location')}$`))

    // ---------- A custom type works exactly like a starter ----------

    await typeLink(page, 'Starship').click()
    await expect(title(page)).toHaveText('Starship')
    await expect(card(page, 'The Kestrel')).toBeVisible()
    const shipUrl = page.url()
    await page.goto('/app')
    await page.goto(shipUrl)
    await expect(typeLink(page, 'Starship')).toHaveAttribute('aria-current', 'page')

    // ---------- The filter and the status narrow within the type, and keep it ----------

    await typeLink(page, 'Character').click()
    await expect(title(page)).toHaveText('Character')
    await page.getByLabel('Filter entries').fill('warden')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Alenna Vance')).toBeVisible()

    // Changing type keeps the filter: Location's warden, not the whole list.
    await typeLink(page, 'Location').click()
    await expect(page.getByLabel('Filter entries')).toHaveValue('warden')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // Nothing matching says so, and offers to clear the filters - not to write a first entry.
    await statusChoice(page, 'Canon').click()
    await expect(statusChoice(page, 'Canon')).toHaveAttribute('aria-pressed', 'true')
    const empty = page.getByTestId('entity-empty')
    await expect(empty).toContainText('Nothing matches that.')
    await empty.getByRole('link', { name: 'Clear filters' }).click()
    await expect(page.getByLabel('Filter entries')).toHaveValue('')
    await expect(statusChoice(page, 'Any status')).toHaveAttribute('aria-pressed', 'true')
    await expect(title(page)).toHaveText('Location')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // ---------- An empty type invites its first entry, in that type ----------

    await typeLink(page, 'Kingdom').click()
    await expect(empty).toContainText('Nothing filed under Kingdom yet.')
    const create = page.getByTestId('new-entity')
    await expect(create).toHaveAccessibleName('New Kingdom')
    await empty.getByRole('link', { name: 'New Kingdom' }).click()
    await page.waitForURL(new RegExp(`/lore/new\\?type=${ids.get('Kingdom')}$`))
    await expect(page.getByLabel('Entry type')).toHaveValue(ids.get('Kingdom')!)
    // Still the author's choice: the type can be changed before the entry exists.
    await page.getByLabel('Entry type').selectOption({ label: 'Character' })
    await expect(page.getByLabel('Entry type')).toHaveValue(ids.get('Character')!)
    await page.goBack()

    // ---------- An id this universe does not have is All ----------

    await page.goto(`/app/universes/${universeId}/lore?type=00000000-0000-0000-0000-000000000000`)
    await expect(page).toHaveURL(/\/lore$/)
    await expect(typeLink(page, 'All')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('entity-card')).toHaveCount(4)

    // ---------- The Trash stays out of it ----------

    expect(
      (await page.request.delete(`/api/universes/${universeId}/entities/${brannoch}`)).ok(),
    ).toBeTruthy()
    await typeLink(page, 'Character').click()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Brannoch Hale')).toHaveCount(0)

    // ---------- From the keyboard ----------

    // In the tab order straight after the page's create action.
    await page.getByTestId('new-entity').focus()
    await page.keyboard.press('Tab')
    await expect(typeLink(page, 'All')).toBeFocused()
    // A visible focus ring, not only a focused element.
    expect(
      await typeLink(page, 'All').evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe('none')
    await page.keyboard.press('ArrowRight')
    await expect(typeLink(page, 'Character')).toBeFocused()
    await page.keyboard.press('End')
    await expect(typeLink(page, 'Kingdom')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(typeLink(page, 'All')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(title(page)).toHaveText('Location')

    // A card is one link, opened from the keyboard, holding nothing else to press.
    const keep = card(page, 'Tidewatch Keep')
    await expect(keep.locator('a, button, input')).toHaveCount(0)
    await keep.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByTestId('entry-name')).toHaveText('Tidewatch Keep')
  })

  test('keep to one row on a desktop, scrolling it - not the page - when a world has many', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await signUp(page)
    const universeId = await newUniverse(page)

    for (const name of MANY_TYPES) await createType(page, universeId, name)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')
    await createEntry(
      page,
      universeId,
      ids.get('Rumour of the Tide')!,
      'The Tide Vigil',
      'At dusk.',
    )

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(2)

    // All, the seven starters and every added type, on one line.
    const links = typeNav(page).getByRole('link')
    await expect(links).toHaveCount(1 + 7 + MANY_TYPES.length)
    const tops = await links.evaluateAll((all) =>
      all.map((link) => Math.round(link.getBoundingClientRect().top)),
    )
    expect(new Set(tops).size).toBe(1)

    // The row has more than it shows, and scrolls itself; the page does not.
    const row = page.getByTestId('lore-types')
    expect(await row.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // A type at the far end, chosen by address, is brought into view.
    await page.goto(`/app/universes/${universeId}/lore?type=${ids.get('Rumour of the Tide')}`)
    const last = typeLink(page, 'Rumour of the Tide')
    await expect(last).toHaveAttribute('aria-current', 'page')
    await expect(card(page, 'The Tide Vigil')).toBeVisible()
    const inView = await last.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const bounds = element.parentElement!.getBoundingClientRect()
      return box.left >= bounds.left - 1 && box.right <= bounds.right + 1
    })
    expect(inView).toBe(true)
  })

  test('fills the workspace column on every screen, and the Lore grid turns that into columns', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await signUp(page)
    const universeId = await newUniverse(page)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')

    // What the shell leaves a page - the column from the end of the sidebar to the edge of the
    // window - and what the canvas takes of it, with the rail and sidebar measured in their own
    // rem so this says nothing about one screen's pixels.
    const column = () =>
      page.locator('main.canvas').evaluate((element) => {
        const box = element.getBoundingClientRect()
        const rail = document.querySelector('.rail')!.getBoundingClientRect()
        const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect()
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
        return {
          left: box.left - sidebar.right,
          right: document.documentElement.clientWidth - box.right,
          width: box.width,
          railRem: rail.width / rem,
          sidebarRem: sidebar.width / rem,
        }
      })

    // Every section fills that column, edge to edge, and none of them moves the chrome.
    for (const section of [
      'workspace-lore',
      'workspace-timeline',
      'workspace-world-rules',
      'workspace-canon',
      'workspace-types',
      'workspace-trash',
      'workspace-settings',
    ]) {
      await page.getByTestId(section).click()
      await expect.poll(async () => Math.round((await column()).left)).toBe(0)

      const box = await column()
      expect(Math.abs(box.right), section).toBeLessThanOrEqual(1)
      expect(box.railRem, section).toBeCloseTo(3.5, 1)
      expect(box.sidebarRem, section).toBeCloseTo(15, 1)
      expect(await pageOverflow(page), section).toBeLessThanOrEqual(1)
    }

    // ---------- The Lore browser ----------

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(card(page, 'Alenna Vance')).toBeVisible()

    const grid = page.getByTestId('entity-grid')
    const columns = await grid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
    )
    expect(columns).toBeGreaterThanOrEqual(4)

    // More columns rather than wider cards: none is as wide as two of the grid's narrowest.
    const first = (await card(page, 'Alenna Vance').boundingBox())!
    const narrowest = await grid.evaluate(
      (element) => parseFloat(getComputedStyle(element).fontSize) * 18,
    )
    expect(first.width).toBeLessThan(narrowest * 2)

    // Heading, types, filter and grid share one content area: the same left edge, and the types'
    // row and the cards end at the same right edge.
    const heading = (await title(page).boundingBox())!
    const filter = (await page.getByLabel('Filter entries').boundingBox())!
    const types = (await page.getByTestId('lore-types').boundingBox())!
    const cards = (await grid.boundingBox())!
    for (const left of [heading.x, filter.x, types.x]) {
      expect(Math.abs(left - cards.x)).toBeLessThanOrEqual(3)
    }
    expect(Math.abs(types.x + types.width - (cards.x + cards.width))).toBeLessThanOrEqual(3)

    // The primary action still answers to its name with an icon beside it.
    await expect(page.getByRole('link', { name: 'New entry', exact: true })).toBeVisible()

    // ---------- An entry's own page ----------

    await card(page, 'Alenna Vance').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByTestId('entry-name')).toBeVisible()

    const entry = await column()
    expect(Math.abs(entry.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(entry.right)).toBeLessThanOrEqual(1)

    // The page fills the column, but its prose does not: a summary still reads at its own measure.
    const summary = (await page.getByTestId('entry-summary').boundingBox())!
    expect(summary.width).toBeLessThan(entry.width * 0.8)

    // ---------- A tablet is as it was ----------

    await page.setViewportSize({ width: 768, height: 1024 })
    await expect.poll(async () => Math.round((await column()).right)).toBe(0)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-types').click()
    await page.waitForURL(/\/types$/)
    await expect.poll(async () => (await column()).width).toBeGreaterThan(700)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
  })
})

test.describe('lore types on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('fold into one labelled Type menu, and the first screen is cards', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page)

    for (const name of MANY_TYPES) await createType(page, universeId, name)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')
    await createEntry(page, universeId, ids.get('Ritual Circle')!, 'The Tide Vigil', 'At dusk.')

    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(2)

    // No row of chips: one button that says what it chooses and what is chosen.
    await expect(typeNav(page)).toBeHidden()
    const trigger = page.getByTestId('lore-type-menu')
    await expect(trigger).toHaveAccessibleName('Type: All')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44)

    // The first card is on the first screen, well above the fold.
    const firstCard = (await page.getByTestId('entity-card').first().boundingBox())!
    expect(firstCard.y).toBeLessThanOrEqual(300)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // Every type is in the menu, the current one marked, and focus lands on it.
    await trigger.tap()
    const menu = page.getByTestId('lore-type-menu-panel')
    await expect(menu.getByRole('link')).toHaveCount(1 + 7 + MANY_TYPES.length)
    const allItem = menu.getByRole('link', { name: 'All', exact: true })
    await expect(allItem).toHaveAttribute('aria-current', 'page')
    await expect(allItem).toBeFocused()

    // Choosing one closes the menu, goes there, and hands the focus back to the button.
    await menu.getByRole('link', { name: 'Ritual Circle', exact: true }).tap()
    await expect(menu).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${ids.get('Ritual Circle')}$`))
    await expect(trigger).toHaveAccessibleName('Type: Ritual Circle')
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'The Tide Vigil')).toBeVisible()

    // Escape closes it without choosing.
    await trigger.tap()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // Filters fold behind one button that counts what is on.
    const filters = page.getByTestId('lore-filters-toggle')
    await expect(page.getByLabel('Filter entries')).toBeHidden()
    await filters.tap()
    await expect(filters).toHaveAttribute('aria-expanded', 'true')
    await page.getByLabel('Filter entries').fill('nothing-like-this')
    await expect(filters).toContainText('1')
    await expect(page.getByTestId('entity-empty')).toContainText('Nothing matches that.')

    // One labelled create, at the bottom edge in reach of a thumb, for the type in view.
    const create = page.getByTestId('new-entity')
    await expect(create).toHaveAccessibleName('New Ritual Circle')
    const box = (await create.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.y + box.height).toBeGreaterThan(844 - 100)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await expect(page.getByRole('link', { name: 'New Ritual Circle' })).toHaveCount(1)
  })
})
