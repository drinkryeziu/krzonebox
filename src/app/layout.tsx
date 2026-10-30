import type { Metadata } from "next";
import "./globals.css";
import { TimeFormatProvider } from "@/lib/time-format";

export const metadata: Metadata = {
  title: "KRZ OneBox",
  description: "One AI inbox for WhatsApp, Messenger, Viber and email.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <TimeFormatProvider>{children}</TimeFormatProvider>
      </body>
    </html>
  );
}
