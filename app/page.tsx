import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_LANGUAGE,
  getTranslation,
  type TranslationKey,
} from "@/lib/i18n/translations";

const lang = DEFAULT_LANGUAGE;
const t = (key: TranslationKey) => getTranslation(key, lang);

export default function Home() {
  return (
    <section className="flex flex-1 flex-col gap-8 py-8">
      <article className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-right shadow-sm">
        <div className="flex justify-end">
          <Badge variant="secondary" className="text-xs font-semibold">
            {t("app.tagline")}
          </Badge>
        </div>
        <h1 className="mt-6 text-4xl font-semibold leading-tight text-slate-900">
          {t("home.hero.title")}
        </h1>

        <div className="mt-10 flex justify-end">
          <Button asChild size="lg" className="min-w-44 justify-center">
            <Link href="/login">{t("home.cta.login")}</Link>
          </Button>
        </div>
      </article>
    </section>
  );
}
