"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  Database,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
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

export type SalesDashboardAdvancedFilterState = {
  owner: string;
  group: string;
  area: string;
  dormancy: "" | "90" | "180";
  coverage: "" | "current" | "partial" | "complete";
};

type AdvancedFilterKey = keyof SalesDashboardAdvancedFilterState;

export type SalesDashboardAdvancedFilterContract = {
  value: SalesDashboardAdvancedFilterState;
  onChange: (next: SalesDashboardAdvancedFilterState) => void;
  options?: Partial<Record<"owners" | "groups" | "areas", string[]>>;
  enabled?: Partial<Record<AdvancedFilterKey, boolean>>;
  coverageLabel?: string;
};

export const DEFAULT_SALES_DASHBOARD_FILTERS: SalesDashboardFilterState = {
  period: "90",
  dateFrom: localDateInput(new Date(Date.now() - 89 * 86_400_000)),
  dateTo: localDateInput(new Date()),
  salesperson: "",
  client: "",
  eventType: "",
  status: "",
};

function localDateInput(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

export const DEFAULT_SALES_DASHBOARD_ADVANCED_FILTERS: SalesDashboardAdvancedFilterState = {
  owner: "",
  group: "",
  area: "",
  dormancy: "",
  coverage: "",
};

const periods = [
  { value: "7", label: "7 ימים" },
  { value: "30", label: "30 ימים" },
  { value: "90", label: "90 ימים" },
  { value: "365", label: "שנה" },
  { value: "custom", label: "טווח אחר" },
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
  { value: "", label: "כל המצבים" },
  { value: "new", label: "חדש" },
  { value: "open", label: "פתוח" },
  { value: "follow_up", label: "צריך לחזור" },
  { value: "won", label: "נסגר" },
  { value: "lost", label: "לא נסגר" },
  { value: "done", label: "בוצע" },
];

const quickFilters: Array<{
  id: string;
  label: string;
  update: Pick<SalesDashboardFilterState, "eventType" | "status">;
}> = [
  { id: "follow-up", label: "צריך לחזור", update: { eventType: "", status: "follow_up" } },
  { id: "open", label: "עסקאות פתוחות", update: { eventType: "", status: "open" } },
  { id: "meetings", label: "פגישות", update: { eventType: "meeting", status: "" } },
  { id: "sales", label: "מכירות", update: { eventType: "sale", status: "" } },
];

export type AppliedFilterChip = { key: string; label: string };

export function getQuickFilterState(
  value: SalesDashboardFilterState,
  update: Pick<SalesDashboardFilterState, "eventType" | "status">,
): SalesDashboardFilterState {
  const active = value.eventType === update.eventType && value.status === update.status;
  return { ...value, eventType: active ? "" : update.eventType, status: active ? "" : update.status };
}

export function getAppliedFilterChips(value: SalesDashboardFilterState): AppliedFilterChip[] {
  const chips: AppliedFilterChip[] = [];
  if (value.period !== "90") {
    const period = periods.find((option) => option.value === value.period);
    chips.push({
      key: "period",
      label: value.period === "custom" && (value.dateFrom || value.dateTo)
        ? `${value.dateFrom || "התחלה"} - ${value.dateTo || "היום"}`
        : period?.label ?? "תקופה",
    });
  }
  if (value.salesperson) chips.push({ key: "salesperson", label: value.salesperson });
  if (value.client) chips.push({ key: "client", label: value.client });
  if (value.eventType) chips.push({
    key: "eventType",
    label: eventTypes.find((option) => option.value === value.eventType)?.label ?? value.eventType,
  });
  if (value.status) chips.push({
    key: "status",
    label: statuses.find((option) => option.value === value.status)?.label ?? value.status,
  });
  return chips;
}

type Props = {
  value: SalesDashboardFilterState;
  appliedValue?: SalesDashboardFilterState;
  onChange: (next: SalesDashboardFilterState) => void;
  onApply: (next?: SalesDashboardFilterState) => void;
  onReset: () => void;
  salespeople: string[];
  clients: string[];
  activeCount: number;
  isLoading: boolean;
  isExporting: boolean;
  onExport: () => void;
  advanced?: SalesDashboardAdvancedFilterContract;
};

export function SalesDashboardFilters({
  value,
  appliedValue = value,
  onChange,
  onApply,
  onReset,
  salespeople,
  clients,
  activeCount,
  isLoading,
  isExporting,
  onExport,
  advanced,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const patch = (update: Partial<SalesDashboardFilterState>) => onChange({ ...value, ...update });
  const appliedChips = getAppliedFilterChips(appliedValue);
  const advancedValue = advanced?.value ?? DEFAULT_SALES_DASHBOARD_ADVANCED_FILTERS;
  if (advancedValue.owner) appliedChips.push({ key: "owner", label: `מנהל לקוח: ${advancedValue.owner}` });
  if (advancedValue.group) appliedChips.push({ key: "group", label: `קבוצה: ${advancedValue.group}` });
  if (advancedValue.area) appliedChips.push({ key: "area", label: `אזור: ${advancedValue.area}` });
  if (advancedValue.dormancy) appliedChips.push({ key: "dormancy", label: advancedValue.dormancy === "180" ? "ללא פנייה מתועדת 6 חודשים" : "ללא פנייה מתועדת 3 חודשים" });
  if (advancedValue.coverage) appliedChips.push({ key: "coverage", label: `כיסוי: ${advancedValue.coverage}` });
  const patchAdvanced = (update: Partial<SalesDashboardAdvancedFilterState>) => {
    advanced?.onChange({ ...advancedValue, ...update });
  };
  const advancedEnabled = (key: AdvancedFilterKey) => Boolean(advanced?.enabled?.[key] && advanced?.onChange);

  const applyQuickFilter = (update: Pick<SalesDashboardFilterState, "eventType" | "status">) => {
    const next = getQuickFilterState(value, update);
    onChange(next);
    onApply(next);
  };

  return (
    <section className="rounded-lg border border-border bg-card/65" aria-label="סינון נתוני מכירות">
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4 md:pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">סינון הדוח</h2>
            {activeCount > 0 ? <Badge variant="secondary">{activeCount} מסננים</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground md:hidden">
            {appliedChips.length > 0 ? "הסינון הפעיל מוצג למטה" : "מוצגים 90 הימים האחרונים"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-controls="sales-dashboard-filter-panel"
          className="gap-2 md:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {isOpen ? "סגירה" : "מסננים"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </Button>
      </div>

      {appliedChips.length > 0 ? (
        <div className="flex max-w-full gap-1.5 overflow-x-auto border-t border-border/70 px-3 py-2 sm:px-4 md:border-t-0 md:pt-0" aria-label="מסננים פעילים">
          {appliedChips.map((chip) => (
            <Badge key={chip.key} variant="outline" className="shrink-0 bg-background/65 font-normal">{chip.label}</Badge>
          ))}
        </div>
      ) : null}

      <div id="sales-dashboard-filter-panel" className={cn("border-t border-border/70 md:block", !isOpen && "hidden md:block")}>
        <div className="space-y-4 p-3 sm:p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">סינון מהיר</span>
              <span className="text-[11px] text-muted-foreground">מבוסס על הדיווחים הקיימים</span>
            </div>
            <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1" aria-label="סינון מהיר">
              {quickFilters.map((quickFilter) => {
                const active = value.eventType === quickFilter.update.eventType && value.status === quickFilter.update.status;
                return (
                  <Button
                    key={quickFilter.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => applyQuickFilter(quickFilter.update)}
                    className="h-8 shrink-0 px-3"
                    aria-pressed={active}
                  >
                    {quickFilter.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1" aria-label="תקופת ניתוח">
                {periods.map((period) => (
                  <Button
                    key={period.value}
                    type="button"
                    size="sm"
                    variant={value.period === period.value ? "default" : "outline"}
                    onClick={() => patch({ period: period.value })}
                    className="h-8 shrink-0 px-3"
                  >
                    {period.label}
                  </Button>
                ))}
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
                        <Input id="sales-filter-date-from" dir="ltr" type="date" value={value.dateFrom} onChange={(event) => patch({ period: "custom", dateFrom: event.target.value })} className="bg-card text-foreground opacity-100 [color-scheme:light] dark:[color-scheme:dark]" />
                      </FilterField>
                      <FilterField label="עד תאריך" htmlFor="sales-filter-date-to">
                        <Input id="sales-filter-date-to" dir="ltr" type="date" value={value.dateTo} onChange={(event) => patch({ period: "custom", dateTo: event.target.value })} className="bg-card text-foreground opacity-100 [color-scheme:light] dark:[color-scheme:dark]" />
                      </FilterField>
                    </>
                  ) : (
                    <div className="flex h-full min-h-16 items-end gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="mb-3 h-4 w-4" />
                      <span className="mb-3">הסינון חל על הדשבורד ועל קובץ האקסל</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <details className="rounded-md border border-dashed border-border bg-background/35">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-medium">
              <span className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" />מסנני לקוח מתקדמים</span>
              <Badge variant="outline" className="shrink-0 font-normal">נתונים חלקיים</Badge>
            </summary>
            <div className="border-t border-border p-3">
              <p className="mb-3 text-xs leading-5 text-muted-foreground">
                {advanced?.coverageLabel ?? "בעלות לקוח, אזור והיסטוריית קשר מלאה יופעלו אחרי השלמת נתוני הרטרו מ-BINA. מסנן לא זמין אינו משפיע על המדדים."}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <AdvancedSelect label="מנהל לקוח" value={advancedValue.owner} disabled={!advancedEnabled("owner")} onChange={(owner) => patchAdvanced({ owner })} options={advanced?.options?.owners ?? []} emptyLabel="כל מנהלי הלקוחות" />
                <AdvancedSelect label="קבוצת לקוח" value={advancedValue.group} disabled={!advancedEnabled("group")} onChange={(group) => patchAdvanced({ group })} options={advanced?.options?.groups ?? []} emptyLabel="כל הקבוצות" />
                <AdvancedSelect label="אזור" value={advancedValue.area} disabled={!advancedEnabled("area")} onChange={(area) => patchAdvanced({ area })} options={advanced?.options?.areas ?? []} emptyLabel="כל האזורים" />
                <AdvancedSelect label="ללא קשר" value={advancedValue.dormancy} disabled={!advancedEnabled("dormancy")} onChange={(dormancy) => patchAdvanced({ dormancy: dormancy as SalesDashboardAdvancedFilterState["dormancy"] })} options={["90", "180"]} labels={{ "90": "90 יום", "180": "180 יום" }} emptyLabel="כל הלקוחות" />
                <AdvancedSelect label="כיסוי נתונים" value={advancedValue.coverage} disabled={!advancedEnabled("coverage")} onChange={(coverage) => patchAdvanced({ coverage: coverage as SalesDashboardAdvancedFilterState["coverage"] })} options={["current", "partial", "complete"]} labels={{ current: "נתונים נוכחיים", partial: "כיסוי חלקי", complete: "כיסוי מלא" }} emptyLabel="כל רמות הכיסוי" />
              </div>
            </div>
          </details>
        </div>

        <div className="sticky bottom-0 z-10 grid grid-cols-[44px_minmax(0,1fr)] gap-2 border-t border-border bg-card/95 p-3 backdrop-blur-sm md:static md:grid-cols-[44px_minmax(120px,1fr)_minmax(180px,auto)] md:bg-transparent md:p-4 md:pt-3 md:backdrop-blur-none xl:mr-auto xl:max-w-xl">
          <Button type="button" variant="outline" size="icon" onClick={onReset} aria-label="איפוס מסננים" title="איפוס מסננים">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button type="button" onClick={() => onApply()} disabled={isLoading} className="gap-2">
            <Filter className="h-4 w-4" />
            {isLoading ? "טוען..." : "הצג תוצאות"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onExport}
            disabled={isExporting || isLoading}
            className="col-span-2 gap-2 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 md:col-span-1"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {isExporting ? "מכין דוח..." : "הורדת דוח אקסל"}
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

function AdvancedSelect({
  label,
  value,
  disabled,
  onChange,
  options,
  labels,
  emptyLabel,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  emptyLabel: string;
}) {
  return (
    <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        {label}
        {disabled ? <span className="text-[10px]">ממתין ל-BINA</span> : null}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-55"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
      </select>
    </label>
  );
}
