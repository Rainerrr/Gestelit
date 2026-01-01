"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, FileText, Trash2, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminLayout } from "../_components/admin-layout";
import { useAdminGuard } from "@/hooks/useAdminGuard";

const reportsTabs = [
  {
    href: "/admin/reports/malfunctions",
    label: "תקלות",
    icon: AlertTriangle,
  },
  {
    href: "/admin/reports/general",
    label: "כלליים",
    icon: FileText,
  },
  {
    href: "/admin/reports/scrap",
    label: "פסולים",
    icon: Trash2,
  },
];

// Moved outside component to avoid creating during render
const MobileBottomBar = ({ pathname }: { pathname: string }) => (
  <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
    <div className="border-t border-border/80 bg-card/95 backdrop-blur-md px-2 py-1.5 safe-area-pb">
      <div className="flex items-center justify-around">
        {reportsTabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
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
              <Icon className={cn(
                "h-5 w-5",
                isActive ? "text-primary" : ""
              )} />
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
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right: Empty spacer for balance */}
          <div className="hidden sm:block shrink-0 w-[100px]" />
        </div>
      }
      mobileBottomBar={<MobileBottomBar pathname={pathname} />}
    >
      {/* Page content */}
      {children}
    </AdminLayout>
  );
}
