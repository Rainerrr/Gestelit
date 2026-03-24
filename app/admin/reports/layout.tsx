"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { AlertTriangle, FileText, PackageX, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminLayout } from "../_components/admin-layout";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { fetchReportsCountsAdminApi, type ReportCounts } from "@/lib/api/admin-management";

const reportsTabs = [
  {
    href: "/admin/reports/malfunctions",
    label: "תקלות",
    icon: AlertTriangle,
    countKey: "malfunction" as keyof ReportCounts,
  },
  {
    href: "/admin/reports/general",
    label: "כלליים",
    icon: FileText,
    countKey: "general" as keyof ReportCounts,
  },
  {
    href: "/admin/reports/scrap",
    label: "פסולים",
    icon: PackageX,
    countKey: "scrap" as keyof ReportCounts,
  },
];

// Moved outside component to avoid creating during render
const MobileBottomBar = ({ pathname, reportCounts }: { pathname: string; reportCounts: ReportCounts | null }) => (
  <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
    <div className="border-t border-border/80 bg-card/95 backdrop-blur-md px-2 py-1.5 safe-area-pb">
      <div className="flex items-center justify-around">
        {reportsTabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          const count = reportCounts?.[tab.countKey] ?? 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors min-w-[4rem]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:bg-accent"
              )}
            >
              <div className="relative">
                <Icon className={cn(
                  "h-5 w-5",
                  isActive ? "text-primary" : ""
                )} />
                {count > 0 && (
                  <span className="absolute -top-1.5 -left-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[11px] font-medium",
                isActive ? "text-primary" : ""
              )}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  </div>
);

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { hasAccess } = useAdminGuard();
  const [reportCounts, setReportCounts] = useState<ReportCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const { counts } = await fetchReportsCountsAdminApi();
        if (!cancelled) setReportCounts(counts);
      } catch { /* badge won't show */ }
    };
    void fetchCounts();
    const interval = setInterval(() => void fetchCounts(), 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Loading state
  if (hasAccess === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="font-mono text-sm text-muted-foreground tracking-wider">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  // Not authorized
  if (hasAccess === false) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title group */}
          <div className="flex items-center gap-2.5 shrink-0">
            <LayoutList className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">דיווחים</h1>
          </div>

          {/* Center: Capsule-style tabs - desktop only */}
          <div className="hidden sm:flex flex-1 justify-center">
            <div className="inline-flex items-center gap-0.5 p-1 rounded-xl border border-border/80 bg-muted/50 shadow-sm">
              {reportsTabs.map((tab) => {
                const isActive = pathname === tab.href;
                const Icon = tab.icon;
                const count = reportCounts?.[tab.countKey] ?? 0;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "relative flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-background text-foreground shadow-sm border border-border/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    <Icon className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary" : ""
                    )} />
                    <span>{tab.label}</span>
                    {count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right: Empty spacer for balance */}
          <div className="hidden sm:block shrink-0 w-[100px]" />
        </div>
      }
      mobileBottomBar={<MobileBottomBar pathname={pathname} reportCounts={reportCounts} />}
    >
      {/* Page content */}
      {children}
    </AdminLayout>
  );
}
