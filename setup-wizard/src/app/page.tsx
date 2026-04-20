"use client";
import { useState, useRef, useCallback } from "react";

const RED = "#C8102E";
const LIGHT_RED = "#fef2f2";
const GREEN = "#16a34a";
const LIGHT_GREEN = "#f0fdf4";
const BORDER = "#e5e7eb";
const MUTED = "#6b7280";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Small components ───────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "#374151",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Input({
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
    <div style={{ marginBottom: 16 }}>
      <Label>
        {label}
        {optional && (
          <span style={{ color: MUTED, fontWeight: 400, marginLeft: 6 }}>
            (optional)
          </span>
        )}
      </Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
          fontFamily: type === "password" ? "monospace" : "inherit",
          background: "white",
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
  small,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "outline";
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: small ? "8px 18px" : "12px 28px",
        background:
          variant === "primary"
            ? disabled || loading
              ? "#d1d5db"
              : RED
            : "white",
        color: variant === "primary" ? "white" : disabled ? MUTED : RED,
        border:
          variant === "outline"
            ? `2px solid ${disabled ? BORDER : RED}`
            : "none",
        borderRadius: 8,
        fontSize: small ? 13 : 15,
        fontWeight: 600,
        cursor: disabled || loading ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        transition: "opacity 0.15s",
      }}
    >
      {loading && (
        <span
          style={{
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 0.7s linear infinite",
          }}
        />
      )}
      {children}
    </button>
  );
}

