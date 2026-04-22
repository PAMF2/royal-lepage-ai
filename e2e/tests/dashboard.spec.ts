import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3001";

const MOCK_STATS = {
  totalLeads: 87423,
  conversionRate: "2.1",
  qualificationRate: "8.4",
  appointmentsSet: 1835,
  handedOff: 612,
  stageCounts: {
    "New Lead": 12000,
    Attempted: 8000,
    Contacted: 5000,
    Qualified: 7341,
    "Appointment Set": 1835,
    "Handed Off": 612,
    Nurture: 3200,
    Closed: 441,
  },
};

const MOCK_LEADS = {
  leads: [
    {
      id: "lead-1",
      firstName: "Sarah",
      lastName: "Thompson",
      phone: "+1 (604) 555-0182",
      email: "sarah.t@example.com",
      source: "Web Form",
      tags: ["hot-lead", "buyer"],
      dateAdded: "2024-11-15T14:30:00Z",
      score: 88,
    },
    {
      id: "lead-2",
      firstName: "James",
      lastName: "Okafor",
      phone: "+1 (416) 555-0247",
      email: "james.o@example.com",
      source: "IDX Website",
      tags: ["warm-lead", "pre-approved"],
      dateAdded: "2024-11-14T09:00:00Z",
      score: 64,
    },
  ],
};

const MOCK_ACTIVITY = {
  events: [
    {
      id: "evt-1",
      type: "message",
      contact: "Sarah Thompson",
      message: "Interested in 3-bed listings under $900k",
      timestamp: "2024-11-15T14:32:00Z",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/stats", (route) => {
    route.fulfill({ json: MOCK_STATS });
  });
  await page.route("**/api/leads", (route) => {
    route.fulfill({ json: MOCK_LEADS });
  });
  await page.route("**/api/activity", (route) => {
    route.fulfill({ json: MOCK_ACTIVITY });
  });
});

test("page loads without crashing", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Homie Dashboard")).toBeVisible();
  await expect(
    page.getByText("Royal LePage — AI Lead Management"),
  ).toBeVisible();
});

test("pipeline stats section is visible", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Total Leads")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Appointments Set")).toBeVisible();
  await expect(page.getByText("Conversion Rate")).toBeVisible();
});

test("pipeline stats display mocked values", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("87,423")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("1,835").first()).toBeVisible();
  await expect(page.getByText("2.1%")).toBeVisible();
});

test("recent leads table is visible with mocked data", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Recent Leads")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Sarah Thompson")).toBeVisible();
  await expect(page.getByText("James Okafor")).toBeVisible();
});

test("lead scores render correctly", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Sarah Thompson")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("88")).toBeVisible();
  await expect(page.getByText("64")).toBeVisible();
});

test("lead tags render with correct labels", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Sarah Thompson")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("hot-lead")).toBeVisible();
  await expect(page.getByText("pre-approved")).toBeVisible();
});
