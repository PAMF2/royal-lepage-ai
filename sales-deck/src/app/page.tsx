"use client";
import { useState } from "react";

const RED = "#C8102E";
const DARK = "#0a0a0a";
const CARD = "#141414";
const BORDER = "#2a2a2a";
const MUTED = "#888";

const slides = [
  {
    id: 1,
    tag: "THE PROBLEM",
    title: "Verse.ai is a black box you don't own.",
    bullets: [
      "~$8,000–$15,000/month for a platform you can't customize",
      "No MLS awareness — AI can't answer listing questions",
      "No voice AI, no admin automation, no brokerage workflows",
      "You rent access to your own leads",
      "Zero visibility into what the AI actually says",
    ],
    accent: RED,
  },
  {
    id: 2,
    tag: "THE OPPORTUNITY",
    title: "80,000+ leads. Most of them are dormant.",
    bullets: [
      "Industry avg: only 2–3% of leads ever convert",
      "Top reason: slow follow-up (avg response time 47 minutes)",
      "Harvard study: leads contacted in <1 min convert 7× more",
      "Reactivation of cold leads = highest ROI activity in real estate",
      "Your existing database is worth millions — untapped",
    ],
    accent: "#f59e0b",
  },
  {
    id: 3,
    tag: "THE SOLUTION",
    title: "A complete AI operating layer. Built for Royal LePage.",
    bullets: [
      "Responds to every lead in under 60 seconds — 24/7",
      "Knows your MLS listings in real time via IDX",
      "Qualifies, nurtures, and books — without human ISAs",
      "Full brokerage workflow automation (offers, CMAs, showings)",
      "You own the data, the CRM, and the AI",
    ],
    accent: "#22c55e",
  },
  {
    id: 4,
    tag: "ARCHITECTURE",
    title: "Four layers. One seamless stack.",
    isArch: true,
    layers: [
      {
        label: "CRM & MESSAGING",
        tech: "GoHighLevel",
        detail: "100k leads · SMS/email · pipelines · campaigns",
        color: "#3b82f6",
      },
      {
        label: "AI ORCHESTRATION",
        tech: "OpenClaw",
        detail: "Claude agent loop · tool use · LPMAMA qualification",
        color: RED,
      },
      {
        label: "DATA LAYER",
        tech: "IDX / MLS (CREA DDF)",
        detail: "Live listings · comparables · price drops · new inventory",
        color: "#8b5cf6",
      },
      {
        label: "VOICE AI (OPTIONAL)",
        tech: "ElevenLabs",
        detail: "Outbound calls · missed call follow-up · inbound routing",
        color: "#f59e0b",
      },
    ],
  },
  {
    id: 5,
    tag: "CORE CAPABILITY 1",
    title: "AI that responds before your competitor does.",
    bullets: [
      "Lead submits form → AI texts back in <60 seconds",
      "Handles 100,000 concurrent conversations",
      "Qualifies: budget · timeline · location · financing",
      "Suggests matching listings pulled live from MLS",
      "Books the appointment directly into agent's calendar",
    ],
    stat: {
      value: "7×",
      label: "higher conversion when responded to in under 1 minute",
    },
  },
  {
    id: 6,
    tag: "CORE CAPABILITY 2",
    title: "Listing-aware AI. Like a knowledgeable agent, not a bot.",
    bullets: [
      "AI retrieves live MLS data mid-conversation",
      "Answers specific questions about any listing",
      "Suggests comparables and nearby homes",
      "Surfaces new listings matching past behavior",
      "Tracks: saved listings · viewed properties · search filters",
    ],
    stat: {
      value: "IDX",
      label: "connected — CREA DDF or SimplyRETS, board-approved",
    },
  },
  {
    id: 7,
    tag: "CORE CAPABILITY 3",
    title: "Reactivation engine. Your dormant leads are a goldmine.",
    bullets: [
      "Automatically identifies leads 6–36 months cold",
      "Triggers on: new listings · price drops · market shifts",
      "Personalized message generated per lead using Claude",
      "Runs continuously — zero manual effort",
      "Converts leads that would otherwise never surface",
    ],
    stat: { value: "36mo", label: "of dormant leads re-engaged automatically" },
  },
  {
    id: 8,
    tag: "CORE CAPABILITY 4",
    title: "Homie — your agents' AI operating system.",
    bullets: [
      "Draft offers with one prompt",
      "Generate CMAs from live comparables",
      "Create listing presentations in seconds",
      "Write flyer copy, brochures, social posts",
      "Book and manage showings via ShowingTime or GHL",
    ],
    stat: {
      value: "6 tools",
      label: "replacing hours of admin work per transaction",
    },
  },
  {
    id: 9,
    tag: "VS VERSE.AI",
    title: "Everything Verse does. Plus everything it can't.",
    isTable: true,
    rows: [
      ["Feature", "Verse.ai", "This Platform"],
      ["SMS lead response", "✓", "✓"],
      ["MLS-aware AI", "✗", "✓"],
      ["Voice AI", "Limited", "✓ (ElevenLabs)"],
      ["Lead reactivation", "Basic", "✓ Full engine"],
      ["CRM ownership", "External", "✓ You own it"],
      ["Admin automation", "✗", "✓ Homie"],
      ["Customizable workflows", "Limited", "✓ Fully custom"],
      ["Data control", "Limited", "✓ Full control"],
      ["Monthly cost", "$8–15k", "Est. $3–4k"],
    ],
  },
  {
    id: 10,
    tag: "TIMELINE",
    title: "Live in 6–9 weeks.",
    isPhases: true,
    phases: [
      {
        num: "01",
        name: "Core System",
        weeks: "Weeks 1–3",
        items: [
          "GHL CRM setup",
          "Lead import (100k)",
          "SMS AI agent",
          "IDX integration",
          "Appointment booking",
        ],
        color: "#3b82f6",
      },
      {
        num: "02",
        name: "Enhancement",
        weeks: "Weeks 4–6",
        items: [
          "Advanced IDX intelligence",
          "Reactivation engine",
          "Campaign automation",
          "Reporting dashboard",
          "Lead scoring",
        ],
        color: "#8b5cf6",
      },
      {
        num: "03",
        name: "Advanced AI",
        weeks: "Weeks 7–9",
        items: [
          "Voice AI (ElevenLabs)",
          "Homie full deployment",
          "Vendor coordination",
          "Deal analysis tools",
          "Scale & monitoring",
        ],
        color: RED,
      },
    ],
  },
  {
    id: 11,
    tag: "INVESTMENT",
    title: "A platform that pays for itself in week one.",
    isROI: true,
    rows: [
      { label: "Implementation (one-time)", value: "Custom quote" },
      { label: "Platform monthly", value: "~$3,000–4,500 CAD" },
      { label: "Verse.ai you eliminate", value: "$8,000–15,000/mo" },
      { label: "Net monthly savings", value: "$4,500–10,500/mo" },
      {
        label: "Additional deals from reactivation",
        value: "Tracked + reported",
      },
      { label: "API costs (SMS, voice)", value: "Billed direct to client" },
    ],
    note: "Every 1 additional deal closed per month = $10,000–$15,000 CAD in commissions.",
  },
  {
    id: 12,
    tag: "NEXT STEPS",
    title: "Three things to get started.",
    isNext: true,
    steps: [
      {
        n: "1",
        title: "Sign IDX Agreement",
        body: "Authorize platform as a Back-End (BA) provider with your MLS board. Required to enable live listing data in AI conversations.",
        color: "#3b82f6",
      },
      {
        n: "2",
        title: "Export Lead Database",
        body: "Provide CSV export of all leads. We handle migration, deduplication, tagging, and segmentation into GHL.",
        color: "#8b5cf6",
      },
      {
        n: "3",
        title: "Kick Off Phase 1",
        body: "GHL setup + AI agent deployed within 2 weeks of access. First automated conversations running the same week.",
        color: RED,
      },
    ],
  },
];

