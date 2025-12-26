import { Suspense } from "react";
import { MalfunctionsDashboard } from "./_components/malfunctions-dashboard";

export const metadata = {
  title: "תקלות | Gestelit Work Monitor",
  description: "ניהול תקלות תחנות",
};

export default function MalfunctionsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="font-mono text-sm text-muted-foreground tracking-wider">טוען נתונים...</p>
        </div>
      </div>
    }>
      <MalfunctionsDashboard />
    </Suspense>
  );
}
