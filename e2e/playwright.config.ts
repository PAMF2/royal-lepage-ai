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
      command: "npm run dev",
      cwd: "../setup-wizard",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "npm run dev -- -p 3001",
      cwd: "../dashboard",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "npm run dev -- -p 3002",
      cwd: "../roi-calculator",
      port: 3002,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "npm run dev -- -p 3003",
      cwd: "../sales-deck",
      port: 3003,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