function Badge({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: ok ? LIGHT_GREEN : LIGHT_RED,
        color: ok ? GREEN : RED,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {ok ? "✓" : "✗"}
    </span>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        padding: "28px 32px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────

function Steps({ current }: { current: number }) {
  const labels = ["Credentials", "GHL Setup", "Import Leads"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        marginBottom: 32,
      }}
    >
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
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
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  background: done ? GREEN : active ? RED : "#e5e7eb",
                  color: done || active ? "white" : MUTED,
                  transition: "all 0.2s",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  color: active ? RED : done ? GREEN : MUTED,
                  whiteSpace: "nowrap",
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
                  margin: "0 8px",
                  marginBottom: 22,
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

// ── Step 1: Credentials ────────────────────────────────────────────────────

function Step1({
  creds,
  setCreds,
  onNext,
}: {
  creds: Creds;
  setCreds: (c: Creds) => void;
  onNext: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<CheckResult[] | null>(null);

  const set = (key: keyof Creds) => (v: string) =>
    setCreds({ ...creds, [key]: v });

  async function verify() {
    setChecking(true);
    setResults(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const data = (await res.json()) as {
        ok: boolean;
        results: CheckResult[];
      };
      setResults(data.results);
    } catch (e) {
      setResults([{ name: "Network", ok: false, detail: String(e) }]);
    } finally {
      setChecking(false);
    }
  }

  const requiredFilled =
    creds.ghlApiKey &&
    creds.ghlLocationId &&
    creds.anthropicApiKey &&
    creds.idxApiKey &&
    creds.idxApiSecret &&
    creds.orchestratorUrl &&
    creds.webhookSecret;

  const allOk =
    results?.filter((r) => r.name !== "ElevenLabs").every((r) => r.ok) ?? false;

  return (
    <Card>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#111" }}>
        API Credentials
      </h2>
      <p style={{ margin: "0 0 24px", color: MUTED, fontSize: 14 }}>
        Enter your API keys. Nothing is stored — credentials are used only
        during setup.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0 24px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: MUTED,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            GoHighLevel
          </div>
          <Input
            label="GHL API Key"
            value={creds.ghlApiKey}
            onChange={set("ghlApiKey")}
            type="password"
            placeholder="eyJhbGci..."
          />
          <Input
            label="GHL Location ID"
            value={creds.ghlLocationId}
            onChange={set("ghlLocationId")}
            placeholder="abc123xyz"
          />
          <Input
            label="Orchestrator URL"
            value={creds.orchestratorUrl}
            onChange={set("orchestratorUrl")}
            placeholder="https://your-app.railway.app"
          />
          <Input
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
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            AI & Data
          </div>
          <Input
            label="Anthropic API Key"
            value={creds.anthropicApiKey}
            onChange={set("anthropicApiKey")}
            type="password"
            placeholder="sk-ant-..."
          />
          <div style={{ marginBottom: 16 }}>
            <Label>IDX Provider</Label>
            <select
              value={creds.idxProvider}
              onChange={(e) =>
                setCreds({ ...creds, idxProvider: e.target.value })
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                fontSize: 14,
                background: "white",
              }}
            >
              <option value="crea_ddf">CREA DDF (Canada)</option>
              <option value="simplyrets">SimplyRETS (US)</option>
            </select>
          </div>
          <Input
            label="IDX API Key"
            value={creds.idxApiKey}
            onChange={set("idxApiKey")}
            type="password"
          />
          <Input
            label="IDX API Secret"
            value={creds.idxApiSecret}
            onChange={set("idxApiSecret")}
            type="password"
          />
          <Input
            label="ElevenLabs API Key"
            value={creds.elevenLabsApiKey}
            onChange={set("elevenLabsApiKey")}
            type="password"
            optional
            placeholder="Voice AI — optional"
          />
        </div>
      </div>

      {results && (
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {results.map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 8,
                background: r.ok ? LIGHT_GREEN : LIGHT_RED,
              }}
            >
              <Badge ok={r.ok} />
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                <span style={{ fontSize: 13, color: MUTED, marginLeft: 10 }}>
                  {r.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <Btn
          onClick={verify}
          loading={checking}
          disabled={!requiredFilled}
          variant="outline"
        >
          Test Connections
        </Btn>
        {allOk && <Btn onClick={onNext}>Continue →</Btn>}
      </div>
    </Card>
  );
}

// ── Step 2: GHL Setup ──────────────────────────────────────────────────────

function Step2({ creds, onNext }: { creds: Creds; onNext: () => void }) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<SetupStep[] | null>(null);

  async function runSetup() {
    setRunning(true);
    setSteps(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const data = (await res.json()) as { ok: boolean; steps: SetupStep[] };
      setSteps(data.steps);
    } catch (e) {
      setSteps([{ label: "Error", result: String(e), ok: false }]);
    } finally {
      setRunning(false);
    }
  }

  const allOk = steps?.every((s) => s.ok) ?? false;

  return (
    <Card>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#111" }}>
        Configure GoHighLevel
      </h2>
      <p style={{ margin: "0 0 24px", color: MUTED, fontSize: 14 }}>
        One click creates everything in your GHL account. Safe to re-run — skips
        what already exists.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          {
            icon: "📋",
            label: "Custom Fields",
            desc: "homie_score, 6 LPMAMA fields, IDX tracking",
          },
          {
            icon: "🔀",
            label: "Pipeline",
            desc: "New Lead → Attempted → Contacted → Qualified → Booked → Closed",
          },
          {
            icon: "🔗",
            label: "Webhooks",
            desc: "ContactCreate + InboundMessage → your orchestrator",
          },
          {
            icon: "📢",
            label: "Campaigns",
            desc: "7-Day Drip, Reactivation, Appointment Reminder, Post-Showing, Nurture",
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 16px",
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              background: "#fafafa",
            }}
          >
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: MUTED }}>{item.desc}</div>
            </div>
            {steps && (
              <div style={{ marginLeft: "auto" }}>
                <Badge
                  ok={steps.find((s) => s.label === item.label)?.ok ?? false}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {steps && (
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {steps.map((s) => (
            <div
              key={s.label}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                background: s.ok ? LIGHT_GREEN : LIGHT_RED,
                fontSize: 13,
                color: s.ok ? GREEN : RED,
              }}
            >
              <strong>{s.label}:</strong> {s.result}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <Btn
          onClick={runSetup}
          loading={running}
          variant={steps ? "outline" : "primary"}
        >
          {steps ? "Re-run Setup" : "Configure GoHighLevel"}
        </Btn>
        {allOk && <Btn onClick={onNext}>Continue →</Btn>}
      </div>
    </Card>
  );
}

// ── Step 3: Import Leads ───────────────────────────────────────────────────

function Step3({ creds }: { creds: Creds }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({
    total: 0,
    done: 0,
    errors: 0,
    logs: [] as string[],
  });
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  async function startImport() {
    setImporting(true);
    setProgress({ total: 0, done: 0, errors: 0, logs: [] });

    await fetch("/api/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creds, csv }),
    });

    // Stream progress via SSE
    const es = new EventSource("/api/progress");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as {
        total: number;
        done: number;
        errors: number;
        running: boolean;
        newLogs: string[];
        finished?: boolean;
      };
      setProgress((p) => ({
        total: data.total,
        done: data.done,
        errors: data.errors,
        logs: [...p.logs, ...data.newLogs],
      }));
      if (data.finished || !data.running) {
        es.close();
        setImporting(false);
        setDone(true);
      }
    };
  }

  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (done) {
    return (
      <Card style={{ textAlign: "center", padding: "48px 32px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#111" }}>
          Platform is live!
        </h2>
        <p style={{ color: MUTED, margin: "0 0 8px" }}>
          {progress.done.toLocaleString()} leads imported · {progress.errors}{" "}
          skipped
        </p>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 32px" }}>
          GHL is configured. The AI agent is listening for new leads and
          incoming messages.
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
              padding: "10px 20px",
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
              padding: "10px 20px",
              border: `2px solid ${BORDER}`,
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              color: "#374151",
            }}
          >
            Check Orchestrator →
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#111" }}>
        Import Leads
      </h2>
      <p style={{ margin: "0 0 24px", color: MUTED, fontSize: 14 }}>
        Upload your lead database CSV. Supports up to 100,000 contacts. Required
        columns: <code>firstName, lastName, email, phone</code>
      </p>

      {!csv ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${BORDER}`,
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: "#fafafa",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = RED)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4 }}>
            Drop your CSV here or click to browse
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>CSV files up to 50MB</div>
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
          {preview && (
            <div style={{ overflowX: "auto", marginBottom: 20 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    {preview[0].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          background: "#f9fafb",
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
                          style={{ padding: "8px 12px", color: "#374151" }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                Showing first 5 rows · {csv.trim().split("\n").length - 1} total
                contacts
              </div>
            </div>
          )}

          {importing && (
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
                <span style={{ fontWeight: 600 }}>
                  {progress.done.toLocaleString()} /{" "}
                  {progress.total.toLocaleString()} ({pct}%)
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
              {progress.logs.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>
                  {progress.logs[progress.logs.length - 1]}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <Btn
              onClick={() => {
                setCsv("");
                setPreview(null);
              }}
              variant="outline"
              small
              disabled={importing}
            >
              Change file
            </Btn>
            <Btn onClick={startImport} loading={importing} disabled={importing}>
              Import {(csv.trim().split("\n").length - 1).toLocaleString()}{" "}
              Leads
            </Btn>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────

const DEFAULT_CREDS: Creds = {
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

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const [creds, setCreds] = useState<Creds>(DEFAULT_CREDS);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div
        style={{
          background: RED,
          padding: "18px 40px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "white",
            opacity: 0.8,
          }}
        />
        <span
          style={{
            color: "white",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: 0.5,
          }}
        >
          ROYAL LEPAGE — AI Platform Setup
        </span>
      </div>

      <div
        style={{ maxWidth: 820, margin: "40px auto", padding: "0 24px 60px" }}
      >
        <Steps current={step} />

        {step === 0 && (
          <Step1 creds={creds} setCreds={setCreds} onNext={() => setStep(1)} />
        )}
        {step === 1 && <Step2 creds={creds} onNext={() => setStep(2)} />}
        {step === 2 && <Step3 creds={creds} />}
      </div>
    </>
  );
}
