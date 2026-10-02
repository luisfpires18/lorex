import { expect, type Page } from '@playwright/test'

/**
 * Lore starts with no type chosen (Product refinement 022): nothing is listed until one is. Chooses a type from Lore's
 * type navigation - on a desktop the category row and, beneath it, the row of what is inside the chosen category; on a
 * phone the Category menu and the menu under it (refinement 028) - walking the path given from its top-level category
 * down, and waits for the last one's page.
 */
export async function chooseLoreType(page: Page, ...path: string[]) {
  const nav = page.getByRole('navigation', { name: 'Lore types' })
  // Lore drawn first, so which of the two presentations this width shows is settled before it is asked.
  await expect(page.getByTestId('new-entity')).toBeVisible()
  const wide = await nav.isVisible()

  for (const [depth, name] of path.entries()) {
    if (wide) {
      const row =
        depth === 0
          ? nav.getByTestId('lore-categories')
          : nav.locator(`[data-testid="lore-subtypes"][data-parent-name="${path[depth - 1]}"]`)
      await row.locator(`[data-testid="lore-type"][data-type-name="${name}"]`).click()
    } else {
      const menu =
        depth === 0
          ? page.getByTestId('lore-type-menu')
          : page.getByTestId('lore-subtype-menu').nth(depth - 1)
      await menu.click()
      await page
        .getByTestId(depth === 0 ? 'lore-type-menu-panel' : 'lore-subtype-menu-panel')
        .locator(`[data-type-name="${name}"]`)
        .last()
        .click()
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  }
  await expect(page).toHaveURL(/[?&]type=/)
}
