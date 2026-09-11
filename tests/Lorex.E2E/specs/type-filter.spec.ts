import { expect, test, type Page } from '@playwright/test'

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

    // A swipe is the browser's own scrolling of an overflowing row - nothing here listens to touch -
    // so what is proved is that the row is a sideways scroller a finger is allowed to pan. Headless
    // Chromium does not turn synthetic touches into scrolling, so the swipes below are the scroll
    // positions a swipe would leave, set directly.
    expect(
      await row.evaluate((element) => {
        const style = getComputedStyle(element)
        return [style.overflowX, style.touchAction]
      }),
    ).toEqual(['auto', 'auto'])

    // A swipe that stopped with a chip cut in half by the edge of the screen. Tapping the half that
    // shows chooses it, and the row brings the whole chip in, so the choice is never half hidden.
    const cut = await row.evaluate((element) => {
      const button = [...element.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === 'Species',
      )!
      element.scrollTo({
        left: button.offsetLeft + button.offsetWidth / 2 - element.clientWidth,
        behavior: 'instant',
      })
      const bounds = element.getBoundingClientRect()
      const box = button.getBoundingClientRect()
      return {
        hidden: box.right > bounds.right,
        x: (box.left + bounds.right) / 2,
        y: box.top + box.height / 2,
      }
    })
    expect(cut.hidden).toBe(true)

    await page.touchscreen.tap(cut.x, cut.y)
    await expect(chip(page, 'Species')).toHaveAttribute('aria-pressed', 'true')
    await expect(chip(page, 'Species')).toBeInViewport({ ratio: 1 })

    // The far end of the row is reached by swiping all the way, and the last type filters like any
    // other.
    const last = chip(page, 'Ritual Circle')
    await expect(last).not.toBeInViewport({ ratio: 1 })
    await row.evaluate((element) =>
      element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }),
    )
    await expect(last).toBeInViewport({ ratio: 1 })

    await last.tap()
    await expect(last).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'The Tide Vigil')).toBeVisible()
  })
})