function Slide({
  slide,
  active,
}: {
  slide: (typeof slides)[0];
  active: boolean;
}) {
  if (!active) return null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 80px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Slide number */}
      <div
        style={{
          position: "absolute",
          top: 32,
          right: 40,
          color: BORDER,
          fontSize: 13,
          letterSpacing: 2,
        }}
      >
        {String(slide.id).padStart(2, "0")} /{" "}
        {String(slides.length).padStart(2, "0")}
      </div>

      {/* Red accent line */}
      <div
        style={{
          width: 48,
          height: 3,
          background: slide.accent ?? RED,
          marginBottom: 20,
          borderRadius: 2,
        }}
      />

      {/* Tag */}
      <div
        style={{
          fontSize: 11,
          letterSpacing: 3,
          color: slide.accent ?? RED,
          marginBottom: 14,
          fontWeight: 600,
        }}
      >
        {slide.tag}
      </div>

      {/* Title */}
      <h1
        style={{
          margin: "0 0 40px",
          fontSize: 36,
          fontWeight: 800,
          color: "white",
          lineHeight: 1.2,
          maxWidth: 700,
        }}
      >
        {slide.title}
      </h1>

      {/* Bullets */}
      {"bullets" in slide && slide.bullets && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {slide.bullets.map((b, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                color: "#ccc",
                fontSize: 17,
              }}
            >
              <span
                style={{
                  color: slide.accent ?? RED,
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                →
              </span>
              {b}
            </li>
          ))}
        </ul>
      )}

      {/* Stat callout */}
      {"stat" in slide && slide.stat && (
        <div
          style={{
            marginTop: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 20,
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: "16px 28px",
            alignSelf: "flex-start",
          }}
        >
          <span style={{ fontSize: 40, fontWeight: 900, color: RED }}>
            {slide.stat.value}
          </span>
          <span style={{ fontSize: 14, color: MUTED, maxWidth: 240 }}>
            {slide.stat.label}
          </span>
        </div>
      )}

      {/* Architecture layers */}
      {"isArch" in slide &&
        slide.isArch &&
        "layers" in slide &&
        slide.layers && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxWidth: 680,
            }}
          >
            {slide.layers.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  borderLeft: `3px solid ${l.color}`,
                  borderRadius: 8,
                  padding: "14px 20px",
                }}
              >
                <div style={{ minWidth: 170 }}>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: MUTED,
                      marginBottom: 3,
                    }}
                  >
                    {l.label}
                  </div>
                  <div
                    style={{ fontSize: 16, fontWeight: 700, color: "white" }}
                  >
                    {l.tech}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#aaa" }}>{l.detail}</div>
              </div>
            ))}
          </div>
        )}

      {/* Comparison table */}
      {"isTable" in slide && slide.isTable && "rows" in slide && slide.rows && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ borderCollapse: "collapse", width: "100%", maxWidth: 700 }}
          >
            <tbody>
              {slide.rows.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    background:
                      i === 0
                        ? "transparent"
                        : i % 2 === 0
                          ? CARD
                          : "transparent",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        padding: "10px 16px",
                        fontSize: i === 0 ? 11 : 14,
                        fontWeight: i === 0 ? 700 : j === 0 ? 600 : 400,
                        color:
                          i === 0
                            ? MUTED
                            : j === 2
                              ? "#22c55e"
                              : j === 1 && cell === "✗"
                                ? "#ef4444"
                                : "#ccc",
                        letterSpacing: i === 0 ? 1 : 0,
                        textTransform: i === 0 ? "uppercase" : "none",
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phases */}
      {"isPhases" in slide &&
        slide.isPhases &&
        "phases" in slide &&
        slide.phases && (
          <div style={{ display: "flex", gap: 20 }}>
            {slide.phases.map((p, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  borderTop: `3px solid ${p.color}`,
                  borderRadius: 8,
                  padding: "20px 22px",
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    color: p.color,
                    marginBottom: 4,
                  }}
                >
                  {p.num}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "white",
                    marginBottom: 2,
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 16 }}>
                  {p.weeks}
                </div>
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {p.items.map((item, j) => (
                    <li
                      key={j}
                      style={{
                        fontSize: 13,
                        color: "#aaa",
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <span style={{ color: p.color }}>·</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

      {/* ROI table */}
      {"isROI" in slide && slide.isROI && "rows" in slide && slide.rows && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxWidth: 560,
          }}
        >
          {slide.rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: i % 2 === 0 ? CARD : "transparent",
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 14, color: "#aaa" }}>
                {"label" in row ? row.label : ""}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "white" }}>
                {"value" in row ? row.value : ""}
              </span>
            </div>
          ))}
          {"note" in slide && slide.note && (
            <div
              style={{
                marginTop: 20,
                padding: "14px 18px",
                background: `${RED}15`,
                border: `1px solid ${RED}40`,
                borderRadius: 8,
                fontSize: 13,
                color: "#ffb3b3",
              }}
            >
              {slide.note}
            </div>
          )}
        </div>
      )}

      {/* Next steps */}
      {"isNext" in slide && slide.isNext && "steps" in slide && slide.steps && (
        <div style={{ display: "flex", gap: 20 }}>
          {slide.steps.map((s, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: "24px 22px",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: s.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 16,
                  color: "white",
                  marginBottom: 16,
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "white",
                  marginBottom: 10,
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SalesDeck() {
  const [current, setCurrent] = useState(0);

  const prev = () => setCurrent((c) => Math.max(0, c - 1));
  const next = () => setCurrent((c) => Math.min(slides.length - 1, c + 1));

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: DARK,
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
      }}
      tabIndex={0}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 40px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: RED,
            }}
          />
          <span style={{ color: "#aaa", fontSize: 13, letterSpacing: 1 }}>
            ROYAL LEPAGE — AI LEAD PLATFORM
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                width: i === current ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === current ? RED : BORDER,
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>
      </div>

      {/* Slide area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {slides.map((s, i) => (
          <div
            key={s.id}
            style={{
              position: "absolute",
              inset: 0,
              opacity: i === current ? 1 : 0,
              pointerEvents: i === current ? "auto" : "none",
              transition: "opacity 0.3s",
            }}
          >
            <Slide slide={s} active={i === current} />
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 40px",
          borderTop: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <span style={{ color: MUTED, fontSize: 12 }}>
          ← → to navigate · Click dots to jump
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={prev}
            disabled={current === 0}
            style={{
              padding: "8px 20px",
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: current === 0 ? BORDER : "#ccc",
              borderRadius: 6,
              cursor: current === 0 ? "default" : "pointer",
              fontSize: 13,
            }}
          >
            ← Prev
          </button>
          <button
            onClick={next}
            disabled={current === slides.length - 1}
            style={{
              padding: "8px 20px",
              background: current === slides.length - 1 ? BORDER : RED,
              border: "none",
              color: "white",
              borderRadius: 6,
              cursor: current === slides.length - 1 ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
