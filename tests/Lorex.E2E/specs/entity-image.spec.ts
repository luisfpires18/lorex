import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { entryNames } from './support/zip'

/**
 * One journey, for the parts of an entry's picture only a browser can prove.
 *
 * What is accepted, where it is stored, who may read it and what a replacement does to the
 * objects underneath are all settled by the API tests, which can reach states this screen
 * cannot. What they cannot show is that an author can actually do it: pick a file before the
 * entry exists, see it on the card and on the page, swap it, and take it away again with the
 * card falling back rather than breaking. That is this file.
 *
 * Nothing here needs Cloudflare. The dev server the suite already runs is configured with the
 * in-memory object store, so the whole lifecycle is exercised in-process.
 */

const PASSWORD = 'Test-password-123!'

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

function upload(name: string, width: number, height: number, rgb: [number, number, number]) {
  return { name, mimeType: 'image/png', buffer: png(width, height, rgb) }
}

/** On a phone the workspace navigation folds into one bar, so a section has to be opened first. */
async function openSection(page: Page, testId: string, narrow: boolean) {
  if (narrow) await page.getByTestId('workspace-nav-toggle').click()
  await page.getByTestId(testId).click()
}

test.describe('an entry with a picture', () => {
  test('an author adds, replaces and removes an entry image', async ({ page }) => {
    await signUp(page)
    const universeId = await createUniverse(page)

    const name = unique('Alenna Vance ')

    // ---------- Added while the entry is still being written ----------

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)

    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')

    // Held locally: there is no entry yet, so there is nowhere in the bucket for it to go.
    await page
      .getByTestId('entity-image-input')
      .setInputFiles(upload('first.png', 480, 320, [30, 90, 170]))
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
      /\/image\/[0-9a-f-]+\/thumbnail$/,
    )

    // ---------- Replaced ----------

    await card.click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByTestId('edit-entity').click()

    // The id of the asset being replaced. Every assertion below is written against it, because
    // "a new picture" means a new asset - the old address must stop being the answer, rather
    // than the same address quietly starting to serve different bytes.
    const firstAsset = new RegExp(first!.split('/').at(-2)!)

    await page
      .getByTestId('entity-image-input')
      .setInputFiles(upload('second.png', 300, 600, [200, 60, 40]))

    // The upload is its own request, so this waits for it rather than for the click.
    await expect(page.getByTestId('entity-image-preview')).not.toHaveAttribute('src', firstAsset)

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

  test('a picture fits a phone without pushing the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await signUp(page)
    await createUniverse(page)

    const name = unique('Alenna Vance ')
    await openSection(page, 'workspace-lore', true)
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(name)

    // Taller than the phone and wider than the column: the shape that would break the layout
    // if the plate were sized by the image rather than by the page.
    await page
      .getByTestId('entity-image-input')
      .setInputFiles(upload('tall.png', 1400, 2100, [30, 90, 170]))
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

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(unique('Alenna Vance '))
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // Nothing here has ever had a picture, so the note would only be noise.
    await expect(page.getByTestId('history-image-note')).toHaveCount(0)

    await page.getByTestId('edit-entity').click()
    await page
      .getByTestId('entity-image-input')
      .setInputFiles(upload('first.png', 300, 300, [30, 90, 170]))
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

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(unique('Alenna Vance '))
    await page
      .getByTestId('entity-image-input')
      .setInputFiles(upload('first.png', 480, 320, [30, 90, 170]))
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

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(unique('Alenna Vance '))
    await page
      .getByTestId('entity-image-input')
      .setInputFiles(upload('first.png', 480, 320, [30, 90, 170]))
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
 * A real PNG, built from bytes.
 *
 * Written out rather than checked in: a binary fixture in the repository is one more thing to
 * keep, and this way the test can ask for whatever size and colour the case actually needs -
 * which is what lets "replaced" be visibly a different picture rather than the same one twice.
 */
function png(width: number, height: number, [red, green, blue]: [number, number, number]) {
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 3)
    // Filter byte 0: this scanline is stored as it is.
    raw[start] = 0
    for (let x = 0; x < width; x++) {
      const at = start + 1 + x * 3
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
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
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
