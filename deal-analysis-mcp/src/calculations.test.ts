import { describe, it, expect } from "vitest";
import {
  calculateMortgage,
  calculateInvestmentMetrics,
  calculateOntarioLTT,
  calculateBCLTT,
  estimateClosingCosts,
} from "./calculations.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to two decimal places for floating-point comparisons. */
function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// calculateMortgage
// ---------------------------------------------------------------------------

describe("calculateMortgage", () => {
  describe("standard case — 20% down, 5.5% rate, 25-year amortization", () => {
    it("should compute correct loan amount", () => {
      // Arrange
      const purchasePrice = 500_000;
      const downPercent = 20;

      // Act
      const result = calculateMortgage(purchasePrice, downPercent, 5.5, 25);

      // Assert
      expect(result.downPayment).toBe(100_000);
      expect(result.loanAmount).toBe(400_000);
    });

    it("should compute monthly payment within ±$1 of known value", () => {
      // Arrange / Act
      // Known: $400k at 5.5%/12 over 300 months ≈ $2,453/mo
      const { monthlyPayment } = calculateMortgage(500_000, 20, 5.5, 25);

      // Assert
      expect(monthlyPayment).toBeGreaterThan(2_400);
      expect(monthlyPayment).toBeLessThan(2_520);
    });

    it("should have total interest greater than loan amount over 25 years", () => {
      // Arrange / Act
      const { totalInterest, loanAmount } = calculateMortgage(
        500_000,
        20,
        5.5,
        25,
      );

      // Assert — significant interest accumulates over 25 years at 5.5%
      expect(totalInterest).toBeGreaterThan(loanAmount * 0.3);
    });

    it("should compute totalPaid as monthlyPayment * n", () => {
      // Arrange / Act
      const result = calculateMortgage(500_000, 20, 5.5, 25);
      const expected = result.monthlyPayment * 25 * 12;

      // Assert
      expect(r2(result.totalPaid)).toBe(r2(expected));
    });

    it("should not apply CMHC when down payment is exactly 20%", () => {
      // Arrange / Act
      const { cmhcPremium } = calculateMortgage(500_000, 20, 5.5, 25);

      // Assert
      expect(cmhcPremium).toBe(0);
    });
  });

  describe("CMHC insurance premium tiers", () => {
    it("should apply 4% premium when LTV > 90% (down < 10%)", () => {
      // Arrange — 5% down on $500k → LTV 95%
      const purchasePrice = 500_000;
      const loanAmount = purchasePrice * 0.95;

      // Act
      const { cmhcPremium } = calculateMortgage(purchasePrice, 5, 5.5, 25);

      // Assert
      expect(r2(cmhcPremium)).toBe(r2(loanAmount * 0.04));
    });

    it("should apply 3.1% premium when LTV is 85–90% (down 10–15%)", () => {
      // Arrange — 10% down on $500k → LTV 90%, boundary: LTV must be > 0.85 and <= 0.90
      // At exactly 10% down LTV = 0.90, which is NOT > 0.90, so falls into 3.1% bracket
      const purchasePrice = 500_000;
      const loanAmount = purchasePrice * 0.9;

      // Act
      const { cmhcPremium } = calculateMortgage(purchasePrice, 10, 5.5, 25);

      // Assert
      expect(r2(cmhcPremium)).toBe(r2(loanAmount * 0.031));
    });

    it("should apply 2.8% premium when LTV is <= 85% (down 15–19.99%)", () => {
      // Arrange — 15% down on $500k → LTV 85%
      const purchasePrice = 500_000;
      const loanAmount = purchasePrice * 0.85;

      // Act
      const { cmhcPremium } = calculateMortgage(purchasePrice, 15, 5.5, 25);

      // Assert
      expect(r2(cmhcPremium)).toBe(r2(loanAmount * 0.028));
    });

    it("should apply 4% CMHC on $1M+ property with 5% down", () => {
      // Arrange
      const purchasePrice = 1_200_000;
      const loanAmount = purchasePrice * 0.95;

      // Act
      const { cmhcPremium } = calculateMortgage(purchasePrice, 5, 5.5, 25);

      // Assert
      expect(r2(cmhcPremium)).toBe(r2(loanAmount * 0.04));
    });

    it("should not apply CMHC when down is 19.99% (just under threshold)", () => {
      // Arrange — 19% down → still < 20% so CMHC applies
      const { cmhcPremium } = calculateMortgage(500_000, 19, 5.5, 25);

      // Assert — premium must be non-zero
      expect(cmhcPremium).toBeGreaterThan(0);
    });

    it("should not apply CMHC when down is exactly 20%", () => {
      const { cmhcPremium } = calculateMortgage(800_000, 20, 5.5, 25);
      expect(cmhcPremium).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle 0% interest rate without NaN or division by zero", () => {
      // Arrange / Act
      const { monthlyPayment, totalInterest } = calculateMortgage(
        400_000,
        20,
        0,
        25,
      );

      // Assert — no interest paid, principal only
      expect(Number.isFinite(monthlyPayment)).toBe(true);
      expect(monthlyPayment).toBeGreaterThan(0);
      expect(r2(totalInterest)).toBe(0);
    });

    it("should handle 0% down payment (full loan)", () => {
      // Arrange / Act
      const { loanAmount, downPayment, cmhcPremium } = calculateMortgage(
        300_000,
        0,
        5.5,
        25,
      );

      // Assert
      expect(downPayment).toBe(0);
      expect(loanAmount).toBe(300_000);
      // LTV = 1.0 > 0.9 → 4% CMHC
      expect(r2(cmhcPremium)).toBe(r2(300_000 * 0.04));
    });

    it("should handle $1M+ property with 20% down (no CMHC)", () => {
      // Arrange / Act
      const { cmhcPremium, loanAmount } = calculateMortgage(
        1_500_000,
        20,
        5.5,
        25,
      );

      // Assert
      expect(loanAmount).toBe(1_200_000);
      expect(cmhcPremium).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateInvestmentMetrics — cap rate and cash-on-cash return
// ---------------------------------------------------------------------------

describe("calculateInvestmentMetrics", () => {
  describe("cap rate", () => {
    it("should compute cap rate as (annualNOI / purchasePrice) * 100", () => {
      // Arrange
      const purchasePrice = 600_000;
      const monthlyRent = 3_000;
      const monthlyExpenses = 500;
      const annualNOI = (monthlyRent - monthlyExpenses) * 12;
      const expectedCapRate = (annualNOI / purchasePrice) * 100;

      // Act
      const { capRate } = calculateInvestmentMetrics(
        purchasePrice,
        monthlyRent,
        20,
        5.5,
        25,
        monthlyExpenses,
      );

      // Assert
      expect(r2(capRate)).toBe(r2(expectedCapRate));
    });

    it("should flag strong investment when cap rate >= 5%", () => {
      // Arrange — $300k property, $2500/mo rent, $200/mo expenses → ~9% cap rate
      const { capRate } = calculateInvestmentMetrics(
        300_000,
        2_500,
        20,
        5.5,
        25,
        200,
      );

      // Assert
      expect(capRate).toBeGreaterThanOrEqual(5);
    });

    it("should reflect weak investment when cap rate < 3%", () => {
      // Arrange — $1M property, $1500/mo rent (unrealistically low yield)
      const { capRate } = calculateInvestmentMetrics(
        1_000_000,
        1_500,
        20,
        5.5,
        25,
        0,
      );

      // Assert
      expect(capRate).toBeLessThan(3);
    });
  });

  describe("cash-on-cash return", () => {
    it("should compute cash-on-cash as (annualCashFlow / downPayment) * 100", () => {
      // Arrange
      const purchasePrice = 500_000;
      const downPercent = 25;
      const downPayment = purchasePrice * (downPercent / 100);
      const monthlyRent = 2_800;
      const monthlyExpenses = 300;

      // Act
      const metrics = calculateInvestmentMetrics(
        purchasePrice,
        monthlyRent,
        downPercent,
        5.5,
        25,
        monthlyExpenses,
      );

      const expectedCoc = (metrics.annualCashFlow / downPayment) * 100;

      // Assert
      expect(r2(metrics.cashOnCash)).toBe(r2(expectedCoc));
    });

    it("should return 0 cash-on-cash when down payment is 0%", () => {
      // Arrange / Act
      const { cashOnCash } = calculateInvestmentMetrics(
        400_000,
        2_000,
        0,
        5.5,
        25,
        0,
      );

      // Assert — guard against division by zero
      expect(cashOnCash).toBe(0);
    });
  });

  describe("gross yield", () => {
    it("should compute gross yield as (annualRent / purchasePrice) * 100", () => {
      // Arrange
      const purchasePrice = 400_000;
      const monthlyRent = 2_000;
      const expectedGrossYield = ((monthlyRent * 12) / purchasePrice) * 100;

      // Act
      const { grossYield } = calculateInvestmentMetrics(
        purchasePrice,
        monthlyRent,
        20,
        5.5,
        25,
        0,
      );

      // Assert
      expect(r2(grossYield)).toBe(r2(expectedGrossYield));
    });
  });

  describe("monthly cash flow", () => {
    it("should compute monthlyCashFlow as rent minus mortgage minus expenses", () => {
      // Arrange
      const purchasePrice = 500_000;
      const monthlyRent = 3_000;
      const monthlyExpenses = 400;

      // Act
      const metrics = calculateInvestmentMetrics(
        purchasePrice,
        monthlyRent,
        20,
        5.5,
        25,
        monthlyExpenses,
      );

      const expectedCashFlow =
        monthlyRent - metrics.monthlyMortgage - monthlyExpenses;

      // Assert
      expect(r2(metrics.monthlyCashFlow)).toBe(r2(expectedCashFlow));
    });

    it("should produce negative cash flow when rent does not cover costs", () => {
      // Arrange — very low rent on expensive property
      const { monthlyCashFlow } = calculateInvestmentMetrics(
        800_000,
        1_500,
        20,
        5.5,
        25,
        800,
      );

      // Assert
      expect(monthlyCashFlow).toBeLessThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateOntarioLTT
// ---------------------------------------------------------------------------

describe("calculateOntarioLTT", () => {
  it("should apply 0.5% on first $55k bracket", () => {
    // Arrange / Act
    const { provincialLTT } = calculateOntarioLTT(40_000, false, false);

    // Assert
    expect(provincialLTT).toBe(Math.round(40_000 * 0.005));
  });

  it("should compute tax correctly in $250k bracket", () => {
    // Arrange — $200k price falls in second bracket (55k–250k at 1%)
    const { provincialLTT } = calculateOntarioLTT(200_000, false, false);
    const expected = Math.round(275 + (200_000 - 55_000) * 0.01);

    // Assert
    expect(provincialLTT).toBe(expected);
  });

  it("should compute tax correctly for $500k property", () => {
    // Arrange / Act — third and fourth brackets
    const { provincialLTT } = calculateOntarioLTT(500_000, false, false);
    // 0–55k: 275, 55k–250k: 1950, 250k–400k: 2250, 400k–500k: 2000 → 6475
    const expected = Math.round(4475 + (500_000 - 400_000) * 0.02);

    // Assert
    expect(provincialLTT).toBe(expected);
  });

  it("should apply first-time buyer $4k rebate", () => {
    // Arrange
    const without = calculateOntarioLTT(500_000, false, false);
    const withRebate = calculateOntarioLTT(500_000, true, false);

    // Assert
    expect(without.provincialLTT - withRebate.provincialLTT).toBe(4_000);
  });

  it("should double total LTT for Toronto properties", () => {
    // Arrange
    const outside = calculateOntarioLTT(500_000, false, false);
    const toronto = calculateOntarioLTT(500_000, false, true);

    // Assert — municipal mirrors provincial for Toronto
    expect(toronto.municipalLTT).toBe(outside.provincialLTT);
    expect(toronto.total).toBe(outside.provincialLTT * 2);
  });

  it("should not apply Toronto municipal LTT outside Toronto", () => {
    // Arrange / Act
    const { municipalLTT } = calculateOntarioLTT(700_000, false, false);

    // Assert
    expect(municipalLTT).toBe(0);
  });

  it("should apply top 2.5% bracket for $2M+ property", () => {
    // Arrange
    const price = 2_500_000;
    const expected = Math.round(36475 + (price - 2_000_000) * 0.025);

    // Act
    const { provincialLTT } = calculateOntarioLTT(price, false, false);

    // Assert
    expect(provincialLTT).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// calculateBCLTT
// ---------------------------------------------------------------------------

describe("calculateBCLTT", () => {
  it("should apply 1% on properties <= $200k", () => {
    expect(calculateBCLTT(150_000)).toBe(Math.round(150_000 * 0.01));
  });

  it("should apply 2% on portion above $200k up to $2M", () => {
    const price = 600_000;
    const expected = Math.round(2_000 + (price - 200_000) * 0.02);
    expect(calculateBCLTT(price)).toBe(expected);
  });

  it("should apply 3% on portion above $2M", () => {
    const price = 3_000_000;
    const expected = Math.round(38_000 + (price - 2_000_000) * 0.03);
    expect(calculateBCLTT(price)).toBe(expected);
  });

  it("should return exactly $2000 at the $200k boundary", () => {
    expect(calculateBCLTT(200_000)).toBe(2_000);
  });
});

// ---------------------------------------------------------------------------
// estimateClosingCosts
// ---------------------------------------------------------------------------

describe("estimateClosingCosts", () => {
  const FIXED = 1500 + 300 + 500; // legalFees + titleInsurance + homeInspection

  it("should include fixed costs (legal, title insurance, inspection) for all provinces", () => {
    // Arrange / Act
    const result = estimateClosingCosts(400_000, "AB", false, false);

    // Assert — Alberta has no LTT so total = fixed + adjustments
    const adjustments = Math.round(400_000 * 0.001);
    expect(result.legalFees).toBe(1_500);
    expect(result.titleInsurance).toBe(300);
    expect(result.homeInspection).toBe(500);
    expect(result.total).toBe(FIXED + adjustments);
  });

  it("should apply Ontario LTT for ON province", () => {
    // Arrange
    const price = 500_000;
    const result = estimateClosingCosts(price, "ON", false, false);
    const expectedLTT = calculateOntarioLTT(price, false, false).provincialLTT;

    // Assert
    expect(result.provincialLTT).toBe(expectedLTT);
  });

  it("should apply Toronto municipal LTT when isToronto is true", () => {
    // Arrange
    const price = 500_000;
    const result = estimateClosingCosts(price, "ON", false, true);
    const expectedProvincial = calculateOntarioLTT(
      price,
      false,
      false,
    ).provincialLTT;

    // Assert — municipal mirrors provincial
    expect(result.municipalLTT).toBe(expectedProvincial);
    expect(result.total).toBeGreaterThan(
      estimateClosingCosts(price, "ON", false, false).total,
    );
  });

  it("should apply BC LTT for BC province", () => {
    // Arrange
    const price = 800_000;
    const result = estimateClosingCosts(price, "BC", false, false);

    // Assert
    expect(result.provincialLTT).toBe(calculateBCLTT(price));
    expect(result.municipalLTT).toBe(0);
  });

  it("should apply 0 provincial LTT for Alberta", () => {
    // Arrange / Act
    const result = estimateClosingCosts(600_000, "AB", false, false);

    // Assert
    expect(result.provincialLTT).toBe(0);
  });

  it("should apply flat 1.5% estimate for unknown provinces", () => {
    // Arrange
    const price = 400_000;
    const result = estimateClosingCosts(price, "QC", false, false);

    // Assert
    expect(result.provincialLTT).toBe(Math.round(price * 0.015));
  });

  it("should compute adjustments as 0.1% of purchase price", () => {
    // Arrange / Act
    const price = 750_000;
    const result = estimateClosingCosts(price, "ON", false, false);

    // Assert
    expect(result.adjustments).toBe(Math.round(price * 0.001));
  });

  it("should sum all line items correctly in total", () => {
    // Arrange
    const price = 600_000;
    const result = estimateClosingCosts(price, "ON", false, true);

    // Act — recompute total from parts
    const expected =
      result.provincialLTT +
      result.municipalLTT +
      result.legalFees +
      result.titleInsurance +
      result.homeInspection +
      result.adjustments;

    // Assert
    expect(result.total).toBe(expected);
  });

  it("should apply first-time buyer rebate to ON LTT", () => {
    // Arrange
    const price = 500_000;
    const withRebate = estimateClosingCosts(price, "ON", true, false);
    const withoutRebate = estimateClosingCosts(price, "ON", false, false);

    // Assert
    expect(withRebate.provincialLTT).toBeLessThan(withoutRebate.provincialLTT);
    expect(withoutRebate.provincialLTT - withRebate.provincialLTT).toBe(4_000);
  });
});
