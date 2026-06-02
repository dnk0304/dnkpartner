import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { AdminSettingsProvider } from "@/context/AdminSettingsContext";

/**
 * Typography — the single biggest "less AI" lever we have.
 *   - Inter Tight for display headings (news-grade, register feel)
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

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://subastasactivas.com"),
  title: "SubastasActivas — Observatorio de subastas públicas de España",
  description:
    "Seguimos en tiempo real las subastas judiciales del BOE y te avisamos cuando algo cambia. Datos oficiales, sin AI-hype.",
  alternates: {
    canonical: "/",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale + messages come from src/i18n/request.ts via the middleware-set
  // `x-locale` header. Default = 'es'. Drives both <html lang> and the
  // NextIntlClientProvider that serves translations to client components.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider>
            <AdminSettingsProvider>{children}</AdminSettingsProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
