import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPageLayout } from "../LegalPageLayout";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import type { Locale } from "@/i18n/routing";
import { PrivacidadEs } from "./content.es";
import { PrivacidadEn } from "./content.en";

/**
 * /legal/privacidad — Política de Privacidad.
 *
 * Locale-switched (i18n Phase 2): Spanish is the legally binding text; the
 * English body is the Lex-APPROVED convenience translation, rendered with a
 * prevailing-language notice at the top. Bodies live in co-located
 * `content.es.tsx` / `content.en.tsx` modules. Responsable del tratamiento
 * (DK Partner EOOD / EIK 207413740), the Whop encargado row, the US transfer
 * clause and the CPDP (Bulgaria) lead-authority framing are intentional.
 */

const META = {
  es: {
    title: "Política de privacidad — SubastasActivas",
    description:
      "Cómo SubastasActivas recopila, utiliza y protege tus datos personales.",
  },
  en: {
    title: "Privacy Policy — SubastasActivas",
    description:
      "How SubastasActivas collects, uses and protects your personal data.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const m = META[locale] ?? META.es;
  return {
    title: m.title,
    description: m.description,
    ...buildAlternates("/legal/privacidad", locale),
    openGraph: {
      title: m.title,
      description: m.description,
      locale: ogLocale(locale),
    },
  };
}

export default async function PrivacidadPage() {
  const locale = (await getLocale()) as Locale;
  const isEn = locale === "en";
  return (
    <LegalPageLayout
      title={isEn ? "Privacy Policy" : "Política de privacidad"}
      updated={isEn ? "10 July 2026" : "10 de julio de 2026"}
      updatedLabel={isEn ? "Last updated" : "Última actualización"}
    >
      {isEn ? <PrivacidadEn /> : <PrivacidadEs />}
    </LegalPageLayout>
  );
}
