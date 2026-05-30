# FORGE_PLAN.md — dnksubastas RC SOURCE FIX (Catastro coverage)

## Goal
RC enrichment shipped (`f29c53f`) but yields 0% coverage: the fetch targets `subastas.boe.es/detalleSubasta.php?idSub=<BOE-gazette-id>` — wrong URL, always errors "Identificador de subasta incorrecto". Active rows came from TEJU (boeId is `BOE-J-YYYY-NNNN` gazette ref), not from the portal scraper (portal idSub is `SUB-JA-YYYY-NNNNNN`). Fix: capture/derive the portal `idSub` and use it to fetch the portal's Bienes tab where RC lives reliably; add gazette-text + PDF-edict fallbacks.

## Root cause (confirmed by code reading)
- `subastas/scraper/scrapers/teju_scraper.py` ingests pre-auctions from BOE's TEJU system → boeId = gazette ref `BOE-J-*`. `auctionId` column is NULL.
- `subastas/scraper/scrapers/boe_scraper.py` ingests from the auction portal → boeId IS the portal idSub `SUB-JA-*` (extracted via `_extract_boe_id` regex from `?idSub=` href). It correctly hits the portal detail page. BUT `auctionId` is never set — same value redundantly in boeId.
- Active rows in prod skew heavily TEJU → portal URL fails → 0% RC.

## Fix architecture
For any row whose `boeId` starts with `SUB-`, the portal URL works and RC extraction already worked pre-fix (just need to ensure `auctionId` mirrors it). For TEJU rows (`BOE-J-*`):
1. Fetch the gazette edict HTML (`https://www.boe.es/diario_boe/txt.php?id=<boeId>`).
2. Extract embedded portal idSub — BOE judicial edicts conventionally print one of:
   - `Identificador único en el Portal de Subastas: SUB-JA-XXXX-XXXXXX`
   - link `href="https://subastas.boe.es/detalleSubasta.php?idSub=SUB-XX-XXXX-XXXXXX"`
3. If portal idSub found → persist to `auctionId` + GOTO portal Bienes tab → extract RC.
4. If no portal idSub → parse gazette body text for RC (anchored regex).
5. If still none → follow PDF edicto link, parse PDF text.

## Tasks

### TASK-001: Backfill script rewrite (`subastas/scripts/backfill-cadastral-ref.py`)
- Fix SQL enum cast: `status::text = ANY(%s)`.
- Select `boeId, "auctionId", "edictUrl"` (need all three).
- New fetch flow per row:
  1. If `auctionId` populated OR `boeId` starts with `SUB-` → goto portal detailSubasta → extract Bienes section → RC.
  2. Else: goto gazette `txt.php?id=<boeId>` → parse body for embedded portal idSub regex → if found, also fetch portal → RC. Persist discovered `auctionId`.
  3. Fallback: parse gazette body text for RC directly.
  4. Final fallback: download PDF edicto link → text-extract → RC.
- Persist: `cadastralRef`, `cadastralData`, `auctionId` (when newly discovered).
- Add new regex: `_PORTAL_IDSUB_RE = re.compile(r'(SUB-[A-Z]{2}-\d{4}-\d+)')`.
- PDF extraction: use `pypdf` (already commonly present) or fall back to skipping if not installed.
- Files: 1 (~120 LOC modified)
- Budget: NORMAL

### TASK-002: Portal scraper persists portal idSub explicitly (`subastas/scraper/scrapers/boe_scraper.py`)
- In `parse_listing`, set `auction_data['auction_id'] = boe_id` whenever boe_id matches `^SUB-` (so the column is populated going-forward — currently NULL for everything).
- Files: 1 (~5 LOC)
- Budget: LEAN

### TASK-003: TEJU scraper persists discovered portal idSub if present in edict body (`subastas/scraper/scrapers/teju_scraper.py`)
- During edict parsing, regex the edict body for `SUB-[A-Z]{2}-\d{4}-\d+`; if found, set `auction_data['auction_id']`.
- Defer to scope-control: only add this if quick — gazette-side scraper already in flux. NOT required for backfill to work.

## Verification (no live boe.es access from sandbox)
- `python -c "import ast; ast.parse(open(...))"` on both modified files.
- tsc clean (no .ts touched, so trivially clean).
- Manual reasoning trace: portal-idSub row → portal URL → Bienes → RC (matches the proven-working f29c53f path).

## Expected coverage delta vs 7.5% baseline
- Active rows that already have `boeId = SUB-*` (small slice — verify in deploy log): portal Bienes tab → high RC hit rate (60-80% per BOE convention for inmueble lots).
- TEJU rows whose gazette text contains embedded portal idSub: pulled through to portal Bienes → similarly high.
- Rows with neither portal id nor inline RC in gazette: stuck at PDF fallback. PDFs vary wildly.
- Realistic net: 25-50% of active inmueble rows, vs 7.5% current. Will be confirmed by Ken on full deploy + backfill.

## Out of scope
- Schema migration: `auctionId` column already exists.
- Lazy resolver on cache-miss (Task D in brief): defer.
- Mapping every TEJU row's gazette ref → portal idSub via the search portal (would require search heuristics — too brittle for backfill).
