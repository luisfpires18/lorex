import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * Product refinement 022: nested Lore types. Lore has no "All" - it starts by asking for a type and reads nothing until
 * one is chosen; the types are a tree to choose from, the chosen one's path is said and kept open, and a type shows its
 * whole branch. Types nest on the Types screen, move one place among their siblings, and refuse to be deleted while they
 * hold others; every picker follows the author's order. What the API refuses and stores is proved by its own tests; this is
 * what only a browser shows.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('nester')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as { id: string }
}

/** A universe with Runes ▸ Material ▸ Metal/Stone, Runes ▸ Animal, and an entry on each of several of them. */
async function runeWorld(page: Page) {
  const u = (
    await post(page, '/api/universes', {
      name: unique('Rune World '),
      description: null,
      accentColor: null,
    })
  ).id
  const type = async (name: string, parent: string | null, icon: string | null = null) =>
    (
      await post(page, `/api/universes/${u}/entity-types`, {
        name,
        description: null,
        icon,
        accentColor: null,
        displayOrder: null,
        parent: { id: parent },
      })
    ).id
  const entry = (typeId: string, name: string) =>
    post(page, `/api/universes/${u}/entities`, {
      entityTypeId: typeId,
      name,
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })

  const runes = await type('Runes', null, 'wand')
  const material = await type('Material Runes', runes)
  const metal = await type('Metal Runes', material)
  const stone = await type('Stone Runes', material)
  const animal = await type('Animal Runes', runes)
  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const location = types.find((each) => each.name === 'Location')!.id

  await entry(runes, 'Rune of beginnings')
  await entry(material, 'Iron rune')
  await entry(metal, 'Silver rune')
  await entry(stone, 'Granite rune')
  await entry(animal, 'Wolf rune')
  await entry(location, 'Rune hill')

  return { u, runes, material, metal, stone, animal, location, type }
}

const lore = (u: string, query = '') => `/app/universes/${u}/lore${query}`
const cards = (page: Page) => page.getByTestId('entity-card')
const names = (page: Page) =>
  cards(page).evaluateAll((all) => all.map((card) => card.getAttribute('data-entity-name')).sort())
const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const panel = (page: Page) => page.getByTestId('lore-type-menu-panel')
const toggleIn = (scope: ReturnType<Page['getByTestId']>, name: string) =>
  scope.locator(`[data-testid="lore-type-toggle"][data-type-name="${name}"]`)
const linkIn = (scope: ReturnType<Page['getByTestId']>, name: string) =>
  scope.locator(`[data-testid="lore-type"][data-type-name="${name}"]`)

