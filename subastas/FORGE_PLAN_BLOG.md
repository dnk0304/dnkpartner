# FORGE_PLAN — Phase 9a (BACKEND half) — Blog + Article Import

## Goal
Deliver the backend half of dnksubastas Feature #9: a Prisma `Article` model, a
migration file (created, NOT applied — Ken applies migration slot #1), an
import script that parses the 56 finished Spanish SEO articles' heterogeneous
header blocks and upserts them as DRAFTs, and admin-gated CRUD API routes.
Public pages + editor UI are Pixel's job in Phase 9b.

## Tech Stack
- Prisma 7.2.0 + Postgres (already live).
- Next.js App Router API routes.
- Reuse `requireAdmin()` from `src/lib/auth-helpers.ts` (ADMIN_EMAIL gate).
- Reuse `prisma` from `src/lib/prisma.ts` (lazy-proxy, build-safe).

## Tasks

### TASK-001 — Article model + migration (NOT applied)
- Add `Article` model + `ArticleStatus { DRAFT, PUBLISHED }` enum to
  `prisma/schema.prisma`.
- Fields: id, slug @unique, title, seoTitle, metaDescription, primaryKeyword,
  secondaryKeywords String[], canonicalUrl, bodyMarkdown, status DRAFT default,
  publishedAt, authorEmail, cluster, imageAlt, createdAt, updatedAt.
- Indexes: status, publishedAt, (status, publishedAt desc).
- Create migration file under `prisma/migrations/<ts>_add_article/migration.sql`
  but DO NOT run `prisma migrate deploy` against prod. Ken applies it as slot #1.
- Run `npx prisma generate` locally so types compile.

### TASK-002 — Bespoke header parser + import script
- `scripts/import-articles.ts` (and a `parser.ts` it imports).
- Handles all 5 observed header formats:
  1. Pure YAML frontmatter (`---\nkey: val\n---`).
  2. YAML-delimited but free-form labels (`SEO title (≤60): ...`).
  3. `## META / SEO` section with bold-key bullets (`- **Slug:** \`/guia/...\``).
  4. Bold-key lines after H1 (`**SEO Title:** ...`).
  5. Blockquote `> **META BLOCK ...**` block.
- Extracts: slug (always), title (or seoTitle fallback), seoTitle,
  metaDescription, primaryKeyword, secondaryKeywords[], cluster.
- Slug fallback: filename without `.md`. Slug normalization: strip leading
  `/guia/`, strip backticks, strip surrounding quotes.
- Body cleanup: strip `*Spec para Pixel/Forge:*` / `*Nota a Pixel/Forge:*`
  author-note lines (line-leading `*` + asterisked spec markers). Strip the
  header region entirely (everything up to the first H1 that is NOT inside
  the META block; if H1 is the title, keep it).
- Idempotent: upsert by slug, preserve existing `status` if already PUBLISHED
  (don't demote published articles to DRAFT).
- Supports `--dry-run` (parse only, no DB) and `--db-url=<url>` for testing.
- CLI prints: parsed OK count, failed slugs + reasons, one sample.

### TASK-003 — Admin CRUD API
- `src/app/api/admin/articles/route.ts` — GET list (filter by status), POST create.
- `src/app/api/admin/articles/[slug]/route.ts` — GET one, PATCH update, DELETE.
- `src/app/api/admin/articles/[slug]/publish/route.ts` — POST publish (sets
  status=PUBLISHED, publishedAt=now() if null).
- `src/app/api/admin/articles/[slug]/unpublish/route.ts` — POST unpublish.
- All gated by `requireAdmin()`.
- Public data-fetcher stubs in `src/lib/articles.ts` for Pixel (9b):
  `listPublishedArticles()`, `getArticleBySlug(slug)` — already filtered to
  PUBLISHED.

### TASK-004 — Verification
- `npx prisma generate` clean.
- Parser dry-run against all 56 .md files — paste counts + sample.
- `npx tsc --noEmit` exit 0.
- `npx next build` clean.
- Commit + push `sa/blog-articles`.

## Out of scope (Pixel — 9b)
- `/guia/[slug]` page, `/blog` index page, editor UI, footer link.

## Constraints
- DO NOT apply the migration to prod. Ken does that (migration slot #1).
- DO NOT commit to dnksubastas branch — work on `sa/blog-articles` only.
- Worktree `C:/Users/D/Desktop/sa-wt-blog/subastas/`.
