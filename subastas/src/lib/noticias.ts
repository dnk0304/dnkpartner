/**
 * Noticias content reader — the single source of truth for /noticias.
 *
 * PARALLEL to (and fully independent from) the DB-backed article system
 * (`src/lib/articles.ts`, /blog, /guia). /noticias is markdown-file-driven:
 * SAGA authors `content/noticias/<slug>.<locale>.md`, Ken reviews, a git
 * commit + wave redeploy IS the publish action. No DB, no Prisma, no admin.
 *
 * File contract (documented for authors in `content/noticias/README.md`):
 *   - `<slug>.es.md` — required for an article to exist at all.
 *   - `<slug>.en.md` — optional. When absent, /en/noticias/<slug> 404s and
 *     the slug is omitted from the en listing + en hreflang (locked decision:
 *     404 + omit — no thin es-body duplicates under /en).
 *
 * Frontmatter contract (validated hard — a bad file FAILS THE BUILD via
 * `getAllSlugs()` inside `generateStaticParams`, so malformed content never
 * reaches production):
 *   title:        string, required
 *   description:  string, required, ≤160 chars (meta description + teaser)
 *   date:         string, required, YYYY-MM-DD (publish date, listing order)
 *   updated:      string, optional, YYYY-MM-DD
 *   author:       string, optional, default "SubastasActivas"
 *   draft:        bool, optional — draft:true files are EXCLUDED everywhere
 *   ogImage:      string, optional, path under /public
 */
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Locale } from '@/i18n/routing';
import { RESERVED_SEGMENTS } from '@/lib/seo/slugs';

export interface NoticiaMeta {
  slug: string;
  locale: Locale;
  title: string;
  description: string;
  /** YYYY-MM-DD publish date. */
  date: string;
  /** YYYY-MM-DD, optional. */
  updated?: string;
  author: string;
  ogImage?: string;
  /** True when BOTH .es.md and .en.md exist for this slug (drives hreflang). */
  hasBothLocales: boolean;
}

export interface Noticia extends NoticiaMeta {
  /** Raw Markdown body (frontmatter stripped). */
  content: string;
}

const NOTICIAS_DIR = path.join(process.cwd(), 'content', 'noticias');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fail loudly — surfaced at build time via generateStaticParams. */
function invalid(filename: string, problem: string): never {
  throw new Error(`[noticias] Invalid content file "${filename}": ${problem}`);
}

interface ParsedFile {
  slug: string;
  locale: Locale;
  draft: boolean;
  meta: Omit<NoticiaMeta, 'hasBothLocales'>;
  content: string;
}

function parseFile(filename: string): ParsedFile {
  const m = filename.match(/^(.+)\.(es|en)\.md$/);
  if (!m) {
    invalid(filename, 'filename must be "<slug>.es.md" or "<slug>.en.md"');
  }
  const slug = m[1];
  const locale = m[2] as Locale;
  if (!SLUG_RE.test(slug)) {
    invalid(filename, `slug "${slug}" must be lowercase letters/digits with hyphens`);
  }
  if (RESERVED_SEGMENTS.has(slug)) {
    invalid(filename, `slug "${slug}" collides with a reserved route segment`);
  }

  const raw = fs.readFileSync(path.join(NOTICIAS_DIR, filename), 'utf8');
  const { data, content } = matter(raw);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) invalid(filename, 'frontmatter "title" is required');
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) invalid(filename, 'frontmatter "description" is required');
  if (description.length > 160) {
    invalid(filename, `"description" is ${description.length} chars (max 160)`);
  }
  // gray-matter parses bare YYYY-MM-DD as a JS Date — accept both shapes.
  const date = normaliseDate(data.date);
  if (!date) invalid(filename, 'frontmatter "date" is required, format YYYY-MM-DD');
  const updated = data.updated === undefined ? undefined : normaliseDate(data.updated);
  if (data.updated !== undefined && !updated) {
    invalid(filename, '"updated" must be YYYY-MM-DD');
  }
  if (data.draft !== undefined && typeof data.draft !== 'boolean') {
    invalid(filename, '"draft" must be a boolean');
  }
  if (data.ogImage !== undefined && typeof data.ogImage !== 'string') {
    invalid(filename, '"ogImage" must be a string path under /public');
  }
  if (data.author !== undefined && typeof data.author !== 'string') {
    invalid(filename, '"author" must be a string');
  }
  if (!content.trim()) invalid(filename, 'markdown body is empty');

  return {
    slug,
    locale,
    draft: data.draft === true,
    meta: {
      slug,
      locale,
      title,
      description,
      date,
      updated: updated ?? undefined,
      author: (data.author as string | undefined)?.trim() || 'SubastasActivas',
      ogImage: data.ogImage as string | undefined,
    },
    content,
  };
}

function normaliseDate(value: unknown): string | null {
  if (typeof value === 'string' && DATE_RE.test(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Read + validate the whole content folder. Cached in module scope: content
 * only changes with a redeploy (git commit = publish), so one read per server
 * process is correct and keeps request-time cost at zero after warm-up.
 * An absent folder yields an empty catalogue (content may land later).
 */
let cache: Map<string, Map<Locale, ParsedFile>> | null = null;

function readAll(): Map<string, Map<Locale, ParsedFile>> {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  const bySlug = new Map<string, Map<Locale, ParsedFile>>();
  let files: string[];
  try {
    files = fs.readdirSync(NOTICIAS_DIR);
  } catch {
    cache = bySlug;
    return bySlug;
  }
  for (const f of files) {
    if (!f.endsWith('.md')) continue; // README.md etc. are not articles
    if (!/\.(es|en)\.md$/.test(f)) continue; // README.md, notes — skip silently
    const parsed = parseFile(f);
    if (parsed.draft) continue; // drafts are invisible everywhere
    const locales = bySlug.get(parsed.slug) ?? new Map<Locale, ParsedFile>();
    locales.set(parsed.locale, parsed);
    bySlug.set(parsed.slug, locales);
  }
  // An en-only article is a contract violation: es is the primary locale.
  for (const [slug, locales] of bySlug) {
    if (!locales.has('es')) {
      invalid(`${slug}.en.md`, 'has no matching .es.md — Spanish is required');
    }
  }
  cache = bySlug;
  return bySlug;
}

function toNoticia(file: ParsedFile, hasBothLocales: boolean): Noticia {
  return { ...file.meta, hasBothLocales, content: file.content };
}

/** Published noticias for a locale, newest first (date desc, slug asc tiebreak). */
export function listNoticias(locale: Locale): Noticia[] {
  const out: Noticia[] = [];
  for (const locales of readAll().values()) {
    const file = locales.get(locale);
    if (!file) continue; // en listing omits es-only articles (locked: 404 + omit)
    out.push(toNoticia(file, locales.size === 2));
  }
  return out.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug),
  );
}

/** One noticia, or null (unknown slug / draft / missing locale file → 404). */
export function getNoticia(slug: string, locale: Locale): Noticia | null {
  const locales = readAll().get(slug);
  const file = locales?.get(locale);
  if (!locales || !file) return null;
  return toNoticia(file, locales.size === 2);
}

/** All published slugs (es catalogue). Also the build-time validation gate. */
export function getAllSlugs(): string[] {
  return [...readAll().keys()].sort();
}

/** Whether the en file exists for a slug (drives hreflang + en sitemap). */
export function hasEnglish(slug: string): boolean {
  return readAll().get(slug)?.has('en') ?? false;
}

/** Human-readable date for the given locale ("10 de julio de 2026" / "July 10, 2026"). */
export function formatNoticiaDate(date: string, locale: Locale): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
