/**
 * next-intl request config — Phase 7a (SLICE).
 *
 * Reads the locale from the `x-locale` request header that `src/middleware.ts`
 * sets after detecting `/en` URL prefix or NEXT_LOCALE cookie. Falls back to
 * the default locale (Spanish) when nothing is set.
 */
import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { defaultLocale, isLocale, LOCALE_HEADER } from './routing';

export default getRequestConfig(async () => {
  const headerList = await headers();
  const raw = headerList.get(LOCALE_HEADER);
  const locale = isLocale(raw) ? raw : defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
