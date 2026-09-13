import { expect, test, type Page } from '@playwright/test'

/**
 * Stories and their scenes, end to end. Each test registers its own account and builds its own
 * universe, so nothing depends on data another test left behind.
 *
 * The invariant under test throughout: a story is read in the order its author tells it. Where each
 * scene happens in the world is shown on the scene - written by the universe's own chronology - and
 * never moves it.
 */
const PASSWORD = 'Test-password-123!'

/** Mirrors the API enums. */
const Direction = { up: 0, down: 1 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('teller')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** Creates a universe through the UI and returns the id it was given. */
async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

/** Before the Fall counts down, After the Fall counts up. */
async function seedTheFall(page: Page, universeId: string) {
  const response = await page.request.put(`/api/universes/${universeId}/chronology`, {
    data: {
      eras: [
        {
          id: null,
          name: 'Before the Fall',
          abbreviation: 'BF',
          direction: Direction.down,
          labelPosition: 0,
        },
        {
          id: null,
          name: 'After the Fall',
          abbreviation: 'AF',
          direction: Direction.up,
          labelPosition: 0,
        },
      ],
    },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).eras as { id: string; name: string }[]
}

/** Writes entries straight through the API, for tests that are about using them. */
async function seedEntities(page: Page, universeId: string, names: string[]) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  const character = types.find((type) => type.name === 'Character')!

  const ids: Record<string, string> = {}
  for (const name of names) {
    const created = await page.request.post(`/api/universes/${universeId}/entities`, {
      data: {
        entityTypeId: character.id,
        name,
        summary: null,
        content: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      },
    })
    expect(created.status()).toBe(201)
    ids[name] = (await created.json()).id as string
  }
  return ids
}

async function seedStory(page: Page, universeId: string, title: string, scenes: SceneSeed[]) {
  const story = await page.request.post(`/api/universes/${universeId}/stories`, {
    data: { title, premise: null, status: 0 },
  })
  expect(story.status()).toBe(201)
  const storyId = (await story.json()).id as string

  for (const scene of scenes) {
    const created = await page.request.post(
      `/api/universes/${universeId}/stories/${storyId}/scenes`,
      {
        data: {
          title: scene.title,
          summary: scene.summary ?? null,
          notes: null,
          povEntityId: scene.pov ?? null,
          chronology: scene.chronology ?? null,
          entityIds: scene.entities ?? [],
        },
      },
    )
    expect(created.status()).toBe(201)
  }

  return storyId
}

interface SceneSeed {
  title: string
  summary?: string
  pov?: string
  entities?: string[]
  chronology?: { eraId: string | null; year: number; month: number | null; day: number | null }
}

interface SceneInput {
  title: string
  summary?: string
  era?: string
  year?: string
  pov?: string
  lore?: string[]
}

/** Writes one scene through the drawer, the way an author would. */
async function addScene(page: Page, input: SceneInput) {
  await page.getByTestId('new-scene').click()
  const form = page.getByTestId('scene-form')
  await expect(form).toBeVisible()

  await page.getByTestId('scene-title-input').fill(input.title)
  if (input.summary) await page.getByTestId('scene-summary-input').fill(input.summary)
  if (input.era) await page.getByTestId('scene-eraId').selectOption({ label: input.era })
  if (input.year) await page.getByTestId('scene-year').fill(input.year)

  if (input.pov) {
    const pov = page.getByTestId('scene-pov-field')
    await pov.getByTestId('picker-input').fill(input.pov)
    await pov.getByTestId(`picker-option-${input.pov}`).click()
  }

  for (const name of input.lore ?? []) {
    const lore = page.getByTestId('scene-lore-field')
    await lore.getByTestId('participant-input').fill(name)
    await lore.getByTestId(`participant-option-${name}`).click()
  }

  await page.getByTestId('save-scene').click()
  await expect(form).toHaveCount(0)
}

function scene(page: Page, title: string) {
  return page.locator(`[data-testid="scene"][data-title="${title}"]`)
}

/** The scene titles, top to bottom, as the page lists them. */
function sceneOrder(page: Page) {
  return page
    .getByTestId('scene')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-title') ?? ''))
}

/**
 * Uses a move control and waits for the order to be saved, not only redrawn. The page announces the
 * new position once the save has landed, which is also when it will take the next move.
 */
async function moveAndSave(page: Page, action: () => Promise<void>, announcement: string) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/scenes/order') && response.request().method() === 'PUT',
    ),
    action(),
  ])
  await expect(page.getByTestId('story-announcer')).toHaveText(announcement)
}

