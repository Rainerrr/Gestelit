"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAdminPassword } from "@/lib/api/auth-helpers";

export const AdminAccessDialog = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setPassword("");
      setError("");
    }
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!password) {
      setError("נא להזין סיסמה");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message || "סיסמה שגויה");
        return;
      }

      // Password is valid - store it and grant access
      setAdminPassword(password);
      setIsOpen(false);
      router.push("/admin");
    } catch {
      setError("שגיאה בחיבור לשרת");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <Button
        variant="secondary"
        size="lg"
        className="h-full min-h-32 w-full justify-between whitespace-normal rounded-xl border border-border bg-card px-5 py-5 text-right text-base font-semibold text-foreground hover:bg-secondary"
        onClick={() => setIsOpen(true)}
        aria-label="פתיחת כניסת מנהלים"
      >
        <span className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold">כניסת מנהל</span>
            <span className="mt-1 block text-sm font-normal leading-6 text-muted-foreground">
              דשבורד, BINA, דיווחים והגדרות.
            </span>
          </span>
        </span>
        <ArrowLeft className="hidden h-5 w-5 text-muted-foreground sm:block" />
      </Button>
      <DialogContent className="text-right sm:max-w-md" dir="rtl">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <DialogTitle>כניסת מנהלים</DialogTitle>
          <DialogDescription>גישה למנהלים בלבד. הזינו סיסמה לפתיחת הדשבורד.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Label htmlFor="admin-password">סיסמת מנהל</Label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError("");
            }}
            placeholder="••••"
            autoComplete="current-password"
            disabled={isSubmitting}
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "admin-password-error" : undefined}
            className="h-12 rounded-xl text-lg md:h-12"
          />
          {error ? (
            <Alert id="admin-password-error" variant="destructive" className="rounded-xl text-right">
              <AlertTitle>לא ניתן להיכנס</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter className="pt-2">
            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-base font-semibold"
              disabled={isSubmitting}
            >
              {isSubmitting ? "בודק..." : "כניסה לדשבורד"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
