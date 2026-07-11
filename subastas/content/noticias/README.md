# Noticias — publishing pipeline

Markdown-file-driven news for `/noticias` (es) and `/en/noticias` (en).
**A git commit + wave redeploy IS the publish action.** No DB, no migration,
no admin UI. This system is fully independent from the DB-backed `/blog` +
`/guia` article system — never move content between the two.

## File contract

One file per article per locale, in THIS folder:

```
content/noticias/<slug>.es.md    # required — Spanish is the primary locale
content/noticias/<slug>.en.md    # optional — English version
```

- `slug` = lowercase letters/digits/hyphens (`^[a-z0-9]+(-[a-z0-9]+)*$`),
  and must not collide with reserved route segments (see
  `src/lib/seo/slugs.ts` → `RESERVED_SEGMENTS`).
- If `<slug>.en.md` is missing: `/en/noticias/<slug>` returns **404** and the
  article is **omitted** from the English listing, English hreflang and the
  English sitemap entries (locked decision — no thin duplicates).
- An `.en.md` without a matching `.es.md` **fails the build**.

## Frontmatter contract

```yaml
---
title: "..."          # required
description: "..."    # required — meta description + listing teaser, ≤160 chars
date: "2026-07-10"    # required, YYYY-MM-DD — publish date, drives listing order
updated: "2026-07-12" # optional, YYYY-MM-DD — bumps sitemap lastmod
author: "..."         # optional, default "SubastasActivas"
draft: true           # optional — draft: true files are EXCLUDED everywhere
ogImage: "/og/x.png"  # optional, path under /public
---
```

Validation is HARD: a missing/invalid required field fails `next build`
(via `generateStaticParams` → `getAllSlugs()` in `src/lib/noticias.ts`).
Broken content can never reach production.

Body = plain Markdown (GFM: tables, task lists, strikethrough). Raw HTML is
NOT rendered (security posture of the shared `ArticleContent` renderer).

## Pipeline (repeatable)

1. **SAGA** writes `content/noticias/<slug>.es.md` (+ optional `.en.md`) per
   the contract above, with `draft: true` while in review.
2. **Ken** reviews → flips `draft: false` → commits on the `dnksubastas`
   branch → pushes origin.
3. **Ken** wave-deploys (app-only image rebuild; markdown is baked into the
   image at build — no DB, no migration, scheduler untouched).
4. **Rollback** = `git revert` the content commit + redeploy the previous
   wave image.

## What publishing updates automatically

- `/noticias` + `/en/noticias` listings (newest first by `date`).
- `/noticias/<slug>` (+ `/en/noticias/<slug>` when `.en.md` exists) with
  per-article meta, OpenGraph, hreflang (only when both locales exist) and
  `NewsArticle` JSON-LD.
- `sitemap/0.xml` entries (es always; en only when the file exists);
  `lastmod` = `updated ?? date`.
