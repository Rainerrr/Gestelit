"use client";

import { useEffect, useState } from "react";
import { Building2, Check, MapPin, ReceiptText, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSalesClientApi } from "@/lib/api/sales-portal";
import {
  BINA_CLIENT_AREA_OPTIONS,
  BINA_CLIENT_STATUS_OPTIONS,
  type PendingBinaClient,
  type PendingBinaClientInput,
} from "@/lib/data/bina-client-onboarding";

const emptyForm: PendingBinaClientInput = {
  customer_name: "",
  legal_name: "",
  customer_group: "",
  area_code: "",
  area: "",
  status: "פעיל",
  customer_warehouse: "",
  address_line: "",
  neighborhood: "",
  city: "",
  po_box: "",
  postal_code: "",
  bookkeeping_no: "",
  tax_id: "",
  contact_person: "",
  phone: "",
  mobile: "",
  email: "",
  notes: "",
};

const errorLabels: Record<string, string> = {
  CLIENT_NAME_REQUIRED: "צריך לכתוב שם לקוח של לפחות שני תווים.",
  CLIENT_GROUP_REQUIRED: "צריך לבחור קבוצת לקוח.",
  INVALID_CLIENT_EMAIL: "כתובת האימייל לא תקינה.",
  INVALID_CLIENT_TAX_ID: "מספר העוסק צריך לכלול 5 עד 15 ספרות, ואפשר גם מקפים.",
  INVALID_CLIENT_AREA: "האזור שבחרתם לא קיים ברשימה של BINA.",
  CLIENT_ALREADY_EXISTS: "כבר יש לקוח בשם הזה. חזרו לחיפוש ובחרו אותו מהרשימה.",
  CLIENT_SIMILAR_EXISTS: "מצאנו לקוח עם שם דומה. בדקו את הרשימה; אם זה לקוח אחר, אפשר להוסיף אותו בכל זאת.",
  SALES_UNAUTHORIZED: "החיבור הסתיים. התחברו מחדש.",
};

type NewClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (client: PendingBinaClient) => void;
};

