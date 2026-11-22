import { describe, expect, it } from "vitest";
import {
  buildOverview,
  israelDate,
  summarizeJob,
} from "@/lib/manufacturing/overview";
import type { LiveJobProgress } from "@/lib/types";
const job = (overrides: Partial<LiveJobProgress> = {}): LiveJobProgress =>
  ({
    job: { id: "j", job_number: "1", due_date: "2026-11-22" },
    jobItems: [],
    activeSessionCount: 0,
    activeStationIds: [],
    ...overrides,
  }) as LiveJobProgress;
const item = (planned = 100, good = 0, scrap = 0) =>
  ({
    jobItem: { id: "i" },
    plannedQuantity: planned,
    completedGood: good,
    completedScrap: scrap,
    wipDistribution: [{ stationId: "s", goodReported: 500, scrapReported: 0 }],
  }) as LiveJobProgress["jobItems"][number];
describe("manufacturing overview", () => {
  it("never rounds incomplete work up to 100 percent", () => {
    expect(
      summarizeJob(job({ jobItems: [item(1000, 999)] }), "2026-11-22").percent,
    ).toBe(99);
  });
  it("retains jobs without a worker and identifies missing setup", () => {
    const result = buildOverview([job()], "2026-11-22");
    expect(result.waiting).toBe(1);
    expect(result.needsSetup).toBe(1);
    expect(result.dueToday).toBe(1);
    expect(result.overdue).toBe(0);
  });
  it("counts terminal good and scrap without adding intermediate output", () => {
    const result = summarizeJob(
      job({ jobItems: [item(100, 40, 10)] }),
      "2026-11-22",
    );
    expect(result.percent).toBe(50);
    expect(result.good).toBe(40);
  });
  it("does not let one overproduced product complete another", () => {
    const result = summarizeJob(
      job({ jobItems: [item(100, 200), item(100, 0)] }),
      "2026-11-22",
    );
    expect(result.completed).toBe(false);
    expect(result.percent).toBe(50);
  });
  it("removes completed work with scrap but retains active sessions", () => {
    expect(
      buildOverview([job({ jobItems: [item(100, 80, 20)] })], "2026-11-22")
        .rows,
    ).toHaveLength(0);
    expect(
      buildOverview(
        [job({ jobItems: [item(100, 80, 20)], activeSessionCount: 1 })],
        "2026-11-22",
      ).rows,
    ).toHaveLength(1);
  });
  it("does not mark an absent date as late", () => {
    const result = summarizeJob(
      job({ job: { id: "j", job_number: "1", due_date: null } }),
      "2026-11-22",
    );
    expect(result.overdue).toBe(false);
  });
  it("prioritizes overdue before setup and compares calendar dates", () => {
    const result = buildOverview(
      [
        job(),
        job({
          job: { id: "late", job_number: "2", due_date: "2026-11-21" },
          jobItems: [item()],
        }),
      ],
      "2026-11-22",
    );
    expect(result.rows[0].job.id).toBe("late");
    expect(result.overdue).toBe(1);
  });
  it("uses Israel calendar at midnight rather than the browser time zone", () => {
    expect(israelDate(new Date("2026-11-21T22:30:00Z"))).toBe("2026-11-22");
  });
  it("flags an absent route or quantity", () => {
    expect(
      summarizeJob(
        job({ jobItems: [{ ...item(), wipDistribution: [] }] }),
        "2026-11-22",
      ).needsSetup,
    ).toBe(true);
    expect(
      summarizeJob(job({ jobItems: [item(0)] }), "2026-11-22").needsSetup,
    ).toBe(true);
  });
});
