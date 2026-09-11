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

/** Waits until the row has stopped moving: a smooth scroll the bar itself started may still run. */
async function rowAtRest(row: Locator) {
  await expect
    .poll(() =>
      row.evaluate(async (element) => {
        const before = element.scrollLeft
        await new Promise((resolve) => setTimeout(resolve, 150))
        return element.scrollLeft === before
      }),
    )
    .toBe(true)
}

/**
 * Leaves the row where a swipe that stopped there would: at a scroll position worked out from one
 * chip, set directly, and confirmed to have landed there before anything is measured against it.
 */
async function scrollRow(row: Locator, name: string, where: 'start' | 'cut-left' | 'cut-right') {
  await rowAtRest(row)

  const target = await row.evaluate(
    (element, { name, where }) => {
      const chip = [...element.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === name,
      )!
      const left =
        where === 'start'
          ? 0
          : where === 'cut-left'
            ? chip.offsetLeft + chip.offsetWidth / 2
            : chip.offsetLeft + chip.offsetWidth / 2 - element.clientWidth
      const clamped = Math.round(
        Math.min(Math.max(0, left), element.scrollWidth - element.clientWidth),
      )
      element.scrollTo({ left: clamped, behavior: 'instant' })
      return clamped
    },
    { name, where },
  )

  await expect
    .poll(() => row.evaluate((element, target) => Math.abs(element.scrollLeft - target), target))
    .toBeLessThanOrEqual(1)
  await rowAtRest(row)
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
})

test.describe('the type bar on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  /*
   * What this does not claim: that a finger drag scrolls the row. Headless Chromium does not turn
   * synthetic touches into native scrolling, so no test here can prove that, and none pretends to.
   * What it proves instead, separately: the row is a sideways scroller a finger is allowed to pan,
   * the page itself never scrolls sideways, every chip is a thumb-sized target, and - with the row
   * left at a known position - choosing a chip that is off screen or cut by an edge selects it,
   * filters the grid, and brings the whole chip into view.
   *
   * Chips that are not fully visible are chosen with a dispatched click rather than a tap: a tap
   * scrolls its target into view first, which would do the bar's job for it and hide whether the
   * bar does it. A real tap is used on a chip that is fully in view.
   */
  test('scrolls sideways under a thumb and keeps the chosen type in view', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page)

    // Enough types that the row cannot fit a phone.
    await createType(page, universeId, 'Starship')
    await createType(page, universeId, 'Dynasty')
    await createType(page, universeId, 'Ritual Circle')
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')
    await createEntry(
      page,
      universeId,
      ids.get('Ritual Circle')!,
      'The Tide Vigil',
      'Held at dusk.',
    )

    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(2)

    const row = page.getByTestId('type-filter')

    // The row scrolls; the page does not.
    const widths = await row.evaluate((element) => [element.scrollWidth, element.clientWidth])
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1)

    // Every chip is a target a thumb can hit.
    for (const height of await row
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))) {
      expect(height).toBeGreaterThanOrEqual(44)
    }

    // A finger is allowed to pan it: it scrolls on its own axis, and nothing turns panning off.
    expect(
      await row.evaluate((element) => {
        const style = getComputedStyle(element)
        return [style.overflowX, style.touchAction]
      }),
    ).toEqual(['auto', 'auto'])

    // ---------- A type off the far end of the row ----------

    await scrollRow(row, 'All', 'start')
    const last = chip(page, 'Ritual Circle')
    await expect(last).not.toBeInViewport()

    await last.dispatchEvent('click')
    await expect(last).toHaveAttribute('aria-pressed', 'true')
    await expect(last).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'The Tide Vigil')).toBeVisible()

    // ---------- A type cut in half by the right edge ----------

    const species = chip(page, 'Species')
    await scrollRow(row, 'Species', 'cut-right')
    await expect(species).toBeInViewport()
    await expect(species).not.toBeInViewport({ ratio: 1 })

    await species.dispatchEvent('click')
    await expect(species).toHaveAttribute('aria-pressed', 'true')
    await expect(last).toHaveAttribute('aria-pressed', 'false')
    await expect(species).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('entity-empty')).toBeVisible()

    // ---------- A type cut in half by the left edge ----------

    const character = chip(page, 'Character')
    await scrollRow(row, 'Character', 'cut-left')
    await expect(character).toBeInViewport()
    await expect(character).not.toBeInViewport({ ratio: 1 })

    await character.dispatchEvent('click')
    await expect(character).toHaveAttribute('aria-pressed', 'true')
    await expect(character).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Alenna Vance')).toBeVisible()

    // ---------- A real tap on a chip in view ----------

    await scrollRow(row, 'All', 'start')
    const all = chip(page, 'All')
    await expect(all).toBeInViewport({ ratio: 1 })
    await all.tap()
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)
  })
})
