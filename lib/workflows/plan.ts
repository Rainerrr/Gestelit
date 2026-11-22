import type { Station } from "@/lib/types";

export type WorkflowPlan = {
  name: string;
  summary: string;
  steps: {
    stationId: string;
    reason: string;
    requiresFirstProductApproval: boolean;
  }[];
  warnings: string[];
  handoff: string[];
};

export const MAX_WORKFLOW_STEPS = 30;

/** Model output is untrusted, even when it conforms to a JSON schema. */
export const validateWorkflowPlan = (
  value: unknown,
  catalog: Pick<Station, "id" | "is_active">[],
): WorkflowPlan => {
  const fail = (): never => {
    throw new Error("INVALID_WORKFLOW_PLAN");
  };
  if (!value || typeof value !== "object") return fail();
  const plan = value as WorkflowPlan;
  const text = (s: unknown, max: number): s is string =>
    typeof s === "string" && s.trim().length > 0 && s.length <= max;
  if (
    !text(plan.name, 160) ||
    !text(plan.summary, 2000) ||
    !Array.isArray(plan.steps) ||
    plan.steps.length > MAX_WORKFLOW_STEPS
  )
    return fail();
  const active = new Set(catalog.filter((s) => s.is_active).map((s) => s.id));
  const seen = new Set<string>();
  for (const step of plan.steps) {
    if (
      !step ||
      !active.has(step.stationId) ||
      seen.has(step.stationId) ||
      !text(step.reason, 1000) ||
      typeof step.requiresFirstProductApproval !== "boolean"
    )
      return fail();
    seen.add(step.stationId);
  }
  for (const list of [plan.warnings, plan.handoff]) {
    if (
      !Array.isArray(list) ||
      list.length > 12 ||
      list.some((s) => !text(s, 1000))
    )
      return fail();
  }
  if (!plan.steps.length && !plan.warnings.length) return fail();
  return plan;
};
