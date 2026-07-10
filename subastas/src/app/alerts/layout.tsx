import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import type { Locale } from "@/i18n/routing";

/**
 * /alerts — metadata lives here because page.tsx is a client component
 * ("use client") and cannot export generateMetadata.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("alertsPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...buildAlternates("/alerts", locale as Locale),
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      locale: ogLocale(locale as Locale),
    },
  };
}

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
