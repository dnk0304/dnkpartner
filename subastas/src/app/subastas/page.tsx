import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import SubastasListClient from "./SubastasListClient";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("subastasList");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...buildAlternates("/subastas", locale as "es" | "en"),
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      locale: ogLocale(locale as "es" | "en"),
    },
  };
}

/**
 * /subastas — canonical list of auctions with the four-question simple filter
 * sidebar, progressive "Más filtros" disclosure, and list/cards/map toggle.
 */
export default function SubastasListPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient />
    </Suspense>
  );
}
