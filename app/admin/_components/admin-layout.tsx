"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Settings, LayoutDashboard, History, Wrench, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChangePasswordDialog } from "./change-password-dialog";
import type { ReactNode } from "react";

type AdminLayoutProps = {
  children: ReactNode;
  header: ReactNode;
};

const navItems = [
  { label: "דשבורד", href: "/admin", disabled: false, icon: LayoutDashboard },
  { label: "היסטוריה ודוחות", href: "/admin/history", disabled: false, icon: History },
  { label: "ניהול", href: "/admin/manage", disabled: false, icon: Wrench },
];

export const AdminLayout = ({ children, header }: AdminLayoutProps) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const isActive = pathname === item.href;
    const Icon = item.icon;

    if (item.disabled) {
      return (
        <button
          key={item.label}
          type="button"
          disabled
          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-600"
        >
          <div className="flex items-center gap-3">
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-zinc-700 text-zinc-500">
            בקרוב
          </Badge>
        </button>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={() => setMobileMenuOpen(false)}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon className={`h-4 w-4 transition-colors ${isActive ? "text-amber-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
        <span>{item.label}</span>
        {isActive && (
          <ChevronLeft className="mr-auto h-4 w-4 text-amber-500/50" />
        )}
      </Link>
    );
  };

  return (
    <section className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900" dir="rtl">

      <div className="relative flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden w-56 shrink-0 border-l border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm lg:flex lg:flex-col">
          <div className="flex flex-col p-5 border-b border-zinc-800/60">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-900/30">
                <span className="text-sm font-bold text-zinc-900">G</span>
              </div>
              <div>
                <span className="text-base font-bold text-zinc-100 tracking-tight">Gestelit</span>
                <p className="text-[11px] text-zinc-500 leading-tight">ניהול רצפת ייצור</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map(renderNavItem)}
          </nav>

          <div className="border-t border-zinc-800/60 p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPasswordDialogOpen(true)}
              className="w-full justify-start gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80"
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
                className="fixed right-4 top-4 z-50 h-10 w-10 rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden"
                aria-label="תפריט"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-zinc-800 bg-zinc-900 p-0">
              <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
              <div className="flex flex-col p-5 pt-14 border-b border-zinc-800/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-900/30">
                    <span className="text-sm font-bold text-zinc-900">G</span>
                  </div>
                  <div>
                    <span className="text-base font-bold text-zinc-100 tracking-tight">Gestelit</span>
                    <p className="text-[11px] text-zinc-500 leading-tight">ניהול רצפת ייצור</p>
                  </div>
                </div>
              </div>
              <nav className="space-y-1 p-3">
                {navItems.map(renderNavItem)}
              </nav>
              <div className="border-t border-zinc-800/60 p-3 mt-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setPasswordDialogOpen(true);
                  }}
                  className="w-full justify-start gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80"
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
          <header className="shrink-0 border-b border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 pr-12 lg:pr-0">{header}</div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
    </section>
  );
};
