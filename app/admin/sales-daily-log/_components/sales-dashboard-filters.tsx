"use client";

import type { ReactNode } from "react";
import { CalendarDays, Filter, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SalesDashboardFilterState = {
  period: "7" | "30" | "90" | "365" | "custom";
  dateFrom: string;
  dateTo: string;
  salesperson: string;
  client: string;
  eventType: string;
  status: string;
};

export const DEFAULT_SALES_DASHBOARD_FILTERS: SalesDashboardFilterState = {
  period: "90",
  dateFrom: "",
  dateTo: "",
  salesperson: "",
  client: "",
  eventType: "",
  status: "",
};

const periods = [
  { value: "7", label: "7 ימים" },
  { value: "30", label: "30 ימים" },
  { value: "90", label: "90 ימים" },
  { value: "365", label: "שנה" },
  { value: "custom", label: "מותאם" },
] as const;

const eventTypes = [
  { value: "", label: "כל הפעילויות" },
  { value: "call", label: "שיחה" },
  { value: "meeting", label: "פגישה" },
  { value: "lead", label: "ליד" },
  { value: "sale", label: "מכירה" },
  { value: "follow_up", label: "פולואפ" },
];

const statuses = [
  { value: "", label: "כל הסטטוסים" },
  { value: "new", label: "חדש" },
  { value: "open", label: "פתוח" },
  { value: "follow_up", label: "להמשך טיפול" },
  { value: "won", label: "זכייה" },
  { value: "lost", label: "אבד" },
  { value: "done", label: "בוצע" },
];

type Props = {
  value: SalesDashboardFilterState;
  onChange: (next: SalesDashboardFilterState) => void;
  onApply: () => void;
  onReset: () => void;
  salespeople: string[];
  clients: string[];
  activeCount: number;
  isLoading: boolean;
};

export function SalesDashboardFilters({
  value,
  onChange,
  onApply,
  onReset,
  salespeople,
  clients,
  activeCount,
  isLoading,
}: Props) {
  const patch = (update: Partial<SalesDashboardFilterState>) => onChange({ ...value, ...update });

  return (
    <section className="rounded-lg border border-border bg-card/65 p-3 sm:p-4" aria-label="סינון נתוני מכירות">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">חתך ניהולי</h2>
              {activeCount > 0 ? <Badge variant="secondary">{activeCount} מסננים</Badge> : null}
            </div>
            <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1" aria-label="תקופת ניתוח">
              {periods.map((period) => (
                <Button
                  key={period.value}
                  type="button"
                  size="sm"
                  variant={value.period === period.value ? "default" : "ghost"}
                  onClick={() => patch({ period: period.value })}
                  className="h-8 shrink-0 px-3"
                >
                  {period.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FilterField label="איש מכירות" htmlFor="sales-filter-salesperson">
              <select
                id="sales-filter-salesperson"
                value={value.salesperson}
                onChange={(event) => patch({ salesperson: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring"
              >
                <option value="">כל אנשי המכירות</option>
                {salespeople.map((person) => <option key={person} value={person}>{person}</option>)}
              </select>
            </FilterField>

            <FilterField label="לקוח" htmlFor="sales-filter-client">
              <Input
                id="sales-filter-client"
                value={value.client}
                onChange={(event) => patch({ client: event.target.value })}
                list="sales-dashboard-client-options"
                placeholder="שם או קוד לקוח"
              />
              <datalist id="sales-dashboard-client-options">
                {clients.map((client) => <option key={client} value={client} />)}
              </datalist>
            </FilterField>

            <FilterField label="סוג פעילות" htmlFor="sales-filter-event-type">
              <select
                id="sales-filter-event-type"
                value={value.eventType}
                onChange={(event) => patch({ eventType: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring"
              >
                {eventTypes.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
              </select>
            </FilterField>

            <FilterField label="סטטוס" htmlFor="sales-filter-status">
              <select
                id="sales-filter-status"
                value={value.status}
                onChange={(event) => patch({ status: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring"
              >
                {statuses.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
              </select>
            </FilterField>

            <div className={cn("grid gap-2", value.period === "custom" ? "grid-cols-2" : "grid-cols-1")}>
              {value.period === "custom" ? (
                <>
                  <FilterField label="מתאריך" htmlFor="sales-filter-date-from">
                    <Input id="sales-filter-date-from" type="date" value={value.dateFrom} onChange={(event) => patch({ dateFrom: event.target.value })} />
                  </FilterField>
                  <FilterField label="עד תאריך" htmlFor="sales-filter-date-to">
                    <Input id="sales-filter-date-to" type="date" value={value.dateTo} onChange={(event) => patch({ dateTo: event.target.value })} />
                  </FilterField>
                </>
              ) : (
                <div className="flex h-full min-h-16 items-end gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="mb-3 h-4 w-4" />
                  <span className="mb-3">התקופה חלה על כל המדדים והטבלאות</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-[44px_minmax(0,1fr)] gap-2 xl:w-44">
          <Button type="button" variant="outline" size="icon" onClick={onReset} aria-label="איפוס מסננים" title="איפוס מסננים">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button type="button" onClick={onApply} disabled={isLoading} className="gap-2">
            <Filter className="h-4 w-4" />
            {isLoading ? "מעדכן..." : "החל סינון"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
