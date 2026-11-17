import { memo } from "react";
import { Activity, Zap, AlertTriangle, Package } from "lucide-react";

type KpiCardsProps = { activeCount: number; productionCount: number; stopCount: number; totalGood: number; isLoading: boolean };
export const KpiCards = memo(function KpiCards({activeCount, productionCount, stopCount, totalGood, isLoading}: KpiCardsProps) {
  const items = [
    {label: "תחנות פעילות", value: activeCount, icon: Activity, color: "text-primary"},
    {label: "בייצור עכשיו", value: productionCount, icon: Zap, color: "text-emerald-600"},
    {label: "בעצירה", value: stopCount, icon: AlertTriangle, color: "text-amber-600"},
    {label: "יחידות תקינות במשמרות הפעילות", value: totalGood, icon: Package, color: "text-primary"},
  ];
  return <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-4">
    {items.map(({label, value, icon: Icon, color}) => <div key={label} className="border-b border-l border-border/70 p-4 last:border-l-0 lg:border-b-0 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2"><p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p><Icon className={`h-4 w-4 shrink-0 ${color}`} /></div>
      {isLoading ? <div className="h-9 w-16 animate-pulse rounded bg-muted" /> : <p className="text-3xl font-semibold tabular-nums tracking-tight">{new Intl.NumberFormat("he-IL").format(value)}</p>}
    </div>)}
  </div>;
});
