import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PreciosClient from "./PreciosClient";

/**
 * /precios — public pricing page (Feature #10, Pixel D2).
 *
 * Server component so we can ship per-locale `<title>` / `<meta>` and avoid
 * shipping the translations bundle twice. The interactive bits (auth-aware
 * CTA, embedded Whop checkout iframe) live in `PreciosClient`.
 *
 * Locale routing recap: this project does NOT use next-intl's `[locale]`
 * segment. The same `/precios` URL serves Spanish; `/en/precios` is rewritten
 * by middleware to `/precios` with an `x-locale: en` header, which the
 * `getTranslations()` call below honours. One file, both locales.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/precios" },
  };
}

export default function PreciosPage() {
  return <PreciosClient />;
}
