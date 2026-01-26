import type { Metadata } from "next";
import { AdminProviders } from "./_components/admin-providers";

export const metadata: Metadata = {
  title: "ניהול | Gestelit Work Monitor",
  description: "לוח בקרה לניהול רצפת הייצור",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 overflow-auto bg-background overscroll-contain [-webkit-overflow-scrolling:touch] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <AdminProviders>{children}</AdminProviders>
    </div>
  );
}
