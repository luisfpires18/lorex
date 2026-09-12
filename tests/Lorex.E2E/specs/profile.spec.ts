import { expect, test, type Page } from '@playwright/test'

/**
 * One journey through the account screen, and the one measurement a phone needs.
 *
 * What the API knows about an account is settled by `AuthEndpointTests`. What only a browser
 * can show is that the screen is reachable from where an author actually is - inside a
 * universe - that it is a user-level route rather than a section of that universe, and that
 * what it prints is the real account and not a placeholder someone typed in.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

interface Account {
  username: string
  email: string
}

async function signUp(page: Page): Promise<Account> {
  const username = unique('keeper')
  const email = `${username}@example.test`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { username, email }
}

async function newUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Tidewatch '))
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
}

test.describe('profile', () => {
  test('is reached from a universe and shows the account Lorex actually has', async ({ page }) => {
    const account = await signUp(page)
    await newUniverse(page)

    await page.getByTestId('workspace-profile').click()

    // A user-level route: the universe is left behind rather than nested inside.
    await expect(page).toHaveURL('/app/profile')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

    await expect(page.getByTestId('profile-name')).toHaveText(account.username)
    await expect(page.getByTestId('profile-email')).toHaveText(account.email)
    await expect(page.getByTestId('profile-universes')).toHaveText('1')

    // No stored picture exists, so the circle carries the account's initial.
    await expect(page.getByTestId('profile-avatar')).toHaveText(account.username[0]!.toUpperCase())

    // The way back out is a link, not the browser's button.
    await page.getByRole('link', { name: 'All universes' }).click()
    await expect(page).toHaveURL('/app')

    // And the bar's own name gets there too.
    await page.getByTestId('signed-in-user').click()
    await expect(page).toHaveURL('/app/profile')
  })

  test('is closed to a signed-out visitor', async ({ page }) => {
    await page.goto('/app/profile')
    await expect(page).toHaveURL('/login')
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test('reads in a 390px column without scrolling sideways', async ({ page }) => {
      await signUp(page)
      await page.goto('/app/profile')

      const avatar = page.getByTestId('profile-avatar')
      await expect(avatar).toBeVisible()

      // Still a circle, and still in the middle of the column it is in.
      const box = (await avatar.boundingBox())!
      expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1)
      const viewport = page.viewportSize()!
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `the profile scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
    })
  })
})
