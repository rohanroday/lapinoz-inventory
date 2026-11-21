import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = { title: "La Pino'z Inventory - Victoria Singtam" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e4f6ee" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.className}>
      <body>{children}</body>
    </html>
  );
}
