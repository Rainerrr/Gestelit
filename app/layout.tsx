import type { Metadata } from "next";
import { IBM_Plex_Mono, Rubik } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "latin-ext", "hebrew", "cyrillic"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Gestelit Work Monitor",
  description: "מערכת ניטור ובקרה לרצפת הייצור",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body
        className={`${rubik.variable} ${plexMono.variable} min-h-screen bg-slate-100 text-slate-900 antialiased`}
      >
        <AppProviders>
          <main className="min-h-screen">
            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-10">
              {children}
            </div>
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
