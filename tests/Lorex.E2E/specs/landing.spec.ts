import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * Product refinement 031: Lorex's home. `/` is a page of the portal - no longer a redirect to Explore - that says what
 * Lorex is and offers one way on: into the workspace (signed in) or into an account (signed out), with Explore beside
 * it. The brand leads here from every shell; Explore stays a named destination of its own, on every width.
 *
 * The home page's preview of published worlds reads the same public listing Explore reads, and the suite's database is
 * shared by every spec running at once, so the preview is checked against the response the page itself received rather
 * than against a world this test hopes is still the newest. The empty and failed states are the API's answers, stood in
 * for by the browser, because no test can make a shared database have no public worlds.
 */
const PASSWORD = 'Test-password-123!'
const HOME_TITLE = 'Lorex — Build connected fictional universes'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(request: APIRequestContext) {
  const username = unique('lander')
  const response = await request.post('/api/auth/register', {
    data: { username, email: `${username}@example.test`, password: PASSWORD },
  })
  expect(response.ok()).toBe(true)
  return username
}

async function stranger(browser: Browser, width = 1280, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } })
  return { context, page: await context.newPage() }
}

/** A published world of this test's own, so a public page exists to walk from. Returns its slug. */
async function publishedWorld(page: Page) {
  await page.request.put('/api/profile/public-name', { data: { publicDisplayName: 'Odile Brae' } })
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Landing Shore '), description: null },
  })
  expect(created.ok()).toBe(true)
  const { id } = (await created.json()) as { id: string }
  expect(
    (
      await page.request.put(`/api/universes/${id}/publication`, {
        data: { publicSummary: 'A world shared for the home page.', category: 1, genres: [1] },
      })
    ).ok(),
  ).toBe(true)
  const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: {
      file: {
        name: 'art.png',
        mimeType: 'image/png',
        buffer: png(800, 500, (x) => (x < 400 ? [60, 90, 160] : [200, 150, 90])),
      },
    },
  })
  expect(artwork.ok()).toBe(true)
  const published = await page.request.post(`/api/universes/${id}/publish`)
  expect(published.ok()).toBe(true)
  return ((await published.json()) as { publicSlug: string }).publicSlug
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('Lorex’s home is /', () => {
  test('signed out: a page, not a redirect, with one h1, its landmarks, its title and no world search', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser)
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('landing')).toBeVisible()
    await expect(page).toHaveTitle(HOME_TITLE)

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Build the world. Tell the story. Whatever form it takes.',
    )
    await expect(page.getByText('A workspace for fictional universes').first()).toBeVisible()
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Hold a whole universe, not one long document.',
      'A world, not a folder of notes.',
      'Write the story inside the world.',
      'Read the worlds others have shared.',
      'Your world stays yours.',
      'Every universe starts with a name.',
    ])

    // The bar: brand, Explore, the way in - and no search box asking a newcomer a question first.
    await expect(page.getByTestId('explore-search')).toHaveCount(0)
    await expect(page.getByRole('search')).toHaveCount(0)
    await expect(page.getByTestId('portal-explore')).toHaveText('Explore')
    await expect(page.getByTestId('portal-explore')).not.toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('portal-login')).toBeVisible()
    await expect(page.getByTestId('portal-join')).toHaveText('Create account')
    await expect(page.getByTestId('portal-appearance')).toBeVisible()
    await expect(page.getByTestId('portal-workspace')).toHaveCount(0)

    // The painting is decoration; the product picture says what it shows.
    await expect(page.locator('.landing-hero__image')).toHaveAttribute('alt', '')
    await expect(page.getByTestId('landing-shot').getByRole('img')).toHaveAttribute(
      'alt',
      /Lore of a universe called Hollowmere/,
    )

    // Nothing the page does not offer: no prices, trials or artificial intelligence.
    const text = (await page.getByTestId('landing').innerText()).toLowerCase()
    for (const word of [
      'free trial',
      'pricing',
      'per month',
      'credit card',
      ' ai ',
      'ai-powered',
      '—',
    ]) {
      expect(text, word).not.toContain(word)
    }
    await context.close()
  })

  test('signed out: Start building opens registration, which then lands in the workspace; Explore worlds opens Explore', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser)
    await page.goto('/')
    const primary = page.getByTestId('landing-primary')
    await expect(primary).toHaveText('Start building')
    await expect(page.getByTestId('landing-final-actions').getByRole('link')).toHaveText([
      'Start building your universe',
      'Log in',
    ])

    await page.getByTestId('landing-explore').click()
    await page.waitForURL('/explore')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')
    await expect(page.getByTestId('explore-search')).toBeVisible()

    await page.goto('/')
    await primary.click()
    await page.waitForURL('/register')
    const username = unique('builder')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(`${username}@example.test`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    // "Start building" means start: the workspace, not back to the page that offered it.
    await page.waitForURL('/app')
    await context.close()
  })

  test('signed in: the workspace is the way on, in the bar, the hero and the last word; no Log in or Create account', async ({
    page,
  }) => {
    await account(page.request)
    await page.goto('/')
    await expect(page.getByTestId('portal-workspace')).toHaveText('My workspace')
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible()
    await expect(page.getByTestId('portal-login')).toHaveCount(0)
    await expect(page.getByTestId('portal-join')).toHaveCount(0)
    await expect(page.getByTestId('portal-appearance')).toHaveCount(0)

    await expect(page.getByTestId('landing-primary')).toHaveText('Go to my workspace')
    await expect(page.getByTestId('landing-explore')).toHaveText('Explore worlds')
    await expect(page.getByTestId('landing-final-actions').getByRole('link')).toHaveText([
      'Open my workspace',
    ])
    await expect(page.getByTestId('portal-footer').getByRole('link')).toHaveText([
      'Explore',
      'My workspace',
    ])
    await expect(page.getByText('Start building')).toHaveCount(0)

    await page.getByTestId('landing-primary').click()
    await page.waitForURL('/app')

    // The account menu works here too, and signing out from the home page stays on it.
    await page.goto('/')
    await page.getByTestId('account-menu-trigger').click()
    await expect(page.getByTestId('account-menu-panel')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByTestId('portal-login')).toBeVisible()
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('landing-primary')).toHaveText('Start building')
  })

  test('Log in from the home page lands in the workspace rather than back on the page that offered it', async ({
    page,
    request,
  }) => {
    const username = await account(request)
    await page.goto('/')
    await page.getByTestId('portal-login').click()
    await page.waitForURL('/login')
    await page.getByLabel('Username or email').fill(username)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/app')
  })
})

