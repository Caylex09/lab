const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node tests/server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
