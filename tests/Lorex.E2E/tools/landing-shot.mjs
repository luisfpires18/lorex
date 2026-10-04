/**
 * The landing page's product picture (031), made again from nothing.
 *
 * Builds one demo universe - Hollowmere, an original world written for this, nobody's real work - through the real API
 * on whatever database the running API uses, then photographs its Lore, on the Character type, in both themes at
 * 1440 x 800 and twice the pixels.
 * The only pictures it uploads are Lorex's own atmosphere paintings, so nothing private or borrowed is in the frame.
 *
 * Run it against a fresh database, so the account and the world are the only ones there:
 *
 *   ConnectionStrings__LorexDb="Data Source=App_Data/lorex.landing.db" dotnet run --project src/Lorex.Api --urls http://localhost:5180
 *   (src/Lorex.Web) npm run dev
 *   (tests/Lorex.E2E) node tools/landing-shot.mjs
 *
 * It writes `landing-product-dark.png` and `landing-product-light.png` (2880 x 1600) to `test-results/` (gitignored);
 * the committed WebP copies in `src/Lorex.Web/src/assets/` are those, encoded per theme with
 *   ffmpeg -i landing-product-<theme>.png -c:v libwebp -quality 80 -compression_level 6 landing-product-<theme>-2880.webp
 *   ffmpeg -i landing-product-<theme>.png -vf scale=1440:-1:flags=lanczos -c:v libwebp -quality 82 -compression_level 6 landing-product-<theme>-1440.webp
 */
