import type Anthropic from "@anthropic-ai/sdk";

// Deal analysis tools — mirrors the five tools exposed by deal-analysis-mcp.
// All calculations run inline (no network call needed) so the orchestrator
// can use them without spawning the MCP server as a subprocess.

function mortgagePayment(
  loanAmount: number,
  annualRate: number,
  years: number,
): number {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (loanAmount * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

export const dealAnalysisTools: Anthropic.Tool[] = [
  {
    name: "deal_calculate_mortgage",
    description:
      "Calculate monthly mortgage payment, total interest, and CMHC insurance for a Canadian property purchase",
    input_schema: {
      type: "object" as const,
      properties: {
        purchasePrice: {
          type: "number",
          description: "Purchase price in CAD",
        },
        downPaymentPercent: {
          type: "number",
          description: "Down payment percentage (default 20)",
        },
        interestRate: {
          type: "number",
          description: "Annual interest rate as a percentage (default 5.5)",
        },
        amortizationYears: {
          type: "number",
          description: "Amortization period in years (default 25)",
        },
      },
      required: ["purchasePrice"],
    },
  },
  {
    name: "deal_analyze_investment",
    description:
      "Analyze a property as a rental investment — cap rate, cash-on-cash return, gross yield, monthly cash flow. Use this when a lead mentions they are an investor or asks about cap rate.",
    input_schema: {
      type: "object" as const,
      properties: {
        purchasePrice: { type: "number", description: "Purchase price in CAD" },
        monthlyRent: {
          type: "number",
          description: "Expected monthly rental income in CAD",
        },
        downPaymentPercent: {
          type: "number",
          description: "Down payment percentage (default 20)",
        },
        interestRate: {
          type: "number",
          description: "Annual interest rate as a percentage (default 5.5)",
        },
        amortizationYears: {
          type: "number",
          description: "Amortization period in years (default 25)",
        },
        monthlyExpenses: {
          type: "number",
          description:
            "Monthly operating expenses: taxes, insurance, maintenance (CAD, default 0)",
        },
      },
      required: ["purchasePrice", "monthlyRent"],
    },
  },
  {
    name: "deal_estimate_closing_costs",
    description:
      "Estimate closing costs for a Canadian property purchase including land transfer tax, legal fees, title insurance, and home inspection",
    input_schema: {
      type: "object" as const,
      properties: {
        purchasePrice: { type: "number", description: "Purchase price in CAD" },
        province: {
          type: "string",
          enum: ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "PE", "NL"],
          description: "Province code (default ON)",
        },
        isFirstTimeBuyer: {
          type: "boolean",
          description:
            "Whether the buyer is a first-time buyer (default false)",
        },
        city: {
          type: "string",
          description:
            "City name — relevant for Toronto municipal land transfer tax",
        },
      },
      required: ["purchasePrice"],
    },
  },
  {
    name: "deal_compare_properties",
    description:
      "Compare 2–4 properties side-by-side on investment metrics (cap rate, cash flow, yield). Use when a lead is deciding between multiple listings.",
    input_schema: {
      type: "object" as const,
      properties: {
        properties: {
          type: "array",
          description: "Array of 2–4 properties to compare",
          items: {
            type: "object",
            properties: {
              address: { type: "string" },
              price: { type: "number" },
              monthlyRent: { type: "number" },
              bedrooms: { type: "number" },
              bathrooms: { type: "number" },
              sqft: { type: "number" },
              monthlyExpenses: { type: "number" },
            },
            required: [
              "address",
              "price",
              "monthlyRent",
              "bedrooms",
              "bathrooms",
            ],
          },
          minItems: 2,
          maxItems: 4,
        },
        interestRate: {
          type: "number",
          description: "Annual interest rate as a percentage (default 5.5)",
        },
      },
      required: ["properties"],
    },
  },
  {
    name: "deal_generate_investment_report",
    description:
      "Generate a full AI-written investor narrative report for a specific property. Use this after qualifying an investor lead who wants a professional analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        address: { type: "string" },
        purchasePrice: { type: "number", description: "Purchase price in CAD" },
        monthlyRent: {
          type: "number",
          description: "Expected monthly rent in CAD",
        },
        bedrooms: { type: "number" },
        bathrooms: { type: "number" },
        sqft: { type: "number" },
        neighborhood: { type: "string" },
        nearbyAmenities: { type: "string" },
        monthlyExpenses: {
          type: "number",
          description: "Monthly operating expenses in CAD (default 0)",
        },
        investorGoal: {
          type: "string",
          enum: ["cash-flow", "appreciation", "flip", "short-term-rental"],
          description: "Primary investment goal (default cash-flow)",
        },
      },
      required: [
        "address",
        "purchasePrice",
        "monthlyRent",
        "bedrooms",
        "bathrooms",
      ],
    },
  },
];

