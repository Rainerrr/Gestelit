import type { ReactNode } from "react";

export default function WorkerLayout({ children }: { children: ReactNode }) {
  return (
    <section className="fixed inset-0 overflow-auto bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6">
        {children}
      </div>
    </section>
  );
}

