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
    label: "דיווחים כלליים",
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
        <div className="flex flex-col gap-4 text-right">
          {/* Mobile simplified title */}
          <div className="flex items-center gap-3 lg:hidden">
            <LayoutList className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">דיווחים</h1>
          </div>
          {/* Desktop full header */}
          <div className="hidden lg:block space-y-1 text-right">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">מערכת דיווחים</p>
            <h1 className="text-2xl font-bold text-foreground tracking-tight lg:text-3xl">
              ניהול דיווחים ותקלות
            </h1>
            <p className="text-sm text-muted-foreground">
              צפייה וניהול תקלות, דיווחים כלליים ודיווחי פסולים מהתחנות
            </p>
          </div>
        </div>
      }
    >
      {/* Tabs navigation */}
      <div className="mb-6">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
          {reportsTabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shrink-0",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page content */}
      {children}
    </AdminLayout>
  );
}