/** Whether the page can be scrolled sideways, which no screen in Lorex may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('stories', () => {
  test('an author tells a story out of chronological order and the page keeps the telling', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Winter Reach '))
    await seedTheFall(page, universeId)
    await seedEntities(page, universeId, ['Arlen', 'White Tower', 'Council of Nine'])

    // Reached from the universe's own sidebar, where nothing has been told yet.
    await page.goto(`/app/universes/${universeId}`)
    await page.getByTestId('workspace-stories').click()
    await page.waitForURL(/\/stories$/)
    await expect(page.getByTestId('stories-empty')).toContainText('No stories yet.')

    await page.getByTestId('new-story').click()
    await page.getByTestId('story-title-input').fill('The Long Winter')
    await page.getByTestId('story-premise-input').fill('A siege, told from its last day back.')
    await page.getByTestId('story-status-drafting').click()
    await page.getByTestId('save-story').click()

    await page.waitForURL(/\/stories\/[0-9a-f-]+$/)
    const storyUrl = page.url()
    await expect(page.getByTestId('story-title')).toHaveText('The Long Winter')
    await expect(page.getByTestId('story-status')).toHaveText('Drafting')
    await expect(page.getByTestId('scenes-empty')).toContainText('No scenes yet.')

    // Told as aftermath, battle, childhood. Lived as childhood, battle, aftermath.
    await addScene(page, {
      title: 'Aftermath',
      summary: 'The gate stands open.',
      era: 'After the Fall (AF)',
      year: '30',
      pov: 'Arlen',
      lore: ['White Tower', 'Council of Nine'],
    })
    await addScene(page, {
      title: 'The Battle',
      era: 'After the Fall (AF)',
      year: '2',
      lore: ['Arlen'],
    })
    await addScene(page, { title: 'Childhood', era: 'Before the Fall (BF)', year: '40' })

    const told = ['Aftermath', 'The Battle', 'Childhood']
    await expect.poll(() => sceneOrder(page)).toEqual(told)

    // Every date is written by the universe's chronology, and none of them moved anything.
    await expect(scene(page, 'Aftermath').getByTestId('scene-when')).toHaveText('AF 30')
    await expect(scene(page, 'The Battle').getByTestId('scene-when')).toHaveText('AF 2')
    await expect(scene(page, 'Childhood').getByTestId('scene-when')).toHaveText('BF 40')
    await expect(scene(page, 'Aftermath').getByTestId('scene-pov')).toContainText('Arlen')
    await expect(scene(page, 'Aftermath').getByTestId('scene-lore')).toContainText('White Tower')
    await expect(scene(page, 'Aftermath').getByTestId('scene-lore')).toContainText(
      'Council of Nine',
    )

    await page.reload()
    await expect.poll(() => sceneOrder(page)).toEqual(told)

    // Childhood moves to the front of the telling, and stays there.
    await moveAndSave(
      page,
      () => scene(page, 'Childhood').getByTestId('scene-move-up').click(),
      '“Childhood” is now scene 2 of 3.',
    )
    await moveAndSave(
      page,
      () => scene(page, 'Childhood').getByTestId('scene-move-up').click(),
      '“Childhood” is now scene 1 of 3.',
    )
    await expect.poll(() => sceneOrder(page)).toEqual(['Childhood', 'Aftermath', 'The Battle'])

    await page.reload()
    await expect.poll(() => sceneOrder(page)).toEqual(['Childhood', 'Aftermath', 'The Battle'])

    // A linked entry is the entry's own page, not a copy of it.
    await scene(page, 'Aftermath')
      .getByTestId('scene-lore')
      .getByRole('link', { name: 'White Tower' })
      .click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByText('White Tower').first()).toBeVisible()

    await page.goto(storyUrl)
    await scene(page, 'Aftermath').getByTestId('scene-pov').getByRole('link').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByText('Arlen').first()).toBeVisible()

    // Edited in place: still the second scene told.
    await page.goto(storyUrl)
    await scene(page, 'Aftermath').getByTestId('scene-edit').click()
    await page.getByTestId('scene-title-input').fill('Aftermath at the Gate')
    await page.getByTestId('scene-notes-input').fill('Open on the silence.')
    await page.getByTestId('save-scene').click()
    await expect(page.getByTestId('scene-form')).toHaveCount(0)
    await expect
      .poll(() => sceneOrder(page))
      .toEqual(['Childhood', 'Aftermath at the Gate', 'The Battle'])

    // Deleted: the rest keep their order, and the entry it linked is still in the world.
    page.once('dialog', (dialog) => void dialog.accept())
    await scene(page, 'The Battle').getByTestId('scene-delete').click()
    await expect.poll(() => sceneOrder(page)).toEqual(['Childhood', 'Aftermath at the Gate'])

    await page.getByTestId('workspace-stories').click()
    await page.waitForURL(/\/stories$/)
    const row = page.locator('[data-testid="story-row"][data-title="The Long Winter"]')
    await expect(row.getByTestId('story-scene-count')).toHaveText('2 scenes')
  })

  test('scenes are reordered from the keyboard alone, and the focus follows the scene', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Key Reach '))
    const storyId = await seedStory(page, universeId, 'Three scenes', [
      { title: 'A' },
      { title: 'B' },
      { title: 'C' },
    ])

    await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'B', 'C'])

    const focused = () =>
      page.evaluate(() => {
        const element = document.activeElement
        return {
          control: element?.getAttribute('data-testid') ?? null,
          scene: element?.closest('[data-testid="scene"]')?.getAttribute('data-title') ?? null,
        }
      })

    // The control's name is its label, and the scene it moves describes it.
    const up = scene(page, 'C').getByRole('button', { name: 'Move up' })
    await expect(up).toHaveAccessibleDescription(/C/)
    await up.focus()

    await moveAndSave(page, () => page.keyboard.press('Enter'), '“C” is now scene 2 of 3.')
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'C', 'B'])
    await expect.poll(focused).toEqual({ control: 'scene-move-up', scene: 'C' })

    // At the top, "Move up" can go no further, so the focus lands on "Move down" rather than nowhere.
    await moveAndSave(page, () => page.keyboard.press('Enter'), '“C” is now scene 1 of 3.')
    await expect.poll(() => sceneOrder(page)).toEqual(['C', 'A', 'B'])
    await expect(scene(page, 'C').getByTestId('scene-move-up')).toBeDisabled()
    await expect.poll(focused).toEqual({ control: 'scene-move-down', scene: 'C' })

    await moveAndSave(page, () => page.keyboard.press('Space'), '“C” is now scene 2 of 3.')
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'C', 'B'])

    await page.reload()
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'C', 'B'])
  })

  test('an entry thrown in the Trash stays on its scene, named but not linked', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Trash Reach '))
    const ids = await seedEntities(page, universeId, ['Arlen', 'White Tower'])
    const storyId = await seedStory(page, universeId, 'Held', [
      { title: 'The Council', pov: ids.Arlen, entities: [ids.Arlen, ids['White Tower']] },
    ])

    const trashed = await page.request.delete(`/api/universes/${universeId}/entities/${ids.Arlen}`)
    expect(trashed.status()).toBe(204)

    await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
    const council = scene(page, 'The Council')

    await expect(council.getByTestId('scene-pov')).toContainText('Arlen')
    await expect(council.getByTestId('scene-pov').getByRole('link')).toHaveCount(0)
    await expect(
      council.getByTestId('scene-lore').getByTestId('lore-reference-trashed'),
    ).toHaveText(/Arlen.*\(in Trash\)/)
    await expect(
      council.getByTestId('scene-lore').getByRole('link', { name: 'White Tower' }),
    ).toBeVisible()

    // Saving the scene keeps what it holds.
    await council.getByTestId('scene-edit').click()
    await page.getByTestId('scene-title-input').fill('The Council, again')
    await page.getByTestId('save-scene').click()
    await expect(page.getByTestId('scene-form')).toHaveCount(0)
    await expect(scene(page, 'The Council, again').getByTestId('scene-pov')).toContainText('Arlen')
  })

  test('the story screens stay usable from a phone to a wide desktop, light and dark', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Reach '))
    const eras = await seedTheFall(page, universeId)
    const ids = await seedEntities(page, universeId, [
      'Arlen of the Long Northern Watch',
      'The White Tower at the Edge of the Known Sea',
      'Council of Nine',
      'East Gate',
      'Mira',
    ])
    const lore = Object.values(ids)
    const storyId = await seedStory(
      page,
      universeId,
      'A story whose title runs on for rather longer than any title reasonably should',
      [
        {
          title: 'The first scene, with a title long enough to wrap onto a second line somewhere',
          summary: 'A summary that also runs on, so the reading measure has something to hold.',
          pov: ids['Arlen of the Long Northern Watch'],
          entities: lore,
          chronology: { eraId: eras[1].id, year: 1200, month: 11, day: 30 },
        },
        { title: 'Second', entities: lore.slice(0, 2) },
        { title: 'Third' },
      ],
    )

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [768, 'light'],
      [1440, 'dark'],
      [1920, 'light'],
    ] as const) {
      // Layout boxes come back in fractional pixels; a hair over the edge is rounding, not overflow.
      const edge = width + 1

      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 900 })

      // Where the sections fold away behind the toggle, Stories is still one of them.
      await page.goto(`/app/universes/${universeId}`)
      await expect(page.getByTestId('workspace-name')).toBeAttached()
      const toggle = page.getByTestId('workspace-nav-toggle')
      if (await toggle.isVisible()) await toggle.click()
      await page.getByTestId('workspace-stories').click()
      await page.waitForURL(/\/stories$/)
      await expect(page.getByTestId('story-row')).toHaveCount(1)
      expect(await scrollsSideways(page), `stories at ${width}px`).toBe(false)

      await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
      await expect(page.getByTestId('scene')).toHaveCount(3)
      expect(await scrollsSideways(page), `story at ${width}px`).toBe(false)

      if (colorScheme === 'dark') {
        const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(ground, `dark ground at ${width}px`).toBe('rgb(21, 22, 23)')
      }

      // Every reorder control and every linked entry is on screen, not pushed off its edge.
      const first = page.getByTestId('scene').first()
      for (const control of ['scene-move-down', 'scene-edit', 'scene-delete']) {
        const box = await first.getByTestId(control).boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }
      for (const chip of await first.getByTestId('lore-reference').all()) {
        const box = await chip.boundingBox()
        expect(box!.x + box!.width, `lore chip at ${width}px`).toBeLessThanOrEqual(edge)
      }

      // The drawer keeps a form's measure on a wide screen and folds its date row on a narrow one.
      await first.getByTestId('scene-edit').click()
      const form = page.getByTestId('scene-form')
      await expect(form).toBeVisible()
      const formBox = await form.boundingBox()
      expect(formBox!.width, `scene form at ${width}px`).toBeLessThanOrEqual(
        Math.min(width, 560) + 1,
      )

      const era = page.getByTestId('scene-eraId')
      await era.scrollIntoViewIfNeeded()
      const eraBox = await era.boundingBox()
      expect(eraBox!.x + eraBox!.width, `era select at ${width}px`).toBeLessThanOrEqual(edge)

      const picker = page.getByTestId('scene-lore-field').getByTestId('participant-input')
      await picker.scrollIntoViewIfNeeded()
      await expect(picker).toBeVisible()
      expect(await scrollsSideways(page), `scene form at ${width}px`).toBe(false)

      await page.getByTestId('cancel-scene').click()
      await expect(form).toHaveCount(0)
    }
  })
})
