import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

test.beforeEach(async ({ page }) => {
  await page.route("/api/config", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: { exists: false } });
    } else {
      route.fulfill({ json: { saved: true } });
    }
  });
});

test("page loads and shows Step 1", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Connect your accounts")).toBeVisible();
  await expect(
    page.getByText("Connect", { exact: true }).first(),
  ).toBeVisible();
});

test("required fields are present", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("GoHighLevel API Key")).toBeVisible();
  await expect(page.getByText("GoHighLevel Location ID")).toBeVisible();
  await expect(page.getByText("Anthropic API Key")).toBeVisible();
});

test("submitting empty form disables the connect button", async ({ page }) => {
  await page.goto(BASE);
  const connectBtn = page.getByRole("button", { name: /Connect →/ });
  await expect(connectBtn).toBeDisabled();
});

test("Step 2 appears after successful verification", async ({ page }) => {
  await page.route("/api/verify", (route) => {
    route.fulfill({
      json: {
        ok: true,
        results: [
          { name: "GoHighLevel", ok: true, detail: "Location: Test Office" },
          { name: "Anthropic", ok: true, detail: "API key valid" },
          {
            name: "IDX / MLS",
            ok: true,
            detail: "CREA DDF credentials present",
          },
          { name: "ElevenLabs", ok: true, detail: "Not configured (optional)" },
        ],
      },
    });
  });

  await page.route("/api/setup", (route) => {
    route.fulfill({
      json: {
        ok: true,
        steps: [
          { label: "Custom Fields", result: "Created", ok: true },
          { label: "Pipeline", result: "Created", ok: true },
          { label: "Webhooks", result: "Created", ok: true },
          { label: "Campaigns", result: "Created", ok: true },
        ],
      },
    });
  });

  await page.goto(BASE);

  await page.getByPlaceholder("eyJhbGci…").fill("ghl-test-api-key");
  await page.getByPlaceholder("abc123xyz").fill("loc-test-id");
  await page.getByPlaceholder("sk-ant-…").fill("sk-ant-test-key");

  const connectBtn = page.getByRole("button", { name: /Connect →/ });
  await expect(connectBtn).toBeEnabled();
  await connectBtn.click();

  // Step 2 is active when the Reconfigure button appears
  await expect(page.getByText("← Reconfigure")).toBeVisible({
    timeout: 10000,
  });
});
