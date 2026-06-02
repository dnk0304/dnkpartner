# FORGE_PLAN_SEO.md — Wave B2 SEO Programmatic Pages + #15 URL fix

## Goal
Convert query-param filters into path-based, indexable Spanish pages: 52 province + 5 tipo + 9 dense category routes; move auction detail from `/auction/{id}` → `/subastas/subasta/{slug}` with 301; sitemap.xml index + robots.txt.

## Decisions
- **Slug system:** build-time constants (no DB migration). Algorithm in `lib/seo/slugs.ts` is deterministic, accent-fold, ñ→n, aliases as constant map.
- **Auction slug composition:** `{tipo}-{provincia}-{municipio}-{auction.id}` — auction.id (cuid) is the unique trailing disambiguator; resolver matches by trailing id token. Stated in return.
- **OFFICIAL_CATEGORIES allowlist:** 15-entry constant. Non-listed labels → 404 unless reserved-word; off-taxonomy `Oficinas`-like → noindex.
- **Category → DB label map:** singular slug → exact DB plural label (no "vehiculo" rollup at data layer).
- **Inventory threshold:** province/tipo always indexable; category indexable if active count ≥ 5 AND label in OFFICIAL_CATEGORIES; otherwise noindex,follow + sitemap-excluded.

## Files
- `src/lib/seo/slugs.ts` — slug grammar (provinces, tipos, categories) + aliases
- `src/lib/seo/auction-slug.ts` — auction detail slug compose + resolve
- `src/lib/seo/page-data.ts` — server-side count + auction-list fetchers
- `src/app/subastas/provincia/[provincia]/page.tsx`
- `src/app/subastas/tipo/[tipo]/page.tsx`
- `src/app/subastas/[categoria]/page.tsx` (reserved-word guard)
- `src/app/subastas/subasta/[slug]/page.tsx` + `.../SubastaDetailClient.tsx` (Spanish wrapper around existing detail)
- `src/app/auction/[id]/page.tsx` — replace with 301 redirect to new path
- `src/middleware.ts` — extend to do: lowercase normalization, alias 301s, `?province=` → path 301, `/subastas/auction/[id]` → 301
- `src/app/sitemap.ts` — sitemap index
- `src/app/sitemap-[type]/route.ts` — child sitemaps (provincias, tipos, categorias, subastas, guias, core)
- `src/app/robots.ts`
- `src/components/seo/PageSeoBlock.tsx` — intro copy, breadcrumbs, JSON-LD

## Verification
- Build, serve, hit province + category + detail + 301 + sitemap
