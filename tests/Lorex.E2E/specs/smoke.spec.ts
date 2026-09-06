import { expect, test } from '@playwright/test'

test.describe('bootstrap smoke', () => {
  test('frontend loads and renders the app shell', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Lorex')
    await expect(page.getByTestId('app-title')).toHaveText('Lorex')
  })

  test('frontend reaches the API through the dev proxy', async ({ page }) => {
    await page.goto('/')

    const status = page.getByTestId('api-status')
    await expect(status).toHaveAttribute('data-state', 'online')
    await expect(status).toContainText('Lorex.Api')
  })

  test('api health endpoint answers directly', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.ok()).toBeTruthy()
    expect(await response.json()).toMatchObject({ status: 'healthy', service: 'Lorex.Api' })
  })
})
