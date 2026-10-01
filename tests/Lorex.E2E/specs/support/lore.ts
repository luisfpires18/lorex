import { expect, type Page } from '@playwright/test'

/**
 * Lore starts with no type chosen (Product refinement 022): nothing is listed until one is. Chooses a type from Lore's type
 * navigation - the wrapped row on a desktop, the "Choose type" menu on a phone (refinement 025) - and waits for its page.
 * Every type is in either list, nested ones after their parent, so only the last name of a path is needed; the path is
 * still accepted so a caller can say where the type hangs.
 */
export async function chooseLoreType(page: Page, ...path: string[]) {
  const name = path[path.length - 1]!
  const row = page.getByRole('navigation', { name: 'Lore types' })
  // Lore drawn first, so which of the two presentations this width shows is settled before it is asked.
  await expect(page.getByTestId('new-entity')).toBeVisible()
  if (await row.isVisible()) {
    await row.locator(`[data-testid="lore-type"][data-type-name="${name}"]`).click()
  } else {
    await page.getByTestId('lore-type-menu').click()
    await page.getByTestId('lore-type-menu-panel').locator(`[data-type-name="${name}"]`).click()
  }
  await expect(page).toHaveURL(/[?&]type=/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}
