import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: process.env.CI ? 15000 : 5000, hookTimeout: 20000, maxWorkers: process.env.CI ? 2 : undefined } });
