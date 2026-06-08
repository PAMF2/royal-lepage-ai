/**
 * templates.test.ts — substitute() + loadTemplate() with mocked fs.
 */
import { describe, it, expect, vi } from "vitest";
import { resolve, join } from "path";
import { substitute, loadTemplate } from "./templates.js";

// Mirror templates.ts's resolvePaths() so fakeFs keys match what the
// loader actually requests (path.resolve() yields backslashes on Windows
// and forward slashes on POSIX — both must round-trip through the same
// resolve() call to stay equal).
const TMPL_ROOT = resolve("/tmpl");
const tp = (ns: string, name: string, ext: string) => join(TMPL_ROOT, ns, `${name}.${ext}.txt`);

describe("substitute", () => {
  it("replaces {{contact.firstName}} with the contact field", () => {
    expect(substitute("Hi {{contact.firstName}}", { contact: { firstName: "Jane" } })).toBe(
      "Hi Jane",
    );
  });

  it("supports multiple substitutions in one string", () => {
    const out = substitute("{{contact.firstName}} in {{contact.city}}", {
      contact: { firstName: "Bob", city: "Montréal" },
    });
    expect(out).toBe("Bob in Montréal");
  });

  it("leaves unknown placeholders verbatim (does not blank them)", () => {
    expect(substitute("Hello {{contact.missing}}", { contact: {} })).toBe(
      "Hello {{contact.missing}}",
    );
  });

  it("tolerates whitespace inside the braces", () => {
    expect(substitute("Hi {{ contact.firstName }}", { contact: { firstName: "X" } })).toBe(
      "Hi X",
    );
  });

  it("handles nested paths beyond two levels", () => {
    expect(substitute("{{a.b.c}}", { a: { b: { c: "deep" } } })).toBe("deep");
  });
});

describe("loadTemplate", () => {
  function fakeFs(files: Record<string, string>) {
    return {
      existsSync: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
      readFileSync: (p: string) =>
        Object.prototype.hasOwnProperty.call(files, p) ? files[p] : (() => { throw new Error(`ENOENT: ${p}`); })(),
    } as never;
  }

  it("returns null when the body file is absent (caller falls back to placeholder)", () => {
    const result = loadTemplate("nurture-7day:day0", "sms", {}, { fs: fakeFs({}) });
    expect(result).toBeNull();
  });

  it("loads sms body and substitutes contact vars", () => {
    process.env.CAMPAIGN_TEMPLATES_DIR = "/tmpl";
    const fs = fakeFs({
      [tp("nurture-7day", "day0", "sms")]: "Hi {{contact.firstName}}!",
    });
    const result = loadTemplate(
      "nurture-7day:day0",
      "sms",
      { contact: { firstName: "Jane" } },
      { fs },
    );
    expect(result).toEqual({ body: "Hi Jane!" });
    delete process.env.CAMPAIGN_TEMPLATES_DIR;
  });

  it("loads email body + optional subject file", () => {
    process.env.CAMPAIGN_TEMPLATES_DIR = "/tmpl";
    const fs = fakeFs({
      [tp("nurture-monthly", "default", "email")]: "<p>Welcome {{contact.firstName}}</p>",
      [join(TMPL_ROOT, "nurture-monthly", "default.subject.txt")]: "Hello {{contact.firstName}}",
    });
    const result = loadTemplate(
      "nurture-monthly:default",
      "email",
      { contact: { firstName: "Alice" } },
      { fs },
    );
    expect(result).toEqual({
      subject: "Hello Alice",
      body: "<p>Welcome Alice</p>",
    });
    delete process.env.CAMPAIGN_TEMPLATES_DIR;
  });

  it("email with no subject file yields template without subject (caller synthesizes)", () => {
    process.env.CAMPAIGN_TEMPLATES_DIR = "/tmpl";
    const fs = fakeFs({
      [tp("nurture-monthly", "default", "email")]: "Body",
    });
    const result = loadTemplate("nurture-monthly:default", "email", {}, { fs });
    expect(result).toEqual({ body: "Body" });
    delete process.env.CAMPAIGN_TEMPLATES_DIR;
  });

  it("templateId without colon → namespace 'default'? we use first segment as ns", () => {
    process.env.CAMPAIGN_TEMPLATES_DIR = "/tmpl";
    const fs = fakeFs({
      [tp("loose", "default", "sms")]: "x",
    });
    // "loose" alone has no colon → split yields [loose], so name defaults to 'default'
    const result = loadTemplate("loose", "sms", {}, { fs });
    expect(result).toEqual({ body: "x" });
    delete process.env.CAMPAIGN_TEMPLATES_DIR;
  });

  it("rejects path traversal in templateId (slashes stripped)", () => {
    process.env.CAMPAIGN_TEMPLATES_DIR = "/tmpl";
    // ".." / "/" not in safe regex, so they become "_"; the resulting path
    // points at /tmpl/_/_.sms.txt and the legit file is not opened.
    const fs = vi.fn().mockReturnValue(false) as never;
    const result = loadTemplate("../../etc/passwd:bad", "sms", {}, {
      fs: { existsSync: () => false, readFileSync: () => "" } as never,
    });
    expect(result).toBeNull();
    delete process.env.CAMPAIGN_TEMPLATES_DIR;
  });
});
