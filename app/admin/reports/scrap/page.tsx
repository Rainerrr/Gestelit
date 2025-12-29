import { Suspense } from "react";
import { ScrapReportsDashboard } from "./_components/scrap-reports-dashboard";

export const metadata = {
  title: "דיווחי פסולים | Gestelit Work Monitor",
  description: "ניהול דיווחי פסולים",
};

export default function ScrapReportsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="font-mono text-sm text-muted-foreground tracking-wider">טוען נתונים...</p>
        </div>
      </div>
    }>
      <ScrapReportsDashboard />
    </Suspense>
  );
}
