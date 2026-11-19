import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: {
      executablePath: process.env.ROUTE_CHROME,
      args: ['--enable-unsafe-swiftshader'],
    },
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
  },
});
