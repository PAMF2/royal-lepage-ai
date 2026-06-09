/**
 * templates.ts — load + render campaign-templates/ files for drip dispatch.
 *
 * The queue/ workers post a `templateId` to /internal/send (no message body).
 * This loader resolves that templateId against a file in campaign-templates/
 * and performs {{var}} substitution against the contact payload.
 *
 * Convention:
 *   templateId  "nurture-7day:day0"
 *   kind        "sms"
 *   path        campaign-templates/nurture-7day/day0.sms.txt
 *
 *   templateId  "nurture-monthly:default"
 *   kind        "email"
 *   body path   campaign-templates/nurture-monthly/default.email.txt
 *   subject     campaign-templates/nurture-monthly/default.subject.txt  (optional)
 *
 * Missing file → returns null. internal-send falls through to its placeholder.
 *
 * {{var}} substitution: any path that exists on the vars object is replaced.
 * Unknown placeholders are left in place rather than blanked, so missing
 * data fails loud in QA instead of silently shipping a blank string.
 */
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

export type TemplateKind = "sms" | "email";

export interface LoadedTemplate {
  subject?: string;
  body: string;
}

/**
 * Resolve the campaign-templates root relative to the orchestrator's runtime
 * working directory. In production this is the deployed app's CWD; in tests
 * it is the orchestrator/ project directory.
 *
 * Override via CAMPAIGN_TEMPLATES_DIR for non-standard layouts (e.g. when
 * the orchestrator and the templates directory live on different volumes).
 */
function templatesRoot(): string {
  const override = process.env.CAMPAIGN_TEMPLATES_DIR;
  if (override) return resolve(override);
  // Default: ../campaign-templates relative to the orchestrator package root.
  return resolve(process.cwd(), "..", "campaign-templates");
}

interface ResolvedPaths {
  body: string;
  subject: string | null;
}

function resolvePaths(templateId: string, kind: TemplateKind): ResolvedPaths {
  const [namespace, name] = templateId.split(":");
  const safeNs = (namespace ?? "default").replace(/[^a-z0-9_-]/gi, "_");
  const safeName = (name ?? "default").replace(/[^a-z0-9_-]/gi, "_");
  const root = templatesRoot();
  return {
    body: join(root, safeNs, `${safeName}.${kind}.txt`),
    subject: kind === "email" ? join(root, safeNs, `${safeName}.subject.txt`) : null,
  };
}

/**
 * Look up a value at a dotted path on the vars object. Returns undefined
 * (not "") on miss so the caller can decide whether to substitute or leave
 * the placeholder in place.
 */
function lookup(vars: Record<string, unknown>, dottedPath: string): string | undefined {
  const parts = dottedPath.split(".");
  let cursor: unknown = vars;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor === null || cursor === undefined ? undefined : String(cursor);
}

/**
 * Substitute {{path}} placeholders in `text`. Unknown paths are left
 * verbatim so blank-string bugs surface in QA instead of slipping into
 * outbound messages.
 */
export function substitute(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (match, path: string) => {
    const value = lookup(vars, path);
    return value === undefined ? match : value;
  });
}

/**
 * Try to load + render a template. Returns null if the body file is absent
 * — callers fall through to a placeholder. Subject is optional for emails;
 * if subject file is missing, the returned template carries no subject and
 * the caller can synthesize one.
 */
export function loadTemplate(
  templateId: string,
  kind: TemplateKind,
  vars: Record<string, unknown>,
  opts: {
    fs?: { existsSync: typeof existsSync; readFileSync: typeof readFileSync };
  } = {},
): LoadedTemplate | null {
  const fsImpl = opts.fs ?? { existsSync, readFileSync };
  const paths = resolvePaths(templateId, kind);

  if (!fsImpl.existsSync(paths.body)) return null;
  const rawBody = fsImpl.readFileSync(paths.body, "utf-8");
  const body = substitute(rawBody, vars);

  let subject: string | undefined;
  if (paths.subject && fsImpl.existsSync(paths.subject)) {
    const rawSubject = fsImpl.readFileSync(paths.subject, "utf-8").trim();
    subject = substitute(rawSubject, vars);
  }

  return subject !== undefined ? { subject, body } : { body };
}
