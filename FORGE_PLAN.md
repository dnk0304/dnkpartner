# FORGE_PLAN — counts fold + 441→542 fix + claimedAmount payload (2026-06-03)

## Goal
Make every active-count surface reconcile to canonical **542** (province=Σmunicipalities, list-total==badge under all sorts) AND surface `claimedAmount` on the main `/api/auctions` payload + `AuctionItem` type so Pixel's card display can show "Cantidad reclamada" as a secondary line.

Branch: `forge/counts-fold-441-claimed` off `origin/dnksubastas` tip `d585e34`.

## Tasks
1. **TASK-001** — Lift `normalizeText` → `subastas/src/lib/normalize.ts`; import in `counts/route.ts` + `auctions/route.ts`.
2. **TASK-002** — Counts route: JS-fold province AND municipality + bucket null/blank munis as `"Otros / Sin municipio"` + canonical display label pick.
3. **TASK-003** — `filters.ts` §8B: default Activas → `status=active` (canonical 542 branch).
4. **TASK-004** — `/api/auctions` payload + `AuctionItem` type + `favorites/page.tsx`: add `claimedAmount`.
5. **TASK-005** — Consumer touch-ups: `SubastasListClient.tsx` muni-dropdown fetch (+`&status=active`, read `counts.active`); `ProvinceHierarchy.tsx` minimal correctness.
6. **TASK-006** — `prisma generate` + `tsc --noEmit` + `next build` clean. Commit+push.

## Risk Flags
- `ProvinceHierarchy.tsx` is dead in wave42 (no importers found); minimal correctness fix is cheap.
- `SubastasListClient.tsx` two-line plumbing change (`&status=active` + `counts.total`→`counts.active`) is data-plumbing, not styling.
- "Otros / Sin municipio" bucket emitted as a real dict key (human label) for simplicity; consumer sorts/orders.

## Open Decisions
None — brief is prescriptive.
