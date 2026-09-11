import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { entryNames } from './support/zip'

/**
 * The parts of an entry's picture only a browser can prove.
 *
 * What is accepted, where it is stored, who may read it and what a replacement or a reframing
 * does to the objects underneath are all settled by the API tests, which can reach states this
 * screen cannot. What they cannot show is that an author can actually do it: pick a file, frame
 * the square the cards will show, see the whole picture on the page and only that square on the
 * card, frame it again without uploading anything, and take it away with the card falling back
 * rather than breaking. That is this file.
 *
 * The pictures are made of coloured bands, so "the card shows the part I chose" is checked by
 * reading pixels back out of the card rather than by trusting an address.
 *
 * Nothing here needs Cloudflare. The dev server the suite already runs is configured with the
 * in-memory object store, so the whole lifecycle is exercised in-process.
 */

const PASSWORD = 'Test-password-123!'

type Rgb = [number, number, number]

const RED: Rgb = [220, 30, 30]
const GREEN: Rgb = [30, 160, 60]
const BLUE: Rgb = [30, 30, 220]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('portraitist')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function createUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Tidewatch '))
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function newEntry(page: Page, name: string, narrow = false) {
  await openSection(page, 'workspace-lore', narrow)
  await page.waitForURL(/\/lore$/)
  await page.getByTestId('new-entity').click()
  await page.waitForURL(/\/lore\/new$/)
  await page.getByLabel('Name').fill(name)
}

/** A flat picture of one colour, for the journeys where what it shows does not matter. */
function plain(name: string, width: number, height: number, rgb: Rgb) {
  return { name, mimeType: 'image/png', buffer: png(width, height, () => rgb) }
}

/** Three vertical bands, red to blue. The centred square is the green one, and never the answer. */
function thirds(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(600, 200, (x) => (x < 200 ? RED : x < 400 ? GREEN : BLUE)),
  }
}

/**
 * Three stacked bands, red at the top to blue at the bottom, three times as tall as wide. A square
 * crop of it can only ever show one band; the whole picture shows all three - which is what makes
 * the difference between cropping and fitting impossible to miss.
 */
function tower(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(200, 600, (_, y) => (y < 200 ? RED : y < 400 ? GREEN : BLUE)),
  }
}

/** On a phone the workspace navigation folds into one bar, so a section has to be opened first. */
async function openSection(page: Page, testId: string, narrow: boolean) {
  if (narrow) await page.getByTestId('workspace-nav-toggle').click()
  await page.getByTestId(testId).click()
}

/** Picks a file and keeps the cropper's starting square - for journeys that are not about framing. */
async function addPicture(page: Page, file: ReturnType<typeof plain>) {
  await page.getByTestId('entity-image-input').setInputFiles(file)
  const dialog = page.getByTestId('image-crop-dialog')
  await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
  await dialog.getByTestId('image-crop-confirm').click()
  await expect(dialog).toHaveCount(0)
}

/**
 * Drags the picture under the square as far as it will go. The cropper keeps the square inside
 * the picture, so an overlong drag lands exactly on the edge - which is what makes it repeatable.
 */
async function dragPicture(page: Page, direction: 'left' | 'right') {
  const stage = page.getByTestId('image-crop-stage')
  const box = (await stage.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + (direction === 'right' ? 1 : -1) * box.width, y, {
    steps: 12,
  })
  await page.mouse.up()
}

/**
 * Colours read back out of a displayed picture, at fractions of the way across and down, as red,
 * green, blue and alpha.
 */
async function colours(image: Locator, points: Array<[number, number]>) {
  await image.scrollIntoViewIfNeeded()
  await expect(image).toBeVisible()

  return image.evaluate(async (element, at) => {
    const picture = element as HTMLImageElement
    await picture.decode()

    const canvas = document.createElement('canvas')
    canvas.width = picture.naturalWidth
    canvas.height = picture.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(picture, 0, 0)

    return at.map(([across, down]) =>
      Array.from(
        context
          .getImageData(
            Math.floor(across * (picture.naturalWidth - 1)),
            Math.floor(down * (picture.naturalHeight - 1)),
            1,
            1,
          )
          .data.slice(0, 4),
      ),
    )
  }, points)
}