import { chromium, request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.LOREX_WEB_URL ?? 'http://localhost:5173'
const here = (name) => fileURLToPath(new URL(name, import.meta.url))
const art = (name) =>
    readFileSync(
        fileURLToPath(new URL(`../../../src/Lorex.Web/src/assets/${name}`, import.meta.url)),
    )

const CANON = 2
const DRAFT = 1
const account = {
    username: 'hollowmere',
    email: 'hollowmere@example.test',
    password: 'Landing-demo-031!',
}

const api = await request.newContext({ baseURL: BASE })

async function call(method, path, data) {
    const response = await api.fetch(path, { method, data })
    if (!response.ok())
        throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`)
    return response.status() === 204 ? null : response.json()
}

const registered = await api.post('/api/auth/register', { data: account })
if (!registered.ok())
    await call('POST', '/api/auth/login', {
        usernameOrEmail: account.username,
        password: account.password,
    })

const universe = await call('POST', '/api/universes', {
    name: 'Hollowmere',
    description:
        'A kingdom of lake-cities that sank in a single night, and the tide-wardens who still remember what lies under the water.',
    accentColor: null,
})
const u = `/api/universes/${universe.id}`

// The world's own artwork, so the workspace's atmosphere is this world's and not Lorex's default citadel.
const artwork = await api.put(`${u}/artwork`, {
    multipart: {
        file: { name: 'ridge.webp', mimeType: 'image/webp', buffer: art('atmosphere-ridge.webp') },
    },
})
if (!artwork.ok()) throw new Error(`artwork: ${artwork.status()} ${await artwork.text()}`)

const types = Object.fromEntries(
    (await call('GET', `${u}/entity-types`)).map((type) => [type.name, type.id]),
)

const doc = (...paragraphs) =>
    JSON.stringify({
        type: 'doc',
        content: paragraphs.map((text) => ({
            type: 'paragraph',
            content: [{ type: 'text', text }],
        })),
    })

const entries = {}
async function entry(type, name, summary, tags = [], status = CANON) {
    const created = await call('POST', `${u}/entities`, {
        entityTypeId: types[type],
        name,
        summary,
        canonStatus: status,
        aliases: [],
        tags,
        fields: [],
    })
    entries[name] = created.id
    return created.id
}

await entry(
    'Character',
    'Ilse Varrow',
    'Last tide-warden of Hollowmere, keeper of the sunken bell.',
    ['tide-wardens'],
)
await entry(
    'Character',
    'Aurek Varrow',
    'Ilse’s father, who rang the bell on the night the city fell.',
    ['tide-wardens'],
)
await entry('Character', 'Maren Thole', 'Ferrywoman of the outer lakes, and Ilse’s oldest friend.')
await entry(
    'Character',
    'Corvane Esk',
    'Regent of the risen quarter, who wants the bell silenced for good.',
    ['regency'],
)
await entry(
    'Character',
    'Odile Brae',
    'The wardens’ archivist, who keeps a map of every drowned street.',
    ['tide-wardens'],
)
await entry(
    'Character',
    'Tobin Esk',
    'Corvane’s son, apprenticed to the wardens against his father’s wishes.',
    [],
    DRAFT,
)
await entry(
    'Location',
    'Hollowmere',
    'The drowned capital. At low water its towers still break the surface.',
)
await entry('Location', 'Tower of Saint Vey', 'Where the sunken bell hangs, forty fathoms down.')
await entry(
    'Location',
    'Greywater Ferry',
    'The only crossing between the risen quarter and the old shore.',
)
await entry('Organization', 'The Tide-Wardens', 'An order sworn to remember the city as it was.', [
    'tide-wardens',
])
await entry(
    'Organization',
    'The Regency',
    'The council that governs what was saved, and decides what is forgotten.',
    ['regency'],
)
await entry(
    'Event',
    'The Night of the Bell',
    'The night Hollowmere sank, between one tide and the next.',
)
await entry('Item', 'The Sunken Bell', 'A bronze bell that still rings at every turn of the tide.')
await entry(
    'Concept',
    'Tidecraft',
    'The wardens’ art of reading the lake’s memory in its currents.',
)
await entry(
    'Species',
    'Lantern eels',
    'Pale eels that light the drowned streets and follow the bell’s sound.',
)

await call('PUT', `${u}/entities/${entries['Ilse Varrow']}/article`, {
    content: doc(
        'Ilse was nine when Hollowmere went under. She remembers the bell more clearly than the water: one long note, then the lake closing over the towers.',
        'She took the warden’s oath at nineteen, the last to do so. Every turn of the tide she rows out to the Tower of Saint Vey and listens, because the bell has started to ring out of time.',
    ),
    expectedUpdatedAt: null,
})

for (const [name, file, crop] of [
    // [x, y, height] as fractions of the 1672 x 941 painting; the width makes the square.
    ['Hollowmere', 'atmosphere-citadel.webp', [0.52, 0.12, 0.53]],
    ['Tower of Saint Vey', 'atmosphere-ridge.webp', [0.43, 0.42, 0.29]],
    ['Ilse Varrow', 'atmosphere-citadel.webp', [0.78, 0.38, 0.36]],
    ['Aurek Varrow', 'atmosphere-ridge.webp', [0.05, 0.27, 0.5]],
    ['Greywater Ferry', 'atmosphere-ridge.webp', [0.55, 0.6, 0.39]],
]) {
    const [x, y, height] = crop
    const square = { x, y, width: (height * 941) / 1672, height }
    const uploaded = await api.put(`${u}/entities/${entries[name]}/image`, {
        multipart: {
            file: { name: file, mimeType: 'image/webp', buffer: art(file) },
            crop: JSON.stringify(square),
        },
    })
    if (!uploaded.ok())
        throw new Error(`image ${name}: ${uploaded.status()} ${await uploaded.text()}`)
}

const kind = (name, inverseName, isSymmetric, familySemantic = 0) =>
    call('POST', `${u}/relationship-types`, {
        name,
        inverseName,
        isSymmetric,
        description: null,
        displayOrder: null,
        canonConstraints: null,
        familySemantic,
    })
const parent = await kind('Parent of', 'Child of', false, 1)
const friend = await kind('Friend of', null, true)
const member = await kind('Member of', 'Has member', false)
const keeper = await kind('Keeper of', 'Kept by', false)

const link = (type, source, target) =>
    call('POST', `${u}/relationships`, {
        relationshipTypeId: type.id,
        sourceEntityId: entries[source],
        targetEntityId: entries[target],
        canonStatus: CANON,
        startDate: null,
        endDate: null,
        notes: null,
    })
await link(parent, 'Aurek Varrow', 'Ilse Varrow')
await link(parent, 'Corvane Esk', 'Tobin Esk')
await link(friend, 'Ilse Varrow', 'Maren Thole')
await link(member, 'Ilse Varrow', 'The Tide-Wardens')
await link(member, 'Aurek Varrow', 'The Tide-Wardens')
await link(member, 'Corvane Esk', 'The Regency')
await link(keeper, 'Ilse Varrow', 'The Sunken Bell')

const moment = (title, year, entityIds, description = null) =>
    call('POST', `${u}/timeline`, {
        title,
        description,
        canonStatus: CANON,
        dateKind: 0,
        startYear: year,
        startMonth: null,
        startDay: null,
        endYear: null,
        endMonth: null,
        endDay: null,
        eraLabel: null,
        entityIds: entityIds.map((name) => entries[name]),
        startEraId: null,
        endEraId: null,
    })
await moment('The bell is cast for Saint Vey', 412, ['The Sunken Bell', 'Tower of Saint Vey'])
await moment('The Night of the Bell', 1180, ['Aurek Varrow', 'Hollowmere', 'The Sunken Bell'])
await moment('Ilse takes the warden’s oath', 1190, ['Ilse Varrow', 'The Tide-Wardens'])

const story = await call('POST', `${u}/stories`, {
    title: 'The Bell Under the Water',
    premise: 'The bell has begun to ring out of time, and only Ilse knows what that means.',
    status: 1,
})
const s = `${u}/stories/${story.id}`
const lowWater = await call('POST', `${s}/chapters`, {
    title: 'Low Water',
    summary: null,
    notes: null,
})
const scene = (title, summary, chapterId, names) =>
    call('POST', `${s}/scenes`, {
        title,
        summary,
        notes: null,
        povEntityId: entries['Ilse Varrow'],
        chronology: null,
        entityIds: names.map((name) => entries[name]),
        chapterId,
    })
await scene(
    'The thirteenth toll',
    'Ilse counts the bell at dawn and gets one toll too many.',
    lowWater.id,
    ['Ilse Varrow', 'The Sunken Bell'],
)
await scene('Across Greywater', 'Maren rows her out past the regent’s markers.', lowWater.id, [
    'Maren Thole',
    'Greywater Ferry',
])

for (const [title, description] of [
    [
        'The bell keeps the tide',
        'The sunken bell rings once at every turn of the tide. It has never missed one.',
    ],
    [
        'No one enters the drowned city after dark',
        'The lantern eels follow sound, and at night they follow anything.',
    ],
]) {
    await call('POST', `${u}/world-rules`, { title, description, expectedUpdatedAt: null })
}

console.log(`Universe ${universe.id}`)

// Lore, on its Character type: real entries, the type row, statuses, and every section in the sidebar. Twice the pixels
// of the frame, so the picture stays sharp on a high-density screen.
const browser = await chromium.launch()
for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({
        baseURL: BASE,
        viewport: { width: 1440, height: 800 },
        deviceScaleFactor: 2,
        storageState: await api.storageState(),
    })
    await context.addInitScript((value) => localStorage.setItem('lorex-theme', value), theme)
    const page = await context.newPage()
    await page.goto(`/app/universes/${universe.id}/lore?type=${types.Character}`)
    await page.waitForLoadState('networkidle')
    await page.mouse.move(1439, 799)
    await page.screenshot({ path: here(`../test-results/landing-product-${theme}.png`) })
    await context.close()
}
await browser.close()
await api.dispose()
