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

const ADMIN_PASSWORD = "1234";

export const AdminAccessDialog = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setPassword("");
      setError("");
    }
  };

  const handleSubmit = () => {
    if (password === ADMIN_PASSWORD) {
      window.localStorage.setItem("isAdmin", "true");
      setIsOpen(false);
      router.push("/admin");
      return;
    }

    setError("סיסמה שגויה");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
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
          <DialogDescription>הזן סיסמה זמנית לצפייה בדשבורד.</DialogDescription>
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
          />
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="justify-start">
          <Button onClick={handleSubmit} className="min-w-32">
            כניסה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


