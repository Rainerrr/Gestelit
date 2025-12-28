import { Suspense } from "react";
import { GeneralReportsDashboard } from "./_components/general-reports-dashboard";

export const metadata = {
  title: "דיווחים כלליים | Gestelit Work Monitor",
  description: "ניהול דיווחי סטטוס",
};

export default function GeneralReportsPage() {
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
      <GeneralReportsDashboard />
    </Suspense>
  );
}
