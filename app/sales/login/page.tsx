"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, LogIn, Mail } from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSalesPortalApi } from "@/lib/api/sales-portal";

function errorLabel(code: string) {
  const labels: Record<string, string> = {
    EMAIL_PASSWORD_REQUIRED: "צריך למלא אימייל וסיסמה",
    INVALID_EMAIL_OR_PASSWORD: "האימייל או הסיסמה לא נכונים",
    SALES_LOGIN_FAILED: "כניסה נכשלה. נסו שוב.",
  };
  return labels[code] ?? code;
}

export default function SalesLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await loginSalesPortalApi({ email, password });
      router.push("/sales");
    } catch (loginError) {
      setError(errorLabel(loginError instanceof Error ? loginError.message : "SALES_LOGIN_FAILED"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main dir="rtl" className="h-dvh overflow-y-auto bg-background text-right text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-5 sm:max-w-md sm:px-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-black/10 sm:p-6">
          <div className="mb-7 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <GestelitLogo size="sm" className="rounded-xl" />
              <div>
                <h1 className="text-xl font-semibold leading-tight">יומן מכירות</h1>
                <p className="text-xs text-muted-foreground">כניסה</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
              aria-label="חזרה"
              className="shrink-0 rounded-xl text-muted-foreground"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sales-email">אימייל</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="sales-email"
                  dir="ltr"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-14 rounded-xl pr-12 text-left text-base md:h-14 md:py-2 md:text-base"
                  placeholder="name@company.co.il"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sales-password">סיסמה</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="sales-password"
                  dir="ltr"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-14 rounded-xl pr-12 text-left text-base md:h-14 md:py-2 md:text-base"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" disabled={isSubmitting} className="h-14 w-full rounded-xl gap-2 text-base">
              <LogIn className="h-5 w-5" />
              {isSubmitting ? "נכנס..." : "כניסה"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
