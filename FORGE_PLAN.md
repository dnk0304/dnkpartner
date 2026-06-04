# FORGE_PLAN.md — Municipality SEO routing (Option A, wave56, 2026-06-04)

## Goal
Re-architect SubastasActivas SEO URLs: province moves to `/subastas/[province]` (was `/subastas/provincia/[province]`, with 301), new town pages at `/subastas/[province]/[municipio]`. Categories + types unchanged. App-only, no migration. Pixel builds page templates off this branch; Ken deploys.

## Branch
`forge-municipality-seo-wave56` off `origin/dnksubastas@1d72b72`.

## Task Breakdown

### T1: slug resolver + ∅-overlap assert
- Add `resolveSubastasSlug` + helpers in `src/lib/seo/slugs.ts`.
- Programmatic assert (module-load) `PROVINCE_SLUGS ∩ CATEGORY_SLUGS === ∅` — throws on overlap.

### T2: rename `[categoria]` → `[slug]` + relocate province body
- `git mv` the folder. Inside `[slug]/page.tsx`: discriminated union by `resolveSubastasSlug`. Category branch byte-identical; province branch relocated with canonical updated to clean URL.
- Delete `src/app/subastas/provincia/[provincia]/page.tsx`. Keep `provincia` in `RESERVED_SEGMENTS`.

### T3: new `[slug]/[municipio]/page.tsx` skeleton
- 2-seg route. Resolves slug→province (must be kind:'province' else 404), resolves municipio → DB name. notFound on miss. lockedFilter={province, municipality}. Pixel fills body.

### T4: server-side municipality filter on `/api/auctions`
- Read `municipality` searchParam. Build folded translate() WHERE against cached distinct-municipalities. Guard: no-op when absent. Add to cacheKey.

### T5: middleware updates
- (A) `/subastas/provincia/X` → 301 → `/subastas/X`.
- (B) Rule 5 province target → clean URL. hasFilterParams guard intact.
- (C) Merged 1-seg normalize folds province alias/case.
- (D) 2-seg town normalize (skip literal tipo/subasta/provincia).

### T6: LockedFilter.municipality + sidebar lock + client wiring
- Extend `LockedFilter` type. SubastasListClient locks municipality + strips from QS. FiltersSidebar locks municipality select.

### T7: page-data + sitemap
- `activeMunicipalityPairs()` (groupBy province+municipality over ACTIVE_STATUSES, fold, dedupe).
- `municipalitySlugToDbName(provinceDbKey, slug)`.
- `sitemap.ts`: province URLs → clean; add town block.

### T8: Runtime verification
- prisma generate, tsc --noEmit, next build, next start + curl all 6 route types.

### T9: commit + push, dual-write memory.

## Execution Order
T1 → T7-data → T2 → T3 → T4 → T6 → T5 → T7-sitemap → T8 → T9