function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('Lore with nested types', () => {
  test('starts with no type chosen: no All, nothing read, and an invitation to choose', async ({
    page,
  }) => {
    await signUp(page)
    const w = await runeWorld(page)

    const reads: string[] = []
    page.on('request', (request) => {
      if (/\/entities\?/.test(request.url())) reads.push(request.url())
    })

    await page.goto(lore(w.u, '?q=rune&status=0'))
    const choose = page.getByTestId('lore-choose')
    await expect(choose).toContainText('Choose a type to browse your lore.')
    await expect(choose).not.toContainText('No entries yet')
    await expect(cards(page)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'All', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('lore-filters-toggle')).toHaveCount(0)
    await expect(page.getByTestId('lore-select')).toHaveCount(0)
    await expect(page.getByTestId('lore-type-menu')).toHaveAccessibleName('Choose type')

    // Creating needs no type chosen first.
    await expect(page.getByTestId('new-entity')).toHaveAccessibleName('New entry')
    await expect(page.getByTestId('mass-create')).toBeVisible()

    // An id this universe does not have is taken out of the address, and still nothing is read.
    await page.goto(lore(w.u, '?type=00000000-0000-0000-0000-000000000000'))
    await expect(page).toHaveURL(/\/lore$/)
    await expect(choose).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
    expect(reads).toEqual([])

    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.goBack()
    await page.getByTestId('mass-create').click()
    await page.waitForURL(/\/lore\/mass-create$/)
  })

  test('a tree to choose from: branches open and close, a chosen type shows its branch and its path', async ({
    page,
  }) => {
    await signUp(page)
    const w = await runeWorld(page)
    await page.goto(lore(w.u))

    // Roots, in order; branches closed until opened.
    const tree = page.getByTestId('lore-choose')
    await expect(linkIn(tree, 'Character')).toBeVisible()
    await expect(linkIn(tree, 'Runes')).toBeVisible()
    await expect(linkIn(tree, 'Material Runes')).toHaveCount(0)
    const runesToggle = toggleIn(tree, 'Runes')
    await expect(runesToggle).toHaveAccessibleName('Types inside Runes')
    await expect(runesToggle).toHaveAttribute('aria-expanded', 'false')

    // Open and close from the keyboard.
    await runesToggle.focus()
    await page.keyboard.press('Enter')
    await expect(runesToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(linkIn(tree, 'Material Runes')).toBeVisible()
    await expect(linkIn(tree, 'Animal Runes')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(runesToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(linkIn(tree, 'Material Runes')).toHaveCount(0)

    // A parent shows its whole branch - its own entries and every type beneath - and never a sibling branch.
    await linkIn(tree, 'Runes').click()
    await expect(heading(page)).toHaveText('Runes')
    await expect
      .poll(() => names(page))
      .toEqual(['Granite rune', 'Iron rune', 'Rune of beginnings', 'Silver rune', 'Wolf rune'])
    await expect(cards(page).filter({ hasText: 'Rune hill' })).toHaveCount(0)

    // Cards still name each entry's own type.
    await expect(cards(page).filter({ hasText: 'Silver rune' })).toContainText('Metal Runes')

    // A nested choice opens every ancestor in the chooser and says the path above the title.
    await page.getByTestId('lore-type-menu').click()
    await toggleIn(panel(page), 'Material Runes').click()
    await linkIn(panel(page), 'Metal Runes').click()
    await expect(heading(page)).toHaveText('Metal Runes')
    await expect(page.getByTestId('lore-path')).toHaveText('Lore›Runes›Material Runes')
    await expect.poll(() => names(page)).toEqual(['Silver rune'])

    await page.getByTestId('lore-type-menu').click()
    await expect(toggleIn(panel(page), 'Runes')).toHaveAttribute('aria-expanded', 'true')
    await expect(toggleIn(panel(page), 'Material Runes')).toHaveAttribute('aria-expanded', 'true')
    await expect(linkIn(panel(page), 'Metal Runes')).toHaveAttribute('aria-current', 'page')
    await expect(linkIn(panel(page), 'Metal Runes')).toBeFocused()
    await expect(linkIn(panel(page), 'Runes')).toHaveAttribute('data-ancestor', 'true')
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByTestId('lore-type-menu')).toBeFocused()

    // A crumb goes up a level, to that type's branch.
    await page.getByTestId('lore-path').getByRole('link', { name: 'Material Runes' }).click()
    await expect(heading(page)).toHaveText('Material Runes')
    await expect.poll(() => names(page)).toEqual(['Granite rune', 'Iron rune', 'Silver rune'])

    // The address is the place: Back, Forward and a reload.
    await page.goBack()
    await expect(heading(page)).toHaveText('Metal Runes')
    await page.goForward()
    await expect(heading(page)).toHaveText('Material Runes')
    await page.reload()
    await expect(heading(page)).toHaveText('Material Runes')
    await expect.poll(() => names(page)).toEqual(['Granite rune', 'Iron rune', 'Silver rune'])

    // New entry from a chosen type starts on that exact type, labelled by its path.
    await page.getByTestId('new-entity').click()
    await expect(page.getByLabel('Entry type')).toHaveValue(w.material)
    await expect(page.getByLabel('Entry type').locator('option:checked')).toHaveText(
      'Runes › Material Runes',
    )
  })
})

test.describe('Types screen with nested types', () => {
  test('types nest on creation and by editing, never inside themselves, and a parent waits for its children', async ({
    page,
  }) => {
    await signUp(page)
    const u = (
      await post(page, '/api/universes', {
        name: unique('Nest Types '),
        description: null,
        accentColor: null,
      })
    ).id
    await page.goto(`/app/universes/${u}/types`)

    const create = async (name: string, parent: string | null, familyTree = false) => {
      await page.getByTestId('new-type').click()
      const dialog = page.getByTestId('new-type-dialog')
      await dialog.getByTestId('type-name').fill(name)
      if (parent) await dialog.getByTestId('type-parent').selectOption({ label: parent })
      if (familyTree) await dialog.getByTestId('type-family').check()
      await dialog.getByTestId('save-type').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.locator(`[data-type-name="${name}"]`)).toBeVisible()
    }

    // New type: name, icon, parent and the Family Tree choice.
    await page.getByTestId('new-type').click()
    const fresh = page.getByTestId('new-type-dialog')
    await expect(fresh.getByTestId('type-parent').locator('option').first()).toHaveText(
      'None – a top-level type',
    )
    await expect(fresh.getByTestId('type-family')).toBeVisible()
    await fresh.getByTestId('cancel-type').click()

    await create('Realm', null)
    await create('Kingdom', 'Realm', true)
    await create('Village', 'Realm › Kingdom')
    await create('Wilds', null)

    const row = (name: string) => page.locator(`.types__row[data-type-name="${name}"]`)
    await expect(row('Kingdom')).toHaveAttribute('data-depth', '1')
    await expect(row('Village')).toHaveAttribute('data-depth', '2')
    // Said in words, not only by the step in.
    await expect(row('Village').locator('.types__name')).toContainText('inside Realm › Kingdom')
    // No Family Tree block on any row.
    await expect(page.getByTestId('type-list')).not.toContainText('Family Tree')

    // Edit: name, icon and parent - no Family Tree - and never the type itself or anything inside it.
    await page.getByTestId('edit-type-Realm').click()
    const edit = page.getByTestId('edit-type-dialog')
    await expect(edit.getByTestId('type-family')).toHaveCount(0)
    const options = await edit.getByTestId('type-parent').locator('option').allTextContents()
    expect(options).toContain('Wilds')
    expect(options.some((option) => option.startsWith('Realm'))).toBe(false)
    await edit.getByTestId('cancel-type').click()

    // Reparenting moves the whole subtree, last among its new siblings.
    await page.getByTestId('edit-type-Kingdom').click()
    await edit.getByTestId('type-parent').selectOption({ label: 'Wilds' })
    await edit.getByTestId('save-type').click()
    await expect(page.getByTestId('types-notice')).toHaveText('Saved the type “Kingdom”.')
    await expect(row('Kingdom')).toHaveAttribute('data-depth', '1')
    await expect(row('Village')).toHaveAttribute('data-depth', '2')
    const order = await page
      .locator('.types__row')
      .evaluateAll((rows) => rows.map((each) => each.getAttribute('data-type-name')))
    expect(order.slice(-4)).toEqual(['Realm', 'Wilds', 'Kingdom', 'Village'])

    // A type holding another cannot be deleted, and says why under it.
    await page.getByTestId('type-actions-Wilds').click()
    await page.getByTestId('delete-type-Wilds').click()
    await expect(page.getByTestId('type-blocked-Wilds')).toHaveText(
      "Wilds can't be deleted because it still contains 1 nested type. Move or delete those types first.",
    )
  })

  test('Up and Down move a type among its own siblings, and every picker follows', async ({
    page,
  }) => {
    await signUp(page)
    const w = await runeWorld(page)
    await page.goto(`/app/universes/${w.u}/types`)

    const order = () =>
      page
        .locator('.types__row')
        .evaluateAll((rows) => rows.map((each) => each.getAttribute('data-type-name')))

    // First Up and last Down cannot act, and say so; they stay focusable.
    await expect(page.getByTestId('move-up-Character')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('move-down-Runes')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('move-up-Material Runes')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(page.getByTestId('move-down-Animal Runes')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(page.getByTestId('move-up-Animal Runes')).toHaveAccessibleName(
      'Move Animal Runes up',
    )

    // A nested move stays inside its parent, and the focus stays on the button.
    const animalUp = page.getByTestId('move-up-Animal Runes')
    await animalUp.click()
    await expect(page.getByTestId('types-notice')).toHaveText('Moved “Animal Runes” up.')
    expect((await order()).slice(-5)).toEqual([
      'Runes',
      'Animal Runes',
      'Material Runes',
      'Metal Runes',
      'Stone Runes',
    ])
    await expect(animalUp).toBeFocused()
    await expect(animalUp).toHaveAttribute('aria-disabled', 'true')

    // A root move carries its branch with it; Up from the keyboard.
    await page.getByTestId('move-up-Runes').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('types-notice')).toHaveText('Moved “Runes” up.')
    const moved = await order()
    // Runes now comes before Concept - its four nested types with it - and after Species.
    expect(moved[moved.indexOf('Runes') - 1]).toBe('Species')
    expect(moved[moved.indexOf('Runes') + 5]).toBe('Concept')
    expect(moved.slice(moved.indexOf('Runes'), moved.indexOf('Runes') + 5)).toEqual([
      'Runes',
      'Animal Runes',
      'Material Runes',
      'Metal Runes',
      'Stone Runes',
    ])

    // Kept.
    await page.reload()
    await expect.poll(order).toEqual(moved)

    // Lore's chooser, New entry and Mass create all read the same order.
    await page.goto(lore(w.u))
    const tree = page.getByTestId('lore-choose')
    await toggleIn(tree, 'Runes').click()
    const chooser = await tree
      .getByTestId('lore-type')
      .evaluateAll((links) => links.map((link) => link.getAttribute('data-type-name')))
    expect(chooser.slice(chooser.indexOf('Species'), chooser.indexOf('Species') + 5)).toEqual([
      'Species',
      'Runes',
      'Animal Runes',
      'Material Runes',
      'Concept',
    ])

    const inOrder = [
      'Character',
      'Location',
      'Organization',
      'Event',
      'Item',
      'Species',
      'Runes',
      'Runes › Animal Runes',
      'Runes › Material Runes',
      'Runes › Material Runes › Metal Runes',
      'Runes › Material Runes › Stone Runes',
      'Concept',
    ]
    await page.goto(`/app/universes/${w.u}/lore/new`)
    await expect(page.getByLabel('Entry type').locator('option')).toHaveText(inOrder)

    await page.goto(`/app/universes/${w.u}/lore/mass-create`)
    await expect(page.getByTestId('mass-default-type').locator('option')).toHaveText(inOrder)
  })
})

test.describe('nested types at every size', () => {
  test('a deep branch reads at 360, 390, 200%, in both themes, with long and right-to-left names', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const setup = await browser.newContext()
    const page = await setup.newPage()
    await signUp(page)
    const w = await runeWorld(page)
    let parent = w.location
    const path = ['Location']
    for (const name of [
      'Continent',
      'Kingdom',
      'Province of the Very Long Northern Marches Beyond the Grey Water',
      'עידן האור הגדול',
      'District',
      'Outpost',
    ]) {
      parent = await w.type(name, parent)
      path.push(name)
    }
    await post(page, `/api/universes/${w.u}/entities`, {
      entityTypeId: parent,
      name: 'Last watchtower',
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })
    const state = await setup.storageState()
    await setup.close()

    await everySize(browser, state, w.u, parent, path)
  })
})

async function everySize(
  browser: Browser,
  state: Awaited<ReturnType<BrowserContext['storageState']>>,
  u: string,
  deepest: string,
  path: string[],
) {
  for (const theme of ['light', 'dark']) {
    for (const size of [
      { width: 1920, height: 1080, scale: 1 },
      { width: 1440, height: 900, scale: 1 },
      { width: 1024, height: 768, scale: 1 },
      { width: 820, height: 1180, scale: 1 },
      { width: 640, height: 450, scale: 2 },
      { width: 390, height: 844, scale: 1 },
      { width: 360, height: 780, scale: 1 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.scale,
        storageState: state,
        hasTouch: size.width <= 390,
      })
      await context.addInitScript((value) => localStorage.setItem('lorex-theme', value), theme)
      const page = await context.newPage()
      const at = `${theme} ${size.width}@${size.scale}x`

      // The deepest type, chosen by address: its path, its card, and its branch open in the chooser.
      await page.goto(lore(u, `?type=${deepest}`))
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(heading(page)).toHaveText('Outpost')
      await expect(cards(page)).toHaveCount(1)
      await expect(
        page.getByTestId('lore-path').locator('bdi', { hasText: 'עידן האור הגדול' }),
      ).toBeVisible()
      expect(await sideways(page), at).toBeLessThanOrEqual(0)

      await page.getByTestId('lore-type-menu').click()
      await expect(linkIn(panel(page), 'Outpost')).toHaveAttribute('aria-current', 'page')
      for (const name of path.slice(0, -1)) {
        await expect(toggleIn(panel(page), name), at).toHaveAttribute('aria-expanded', 'true')
      }
      const box = await panel(page).boundingBox()
      expect(box!.x + box!.width, at).toBeLessThanOrEqual(size.width)
      const linksInside = await panel(page).evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return [...element.querySelectorAll('a, button')].every((control) => {
          const rect = control.getBoundingClientRect()
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
        })
      })
      expect(linksInside, at).toBe(true)
      expect(await sideways(page), at).toBeLessThanOrEqual(0)

      // Under a finger: a branch closes and opens again, and its button is a full target.
      if (size.width <= 390) {
        const kingdom = toggleIn(panel(page), 'Kingdom')
        expect((await kingdom.boundingBox())!.height, at).toBeGreaterThanOrEqual(43.5)
        await kingdom.tap()
        await expect(kingdom).toHaveAttribute('aria-expanded', 'false')
        await expect(linkIn(panel(page), 'Outpost')).toHaveCount(0)
        await kingdom.tap()
        await expect(linkIn(panel(page), 'Outpost')).toBeVisible()
      }
      await page.keyboard.press('Escape')

      // The Types screen: every row's tools inside the window, at every depth.
      await page.goto(`/app/universes/${u}/types`)
      await expect(page.locator('.types__row[data-type-name="Outpost"]')).toBeVisible()
      const rowsFit = await page
        .locator('.types__row')
        .evaluateAll(
          (rows, width) =>
            rows.every((row) =>
              [...row.querySelectorAll('button')].every(
                (button) => button.getBoundingClientRect().right <= width,
              ),
            ),
          size.width,
        )
      expect(rowsFit, at).toBe(true)
      await expect(
        page.locator('.types__row[data-type-name="עידן האור הגדול"] .types__name bdi'),
      ).toHaveText('עידן האור הגדול')
      expect(await sideways(page), at).toBeLessThanOrEqual(0)

      await context.close()
    }
  }
}
