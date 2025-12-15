"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  const handleSubmit = async () => {
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
    } catch (err) {
      setError("שגיאה בחיבור לשרת");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isSubmitting) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <Button
        variant="link"
        className="h-auto p-0 text-sm font-medium text-slate-600 underline-offset-4 hover:underline"
        onClick={() => setIsOpen(true)}
        aria-label="פתיחת כניסת מנהלים"
      >
        כניסת מנהל
      </Button>
      <DialogContent className="text-right">
        <DialogHeader>
          <DialogTitle>כניסת מנהלים</DialogTitle>
          <DialogDescription>הזן סיסמת מנהל לצפייה בדשבורד.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="admin-password">סיסמת מנהל</Label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="••••"
            autoComplete="current-password"
            disabled={isSubmitting}
          />
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="justify-start">
          <Button
            onClick={handleSubmit}
            className="min-w-32"
            disabled={isSubmitting}
          >
            {isSubmitting ? "בודק..." : "כניסה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


