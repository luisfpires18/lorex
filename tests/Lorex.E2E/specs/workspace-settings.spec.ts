import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * UI refinement 014: the workspace's information architecture. Lorex's brand leads to the portal from everywhere;
 * publishing is a page of its own, Publish, just above Settings; Settings is five tabs in a centred column, with a
 * universe's colour the author's own and no palette; and Lorex opens on the portal - signed in or out, whatever was used
 * last - while a deep link still goes where it says.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('ia')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

async function universe(page: Page, accentColor: string | null = null) {
  const name = unique('Saltmere ')
  const id = (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: 'Private notes.',
    accentColor,
  }))!.id
  return { id, name }
}

/** Everything publishing needs, saved - so the page's own Publish can be pressed. */
async function readyToPublish(page: Page, id: string) {
  await api(page, 'PUT', `/api/universes/${id}/publication`, {
    publicSummary: 'A drowned coast where the tide keeps count.',
    category: 4,
    genres: [1],
  })
  const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: {
      file: { name: 'a.png', mimeType: 'image/png', buffer: png(800, 500, () => [40, 70, 120]) },
    },
  })
  expect(artwork.ok()).toBe(true)
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: unique('Ione ') })
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function fresh(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

test.describe('Lorex leads to the portal', () => {
  test('the brand goes to Explore from the workspace, its headers, the portal and sign-in, keeping the theme', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)

    await page.evaluate(() => localStorage.setItem('lorex-theme', 'dark'))
    await page.goto(`/app/universes/${w.id}/lore`)
    await page.locator('.rail__mark').click()
    await page.waitForURL('/explore')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    for (const from of ['/app', '/app/ideas', '/app/profile']) {
      await page.goto(from)
      await page.getByTestId('home-brand').click()
      await page.waitForURL('/explore')
    }

    await page.locator('.portal__brand').click()
    await page.waitForURL('/explore')

    // My workspace is still the deliberate way in.
    await page.getByTestId('portal-workspace').click()
    await page.waitForURL('/app')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    await page.getByTestId('account-menu-trigger').click()
    await page.getByTestId('account-menu-signout').click()
    await page.waitForURL('/login')
    await page.getByTestId('auth-brand').click()
    await page.waitForURL('/explore')
  })
})

