import { expect, type Page } from '@playwright/test'

/**
 * Lore starts with no type chosen (Product refinement 022): nothing is listed until one is. Chooses a type from the
 * header's chooser - opening any branches it hangs in, by the path given - and waits for its page.
 */
export async function chooseLoreType(page: Page, ...path: string[]) {
  await page.getByTestId('lore-type-menu').click()
  const panel = page.getByTestId('lore-type-menu-panel')
  for (const ancestor of path.slice(0, -1)) {
    const toggle = panel.locator(`[data-testid="lore-type-toggle"][data-type-name="${ancestor}"]`)
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  }
  const name = path[path.length - 1]!
  await panel.locator(`[data-testid="lore-type"][data-type-name="${name}"]`).click()
  await expect(page).toHaveURL(/[?&]type=/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}
