const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 15 * 60 * 1000,
  workers: 1,
  use: {
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
  },
  reporter: 'list',
});
