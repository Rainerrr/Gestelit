"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, Settings, LayoutDashboard, History, Wrench, ChevronLeft, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ChangePasswordDialog } from "./change-password-dialog";
import { fetchReportsCountsAdminApi } from "@/lib/api/admin-management";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type AdminLayoutProps = {
  children: ReactNode;
  header: ReactNode;
  /** Mobile bottom navigation bar - rendered outside header context */
  mobileBottomBar?: ReactNode;
};

const navItems = [
  { label: "דשבורד", href: "/admin", disabled: false, icon: LayoutDashboard },
  { label: "היסטוריה ודוחות", href: "/admin/history", disabled: false, icon: History },
  { label: "דיווחים", href: "/admin/reports", disabled: false, icon: FileText },
  { label: "ניהול", href: "/admin/manage", disabled: false, icon: Wrench },
];

export const AdminLayout = ({ children, header, mobileBottomBar }: AdminLayoutProps) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const { scrollDirection, isAtTop } = useScrollDirection();

  useEffect(() => {
    let cancelled = false;

    const fetchReportsCount = async () => {
      try {
        const { counts } = await fetchReportsCountsAdminApi();
        // Total pending = open malfunctions + pending general + pending scrap
        if (!cancelled) {
          setPendingReportsCount(counts.total);
        }
      } catch {
        // Silently fail - badge just won't show
      }
    };

    void fetchReportsCount();
    // Refresh count every 30 seconds
    const interval = setInterval(() => void fetchReportsCount(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const renderNavItem = (item: (typeof navItems)[number]) => {
    // For /admin/reports, also highlight when on sub-routes
    const isActive = item.href === "/admin/reports"
      ? pathname.startsWith("/admin/reports")
      : pathname === item.href;
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

    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={() => setMobileMenuOpen(false)}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-primary/10 text-primary border border-primary/20"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        <div className="relative">
          <Icon className={`h-4 w-4 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
          {showReportsBadge && (
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
        <aside className="hidden w-56 shrink-0 border-l border-border bg-card/50 backdrop-blur-sm lg:flex lg:flex-col">
          <div className="flex flex-col p-5 border-b border-border/60">
            <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg">
                <span className="text-sm font-bold text-primary-foreground">G</span>
              </div>
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
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg">
                    <span className="text-sm font-bold text-primary-foreground">G</span>
                  </div>
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
            className={cn(
              "shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm px-4 py-3 sm:px-6 lg:px-8",
              "sticky top-0 z-40 transform transition-transform duration-300",
              scrollDirection === "down" && !isAtTop
                ? "-translate-y-full lg:translate-y-0"
                : "translate-y-0"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 pr-12 lg:pr-0">{header}</div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          </div>
        </div>
      </div>

      <ChangePasswordDialog
        isOpen={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
      />

      {/* Mobile bottom navigation - rendered outside header context */}
      {mobileBottomBar}
    </section>
  );
};
