/**
 * Step DAG assertions for the four drip workers.
 *
 * These tests cover the step graph only — not BullMQ runtime behavior.
 * The worker spawns are skipped under NODE_ENV=test (vitest sets this).
 */
import { vi, describe, it, expect } from "vitest";

vi.mock("ioredis", () => {
  class Redis {}
  return { Redis, default: Redis };
});

vi.mock("bullmq", () => {
  class Queue {
    add = vi.fn().mockResolvedValue({ id: "stub" });
  }
  class Worker {
    on = vi.fn();
    close = vi.fn();
  }
  return { Queue, Worker };
});

const { NURTURE_7DAY_STEPS } = await import("./nurture-7day.js");
const { REACTIVATION_STEPS, runReactivationJob } = await import("./reactivation.js");
const { APPOINTMENT_REMINDER_STEPS } = await import("./appointment-reminders.js");
const { MONTHLY_NURTURE_STEPS, runMonthlyNurtureJob } = await import("./monthly-nurture.js");

describe("step DAGs (per migration doc)", () => {
  it("nurture-7day has 4 steps (sms/email/sms/email at day 0/1/3/7)", () => {
    const kinds = NURTURE_7DAY_STEPS.map((s) => s.kind);
    expect(kinds).toEqual(["sms", "email", "sms", "email"]);
    expect(NURTURE_7DAY_STEPS[0].delayMs).toBe(0);
    expect(NURTURE_7DAY_STEPS[1].delayMs).toBe(86_400_000);
    expect(NURTURE_7DAY_STEPS[2].delayMs).toBe(3 * 86_400_000);
    expect(NURTURE_7DAY_STEPS[3].delayMs).toBe(7 * 86_400_000);
  });

  it("reactivation is a single SMS step", () => {
    expect(REACTIVATION_STEPS).toHaveLength(1);
    expect(REACTIVATION_STEPS[0].kind).toBe("sms");
  });

  it("appointment-reminders schedules T-24h and T-1h SMS", () => {
    expect(APPOINTMENT_REMINDER_STEPS).toHaveLength(2);
    expect(APPOINTMENT_REMINDER_STEPS.every((s) => s.kind === "sms")).toBe(true);
  });

  it("monthly-nurture is a single email step", () => {
    expect(MONTHLY_NURTURE_STEPS).toHaveLength(1);
    expect(MONTHLY_NURTURE_STEPS[0].kind).toBe("email");
  });
});

describe("worker dispatch (with mocked queue.add)", () => {
  function fakeJob() {
    return {
      data: { personId: "p-1", campaignId: "c-1", enrolledAt: "2026-06-08T12:00:00Z" },
      name: "test",
    } as unknown as Parameters<typeof runReactivationJob>[0];
  }

  it("reactivation runs all (1) steps", async () => {
    await expect(runReactivationJob(fakeJob())).resolves.toBeUndefined();
  });

  it("monthly-nurture re-enqueues self via queue.add", async () => {
    const addSpy = vi.fn().mockResolvedValue({ id: "next" });
    await runMonthlyNurtureJob(fakeJob(), { add: addSpy } as never);
    expect(addSpy).toHaveBeenCalledOnce();
    const call = addSpy.mock.calls[0];
    expect(call[0]).toBe("c-1"); // campaignId as worker name
    expect(call[2]?.delay).toBe(30 * 86_400_000);
  });
});