/**
 * A fitted tower: the whole picture standing in the middle of the square - red above green above
 * blue down the centre line - with the square either side of it left clear.
 */
async function expectFittedTower(image: Locator) {
  const [top, middle, bottom, left, right] = await colours(image, [
    [0.5, 0.15],
    [0.5, 0.5],
    [0.5, 0.85],
    [0.1, 0.5],
    [0.9, 0.5],
  ])

  for (const [pixel, expected] of [
    [top, RED],
    [middle, GREEN],
    [bottom, BLUE],
  ] as const) {
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(pixel[channel] - expected[channel])).toBeLessThan(50)
    }
    expect(pixel[3]).toBeGreaterThan(200)
  }

  expect(left[3]).toBeLessThan(30)
  expect(right[3]).toBeLessThan(30)
}

/** Every sampled pixel is recognisably `expected` - loose, because a thumbnail is lossy WebP. */
async function expectShows(image: Locator, expected: Rgb) {
  const sampled = await colours(image, [
    [0.15, 0.15],
    [0.5, 0.5],
    [0.85, 0.85],
    [0.15, 0.85],
    [0.85, 0.15],
  ])

  for (const pixel of sampled) {
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(pixel[channel] - expected[channel])).toBeLessThan(50)
    }
  }
}

test.describe('an entry with a picture', () => {
  test('an author adds, replaces and removes an entry image', async ({ page }) => {
    await signUp(page)
    const universeId = await createUniverse(page)

    const name = unique('Alenna Vance ')

    // ---------- Added while the entry is still being written ----------

    await newEntry(page, name)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')

    // Held locally: there is no entry yet, so there is nowhere in the bucket for it to go. It is
    // framed first all the same, and the framing is held with it.
    await addPicture(page, plain('first.png', 480, 320, BLUE))
    await expect(page.getByTestId('entity-image-preview')).toBeVisible()
    await expect(page.getByTestId('entity-image-field')).toContainText(
      'Added when this entry is created',
    )

    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    const entityId = page.url().split('/').pop()!

    // ---------- On the page ----------

    const plate = page.getByTestId('entry-image').locator('img')
    await expect(plate).toBeVisible()

    const first = await plate.getAttribute('src')
    expect(first).toMatch(
      new RegExp(`^/api/universes/${universeId}/entities/${entityId}/image/[0-9a-f-]+/original$`),
    )

    // ---------- On the card ----------

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)

    const card = page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
    await expect(card.getByTestId('entity-portrait')).toBeVisible()
    await expect(card.getByTestId('entity-portrait')).toHaveAttribute(
      'src',
      /\/image\/[0-9a-f-]+\/thumbnail\/[0-9a-f-]+$/,
    )

    // ---------- A replacement that is cancelled changes nothing ----------

    await card.click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByTestId('edit-entity').click()

    const preview = page.getByTestId('entity-image-preview')
    const before = await preview.getAttribute('src')

    await page
      .getByTestId('entity-image-input')
      .setInputFiles(plain('second.png', 300, 600, [200, 60, 40]))
    await expect(page.getByTestId('image-crop-dialog')).toBeVisible()
    await page.getByTestId('image-crop-cancel').click()
    await expect(page.getByTestId('image-crop-dialog')).toHaveCount(0)
    await expect(preview).toHaveAttribute('src', before!)

    // ---------- Replaced ----------

    // The id of the asset being replaced. Every assertion below is written against it, because
    // "a new picture" means a new asset - the old address must stop being the answer, rather
    // than the same address quietly starting to serve different bytes.
    const firstAsset = new RegExp(first!.split('/').at(-2)!)

    await addPicture(page, plain('second.png', 300, 600, [200, 60, 40]))

    // The upload is its own request, made on confirm, so this waits for it rather than the click.
    await expect(preview).not.toHaveAttribute('src', firstAsset)

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(plate).toBeVisible()
    await expect(plate).not.toHaveAttribute('src', firstAsset)
    await expect(plate).toHaveAttribute('src', /\/image\/[0-9a-f-]+\/original$/)

    // ---------- Removed ----------

    await page.getByTestId('edit-entity').click()
    await page.getByTestId('entity-image-remove').click()
    await expect(page.getByTestId('entity-image-preview')).toHaveCount(0)

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('entry-image')).toHaveCount(0)

    // And the card falls back to its monogram rather than to a broken picture.
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(card.getByTestId('entity-portrait')).toHaveCount(0)
    await expect(card.getByTestId('entity-portrait-blank')).toBeVisible()
  })

  test('an author chooses what the card shows, and chooses again without uploading', async ({
    page,
  }) => {
    await signUp(page)
    await createUniverse(page)

    const name = unique('Alenna Vance ')
    await newEntry(page, name)

    // ---------- Framed before the entry exists ----------

    await page.getByTestId('entity-image-input').setInputFiles(thirds('bands.png'))

    const dialog = page.getByTestId('image-crop-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()

    // The cropper opens on the centred square, which is the green band. Pulling the picture right
    // puts the square over its left edge - the red band a centre crop would never have chosen.
    const previewImage = dialog.getByTestId('image-crop-preview').locator('img')
    await expect(previewImage).toHaveAttribute('style', /left: -100%/)
    await dragPicture(page, 'right')
    await expect(previewImage).toHaveAttribute('style', /left: 0%/)
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // ---------- The page keeps the whole picture ----------

    const plate = page.getByTestId('entry-image').locator('img')
    await expect(plate).toBeVisible()
    const original = await plate.getAttribute('src')

    const shape = await plate.evaluate(async (element) => {
      const picture = element as HTMLImageElement
      await picture.decode()
      return [picture.naturalWidth, picture.naturalHeight]
    })
    expect(shape).toEqual([600, 200])

    // ---------- The card shows the chosen square ----------

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)

    const card = page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
    const portrait = card.getByTestId('entity-portrait')
    await expectShows(portrait, RED)
    const firstThumbnail = await portrait.getAttribute('src')

    // ---------- Framed again, from the stored original ----------

    await card.click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByTestId('edit-entity').click()

    // Nothing is chosen from the disk this time: the cropper is handed the original the entry
    // already has, and starts where the author left the square.
    const uploads: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && /\/image$/.test(new URL(request.url()).pathname)) {
        uploads.push(request.url())
      }
    })

    await page.getByTestId('entity-image-reframe').click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
    await expect(previewImage).toHaveAttribute('src', original!)
    await expect(previewImage).toHaveAttribute('style', /left: 0%/)

    // By keyboard this time: the square is focusable, and the arrow keys move the picture under
    // it. Far enough left and the square sits over the blue band.
    await dialog.getByRole('group', { name: 'Thumbnail square' }).focus()
    for (let press = 0; press < 70; press++) await page.keyboard.press('ArrowLeft')
    await expect(previewImage).toHaveAttribute('style', /left: -200%/)

    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('entity-image-preview')).not.toHaveAttribute(
      'src',
      firstThumbnail!,
    )

    // A new thumbnail, and not one byte of the picture sent again.
    expect(uploads).toEqual([])

    await page.getByRole('button', { name: 'Cancel' }).click()

    // The whole picture is still the page's, at the same address - the original was not touched.
    await expect(plate).toHaveAttribute('src', original!)

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(portrait).not.toHaveAttribute('src', firstThumbnail!)
    await expectShows(portrait, BLUE)
  })

  test('a sideways photo is framed the way it is shown', async ({ page }) => {
    await signUp(page)
    await createUniverse(page)

    const name = unique('Alenna Vance ')
    await newEntry(page, name)

    // Stored 200 wide and 600 tall in bands of red, green and blue from the top, with an EXIF tag
    // saying to turn it a quarter clockwise. The browser draws it 600 wide with blue on the left.
    // If the server measured the crop against the stored pixels instead, the square the author
    // pulled to the left would come back red or green.
    await page.getByTestId('entity-image-input').setInputFiles({
      name: 'sideways.png',
      mimeType: 'image/png',
      buffer: png(200, 600, (_, y) => (y < 200 ? RED : y < 400 ? GREEN : BLUE), 6),
    })

    const dialog = page.getByTestId('image-crop-dialog')
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
    await dragPicture(page, 'right')
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)

    await expectShows(
      page
        .locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
        .getByTestId('entity-portrait'),
      BLUE,
    )
  })

  test('the cropper fits a phone and can be used on one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await signUp(page)
    await createUniverse(page)

    const name = unique('Alenna Vance ')
    await newEntry(page, name, true)

    await page.getByTestId('entity-image-input').setInputFiles(thirds('bands.png'))

    const dialog = page.getByTestId('image-crop-dialog')
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()

    // Inside the screen in both directions, with both decisions reachable without scrolling the
    // page behind it.
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await expect(dialog.getByTestId('image-crop-confirm')).toBeInViewport()
    await expect(dialog.getByTestId('image-crop-cancel')).toBeInViewport()

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)

    // Zoomed, then pulled to the far right edge: the blue band, however far in it went.
    await dialog.getByTestId('image-crop-zoom').fill('1.5')
    await dragPicture(page, 'left')
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    await openSection(page, 'workspace-lore', true)
    await page.waitForURL(/\/lore$/)
    await expectShows(
      page
        .locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
        .getByTestId('entity-portrait'),
      BLUE,
    )
  })

  test('a tall picture is cropped, then fitted whole, without uploading it again', async ({
    page,
  }) => {
    await signUp(page)
    await createUniverse(page)

    const name = unique('Tidewatch Spire ')
    await newEntry(page, name)

    // ---------- Cropped, the way every picture starts ----------

    await page.getByTestId('entity-image-input').setInputFiles(tower('tower.png'))

    const dialog = page.getByTestId('image-crop-dialog')
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
    await expect(dialog.getByRole('radio', { name: 'Crop' })).toBeChecked()
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    const original = await page.getByTestId('entry-image').locator('img').getAttribute('src')

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)

    // The centred square of a tower is its middle band, and nothing of the other two.
    const card = page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
    const portrait = card.getByTestId('entity-portrait')
    await expectShows(portrait, GREEN)
    const cropped = await portrait.getAttribute('src')

    // ---------- Fitted, from the stored original ----------

    await card.click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByTestId('edit-entity').click()

    const uploads: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && /\/image$/.test(new URL(request.url()).pathname)) {
        uploads.push(request.url())
      }
    })

    await page.getByTestId('entity-image-reframe').click()
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()

    const preview = dialog.getByTestId('image-crop-preview')
    await expect(preview).toHaveAttribute('data-framing', 'crop')
    await expect(preview.locator('img')).toHaveAttribute('style', /top: -100%/)

    await dialog.getByText('Fit full image').click()
    await expect(dialog.getByRole('radio', { name: 'Fit full image' })).toBeChecked()

    // The square cannot be dragged while fitting, there is nothing to zoom, the stage shows the
    // whole picture in the square, and both previews - square and round - show it too.
    await expect(dialog.getByTestId('image-fit-stage')).toBeVisible()
    await expect(dialog.locator('.cropper__crop')).toHaveAttribute('inert', '')
    await expect(dialog.getByTestId('image-crop-zoom')).toHaveCount(0)
    await expect(preview).toHaveAttribute('data-framing', 'fit')
    await expect(dialog.locator('.cropper__preview--round')).toHaveAttribute('data-framing', 'fit')
    await expect(dialog).toContainText('The original is kept exactly as it is')

    // Back to cropping puts the square back where it was, and the controls with it.
    await dialog.getByText('Crop', { exact: true }).click()
    await expect(dialog.getByTestId('image-crop-zoom')).toBeVisible()
    await expect(dialog.locator('.cropper__crop')).not.toHaveAttribute('inert', '')
    await expect(preview.locator('img')).toHaveAttribute('style', /top: -100%/)

    await dialog.getByText('Fit full image').click()
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('entity-image-preview')).not.toHaveAttribute('src', cropped!)

    // A new thumbnail, and not one byte of the picture sent again.
    expect(uploads).toEqual([])

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('entry-image').locator('img')).toHaveAttribute('src', original!)

    // ---------- The card shows the whole tower ----------

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(portrait).not.toHaveAttribute('src', cropped!)
    await expectFittedTower(portrait)

    // ---------- And the dialog reopens on the framing it was left in ----------

    await card.click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByTestId('edit-entity').click()
    await page.getByTestId('entity-image-reframe').click()
    await expect(dialog.getByRole('radio', { name: 'Fit full image' })).toBeChecked()
    await expect(dialog.getByTestId('image-fit-stage')).toBeVisible()
    await dialog.getByTestId('image-crop-cancel').click()
  })

  test('fitting a whole picture works on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await signUp(page)
    await createUniverse(page)

    const name = unique('Tidewatch Spire ')
    await newEntry(page, name, true)

    await page.getByTestId('entity-image-input').setInputFiles(tower('tower.png'))

    const dialog = page.getByTestId('image-crop-dialog')
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()

    await dialog.getByText('Fit full image').click()
    await expect(dialog.getByRole('radio', { name: 'Fit full image' })).toBeChecked()

    // The dialog, the choice and both decisions are all on the screen at once.
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await expect(dialog.getByTestId('image-framing')).toBeInViewport()
    await expect(dialog.getByTestId('image-crop-confirm')).toBeInViewport()
    await expect(dialog.getByTestId('image-crop-cancel')).toBeInViewport()

    // The fitted square is a square, and it sits inside the stage rather than spilling out of it.
    const stage = (await dialog.getByTestId('image-crop-stage').boundingBox())!
    const square = (await dialog.locator('.cropper__fitsquare').boundingBox())!
    expect(Math.abs(square.width - square.height)).toBeLessThanOrEqual(1)
    expect(square.x).toBeGreaterThanOrEqual(stage.x)
    expect(square.y).toBeGreaterThanOrEqual(stage.y)
    expect(square.x + square.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5)
    expect(square.y + square.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5)

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)

    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    // Held for the new entry in the framing chosen, and uploaded that way on save.
    await expect(page.getByTestId('entity-image-preview')).toHaveAttribute('data-framing', 'fit')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    await openSection(page, 'workspace-lore', true)
    await page.waitForURL(/\/lore$/)
    await expectFittedTower(
      page
        .locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
        .getByTestId('entity-portrait'),
    )
  })

  test('a picture fits a phone without pushing the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await signUp(page)
    await createUniverse(page)

    const name = unique('Alenna Vance ')
    await newEntry(page, name, true)

    // Taller than the phone and wider than the column: the shape that would break the layout
    // if the plate were sized by the image rather than by the page.
    await addPicture(page, plain('tall.png', 1400, 2100, BLUE))
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    const plate = page.getByTestId('entry-image').locator('img')
    await expect(plate).toBeVisible()

    const box = (await plate.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(390)

    // The whole document, not just the picture: an overflowing image drags the page with it,
    // and a lore article you have to scroll sideways to read is the failure that matters.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    // And the card grid behind it, where the portrait sits beside the name.
    await openSection(page, 'workspace-lore', true)
    await page.waitForURL(/\/lore$/)
    await expect(
      page
        .locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
        .getByTestId('entity-portrait'),
    ).toBeVisible()

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)
  })

  test('history records the picture, and says it will not put one back', async ({ page }) => {
    await signUp(page)
    await createUniverse(page)

    await newEntry(page, unique('Alenna Vance '))
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // Nothing here has ever had a picture, so the note would only be noise.
    await expect(page.getByTestId('history-image-note')).toHaveCount(0)

    await page.getByTestId('edit-entity').click()
    await addPicture(page, plain('first.png', 300, 300, BLUE))
    await expect(page.getByTestId('entity-image-preview')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    // The version is there, it says what moved, and the panel says what a restore will not do.
    await expect(
      page.getByTestId('history-list').getByTestId('version-what').first(),
    ).toContainText('the image')
    await expect(page.getByTestId('history-image-note')).toContainText(
      'Images are not included when restoring a revision.',
    )
  })

  test('a backup carries the picture beside the lore', async ({ page }) => {
    await signUp(page)
    await createUniverse(page)

    await newEntry(page, unique('Alenna Vance '))
    await addPicture(page, plain('first.png', 480, 320, BLUE))
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    const entityId = page.url().split('/').pop()!

    await page.getByTestId('workspace-settings').click()
    await page.waitForURL(/\/settings$/)

    const downloading = page.waitForEvent('download')
    await page.getByTestId('export-universe').click()
    const download = await downloading

    expect(download.suggestedFilename()).toMatch(/\.zip$/)

    // The document, and the entry's original beside it - which is the whole point of the
    // archive: a backup does not stop being one the day the bucket does.
    expect(entryNames(await readFile((await download.path())!))).toEqual([
      'backup.json',
      `media/entities/${entityId}/original.png`,
    ])
  })

  test('the service worker never keeps an entry image', async ({ page }) => {
    await signUp(page)
    await createUniverse(page)

    await newEntry(page, unique('Alenna Vance '))
    await addPicture(page, plain('first.png', 480, 320, BLUE))
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    const source = await page.getByTestId('entry-image').locator('img').getAttribute('src')

    // A private picture is exactly the thing a cache-first worker must never keep, and it is
    // under /api, which the worker refuses outright - ADR 0017. Proved, not assumed.
    const cached = await page.evaluate(async (url) => {
      await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          })
          if (navigator.serviceWorker.controller) resolve()
        })
      }

      const response = await fetch(url!)
      const status = response.status

      const keys: string[] = []
      for (const name of await caches.keys()) {
        const cache = await caches.open(name)
        for (const request of await cache.keys()) keys.push(request.url)
      }

      return { status, keys }
    }, source)

    // The request really happened, so the policy is proved against traffic rather than silence.
    expect(cached.status).toBe(200)
    expect(cached.keys.filter((url) => new URL(url).pathname.startsWith('/api/'))).toEqual([])
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(async () => {
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        await registration.unregister()
      }
      for (const name of await caches.keys()) await caches.delete(name)
    })
  })
})

