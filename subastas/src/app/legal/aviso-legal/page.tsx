import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPageLayout } from "../LegalPageLayout";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import type { Locale } from "@/i18n/routing";
import { AvisoLegalEs } from "./content.es";
import { AvisoLegalEn } from "./content.en";

/**
 * /legal/aviso-legal — Aviso Legal y Condiciones Generales de Uso.
 *
 * Locale-switched (i18n Phase 2): Spanish is the legally binding text; the
 * English body is the Lex-APPROVED convenience translation, rendered with a
 * prevailing-language notice at the top. Bodies live in co-located
 * `content.es.tsx` / `content.en.tsx` modules — the docs are far too large
 * for messages/*.json. Operator identity (DK Partner EOOD / EIK 207413740),
 * Whop as payment processor, the desistimiento clause and the EU law-framing
 * are all intentional — do NOT genericize.
 */

const META = {
  es: {
    title: "Aviso legal — SubastasActivas",
    description:
      "Aviso legal y condiciones de uso del sitio web SubastasActivas.",
  },
  en: {
    title: "Legal Notice — SubastasActivas",
    description: "Legal notice and terms of use for the SubastasActivas website.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const m = META[locale] ?? META.es;
  return {
    title: m.title,
    description: m.description,
    ...buildAlternates("/legal/aviso-legal", locale),
    openGraph: {
      title: m.title,
      description: m.description,
      locale: ogLocale(locale),
    },
  };
}

export default async function AvisoLegalPage() {
  const locale = (await getLocale()) as Locale;
  const isEn = locale === "en";
  return (
    <LegalPageLayout
      title={
        isEn
          ? "Legal Notice and General Terms of Use"
          : "Aviso legal y condiciones generales de uso"
      }
      updated={isEn ? "10 June 2026" : "10 de junio de 2026"}
      updatedLabel={isEn ? "Last updated" : "Última actualización"}
    >
      {isEn ? <AvisoLegalEn /> : <AvisoLegalEs />}
    </LegalPageLayout>
  );
}
