import type { Metadata } from "next";

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
    <div className="fixed inset-0 overflow-auto bg-zinc-950">
      {children}
    </div>
  );
}