export function NewClientDialog({ open, onOpenChange, initialName = "", onCreated }: NewClientDialogProps) {
  const [groups, setGroups] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/sales/client-options", { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data) => setGroups(data.groups))
      .catch(() => { if (!controller.signal.aborted) setGroups([]); });
    return () => controller.abort();
  }, [open]);
  const [form, setForm] = useState<PendingBinaClientInput>({ ...emptyForm });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [similarNameConfirmed, setSimilarNameConfirmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm, customer_name: initialName.trim() });
    setError(null);
    setSimilarNameConfirmed(false);
  }, [initialName, open]);

  const setField = <K extends keyof PendingBinaClientInput>(key: K, value: PendingBinaClientInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "customer_name") setSimilarNameConfirmed(false);
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await createSalesClientApi({
        ...form,
        allow_similar_name: similarNameConfirmed,
      }) as { client: PendingBinaClient };
      onCreated(result.client);
      onOpenChange(false);
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : "CLIENT_CREATE_FAILED";
      setError(errorLabels[code] ?? "הלקוח לא נשמר. נסו שוב.");
      if (code === "CLIENT_SIMILAR_EXISTS") setSimilarNameConfirmed(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" desktopBreakpoint="lg" className="max-h-[92dvh] lg:max-w-2xl">
        <DialogHeader className="pl-10 pr-0">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl">הוספת לקוח</DialogTitle>
          <DialogDescription>
            נשמור את הלקוח בגסטליט. כשחיבור BINA יהיה מוכן, יהיה אפשר להעביר אותו גם לשם.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pb-1">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <FormSection icon={Building2} title="פרטי הלקוח">
            <Field label="שם לקוח" required>
              <Input
                value={form.customer_name}
                onChange={(event) => setField("customer_name", event.target.value)}
                placeholder="השם שיופיע בחיפוש ובמסמכים"
                className="h-12 rounded-xl text-base lg:h-10 lg:text-sm"
                autoFocus
              />
            </Field>
            <Field label="שם החברה הרשמי">
              <Input
                value={form.legal_name ?? ""}
                onChange={(event) => setField("legal_name", event.target.value)}
                placeholder="אם שונה משם הלקוח"
                className="h-12 rounded-xl text-base lg:h-10 lg:text-sm"
              />
            </Field>
            <Field label="קבוצה" required>
              <Input
                list="bina-client-groups"
                value={form.customer_group}
                onChange={(event) => setField("customer_group", event.target.value)}
                placeholder="בחרו או הקלידו קבוצה"
                className="h-12 rounded-xl text-base lg:h-10 lg:text-sm"
              />
              <datalist id="bina-client-groups">
                {groups.map((option: string) => <option key={option} value={option} />)}
              </datalist>
            </Field>
            <Field label="אזור">
              <Select
                value={form.area_code ?? ""}
                onValueChange={(code) => {
                  const selectedArea = BINA_CLIENT_AREA_OPTIONS.find((option) => option.code === code);
                  setForm((current) => ({
                    ...current,
                    area_code: code,
                    area: selectedArea?.label ?? null,
                  }));
                }}
              >
                <SelectTrigger className="h-12 rounded-xl text-base lg:h-10 lg:text-sm">
                  <SelectValue placeholder="בחרו אזור" />
                </SelectTrigger>
                <SelectContent>
                  {BINA_CLIENT_AREA_OPTIONS.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      <span className="flex items-center gap-2">
                        <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">{option.code}</bdi>
                        <span>{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="מצב הלקוח">
              <Select value={form.status ?? "פעיל"} onValueChange={(value) => setField("status", value)}>
                <SelectTrigger className="h-12 rounded-xl text-base lg:h-10 lg:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BINA_CLIENT_STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="מחסן לקוח">
              <Input
                value={form.customer_warehouse ?? ""}
                onChange={(event) => setField("customer_warehouse", event.target.value)}
                placeholder="אם מוגדר ב-BINA"
                className="h-12 rounded-xl text-base lg:h-10 lg:text-sm"
              />
            </Field>
          </FormSection>

          <FormSection icon={MapPin} title="כתובת ופרטי קשר">
            <Field label="איש קשר">
              <Input value={form.contact_person ?? ""} onChange={(event) => setField("contact_person", event.target.value)} className="h-12 rounded-xl text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="טלפון נייד">
              <Input dir="ltr" inputMode="tel" value={form.mobile ?? ""} onChange={(event) => setField("mobile", event.target.value)} className="h-12 rounded-xl text-left text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="טלפון נוסף">
              <Input dir="ltr" inputMode="tel" value={form.phone ?? ""} onChange={(event) => setField("phone", event.target.value)} className="h-12 rounded-xl text-left text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="אימייל">
              <Input dir="ltr" type="email" value={form.email ?? ""} onChange={(event) => setField("email", event.target.value)} className="h-12 rounded-xl text-left text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="כתובת" className="lg:col-span-2">
              <Input value={form.address_line ?? ""} onChange={(event) => setField("address_line", event.target.value)} className="h-12 rounded-xl text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="עיר">
              <Input value={form.city ?? ""} onChange={(event) => setField("city", event.target.value)} className="h-12 rounded-xl text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="שכונה">
              <Input value={form.neighborhood ?? ""} onChange={(event) => setField("neighborhood", event.target.value)} className="h-12 rounded-xl text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="ת.ד.">
              <Input dir="ltr" value={form.po_box ?? ""} onChange={(event) => setField("po_box", event.target.value)} className="h-12 rounded-xl text-left text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="מיקוד">
              <Input dir="ltr" inputMode="numeric" value={form.postal_code ?? ""} onChange={(event) => setField("postal_code", event.target.value)} className="h-12 rounded-xl text-left text-base lg:h-10 lg:text-sm" />
            </Field>
          </FormSection>

          <FormSection icon={ReceiptText} title="פרטי הנהלת חשבונות">
            <Field label="מספר הנה״ח">
              <Input dir="ltr" value={form.bookkeeping_no ?? ""} onChange={(event) => setField("bookkeeping_no", event.target.value)} className="h-12 rounded-xl text-left text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="עוסק מורשה / ח.פ.">
              <Input dir="ltr" inputMode="numeric" value={form.tax_id ?? ""} onChange={(event) => setField("tax_id", event.target.value)} className="h-12 rounded-xl text-left text-base lg:h-10 lg:text-sm" />
            </Field>
            <Field label="הערות" className="lg:col-span-2">
              <Textarea
                value={form.notes ?? ""}
                onChange={(event) => setField("notes", event.target.value)}
                placeholder="כל מידע שכדאי לדעת על הלקוח"
                className="min-h-24 rounded-xl text-base lg:text-sm"
              />
            </Field>
          </FormSection>
        </div>

        <DialogFooter className="border-t border-border/70 pt-3 sm:flex-col-reverse sm:justify-normal sm:gap-2 lg:flex-row-reverse lg:justify-start lg:gap-3">
          <Button onClick={() => void save()} disabled={isSaving} className="h-12 gap-2 rounded-xl lg:min-w-40">
            <Check className="h-4 w-4" />
            {isSaving ? "שומר..." : similarNameConfirmed ? "הוסף בכל זאת" : "שמור והמשך לדיווח"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving} className="h-12 rounded-xl">
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({ icon: Icon, title, children }: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, required = false, className, children }: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">
        {label}{required ? <span className="mr-1 text-red-600">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
