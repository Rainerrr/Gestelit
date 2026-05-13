"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { sendBinaAiChatApi } from "@/lib/api/bina";
import { cn } from "@/lib/utils";

export type AdminAiScreenContext = {
  screen?: string;
  activeTab?: string;
  search?: string | null;
  selectedEntity?: Record<string, unknown> | null;
  visibleSummary?: string | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  meta?: Record<string, unknown>;
};

function routeLabel(pathname: string) {
  if (pathname === "/admin") return "דשבורד";
  if (pathname.startsWith("/admin/bina")) return "נתוני BINA";
  if (pathname.startsWith("/admin/jobs")) return "עבודות";
  if (pathname.startsWith("/admin/history")) return "היסטוריה ודוחות";
  if (pathname.startsWith("/admin/reports")) return "דיווחים";
  if (pathname.startsWith("/admin/maintenance")) return "טיפולים";
  if (pathname.startsWith("/admin/manage")) return "ניהול";
  if (pathname.startsWith("/admin/session")) return "סשן ייצור";
  return "מסך ניהול";
}

function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

export function AdminAiAssistant({ context }: { context?: AdminAiScreenContext }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("תן תמונת מצב תפעולית מלאה והשווה ייצור, רכש, ספקים, כספים ומשלוחים");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentContext = useMemo(() => buildContext(pathname, context), [pathname, context]);
  const prompts = useMemo(() => suggestedPrompts(pathname, context), [pathname, context]);

  const sendMessage = async (messageOverride?: string) => {
    const message = (messageOverride ?? input).trim();
    if (!message) return;
    setOpen(true);
    setError(null);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setIsLoading(true);
    try {
      const response = await sendBinaAiChatApi({
        message,
        sessionId,
        context: currentContext,
      }) as Record<string, unknown>;
      setSessionId(String(response.sessionId));
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: String(response.answer ?? ""),
          meta: response,
        },
      ]);
    } catch (sendError) {
      const messageText = sendError instanceof Error ? sendError.message : "AI_CHAT_FAILED";
      setError(messageText);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "לא הצלחתי לענות כרגע. בדוק שה-OpenAI key, ה-migrations והחיבור ל-Supabase פעילים, ואז נסה שוב.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          className="fixed bottom-20 left-4 z-50 h-12 rounded-full border border-primary/40 bg-primary px-4 text-primary-foreground shadow-xl shadow-primary/20 lg:bottom-5"
        >
          <Sparkles className="h-4 w-4" />
          <span className="mr-2 hidden sm:inline">שאל את ה-AI</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-full max-w-full flex-col p-0 sm:max-w-xl" dir="rtl">
        <SheetHeader className="border-b border-border p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle>AI תפעולי</SheetTitle>
              <SheetDescription>
                מודע למסך הנוכחי: {currentContext.routeLabel}
                {currentContext.activeTab ? ` / ${currentContext.activeTab}` : ""}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="border-b border-border p-4">
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline">{currentContext.routeLabel}</Badge>
            {currentContext.activeTab && <Badge variant="outline">{String(currentContext.activeTab)}</Badge>}
            {currentContext.search && <Badge variant="outline">חיפוש: {String(currentContext.search)}</Badge>}
          </div>
          <div className="grid gap-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                className="rounded-lg border border-border bg-card/70 p-2 text-right text-sm transition hover:bg-accent"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {error && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200">
              {error}
            </div>
          )}
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              שאל שאלה רחבה, למשל השוואה בין רכש, ספקים, פק״עות ומשלוחים. ה-AI ישתמש בכלים מאושרים בלבד ויציע את הצעד הבא.
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={cn(
                "rounded-xl p-3 text-sm",
                message.role === "user" ? "mr-auto max-w-[88%] bg-primary/10" : "ml-auto max-w-[94%] bg-card",
              )}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.meta && (
                <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  <div>מקורות: {Array.isArray(message.meta.sources) ? message.meta.sources.join(", ") : "-"}</div>
                  <div>עדכניות: {formatDate(message.meta.freshness)}</div>
                  {Boolean(message.meta.confidence) && <div>ביטחון: {String(message.meta.confidence)}</div>}
                  {Boolean(message.meta.suggestedNextAction) && <div>המשך מומלץ: {String(message.meta.suggestedNextAction)}</div>}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              מנתח נתונים ומחפש קשרים...
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                void sendMessage();
              }
            }}
            className="min-h-20 resize-none bg-background"
            placeholder="שאל על המסך הנוכחי, או בקש השוואה בין BINA לגסטליט"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter לשליחה</span>
            <Button onClick={() => void sendMessage()} disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              שלח
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
