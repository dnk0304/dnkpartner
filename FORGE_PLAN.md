# FORGE_PLAN.md — Auction document-archive backend (2026-06-03)

## Goal
Land the schema + serve route + storage-path contract that Ghost (scraper) and Pixel (frontend) write/read against. Branch off `origin/dnksubastas` tip `a6c48ec`. Commit + push. NO deploy.

## Architecture
```
BOE -> Ghost (Python scraper) -> /data/auction-docs/<safeKey(boeId)>/<file>.pdf
                                  ^ shared path helper imported from
                                  subastas/src/lib/auction-docs/storage.ts
                                  -> AuctionDocument row (Prisma upsert via adapter)
Pixel -> /api/auctions/[id]    -> documents[] (id, type, title, officialUrl, downloadUrl)
Pixel -> /api/auctions...      -> hasDocuments boolean
Pixel -> /api/auction-doc/<id> -> streams stored PDF from disk
```

## Task breakdown

### TASK-001: storage lib (the Ghost contract)
- File: `subastas/src/lib/auction-docs/storage.ts` (NEW)
- Exports: `AUCTION_DOCS_DIR`, `safeKey(boeId)`, `docDirFor(boeId)`, `docDiskPathFor(boeId, filename)`, `snapshotDiskPathFor(boeId)`, `relPathFor(boeId, filename)`, `publicPathForDocId(id)`, `readDoc(relPath)`, `isValidKey(raw)`, `isValidRelPath(raw)`.
- Mirror auction-images/storage.ts safeKey exactly.

### TASK-002: Prisma schema + back-relation + new Auction cols
- File: `subastas/prisma/schema.prisma`
- AuctionDocument model per Ken's brief; back-relation; new nullable scalars on Auction.

### TASK-003: migration SQL (additive, NOT APPLIED)
- File: `subastas/prisma/migrations/20260603_add_auction_documents/migration.sql`

### TASK-004: GET /api/auction-doc/[id] serve route
- File: `subastas/src/app/api/auction-doc/[id]/route.ts`
- Resolve by AuctionDocument.id → storedPath → disk read → 200 PDF / 404.

### TASK-005: detail projection
- File: `subastas/src/app/api/auctions/[id]/route.ts`
- Include documents + new scalars. Keep BigInt mitigations.

### TASK-006: list/recent projection
- Files: `subastas/src/app/api/auctions/recent/route.ts` (add _count + projector), `subastas/src/app/api/auctions/route.ts` (raw SQL — EXISTS subquery for hasDocuments).

### TASK-007: gates + commit + push
- `npx prisma generate` → `npx tsc --noEmit` → `npx next build` → commit + push.

## Risk flags
- `/api/auctions/route.ts` is raw SQL. `hasDocuments` becomes an EXISTS subquery. Will compile fine; runtime needs migration applied (Ken does that on box).
- AuctionDocument has no BigInt cols.
- The detail route does `findUnique({ where })` (bare). I will replace with `include: { documents }` and keep scalar coercions; cannot use `select` without listing every column. include is safe.

## Decisions
- Add distinct `bienLocalidad` / `bienProvincia` per Ken's brief recommendation.
- docType enum: NOTA_SIMPLE | EDICTO | ANEXO | PLIEGO | SNAPSHOT | OTRO (Ken's brief overrides Niki's lowercase).
- Unique: `@@unique([auctionId, idDoc])` with sentinel `idDoc='SNAPSHOT'` for snapshot rows.
- Migration name: `20260603_add_auction_documents`.
