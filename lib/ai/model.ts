/** Explicit effort for Luna; preserve overrides and other model compatibility. */
export function aiReasoning(model: string) {
  return model === "gpt-6-luna" ? { effort: "medium" as const } : undefined;
}
