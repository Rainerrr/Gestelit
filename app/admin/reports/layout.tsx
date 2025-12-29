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
        <div className="flex flex-col gap-3">
          {/* Main header row */}
          <div className="flex items-center gap-3">
            <LayoutList className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">דיווחים</h1>
          </div>

          {/* Capsule-style tabs */}
          <div className="flex items-center">
            <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-card/80 backdrop-blur-sm">
              {reportsTabs.map((tab) => {
                const isActive = pathname === tab.href;
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                      "sm:gap-2 sm:px-4 sm:py-2",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    <Icon className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary-foreground" : ""
                    )} />
                    <span className="hidden xs:inline sm:inline">{tab.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      }
    >
      {/* Page content */}
      {children}
    </AdminLayout>
  );
}
