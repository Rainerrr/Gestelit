import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Rubik } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { RootShell } from "@/components/layout/root-shell";

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
  icons: {
    icon: "/brand/gestelit-logo.png",
    apple: "/brand/gestelit-logo.png",
  },
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
          <RootShell>{children}</RootShell>
        </AppProviders>
      </body>
    </html>
  );
}
