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

    await page.getByLabel('Search', { exact: true }).fill('warden')
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
    await page.getByLabel('Search', { exact: true }).fill('')
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
      (element) => parseFloat(getComputedStyle(element).fontSize) * 17.5,
    )
    expect(first.width).toBeLessThan(narrowest * 2)

    // Heading, search, status, type chips and grid share one content area: the same left edge,
    // and the chips, the status filter and the cards end at the same right edge.
    const heading = (await page.getByRole('heading', { name: 'Lore', exact: true }).boundingBox())!
    const search = (await page.getByLabel('Search', { exact: true }).boundingBox())!
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
