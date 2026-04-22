/**
 * Pure calculation functions extracted from deal-analysis-mcp index.ts.
 * No I/O, no MCP transport — safe to unit-test in isolation.
 */

export interface MortgageResult {
  downPayment: number;
  loanAmount: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  cmhcPremium: number;
}

/**
 * Calculate standard Canadian mortgage payment.
 * Uses the standard annuity formula:
 *   P * (r * (1+r)^n) / ((1+r)^n - 1)
 *
 * When interestRate is 0 the formula degenerates; we handle it as simple
 * division (equal principal payments, no interest).
 */
export function calculateMortgage(
  purchasePrice: number,
  downPaymentPercent: number,
  interestRate: number,
  amortizationYears: number,
): MortgageResult {
  const downPayment = (downPaymentPercent / 100) * purchasePrice;
  const loanAmount = purchasePrice - downPayment;
  const n = amortizationYears * 12;

  let monthlyPayment: number;
  if (interestRate === 0) {
    monthlyPayment = loanAmount / n;
  } else {
    const monthlyRate = interestRate / 100 / 12;
    monthlyPayment =
      (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
      (Math.pow(1 + monthlyRate, n) - 1);
  }

  const totalPaid = monthlyPayment * n;
  const totalInterest = totalPaid - loanAmount;

  // CMHC insurance — required when down payment < 20%
  let cmhcPremium = 0;
  if (downPaymentPercent < 20) {
    const ltv = loanAmount / purchasePrice;
    if (ltv > 0.9) cmhcPremium = loanAmount * 0.04;
    else if (ltv > 0.85) cmhcPremium = loanAmount * 0.031;
    else cmhcPremium = loanAmount * 0.028;
  }

  return {
    downPayment,
    loanAmount,
    monthlyPayment,
    totalInterest,
    totalPaid,
    cmhcPremium,
  };
}

export interface InvestmentMetrics {
  capRate: number;
  cashOnCash: number;
  grossYield: number;
  annualCashFlow: number;
  monthlyCashFlow: number;
  monthlyMortgage: number;
}

/**
 * Calculate investment metrics given a property's financials.
 */
export function calculateInvestmentMetrics(
  purchasePrice: number,
  monthlyRent: number,
  downPaymentPercent: number,
  interestRate: number,
  amortizationYears: number,
  monthlyExpenses: number,
): InvestmentMetrics {
  const { downPayment, monthlyPayment } = calculateMortgage(
    purchasePrice,
    downPaymentPercent,
    interestRate,
    amortizationYears,
  );

  const totalMonthlyExpenses = monthlyExpenses + monthlyPayment;
  const monthlyCashFlow = monthlyRent - totalMonthlyExpenses;
  const annualCashFlow = monthlyCashFlow * 12;
  const annualRent = monthlyRent * 12;
  const annualNOI = annualRent - monthlyExpenses * 12;
  const capRate = (annualNOI / purchasePrice) * 100;
  const cashOnCash = downPayment > 0 ? (annualCashFlow / downPayment) * 100 : 0;
  const grossYield = (annualRent / purchasePrice) * 100;

  return {
    capRate,
    cashOnCash,
    grossYield,
    annualCashFlow,
    monthlyCashFlow,
    monthlyMortgage: monthlyPayment,
  };
}

export interface OntarioLTTResult {
  provincialLTT: number;
  municipalLTT: number; // > 0 only for Toronto
  total: number;
}

/**
 * Calculate Ontario Land Transfer Tax with optional Toronto municipal layer.
 * Bracket structure sourced from the index.ts implementation.
 */
export function calculateOntarioLTT(
  price: number,
  isFirstTimeBuyer: boolean,
  isToronto: boolean,
): OntarioLTTResult {
  function lttBrackets(p: number, ftb: boolean): number {
    let tax = 0;
    if (p <= 55000) tax = p * 0.005;
    else if (p <= 250000) tax = 275 + (p - 55000) * 0.01;
    else if (p <= 400000) tax = 2225 + (p - 250000) * 0.015;
    else if (p <= 2000000) tax = 4475 + (p - 400000) * 0.02;
    else tax = 36475 + (p - 2000000) * 0.025;
    if (ftb) tax = Math.max(0, tax - 4000);
    return Math.round(tax);
  }

  const provincialLTT = lttBrackets(price, isFirstTimeBuyer);
  const municipalLTT = isToronto ? lttBrackets(price, isFirstTimeBuyer) : 0;

  return { provincialLTT, municipalLTT, total: provincialLTT + municipalLTT };
}

/**
 * Calculate British Columbia Land Transfer Tax.
 */
export function calculateBCLTT(price: number): number {
  if (price <= 200000) return Math.round(price * 0.01);
  if (price <= 2000000) return Math.round(2000 + (price - 200000) * 0.02);
  return Math.round(38000 + (price - 2000000) * 0.03);
}

export interface ClosingCostEstimate {
  provincialLTT: number;
  municipalLTT: number;
  legalFees: number;
  titleInsurance: number;
  homeInspection: number;
  adjustments: number;
  total: number;
}

/**
 * Estimate total closing costs for a Canadian property.
 * Mirrors the logic in the estimate_closing_costs tool.
 */
export function estimateClosingCosts(
  purchasePrice: number,
  province: "ON" | "BC" | "AB" | string,
  isFirstTimeBuyer: boolean,
  isToronto: boolean,
): ClosingCostEstimate {
  let provincialLTT: number;
  if (province === "ON") {
    provincialLTT = calculateOntarioLTT(
      purchasePrice,
      isFirstTimeBuyer,
      false,
    ).provincialLTT;
  } else if (province === "BC") {
    provincialLTT = calculateBCLTT(purchasePrice);
  } else if (province === "AB") {
    provincialLTT = 0;
  } else {
    provincialLTT = Math.round(purchasePrice * 0.015);
  }

  const municipalLTT =
    province === "ON" && isToronto
      ? calculateOntarioLTT(purchasePrice, isFirstTimeBuyer, false)
          .provincialLTT
      : 0;

  const legalFees = 1500;
  const titleInsurance = 300;
  const homeInspection = 500;
  const adjustments = Math.round(purchasePrice * 0.001);

  const total =
    provincialLTT +
    municipalLTT +
    legalFees +
    titleInsurance +
    homeInspection +
    adjustments;

  return {
    provincialLTT,
    municipalLTT,
    legalFees,
    titleInsurance,
    homeInspection,
    adjustments,
    total,
  };
}
