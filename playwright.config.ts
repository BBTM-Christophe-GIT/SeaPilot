import { defineConfig, devices } from '@playwright/test';

// These tests sign in and write synthetic records. Keep both targets local.
const baseURL = 'http://127.0.0.1:4173';
const supabaseURL = new URL(process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:55321');
if (supabaseURL.protocol !== 'http:' || supabaseURL.hostname !== '127.0.0.1' || supabaseURL.port !== '55321') {
  throw new Error('Browser tests require the isolated SeaPilotCI Supabase instance at http://127.0.0.1:55321.');
}

function shellQuote(path: string): string {
  if (process.platform === 'win32') {
    if (/["%\r\n]/.test(path)) throw new Error('Unsupported runtime path for the local preview server.');
    return `"${path}"`;
  }
  return `'${path.replaceAll("'", "'\\''")}'`;
}

// Keep the Node and pnpm versions used by `pnpm test:e2e`, including on Windows.
const pnpmCommand = process.env.npm_execpath
  ? `${shellQuote(process.execPath)} ${shellQuote(process.env.npm_execpath)}`
  : 'pnpm';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/browser-results.xml' }],
  ],
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `${pnpmCommand} preview --host 127.0.0.1 --port 4173 --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