test.describe('Publish', () => {
  test('sits just above Settings, holds everything publishing, and Settings no longer does', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await universe(page)
    await page.goto(`/app/universes/${w.id}`)

    const sections = page.getByRole('navigation', { name: 'Universe sections' })
    await expect(sections.getByRole('link')).toHaveCount(12)
    const links = (await sections.getByRole('link').allTextContents()).map((text) => text.trim())
    expect(links.indexOf('Publish')).toBe(links.indexOf('Settings') - 1)

    await page.getByTestId('workspace-settings').click()
    await expect(page.getByTestId('settings-tabs')).toBeVisible()
    await expect(page.getByTestId('public-portal')).toHaveCount(0)
    await expect(page.getByText('Public summary')).toHaveCount(0)

    await page.getByTestId('workspace-publish').click()
    await page.waitForURL(`/app/universes/${w.id}/publish`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Publish')
    await expect(page.getByTestId('publication-status')).toContainText('Private')
    await expect(page.getByTestId('publication-checklist')).toBeVisible()
    await expect(page.getByTestId('view-public-page')).toHaveCount(0)

    // Publishing still needs everything: refused and listed first, then done through the confirmation.
    await page.getByTestId('publish').click()
    await expect(page.getByTestId('publication-problem')).toContainText('public summary')
    await readyToPublish(page, w.id)
    await page.reload()
    await page.getByTestId('publish').click()
    await page.getByTestId('confirm-publish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Public')
    await expect(page.getByTestId('published-lore')).toHaveText('0 public')

    // View public world opens the real public page.
    await page.getByTestId('view-public-page').click()
    await page.waitForURL(/\/worlds\/saltmere-/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(w.name)
    const worldUrl = page.url()

    // Make private is explicit and confirmed, and it takes the page down.
    await page.goBack()
    await page.getByTestId('unpublish').click()
    await page.getByTestId('confirm-unpublish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Private')
    const reader = await fresh(browser)
    await reader.page.goto(worldUrl)
    await expect(reader.page.getByTestId('world-missing')).toBeVisible()
    await reader.context.close()
  })
})

test.describe('Settings', () => {
  test('five keyboard tabs in a centred column, each with its own things, and destructive ones in Advanced', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)
    await page.setViewportSize({ width: 1536, height: 900 })
    await page.goto(`/app/universes/${w.id}/settings`)

    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveText(['General', 'Appearance', 'Chronology', 'Data', 'Advanced'])
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('tabpanel')).toHaveCount(1)

    // Centred: the column has room on both sides at a wide width.
    const column = (await page.locator('.settings--tabbed').boundingBox())!
    const canvas = (await page.locator('.settings--tabbed').evaluate((node) => {
      const box = node.parentElement!.getBoundingClientRect()
      return { x: box.x, width: box.width }
    }))!
    expect(column.x - canvas.x).toBeGreaterThan(40)
    expect(canvas.x + canvas.width - (column.x + column.width)).toBeGreaterThan(40)

    // Arrows move and choose; the address says which, and replacing it means Back leaves Settings.
    await page.getByRole('tab', { name: 'General' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Appearance' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page).toHaveURL(/\/settings\?tab=appearance$/)
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Advanced' })).toBeFocused()

    const advanced = page.getByRole('tabpanel', { name: 'Advanced' })
    await expect(advanced.getByTestId('toggle-archive')).toBeVisible()
    await expect(advanced.getByTestId('delete-needs-archive')).toBeVisible()

    await page.getByRole('tab', { name: 'Data' }).click()
    const data = page.getByRole('tabpanel', { name: 'Data' })
    await expect(data.getByTestId('export-universe')).toBeVisible()
    await expect(data.getByTestId('settings-restore-link')).toBeVisible()
    await expect(page.getByTestId('delete-universe')).toBeHidden()

    // Archived, delete is in Advanced's danger panel and nowhere else.
    await page.getByRole('tab', { name: 'Advanced' }).click()
    await advanced.getByTestId('toggle-archive').click()
    await expect(advanced.getByTestId('danger-section')).toBeVisible()
    for (const other of ['General', 'Appearance', 'Chronology', 'Data']) {
      await expect(
        page
          .getByRole('tabpanel', { name: other, includeHidden: true })
          .getByTestId('delete-universe'),
      ).toHaveCount(0)
    }

    await page.goto(`/app/universes/${w.id}/lore`)
    await page.goto(`/app/universes/${w.id}/settings?tab=data`)
    await page.goBack()
    await expect(page).toHaveURL(`/app/universes/${w.id}/lore`)
  })

  test('the colour is the author’s own, with no palette, and a stored colour stays as it was', async ({
    page,
  }) => {
    await signUp(page)
    // One of the old palette's colours, stored before 014.
    const w = await universe(page, '#1f8f74')
    await page.goto(`/app/universes/${w.id}/settings?tab=appearance`)
    const appearance = page.getByRole('tabpanel', { name: 'Appearance' })

    await expect(appearance.getByRole('radio')).toHaveCount(0)
    await expect(appearance.getByText('Lapis')).toHaveCount(0)
    const hex = appearance.getByTestId('universe-colour-hex')
    await expect(hex).toHaveValue('#1f8f74')
    await expect(appearance.getByTestId('universe-colour-picker')).toHaveValue('#1f8f74')

    // Saving General leaves the colour alone.
    await page.getByRole('tab', { name: 'General' }).click()
    await page.getByLabel('Description').fill('Renamed notes.')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByTestId('settings-saved')).toBeVisible()
    let stored = await api<{ accentColor: string | null; description: string }>(
      page,
      'GET',
      `/api/universes/${w.id}`,
    )
    expect(stored.accentColor).toBe('#1f8f74')
    expect(stored.description).toBe('Renamed notes.')

    // A colour that is not one is said so, and not saved.
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await hex.fill('#12zz45')
    await expect(appearance.getByRole('alert')).toContainText('Use a colour like')
    await appearance.getByRole('button', { name: 'Save colour' }).click()
    stored = await api(page, 'GET', `/api/universes/${w.id}`)
    expect(stored.accentColor).toBe('#1f8f74')

    // Any colour, typed without its #, is kept as the author chose it; and the description is left alone.
    await hex.fill('8B3242')
    await appearance.getByRole('button', { name: 'Save colour' }).click()
    await expect(page.getByTestId('settings-colour-saved')).toBeVisible()
    stored = await api(page, 'GET', `/api/universes/${w.id}`)
    expect(stored.accentColor).toBe('#8b3242')
    expect(stored.description).toBe('Renamed notes.')

    // And none.
    await appearance.getByTestId('universe-colour-clear').click()
    await appearance.getByRole('button', { name: 'Save colour' }).click()
    await expect
      .poll(
        async () =>
          (await api<{ accentColor: string | null }>(page, 'GET', `/api/universes/${w.id}`))!
            .accentColor,
      )
      .toBeNull()
  })

  test('unsaved work survives changing tabs, and two unsaved tabs are one question when leaving', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)
    const asked: string[] = []
    let leave = false
    page.on('dialog', (dialog) => {
      asked.push(dialog.message())
      void (leave ? dialog.accept() : dialog.dismiss())
    })

    await page.goto(`/app/universes/${w.id}/settings`)
    await page.getByLabel('Description').fill('Half a thought.')
    await page.getByRole('tab', { name: 'Appearance' }).click()
    expect(asked).toEqual([])
    await page.getByTestId('universe-colour-hex').fill('#336699')
    await page.getByRole('tab', { name: 'General' }).click()
    await expect(page.getByLabel('Description')).toHaveValue('Half a thought.')

    // Leaving for the portal asks once, for both, and staying keeps both.
    await page.locator('.rail__mark').click()
    expect(asked).toHaveLength(1)
    await expect(page).toHaveURL(/\/settings$/)
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await expect(page.getByTestId('universe-colour-hex')).toHaveValue('#336699')

    leave = true
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    expect(asked).toHaveLength(2)
  })

  test('Settings and Publish reflow on a phone and at 200% zoom, light and dark', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const setup = await browser.newContext()
    const owner = await setup.newPage()
    await signUp(owner)
    const w = await universe(owner)
    await api(owner, 'PUT', `/api/universes/${w.id}`, {
      name: `${w.name} with an extraordinarily long name that keeps on going`,
      description: null,
      accentColor: null,
    })
    const state = await setup.storageState()
    await setup.close()

    for (const theme of ['light', 'dark']) {
      for (const size of [
        { width: 360, height: 780, deviceScaleFactor: 1 },
        { width: 390, height: 844, deviceScaleFactor: 1 },
        { width: 640, height: 400, deviceScaleFactor: 2 },
      ]) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: size.deviceScaleFactor,
          storageState: state,
        })
        await context.addInitScript((t) => localStorage.setItem('lorex-theme', t), theme)
        const page = await context.newPage()
        await page.goto(`/app/universes/${w.id}/publish`)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Publish')
        expect(await noSideways(page), `${theme} ${size.width} publish`).toBeLessThanOrEqual(0)

        for (const tab of ['general', 'appearance', 'chronology', 'data', 'advanced']) {
          await page.goto(`/app/universes/${w.id}/settings?tab=${tab}`)
          const chosen = page.getByTestId(`settings-tab-${tab}`)
          await expect(chosen).toHaveAttribute('aria-selected', 'true')
          await chosen.scrollIntoViewIfNeeded()
          await expect(chosen).toBeInViewport()
          await expect(page.getByTestId(`settings-panel-${tab}`)).toBeVisible()
          expect(await noSideways(page), `${theme} ${size.width} ${tab}`).toBeLessThanOrEqual(0)
        }
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
        await context.close()
      }
    }
  })
})

