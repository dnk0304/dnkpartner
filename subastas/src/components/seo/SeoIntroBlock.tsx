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
import { APP_TIME_ZONE } from '@/components/observatory/format';

type Props = {
  count: number;
  noun: string;          // e.g. "viviendas", "subastas judiciales", "subastas en Madrid"
  location?: string;     // e.g. "Madrid", "España"
  minPrice?: number | null;
  guideHref?: string;    // contextual /guia/ link
  guideLabel?: string;
  /** Epoch ms for the "actualizado" date. Server-supplied; defaults to the server's clock. */
  todayMs?: number;
};

export async function SeoIntroBlock({ count, noun, location, minPrice, guideHref, guideLabel, todayMs }: Props) {
  const t = await getTranslations('seoIntro');
  const locale = await getLocale();
  const intlLocale = locale === 'en' ? 'en-US' : 'es-ES';
  const eur = new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  // Hydration (#418), not style. Two separate hazards on this line, both fixed here:
  //   1. CLOCK READ. `new Date()` is read once, here, in an async Server Component — this
  //      subtree is rendered on the server only and streamed as RSC payload, so the client
  //      never re-reads the clock for it. Callers may pass `todayMs` to make the value
  //      explicit/stable (e.g. from a cached page's data); it MUST NOT be read client-side.
  //   2. HOST ZONE. Without `timeZone` the formatter used the container zone; pinned now.
  const today = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: APP_TIME_ZONE }).format(new Date(todayMs ?? Date.now()));

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
