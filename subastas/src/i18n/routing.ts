/**
 * i18n routing constants — Phase 7a (SLICE).
 *
 * We deliberately avoid next-intl's `[locale]` route segment to keep the
 * existing 20+ route folders (and the just-shipped SEO middleware rules) in
 * place. Locale is detected by middleware via URL prefix (`/en/...`) and/or
 * cookie, then injected into the request via an `x-locale` header that
 * `src/i18n/request.ts` reads.
 *
 * Spanish is the default; English lives behind `/en`. `en` is already in
 * `RESERVED_SEGMENTS` (src/lib/seo/slugs.ts) so it cannot collide with a
 * province, category, or auction-detail slug.
 */
export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'es';

/** Cookie name used by Pixel's eventual header switcher. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Request header set by middleware so server code can read the locale. */
export const LOCALE_HEADER = 'x-locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'es' || value === 'en';
}
