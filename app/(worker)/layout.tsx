import type { ReactNode } from "react";

export default function WorkerLayout({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-1 flex-col gap-8">
      {children}
    </section>
  );
}

