import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Titles and names written right to left, or mixing scripts, drawn in their own direction.
 *
 * Lorex's interface is left to right and stays that way. What an author wrote is isolated in a `<bdi>`: inside it
 * the browser lays the text out in the direction of its first strong letter, so an Arabic or Hebrew title keeps
 * its words, numbers and brackets in the order they were written, while the header, card or row around it keeps
 * Lorex's layout exactly - nothing of the application turns right to left, nothing is reordered and nothing moves
 * aside. A title field is `dir="auto"` itself, since text in a field cannot be isolated from inside.
 *
 * The invariants: the authored text's own direction, the left-to-right layout around it, the accessible text
 * unchanged, and no screen scrolling sideways at 1440px or at 390px. Credentials here are obviously synthetic.
 */
const PASSWORD = 'Test-password-123!'

const Canon = { idea: 0, draft: 1, canon: 2 } as const

/** Realistic mixed-direction names: the cases where an inherited left-to-right direction reorders the text. */
const Text = {
  arabic: 'آكرون رايت',
  hebrew: 'אהרן רייט',
  rtlThenLatin: 'آكرون Wright',
  latinThenRtl: 'Wright آكرون',
  numbers: 'آكرون — 12 / Wright',
  brackets: 'آكرون (Wright)',
  long: 'آكرون رايت من البيت السابع، حداد وقاضٍ وأب متردد لسلالة Wright التي عملت الحديد لأحد عشر جيلاً (12)',
}

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('scribe')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

// ---------- Setup through the API: the specs are about how things are drawn, not how they are made ----------

async function post<T = { id: string }>(page: Page, url: string, data: unknown) {
  const response = await page.request.post(url, { data })
  expect(response.ok(), `${url} answered ${response.status()}`).toBe(true)
  return (await response.json()) as T
}

async function seedUniverse(page: Page, name: string) {
  return (await post(page, '/api/universes', { name, description: null, accentColor: null })).id
}

async function seedType(page: Page, universeId: string, name: string) {
  return (
    await post(page, `/api/universes/${universeId}/entity-types`, {
      name,
      description: null,
      icon: null,
      accentColor: null,
      displayOrder: null,
    })
  ).id
}

async function characterTypeId(page: Page, universeId: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  return types.find((type) => type.name === 'Character')!.id
}

async function seedEntity(
  page: Page,
  universeId: string,
  name: string,
  { typeId, aliases = [] }: { typeId?: string; aliases?: string[] } = {},
) {
  return (
    await post(page, `/api/universes/${universeId}/entities`, {
      entityTypeId: typeId ?? (await characterTypeId(page, universeId)),
      name,
      summary: null,
      canonStatus: Canon.canon,
      aliases,
      tags: [],
      fields: [],
    })
  ).id
}

async function seedKind(page: Page, universeId: string, name: string, inverseName: string) {
  return (
    await post(page, `/api/universes/${universeId}/relationship-types`, {
      name,
      inverseName,
      isSymmetric: false,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic: 1,
    })
  ).id
}

async function seedLink(page: Page, universeId: string, kindId: string, from: string, to: string) {
  await post(page, `/api/universes/${universeId}/relationships`, {
    relationshipTypeId: kindId,
    sourceEntityId: from,
    targetEntityId: to,
    canonStatus: Canon.canon,
    startDate: null,
    endDate: null,
    notes: null,
  })
}

async function seedStory(page: Page, universeId: string, title: string) {
  return (
    await post(page, `/api/universes/${universeId}/stories`, { title, premise: null, status: 0 })
  ).id
}

// ---------- What is asserted ----------

function computedDirection(element: Locator) {
  return element.evaluate((node) => getComputedStyle(node).direction)
}

/**
 * The authored text inside `container`: in its own `<bdi>`, resolved to `direction`, while the container itself
 * keeps Lorex's left to right. The text is exactly what was written - no mark, no copy.
 */
