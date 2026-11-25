"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, Settings, LayoutDashboard, History, Wrench, ChevronLeft, FileText, Briefcase, CalendarClock, Database, Handshake, MessageSquare, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { ChangePasswordDialog } from "./change-password-dialog";
import { AdminAiAssistant, type AdminAiScreenContext } from "./admin-ai-assistant";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { fetchReportsCountsAdminApi } from "@/lib/api/admin-management";
import { fetchMaintenanceStationsApi } from "@/lib/api/maintenance";
import type { ReactNode } from "react";

type AdminLayoutProps = {
  children: ReactNode;
  header: ReactNode;
  /** Mobile bottom navigation bar - rendered outside header context */
  mobileBottomBar?: ReactNode;
  /** Optional context passed to the persistent admin AI assistant */
  aiContext?: AdminAiScreenContext;
};

const navItems = [
  { label: "סקירת ייצור", href: "/admin", disabled: false, icon: LayoutDashboard },
  { label: "עבודות", href: "/admin/jobs", disabled: false, icon: Briefcase },
  { label: "תהליכי ייצור", href: "/admin/workflows", disabled: false, icon: Workflow },
  { label: "יומן מכירות", href: "/admin/sales-daily-log", disabled: false, icon: Handshake },
  { label: "הודעות", href: "/admin/messages", disabled: false, icon: MessageSquare },
  { label: "נתוני BINA", href: "/admin/bina", disabled: false, icon: Database },
  { label: "רכש ומשימות", href: "/admin/operations", disabled: false, icon: Briefcase },
  { label: "היסטוריה ודוחות", href: "/admin/history", disabled: false, icon: History },
  { label: "דיווחים", href: "/admin/reports", disabled: false, icon: FileText },
  { label: "טיפולים", href: "/admin/maintenance", disabled: false, icon: CalendarClock },
  { label: "ניהול", href: "/admin/manage", disabled: false, icon: Wrench },
];

export const AdminLayout = ({ children, header, mobileBottomBar, aiContext }: AdminLayoutProps) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const [pendingMaintenanceCount, setPendingMaintenanceCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      try {
        const [{ counts }, { stations }] = await Promise.all([
          fetchReportsCountsAdminApi(),
          fetchMaintenanceStationsApi(),
        ]);
        if (!cancelled) {
          setPendingReportsCount(counts.total);
          const maintenanceCount = stations.reduce(
            (sum, s) =>
              sum +
              s.services.filter(
                (sv) => sv.maintenance_status === "overdue" || sv.maintenance_status === "due_soon"
              ).length,
            0
          );
          setPendingMaintenanceCount(maintenanceCount);
        }
      } catch {
        // Silently fail - badges just won't show
      }
    };

    void fetchCounts();
    const interval = setInterval(() => void fetchCounts(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const renderNavItem = (item: (typeof navItems)[number]) => {
    // For /admin/reports, also highlight when on sub-routes
    const isActive = item.href === "/admin/reports"
      ? pathname.startsWith("/admin/reports")
      : item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;

    if (item.disabled) {
      return (
        <button
          key={item.label}
          type="button"
          disabled
          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground/60"
        >
          <div className="flex items-center gap-3">
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
            בקרוב
          </Badge>
        </button>
      );
    }

    const showReportsBadge = item.href === "/admin/reports" && pendingReportsCount > 0;
    const showMaintenanceBadge = item.href === "/admin/maintenance" && pendingMaintenanceCount > 0;

    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={() => setMobileMenuOpen(false)}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-primary/10 text-primary ring-1 ring-primary/10"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        <div className="relative">
          <Icon className={`h-4 w-4 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
          {(showReportsBadge || showMaintenanceBadge) && (
            <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-card" />
          )}
        </div>
        <span>{item.label}</span>
        {isActive && (
          <ChevronLeft className="mr-auto h-4 w-4 text-primary/50" />
        )}
      </Link>
    );
  };

  return (
    <section className="min-h-screen bg-background" dir="rtl">

      <div className="relative flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-[216px] shrink-0 flex-col border-l border-border bg-card lg:flex">
          <div className="flex flex-col p-5 border-b border-border/60">
            <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
              <GestelitLogo size="sm" />
              <div>
                <span className="text-base font-bold text-foreground tracking-tight">Gestelit</span>
                <p className="text-[11px] text-muted-foreground leading-tight">ניהול רצפת ייצור</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map(renderNavItem)}
          </nav>

          <div className="border-t border-border/60 p-3 space-y-1">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-sm text-muted-foreground">ערכת נושא</span>
              <ThemeToggle />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPasswordDialogOpen(true)}
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Settings className="h-4 w-4" />
              <span>הגדרות</span>
            </Button>
          </div>
        </aside>

        {/* Mobile Navigation */}
        <div className="lg:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="fixed right-4 top-4 z-50 h-10 w-10 rounded-xl border border-border bg-card/90 backdrop-blur-sm text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
                aria-label="תפריט"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-border bg-card p-0">
              <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
              <div className="flex flex-col p-5 pt-14 border-b border-border/60">
                <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 transition-opacity hover:opacity-80">
                  <GestelitLogo size="sm" />
                  <div>
                    <span className="text-base font-bold text-foreground tracking-tight">Gestelit</span>
                    <p className="text-[11px] text-muted-foreground leading-tight">ניהול רצפת ייצור</p>
                  </div>
                </Link>
              </div>
              <nav className="space-y-1 p-3">
                {navItems.map(renderNavItem)}
              </nav>
              <div className="border-t border-border/60 p-3 mt-auto space-y-1">
                <div className="flex items-center justify-between px-3 py-1">
                  <span className="text-sm text-muted-foreground">ערכת נושא</span>
                  <ThemeToggle />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setPasswordDialogOpen(true);
                  }}
                  className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <Settings className="h-4 w-4" />
                  <span>הגדרות</span>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="sticky top-0 z-40 shrink-0 border-b border-border bg-card/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 pr-12 lg:pr-0">{header}</div>
              <div className="flex items-center shrink-0">
                <NotificationCenter />
              </div>
            </div>
          </header>

          {mobileBottomBar}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mx-auto w-full max-w-[1680px] flex-1 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8">
              {children}
            </div>
          </div>
        </div>
      </div>

      <ChangePasswordDialog
        isOpen={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
      />

      <AdminAiAssistant context={aiContext} />

      <nav aria-label="ניווט ראשי" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {navItems.filter(item => ["/admin", "/admin/jobs", "/admin/bina", "/admin/messages"].includes(item.href)).map(item => {
          const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}><Icon className="h-5 w-5" />{item.label}</Link>;
        })}
        <button type="button" onClick={() => setMobileMenuOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"><Menu className="h-5 w-5" />עוד</button>
      </nav>
    </section>
  );
};
