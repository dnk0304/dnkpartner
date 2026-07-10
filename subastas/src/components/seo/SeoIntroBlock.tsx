/**
 * SeoIntroBlock — the ≥90-word, variable, data-driven intro block above the
 * auction grid on every SEO programmatic page (07 §3.2).
 *
 * Variable hooks: live count, min starting price, current date. These make
 * each page genuinely unique even with a shared template — competitors can't
 * dup what they don't have (07 wedge).
 *
 * i18n Phase 1: async server component; copy lives under the `seoIntro`
 * namespace. Callers pass already-localized `noun` / `location` /
 * `guideLabel` strings.
 */

import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

type Props = {
  count: number;
  noun: string;          // e.g. "viviendas", "subastas judiciales", "subastas en Madrid"
  location?: string;     // e.g. "Madrid", "España"
  minPrice?: number | null;
  guideHref?: string;    // contextual /guia/ link
  guideLabel?: string;
};

export async function SeoIntroBlock({ count, noun, location, minPrice, guideHref, guideLabel }: Props) {
  const t = await getTranslations('seoIntro');
  const locale = await getLocale();
  const intlLocale = locale === 'en' ? 'en-US' : 'es-ES';
  const eur = new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const today = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  const priceLine =
    minPrice && minPrice > 0
      ? t('priceLineMin', { price: eur.format(minPrice) })
      : t('priceLineFallback');

  return (
    <section className="prose prose-sm max-w-none text-[var(--color-text)] mb-6">
      <p>
        {t.rich('lead', {
          count: count.toLocaleString(intlLocale),
          noun,
          location: location ?? t('defaultLocation'),
          strong: (chunks) => <strong>{chunks}</strong>,
        })}{' '}
        {priceLine} {t('boeLine')}
        {guideHref ? (
          <>
            {' '}
            {t('guidePrompt')}{' '}
            <Link href={guideHref} className="underline">
              {guideLabel ?? t('guideLabelFallback')}
            </Link>
            .
          </>
        ) : null}{' '}
        {t('updated', { date: today })}
      </p>
    </section>
  );
}
