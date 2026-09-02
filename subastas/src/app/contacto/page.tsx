import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LegalPageLayout, LegalSection } from "../legal/LegalPageLayout";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import type { Locale } from "@/i18n/routing";

/**
 * /contacto — Contact page.
 *
 * Intentionally minimal: email-only ("Escríbenos") + a short "Sobre
 * SubastasActivas" blurb. The full operator identity (DK Partner EOOD /
 * EIK 207413740) lives in /legal/aviso-legal and /legal/privacidad, so this
 * page stays a quiet contact surface. Reuses the legal page layout for
 * visual consistency. Contact email: hola@subastasactivas.com.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("contactPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...buildAlternates("/contacto", locale as Locale),
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      locale: ogLocale(locale as Locale),
    },
  };
}

export default async function ContactoPage() {
  const t = await getTranslations("contactPage");
  return (
    <LegalPageLayout title={t("title")}>
      <p>{t("intro")}</p>

      <LegalSection heading={t("writeUsHeading")}>
        <p>{t("writeUsText")}</p>
        <p>
          <a
            href="mailto:hola@subastasactivas.com"
            className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)] font-medium"
          >
            hola@subastasactivas.com
          </a>
        </p>
        <p>{t("responseText")}</p>
      </LegalSection>

      <LegalSection heading={t("aboutHeading")}>
        <p>{t("aboutText")}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
