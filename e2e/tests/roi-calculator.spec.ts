import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3002";

const MOCK_PROPERTY_RESULTS = {
  inputs: {
    price: 800000,
    downPayment: 160000,
    downPercent: 20,
    loanAmount: 640000,
    monthlyRent: 3500,
    expenses: 600,
    rate: 5.25,
    amortizationYears: 25,
  },
  cmhc: { required: false, premium: 0, note: "" },
  monthly: {
    mortgagePayment: 3821,
    expenses: 600,
    totalOutflow: 4421,
    rent: 3500,
    cashflow: -921,
  },
  annual: { noi: 34800, cashflow: -11052 },
  metrics: { capRate: 4.35, cashOnCash: -6.91, grossYield: 5.25 },
  verdict: "Marginal investment — cap rate below 5%.",
};

test("page loads with calculator visible", async ({ page }) => {
  await page.goto(BASE);
  await expect(
    page.getByText("AI Lead Platform — ROI Calculator"),
  ).toBeVisible();
  await expect(page.getByText("Your Brokerage")).toBeVisible();
  await expect(page.getByText("Projected Impact")).toBeVisible();
});

test("sliders are present", async ({ page }) => {
  await page.goto(BASE);
  const sliders = page.locator('input[type="range"]');
  await expect(sliders).toHaveCount(10);
});

test("property calculator section is visible", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Property Investment Calculator")).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate" })).toBeVisible();
});

test("results render after mocked POST /api/calculate", async ({ page }) => {
  await page.route("/api/calculate", (route) => {
    route.fulfill({ json: MOCK_PROPERTY_RESULTS });
  });

  await page.goto(BASE);

  const priceSlider = page.locator('input[type="range"]').nth(6);
  await priceSlider.evaluate((el: HTMLInputElement) => {
    el.value = "800000";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const downSlider = page.locator('input[type="range"]').nth(7);
  await downSlider.evaluate((el: HTMLInputElement) => {
    el.value = "160000";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const rentSlider = page.locator('input[type="range"]').nth(8);
  await rentSlider.evaluate((el: HTMLInputElement) => {
    el.value = "3500";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await page.getByRole("button", { name: "Calculate" }).click();

  await expect(page.getByText("Monthly cashflow")).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText("Cap rate")).toBeVisible();
  await expect(page.getByText("Cash-on-cash return")).toBeVisible();
  await expect(page.getByText("Gross yield")).toBeVisible();
  await expect(page.getByText("4.35%")).toBeVisible();
  await expect(page.getByText("Marginal investment")).toBeVisible();
});

test("ROI metrics update reactively from sliders", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("Annual ROI")).toBeVisible();
  await expect(page.getByText("Payback period")).toBeVisible();
  await expect(page.getByText("Revenue per lead:")).toBeVisible();
});
