# URL-v3 APP LAYER — plan (Forge, dispatch URL-APPLAYER, Ken 2026-08-04)

Branch `forge/url-v3-applayer`, worktree `C:\Users\D\Desktop\forge-wt-applayer`.
Base **`9f7617d`** = real `origin/dnksubastas` tip (Ken's brief said `ceb81a4`; two
deploy-guard commits landed after he wrote it — verified with `git ls-remote`).
Merged `74fa07e` (`forge/url-v3-switchover`), which is a strict SUPERSET of
`69d1f17` — it carries every url-v3 lib file plus `reserved-segments.ts` and the
`npm run build` guard. Merge commit `bad07e8`, no conflicts.

## The shape of the problem

Three places independently re-derive the detail URL by calling `buildAuctionSlug`:

| # | site | file |
|---|---|---|
| 1 | page canonical + OG | `src/app/subastas/subasta/[slug]/page.tsx` |
| 2 | JSON-LD `pageUrl` (`@id`, `url`, breadcrumb, place, offer) | `src/lib/seo/json-ld.ts` |
| 3 | sitemap entries (active + concluded bands) | `src/lib/seo/sitemap-entries.ts` |

Ken's ruling *"canonical and URL must agree on the same render"* is not something
to check three times — it is something to make **structurally impossible to
violate**. So the plan collapses all three onto ONE resolver, and the switch
moves all three together or none.

## Design decisions (with reasons)

**D1 — Redirect mechanism: `permanentRedirect()` from `next/navigation`, HTTP 308.**
Ken amended the ruling to "permanent, 301 or 308 both count; do NOT force a Node
runtime per request to emit a literal 301." Middleware is the only place that
could emit a literal 301 cheaply, and middleware runs on the **edge runtime**
where the `pg` pool in `@/lib/db` cannot open a socket — so a 301 would cost
either a forced Node runtime or a second network hop per request, for 192k URLs.
`permanentRedirect()` runs inside the detail page's **existing** Node render, on
a lookup keyed by the `auction_url_v3` **primary key**, and emits 308 —
permanent, method-preserving, and treated as permanent by Google. Chosen.

**D2 — Reads go through raw SQL (`@/lib/db`), not Prisma.**
`auction_url_v3` is deliberately NOT in `prisma/schema.prisma`. Deploys run
`prisma migrate deploy` (Dockerfile CMD), which never touches an unmanaged
table, so the table is safe as-is. Adding a Prisma model would mean a migration
that tries to CREATE a table holding 192,589 live rows. Raw SQL is both the
lower-risk and the already-established path for this repo.

**D3 — Absence of a v3 row IS the "do not redirect" signal.**
No flag column, no exception list. 48,303 of 240,892 rows have no
`auction_url_v3` row (hex-legacy 12,346 + held 1,713 + degraded + quarantined).
They are not redirected because there is nothing to redirect them to, and they
keep serving their old URL at 200. This makes Ken's *"every old URL must
resolve, never a 404"* invariant true **by construction** rather than by a
predicate someone can get wrong. It also satisfies "adding the held rows later
must require no second switchover": the resolver reads the table live, so
minting their rows is the whole of the change.

**D4 — The switch is one env var, server-only, default OFF.**
`URL_V3_SWITCH === '1'`. Matches the repo's established flag convention
(`src/lib/auction-image-url.ts`: unprefixed, server-side, `=== '1'`,
default-off). Unset in every environment ⇒ deploying this branch changes
nothing a user or a crawler can see. The flip is a code revert away.

