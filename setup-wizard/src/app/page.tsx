"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const RED = "#C8102E";
const GREEN = "#16a34a";
const LIGHT_GREEN = "#f0fdf4";
const LIGHT_RED = "#fef2f2";
const BORDER = "#e5e7eb";
const MUTED = "#6b7280";

interface Creds {
  ghlApiKey: string;
  ghlLocationId: string;
  anthropicApiKey: string;
  idxProvider: string;
  idxApiKey: string;
  idxApiSecret: string;
  orchestratorUrl: string;
  webhookSecret: string;
  elevenLabsApiKey: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}
interface SetupStep {
  label: string;
  result: string;
  ok: boolean;
}

const EMPTY: Creds = {
  ghlApiKey: "",
  ghlLocationId: "",
  anthropicApiKey: "",
  idxProvider: "crea_ddf",
  idxApiKey: "",
  idxApiSecret: "",
  orchestratorUrl: "",
  webhookSecret: "",
  elevenLabsApiKey: "",
};

// ── Primitives ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        borderRadius: "50%",
        display: "inline-block",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#374151",
          marginBottom: 5,
        }}
      >
        {label}
        {optional && (
          <span style={{ color: MUTED, fontWeight: 400 }}> (optional)</span>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: "100%",
          padding: "9px 12px",
          border: `1px solid ${BORDER}`,
          borderRadius: 7,
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
          background: "white",
          fontFamily: type === "password" ? "monospace" : "inherit",
        }}
      />
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  loading,
  variant = "primary",
  full,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost";
  full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: full ? "100%" : undefined,
        padding: "12px 28px",
        background:
          variant === "primary"
            ? disabled || loading
              ? "#d1d5db"
              : RED
            : "transparent",
        color: variant === "primary" ? "white" : disabled ? MUTED : RED,
        border:
          variant === "ghost" ? `2px solid ${disabled ? BORDER : RED}` : "none",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled || loading ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "opacity 0.15s",
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function StatusRow({
  ok,
  name,
  detail,
}: {
  ok: boolean;
  name: string;
  detail: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        borderRadius: 7,
        background: ok ? LIGHT_GREEN : LIGHT_RED,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          flexShrink: 0,
          background: ok ? GREEN : RED,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {ok ? "✓" : "✗"}
      </span>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
      <span style={{ fontSize: 12, color: MUTED, marginLeft: 4 }}>
        {detail}
      </span>
    </div>
  );
}

