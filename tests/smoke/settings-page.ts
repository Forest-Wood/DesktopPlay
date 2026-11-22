import type { Page } from '@playwright/test';
import type { PetPersona } from '../../src/shared/types';
import { settingsCategory, type SettingsPage } from '../../src/renderer/settings/router';

export async function settingsPage(window: Page, page: SettingsPage) {
  await window.locator(`[data-category="${settingsCategory(page)}"]`).click();
  if (page !== 'home') await window.locator(`#tab-${page}`).click();
}

export async function selectStudioPersona(window: Page, persona: PetPersona) {
  const role = persona === 'dragon' ? 'gpt' : persona;
  await window.locator(`[data-studio-role="${role}"]`).click();
  if (persona === 'gpt' || persona === 'dragon') await window.locator(`[data-studio-gpt="${persona}"]`).click();
}
