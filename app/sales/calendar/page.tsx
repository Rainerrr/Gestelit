"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export default function SalesCalendarPage() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function update(revoke = false) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sales/calendar", {
        method: revoke ? "DELETE" : "POST",
      });
      if (!r.ok) throw Error();
      const data = await r.json();
      setUrl(revoke ? "" : new URL(data.path, location.origin).href);
      setMessage(
        revoke
          ? "הקישור בוטל. יש להסיר את היומן גם מתוך Outlook."
          : "הקישור האישי מוכן. קישור קודם, אם היה, בוטל.",
      );
    } catch {
      setMessage("לא הצלחנו לעדכן את החיבור. נסו שוב לאחר התחברות.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 pb-28" dir="rtl">
      <div>
        <p className="text-sm text-muted-foreground">סביבת המכירות שלי</p>
        <h1 className="mt-2 text-3xl font-bold">משימות המשך ביומן Outlook</h1>
        <p className="mt-3 text-muted-foreground">
          המשימות האישיות והתאריכים שנשמרו בגסטליט יופיעו ביומן נוסף בחשבון שלך.
        </p>
      </div>
      <Card className="space-y-5 p-6">
        <h2 className="text-lg font-semibold">חיבור היומן האישי</h2>
        <p className="text-sm leading-7">
          החיבור מעדכן את Outlook מתוך גסטליט. שינויים מבצעים כאן במערכת.
          Outlook קובע את תדירות הרענון, ולכן עדכונים עשויים להופיע לאחר השהיה.
        </p>
        <Button onClick={() => void update()} disabled={busy}>
          יצירת קישור אישי ליומן
        </Button>
        {url && (
          <div className="space-y-4">
            <label className="block text-sm">
              קישור פרטי — כל מי שמחזיק בו יכול לצפות במשימות שביומן
              <input
                className="mt-2 w-full rounded border bg-background p-3 text-xs"
                dir="ltr"
                readOnly
                value={url}
                aria-label="קישור אישי ליומן"
              />
            </label>
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(url).then(
                  () => setMessage("הקישור הועתק"),
                  () => setMessage("אפשר לסמן ולהעתיק את הקישור ידנית"),
                )
              }
            >
              העתקת הקישור
            </Button>
            <ol className="list-decimal space-y-3 pr-5 text-sm">
              <li>פתחו את יומן Outlook ובחרו הוספת לוח שנה.</li>
              <li>בחרו ״הרשמה מהאינטרנט״ (Subscribe from web).</li>
              <li>הדביקו את הקישור, תנו ליומן שם ושמרו.</li>
            </ol>
          </div>
        )}
        <p role="status" className="text-sm">
          {message}
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void update(true)}
        >
          ביטול הקישור הפעיל
        </Button>
      </Card>
      <p className="text-sm text-muted-foreground">
        להוספה חד־פעמית אפשר להשתמש בכפתור ״הוסף ליומן״ ליד כל משימת המשך
        ולהוריד קובץ ICS.
      </p>
    </main>
  );
}
