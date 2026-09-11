import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * The Lore browser's type bar, and the icon an entity type carries.
 *
 * What a type may be given, and what the API refuses, is settled by the API tests. What only a
 * browser can show is that an author picks an icon where types are managed and sees it where lore
 * is browsed; that a type nobody gave an icon to gets the neutral shape rather than a guess from its
 * name; that the bar filters exactly as the select it replaced did, search and the Trash included;
 * and that it works from a keyboard and under a thumb.
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
      content: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { id: string }).id
}

function typeBar(page: Page) {
  return page.getByRole('group', { name: 'Type' })
}

function chip(page: Page, name: string) {
  return typeBar(page).getByRole('button', { name, exact: true })
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
}

function rowIcon(page: Page, typeName: string) {
  return page.getByTestId(`type-icon-${typeName}`).locator('svg')
}

/** Types beyond the seven starters, so the chips need several rows even on a desktop. */
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

/**
 * How the chips sit in the row: how many rows they make, whether any chip reaches outside the row
 * or any label is cut short, whether the row itself has anything to scroll, each chip's height, and
 * the vertical gap between one row and the next.
 */
function chipLayout(row: Locator) {
  return row.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const chips = [...element.querySelectorAll('button')].map((chip) =>
      chip.getBoundingClientRect(),
    )
    const tops = [...new Set(chips.map((chip) => Math.round(chip.top)))].sort((a, b) => a - b)

    return {
      rows: tops.length,
      outside: chips.filter(
        (chip) => chip.left < bounds.left - 0.5 || chip.right > bounds.right + 0.5,
      ).length,
      clippedLabels: [...element.querySelectorAll<HTMLElement>('.typebar__name')].filter(
        (label) => label.scrollWidth > label.clientWidth + 1,
      ).length,
      rowOverflows: element.scrollWidth > element.clientWidth + 1,
      heights: chips.map((chip) => chip.height),
      rowGaps: tops
        .slice(1)
        .map(
          (top, index) =>
            top -
            Math.max(
              ...chips.filter((chip) => Math.round(chip.top) === tops[index]).map((c) => c.bottom),
            ),
        ),
    }
  })
}

/** Every chip inside the row, every label whole, nothing to scroll, and rows close together. */
async function expectTidyRows(row: Locator) {
  const layout = await chipLayout(row)
  expect(layout.outside).toBe(0)
  expect(layout.clippedLabels).toBe(0)
  expect(layout.rowOverflows).toBe(false)
  for (const gap of layout.rowGaps) {
    expect(gap).toBeGreaterThanOrEqual(4)
    expect(gap).toBeLessThanOrEqual(12)
  }
  return layout
}

