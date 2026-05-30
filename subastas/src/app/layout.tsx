import type { Metadata } from "next";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { AdminSettingsProvider } from "@/context/AdminSettingsContext";

/**
 * Typography — the single biggest "less AI" lever we have.
 *   - Source Serif 4 for editorial/judicial headings
 *   - Inter for UI/body (with tabular numerals enabled in globals.css)
 *   - JetBrains Mono available for code-like values
 *
 * Self-hosted via next/font; respects basePath without extra config.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const serifDisplay = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif-display",
  display: "swap",
  weight: ["400", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "dnkSubastas — Observatorio de subastas públicas de España",
  description:
    "Seguimos en tiempo real las subastas judiciales del BOE y te avisamos cuando algo cambia. Datos oficiales, sin AI-hype.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${inter.variable} ${serifDisplay.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <SessionProvider>
          <AdminSettingsProvider>{children}</AdminSettingsProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
