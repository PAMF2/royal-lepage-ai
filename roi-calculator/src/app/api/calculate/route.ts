import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  price: z.number().positive(),
  downPayment: z.number().positive(),
  monthlyRent: z.number().positive(),
  expenses: z.number().min(0),
});

/** CMHC insurance premium tiers (Canada) */
function cmhcPremium(loanAmount: number, ltv: number): number {
  if (ltv <= 0.8) return 0; // down >= 20%, no CMHC required
  if (ltv > 0.9) return loanAmount * 0.04;
  if (ltv > 0.85) return loanAmount * 0.031;
  return loanAmount * 0.028;
}

/** Standard Canadian mortgage payment formula */
function monthlyMortgagePayment(
  principal: number,
  annualRatePercent: number,
  amortizationYears: number,
): number {
  const monthlyRate = annualRatePercent / 100 / 12;
  const n = amortizationYears * 12;
  if (monthlyRate === 0) return principal / n;
  return (
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
    (Math.pow(1 + monthlyRate, n) - 1)
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { price, downPayment, monthlyRent, expenses } = parsed.data;

  if (downPayment >= price) {
    return NextResponse.json(
      { error: "Down payment must be less than purchase price" },
      { status: 422 },
    );
  }

  const RATE = 5.5; // current Canadian mortgage rate %
  const AMORT_YEARS = 25;

  const loanAmount = price - downPayment;
  const ltv = loanAmount / price;
  const downPercent = (downPayment / price) * 100;

  const cmhc = cmhcPremium(loanAmount, ltv);
  // CMHC premium is added to the insured mortgage
  const insuredLoan = cmhc > 0 ? loanAmount + cmhc : loanAmount;

  const mortgagePayment = monthlyMortgagePayment(
    insuredLoan,
    RATE,
    AMORT_YEARS,
  );

  const totalMonthlyOutflow = mortgagePayment + expenses;
  const monthlyCashflow = monthlyRent - totalMonthlyOutflow;

  // Cap rate uses NOI / purchase price (ignores financing)
  const annualNOI = (monthlyRent - expenses) * 12;
  const capRate = (annualNOI / price) * 100;

  // Cash-on-cash uses annual cashflow / cash invested (down payment + CMHC if paid upfront)
  const cashInvested = downPayment; // CMHC is rolled into the mortgage
  const annualCashflow = monthlyCashflow * 12;
  const cashOnCash = (annualCashflow / cashInvested) * 100;

  const grossYield = ((monthlyRent * 12) / price) * 100;

  return NextResponse.json({
    inputs: {
      price,
      downPayment,
      downPercent: Math.round(downPercent * 10) / 10,
      loanAmount: Math.round(loanAmount),
      monthlyRent,
      expenses,
      rate: RATE,
      amortizationYears: AMORT_YEARS,
    },
    cmhc: {
      required: cmhc > 0,
      premium: Math.round(cmhc),
      note:
        cmhc > 0
          ? `CMHC insurance required — down payment below 20% (${downPercent.toFixed(1)}%). Premium added to mortgage.`
          : "Not required — down payment is 20% or more.",
    },
    monthly: {
      mortgagePayment: Math.round(mortgagePayment),
      expenses: Math.round(expenses),
      totalOutflow: Math.round(totalMonthlyOutflow),
      rent: Math.round(monthlyRent),
      cashflow: Math.round(monthlyCashflow),
    },
    annual: {
      noi: Math.round(annualNOI),
      cashflow: Math.round(annualCashflow),
    },
    metrics: {
      capRate: Math.round(capRate * 100) / 100,
      cashOnCash: Math.round(cashOnCash * 100) / 100,
      grossYield: Math.round(grossYield * 100) / 100,
    },
    verdict:
      capRate >= 5
        ? "STRONG — cap rate above 5%"
        : capRate >= 3
          ? "MODERATE — cap rate 3–5%"
          : "WEAK — cap rate below 3%",
  });
}
