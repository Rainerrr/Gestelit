import { memo, useMemo } from "react";
import { Activity, Zap, AlertTriangle, Package } from "lucide-react";

type KpiCardsProps = {
  activeCount: number;
  productionCount: number;
  stopCount: number;
  totalGood: number;
  isLoading: boolean;
};

const formatNumber = (value: number) =>
  Intl.NumberFormat("he-IL").format(value);

type KpiCardConfig = {
  label: string;
  value: number;
  icon: React.ElementType;
  color: "amber" | "emerald" | "red" | "blue";
  suffix?: string;
};

const colorConfig = {
  amber: {
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    valueBg: "from-primary/5 to-transparent",
    borderHover: "hover:border-primary/30",
    glow: "group-hover:shadow-primary/5",
  },
  emerald: {
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    valueBg: "from-emerald-500/5 to-transparent",
    borderHover: "hover:border-emerald-500/30",
    glow: "group-hover:shadow-emerald-500/5",
  },
  red: {
    iconBg: "bg-red-500/10",
    iconColor: "text-red-600 dark:text-red-400",
    valueBg: "from-red-500/5 to-transparent",
    borderHover: "hover:border-red-500/30",
    glow: "group-hover:shadow-red-500/5",
  },
  blue: {
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-600 dark:text-blue-400",
    valueBg: "from-blue-500/5 to-transparent",
    borderHover: "hover:border-blue-500/30",
    glow: "group-hover:shadow-blue-500/5",
  },
};

const KpiCard = ({ label, value, icon: Icon, color, suffix, isLoading }: KpiCardConfig & { isLoading: boolean }) => {
  const colors = colorConfig[color];

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur-sm p-4 transition-all duration-300 ${colors.borderHover} hover:shadow-xl ${colors.glow}`}
    >
      {/* Subtle gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.valueBg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <div className="flex items-baseline gap-1.5">
              {isLoading ? (
                <div className="h-9 w-16 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  <span className="text-3xl font-bold text-foreground tabular-nums tracking-tight lg:text-4xl">
                    {formatNumber(value)}
                  </span>
                  {suffix && (
                    <span className="text-sm text-muted-foreground">{suffix}</span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.iconBg}`}>
            <Icon className={`h-5 w-5 ${colors.iconColor}`} />
          </div>
        </div>

        {/* Bottom accent line */}
        <div className="absolute -bottom-4 -left-4 -right-4 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
};

const KpiCardsComponent = ({
  activeCount,
  productionCount,
  stopCount,
  totalGood,
  isLoading,
}: KpiCardsProps) => {
  const items: KpiCardConfig[] = useMemo(
    () => [
      { label: "תחנות פעילות", value: activeCount, icon: Activity, color: "amber" },
      { label: "בסטטוס ייצור", value: productionCount, icon: Zap, color: "emerald" },
      { label: "עצירות/שיבושים", value: stopCount, icon: AlertTriangle, color: "red" },
      { label: "כמות תקינה", value: totalGood, icon: Package, color: "blue" },
    ],
    [activeCount, productionCount, stopCount, totalGood],
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {items.map((item) => (
        <KpiCard key={item.label} {...item} isLoading={isLoading} />
      ))}
    </div>
  );
};

const areEqual = (prev: KpiCardsProps, next: KpiCardsProps) =>
  prev.isLoading === next.isLoading &&
  prev.activeCount === next.activeCount &&
  prev.productionCount === next.productionCount &&
  prev.stopCount === next.stopCount &&
  prev.totalGood === next.totalGood;

export const KpiCards = memo(KpiCardsComponent, areEqual);