export async function handleDealAnalysisTool(
  name: string,
  input: Record<string, unknown>,
) {
  switch (name) {
    case "deal_calculate_mortgage": {
      const price = input.purchasePrice as number;
      const downPct = (input.downPaymentPercent as number | undefined) ?? 20;
      const rate = (input.interestRate as number | undefined) ?? 5.5;
      const years = (input.amortizationYears as number | undefined) ?? 25;
      const down = (downPct / 100) * price;
      const loan = price - down;
      const monthly = mortgagePayment(loan, rate, years);
      const total = monthly * years * 12;
      const interest = total - loan;

      let cmhc = 0;
      if (downPct < 20) {
        const ltv = loan / price;
        if (ltv > 0.9) cmhc = loan * 0.04;
        else if (ltv > 0.85) cmhc = loan * 0.031;
        else cmhc = loan * 0.028;
      }

      return {
        purchasePrice: `$${price.toLocaleString()} CAD`,
        downPayment: `$${Math.round(down).toLocaleString()} CAD (${downPct}%)`,
        loanAmount: `$${Math.round(loan).toLocaleString()} CAD`,
        monthlyPayment: `$${Math.round(monthly).toLocaleString()} CAD`,
        totalInterestPaid: `$${Math.round(interest).toLocaleString()} CAD`,
        totalCostOfLoan: `$${Math.round(total).toLocaleString()} CAD`,
        cmhcInsurance:
          cmhc > 0
            ? `$${Math.round(cmhc).toLocaleString()} CAD (required — down < 20%)`
            : "Not required",
        rate: `${rate}%`,
        amortization: `${years} years`,
      };
    }

    case "deal_analyze_investment": {
      const price = input.purchasePrice as number;
      const rent = input.monthlyRent as number;
      const downPct = (input.downPaymentPercent as number | undefined) ?? 20;
      const rate = (input.interestRate as number | undefined) ?? 5.5;
      const years = (input.amortizationYears as number | undefined) ?? 25;
      const expenses = (input.monthlyExpenses as number | undefined) ?? 0;
      const down = (downPct / 100) * price;
      const loan = price - down;
      const mortgage = mortgagePayment(loan, rate, years);
      const cashFlow = rent - mortgage - expenses;
      const annualNOI = (rent - expenses) * 12;
      const capRate = (annualNOI / price) * 100;
      const cashOnCash = ((cashFlow * 12) / down) * 100;
      const grossYield = ((rent * 12) / price) * 100;

      return {
        monthly: {
          rent: `$${rent.toLocaleString()} CAD`,
          mortgage: `$${Math.round(mortgage).toLocaleString()} CAD`,
          expenses: `$${expenses.toLocaleString()} CAD`,
          cashFlow: `$${Math.round(cashFlow).toLocaleString()} CAD`,
        },
        metrics: {
          capRate: `${capRate.toFixed(2)}%`,
          cashOnCashReturn: `${cashOnCash.toFixed(2)}%`,
          grossYield: `${grossYield.toFixed(2)}%`,
          annualCashFlow: `$${Math.round(cashFlow * 12).toLocaleString()} CAD`,
        },
        verdict:
          capRate >= 5
            ? "STRONG investment — cap rate above 5%"
            : capRate >= 3
              ? "MODERATE investment — cap rate 3–5%"
              : "WEAK investment — cap rate below 3%",
      };
    }

    case "deal_estimate_closing_costs": {
      const price = input.purchasePrice as number;
      const province = (input.province as string | undefined) ?? "ON";
      const firstTime =
        (input.isFirstTimeBuyer as boolean | undefined) ?? false;
      const city = input.city as string | undefined;

      function ontarioLTT(p: number, ft: boolean) {
        let tax = 0;
        if (p <= 55000) tax = p * 0.005;
        else if (p <= 250000) tax = 275 + (p - 55000) * 0.01;
        else if (p <= 400000) tax = 2225 + (p - 250000) * 0.015;
        else if (p <= 2000000) tax = 4475 + (p - 400000) * 0.02;
        else tax = 36475 + (p - 2000000) * 0.025;
        if (ft) tax = Math.max(0, tax - 4000);
        return Math.round(tax);
      }

      function bcLTT(p: number) {
        if (p <= 200000) return Math.round(p * 0.01);
        if (p <= 2000000) return Math.round(2000 + (p - 200000) * 0.02);
        return Math.round(38000 + (p - 2000000) * 0.03);
      }

      let provincialLTT = 0;
      if (province === "ON") provincialLTT = ontarioLTT(price, firstTime);
      else if (province === "BC") provincialLTT = bcLTT(price);
      else if (province === "AB") provincialLTT = 0;
      else provincialLTT = Math.round(price * 0.015);

      const torontoLTT =
        city?.toLowerCase() === "toronto" ? ontarioLTT(price, firstTime) : 0;
      const legalFees = 1500;
      const titleInsurance = 300;
      const homeInspection = 500;
      const adjustments = Math.round(price * 0.001);
      const total =
        provincialLTT +
        torontoLTT +
        legalFees +
        titleInsurance +
        homeInspection +
        adjustments;

      return {
        purchasePrice: `$${price.toLocaleString()} CAD`,
        province,
        breakdown: {
          provincialLandTransferTax: `$${provincialLTT.toLocaleString()} CAD`,
          torontoMunicipalLTT:
            torontoLTT > 0 ? `$${torontoLTT.toLocaleString()} CAD` : "N/A",
          legalFees: `$${legalFees.toLocaleString()} CAD`,
          titleInsurance: `$${titleInsurance.toLocaleString()} CAD`,
          homeInspection: `$${homeInspection.toLocaleString()} CAD`,
          adjustments: `~$${adjustments.toLocaleString()} CAD`,
        },
        totalEstimatedClosingCosts: `$${total.toLocaleString()} CAD`,
        note: firstTime ? "First-time buyer rebate applied to LTT" : undefined,
      };
    }

    case "deal_compare_properties": {
      const properties = input.properties as Array<{
        address: string;
        price: number;
        monthlyRent: number;
        bedrooms: number;
        bathrooms: number;
        sqft?: number;
        monthlyExpenses?: number;
      }>;
      const rate = (input.interestRate as number | undefined) ?? 5.5;

      const analyzed = properties.map((p) => {
        const down = p.price * 0.2;
        const loan = p.price - down;
        const mortgage = mortgagePayment(loan, rate, 25);
        const expenses = p.monthlyExpenses ?? 0;
        const cashFlow = p.monthlyRent - mortgage - expenses;
        const capRate = (((p.monthlyRent - expenses) * 12) / p.price) * 100;
        const grossYield = ((p.monthlyRent * 12) / p.price) * 100;

        return {
          address: p.address,
          price: `$${p.price.toLocaleString()}`,
          monthlyMortgage: `$${Math.round(mortgage).toLocaleString()}`,
          monthlyCashFlow: `$${Math.round(cashFlow).toLocaleString()}`,
          capRate: `${capRate.toFixed(2)}%`,
          grossYield: `${grossYield.toFixed(2)}%`,
          pricePerSqft: p.sqft
            ? `$${Math.round(p.price / p.sqft)}/sqft`
            : "N/A",
          bedBath: `${p.bedrooms}bd/${p.bathrooms}ba`,
        };
      });

      const ranked = [...analyzed].sort(
        (a, b) => parseFloat(b.capRate) - parseFloat(a.capRate),
      );

      return {
        comparison: analyzed,
        rankedByCapRate: ranked.map((r) => r.address),
      };
    }

    case "deal_generate_investment_report": {
      // Lightweight fallback — full AI report requires the MCP server.
      // Return structured metrics so the orchestrator agent can narrate them.
      const price = input.purchasePrice as number;
      const rent = input.monthlyRent as number;
      const expenses = (input.monthlyExpenses as number | undefined) ?? 0;
      const annualNOI = (rent - expenses) * 12;
      const capRate = ((annualNOI / price) * 100).toFixed(2);
      const grossYield = (((rent * 12) / price) * 100).toFixed(2);

      return {
        address: input.address,
        capRate: `${capRate}%`,
        grossYield: `${grossYield}%`,
        investorGoal: input.investorGoal ?? "cash-flow",
        note: "Full AI narrative report available via deal-analysis-mcp generate_investment_report tool.",
        summary: `Cap rate ${capRate}% | Gross yield ${grossYield}% | Monthly rent $${(rent as number).toLocaleString()} CAD`,
      };
    }

    default:
      throw new Error(`Unknown deal analysis tool: ${name}`);
  }
}
