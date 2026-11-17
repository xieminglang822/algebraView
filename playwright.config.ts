import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // A dependency-free static server keeps E2E independent of Vite's dev-time
    // transform pipeline; it serves the exact `dist/` output that GitHub Pages hosts.
    command: 'node scripts/static-server.mjs',
    url: 'http://127.0.0.1:4173/algebraView/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
