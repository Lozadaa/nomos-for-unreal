import { defineConfig, devices } from '@playwright/test'

// Los e2e arrancan su propio servicio sembrado (e2e/global-setup.ts) sirviendo panel/dist: ejecuta antes `npm run build`.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { viewport: { width: 1366, height: 768 }, trace: 'off' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
  ],
})
