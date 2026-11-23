"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, Clock3, ListPlus, MessageSquare, UsersRound } from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SalesAiAssistant } from "./sales-assistant-workspace";

const items = [
  {href: "/sales/dashboard", label: "היום שלי", icon: BarChart3},
  {href: "/sales", label: "דיווח פגישה", icon: ListPlus},
  {href: "/sales/clients", label: "לקוחות", icon: UsersRound},
  {href: "/sales/portfolio", label: "תיק הלקוחות", icon: Building2},
  {href: "/sales/business", label: "מסמכי BINA ודירוג", icon: BarChart3},
  {href: "/sales/calendar", label: "חיבור ליומן Outlook", icon: Clock3},
  {href: "/sales/dormant", label: "לקוחות לחידוש קשר", icon: Clock3},
  {href: "/sales/ai", label: "שיחה עם העוזר", icon: MessageSquare},
];
export function SalesShell({children}: {children: ReactNode}) {
  const pathname = usePathname();
  if (pathname === "/sales/login") return <>{children}</>;
  return <div className="flex min-h-dvh bg-background" dir="rtl">
    <aside className="sticky top-0 hidden h-dvh w-[216px] shrink-0 flex-col border-l border-border bg-card lg:flex">
      <Link href="/sales/dashboard" className="flex items-center gap-3 border-b border-border p-5"><GestelitLogo size="sm" /><div><p className="font-bold">Gestelit</p><p className="text-[11px] text-muted-foreground">סביבת המכירות שלי</p></div></Link>
      <nav aria-label="ניווט מכירות במחשב" className="flex-1 space-y-1 p-3">{items.map(({href,label,icon: Icon}) => {
        const active = href === "/sales" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}</Link>;
      })}</nav>
      <div className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground"><span>ערכת נושא</span><ThemeToggle /></div>
    </aside>
    <div className="min-w-0 flex-1"><nav aria-label="כלי מכירות נוספים" className="flex gap-4 overflow-x-auto border-b px-4 py-3 text-sm lg:hidden"><Link className="whitespace-nowrap" href="/sales/business">מסמכי BINA ודירוג</Link><Link className="whitespace-nowrap" href="/sales/calendar">חיבור Outlook</Link><Link className="whitespace-nowrap" href="/sales/dormant">חידוש קשר</Link><Link className="whitespace-nowrap" href="/sales/dashboard">היום שלי</Link></nav>{children}</div>
    <SalesAiAssistant />
  </div>;
}
