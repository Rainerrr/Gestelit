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

export const KpiCards = ({
  activeCount,
  productionCount,
  stopCount,
  totalGood,
  isLoading,
}: KpiCardsProps) => {
  const items = [
    { label: "עבודות פעילות", value: activeCount },
    { label: "מכונות בייצור", value: productionCount },
    { label: "מכונות בעצירה/תקלה", value: stopCount },
    { label: "סה\"כ תפוקה טובה", value: totalGood },
  ];

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
              {isLoading ? "—" : formatNumber(item.value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};



