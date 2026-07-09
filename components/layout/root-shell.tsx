"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/sales/login") {
    return <>{children}</>;
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:gap-10 sm:px-6 lg:px-10">
        {children}
      </div>
    </main>
  );
}
