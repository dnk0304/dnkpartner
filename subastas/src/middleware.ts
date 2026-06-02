/**
 * Edge middleware — composes i18n locale detection (Wave C7 Phase 7a) with
 * the existing SEO routing rules (Wave B2).
 *
 * Execution order:
 *  0. Locale detection (NEW):
 *       • If pathname starts with `/en` → strip prefix, remember locale='en'.
 *       • Else read NEXT_LOCALE cookie → if 'en' it's a soft preference but
 *         doesn't change the URL (Spanish is the default URL space).
 *       • Default locale = 'es'.
 *     The detected locale is passed downstream via the `x-locale` request
 *     header so `src/i18n/request.ts` can return the right messages bundle,
 *     and so layout.tsx can render `<html lang>` correctly.
 *  1. Dev CSP header passthrough (unchanged).
 *  2. Legacy auction-detail 301:
 *       /auction/{id}           → /subastas/subasta/{id}
 *       /subastas/auction/{id}  → /subastas/subasta/{id}
 *  3. Case / accent normalisation on the SEO routes.
 *  4. Province / category alias 301s.
 *  5. Query-param → path 301.
 *
 * Composition contract: SEO rules run AFTER the `/en` prefix is stripped, so
 * `/en/subastas/PROVINCIA/Barcelona` normalises to `/en/subastas/provincia/barcelona`.
 * When the SEO rules emit a 301 redirect, we re-attach the `/en` prefix to the
 * target path so the user stays in the same locale across the redirect.
 *
 * Routing-only — does NOT touch auth.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  PROVINCE_ALIAS_TO_CANONICAL,
  PROVINCE_SLUG_TO_DB_KEY,
  CATEGORY_ALIAS_TO_CANONICAL,
  CATEGORY_SLUG_TO_DB_LABEL,
  TIPO_ALIAS_TO_CANONICAL,
  TIPO_SLUG_TO_DB_KEYS,
} from '@/lib/seo/slugs';
import { isLegacyCuid } from '@/lib/seo/legacy-rows';
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_HEADER, type Locale } from '@/i18n/routing';

/** HTML body returned with the 410 Gone response on legacy auction URLs. */
const GONE_HTML = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="robots" content="noindex,follow">
<title>410 Gone — Subasta retirada</title>
</head><body>
<h1>410 Gone</h1>
<p>Esta subasta forma parte del archivo retirado y ya no está disponible.</p>
</body></html>`;

function normaliseSlugToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Detect locale from pathname/cookie. Returns the canonical locale and the
 * pathname with any `/en` prefix stripped (so SEO rules see a locale-agnostic
 * path). When the locale was carried in the URL, `urlHadLocale` is true and
 * any downstream 301 redirects must re-prepend `/en`.
 */
function detectLocale(request: NextRequest): {
  locale: Locale;
  pathname: string;
  urlHadLocale: boolean;
} {
  const original = request.nextUrl.pathname;
  // Match `/en` or `/en/...`
  const m = original.match(/^\/en(?:\/(.*))?$/);
  if (m) {
    const rest = m[1] ?? '';
    return {
      locale: 'en',
      pathname: '/' + rest,
      urlHadLocale: true,
    };
  }
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  return { locale, pathname: original, urlHadLocale: false };
}

/** Prepend `/en` to a path if the request was locale-prefixed. */
function relocale(path: string, urlHadLocale: boolean): string {
  if (!urlHadLocale) return path;
  if (path === '/') return '/en';
  return '/en' + path;
}

export function middleware(request: NextRequest) {
  const { locale, pathname, urlHadLocale } = detectLocale(request);
  const { search, searchParams } = request.nextUrl;

  // ---- Rule 1b: legacy "junk auction" rows → 410 Gone --------------------
  // The January first-gen import produced ~13.5k rows whose stored BOE link
  // is dead (built from an internal 0x-hex code, not a real SUB- id). All are
  // in finished states, excluded from sitemap, already noindex on the detail
  // page. To make Google fully drop them we serve 410 Gone here.
  // Detection: the trailing token of the slug is the auction id. cuid shape
  // (`c` + 24 alnum) → legacy. Fast, edge-only, no DB hit.
  // See: src/lib/seo/legacy-rows.ts (single source of truth, mirrors
  // scraper/database/legacy_rows.py).
  const subastaMatch = pathname.match(/^\/subastas\/subasta\/([^/?#]+)\/?$/);
  if (subastaMatch) {
    const slug = subastaMatch[1];
    const lastDash = slug.lastIndexOf('-');
    const tail = lastDash >= 0 ? slug.substring(lastDash + 1) : slug;
    if (isLegacyCuid(tail)) {
      return new NextResponse(GONE_HTML, {
        status: 410,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Robots-Tag': 'noindex,follow',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }
  }

  // ---- Rule 2: legacy auction detail → /subastas/subasta/{id} ------------
  const legacyAuction = pathname.match(/^\/(?:subastas\/)?auction\/([^/?#]+)\/?$/);
  if (legacyAuction) {
    const id = legacyAuction[1];
    const url = request.nextUrl.clone();
    url.pathname = relocale(`/subastas/subasta/${id}`, urlHadLocale);
    return NextResponse.redirect(url, 301);
  }

  // ---- Rule 5: /subastas?province=... → /subastas/provincia/{slug} -------
  if (pathname === '/subastas' || pathname === '/subastas/') {
    const provinceQuery = searchParams.get('province');
    const typeQuery = searchParams.get('type') ?? searchParams.get('auctionType');
    const categoryQuery = searchParams.get('category');
    if (provinceQuery) {
      const norm = normaliseSlugToken(provinceQuery).replace(/\s+/g, '-');
      let canonical = norm in PROVINCE_SLUG_TO_DB_KEY ? norm : null;
      if (!canonical) {
        for (const [slug, key] of Object.entries(PROVINCE_SLUG_TO_DB_KEY)) {
          if (normaliseSlugToken(key) === normaliseSlugToken(provinceQuery)) {
            canonical = slug;
            break;
          }
        }
      }
      if (!canonical) {
        const alias = PROVINCE_ALIAS_TO_CANONICAL[norm];
        if (alias) canonical = alias;
      }
      if (canonical) {
        const url = request.nextUrl.clone();
        url.pathname = relocale(`/subastas/provincia/${canonical}`, urlHadLocale);
        url.search = '';
        return NextResponse.redirect(url, 301);
      }
    } else if (typeQuery) {
      const norm = normaliseSlugToken(typeQuery);
      const canonical = (norm in TIPO_SLUG_TO_DB_KEYS) ? norm : TIPO_ALIAS_TO_CANONICAL[norm];
      if (canonical) {
        const url = request.nextUrl.clone();
        url.pathname = relocale(`/subastas/tipo/${canonical}`, urlHadLocale);
        url.search = '';
        return NextResponse.redirect(url, 301);
      }
    } else if (categoryQuery) {
      const norm = normaliseSlugToken(categoryQuery);
      let canonical: string | null = norm in CATEGORY_SLUG_TO_DB_LABEL ? norm : null;
      if (!canonical) canonical = CATEGORY_ALIAS_TO_CANONICAL[norm] ?? null;
      if (canonical) {
        const url = request.nextUrl.clone();
        url.pathname = relocale(`/subastas/${canonical}`, urlHadLocale);
        url.search = '';
        return NextResponse.redirect(url, 301);
      }
    }
  }

  // ---- Rule 3 + 4: normalisation + alias 301s on SEO routes --------------
  const provinciaMatch = pathname.match(/^\/subastas\/provincia\/([^/?#]+)\/?$/);
  if (provinciaMatch) {
    const raw = provinciaMatch[1];
    const norm = normaliseSlugToken(raw).replace(/\s+/g, '-');
    let target: string | null = null;
    if (raw !== norm) target = norm;
    const aliased = PROVINCE_ALIAS_TO_CANONICAL[norm];
    if (aliased) target = aliased;
    if (target && target !== raw) {
      const url = request.nextUrl.clone();
      url.pathname = relocale(`/subastas/provincia/${target}`, urlHadLocale);
      return NextResponse.redirect(url, 301);
    }
  }

  const tipoMatch = pathname.match(/^\/subastas\/tipo\/([^/?#]+)\/?$/);
  if (tipoMatch) {
    const raw = tipoMatch[1];
    const norm = normaliseSlugToken(raw);
    let target: string | null = null;
    if (raw !== norm) target = norm;
    const aliased = TIPO_ALIAS_TO_CANONICAL[norm];
    if (aliased) target = aliased;
    if (target && target !== raw) {
      const url = request.nextUrl.clone();
      url.pathname = relocale(`/subastas/tipo/${target}`, urlHadLocale);
      return NextResponse.redirect(url, 301);
    }
  }

  const catMatch = pathname.match(/^\/subastas\/([^/?#]+)\/?$/);
  if (catMatch) {
    const raw = catMatch[1];
    const norm = normaliseSlugToken(raw);
    const isSubRoute = raw === 'provincia' || raw === 'tipo' || raw === 'subasta' || raw === 'provincias' || raw === 'tipos';
    if (!isSubRoute) {
      let target: string | null = null;
      if (raw !== norm) target = norm;
      const aliased = CATEGORY_ALIAS_TO_CANONICAL[norm];
      if (aliased) target = aliased;
      if (target && target !== raw) {
        const url = request.nextUrl.clone();
        url.pathname = relocale(`/subastas/${target}`, urlHadLocale);
        return NextResponse.redirect(url, 301);
      }
    }
  }

  // ---- Default passthrough -----------------------------------------------
  // If the URL was `/en/...`, rewrite internally to the locale-agnostic path
  // so existing routes (which live at the un-prefixed locations) handle the
  // request. The detected locale is carried via the `x-locale` request header
  // for getRequestConfig + layout.
  let response: NextResponse;
  if (urlHadLocale) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathname;
    // Forward the locale header on the rewritten request
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);
    response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);
    response = NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Persist the locale choice so a cookie-only revisit picks up the right messages.
  if (urlHadLocale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  if (process.env.NODE_ENV === 'development') {
    response.headers.set('Content-Security-Policy', "script-src 'self' 'unsafe-eval' 'unsafe-inline';");
  }
  return response;
}

export const config = {
  matcher: [
    // Match everything except api, _next, favicon. We MUST run on /auction/*
    // to catch the legacy-detail 301 before it 404s.
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
