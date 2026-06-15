import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminAccessDialog } from "@/components/landing/admin-access-dialog";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Database,
  IdCard,
  ShieldCheck,
} from "lucide-react";
import {
  DEFAULT_LANGUAGE,
  getTranslation,
  type TranslationKey,
} from "@/lib/i18n/translations";

const lang = DEFAULT_LANGUAGE;
const t = (key: TranslationKey) => getTranslation(key, lang);

export default function Home() {
  return (
    <main className="min-h-dvh bg-background p-4 text-right sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-7xl flex-col gap-6 sm:min-h-[calc(100dvh-3rem)] lg:min-h-[calc(100dvh-4rem)]">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <GestelitLogo size="md" className="rounded-xl" />
            <div>
              <div className="text-base font-semibold text-foreground">Gestelit</div>
              <div className="text-xs text-muted-foreground">{t("app.tagline")}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:block">
              מערכת פעילה
            </div>
            <div className="[&_button]:h-11 [&_button]:w-11">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <section className="grid flex-1 content-center gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-primary">שער כניסה</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                כניסה לרצפת הייצור
              </h1>
              <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
                התחלת משמרת לעובדים וגישה מהירה למנהלים. בלי מסכי פתיחה מיותרים.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.35fr_0.85fr]">
              <Button
                asChild
                size="lg"
                className="h-auto min-h-32 w-full justify-between whitespace-normal rounded-xl px-5 py-5 text-right shadow-md shadow-primary/15"
              >
                <Link href="/login">
                  <span className="flex min-w-0 items-start gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/15">
                      <IdCard className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-lg font-semibold">{t("home.cta.login")}</span>
                      <span className="mt-1 block text-sm font-normal leading-6 text-primary-foreground/80">
                        מספר עובד, בחירת עמדה והמשך עבודה פעילה.
                      </span>
                    </span>
                  </span>
                  <ArrowLeft className="hidden h-6 w-6 sm:block" />
                </Link>
              </Button>

              <div className="min-h-32">
                <AdminAccessDialog />
              </div>
            </div>
          </div>

          <aside className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">סטטוס מערכת</h2>
                <p className="text-xs text-muted-foreground">בדיקה מהירה לפני תחילת עבודה</p>
              </div>
              <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                פעיל
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Activity className="h-4 w-4 text-emerald-500" />
                  ייצור
                </span>
                <span className="text-xs text-muted-foreground">דיווח חי</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Database className="h-4 w-4 text-primary" />
                  BINA
                </span>
                <span className="text-xs text-muted-foreground">רכש, ספקים ומכירות</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  מנהלים
                </span>
                <span className="text-xs text-muted-foreground">דשבורדים ודוחות</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  הרשאות
                </span>
                <span className="text-xs text-muted-foreground">גישה מבוקרת</span>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