test.describe('The brand leads home, and Explore stays its own place', () => {
  test('from Explore and a public world the brand goes home; Explore is a named link back, current on Explore', async ({
    page,
    browser,
  }) => {
    await account(page.request)
    const slug = await publishedWorld(page)

    const { context, page: visitor } = await stranger(browser)
    await visitor.goto(`/worlds/${slug}`)
    await expect(visitor.getByTestId('public-world')).toBeVisible()
    const brand = visitor.getByRole('link', { name: 'Lorex – Home' })
    await expect(brand).toHaveAttribute('href', '/')
    await brand.click()
    await visitor.waitForURL('/')
    await expect(visitor.getByTestId('landing')).toBeVisible()

    await visitor.getByTestId('portal-explore').click()
    await visitor.waitForURL('/explore')
    await expect(visitor.getByTestId('portal-explore')).toHaveAttribute('aria-current', 'page')
    await visitor.getByRole('link', { name: 'Lorex – Home' }).click()
    await visitor.waitForURL('/')

    // An address nobody holds, outside the workspace, is the home page.
    await visitor.goto('/no-such-page/at-all')
    await visitor.waitForURL('/')
    await expect(visitor.getByTestId('landing')).toBeVisible()
    await context.close()
  })
})

test.describe('The home page’s worlds are Explore’s', () => {
  test('the preview shows exactly the first published worlds the API returns, four at most, and links to Explore', async ({
    page,
    browser,
  }) => {
    // At least one public world exists, whoever else is publishing.
    await account(page.request)
    await publishedWorld(page)

    const { context, page: visitor } = await stranger(browser, 1440)
    const answered = visitor.waitForResponse(
      (response) =>
        response.url().includes('/api/public/universes?') && response.request().method() === 'GET',
    )
    await visitor.goto('/')
    const response = await answered
    const url = new URL(response.url())
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('pageSize')).toBe('4')
    const listed = ((await response.json()) as { items: { name: string }[] }).items.map(
      (world) => world.name,
    )
    expect(listed.length).toBeGreaterThan(0)
    expect(listed.length).toBeLessThanOrEqual(4)

    const cards = visitor.getByTestId('landing-worlds').locator('.worldcard__name')
    await expect(cards).toHaveText(listed)
    await expect(visitor.getByTestId('landing-worlds-loading')).toHaveCount(0)

    await visitor.getByTestId('landing-explore-all').click()
    await visitor.waitForURL('/explore')
    await context.close()
  })

  test('no published worlds: the section says so and offers Explore, with no card, placeholder or skeleton', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser)
    await page.route('**/api/public/universes?**', (route) =>
      route.fulfill({
        json: { items: [], page: 1, pageSize: 4, totalCount: 0, totalPages: 0 },
      }),
    )
    await page.goto('/')
    await expect(page.getByTestId('landing-worlds-empty')).toHaveText(
      'No worlds have been published yet. When an author makes a universe public, it appears in Explore.',
    )
    await expect(page.locator('.landing .worldcard')).toHaveCount(0)
    await expect(page.getByTestId('landing-explore-all')).toHaveText('Open Explore')
    await context.close()
  })

  test('the listing cannot be read: the page still stands and points to Explore', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser)
    await page.route('**/api/public/universes?**', (route) => route.abort())
    await page.goto('/')
    await expect(page.getByTestId('landing-worlds-error')).toBeVisible()
    await expect(page.locator('.landing .worldcard')).toHaveCount(0)
    await expect(page.getByTestId('landing-explore-all')).toHaveText('Explore all worlds')
    await expect(page.getByTestId('landing-primary')).toHaveText('Start building')
    await context.close()
  })
})

