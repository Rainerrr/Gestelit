import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body
        className={`${rubik.variable} ${plexMono.variable} antialiased`}
      >
        <AppProviders>
          <main className="min-h-screen">
            <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:gap-10 sm:px-6 lg:px-10">
              {children}
            </div>
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
