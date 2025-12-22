import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminAccessDialog } from "@/components/landing/admin-access-dialog";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  DEFAULT_LANGUAGE,
  getTranslation,
  type TranslationKey,
} from "@/lib/i18n/translations";

const lang = DEFAULT_LANGUAGE;
const t = (key: TranslationKey) => getTranslation(key, lang);

export default function Home() {
  return (
    <section className="fixed inset-0 overflow-auto bg-background p-4 sm:p-6 lg:p-8">
      <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex min-h-full max-w-7xl flex-col items-center justify-center gap-6">
        <article className="w-full max-w-xl rounded-xl border border-border bg-card/50 px-8 py-10 text-right backdrop-blur-sm">
          <div className="flex justify-end">
            <Badge variant="secondary" className="border-border bg-secondary text-xs font-semibold text-foreground/80">
              {t("app.tagline")}
            </Badge>
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-foreground">
            {t("home.hero.title")}
          </h1>

          <div className="mt-10 flex flex-col items-end gap-3">
            <Button asChild size="lg" className="min-w-44 justify-center bg-primary font-medium text-primary-foreground hover:bg-primary/90">
              <Link href="/login">{t("home.cta.login")}</Link>
            </Button>
            <AdminAccessDialog />
          </div>
        </article>
      </div>
    </section>
  );
}
