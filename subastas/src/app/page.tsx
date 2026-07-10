import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import type { Locale } from "@/i18n/routing";
import HomeObservatory from "./HomeObservatory";

/**
 * / — observatory home.
 *
 * Per UX vision (doc 03): the hero is the data, not an illustration.
 *   1. Live trueActiveCount as the headline number ("Subastas activas ahora")
 *   2. "Últimas actualizaciones" live feed — proof of live tracking
 *   3. Spain map + provincia grid (existing components, restyled)
 *   4. Honest "Cómo funciona" copy at the bottom (no marketing fluff)
 */

// Localized metadata (i18n Phase 1). Self-canonical + hreflang via
// buildAlternates; og:locale es_ES / en_US. metadataBase stays in layout.tsx.
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("home");
  const title = t("metaTitle");
  const description = t("metaDescription");
  return {
    title,
    description,
    ...buildAlternates("/", locale),
    openGraph: {
      title,
      description,
      locale: ogLocale(locale),
    },
  };
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <HomeObservatory />
    </Suspense>
  );
}