// ── Step pill bar ──────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  const labels = ["Connect", "Activate", "Import"];
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
      {labels.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              flex: i < 2 ? 1 : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 15,
                  background: done ? GREEN : active ? RED : "#e5e7eb",
                  color: done || active ? "white" : MUTED,
                  transition: "all 0.25s",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                style={{
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  fontWeight: active ? 700 : 400,
                  color: active ? RED : done ? GREEN : MUTED,
                }}
              >
                {label}
              </span>
            </div>
            {i < 2 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: "0 6px",
                  marginBottom: 20,
                  background: done ? GREEN : "#e5e7eb",
                  transition: "background 0.3s",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Connect ────────────────────────────────────────────────────────

function Step1({
  creds,
  setCreds,
  onNext,
}: {
  creds: Creds;
  setCreds: (c: Creds) => void;
  onNext: () => void;
}) {
  const [state, setState] = useState<"idle" | "checking" | "done">("idle");
  const [results, setResults] = useState<CheckResult[]>([]);

  const set = (k: keyof Creds) => (v: string) => setCreds({ ...creds, [k]: v });

  const ready = !!(
    creds.ghlApiKey &&
    creds.ghlLocationId &&
    creds.anthropicApiKey &&
    creds.idxApiKey &&
    creds.idxApiSecret &&
    creds.orchestratorUrl &&
    creds.webhookSecret
  );

  const allOk =
    results.length > 0 &&
    results.filter((r) => r.name !== "ElevenLabs").every((r) => r.ok);

  async function connect() {
    setState("checking");
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const data = (await res.json()) as { results: CheckResult[] };
    setResults(data.results);

    const ok = data.results
      .filter((r) => r.name !== "ElevenLabs")
      .every((r) => r.ok);
    if (ok) {
      // Persist credentials
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creds }),
      });
    }
    setState("done");
  }

  function downloadEnv() {
    const content = [
      `GHL_API_KEY=${creds.ghlApiKey}`,
      `GHL_LOCATION_ID=${creds.ghlLocationId}`,
      `ANTHROPIC_API_KEY=${creds.anthropicApiKey}`,
      `ANTHROPIC_MODEL=claude-opus-4-7`,
      `IDX_PROVIDER=${creds.idxProvider}`,
      `IDX_API_KEY=${creds.idxApiKey}`,
      `IDX_API_SECRET=${creds.idxApiSecret}`,
      `ORCHESTRATOR_URL=${creds.orchestratorUrl}`,
      `WEBHOOK_SECRET=${creds.webhookSecret}`,
      creds.elevenLabsApiKey
        ? `ELEVENLABS_API_KEY=${creds.elevenLabsApiKey}`
        : "",
      `REDIS_URL=redis://localhost:6379`,
      `QUEUE_SECRET=${creds.webhookSecret}`,
      `MONITORING_SECRET=${creds.webhookSecret}`,
      `AGENT_LANGUAGE=bilingual`,
    ]
      .filter(Boolean)
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = ".env";
    a.click();
  }

  return (
    <div>
      <h2
        style={{
          margin: "0 0 4px",
          fontSize: 22,
          fontWeight: 800,
          color: "#111",
        }}
      >
        Connect your accounts
      </h2>
      <p style={{ margin: "0 0 24px", color: MUTED, fontSize: 14 }}>
        Enter your API keys once — saved locally for future imports.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0 28px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: MUTED,
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            GoHighLevel
          </div>
          <Field
            label="API Key"
            value={creds.ghlApiKey}
            onChange={set("ghlApiKey")}
            type="password"
            placeholder="eyJhbGci..."
          />
          <Field
            label="Location ID"
            value={creds.ghlLocationId}
            onChange={set("ghlLocationId")}
            placeholder="abc123"
          />
          <Field
            label="Orchestrator URL"
            value={creds.orchestratorUrl}
            onChange={set("orchestratorUrl")}
            placeholder="https://your-app.railway.app"
          />
          <Field
            label="Webhook Secret"
            value={creds.webhookSecret}
            onChange={set("webhookSecret")}
            type="password"
            placeholder="random-32-char-string"
          />
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: MUTED,
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            AI & MLS
          </div>
          <Field
            label="Anthropic API Key"
            value={creds.anthropicApiKey}
            onChange={set("anthropicApiKey")}
            type="password"
            placeholder="sk-ant-..."
          />
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 5,
              }}
            >
              IDX Provider
            </div>
            <select
              value={creds.idxProvider}
              onChange={(e) =>
                setCreds({ ...creds, idxProvider: e.target.value })
              }
              style={{
                width: "100%",
                padding: "9px 12px",
                border: `1px solid ${BORDER}`,
                borderRadius: 7,
                fontSize: 14,
                background: "white",
              }}
            >
              <option value="crea_ddf">CREA DDF (Canada)</option>
              <option value="simplyrets">SimplyRETS (US)</option>
            </select>
          </div>
          <Field
            label="IDX API Key"
            value={creds.idxApiKey}
            onChange={set("idxApiKey")}
            type="password"
          />
          <Field
            label="IDX API Secret"
            value={creds.idxApiSecret}
            onChange={set("idxApiSecret")}
            type="password"
          />
          <Field
            label="ElevenLabs API Key"
            value={creds.elevenLabsApiKey}
            onChange={set("elevenLabsApiKey")}
            type="password"
            optional
            placeholder="Voice AI — optional"
          />
        </div>
      </div>

      {results.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 20,
          }}
        >
          {results.map((r) => (
            <StatusRow key={r.name} {...r} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Btn onClick={connect} loading={state === "checking"} disabled={!ready}>
          {state === "done" && !allOk ? "Retry Connection" : "Connect →"}
        </Btn>
        {allOk && (
          <>
            <Btn variant="ghost" onClick={downloadEnv}>
              ↓ Download .env
            </Btn>
            <Btn onClick={onNext}>Next: Activate GHL →</Btn>
          </>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Activate ───────────────────────────────────────────────────────

function Step2({
  creds,
  alreadyDone,
  onNext,
}: {
  creds: Creds;
  alreadyDone: boolean;
  onNext: () => void;
}) {
  const [state, setState] = useState<"idle" | "running" | "done">(
    alreadyDone ? "done" : "idle",
  );
  const [steps, setSteps] = useState<SetupStep[]>([]);

  // Auto-advance if already configured
  useEffect(() => {
    if (alreadyDone) {
      const t = setTimeout(onNext, 800);
      return () => clearTimeout(t);
    }
  }, [alreadyDone, onNext]);

  async function activate() {
    setState("running");
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const data = (await res.json()) as { ok: boolean; steps: SetupStep[] };
    setSteps(data.steps);

    if (data.ok) {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ghlConfigured: true }),
      });
    }
    setState("done");
  }

  const allOk = steps.every((s) => s.ok);

  if (alreadyDone && state !== "done") {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <Spinner />
        <p style={{ color: MUTED, marginTop: 12 }}>
          GoHighLevel already configured — skipping…
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{
          margin: "0 0 4px",
          fontSize: 22,
          fontWeight: 800,
          color: "#111",
        }}
      >
        Activate GoHighLevel
      </h2>
      <p style={{ margin: "0 0 24px", color: MUTED, fontSize: 14 }}>
        One click creates your pipeline, webhooks, custom fields, and campaigns.
        Safe to re-run.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {[
          {
            icon: "📋",
            label: "Custom Fields",
            desc: "homie_score · LPMAMA · IDX tracking",
          },
          {
            icon: "🔀",
            label: "Pipeline",
            desc: "New → Attempted → Contacted → Qualified → Booked → Closed",
          },
          {
            icon: "🔗",
            label: "Webhooks",
            desc: "ContactCreate + InboundMessage → orchestrator",
          },
          {
            icon: "📢",
            label: "Campaigns",
            desc: "7-Day Drip · Reactivation · Reminders · Nurture",
          },
        ].map((item) => {
          const done = steps.find((s) => s.label === item.label);
          return (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "13px 16px",
                borderRadius: 8,
                border: `1px solid ${done ? (done.ok ? "#bbf7d0" : "#fecaca") : BORDER}`,
                background: done
                  ? done.ok
                    ? LIGHT_GREEN
                    : LIGHT_RED
                  : "#fafafa",
                transition: "all 0.3s",
              }}
            >
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {done ? done.result : item.desc}
                </div>
              </div>
              {state === "running" && !done && <Spinner />}
              {done && (
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: done.ok ? GREEN : RED,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {done.ok ? "✓" : "✗"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {state !== "done" && (
          <Btn onClick={activate} loading={state === "running"} full>
            Activate GoHighLevel →
          </Btn>
        )}
        {state === "done" && !allOk && (
          <Btn onClick={activate} variant="ghost">
            Retry
          </Btn>
        )}
        {state === "done" && allOk && (
          <Btn onClick={onNext} full>
            Next: Import Leads →
          </Btn>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Import ─────────────────────────────────────────────────────────

function Step3({ creds }: { creds: Creds }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<string[][]>([]);
  const [state, setState] = useState<"idle" | "importing" | "done">("idle");
  const [prog, setProg] = useState({ total: 0, done: 0, errors: 0, log: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsv(text);
      const lines = text.trim().split("\n").slice(0, 6);
      setPreview(
        lines.map((l) =>
          l.split(",").map((c) => c.replace(/^"|"$/g, "").trim()),
        ),
      );
    };
    reader.readAsText(file);
  }, []);

  async function startImport() {
    setState("importing");
    await fetch("/api/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creds, csv }),
    });

    const es = new EventSource("/api/progress");
    es.onmessage = (e) => {
      const d = JSON.parse(e.data) as {
        total: number;
        done: number;
        errors: number;
        newLogs: string[];
        finished?: boolean;
        running: boolean;
      };
      setProg((p) => ({
        total: d.total,
        done: d.done,
        errors: d.errors,
        log: d.newLogs.at(-1) ?? p.log,
      }));
      if (d.finished || !d.running) {
        es.close();
        setState("done");
      }
    };
  }

  const total = csv ? csv.trim().split("\n").length - 1 : 0;
  const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

  if (state === "done") {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800 }}>
          Platform is live!
        </h2>
        <p style={{ color: MUTED, margin: "0 0 4px" }}>
          <strong>{prog.done.toLocaleString()}</strong> leads imported
          {prog.errors > 0 && ` · ${prog.errors} skipped (no phone/email)`}
        </p>
        <p style={{ color: MUTED, fontSize: 13, margin: "0 0 28px" }}>
          The AI agent is now responding to leads in real time.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="https://app.gohighlevel.com"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "11px 22px",
              background: RED,
              color: "white",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Open GoHighLevel →
          </a>
          <a
            href={creds.orchestratorUrl + "/health"}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "11px 22px",
              border: `2px solid ${BORDER}`,
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              color: "#374151",
            }}
          >
            Check AI Agent →
          </a>
          <button
            onClick={() => {
              setCsv("");
              setPreview([]);
              setState("idle");
              setProg({ total: 0, done: 0, errors: 0, log: "" });
            }}
            style={{
              padding: "11px 22px",
              border: `2px solid ${BORDER}`,
              borderRadius: 8,
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              color: MUTED,
            }}
          >
            Import Another CSV
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{
          margin: "0 0 4px",
          fontSize: 22,
          fontWeight: 800,
          color: "#111",
        }}
      >
        Import Leads
      </h2>
      <p style={{ margin: "0 0 24px", color: MUTED, fontSize: 14 }}>
        Drop your lead database CSV. Up to 100,000 contacts. Needs at least:{" "}
        <code
          style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}
        >
          firstName, lastName, email, phone
        </code>
      </p>

      {!csv ? (
        <div
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${BORDER}`,
            borderRadius: 12,
            padding: "52px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: "#fafafa",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = RED)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#374151",
              marginBottom: 4,
            }}
          >
            Drop CSV here or click to browse
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>CSV · up to 50 MB</div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) loadFile(e.target.files[0]);
            }}
          />
        </div>
      ) : (
        <>
          <div
            style={{
              overflowX: "auto",
              marginBottom: 20,
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {preview[0]?.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "8px 14px",
                        textAlign: "left",
                        borderBottom: `1px solid ${BORDER}`,
                        color: MUTED,
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(1).map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        style={{ padding: "8px 14px", color: "#374151" }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
            Showing first 5 rows · <strong>{total.toLocaleString()}</strong>{" "}
            total contacts
          </div>

          {state === "importing" && (
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                <span style={{ color: MUTED }}>Importing…</span>
                <span style={{ fontWeight: 700 }}>
                  {prog.done.toLocaleString()} / {prog.total.toLocaleString()} (
                  {pct}%)
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  background: "#e5e7eb",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: RED,
                    borderRadius: 4,
                    transition: "width 0.5s",
                  }}
                />
              </div>
              {prog.log && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                  {prog.log}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            {state === "idle" && (
              <Btn
                variant="ghost"
                onClick={() => {
                  setCsv("");
                  setPreview([]);
                }}
                disabled={state !== "idle"}
              >
                Change file
              </Btn>
            )}
            <Btn
              onClick={startImport}
              loading={state === "importing"}
              disabled={state === "importing"}
            >
              Import {total.toLocaleString()} Leads →
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ── Root wizard ────────────────────────────────────────────────────────────

export default function Wizard() {
  const [step, setStep] = useState(0);
  const [creds, setCreds] = useState<Creds>(EMPTY);
  const [ghlAlreadyDone, setGhlAlreadyDone] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load saved config on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/config");
        const data = (await res.json()) as {
          exists: boolean;
          creds?: Record<string, string>;
          ghlConfigured?: boolean;
        };

        if (data.exists && data.creds) {
          setCreds(data.creds as unknown as Creds);

          if (data.ghlConfigured) {
            setGhlAlreadyDone(true);
            setStep(2); // skip straight to import
          } else {
            setStep(1); // skip credentials, go to activation
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
        }}
      >
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>

      {/* Header */}
      <div
        style={{
          background: RED,
          padding: "16px 40px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "white",
            opacity: 0.85,
          }}
        />
        <span
          style={{
            color: "white",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: 0.3,
          }}
        >
          ROYAL LEPAGE — Platform Setup
        </span>
        {step === 2 && (
          <button
            onClick={() => setStep(0)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.4)",
              color: "white",
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ← Reconfigure
          </button>
        )}
      </div>

      <div
        style={{ maxWidth: 780, margin: "40px auto", padding: "0 24px 80px" }}
      >
        <StepBar step={step} />

        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: `1px solid ${BORDER}`,
            padding: "32px 36px",
          }}
        >
          {step === 0 && (
            <Step1
              creds={creds}
              setCreds={setCreds}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <Step2
              creds={creds}
              alreadyDone={ghlAlreadyDone}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && <Step3 creds={creds} />}
        </div>
      </div>
    </>
  );
}
