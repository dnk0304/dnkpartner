import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import SubastasListClient from "./SubastasListClient";
import { buildSeoAuctions } from "./_shared/seo-auctions";

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
export default async function SubastasListPage() {
  const t = await getTranslations("listTemplates");
  // SSR crawlable auction block (P1/P2) — page 1 of the whole in-scope active
  // catalog. No lockedFilter: the root list is unfiltered.
  const auctions = await buildSeoAuctions({
    filter: {},
    basePath: "/subastas",
    locationLabel: t("spain"),
  });
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient seoAuctionsSlot={auctions.node} />
    </Suspense>
  );
}
