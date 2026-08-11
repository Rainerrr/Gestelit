"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, Send, Sparkles } from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { askSalesAssistantApi } from "@/lib/api/sales-portal";
import { copyTextToClipboard } from "@/lib/utils/copy-to-clipboard";

type ChatAnswer = {
  answer: string;
  confidence: "exact" | "inferred" | "missing_data";
  evidence: Array<{ source: string; label: string; freshness: string | null; confidence: string }>;
  filtersUsed: string[];
  suggestedNextAction: string;
  suggestedQuestions: string[];
  couldNotVerify: string[];
  scope: "personal" | "team";
  dateFrom: string;
  dateTo: string;
};

const prompts = [
  "אילו לקוחות דורשים ממני תשומת לב השבוע?",
  "איפה יש לי פולואפים באיחור ומה כדאי לעשות קודם?",
  "השווה בין סוגי הפעילות שלי ומה באמת מתקדם לסגירה",
  "איזה מידע חסר לי בדיווחים כדי לנהל טוב יותר את הצנרת?",
];

export function SalesAssistantWorkspace() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [teamScope, setTeamScope] = useState(false);

  useEffect(() => {
    setTeamScope(new URLSearchParams(window.location.search).get("scope") === "team");
  }, []);

  const ask = async (question: string) => {
    const clean = question.trim();
    if (!clean || isLoading) return;
    setMessage(clean);
    setIsLoading(true);
    setError(null);
    try {
      setAnswer(await askSalesAssistantApi({ message: clean, scope: teamScope ? "team" : "personal" }) as ChatAnswer);
    } catch (askError) {
      const code = askError instanceof Error ? askError.message : "SALES_AI_FAILED";
      if (code === "SALES_UNAUTHORIZED") {
        router.push("/sales/login");
        return;
      }
      setError(code === "SALES_AI_REQUEST_BLOCKED"
        ? "אפשר לשאול על הנתונים, אבל אי אפשר לבקש סיסמאות, SQL או לבצע שינוי ב-BINA."
        : "לא הצלחנו לקבל תשובה כרגע. נסו שוב בעוד רגע.");
    } finally {
      setIsLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(message);
  };

  const copy = async () => {
    if (!answer) return;
    const result = await copyTextToClipboard([
      answer.answer,
      `הצעד הבא: ${answer.suggestedNextAction}`,
      answer.couldNotVerify.length ? `לא ניתן לאמת: ${answer.couldNotVerify.join(", ")}` : "",
    ].filter(Boolean).join("\n\n"));
    setCopied(result);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main dir="rtl" className="min-h-dvh bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5"><GestelitLogo size="sm" className="rounded-xl" /><div><h1 className="font-semibold">עוזר המכירות</h1><p className="text-xs text-muted-foreground">{teamScope ? "שאלות על נתוני הצוות" : "שאלות על הנתונים שלך"}</p></div></div>
          <Button variant="outline" size="sm" onClick={() => router.push(teamScope ? "/sales/team" : "/sales/dashboard")} className="h-10 gap-2"><ArrowRight className="h-4 w-4" /><span className="hidden sm:inline">חזרה לדשבורד</span></Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 p-3 pb-10 lg:p-6">
        <Card className="rounded-xl border-primary/20 bg-primary/5 p-4 shadow-sm lg:p-5">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">מה כדאי לבדוק עכשיו?</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">העוזר מנתח את הדיווחים בגסטליט. נתוני עבר מ-BINA עדיין חלקיים, ולכן כל מגבלת כיסוי מופיעה בתשובה.</p></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => void ask(prompt)} className="rounded-xl border border-border bg-card p-3 text-right text-sm font-medium transition hover:border-primary/40 hover:bg-accent">{prompt}</button>)}</div>
        </Card>

        <form onSubmit={submit} className="flex gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
          <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="למשל: מה דורש ממני טיפול השבוע?" className="h-11 border-0 bg-transparent text-base shadow-none focus-visible:ring-0" />
          <Button type="submit" size="icon" disabled={!message.trim() || isLoading} className="h-11 w-11 shrink-0" aria-label="שליחה"><Send className="h-4 w-4" /></Button>
        </form>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {isLoading ? <Card className="h-48 animate-pulse rounded-xl" /> : null}

        {answer && !isLoading ? (
          <Card className="rounded-xl border-border/80 p-4 shadow-sm lg:p-6">
            <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><Badge>{answer.scope === "team" ? "ניתוח צוות" : "ניתוח אישי"}</Badge><Badge variant="outline">{answer.confidence === "exact" ? "מדויק" : answer.confidence === "inferred" ? "מסקנה על בסיס הנתונים" : "חסר מידע"}</Badge></div><Button variant="ghost" size="sm" onClick={() => void copy()} className="gap-2">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "הועתק" : "העתקה"}</Button></div>
            <p className="mt-4 whitespace-pre-wrap text-base leading-8">{answer.answer}</p>
            <div className="mt-5 rounded-xl bg-primary/5 p-4"><div className="text-xs font-semibold text-primary">מה לעשות עכשיו</div><p className="mt-1 text-sm leading-6">{answer.suggestedNextAction}</p></div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div><h3 className="text-sm font-semibold">שאלות המשך שכדאי לבדוק</h3><div className="mt-2 space-y-2">{answer.suggestedQuestions.map((question) => <button key={question} type="button" onClick={() => void ask(question)} className="block w-full rounded-xl border border-border p-3 text-right text-sm transition hover:border-primary/40">{question}</button>)}</div></div>
              <div><h3 className="text-sm font-semibold">מקורות ומגבלות</h3><div className="mt-2 space-y-2">{answer.evidence.map((item, index) => <div key={`${item.source}-${index}`} className="rounded-xl bg-secondary/50 p-3 text-sm"><div className="font-medium">{item.label}</div><div className="mt-1 text-xs text-muted-foreground"><bdi dir="ltr">{item.source}</bdi></div></div>)}{answer.couldNotVerify.map((item) => <div key={item} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">לא ניתן לאמת: {item}</div>)}</div></div>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
