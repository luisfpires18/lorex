import { expect, test, type Locator, type Page } from '@playwright/test'
import { png, type Rgb } from './support/png'
import { colours, expectShows, expectSquareCovered } from './support/pixels'

/**
 * One journey through the account screen, and the one measurement a phone needs.
 *
 * What the API knows about an account is settled by `AuthEndpointTests` and, for the photo,
 * `ProfileImageTests` - which can reach states this screen cannot. What only a browser can show is
 * that the screen is reachable from where an author actually is, inside a universe; that it is a
 * user-level route rather than a section of that universe; that what it prints is the real account
 * and not a placeholder someone typed in; and that a photo can actually be put on it, framed,
 * reframed, replaced and taken away, with the circle showing the part that was chosen.
 *
 * The pictures are made of coloured bands, so "the avatar shows the part I chose" is read out of
 * the pixels rather than trusted from an address.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

const RED: Rgb = [220, 30, 30]
const GREEN: Rgb = [30, 160, 60]
const BLUE: Rgb = [30, 30, 220]

/** Three vertical bands, red to blue. The centred square is the green one, and never the answer. */
function thirds(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(600, 200, (x) => (x < 200 ? RED : x < 400 ? GREEN : BLUE)),
  }
}

/** A flat picture of one colour, for the steps where what it shows does not matter. */
function plain(name: string, rgb: Rgb) {
  return { name, mimeType: 'image/png', buffer: png(400, 400, () => rgb) }
}

/**
 * Drags the picture under the square as far as it will go. The cropper keeps the square inside the
 * picture, so an overlong drag lands exactly on the edge - which is what makes it repeatable.
 */
async function dragPicture(page: Page, direction: 'left' | 'right') {
  const stage = page.getByTestId('image-crop-stage')
  const box = (await stage.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + (direction === 'right' ? box.width : -box.width), y, { steps: 12 })
  await page.mouse.up()
}

/**
 * The circle, once it is actually showing `expected`.
 *
 * Polled rather than read once, because every step that changes the avatar changes it twice: the
 * page renders the new address, and the browser then fetches and decodes what is at it. Sampling
 * in between would read the picture that is on its way out.
 */
async function expectAvatarShows(page: Page, expected: Rgb) {
  const avatar = page.getByTestId('profile-avatar')
  await expect(avatar).toHaveJSProperty('tagName', 'IMG')

  await expect
    .poll(async () => {
      try {
        const [pixel] = await colours(avatar, [[0.5, 0.5]])
        return pixel.slice(0, 3).every((channel, index) => Math.abs(channel - expected[index]) < 50)
      } catch {
        // The element was swapped under the read, which is the case this poll exists for.
        return false
      }
    })
    .toBe(true)

  // Settled, so the whole square can be checked rather than one pixel of it.
  await expectShows(avatar, expected)
}

/** The open cropper, once its picture has loaded and its square can be saved. */
async function openCropper(page: Page): Promise<Locator> {
  const dialog = page.getByTestId('image-crop-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
  return dialog
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

  test('a photo is added, framed, reframed, replaced and taken away', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/profile')

    const avatar = page.getByTestId('profile-avatar')

    // With no photo, the circle carries the account's initial and offers only one action.
    await expect(avatar).toHaveText(/^[A-Z]$/)
    await expect(page.getByTestId('profile-photo-pick')).toHaveText('Upload photo')
    await expect(page.getByTestId('profile-photo-reframe')).toHaveCount(0)
    await expect(page.getByTestId('profile-photo-remove')).toHaveCount(0)

    // ---------- Choosing a file opens the cropper, and nothing is uploaded before it is kept ----------

    await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
    let dialog = await openCropper(page)
    await expectSquareCovered(dialog)

    // The left band, chosen deliberately: it is neither the centred square nor what a later
    // reframe will pick, so every assertion below can only pass for the square that was framed.
    await dragPicture(page, 'right')
    await expectSquareCovered(dialog)
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    // ---------- The circle shows it, as a circle ----------

    await expect(avatar).toHaveJSProperty('tagName', 'IMG')
    await expectAvatarShows(page, RED)

    const round = await avatar.evaluate((element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return {
        radius: style.borderRadius,
        fit: style.objectFit,
        width: box.width,
        height: box.height,
      }
    })
    expect(round.radius).toBe('50%')
    expect(round.fit).toBe('cover')
    expect(Math.abs(round.width - round.height)).toBeLessThanOrEqual(1)

    // It survives a reload, so it is stored rather than held in this page's state.
    await page.reload()
    await expectAvatarShows(page, RED)

    // ---------- Edit photo reopens on the stored picture, and sends no file ----------

    const uploads: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/api/profile/image')) {
        uploads.push(request.url())
      }
    })

    await page.getByTestId('profile-photo-reframe').click()
    dialog = await openCropper(page)

    // The whole picture is there to reframe, not the square that was cut from it: the cropper is
    // showing the stored original, which was never touched.
    await expectSquareCovered(dialog)
    await dragPicture(page, 'left')
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await expectAvatarShows(page, BLUE)

    // Only the thumbnail route was called - the picture itself was not sent again.
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toContain('/api/profile/image/thumbnail')

    // ---------- Replacing ----------

    await page.getByTestId('profile-photo-input').setInputFiles(plain('flat.png', GREEN))
    dialog = await openCropper(page)
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await expectAvatarShows(page, GREEN)

    // ---------- Removing falls back to the monogram ----------

    await page.getByTestId('profile-photo-remove').click()

    await expect(avatar).toHaveText(/^[A-Z]$/)
    await expect(page.getByTestId('profile-photo-pick')).toHaveText('Upload photo')
    await expect(page.getByTestId('profile-photo-reframe')).toHaveCount(0)

    // And it stays gone.
    await page.reload()
    await expect(avatar).toHaveText(/^[A-Z]$/)
  })

  test('the cropper is reachable and dismissable from the keyboard', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/profile')

    // The file input is hidden but not removed, so it is still what the keyboard reaches.
    await page.getByTestId('profile-photo-input').focus()
    await expect(page.getByTestId('profile-photo-input')).toBeFocused()

    await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
    const dialog = await openCropper(page)

    // Escape leaves everything as it was, and nothing was uploaded.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('profile-avatar')).toHaveText(/^[A-Z]$/)
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

      // With a real photo in it too: the cropper, the actions and the circle all have to fit the
      // column, and the actions wrap rather than being reached for sideways.
      await page.getByTestId('profile-photo-input').setInputFiles(thirds('bands.png'))
      const dialog = await openCropper(page)
      await expectSquareCovered(dialog)
      await dialog.getByTestId('image-crop-confirm').click()
      await expect(dialog).toHaveCount(0)
      await expect(avatar).toHaveJSProperty('tagName', 'IMG')

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
