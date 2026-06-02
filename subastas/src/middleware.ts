/**
 * Edge middleware — handles SEO routing rules (Wave B2).
 *
 * Responsibilities (in execution order):
 *  1. Dev CSP header passthrough (unchanged).
 *  2. Legacy auction-detail 301:
 *       /auction/{id}           → /subastas/subasta/{id}  (defer slug-resolve to the page)
 *       /subastas/auction/{id}  → /subastas/subasta/{id}
 *     The slug page resolves the trailing-id token → exact row → 301 to its
 *     canonical slug (belt-and-braces, so a bare id link still works).
 *  3. Case / accent normalisation on the SEO routes:
 *       /subastas/PROVINCIA/Barcelona → /subastas/provincia/barcelona
 *  4. Province / category alias 301s:
 *       /subastas/provincia/la-coruna → /subastas/provincia/a-coruna
 *       /subastas/vehiculo            → /subastas/turismo
 *  5. Query-param → path 301:
 *       /subastas?province=Madrid → /subastas/provincia/madrid
 *
 * Designed to compose cleanly with a later i18n middleware (#7): all rules
 * key off the path tail, not a hard-coded /subastas root, so an /en prefix
 * can be inserted at the front without rewriting this file.
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

function normaliseSlugToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function middleware(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  // ---- Rule 2: legacy auction detail → /subastas/subasta/{id} ------------
  // Match /auction/{id} OR /subastas/auction/{id}. We pass the bare id as a
  // candidate slug — the slug page does the row lookup and 301-resolves to
  // the canonical {tipo}-{provincia}-{municipio}-{id} composition.
  const legacyAuction = pathname.match(/^\/(?:subastas\/)?auction\/([^/?#]+)\/?$/);
  if (legacyAuction) {
    const id = legacyAuction[1];
    const url = request.nextUrl.clone();
    url.pathname = `/subastas/subasta/${id}`;
    return NextResponse.redirect(url, 301);
  }

  // ---- Rule 5: /subastas?province=... → /subastas/provincia/{slug} -------
  // Only when path is exactly /subastas (or /subastas/) — don't poach sub-routes.
  if (pathname === '/subastas' || pathname === '/subastas/') {
    const provinceQuery = searchParams.get('province');
    const typeQuery = searchParams.get('type') ?? searchParams.get('auctionType');
    const categoryQuery = searchParams.get('category');
    if (provinceQuery) {
      const norm = normaliseSlugToken(provinceQuery).replace(/\s+/g, '-');
      // Match against canonical slugs OR DB labels (case-insensitive accent-folded)
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
        url.pathname = `/subastas/provincia/${canonical}`;
        url.search = '';
        return NextResponse.redirect(url, 301);
      }
    } else if (typeQuery) {
      const norm = normaliseSlugToken(typeQuery);
      const canonical = (norm in TIPO_SLUG_TO_DB_KEYS) ? norm : TIPO_ALIAS_TO_CANONICAL[norm];
      if (canonical) {
        const url = request.nextUrl.clone();
        url.pathname = `/subastas/tipo/${canonical}`;
        url.search = '';
        return NextResponse.redirect(url, 301);
      }
    } else if (categoryQuery) {
      const norm = normaliseSlugToken(categoryQuery);
      let canonical: string | null = norm in CATEGORY_SLUG_TO_DB_LABEL ? norm : null;
      if (!canonical) canonical = CATEGORY_ALIAS_TO_CANONICAL[norm] ?? null;
      if (canonical) {
        const url = request.nextUrl.clone();
        url.pathname = `/subastas/${canonical}`;
        url.search = '';
        return NextResponse.redirect(url, 301);
      }
    }
  }

  // ---- Rule 3 + 4: normalisation + alias 301s on SEO routes --------------
  // /subastas/provincia/{slug}
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
      url.pathname = `/subastas/provincia/${target}`;
      return NextResponse.redirect(url, 301);
    }
  }

  // /subastas/tipo/{slug}
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
      url.pathname = `/subastas/tipo/${target}`;
      return NextResponse.redirect(url, 301);
    }
  }

  // /subastas/{categoria} — only categories, not real sub-routes (subasta, provincia, tipo).
  const catMatch = pathname.match(/^\/subastas\/([^/?#]+)\/?$/);
  if (catMatch) {
    const raw = catMatch[1];
    const norm = normaliseSlugToken(raw);
    // Don't 301 the real sub-route prefixes — they are not categories.
    const isSubRoute = raw === 'provincia' || raw === 'tipo' || raw === 'subasta' || raw === 'provincias' || raw === 'tipos';
    if (!isSubRoute) {
      let target: string | null = null;
      if (raw !== norm) target = norm;
      const aliased = CATEGORY_ALIAS_TO_CANONICAL[norm];
      if (aliased) target = aliased;
      if (target && target !== raw) {
        const url = request.nextUrl.clone();
        url.pathname = `/subastas/${target}`;
        return NextResponse.redirect(url, 301);
      }
    }
  }

  // ---- Default passthrough + dev CSP -------------------------------------
  const response = NextResponse.next();
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

