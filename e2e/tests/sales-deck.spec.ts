import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3003";
const TOTAL_SLIDES = 12;

test("page loads and shows first slide", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText("ROYAL LEPAGE — AI LEAD PLATFORM")).toBeVisible();
  await expect(page.getByText("THE PROBLEM")).toBeVisible();
  await expect(
    page.getByText("Verse.ai is a black box you don't own."),
  ).toBeVisible();
});

test("slide counter shows 01 / 12 on load", async ({ page }) => {
  await page.goto(BASE);
  await expect(
    page.getByText(`01 / ${String(TOTAL_SLIDES).padStart(2, "0")}`),
  ).toBeVisible();
});

test("Prev button is disabled on first slide", async ({ page }) => {
  await page.goto(BASE);
  const prev = page.getByRole("button", { name: /← Prev/ });
  await expect(prev).toBeDisabled();
});

test("Next button advances to second slide", async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole("button", { name: /Next →/ }).click();
  await expect(page.getByText("THE OPPORTUNITY")).toBeVisible();
  await expect(
    page.getByText("80,000+ leads. Most of them are dormant."),
  ).toBeVisible();
});

test("keyboard arrow right navigates forward", async ({ page }) => {
  await page.goto(BASE);
  const deck = page.locator("div[tabindex='0']").first();
  await deck.focus();
  await deck.press("ArrowRight");
  await expect(page.getByText("THE OPPORTUNITY")).toBeVisible();
});

test("keyboard arrow left navigates backward", async ({ page }) => {
  await page.goto(BASE);
  const deck = page.locator("div[tabindex='0']").first();
  await deck.focus();
  await deck.press("ArrowRight");
  await deck.press("ArrowLeft");
  await expect(page.getByText("THE PROBLEM")).toBeVisible();
});

test("all 12 slides are reachable via Next button", async ({ page }) => {
  await page.goto(BASE);

  const expectedTags = [
    "THE PROBLEM",
    "THE OPPORTUNITY",
    "THE SOLUTION",
    "ARCHITECTURE",
    "CORE CAPABILITY 1",
    "CORE CAPABILITY 2",
    "CORE CAPABILITY 3",
    "CORE CAPABILITY 4",
    "VS VERSE.AI",
    "TIMELINE",
    "INVESTMENT",
    "NEXT STEPS",
  ];

  for (let i = 0; i < TOTAL_SLIDES; i++) {
    await expect(page.getByText(expectedTags[i])).toBeVisible();
    if (i < TOTAL_SLIDES - 1) {
      await page.getByRole("button", { name: /Next →/ }).click();
    }
  }
});

test("Next button is disabled on last slide", async ({ page }) => {
  await page.goto(BASE);

  for (let i = 0; i < TOTAL_SLIDES - 1; i++) {
    await page.getByRole("button", { name: /Next →/ }).click();
  }

  const next = page.getByRole("button", { name: /Next →/ });
  await expect(next).toBeDisabled();
});

test("dot navigation jumps to correct slide", async ({ page }) => {
  await page.goto(BASE);

  const dots = page.locator(
    "div[style*='border-bottom'] div[style*='gap: 8px'] button",
  );
  await dots.nth(8).click();

  await expect(page.getByText("VS VERSE.AI")).toBeVisible();
});
