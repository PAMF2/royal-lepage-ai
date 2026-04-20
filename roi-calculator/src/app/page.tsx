"use client";
import { useState } from "react";

const RL_RED = "#C8102E";

interface Inputs {
  totalLeads: number;
  currentCloseRate: number;
  avgCommissionCAD: number;
  currentResponseMinutes: number;
  agentsCount: number;
  verseMonthlyCAD: number;
  platformMonthlyCAD: number;
}

interface Results {
  currentDealsPerYear: number;
  aiDealsPerYear: number;
  additionalDeals: number;
  additionalRevenueCAD: number;
  verseSavingsCAD: number;
  netAnnualGainCAD: number;
  roiPercent: number;
  paybackMonths: number;
  revenuePerLead: number;
  aiRevenuePerLead: number;
}

function calculate(i: Inputs): Results {
  // AI improves close rate by ~40% via instant response + persistent follow-up
  const aiCloseRateBoost = 0.4;
  const aiCloseRate = Math.min(
    i.currentCloseRate * (1 + aiCloseRateBoost),
    100,
  );

  const currentDealsPerYear = (i.totalLeads * i.currentCloseRate) / 100;
  const aiDealsPerYear = (i.totalLeads * aiCloseRate) / 100;
  const additionalDeals = aiDealsPerYear - currentDealsPerYear;
  const additionalRevenueCAD = additionalDeals * i.avgCommissionCAD;
  const verseSavingsCAD = i.verseMonthlyCAD * 12;
  const platformCostCAD = i.platformMonthlyCAD * 12;
  const netAnnualGainCAD =
    additionalRevenueCAD + verseSavingsCAD - platformCostCAD;
  const roiPercent = (netAnnualGainCAD / platformCostCAD) * 100;
  const paybackMonths =
    platformCostCAD / ((netAnnualGainCAD + platformCostCAD) / 12);
  const revenuePerLead =
    (currentDealsPerYear * i.avgCommissionCAD) / i.totalLeads;
  const aiRevenuePerLead = (aiDealsPerYear * i.avgCommissionCAD) / i.totalLeads;

  return {
    currentDealsPerYear: Math.round(currentDealsPerYear),
    aiDealsPerYear: Math.round(aiDealsPerYear),
    additionalDeals: Math.round(additionalDeals),
    additionalRevenueCAD: Math.round(additionalRevenueCAD),
    verseSavingsCAD: Math.round(verseSavingsCAD),
    netAnnualGainCAD: Math.round(netAnnualGainCAD),
    roiPercent: Math.round(roiPercent),
    paybackMonths: Math.round(paybackMonths * 10) / 10,
    revenuePerLead: Math.round(revenuePerLead),
    aiRevenuePerLead: Math.round(aiRevenuePerLead),
  };
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-CA") + " CAD";
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <label style={{ fontSize: 14, color: "#333" }}>{label}</label>
        <strong style={{ color: RL_RED }}>{format(value)}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: RL_RED }}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? RL_RED : "white",
        color: highlight ? "white" : "#111",
        borderRadius: 10,
        padding: "18px 22px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

