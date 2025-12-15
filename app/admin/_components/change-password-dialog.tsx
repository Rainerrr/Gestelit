"use client";

import { useState, type KeyboardEvent } from "react";
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
import { changeAdminPasswordApi } from "@/lib/api/admin-management";
import { setAdminPassword } from "@/lib/api/auth-helpers";

type ChangePasswordDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ChangePasswordDialog = ({
  isOpen,
  onOpenChange,
}: ChangePasswordDialogProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
    }
    onOpenChange(open);
  };

  const handleSubmit = async () => {
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("כל השדות נדרשים");
      return;
    }

    if (newPassword.length < 4) {
      setError("סיסמה חייבת להכיל לפחות 4 תווים");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("סיסמאות לא תואמות");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await changeAdminPasswordApi(currentPassword, newPassword);
      
      if (result.success) {
        // Update stored password
        setAdminPassword(newPassword);
        handleDialogChange(false);
        // Show success message (you might want to add a toast notification here)
        alert("סיסמה עודכנה בהצלחה. יש לעדכן את משתנה הסביבה ADMIN_PASSWORD ולהפעיל מחדש את האפליקציה.");
      } else {
        setError(result.message || "שגיאה בעדכון הסיסמה");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בעדכון הסיסמה";
      if (message.includes("INVALID_CURRENT_PASSWORD")) {
        setError("סיסמה נוכחית שגויה");
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="text-right">
        <DialogHeader>
          <DialogTitle>שינוי סיסמת מנהל</DialogTitle>
          <DialogDescription>
            עדכן את סיסמת המנהל. לאחר השינוי, יש לעדכן את משתנה הסביבה ADMIN_PASSWORD ולהפעיל מחדש את האפליקציה.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">סיסמה נוכחית</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••"
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">סיסמה חדשה</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••"
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">אישור סיסמה</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••"
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </div>
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
            {isSubmitting ? "מעדכן..." : "עדכן סיסמה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

