"use client";
import { usePathname } from "next/navigation";
import { AssistantChat, type AssistantAnswer, type AssistantTurn } from "@/components/ai/assistant-chat";
import { sendBinaAiChatApi, fetchBinaAiSessionsApi, fetchBinaAiSessionApi } from "@/lib/api/bina";
import { currentScreenFilters } from "@/lib/ai/screen-context";

export type AdminAiScreenContext = {
  screen?: string;
  activeTab?: string;
  search?: string | null;
  selectedEntity?: Record<string, unknown> | null;
  visibleSummary?: string | null;
};

function routeLabel(pathname: string) {
  if (pathname === "/admin") return "סקירת ייצור";
  if (pathname.startsWith("/admin/sales-daily-log")) return "יומן מכירות";
  if (pathname.startsWith("/admin/bina")) return "נתוני BINA";
  if (pathname.startsWith("/admin/jobs")) return "עבודות";
  if (pathname.startsWith("/admin/history")) return "היסטוריה ודוחות";
  if (pathname.startsWith("/admin/reports")) return "דיווחים";
  if (pathname.startsWith("/admin/maintenance")) return "טיפולים";
  if (pathname.startsWith("/admin/manage")) return "ניהול";
  if (pathname.startsWith("/admin/session")) return "סשן ייצור";
  return "מסך ניהול";
}

function buildContext(pathname: string, screenContext?: AdminAiScreenContext) {
  return {
    pathname,
    routeLabel: routeLabel(pathname),
    screen: screenContext?.screen ?? routeLabel(pathname),
    activeTab: screenContext?.activeTab ?? null,
    search: screenContext?.search ?? null,
    selectedEntity: screenContext?.selectedEntity ?? null,
    visibleSummary: screenContext?.visibleSummary ?? null,
  };
}

function suggestedPrompts(pathname: string, context?: AdminAiScreenContext) {
  if (pathname.startsWith("/admin/sales-daily-log")) {
    return [
      "סכם את יומן המכירות והפולואפים שדורשים טיפול היום",
      "איזה לקוחות חשובים מ-BINA לא קיבלו פעילות מכירה ידנית?",
      "מצא הזדמנויות פתוחות והשווה אותן להכנסות BINA האחרונות",
    ];
  }

  if (pathname.startsWith("/admin/bina")) {
    if (context?.activeTab === "purchasing") {
      return [
        "איזה פריטי רכש פתוחים עלולים לעכב פק״עות?",
        "השווה רכש פתוח מול פק״עות בסיכון ותן המלצות פעולה",
        "מי הספקים שכדאי להתקשר אליהם היום ולמה?",
      ];
    }
    if (context?.activeTab === "suppliers") {
      return [
        "מי הספקים עם חוב פתוח או איחורים משמעותיים?",
        "נתח ספקים שמשפיעים גם על רכש וגם על משלוחים",
        "נסח הודעת הסלמה לספק הבעייתי ביותר",
      ];
    }
    if (context?.activeTab === "finance" || context?.activeTab === "sales") {
      return [
        "סכם כספים ומכירות מול פק״עות פתוחות",
        "איזה לקוחות או ספקים דורשים טיפול כספי דחוף?",
        "מצא פערים בין חשבוניות, משלוחים ופק״עות",
      ];
    }
    if (context?.activeTab === "deliveries") {
      return [
        "איזה משלוחים יצאו ועדיין לא נסגרו ומה מושפע מזה?",
        "חבר משלוחים פתוחים לפק״עות ולקוחות בסיכון",
        "מה כדאי לבדוק מול ספקי חוץ היום?",
      ];
    }
    return [
      "תן תמונת מצב תפעולית מלאה והשווה ייצור, רכש, ספקים וכספים",
      "איזה פק״עות בסיכון לאיחור היום ולמה?",
      "מה השתנה מאז הסנכרון האחרון ומה הפעולה הבאה?",
    ];
  }

  if (pathname.startsWith("/admin/jobs")) {
    return [
      "איזה עבודות כדאי להשוות מול BINA לפני תכנון הרצפה?",
      "מצא עבודות שעלולות להיות בפער מול נתוני BINA",
      "מה כדאי לבדוק לפני פתיחת עבודות חדשות?",
    ];
  }

  return [
    "סכם לי מה כדאי לבדוק במסך הזה",
    "איזה חריגים כדאי לחפש עכשיו?",
    "השווה את מצב המסך הזה מול נתוני BINA",
  ];
}

const tabLabels: Record<string, string> = {
  all: "כל העבודות", overdue: "באיחור", waiting: "ללא משמרת", setup: "להשלמת הגדרה",
  active: "עבודות פעילות", completed: "עבודות שהושלמו",
  overview: "סקירה", production: "פק״עות", purchasing: "רכש", suppliers: "ספקים",
  finance: "כספים", sales: "מכירות", deliveries: "משלוחים", ai: "עוזר הנתונים", sync: "סנכרון",
};

export function AdminAiAssistant({ context }: { context?: AdminAiScreenContext }) {
  const pathname = usePathname();
  const screenContext = buildContext(pathname, context);
  return <AssistantChat
    title="Gestelit AI"
    storageKey="admin-ai"
    screen={`${screenContext.routeLabel}${context?.activeTab ? ` · ${tabLabels[context.activeTab] ?? context.activeTab}` : ""}${context?.search ? ` · ${context.search}` : ""}`}
    context={screenContext}
    prompts={suggestedPrompts(pathname, context)}
    openEvent="gestelit:admin-ai-open"
    loadHistory={async () => {
      const response = await fetchBinaAiSessionsApi() as { sessions?: Array<{ id: string; started_at: string; metadata?: { title?: string; context?: { routeLabel?: string } } }> };
      return (response.sessions ?? []).map((session) => ({ id: session.id, label: session.metadata?.title ?? `${session.metadata?.context?.routeLabel ?? "שיחה קודמת"} · ${new Date(session.started_at).toLocaleDateString("he-IL")}` }));
    }}
    loadConversation={async (id) => {
      const response = await fetchBinaAiSessionApi(id) as { session: { metadata?: { title?: string } }; messages?: Array<{ role: string; content: string; metadata?: AssistantAnswer }> };
      const messages: AssistantTurn[] = (response.messages ?? []).flatMap((turn) => turn.role === "user" || turn.role === "assistant" ? [{ role: turn.role, content: turn.content, ...(turn.role === "assistant" ? { answer: { ...turn.metadata, answer: turn.content } } : {}) }] : []);
      return { id, sessionId: id, label: response.session.metadata?.title ?? messages[0]?.content.slice(0, 45) ?? "שיחה קודמת", messages };
    }}
    request={async ({ message, sessionId, context: hints, signal }) => {
      const response = await sendBinaAiChatApi({ message, sessionId, context: { ...hints, filters: currentScreenFilters() } }, signal) as AssistantAnswer & { citations?: Array<{ label: string; source_view: string; synced_at: string | null }> };
      return { ...response, evidence: response.citations?.map((item) => ({ label: item.label, source: item.source_view, freshness: item.synced_at })) };
    }}
  />;
}
