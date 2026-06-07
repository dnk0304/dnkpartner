# FORGE_PLAN — Expose Seguridad Social as source label + filter

## Goal
Expose `source = "SEGSOCIAL"` rows in the SubastasActivas UI: visible "Seguridad Social"
badge on cards/teaser, source filter option on /subastas, source counts
data-driven (no hardcoded source list). App-only; rows are already live in DB.

## Architecture
- New lib: `src/lib/source-labels.ts` — single source-of-truth map.
- New component: `src/components/observatory/SourceBadge.tsx`.
- Widen the residual `'BOE' | 'TEJU'` casts in `src/app/api/auctions/route.ts`.
- Add `?source=...` whitelisted filter param to `/api/auctions`.
- Add `groupBy=source` to `/api/auctions/counts` (data-driven).
- Wire source filter into FiltersSidebar + filters.ts URL/state/API mapping.
- Add `source` to teaser data path + render badge on teaser/cards.
- Add labels to es/en.json.

## Tasks

### TASK-001: source-labels lib
- Create `src/lib/source-labels.ts` exporting `SOURCE_LABEL_MAP` and
  `getSourceLabel(s)` + `KNOWN_SOURCES` whitelist.
- Files: +1 new (~40 lines). SAFE.

### TASK-002: Widen API source casts + add source filter
- Edit `src/app/api/auctions/route.ts`: drop the `as 'BOE' | 'TEJU'` casts; add
  `?source=` param (single + multi `sources=`), whitelist, apply at preStatusSql.
- Files: 1 edited (~40 lines). SAFE.

### TASK-003: counts groupBy=source
- Edit `src/app/api/auctions/counts/route.ts` to accept `groupBy=source` and
  emit data-driven per-source counts (no hardcoded list).
- Files: 1 edited (~25 lines). SAFE.

### TASK-004: SourceBadge component
- Create `src/components/observatory/SourceBadge.tsx` mirroring AuctionTypeBadge.
- Files: +1 new (~50 lines). SAFE.

### TASK-005: Render badge on cards + teaser
- Edit AuctionResultRow.tsx, AuctionListCard.tsx — add SourceBadge near existing
  badges row.
- Edit AuctionTeaser.tsx — add `source` to AuctionTeaserData; render badge.
- Edit `/api/auctions/[id]/route.ts` if needed to project source.
- Edit subasta detail page to select+pass source.
- Files: ~4 edited (~30 lines total). SAFE.

### TASK-006: FiltersSidebar source filter + filters.ts wiring
- Edit `filters.ts`: add `sources: string[]` to ObservatoryFilters, URL r/t, API
  param.
- Edit FiltersSidebar.tsx: add "Fuente" block with BOE + Seguridad Social
  checkboxes.
- Edit `SimpleFilters.tsx` (ActiveFilterChips) if needed to show source chip.
- Files: ~3 edited (~80 lines). SAFE.

### TASK-007: es/en.json labels
- Add `filters.sourceLabel`, `filters.sourceBoe`, `filters.sourceSegsocial`,
  `filters.sourceTeju` (parallel keys both files).
- Files: 2 edited (~8 lines). SAFE.

### TASK-008: Gate verify
- Run `tsc --noEmit` and `next build`.
- Commit + push.

## Execution order
001 → 002, 003 (parallel after 001) → 004 → 005, 006 (parallel) → 007 → 008.

## Risk Flags
- Teaser is SSR + PII-safe; only ADD a public-data field. Don't import or
  modify teaser-snippet.ts.
- The FilterChips dashboard component already mislabels `tributaria` →
  "Seguridad Social". Out of scope (separate filter component, no impact on
  /subastas). Leave it.
