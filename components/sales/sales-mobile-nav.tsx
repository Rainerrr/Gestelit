"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, History, ListPlus, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const destinations = [
  { href: "/sales#new-report", label: "דיווח", icon: ListPlus },
  { href: "/sales#my-reports", label: "היסטוריה", icon: History },
  { href: "/sales/dashboard", label: "הסיכום שלי", icon: BarChart3 },
  { href: "/sales/clients?mine=true", label: "לקוחות", icon: UsersRound },
] as const;

export function SalesMobileNav() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return (
    <nav
      aria-label="ניווט מכירות"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {destinations.map(({ href, label, icon: Icon }) => {
          const [targetPath, targetQueryHash = ""] = href.split(/(?=[?#])/);
          const targetHash = targetQueryHash.startsWith("#") ? targetQueryHash : "";
          const active = pathname === targetPath && (
            targetHash ? hash === targetHash : !hash || pathname !== "/sales"
          );
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-muted-foreground",
                active && "text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
