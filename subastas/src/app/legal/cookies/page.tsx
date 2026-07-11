import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPageLayout } from "../LegalPageLayout";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import type { Locale } from "@/i18n/routing";
import { CookiesEs } from "./content.es";
import { CookiesEn } from "./content.en";

/**
 * /legal/cookies — Política de Cookies.
 *
 * Locale-switched (i18n Phase 2): Spanish is the legally binding text; the
 * English body is the Lex-APPROVED convenience translation, rendered with a
 * prevailing-language notice at the top. Bodies live in co-located
 * `content.es.tsx` / `content.en.tsx` modules. §3's cookie table was
 * corrected against the app's real Auth.js v5 + NEXT_LOCALE config and the
 * editor's "verify before publication" note removed (Lex operational flag).
 */

const META = {
  es: {
    title: "Política de cookies — SubastasActivas",
    description:
      "Información sobre el uso de cookies en el sitio web SubastasActivas.",
  },
  en: {
    title: "Cookie Policy — SubastasActivas",
    description:
      "Information about the use of cookies on the SubastasActivas website.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const m = META[locale] ?? META.es;
  return {
    title: m.title,
    description: m.description,
    ...buildAlternates("/legal/cookies", locale),
    openGraph: {
      title: m.title,
      description: m.description,
      locale: ogLocale(locale),
    },
  };
}

export default async function CookiesPage() {
  const locale = (await getLocale()) as Locale;
  const isEn = locale === "en";
  return (
    <LegalPageLayout
      title={isEn ? "Cookie Policy" : "Política de cookies"}
      updated={isEn ? "10 July 2026" : "10 de julio de 2026"}
      updatedLabel={isEn ? "Last updated" : "Última actualización"}
    >
      {isEn ? <CookiesEn /> : <CookiesEs />}
    </LegalPageLayout>
  );
}