export default function ROICalculator() {
  const [inputs, setInputs] = useState<Inputs>({
    totalLeads: 80000,
    currentCloseRate: 1.5,
    avgCommissionCAD: 12000,
    currentResponseMinutes: 47,
    agentsCount: 50,
    verseMonthlyCAD: 8000,
    platformMonthlyCAD: 3500,
  });

  const r = calculate(inputs);

  function set(key: keyof Inputs) {
    return (v: number) => setInputs((prev) => ({ ...prev, [key]: v }));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      {/* Header */}
      <div style={{ background: RL_RED, color: "white", padding: "32px 40px" }}>
        <div
          style={{
            fontSize: 13,
            opacity: 0.85,
            marginBottom: 8,
            letterSpacing: 1,
          }}
        >
          ROYAL LEPAGE
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
          AI Lead Platform — ROI Calculator
        </h1>
        <p style={{ margin: "8px 0 0", opacity: 0.85, fontSize: 15 }}>
          See exactly how the platform pays for itself by converting more leads,
          faster.
        </p>
      </div>

      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "40px 24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
        }}
      >
        {/* Inputs */}
        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: 28,
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          <h2 style={{ margin: "0 0 24px", fontSize: 18, color: "#111" }}>
            Your Brokerage
          </h2>

          <Slider
            label="Total leads in database"
            value={inputs.totalLeads}
            min={10000}
            max={150000}
            step={5000}
            onChange={set("totalLeads")}
            format={(v) => v.toLocaleString()}
          />
          <Slider
            label="Current close rate"
            value={inputs.currentCloseRate}
            min={0.5}
            max={10}
            step={0.1}
            onChange={set("currentCloseRate")}
            format={(v) => v.toFixed(1) + "%"}
          />
          <Slider
            label="Avg commission per deal"
            value={inputs.avgCommissionCAD}
            min={5000}
            max={30000}
            step={500}
            onChange={set("avgCommissionCAD")}
            format={fmt}
          />
          <Slider
            label="Current avg response time"
            value={inputs.currentResponseMinutes}
            min={5}
            max={480}
            step={5}
            onChange={set("currentResponseMinutes")}
            format={(v) => (v >= 60 ? Math.round(v / 60) + "h" : v + " min")}
          />
          <Slider
            label="Verse.ai monthly cost"
            value={inputs.verseMonthlyCAD}
            min={0}
            max={20000}
            step={500}
            onChange={set("verseMonthlyCAD")}
            format={fmt}
          />
          <Slider
            label="New platform monthly cost"
            value={inputs.platformMonthlyCAD}
            min={1000}
            max={10000}
            step={250}
            onChange={set("platformMonthlyCAD")}
            format={fmt}
          />
        </div>

        {/* Results */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111" }}>
            Projected Impact
          </h2>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <MetricCard
              label="Deals today / year"
              value={r.currentDealsPerYear.toLocaleString()}
              sub={`${inputs.currentCloseRate}% close rate`}
            />
            <MetricCard
              label="Deals with AI / year"
              value={r.aiDealsPerYear.toLocaleString()}
              sub={`+40% close rate boost`}
              highlight
            />
            <MetricCard
              label="Additional deals"
              value={"+" + r.additionalDeals.toLocaleString()}
              sub="per year"
            />
            <MetricCard
              label="Additional revenue"
              value={fmt(r.additionalRevenueCAD)}
              sub="from improved close rate"
            />
            <MetricCard
              label="Verse.ai savings"
              value={fmt(r.verseSavingsCAD)}
              sub="eliminated annually"
            />
            <MetricCard
              label="Net annual gain"
              value={fmt(r.netAnnualGainCAD)}
              sub="after platform cost"
              highlight
            />
          </div>

          {/* Summary bar */}
          <div
            style={{
              background: "white",
              borderRadius: 10,
              padding: "20px 22px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                textAlign: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: RL_RED }}>
                  {r.roiPercent}%
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>Annual ROI</div>
              </div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: RL_RED }}>
                  {r.paybackMonths}mo
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Payback period
                </div>
              </div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: RL_RED }}>
                  &lt;60s
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Response time (vs{" "}
                  {inputs.currentResponseMinutes >= 60
                    ? Math.round(inputs.currentResponseMinutes / 60) + "h"
                    : inputs.currentResponseMinutes + "min"}
                  )
                </div>
              </div>
            </div>
          </div>

          {/* Revenue per lead */}
          <div
            style={{
              background: "white",
              borderRadius: 10,
              padding: "16px 22px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              fontSize: 14,
              color: "#444",
            }}
          >
            <strong>Revenue per lead:</strong> {fmt(r.revenuePerLead)} today →{" "}
            <strong style={{ color: RL_RED }}>{fmt(r.aiRevenuePerLead)}</strong>{" "}
            with AI
          </div>

          <div style={{ fontSize: 12, color: "#999", lineHeight: 1.5 }}>
            * Close rate improvement based on Harvard Business Review research:
            leads contacted within 1 minute convert 7× more. AI platform
            responds in &lt;60 seconds, 24/7.
          </div>
        </div>
      </div>
    </div>
  );
}
