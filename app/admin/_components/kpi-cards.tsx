import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type KpiCardsProps = {
  activeCount: number;
  productionCount: number;
  stopCount: number;
  totalGood: number;
  isLoading: boolean;
};

const formatNumber = (value: number) =>
  Intl.NumberFormat("he-IL").format(value);

const KpiCardsComponent = ({
  activeCount,
  productionCount,
  stopCount,
  totalGood,
  isLoading,
}: KpiCardsProps) => {
  const items = useMemo(
    () => [
      { label: "תחנות פעילות", value: activeCount },
      { label: "בסטטוס ייצור", value: productionCount },
      { label: "עצירות/שיבושים", value: stopCount },
      { label: "כמות תקינה", value: totalGood },
    ],
    [activeCount, productionCount, stopCount, totalGood],
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500 sm:text-sm">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold sm:text-3xl">
              {isLoading ? "..." : formatNumber(item.value)}
            </p>
          </CardContent>
        </Card>
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
