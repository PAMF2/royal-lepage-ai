#!/usr/bin/env node
/**
 * Deal analysis MCP — property investment analysis for buyer and investor leads.
 * Tools: analyze_investment, calculate_mortgage, estimate_closing_costs,
 *        compare_properties, generate_investment_report
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function err(e: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${e instanceof Error ? e.message : String(e)}`,
      },
    ],
    isError: true as const,
  };
}

const server = new McpServer({ name: "deal-analysis-mcp", version: "1.0.0" });

server.tool(
  "analyze_investment",
  "Analyze a property as an investment — cap rate, cash-on-cash return, gross yield, monthly cash flow",
  {
    purchasePrice: z.number().describe("Purchase price in CAD"),
    monthlyRent: z.number().describe("Expected monthly rental income in CAD"),
    downPaymentPercent: z
      .number()
      .default(20)
      .describe("Down payment percentage (default 20)"),
    interestRate: z
      .number()
      .default(5.5)
      .describe("Annual mortgage interest rate (default 5.5%)"),
    amortizationYears: z.number().default(25),
    monthlyExpenses: z
      .number()
      .default(0)
      .describe("Monthly expenses: taxes, insurance, maintenance (CAD)"),
    annualAppreciationPercent: z
      .number()
      .default(3)
      .describe("Expected annual appreciation (default 3%)"),
  },
  async ({
    purchasePrice,
    monthlyRent,
    downPaymentPercent,
    interestRate,
    amortizationYears,
    monthlyExpenses,
    annualAppreciationPercent,
  }) => {
    try {
      const downPayment = (downPaymentPercent / 100) * purchasePrice;
      const loanAmount = purchasePrice - downPayment;
      const monthlyRate = interestRate / 100 / 12;
      const n = amortizationYears * 12;
      const monthlyMortgage =
        (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
        (Math.pow(1 + monthlyRate, n) - 1);

      const totalMonthlyExpenses = monthlyExpenses + monthlyMortgage;
      const monthlyCashFlow = monthlyRent - totalMonthlyExpenses;
      const annualCashFlow = monthlyCashFlow * 12;
      const annualRent = monthlyRent * 12;
      const annualNOI = annualRent - monthlyExpenses * 12;
      const capRate = (annualNOI / purchasePrice) * 100;
      const cashOnCash = (annualCashFlow / downPayment) * 100;
      const grossYield = (annualRent / purchasePrice) * 100;
      const valueIn5Years =
        purchasePrice * Math.pow(1 + annualAppreciationPercent / 100, 5);

      return ok({
        summary: {
          purchasePrice: `$${purchasePrice.toLocaleString()} CAD`,
          downPayment: `$${Math.round(downPayment).toLocaleString()} CAD (${downPaymentPercent}%)`,
          loanAmount: `$${Math.round(loanAmount).toLocaleString()} CAD`,
        },
        monthly: {
          rent: `$${monthlyRent.toLocaleString()} CAD`,
          mortgage: `$${Math.round(monthlyMortgage).toLocaleString()} CAD`,
          expenses: `$${monthlyExpenses.toLocaleString()} CAD`,
          cashFlow: `$${Math.round(monthlyCashFlow).toLocaleString()} CAD`,
        },
        metrics: {
          capRate: `${capRate.toFixed(2)}%`,
          cashOnCashReturn: `${cashOnCash.toFixed(2)}%`,
          grossYield: `${grossYield.toFixed(2)}%`,
          annualCashFlow: `$${Math.round(annualCashFlow).toLocaleString()} CAD`,
        },
        appreciation: {
          currentValue: `$${purchasePrice.toLocaleString()} CAD`,
          estimatedValueIn5Years: `$${Math.round(valueIn5Years).toLocaleString()} CAD`,
          projectedGain: `$${Math.round(valueIn5Years - purchasePrice).toLocaleString()} CAD`,
        },
        verdict:
          capRate >= 5
            ? "STRONG investment — cap rate above 5%"
            : capRate >= 3
              ? "MODERATE investment — cap rate 3-5%"
              : "WEAK investment — cap rate below 3%",
      });
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "calculate_mortgage",
  "Calculate mortgage payments, total interest, and amortization schedule summary",
  {
    purchasePrice: z.number(),
    downPaymentPercent: z.number().default(20),
    interestRate: z.number().default(5.5),
    amortizationYears: z.number().default(25),
  },
  async ({
    purchasePrice,
    downPaymentPercent,
    interestRate,
    amortizationYears,
  }) => {
    try {
      const downPayment = (downPaymentPercent / 100) * purchasePrice;
      const loanAmount = purchasePrice - downPayment;
      const monthlyRate = interestRate / 100 / 12;
      const n = amortizationYears * 12;
      const monthlyPayment =
        (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
        (Math.pow(1 + monthlyRate, n) - 1);
      const totalPaid = monthlyPayment * n;
      const totalInterest = totalPaid - loanAmount;

      // CMHC insurance (Canada — required if down < 20%)
      let cmhcPremium = 0;
      if (downPaymentPercent < 20) {
        const ltv = loanAmount / purchasePrice;
        if (ltv > 0.9) cmhcPremium = loanAmount * 0.04;
        else if (ltv > 0.85) cmhcPremium = loanAmount * 0.031;
        else cmhcPremium = loanAmount * 0.028;
      }

      return ok({
        purchasePrice: `$${purchasePrice.toLocaleString()} CAD`,
        downPayment: `$${Math.round(downPayment).toLocaleString()} CAD`,
        loanAmount: `$${Math.round(loanAmount).toLocaleString()} CAD`,
        monthlyPayment: `$${Math.round(monthlyPayment).toLocaleString()} CAD`,
        totalInterestPaid: `$${Math.round(totalInterest).toLocaleString()} CAD`,
        totalCostOfLoan: `$${Math.round(totalPaid).toLocaleString()} CAD`,
        cmhcInsurance:
          cmhcPremium > 0
            ? `$${Math.round(cmhcPremium).toLocaleString()} CAD (required — down < 20%)`
            : "Not required",
        rate: `${interestRate}%`,
        amortization: `${amortizationYears} years`,
      });
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "estimate_closing_costs",
  "Estimate closing costs for a Canadian property purchase (land transfer tax, legal fees, etc.)",
  {
    purchasePrice: z.number(),
    province: z
      .enum(["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "PE", "NL"])
      .default("ON"),
    isFirstTimeBuyer: z.boolean().default(false),
    city: z
      .string()
      .optional()
      .describe("City name — used for municipal LTT (Toronto)"),
  },
  async ({ purchasePrice, province, isFirstTimeBuyer, city }) => {
    try {
      // Provincial Land Transfer Tax
      function calculateOntarioLTT(price: number, firstTime: boolean): number {
        let tax = 0;
        if (price <= 55000) tax = price * 0.005;
        else if (price <= 250000) tax = 275 + (price - 55000) * 0.01;
        else if (price <= 400000) tax = 2225 + (price - 250000) * 0.015;
        else if (price <= 2000000) tax = 4475 + (price - 400000) * 0.02;
        else tax = 36475 + (price - 2000000) * 0.025;
        if (firstTime) tax = Math.max(0, tax - 4000);
        return Math.round(tax);
      }

      function calculateBCLTT(price: number): number {
        if (price <= 200000) return Math.round(price * 0.01);
        if (price <= 2000000) return Math.round(2000 + (price - 200000) * 0.02);
        return Math.round(38000 + (price - 2000000) * 0.03);
      }

      let provincialLTT = 0;
      if (province === "ON")
        provincialLTT = calculateOntarioLTT(purchasePrice, isFirstTimeBuyer);
      else if (province === "BC") provincialLTT = calculateBCLTT(purchasePrice);
      else if (province === "AB")
        provincialLTT = 0; // AB has no LTT
      else provincialLTT = Math.round(purchasePrice * 0.015); // rough estimate for others

      // Toronto municipal LTT (mirrors provincial)
      const torontoLTT =
        city?.toLowerCase() === "toronto"
          ? calculateOntarioLTT(purchasePrice, isFirstTimeBuyer)
          : 0;

      const legalFees = 1500;
      const titleInsurance = 300;
      const homeInspection = 500;
      const adjustments = Math.round(purchasePrice * 0.001); // property tax/utility adjustments

      const total =
        provincialLTT +
        torontoLTT +
        legalFees +
        titleInsurance +
        homeInspection +
        adjustments;

      return ok({
        purchasePrice: `$${purchasePrice.toLocaleString()} CAD`,
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
        note: isFirstTimeBuyer
          ? "First-time buyer rebate applied to LTT"
          : undefined,
      });
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "compare_properties",
  "Compare up to 4 properties side-by-side on key investment metrics",
  {
    properties: z
      .array(
        z.object({
          address: z.string(),
          price: z.number(),
          monthlyRent: z.number(),
          bedrooms: z.number(),
          bathrooms: z.number(),
          sqft: z.number().optional(),
          monthlyExpenses: z.number().default(0),
        }),
      )
      .min(2)
      .max(4),
    interestRate: z.number().default(5.5),
  },
  async ({ properties, interestRate }) => {
    try {
      const analyzed = properties.map((p) => {
        const down = p.price * 0.2;
        const loan = p.price - down;
        const r = interestRate / 100 / 12;
        const n = 25 * 12;
        const mortgage =
          (loan * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
        const cashFlow = p.monthlyRent - mortgage - p.monthlyExpenses;
        const capRate =
          (((p.monthlyRent - p.monthlyExpenses) * 12) / p.price) * 100;
        const pricePerSqft = p.sqft ? Math.round(p.price / p.sqft) : null;

        return {
          address: p.address,
          price: `$${p.price.toLocaleString()}`,
          monthlyRent: `$${p.monthlyRent.toLocaleString()}`,
          monthlyMortgage: `$${Math.round(mortgage).toLocaleString()}`,
          monthlyCashFlow: `$${Math.round(cashFlow).toLocaleString()}`,
          capRate: `${capRate.toFixed(2)}%`,
          grossYield: `${(((p.monthlyRent * 12) / p.price) * 100).toFixed(2)}%`,
          pricePerSqft: pricePerSqft ? `$${pricePerSqft}/sqft` : "N/A",
          bedBath: `${p.bedrooms}bd/${p.bathrooms}ba`,
        };
      });

      // Rank by cap rate
      const ranked = [...analyzed].sort(
        (a, b) => parseFloat(b.capRate) - parseFloat(a.capRate),
      );

      return ok({
        comparison: analyzed,
        rankedByCapRate: ranked.map((r) => r.address),
      });
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "generate_investment_report",
  "Generate a full investor narrative report for a property using AI",
  {
    address: z.string(),
    purchasePrice: z.number(),
    monthlyRent: z.number(),
    bedrooms: z.number(),
    bathrooms: z.number(),
    sqft: z.number().optional(),
    neighborhood: z.string().optional(),
    nearbyAmenities: z.string().optional(),
    monthlyExpenses: z.number().default(0),
    investorGoal: z
      .enum(["cash-flow", "appreciation", "flip", "short-term-rental"])
      .default("cash-flow"),
  },
  async ({
    address,
    purchasePrice,
    monthlyRent,
    bedrooms,
    bathrooms,
    sqft,
    neighborhood,
    nearbyAmenities,
    monthlyExpenses,
    investorGoal,
  }) => {
    try {
      const annualNOI = (monthlyRent - monthlyExpenses) * 12;
      const capRate = ((annualNOI / purchasePrice) * 100).toFixed(2);
      const grossYield = (((monthlyRent * 12) / purchasePrice) * 100).toFixed(
        2,
      );

      const prompt = `You are a Canadian real estate investment analyst. Write a concise, professional investment brief (350-500 words) for this property:

Address: ${address}
Price: $${purchasePrice.toLocaleString()} CAD
Bedrooms/Bathrooms: ${bedrooms}bd/${bathrooms}ba${sqft ? ` | ${sqft} sqft` : ""}
Monthly Rent: $${monthlyRent.toLocaleString()} CAD
Monthly Expenses: $${monthlyExpenses.toLocaleString()} CAD
Cap Rate: ${capRate}%
Gross Yield: ${grossYield}%
Investor Goal: ${investorGoal}
${neighborhood ? `Neighborhood: ${neighborhood}` : ""}
${nearbyAmenities ? `Nearby: ${nearbyAmenities}` : ""}

Include: executive summary, investment thesis, key metrics, risks, and recommendation. Use CAD. Be direct and data-driven.`;

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const report = msg.content[0].type === "text" ? msg.content[0].text : "";

      return ok({
        address,
        capRate: `${capRate}%`,
        grossYield: `${grossYield}%`,
        investorGoal,
        report,
      });
    } catch (e) {
      return err(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