async function expectIsolated(container: Locator, text: string, direction: 'rtl' | 'ltr' = 'rtl') {
  const isolate = container.locator('bdi').filter({ hasText: text }).first()
  await expect(isolate).toHaveText(text)
  expect(await computedDirection(isolate), `"${text}" is not laid out in its own direction`).toBe(
    direction,
  )
  expect(await computedDirection(container), 'the element around the text changed direction').toBe(
    'ltr',
  )
}

/** The given words in the order the browser actually drew them, left to right. */
function drawnOrder(element: Locator, words: string[]) {
  return element.evaluate((node, wanted) => {
    const left = (word: string) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const at = (text.textContent ?? '').indexOf(word)
        if (at >= 0) {
          const range = document.createRange()
          range.setStart(text, at)
          range.setEnd(text, at + word.length)
          return range.getBoundingClientRect().left
        }
      }
      throw new Error(`"${word}" is not on the page`)
    }
    return [...wanted].sort((a, b) => left(a) - left(b))
  }, words)
}

/** Left edges of the given elements, in the order given. */
async function lefts(...elements: Locator[]) {
  return Promise.all(elements.map(async (element) => (await element.boundingBox())!.x))
}

function isIncreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1])
}

/** Nothing that belongs to Lorex has turned right to left: the document, and the named chrome. */
async function expectLorexStaysLeftToRight(page: Page, chrome: Locator[]) {
  expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBeNull()
  expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('ltr')
  for (const element of chrome) {
    expect(await computedDirection(element)).toBe('ltr')
  }
}

