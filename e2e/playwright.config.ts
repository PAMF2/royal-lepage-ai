import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 1,
  reporter: "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npx next start -p 3000",
      cwd: "../setup-wizard",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "npx next start -p 3001",
      cwd: "../dashboard",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "npx next start -p 3002",
      cwd: "../roi-calculator",
      port: 3002,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "npx next start -p 3003",
      cwd: "../sales-deck",
      port: 3003,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
