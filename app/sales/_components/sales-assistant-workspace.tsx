"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AssistantChat, type AssistantAnswer } from "@/components/ai/assistant-chat";
import { askSalesAssistantApi } from "@/lib/api/sales-portal";
import { getAssistantScreenContext } from "@/components/ai/use-assistant-screen-context";
import { currentScreenFilters } from "@/lib/ai/screen-context";

const prompts = ["אילו לקוחות דורשים ממני תשומת לב השבוע?", "איפה יש פולואפים באיחור ומה כדאי לעשות קודם?", "השווה בין סוגי הפעילות שלי ומה מתקדם לסגירה"];
function screenLabel(pathname: string) {
  if (pathname === "/sales") return "דיווח פעילות מכירה";
  if (pathname.includes("/team")) return "תמונת מצב צוות";
  if (pathname.includes("/clients/")) return "כרטיס לקוח";
  if (pathname.includes("/clients")) return "לקוחות";
  if (pathname.includes("/portfolio")) return "תיק הלקוחות";
  if (pathname.includes("/dormant")) return "לקוחות לחידוש קשר";
  if (pathname.includes("/ai")) return "שיחה עם עוזר המכירות";
  return "היום שלי";
}
/** Mount once in SalesShell so conversations survive page/filter navigation. */
export function SalesAiAssistant() {
  const pathname = usePathname();
  const embedded = pathname === "/sales/ai";
  return <AssistantChat
    title="עוזר המכירות"
    screen={screenLabel(pathname)}
    context={{ pathname, screen: screenLabel(pathname), selectedEntity: pathname.includes("/clients/") ? { clientRef: decodeURIComponent(pathname.split("/clients/")[1] ?? "").slice(0, 200) } : null }}
    prompts={prompts}
    embedded={embedded}
    embeddedTargetId={embedded ? "sales-ai-conversation" : undefined}
    request={async ({ message, history, context, signal }) => {
      const published = getAssistantScreenContext(pathname);
      const filters = { ...currentScreenFilters(), ...(published.filters as Record<string, string> ?? {}) };
      const response = await askSalesAssistantApi({ message, history, context: { ...context, ...published, filters }, scope: filters.scope === "team" || pathname.includes("/team") ? "team" : "personal", dateFrom: filters.dateFrom, dateTo: filters.dateTo }, signal) as AssistantAnswer & { generatedAt?: string };
      return response;
    }}
  />;
}
export function SalesAssistantWorkspace() {
  return <main dir="rtl" className="min-h-dvh bg-background p-3 text-right text-foreground lg:p-6"><header className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">שיחה עם עוזר המכירות</h1><p className="mt-1 text-xs text-muted-foreground">שאלות, השוואות והחלטה על הצעד הבא</p></div><Link href="/sales/dashboard" className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs hover:bg-accent"><ArrowRight size={15} />לדשבורד</Link></header><div id="sales-ai-conversation" className="mx-auto max-w-4xl" /></main>;
}
