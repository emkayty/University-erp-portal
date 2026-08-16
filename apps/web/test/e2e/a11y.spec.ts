import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

const publicRoutes = ['/auth/login', '/auth/forgot-password', '/apply'];

for (const route of publicRoutes) {
  test(`@a11y ${route} has no WCAG violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await injectAxe(page);
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });
}

test('@a11y login is usable on keyboard', async ({ page }) => {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
  const email = page.getByLabel(/email/i).first();
  await email.focus();
  await expect(email).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('body')).toContainText(/password/i);
});