test.describe('the type bar', () => {
  test('filters by the types a world has, with the icons its author chose', async ({ page }) => {
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
    await createEntry(page, universeId, ids.get('Kingdom')!, 'Drowned Coast', 'Salt and old roads.')

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(5)

    // ---------- Every type the world has, and nothing else ----------

    const labels = await typeBar(page)
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()))
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

    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    await expect(typeBar(page).locator('[aria-pressed="true"]')).toHaveCount(1)

    // The chosen icon, the seeded one, and the fallback - drawn where the lore is browsed.
    await expect(chip(page, 'Starship').locator('svg')).toHaveAttribute('data-icon', 'ship')
    await expect(chip(page, 'Location').locator('svg')).toHaveAttribute('data-icon', 'location')
    await expect(chip(page, 'Kingdom').locator('svg')).toHaveAttribute('data-icon', 'fallback')

    // ---------- One type ----------

    await chip(page, 'Character').click()
    await expect(chip(page, 'Character')).toHaveAttribute('aria-pressed', 'true')
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)
    await expect(card(page, 'Alenna Vance')).toBeVisible()
    await expect(card(page, 'Tidewatch Keep')).toBeHidden()

    // Chosen is something you can see, not only something a screen reader is told.
    const background = (name: string) =>
      chip(page, name).evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(await background('Character')).not.toEqual(await background('Location'))

    // ---------- Search and type narrow each other, as they always did ----------

    await page.getByLabel('Search').fill('warden')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Alenna Vance')).toBeVisible()

    await chip(page, 'Starship').click()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'The Kestrel')).toBeVisible()

    // Pressing the chosen chip again lets go of it: every type, the search still applied.
    await chip(page, 'Starship').click()
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('entity-card')).toHaveCount(3)

    // A type with nothing matching says so, rather than quietly showing everything.
    await chip(page, 'Kingdom').click()
    await expect(page.getByTestId('entity-empty')).toBeVisible()
    await page.getByLabel('Search').fill('')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Drowned Coast')).toBeVisible()

    // ---------- The Trash stays out of it ----------

    expect(
      (await page.request.delete(`/api/universes/${universeId}/entities/${brannoch}`)).ok(),
    ).toBeTruthy()
    await page.reload()
    await chip(page, 'Character').click()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Brannoch Hale')).toHaveCount(0)

    // ---------- From the keyboard ----------

    // In the tab order right after the status filter.
    await page.getByLabel('Status').focus()
    await page.keyboard.press('Tab')
    await expect(chip(page, 'All')).toBeFocused()

    // A visible focus ring, not only a focused element.
    expect(
      await chip(page, 'All').evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe('none')

    await page.keyboard.press('ArrowRight')
    await expect(chip(page, 'Character')).toBeFocused()
    await page.keyboard.press('End')
    await expect(chip(page, 'Kingdom')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(chip(page, 'Kingdom')).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, 'Drowned Coast')).toBeVisible()

    await page.keyboard.press('Home')
    await expect(chip(page, 'All')).toBeFocused()
    await page.keyboard.press('Space')
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('entity-card')).toHaveCount(4)
  })

  test('wraps onto more rows as the width runs out, and never spills sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await signUp(page)
    const universeId = await newUniverse(page)

    for (const name of MANY_TYPES) await createType(page, universeId, name)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')
    await createEntry(page, universeId, ids.get('Ritual Circle')!, 'The Tide Vigil', 'At dusk.')

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(2)

    // All, the seven starters and every added type.
    const row = page.getByTestId('type-filter')
    await expect(row.getByRole('button')).toHaveCount(1 + 7 + MANY_TYPES.length)

    // Already more than one row at a desktop width, every chip whole and inside the row.
    const wide = await expectTidyRows(row)
    expect(wide.rows).toBeGreaterThan(1)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // Less room: the same chips take more rows, still whole, still nothing to scroll.
    await page.setViewportSize({ width: 900, height: 900 })
    await expect.poll(async () => (await chipLayout(row)).rows).toBeGreaterThan(wide.rows)
    await expectTidyRows(row)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // A chip on a later row filters like any other.
    await chip(page, 'Ritual Circle').click()
    await expect(chip(page, 'Ritual Circle')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'The Tide Vigil')).toBeVisible()
  })

  test('fills the workspace column with card columns, while other screens keep their reading width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await signUp(page)
    const universeId = await newUniverse(page)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')

    const canvasWidth = () =>
      page.locator('main.canvas').evaluate((element) => element.getBoundingClientRect().width)

    // The width every screen reads at, taken from one that is not the Lore browser.
    await page.getByTestId('workspace-types').click()
    await page.waitForURL(/\/types$/)
    const reading = await canvasWidth()

    // The free space either side of the canvas, inside the workspace column - which starts where
    // the sidebar ends and runs to the edge of the window.
    const freeSpace = () =>
      page.locator('main.canvas').evaluate((element) => {
        const box = element.getBoundingClientRect()
        const column = document.querySelector('.sidebar')!.getBoundingClientRect().right
        return { left: box.left - column, right: document.documentElement.clientWidth - box.right }
      })

    // A constrained page sits in the middle of that column, not against its left edge.
    const types = await freeSpace()
    expect(types.left).toBeGreaterThan(0)
    expect(Math.abs(types.left - types.right)).toBeLessThanOrEqual(2)

    // The Lore browser takes more of the screen, and its grid turns that into columns.
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(card(page, 'Alenna Vance')).toBeVisible()
    expect(await canvasWidth()).toBeGreaterThan(reading)

    // Not a wider cap of its own: it runs to the right-hand edge of the window, which is the end of
    // the workspace column.
    const edges = await page.locator('main.canvas').evaluate((element) => ({
      right: element.getBoundingClientRect().right,
      window: document.documentElement.clientWidth,
    }))
    expect(Math.abs(edges.right - edges.window)).toBeLessThanOrEqual(1)

    // It starts where the column starts too, so it takes the whole of it and is not centred in it.
    const lore = await freeSpace()
    expect(Math.abs(lore.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(lore.right)).toBeLessThanOrEqual(1)

    const grid = page.getByTestId('entity-grid')
    const columns = await grid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
    )
    expect(columns).toBeGreaterThanOrEqual(4)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // More columns rather than wider cards: none is as wide as two of the grid's narrowest.
    const first = (await card(page, 'Alenna Vance').boundingBox())!
    const narrowest = await grid.evaluate(
      (element) => parseFloat(getComputedStyle(element).fontSize) * 17.5,
    )
    expect(first.width).toBeLessThan(narrowest * 2)

    // Heading, search, status, type chips and grid share one content area: the same left edge,
    // and the chips, the status filter and the cards end at the same right edge.
    const heading = (await page.getByRole('heading', { name: 'Lore', exact: true }).boundingBox())!
    const search = (await page.getByLabel('Search').boundingBox())!
    const status = (await page.getByLabel('Status').boundingBox())!
    const chips = (await page.getByTestId('type-filter').boundingBox())!
    const cards = (await grid.boundingBox())!
    for (const left of [heading.x, search.x, chips.x]) {
      expect(Math.abs(left - cards.x)).toBeLessThanOrEqual(1)
    }
    for (const right of [chips.x + chips.width, status.x + status.width]) {
      expect(Math.abs(right - (cards.x + cards.width))).toBeLessThanOrEqual(1)
    }

    // The primary action still answers to its name with an icon beside it.
    await expect(page.getByRole('link', { name: 'New entry', exact: true })).toBeVisible()

    // An entry's own page is not the browser, and keeps the reading width.
    await card(page, 'Alenna Vance').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByTestId('entry-name')).toBeVisible()
    expect(Math.abs((await canvasWidth()) - reading)).toBeLessThanOrEqual(1)

    const entry = await freeSpace()
    expect(entry.left).toBeGreaterThan(0)
    expect(Math.abs(entry.left - entry.right)).toBeLessThanOrEqual(2)

    // On a tablet the browser has nothing extra to take, and nothing scrolls sideways.
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect.poll(() => canvasWidth()).toBeLessThanOrEqual(768)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // And a constrained page on a tablet is what it always was: the column is narrower than the
    // reading width, so there is no room to share and nothing to centre.
    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-types').click()
    await page.waitForURL(/\/types$/)
    await expect.poll(() => canvasWidth()).toBeGreaterThan(700)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
  })
})

test.describe('the type bar on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('wraps into rows of thumb-sized chips that fit the screen', async ({ page }) => {
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

    const row = page.getByTestId('type-filter')
    await expect(row.getByRole('button')).toHaveCount(1 + 7 + MANY_TYPES.length)

    // Several rows, every chip and label whole, and nothing - the row or the page - to scroll.
    const layout = await expectTidyRows(row)
    expect(layout.rows).toBeGreaterThan(2)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // Every chip is a target a thumb can hit.
    for (const height of layout.heights) expect(height).toBeGreaterThanOrEqual(44)

    // A chip on the last rows is chosen with an ordinary tap, and filters.
    const ritual = chip(page, 'Ritual Circle')
    await ritual.tap()
    await expect(ritual).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'The Tide Vigil')).toBeVisible()

    // Chosen looks chosen.
    const background = (name: string) =>
      chip(page, name).evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(await background('Ritual Circle')).not.toEqual(await background('Character'))

    // Tapping it again lets go of it.
    await ritual.tap()
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)
  })
})
