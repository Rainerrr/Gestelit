import type { ReactNode } from "react";
import { SalesShell } from "./_components/sales-shell";
export default function SalesLayout({children}: {children: ReactNode}) {
  return <SalesShell>{children}</SalesShell>;
}