**D5 — With the switch OFF the v3 route still SERVES (200), but nothing points
at it.** Ken explicitly allows this ("new routes may exist and serve, but nothing
advertises them"). Its canonical points at the LEGACY URL while off, so even a
crawler that guessed the URL would be told the legacy one is canonical. That is
what makes browser verification of the dark code possible at all.

## Tasks

### TASK-001 — the switch + the resolver  (DB · Low · ~2 files read, ~130 lines)
- `src/lib/seo/url-v3-switch.ts` — the ONE definition of the switch. Read at
  call time, not module load, so a build never bakes it in.
- `src/lib/seo/auction-url.ts` —
  - `fetchV3Url(auctionId)` — PK lookup, returns `string | null`.
  - `fetchV3UrlsBatch(ids)` — one `= ANY($1)` query, for the sitemap (no N+1).
  - `fetchAuctionIdByV3Url(url)` — UNIQUE-index lookup, for the v3 route.
  - `resolveAuctionPath(row, v3Url)` — switch OFF **or** no v3 row ⇒ legacy
    `/subastas/subasta/{buildAuctionSlug(row)}`; else the v3 url.
  Every read is guarded on the switch where the switch decides the answer, so
  with the switch OFF the app issues **zero** extra queries.
- **Delegatable:** No (it is the load-bearing seam).

### TASK-002 — extract the shared detail view  (Service · Medium · ~2 files, ~250 lines)
- `src/lib/auction-detail-view.tsx` — lift `loadAuctionMeta`, the metadata
  builder and the render body out of the existing page, parameterised by the
  resolved canonical `path`.
- Rewrite `src/app/subastas/subasta/[slug]/page.tsx` as a thin shell over it.
- Why: the v3 route must render the *same* page. Copying ~300 lines would create
  two pages that drift, and drift here means canonical/URL disagreement — the
  exact failure Ken singled out. One module ⇒ they cannot disagree.
- **Delegatable:** No.

### TASK-003 — the v3 detail route  (API · Low · ~1 file, ~80 lines)
- `src/app/subastas/[slug]/[municipio]/[detalle]/page.tsx`.
- Reassemble `/subastas/{slug}/{municipio}/{detalle}`, look it up on the UNIQUE
  `url` index, `notFound()` on a miss. `pagina` stays a literal sibling and
  still wins the match, which is exactly what `reserved-segments.ts` encodes.
- **Delegatable:** No.

### TASK-004 — the permanent-redirect layer  (API · Low · ~1 file, ~20 lines)
- In the legacy detail page: switch ON **and** a v3 row exists ⇒
  `permanentRedirect(v3Url)`. Placed BEFORE the existing non-canonical-slug
  `redirect()` so an old non-canonical link resolves in **one** hop, not two.
- **Delegatable:** No.

### TASK-005 — canonical + JSON-LD on the resolved path  (Service · Low · ~2 files, ~30 lines)
- `json-ld.ts`: `buildAuctionJsonLd(auction, pageUrl?)` — the caller passes the
  resolved path; the existing derivation stays as the default so no other caller
  changes. Same render, same URL, one variable.
- **Delegatable:** No.

### TASK-006 — sitemap GENERATED, NOT PUBLISHED  (Service · Medium · ~2 files, ~120 lines)
- `sitemap-entries.ts`: both detail bands take their URL from the resolver, via
  ONE batch fetch per chunk. Switch OFF ⇒ byte-identical to today's output.
- `scripts/url-v3-sitemap-generate.ts` — writes the v3 sitemap to a **file** for
  inspection, and never to a served route. Generation and publication stay two
  separate acts; publication is the crawl event and belongs to the switch
  dispatch.
- **Delegatable:** No.

### TASK-007 — tests + gates  (Test · Medium · ~2 files, ~200 lines)
- `src/lib/seo/auction-url.test.ts` (tsx assertion script, repo convention —
  these are NOT vitest suites).
- Assertions that matter: switch OFF ⇒ legacy everywhere; hex-legacy row ⇒ never
  redirected; held row ⇒ stays on its old URL and needs no code change to move;
  canonical == the URL the page was reached by, on the same render.
- Gates: `tsc --noEmit` 0 · `npm run build` 0 (reserved guard active) · isolated
  DB · local prod build serving real sample URLs · zero console.

### TASK-008 — verify in a browser behind the OFF switch, then ledger
- Isolated PG 16 DB `subastas_applayer_forge` (local docker), schema from
  `prisma migrate deploy`, `auction_url_v3` DDL copied from prod, sample rows.
- Dual-write ledger to `forge-backend/` and `niki/`.

## Execution order
001 → 002 → (003, 004, 005 in that order, all depend on 002) → 006 → 007 → 008.

## Risk flags
- **R1** Adding `[detalle]` makes every 4-segment `/subastas/a/b/c` path match a
  route where it previously 404'd. Mitigated: unmatched ⇒ `notFound()`, and the
  reserved guard proves `pagina` still wins. Must be verified, not assumed.
- **R2** `auction_url_v3` is invisible to Prisma. Safe under `migrate deploy`,
  but a future `prisma db push` would drop 192,589 rows. Flag to Ken.
- **R3** The sitemap's batch lookup adds a query per chunk when the switch is
  ON. Bounded (5 chunks) and skipped entirely while OFF.
- **R4** Next 16 + a junctioned `node_modules` panics under Turbopack; using a
  real `npm ci` in this worktree to keep the build gate honest.

## Open decisions
None blocking. R2 is a recommendation for Ken, not a gate.

---

# REVIEW — all tasks complete (2026-08-04)

Branch `forge/url-v3-applayer`, tip `7784231`, remote SHA
`7784231dfa624d074b4e9261b7e2c65dfc4f9771`. **Pushed, NOT deployed.**

| task | outcome |
|---|---|
| 001 switch + resolver | done — `url-v3-switch.ts`, `auction-url.ts` |
| 002 shared detail view | done — `auction-detail-view.tsx`; both routes are shells |
| 003 v3 route | done — `[slug]/[municipio]/[detalle]/page.tsx` |
| 004 redirect layer | done — 308 via `permanentRedirect()`, fires before the slug canonicaliser |
| 005 canonical + JSON-LD | done — `buildAuctionJsonLd(auction, canonicalPageUrl?)` |
| 006 sitemap gen-not-pub | done — resolver in both bands + `url-v3-sitemap-generate.ts` |
| 007 tests | done — 19/19 |
| 008 browser + ledger | done |

## Gate results (all exit 0)
- `tsc --noEmit` **0**
- `npm run build` **0**, reserved guard green, route table shows `[detalle]` and
  `pagina/[page]` as siblings
- app-layer proofs on isolated PG16 `subastas_applayer_forge`: **19/19**
- pre-existing url-v3 suites: descriptor-guard, descriptor-v3, resolve-town all **0**
- runtime gate switch **OFF: 10/10**; switch **ON: 11/11**
- sitemap: **7** v3 urls generated to a file, **0** v3 urls in the served sitemap
- browser (CDP, headless Chrome), 2 v3 samples behind the OFF switch: renders,
  `canonical === JSON-LD @id`, canonical points at the LEGACY url, no redirect
  fires, zero console errors/warnings

## Two things worth Ken's attention
1. **`auction_url_v3` is invisible to Prisma.** Safe today (`prisma migrate
   deploy` never touches an unmanaged table) but a future `prisma db push`
   would drop 192,589 rows without a warning. Recommend either adopting it into
   the schema with a no-op baseline migration, or a documented ban on `db push`.
2. **`deploy-guard.sh preflight-app` refuses until the branch is on the deploy
   box** — the self-integrity gate added in `9f7617d` fails closed when it has
   no committed counterpart at the box's HEAD. Working as designed; it just
   means the guard runs at deploy time, not from a local worktree.

## Correction to the runbook
Base is `9f7617d`, not `ceb81a4` — `ca6e510` and `9f7617d` (deploy-guard
self-integrity) landed after the brief was written. Verified with `ls-remote`.