test.describe('Every width, both themes', () => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [820, 1180],
    [640, 900],
    [390, 844],
    [360, 780],
  ] as const) {
    test(`${width}px: three-line title, the way in, Explore in the bar, nothing sideways`, async ({
      browser,
    }) => {
      const { context, page } = await stranger(browser, width, height)
      await page.goto('/')
      await expect(page.getByTestId('landing-primary')).toBeVisible()
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      // Each sentence of the title is one line of its own, at every width.
      const lines = await page
        .getByRole('heading', { level: 1 })
        .evaluate((heading) =>
          [...heading.querySelectorAll('span')].map((span) => span.getClientRects().length),
        )
      expect(lines).toEqual([1, 1, 1])

      // The bar keeps brand, Explore, Appearance and both ways in reachable, and nothing in it overlaps.
      for (const id of ['portal-explore', 'portal-appearance', 'portal-login', 'portal-join']) {
        await expect(page.getByTestId(id)).toBeVisible()
      }
      const brand = (await page.locator('.portal__brand').boundingBox())!
      const session = (await page.getByTestId('portal-session').boundingBox())!
      expect(brand.x + brand.width).toBeLessThan(session.x)
      expect(session.x + session.width).toBeLessThanOrEqual(width)

      // The two hero actions keep one line each.
      for (const id of ['landing-primary', 'landing-explore']) {
        const box = (await page.getByTestId(id).boundingBox())!
        expect(box.height, id).toBeLessThan(56)
      }
      await page.getByTestId('portal-footer').scrollIntoViewIfNeeded()
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await context.close()
    })
  }

  test('the product picture follows the theme, chosen from the Appearance menu, and the hero stays legible in both', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser, 1440)
    await page.addInitScript(() => localStorage.setItem('lorex-theme', 'dark'))
    await page.goto('/')
    const shot = page.getByTestId('landing-shot').getByRole('img')
    await expect
      .poll(() => shot.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toContain('landing-product-dark')

    await page.getByTestId('portal-appearance').click()
    await page.getByTestId('theme-light').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect
      .poll(() => shot.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toContain('landing-product-light')
    await expect
      .poll(() => shot.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)

    // Light: graphite type on the parchment veil.
    const ink = await page
      .getByRole('heading', { level: 1 })
      .evaluate((heading) => getComputedStyle(heading).color)
    expect(ink).toBe('rgb(31, 28, 24)')
    await context.close()
  })

  test('reduced motion: nothing moves', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByTestId('landing-shot')).toHaveCSS('animation-name', 'none')
    await context.close()
  })

  test('the keyboard reaches the bar and the hero actions in order, with a visible ring', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser, 1280)
    await page.goto('/')
    await expect(page.getByTestId('landing-primary')).toBeVisible()
    const order: string[] = []
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab')
      order.push(
        await page.evaluate(
          () =>
            (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') ??
            document.activeElement?.textContent?.trim() ??
            '',
        ),
      )
    }
    expect(order.indexOf('portal-explore')).toBeGreaterThan(-1)
    expect(order.indexOf('landing-primary')).toBeGreaterThan(order.indexOf('portal-join'))
    expect(order.indexOf('landing-explore')).toBe(order.indexOf('landing-primary') + 1)

    await page.getByTestId('landing-primary').focus()
    const outline = await page
      .getByTestId('landing-primary')
      .evaluate((link) => getComputedStyle(link).outlineStyle)
    expect(outline).toBe('solid')
    await context.close()
  })
})
