export type WorkflowAgentConfig = {
  name: string;
  instructions: string;
  includeJobContext: boolean;
  includeProgress: boolean;
  output: "checklist" | "handoff" | "risks";
  trigger: "manual";
  requiresReview: true;
};
export type WorkflowAgentResult = {
  summary: string;
  items: string[];
  warnings: string[];
};
export const defaultWorkflowAgent = (): WorkflowAgentConfig => ({
  name: "עוזר תחנה",
  instructions:
    "הכן רשימת בדיקות לפני תחילת העבודה בתחנה. ציין מידע חסר ושאלות למנהל.",
  includeJobContext: true,
  includeProgress: false,
  output: "checklist",
  trigger: "manual",
  requiresReview: true,
});
export function validateAgentConfig(
  value: unknown,
): WorkflowAgentConfig | null {
  if (value === null || value === undefined) return null;
  const c = value as WorkflowAgentConfig;
  if (
    !c ||
    typeof c !== "object" ||
    typeof c.name !== "string" ||
    !c.name.trim() ||
    c.name.length > 100 ||
    typeof c.instructions !== "string" ||
    !c.instructions.trim() ||
    c.instructions.length > 3000 ||
    typeof c.includeJobContext !== "boolean" ||
    typeof c.includeProgress !== "boolean" ||
    !["checklist", "handoff", "risks"].includes(c.output) ||
    c.trigger !== "manual" ||
    c.requiresReview !== true
  )
    throw new Error("INVALID_AGENT_CONFIG");
  return {
    name: c.name.trim(),
    instructions: c.instructions.trim(),
    includeJobContext: c.includeJobContext,
    includeProgress: c.includeProgress,
    output: c.output,
    trigger: "manual",
    requiresReview: true,
  };
}
export function validateAgentMap(
  value: unknown,
  stationIds: string[],
): Record<string, WorkflowAgentConfig> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_AGENT_CONFIG");
  const result: Record<string, WorkflowAgentConfig> = {};
  for (const [id, config] of Object.entries(value)) {
    if (!stationIds.includes(id)) throw new Error("INVALID_AGENT_STATION");
    const valid = validateAgentConfig(config);
    if (valid) result[id] = valid;
  }
  return result;
}
export function validateAgentResult(value: unknown): WorkflowAgentResult {
  const v = value as WorkflowAgentResult;
  const text = (s: unknown) =>
    typeof s === "string" && s.trim().length > 0 && s.length <= 4000;
  if (
    !v ||
    !text(v.summary) ||
    !Array.isArray(v.items) ||
    !Array.isArray(v.warnings) ||
    v.items.length > 20 ||
    v.warnings.length > 20 ||
    !v.items.every(text) ||
    !v.warnings.every(text)
  )
    throw new Error("INVALID_AGENT_RESULT");
  return { summary: v.summary, items: v.items, warnings: v.warnings };
}
