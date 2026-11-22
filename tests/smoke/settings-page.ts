import type { Page } from '@playwright/test';
import { settingsCategory, type SettingsPage } from '../../src/renderer/settings/router';

export async function settingsPage(window: Page, page: SettingsPage) {
  await window.locator(`[data-category="${settingsCategory(page)}"]`).click();
  if (page !== 'home') await window.locator(`#tab-${page}`).click();
}
