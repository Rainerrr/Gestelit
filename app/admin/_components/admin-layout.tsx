"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ReactNode } from "react";

type AdminLayoutProps = {
  children: ReactNode;
  header: ReactNode;
};

const navItems = [
  { label: "דשבורד", href: "/admin", disabled: false },
  { label: "היסטוריה ודוחות", href: "/admin/history", disabled: false },
  { label: "ניהול", href: "/admin/manage", disabled: false },
];

export const AdminLayout = ({ children, header }: AdminLayoutProps) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const isActive = pathname === item.href;
    if (item.disabled) {
      return (
        <button
          key={item.label}
          type="button"
          disabled
          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs text-slate-400"
        >
          {item.label}
          <Badge variant="outline" className="text-[0.6rem] px-1 py-0">
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
        className={`flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
          isActive
            ? "border border-slate-200 bg-slate-50 text-slate-900"
            : "text-slate-700 hover:border hover:border-slate-200 hover:bg-slate-50"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <section className="w-full" dir="rtl">
      <div className="flex min-h-[calc(100vh-5rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Desktop Sidebar */}
        <aside className="hidden w-44 shrink-0 border-l border-slate-200 bg-white p-3 lg:block">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-slate-900">
              Gestelit
            </span>
            <span className="text-[0.65rem] text-slate-500 leading-tight">
              ניהול רצפת ייצור בזמן אמת
            </span>
          </div>
          <nav className="mt-6 space-y-0.5">
            {navItems.map(renderNavItem)}
          </nav>
        </aside>

        {/* Mobile Navigation */}
        <div className="lg:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="fixed right-4 top-4 z-50 bg-white/80 backdrop-blur-sm lg:hidden"
                aria-label="תפריט"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-0">
              <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
              <div className="flex flex-col gap-0.5 p-3 pt-12">
                <span className="text-xs font-semibold text-slate-900">
                  Gestelit
                </span>
                <span className="text-[0.65rem] text-slate-500 leading-tight">
                  ניהול רצפת ייצור בזמן אמת
                </span>
              </div>
              <nav className="mt-6 space-y-0.5 px-3">
                {navItems.map(renderNavItem)}
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
          <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
            {header}
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex-1 p-4 sm:p-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
