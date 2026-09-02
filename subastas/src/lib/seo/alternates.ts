/**
 * buildAlternates — shared hreflang + self-canonical builder (i18n Phase 1,
 * 2026-07-10).
 *
 * Every indexable page must expose:
 *   - a SELF canonical: `/en/...` canonicalizes to `/en/...`, never to the
 *     Spanish URL (the pre-fix behaviour told Google the en pages were
 *     duplicates of es — they were never indexed as English).
 *   - `alternates.languages`: es → es URL, en → /en URL, x-default → es URL
 *     (Spanish is the default URL space and the market's primary language).
 *
 * Usage inside generateMetadata:
 *   const locale = await getLocale();               // next-intl/server
 *   return { ...buildAlternates('/subastas/madrid', locale), ... };
 *
 * `path` is the LOCALE-AGNOSTIC path ('/' for home, no '/en' prefix, no
 * trailing slash, query strings excluded). Absolute URLs are emitted so the
 * tags are correct regardless of each template's metadataBase inheritance.
 */
import type { Metadata } from 'next';
import { ENGLISH_ENABLED, type Locale } from '@/i18n/routing';

export const SITE_ORIGIN = 'https://subastasactivas.com';

/** Join origin + locale prefix + path without producing `/en/` for home. */
function localeUrl(path: string, locale: Locale): string {
  const clean = path === '/' ? '' : path;
  if (locale === 'en') return `${SITE_ORIGIN}/en${clean}`;
  return `${SITE_ORIGIN}${clean || '/'}`;
}

export function buildAlternates(
  path: string,
  locale: Locale,
): Pick<Metadata, 'alternates'> {
  const es = localeUrl(path, 'es');
  const en = localeUrl(path, 'en');
  // English kill-switch: while disabled, advertise Spanish only — no `en`
  // hreflang alternate — and always self-canonical to the Spanish URL. When
  // re-enabled, the original per-locale canonical + es/en/x-default returns.
  if (!ENGLISH_ENABLED) {
    return {
      alternates: {
        canonical: es,
        languages: {
          es,
          'x-default': es,
        },
      },
    };
  }
  return {
    alternates: {
      // Self-canonical per rendered locale.
      canonical: locale === 'en' ? en : es,
      languages: {
        es,
        en,
        'x-default': es,
      },
    },
  };
}

/** og:locale value per rendered locale (es_ES / en_US per Ken's brief). */
export function ogLocale(locale: Locale): string {
  return locale === 'en' ? 'en_US' : 'es_ES';
}