// ---------- A picture, made here ----------

/**
 * A real PNG, built from bytes, coloured pixel by pixel.
 *
 * Written out rather than checked in: a binary fixture in the repository is one more thing to
 * keep, and this way the test can ask for whatever size, colours and orientation the case needs.
 * `orientation`, when given, is written as an EXIF tag in an `eXIf` chunk - the same tag a phone
 * writes - so the picture is stored one way and displayed another.
 */
function png(
  width: number,
  height: number,
  colour: (x: number, y: number) => Rgb,
  orientation?: number,
) {
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 3)
    // Filter byte 0: this scanline is stored as it is.
    raw[start] = 0
    for (let x = 0; x < width; x++) {
      const at = start + 1 + x * 3
      const [red, green, blue] = colour(x, y)
      raw[at] = red
      raw[at + 1] = green
      raw[at + 2] = blue
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // Eight bits per channel.
  header[9] = 2 // Truecolour, no alpha.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...(orientation ? [chunk('eXIf', exifOrientation(orientation))] : []),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A big-endian TIFF block holding one IFD entry: Orientation (0x0112), a SHORT, one value. */
function exifOrientation(orientation: number) {
  const tiff = Buffer.alloc(26)
  tiff.write('MM', 0, 'ascii')
  tiff.writeUInt16BE(42, 2)
  tiff.writeUInt32BE(8, 4) // The first IFD follows the header.
  tiff.writeUInt16BE(1, 8) // One entry.
  tiff.writeUInt16BE(0x0112, 10)
  tiff.writeUInt16BE(3, 12)
  tiff.writeUInt32BE(1, 14)
  tiff.writeUInt16BE(orientation, 18)
  tiff.writeUInt32BE(0, 22) // No further IFD.
  return tiff
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)

  return Buffer.concat([length, body, crc])
}

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