/** Whether the page can be scrolled sideways, which no screen in Lorex may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

test.describe('text direction', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("an entry's name, type and aliases keep their own direction on every view, and its header keeps Lorex's", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Hearths '))
    const person = await seedType(page, universeId, 'شخصية')
    const akron = await seedEntity(page, universeId, Text.numbers, {
      typeId: person,
      aliases: [Text.arabic, 'رايت', Text.latinThenRtl],
    })
    const aaron = await seedEntity(page, universeId, Text.hebrew)
    await seedLink(page, universeId, await seedKind(page, universeId, 'والد', 'ابن'), akron, aaron)

    const url = `/app/universes/${universeId}/lore/${akron}`
    await page.goto(url)

    // ---- The name: laid out right to left, so the number and the Latin word land where they were written ----

    const name = page.getByTestId('entry-name')
    await expect(page.getByRole('heading', { level: 2, name: Text.numbers })).toBeVisible()
    await expectIsolated(name, Text.numbers)
    // Inherited left to right, this drew as "12 — آكرون / Wright": the number thrown to the far end.
    expect(await drawnOrder(name, ['آكرون', '12', 'Wright'])).toEqual(['Wright', '12', 'آكرون'])

    // The type is an author's word too.
    await expectIsolated(page.getByTestId('entry-type'), 'شخصية')

    // ---- Aliases: each one isolated, so two written right to left cannot run together and swap places ----

    const stored = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${akron}`)
    ).json()) as { aliases: string[] }
    const aliases = page.getByTestId('entry-aliases')
    await expect(aliases).toHaveText(`also known as ${stored.aliases.join(', ')}`)
    const each = aliases.locator('bdi')
    await expect(each).toHaveText(stored.aliases)
    expect(isIncreasing(await lefts(...(await each.all()))), 'the aliases are out of order').toBe(
      true,
    )

    // ---- The header keeps its layout: the name under its metadata, every control where it always is ----

    const header = page.locator('.entry__head')
    const status = page.getByRole('group', { name: 'Canon status' })
    const [headerBox, nameText, type, canon] = await Promise.all([
      header.boundingBox(),
      name.locator('bdi').boundingBox(),
      page.getByTestId('entry-type').boundingBox(),
      status.boundingBox(),
    ])
    expect(
      Math.abs(nameText!.x - headerBox!.x),
      'the name moved off the header start',
    ).toBeLessThan(1)
    // The Canon control still closes the type's row at the far end.
    expect(canon!.x).toBeGreaterThan(type!.x)
    expect(Math.abs(canon!.x + canon!.width - (headerBox!.x + headerBox!.width))).toBeLessThan(1)

    const views = ['entry-view-article', 'entry-view-relations', 'entry-view-history'].map((id) =>
      page.getByTestId(id),
    )
    const tools = ['edit-entity', 'entity-family-tree', 'trash-entity'].map((id) =>
      page.getByTestId(id),
    )
    expect(isIncreasing(await lefts(...views))).toBe(true)
    expect(isIncreasing(await lefts(...tools))).toBe(true)
    expect((await page.getByTestId('entry-views').boundingBox())!.y).toBeGreaterThan(
      nameText!.y + nameText!.height - 1,
    )
    await expectLorexStaysLeftToRight(page, [
      page.locator('.entry__kind'),
      page.locator('.entry__crumbs'),
      status,
      page.getByTestId('entry-views'),
      page.locator('.entry__tools'),
    ])

    // ---- Relations and History are the same header, and name what they list the same way ----

    await page.getByTestId('entry-view-relations').click()
    await page.waitForURL(`${url}/relations`)
    await expectIsolated(page.getByTestId('entry-name'), Text.numbers)
    const relation = page.getByTestId('relationship-list').locator('li.relation').first()
    await expectIsolated(relation.locator('.relation__label'), 'والد')
    await expectIsolated(relation.locator('.relation__name'), Text.hebrew)

    await page.getByTestId('entry-view-history').click()
    await page.waitForURL(`${url}/history`)
    await expectIsolated(page.getByTestId('entry-name'), Text.numbers)
    await expectIsolated(
      page.getByTestId('history-list').locator('.version__meta').first(),
      Text.numbers,
    )

    // ---- The card in the lore grid, and the universe's search bar ----

    await page.goto(`/app/universes/${universeId}/lore`)
    const card = page.locator(`[data-testid="entity-card"][data-entity-name="${Text.numbers}"]`)
    await expectIsolated(card.locator('.dossier__name'), Text.numbers)
    await expectIsolated(card.locator('.dossier__type'), 'شخصية')
    await expect(card.locator('.dossier__aliases bdi')).toHaveText(stored.aliases)
    // The card's own rows are not reversed: the type before the status, the portrait before the name.
    const [typeBox, statusBox] = await lefts(
      card.locator('.dossier__type'),
      card.locator('.dossier__canon'),
    )
    expect(statusBox).toBeGreaterThan(typeBox)
    const [portraitBox, cardNameBox] = await lefts(
      card.locator('.portrait'),
      card.locator('.dossier__name'),
    )
    expect(cardNameBox).toBeGreaterThan(portraitBox)
    await expectIsolated(
      page.locator('[data-testid="type-filter-option"][data-type-name="شخصية"] .typebar__name'),
      'شخصية',
    )

    const answered = page.waitForResponse(
      (response) =>
        response.url().includes('/search?') &&
        new URL(response.url()).searchParams.get('q') === 'אהרן',
    )
    await page.getByTestId('universe-search-input').fill('אהרן')
    await answered
    const title = page.getByTestId('universe-search-result').first().locator('.unisearch__title')
    await expect(title).toHaveText(Text.hebrew)
    expect(await computedDirection(title)).toBe('rtl')

    expect(await scrollsSideways(page)).toBe(false)
  })

  test("a story's title, chapters, scenes, arcs, beats and lore chips keep their own direction", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Long Winter '))
    const pov = await seedEntity(page, universeId, Text.arabic)
    const storyId = await seedStory(page, universeId, Text.numbers)
    const base = `/app/universes/${universeId}/stories/${storyId}`
    const chapter = await post(page, `/api/universes/${universeId}/stories/${storyId}/chapters`, {
      title: Text.brackets,
      summary: null,
      notes: null,
    })
    const scene = await post(page, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
      title: Text.rtlThenLatin,
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: [pov],
      chapterId: chapter.id,
    })
    const arc = await post(page, `/api/universes/${universeId}/stories/${storyId}/plot-arcs`, {
      title: 'سقوط الملك 2',
      description: null,
      notes: null,
    })
    await post(page, `/api/universes/${universeId}/stories/${storyId}/plot-arcs/${arc.id}/beats`, {
      title: 'آكرون!',
      description: null,
      notes: null,
      sceneIds: [scene.id],
      entityIds: [],
    })

    // ---- The list of stories ----

    await page.goto(`/app/universes/${universeId}/stories`)
    const row = page.locator(`[data-testid="story-row"][data-title="${Text.numbers}"]`)
    await expectIsolated(row.locator('.storyrow__title'), Text.numbers)
    await expect(row.getByRole('link', { name: Text.numbers })).toBeVisible()

    // ---- The story's header and its Scenes view ----

    await page.goto(base)
    await expectIsolated(page.getByTestId('story-title'), Text.numbers)
    expect(await drawnOrder(page.getByTestId('story-title'), ['آكرون', '12', 'Wright'])).toEqual([
      'Wright',
      '12',
      'آكرون',
    ])

    // A chapter heading is Lorex's words and the author's: "Chapter 1 — " stays first, the title isolated after it.
    const chapterHeading = page.getByTestId('chapter-heading')
    await expect(chapterHeading).toHaveAccessibleName(`Chapter 1 — ${Text.brackets}`)
    await expectIsolated(chapterHeading, Text.brackets)
    const [numberLeft, titleLeft] = await lefts(
      chapterHeading.locator('.chapter__number'),
      chapterHeading.locator('bdi'),
    )
    expect(titleLeft).toBeGreaterThan(numberLeft)

    // A scene's heading starts with a visually hidden "Scene 1: ", which is why the title is isolated rather than
    // the heading given an automatic direction: the hidden words would decide it. The heading still says both.
    const sceneCard = page.locator(`[data-testid="scene"][data-title="${Text.rtlThenLatin}"]`)
    await expect(
      sceneCard.getByRole('heading', { name: `Scene 1: ${Text.rtlThenLatin}` }),
    ).toBeVisible()
    await expectIsolated(sceneCard.locator('.scene__title'), Text.rtlThenLatin)
    expect(await drawnOrder(sceneCard.locator('.scene__title'), ['آكرون', 'Wright'])).toEqual([
      'Wright',
      'آكرون',
    ])
    await expectIsolated(sceneCard.getByTestId('lore-reference'), Text.arabic)
    // The plot chip names an arc and a beat, each in its own direction, in Lorex's order: arc, then beat.
    const plotChip = sceneCard.getByTestId('scene-plot-beat')
    await expectIsolated(plotChip, 'سقوط الملك 2')
    await expectIsolated(plotChip, 'آكرون!')
    const [arcLeft, beatLeft] = await lefts(
      plotChip.locator('bdi').first(),
      plotChip.locator('bdi').last(),
    )
    expect(beatLeft).toBeGreaterThan(arcLeft)

    await expectLorexStaysLeftToRight(page, [
      page.getByTestId('story-views'),
      page.locator('.story__actions'),
      sceneCard.locator('.scene__tools'),
    ])

    // ---- Plot, and Manuscript ----

    await page.getByTestId('story-view-plot').click()
    await page.waitForURL(`${base}/plot`)
    await expect(page.getByTestId('plot-arc-heading')).toHaveAccessibleName('Arc 1 — سقوط الملك 2')
    await expectIsolated(page.getByTestId('plot-arc-heading'), 'سقوط الملك 2')
    const beat = page.locator('[data-testid="plot-beat"][data-title="آكرون!"]')
    await expectIsolated(beat.locator('.beat__title'), 'آكرون!')
    // Written "آكرون!", the mark ends the word - on its left - rather than dangling off the right of it.
    expect(await drawnOrder(beat.locator('.beat__title'), ['آكرون', '!'])).toEqual(['!', 'آكرون'])
    await expectIsolated(beat.getByTestId('plot-beat-scene'), Text.rtlThenLatin)

    await page.goto(`${base}/manuscript/${scene.id}`)
    await expectIsolated(page.getByTestId('manuscript-scene-title'), Text.rtlThenLatin)
    await expectIsolated(page.getByTestId('manuscript-outline-scene'), Text.rtlThenLatin)

    expect(await scrollsSideways(page)).toBe(false)
  })

  test('universes, the Trash, the timeline, types, world rules, ideas and the family tree name things the same way', async ({
    page,
  }) => {
    await signUp(page)
    const universeName = unique('ممالك آكرون ')
    const universeId = await seedUniverse(page, universeName)
    const base = `/app/universes/${universeId}`
    const person = await seedType(page, universeId, 'شخصية')
    const akron = await seedEntity(page, universeId, Text.rtlThenLatin, { typeId: person })
    const aaron = await seedEntity(page, universeId, Text.hebrew)
    const bore = await seedKind(page, universeId, 'أنجب', 'مولود لـ')
    await seedLink(page, universeId, bore, akron, aaron)
    const gone = await seedEntity(page, universeId, Text.brackets)
    expect((await page.request.delete(`/api/universes/${universeId}/entities/${gone}`)).ok()).toBe(
      true,
    )
    await post(page, `/api/universes/${universeId}/timeline`, {
      title: `معركة ${Text.numbers}`,
      description: null,
      canonStatus: Canon.canon,
      dateKind: 0,
      startYear: 12,
      startMonth: null,
      startDay: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      eraLabel: null,
      entityIds: [akron],
    })
    const rule = await post(page, `/api/universes/${universeId}/world-rules`, {
      title: 'لا يعبر النقل الآني الحجاب 3',
      description: '',
      expectedUpdatedAt: null,
    })
    await post(page, `/api/universes/${universeId}/validation-terms`, {
      kind: 0,
      name: 'تتويج (Coronation)',
    })
    const idea = await post(page, '/api/ideas', {
      title: `${Text.brackets} — مدينة عائمة`,
      body: '',
      universeId,
      references: [{ kind: 0, id: akron }],
      expectedUpdatedAt: null,
    })

    // ---- The universe: its card, the sidebar and the overview ----

    await page.goto('/app')
    await expectIsolated(
      page.locator(
        `[data-testid="universe-card"][data-universe-name="${universeName}"] .plate__name`,
      ),
      universeName,
    )
    await page.goto(base)
    await expectIsolated(page.getByTestId('workspace-name'), universeName)
    await expectIsolated(page.getByTestId('overview-name'), universeName)
    await expectLorexStaysLeftToRight(page, [page.locator('.sidebar__nav'), page.locator('.rail')])

    // ---- The Trash: Lorex's word for the kind first, then the name, isolated ----

    await page.goto(`${base}/trash`)
    const trashed = page.getByTestId(`trash-row-${Text.brackets}`)
    await expectIsolated(trashed.locator('.trash__name'), Text.brackets)
    const [kindLeft, trashedLeft] = await lefts(
      trashed.getByTestId('trash-kind'),
      trashed.locator('.trash__name bdi'),
    )
    expect(trashedLeft).toBeGreaterThan(kindLeft)
    await expect(
      trashed.getByRole('button', { name: `Restore entry “${Text.brackets}”` }),
    ).toBeVisible()

    // ---- The timeline: a moment's title, and who takes part ----

    await page.goto(`${base}/timeline`)
    const moment = page.locator(`[data-title="معركة ${Text.numbers}"]`)
    await expectIsolated(moment.locator('.moment__title'), `معركة ${Text.numbers}`)
    const player = moment.locator('.moment__player')
    await expectIsolated(player, Text.rtlThenLatin)
    // The dot is before the name, as it is for every name: the row is not reversed.
    const [dotLeft, playerLeft] = await lefts(player.locator('.moment__dot'), player.locator('bdi'))
    expect(playerLeft).toBeGreaterThan(dotLeft)

    // ---- Types: an entry type, a relation kind and an event kind, each beside its row's start ----

    await page.goto(`${base}/types`)
    const typeRow = page.locator('[data-type-name="شخصية"]')
    await expectIsolated(typeRow.locator('.types__name'), 'شخصية')
    const [iconLeft, typeNameLeft] = await lefts(
      typeRow.locator('.types__icon'),
      typeRow.locator('.types__name bdi'),
    )
    // Next to its icon, not pushed across the row to the count: the gap is the row's own, a few pixels.
    expect(typeNameLeft - iconLeft).toBeLessThan(60)
    await expectIsolated(page.locator('[data-reltype-name="أنجب"] .types__name'), 'أنجب')
    await expectIsolated(
      page.locator('[data-term-name="تتويج (Coronation)"] .types__name'),
      'تتويج (Coronation)',
    )

    // ---- World rules: the list and the rule ----

    await page.goto(`${base}/world-rules`)
    await expectIsolated(page.getByTestId('world-rule-open'), 'لا يعبر النقل الآني الحجاب 3')
    await page.goto(`${base}/world-rules/${rule.id}`)
    await expectIsolated(page.getByTestId('world-rule-heading'), 'لا يعبر النقل الآني الحجاب 3')

    // ---- Ideas: the list, the idea and what it points at ----

    await page.goto(`${base}/ideas`)
    await expectIsolated(page.getByTestId('idea-open'), `${Text.brackets} — مدينة عائمة`)
    await page.goto(`${base}/ideas/${idea.id}`)
    await expectIsolated(page.getByTestId('idea-heading'), `${Text.brackets} — مدينة عائمة`)
    await expectIsolated(
      page.getByTestId('idea-reference').locator('.idearef__name'),
      Text.rtlThenLatin,
    )

    // ---- The family tree: the entry picked, and each relative's card ----

    await page.goto(`${base}/family-tree/${akron}`)
    await expectIsolated(page.locator('.picker__chosenname'), Text.rtlThenLatin)
    await expectIsolated(
      page.getByTestId(`family-node-${Text.hebrew}`).locator('.familynode__name'),
      Text.hebrew,
    )

    expect(await scrollsSideways(page)).toBe(false)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('long mixed titles wrap inside the column, nothing scrolls sideways, and the bars keep their order', async ({
      page,
    }) => {
      await signUp(page)
      const universeName = `${Text.arabic} ${unique('')}`
      const universeId = await seedUniverse(page, universeName)
      const akron = await seedEntity(page, universeId, Text.long)
      const storyId = await seedStory(page, universeId, Text.long)

      // ---- The entry ----

      await page.goto(`/app/universes/${universeId}/lore/${akron}`)
      const name = page.getByTestId('entry-name')
      await expectIsolated(name, Text.long)

      // Wrapped over several lines, every one of them inside the heading and the heading inside the screen.
      const lines = await name.locator('bdi').evaluate((node) => node.getClientRects().length)
      expect(lines).toBeGreaterThan(1)
      const heading = (await name.boundingBox())!
      const text = (await name.locator('bdi').boundingBox())!
      expect(text.x).toBeGreaterThanOrEqual(heading.x - 1)
      expect(text.x + text.width).toBeLessThanOrEqual(heading.x + heading.width + 1)
      expect(heading.x + heading.width).toBeLessThanOrEqual(390)
      expect(await scrollsSideways(page)).toBe(false)

      // The folded bar: the mark, the universe, Sections, the account - in that order, as ever.
      const [mark, where, toggle, account] = await lefts(
        page.locator('.rail__mark'),
        page.getByTestId('workspace-where'),
        page.getByTestId('workspace-nav-toggle'),
        page.getByTestId('account-menu-trigger'),
      )
      expect(isIncreasing([mark, where, toggle, account])).toBe(true)
      // Cut short if it must be, from its end: the universe's own direction decides which end that is.
      expect(await computedDirection(page.locator('.rail__universe'))).toBe('rtl')

      const views = ['entry-view-article', 'entry-view-relations', 'entry-view-history'].map((id) =>
        page.getByTestId(id),
      )
      expect(isIncreasing(await lefts(...views))).toBe(true)
      const [edit, family] = await lefts(
        page.getByTestId('edit-entity'),
        page.getByTestId('entity-family-tree'),
      )
      expect(family).toBeGreaterThan(edit)
      // The first tool starts where the header starts, as on any entry: nothing was pushed to the other side.
      expect(Math.abs(edit - heading.x)).toBeLessThan(1)
      await expectLorexStaysLeftToRight(page, [
        page.locator('.rail'),
        page.getByTestId('entry-views'),
        page.locator('.entry__tools'),
      ])

      // ---- The story ----

      await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
      const title = page.getByTestId('story-title')
      await expectIsolated(title, Text.long)
      expect(
        await title.locator('bdi').evaluate((node) => node.getClientRects().length),
      ).toBeGreaterThan(1)
      const [scenes, plot, manuscript] = await lefts(
        page.getByTestId('story-view-scenes'),
        page.getByTestId('story-view-plot'),
        page.getByTestId('story-view-manuscript'),
      )
      expect(isIncreasing([scenes, plot, manuscript])).toBe(true)
      const [editStory, deleteStory] = await lefts(
        page.getByTestId('edit-story'),
        page.getByTestId('delete-story'),
      )
      expect(deleteStory).toBeGreaterThan(editStory)
      expect(await scrollsSideways(page)).toBe(false)

      // ---- The lore grid ----

      await page.goto(`/app/universes/${universeId}/lore`)
      await expectIsolated(page.getByTestId('entity-card').locator('.dossier__name'), Text.long)
      expect(await scrollsSideways(page)).toBe(false)
    })
  })

  test('a title field takes the direction of what is typed, keeps a usable caret, and saves it as typed', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page, unique('Ink '))
    const akron = await seedEntity(page, universeId, 'Akron Wright')

    // ---- An entry's name ----

    await page.goto(`/app/universes/${universeId}/lore/${akron}`)
    await page.getByTestId('edit-entity').click()
    const field = page.getByLabel('Name', { exact: true })
    await expect(field).toHaveAttribute('dir', 'auto')
    expect(await computedDirection(field)).toBe('ltr')

    await field.fill('')
    await field.pressSequentially(Text.brackets)
    await expect(field).toHaveValue(Text.brackets)
    // The first letter typed is Arabic, so the field reads right to left from there on.
    expect(await computedDirection(field)).toBe('rtl')

    // The caret moves through the text logically, whichever way it is drawn.
    const caret = () => field.evaluate((input: HTMLInputElement) => input.selectionStart)
    expect(await caret()).toBe(Text.brackets.length)
    await field.press('Home')
    expect(await caret()).toBe(0)
    await field.press('End')
    expect(await caret()).toBe(Text.brackets.length)
    await field.press('Backspace')
    await expect(field).toHaveValue(Text.brackets.slice(0, -1))
    await field.press(')')
    await expect(field).toHaveValue(Text.brackets)

    // Labels and buttons around it stay where they were: the form is Lorex's, only the text is the author's.
    await expectLorexStaysLeftToRight(page, [
      page.locator('.entry__kind'),
      page.locator('.entry__actions'),
    ])

    await page.getByTestId('save-entity').click()
    await expectIsolated(page.getByTestId('entry-name'), Text.brackets)
    const stored = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${akron}`)
    ).json()) as { name: string }
    expect(stored.name).toBe(Text.brackets)

    // Validation is what it was: an empty name is refused with the same words.
    await page.getByTestId('edit-entity').click()
    await field.fill('')
    await page.getByTestId('save-entity').click()
    await expect(page.locator('.entry__head .field__error')).toHaveText('Give it a name.')

    // ---- A story's title, through the drawer every story form shares ----

    await page.goto(`/app/universes/${universeId}/stories`)
    await page.getByTestId('new-story').click()
    const storyTitle = page.getByTestId('story-title-input')
    await expect(storyTitle).toHaveAttribute('dir', 'auto')
    await page.getByTestId('save-story').click()
    await expect(page.getByTestId('story-form')).toContainText('Give the story a title.')
    await storyTitle.pressSequentially(Text.numbers)
    expect(await computedDirection(storyTitle)).toBe('rtl')
    await page.getByTestId('save-story').click()
    await page.waitForURL(/\/stories\/[0-9a-f-]+$/)
    await expectIsolated(page.getByTestId('story-title'), Text.numbers)
  })
})
