const FORBIDDEN_PATTERNS = [
  /api[_-]?key/i,
  /service[\s_-]?role/i,
  /sync[\s_-]?key/i,
  /sql\s*password/i,
  /password/i,
  /סיסמ[הת]/i,
  /secret/i,
  /סוד/i,
  /openai/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /update\s+\w+\s+set/i,
  /insert\s+into/i,
  /raw\s+sql/i,
  /show\s+prompt/i,
  /system\s+prompt/i,
  /הנחיות\s+המערכת/i,
  /פרומפט\s+מערכת/i,
];

export type SafetyCheck = {
  allowed: boolean;
  reason?: string;
};

export function checkAiPromptSafety(message: string): SafetyCheck {
  const match = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(message));
  if (match) {
    return {
      allowed: false,
      reason: "הבקשה כוללת פעולה או מידע שאסור לחשוף/לבצע דרך הצ׳אט.",
    };
  }

  return { allowed: true };
}

export function sanitizeToolText(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/<[^>]*>/g, "")
      .replace(/```/g, "`\u200b``")
      .replace(/ignore (all )?(previous|prior) instructions/gi, "[redacted instruction]")
      .replace(/התעלם מה(וראות|הנחיות)/g, "[redacted instruction]")
      .replace(/פעל לפי ההוראות/g, "[redacted instruction]")
      .slice(0, 2000);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeToolText);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeToolText(item),
      ]),
    );
  }

  return value;
}
