import { defineConfig, devices } from "@playwright/test";

// Mirrors the prosemirror-lab setup: a real Chromium (the separator hack
// only renders under browser.chrome || browser.safari), a fixed-port Vite
// dev server, and specs that drive the page through window.__pmLab.
export default defineConfig({
  testDir: "./tests",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5302",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5302",
    reuseExistingServer: true,
  },
});