test.describe('Lorex opens on the portal', () => {
  test('signed out, the front door and any unknown address are Explore, never Login; a workspace link still asks', async ({
    browser,
  }) => {
    const { context, page } = await fresh(browser)
    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest.start_url).toBe('/explore')
    expect(manifest.id).toBe('/app')

    await page.goto(manifest.start_url)
    await expect(page).toHaveURL('/explore')
    await page.goto('/')
    await expect(page).toHaveURL('/explore')
    await page.goto('/somewhere-nobody-links')
    await expect(page).toHaveURL('/explore')

    // An explicit workspace address is a deep link, and follows the sign-in rules.
    await page.goto('/app/universes')
    await page.waitForURL('/login')
    await context.close()
  })

  test('signed in, having used the workspace, the front door is still Explore, and deep links go where they say', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)
    await readyToPublish(page, w.id)
    const slug = (await api<{ publicSlug: string }>(
      page,
      'POST',
      `/api/universes/${w.id}/publish`,
    ))!.publicSlug
    await page.goto(`/app/universes/${w.id}/timeline`)

    // A cold launch is the manifest's start_url in a new window: the portal, with the way in offered, not taken.
    const launch = await page.context().newPage()
    await launch.goto('/explore')
    await expect(launch).toHaveURL('/explore')
    await expect(launch.getByTestId('portal-workspace')).toBeVisible()
    await launch.goto('/')
    await expect(launch).toHaveURL('/explore')
    await launch.goto('/not-a-page')
    await expect(launch).toHaveURL('/explore')

    await launch.goto(`/worlds/${slug}`)
    await expect(launch.getByRole('heading', { level: 1 })).toHaveText(w.name)
    await launch.goto(`/app/universes/${w.id}/timeline`)
    await expect(launch.getByRole('heading', { level: 1 })).toHaveText('Timeline')
    await launch.goto('/app/not-a-page')
    await expect(launch).toHaveURL('/app')
  })
})
