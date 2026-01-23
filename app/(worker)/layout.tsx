import type { ReactNode } from "react";
import { LanguageFlagToggle } from "@/components/language/language-flag-toggle";

export default function WorkerLayout({ children }: { children: ReactNode }) {
  return (
    <section className="fixed inset-0 overflow-auto bg-background p-4 sm:p-6 lg:p-8 overscroll-contain [-webkit-overflow-scrolling:touch] pt-[max(env(safe-area-inset-top,0px),1rem)] pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
      {/* Global language toggle - fixed position top-right */}
      <div className="fixed top-4 left-4 z-50 sm:top-6 sm:left-6">
        <LanguageFlagToggle />
      </div>
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6">
        {children}
      </div>
    </section>
  );
}

