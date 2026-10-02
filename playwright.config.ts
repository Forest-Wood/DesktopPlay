import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/smoke', timeout: 60_000, workers: 1, reporter: [['list']], outputDir: 'test-results', use: { trace: 'retain-on-failure' } });
