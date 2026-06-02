/**
 * Bespoke header parser for marketing SEO articles.
 *
 * The 56 articles in marketing/content-seo/articles/ ship with 5 distinct
 * header styles (writers worked in parallel; nobody normalized). This parser
 * recognizes all five and produces a uniform ParsedArticle.
 *
 * Header styles observed:
 *  1. YAML frontmatter (`---\nslug: foo\ntitle: "..."\n---`).
 *  2. YAML-delimited but free-form labels (`---\nSEO title (≤60): ...\nSlug: /guia/...\n---`).
 *  3. `## META / SEO` section with bold-key bullets (`- **SEO title (≤60):** ...`).
 *  4. Bold-key lines after H1 (`**SEO Title:** ...\n**Slug:** ...`).
 *  5. Blockquote META BLOCK (`> **SEO title (≤60):** ...`).
 *
 * Slug fallback: filename without `.md`.
 * Author-note stripping: any line beginning with `*Spec para` or `*Nota a`
 * (Pixel/Forge specs) is removed from the body.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedArticle {
  slug: string;
  title: string;
  seoTitle: string | null;
  metaDescription: string | null;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  cluster: string | null;
  imageAlt: string | null;
  canonicalUrl: string | null;
  bodyMarkdown: string;
  /** For reporting which header style matched. */
  headerStyle: 'yaml' | 'yaml-freeform' | 'meta-section' | 'bold-after-h1' | 'blockquote-meta' | 'fallback-filename';
}

export interface ParseResult {
  ok: boolean;
  article?: ParsedArticle;
  error?: string;
  warnings: string[];
}

// -------------------- helpers --------------------

function stripQuotes(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function stripBackticks(s: string): string {
  return s.replace(/^`+|`+$/g, '').trim();
}

function normalizeSlug(raw: string | null | undefined, fileBase: string): string {
  if (!raw) return fileBase;
  let s = stripQuotes(stripBackticks(raw)).trim();
  // Strip leading /guia/ or guia/
  s = s.replace(/^\/+/, '').replace(/^guia\//, '');
  // Strip trailing slash
  s = s.replace(/\/+$/, '');
  return s || fileBase;
}

function parseSecondaryKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let s = raw.trim();
  // JSON array form: ["a","b"]
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // fall through to comma split
      s = s.slice(1, -1);
    }
  }
  return s
    .split(',')
    .map((x) => stripQuotes(x).trim())
    .filter(Boolean);
}

function stripAuthorNotes(body: string): string {
  // Drop entire lines that are author specs to Pixel/Forge. These are
  // line-leading (after optional `>` quote markers and whitespace).
  const lines = body.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/^>\s*/, '').trim();
    if (/^\*+\s*(Spec|Nota|Disclaimer|Owner|Cluster|Batch|Estado|Image|Schema|Disclaimer\s+a\s+renderizar)/i.test(trimmed)) {
      continue;
    }
    // Also skip `*Spec para …:*` style or `*Nota …:*` blockquoted-but-asterisked
    if (/^\*?Spec\s+para\b/i.test(trimmed) || /^\*?Nota\s+a\s+Pixel/i.test(trimmed)) {
      continue;
    }
    kept.push(line);
  }
  // Collapse 3+ blank lines to 2.
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Strip writer's-room scaffolding tokens baked into article bodies.
 * Patterns observed in wave12 corpus (12 of 56 articles):
 *  - `## H1: Foo`, `### H2: Bar`, `#### H3: Baz` — heading-type tokens after
 *    the markdown # prefix. The H1: line typically duplicates the article title
 *    and must be DROPPED entirely (title lives in its own column and the page
 *    renders it). H2:/H3: tokens are stripped to leave clean `## Foo` headings.
 *  - `**Definición (featured-snippet bait, ~55 palabras):**` and the broader
 *    `**Label (<authoring note>):**` pattern where the parenthetical contains
 *    SEO-process language ("bait", "palabras", "snippet"). Strip the
 *    parenthetical, keep the bold label.
 *
 * Conservative by design: only strips KNOWN junk patterns. Real prose,
 * tables, lists, blockquotes, and clean bodies pass through unchanged.
 *
 * Exported for unit testing.
 */
export function stripScaffolding(body: string, title?: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    // Match a markdown heading line: leading optional whitespace, 1-6 # chars,
    // a space, then optional `H1:` / `H2:` / `H3:` / `H4:` / `H5:` / `H6:` token.
    const headMatch = /^(\s*)(#{1,6})\s+H([1-6]):\s*(.*)$/.exec(line);
    if (headMatch) {
      const [, leading, hashes, hLevel, rest] = headMatch;
      const restTrim = rest.trim();
      // An `H1:` token marks the article's main heading — the on-page H1
      // is rendered from the title column, so this line is structurally
      // redundant and must be DROPPED entirely (regardless of whether the
      // text is a literal byte-for-byte duplicate of title).
      if (hLevel === '1') {
        continue;
      }
      // H2:/H3:/H4:/H5:/H6: tokens — strip the token, keep the heading text.
      kept.push(`${leading}${hashes} ${restTrim}`);
      continue;
    }

    // Strip authoring-note parentheticals inside bold labels:
    //   **Definición (featured-snippet bait, ~55 palabras):**  →  **Definición:**
    //   **Intro (los primeros 100 palabras responden la query):**  →  **Intro:**
    // Trigger only when the parenthetical contains SEO-process language
    // ("bait", "palabras", "snippet", "callout"). This avoids touching real
    // prose like `**Hipoteca (garantía de un préstamo):**`.
    let processed = line.replace(
      /\*\*([^*()]+?)\s*\(([^)]*(?:bait|palabras|snippet|callout)[^)]*)\):\*\*/gi,
      '**$1:**',
    );

    kept.push(processed);
  }
  // Collapse 3+ blank lines to 2, no trailing whitespace.
  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Match a `Key: value` line (or with bold markdown), normalized to lowercase.
const KEY_ALIASES: Record<string, keyof ParsedArticle | 'secondaryKeywordsRaw'> = {
  'slug': 'slug',
  'url slug': 'slug',
  'url slug (canónico)': 'slug',
  'title': 'title',
  'seo title': 'seoTitle',
  'seo title (≤60)': 'seoTitle',
  'seo_title': 'seoTitle',
  'meta description': 'metaDescription',
  'meta description (≤155)': 'metaDescription',
  'meta description (150)': 'metaDescription',
  'meta (≤155)': 'metaDescription',
  'meta_description': 'metaDescription',
  'target keyword': 'primaryKeyword',
  'target_keyword': 'primaryKeyword',
  'primary keyword': 'primaryKeyword',
  'primary kw': 'primaryKeyword',
  'target kw': 'primaryKeyword',
  'kw secundarias': 'secondaryKeywordsRaw',
  'secondary keywords': 'secondaryKeywordsRaw',
  'secondary_keywords': 'secondaryKeywordsRaw',
  'secondary': 'secondaryKeywordsRaw',
  'cluster': 'cluster',
  'image alt': 'imageAlt',
  'image_alt': 'imageAlt',
  'canonical': 'canonicalUrl',
  'canonical url': 'canonicalUrl',
};

function normalizeKey(k: string): string {
  return k
    .toLowerCase()
    .replace(/\*+/g, '')
    .replace(/`/g, '')
    .replace(/:$/, '')
    .replace(/^[-*]\s*/, '')
    .trim();
}

function applyKV(acc: Partial<ParsedArticle> & { secondaryKeywordsRaw?: string }, rawKey: string, rawVal: string) {
  const key = normalizeKey(rawKey);
  const target = KEY_ALIASES[key];
  if (!target) return;
  let v = rawVal.trim();
  // Strip wrapping backticks for slug-like values
  v = stripBackticks(v);
  if (target === 'secondaryKeywordsRaw') {
    acc.secondaryKeywordsRaw = v;
    return;
  }
  // Strip outer quotes for string values
  (acc as Record<string, unknown>)[target] = stripQuotes(v);
}

// -------------------- header style extractors --------------------

interface ExtractResult {
  fields: Partial<ParsedArticle> & { secondaryKeywordsRaw?: string };
  bodyStart: number; // index into source (chars) where body content starts
  style: ParsedArticle['headerStyle'];
}

function tryYamlFrontmatter(src: string): ExtractResult | null {
  // Must start with `---` line followed by KV pairs ending in `---`.
  const lines = src.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const acc: Partial<ParsedArticle> & { secondaryKeywordsRaw?: string } = {};
  // Decide style: yaml vs yaml-freeform — yaml uses snake_case / lowercase keys,
  // yaml-freeform uses labels like "SEO title (≤60)".
  let freeform = false;
  let i = 1;
  while (i <= end - 1) {
    const line = lines[i];
    const m = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_\s().≤≥-]{0,60}?):\s*(.*)$/.exec(line);
    if (m) {
      const key = m[1];
      let val = m[2];
      // Multiline array / block: gather continuation lines starting with `  -` or indented.
      // For our corpus, secondary_keywords is always single-line ([...] or comma list).
      applyKV(acc, key, val);
      if (/\s/.test(key) || /[≤≥()]/.test(key)) freeform = true;
    }
    i++;
  }
  const bodyStart = lines.slice(0, end + 1).join('\n').length + 1;
  return { fields: acc, bodyStart, style: freeform ? 'yaml-freeform' : 'yaml' };
}

function tryMetaSection(src: string): ExtractResult | null {
  // Looks for a `## META / SEO` heading followed by `- **Key:** value` bullets,
  // terminated by the next `---` or `## ` heading.
  const idx = src.search(/^##\s+META\s*\/\s*SEO\s*$/m);
  if (idx === -1) return null;
  // Slice from idx to next `---` or `## H1:` heading
  const after = src.slice(idx);
  const lines = after.split('\n');
  const acc: Partial<ParsedArticle> & { secondaryKeywordsRaw?: string } = {};
  let consumedLines = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^---\s*$/.test(line)) {
      consumedLines = i + 1;
      break;
    }
    if (/^##\s/.test(line)) {
      consumedLines = i;
      break;
    }
    // - **Key:** value   OR   **Key:** value
    const m = /^[-*]?\s*\*\*([^*]+?):\*\*\s*(.*)$/.exec(line);
    if (m) applyKV(acc, m[1], m[2]);
  }
  const absoluteStart = idx + lines.slice(0, consumedLines).join('\n').length + 1;
  return { fields: acc, bodyStart: absoluteStart, style: 'meta-section' };
}

function tryBoldAfterH1(src: string): ExtractResult | null {
  // Pattern: starts with `# H1` then a block of `**Key:** value` lines, terminated by `---`.
  const lines = src.split('\n');
  if (!lines[0]?.startsWith('# ')) return null;
  const acc: Partial<ParsedArticle> & { secondaryKeywordsRaw?: string } = {};
  // Title from H1
  acc.title = lines[0].replace(/^#\s+/, '').trim();
  let i = 1;
  let foundAny = false;
  let dashLine = -1;
  while (i < lines.length) {
    const line = lines[i];
    if (/^---\s*$/.test(line)) {
      dashLine = i;
      break;
    }
    const m = /^\*\*([^*]+?):\*\*\s*(.*)$/.exec(line);
    if (m) {
      applyKV(acc, m[1], m[2]);
      foundAny = true;
    }
    i++;
    if (i > 30) break; // safety: bold meta block is always near the top
  }
  if (!foundAny) return null;
  const bodyStart = dashLine >= 0 ? lines.slice(0, dashLine + 1).join('\n').length + 1 : lines.slice(0, i).join('\n').length + 1;
  return { fields: acc, bodyStart, style: 'bold-after-h1' };
}

function tryBlockquoteMeta(src: string): ExtractResult | null {
  // Pattern: `> **META BLOCK ...**` followed by `> **Key:** value` lines.
  const m = /^>\s*\*\*META\s*BLOCK[^*]*\*\*\s*$/m.exec(src);
  if (!m) return null;
  const startIdx = m.index;
  const after = src.slice(startIdx);
  const lines = after.split('\n');
  const acc: Partial<ParsedArticle> & { secondaryKeywordsRaw?: string } = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('>')) break;
    const stripped = line.replace(/^>\s?/, '');
    const km = /^\*\*([^*]+?):\*\*\s*(.*)$/.exec(stripped);
    if (km) applyKV(acc, km[1], km[2]);
  }
  // Title: pull the first `# H1` BEFORE the meta block.
  const before = src.slice(0, startIdx);
  const hm = /^#\s+(.+)$/m.exec(before);
  if (hm) acc.title = hm[1].trim();
  const bodyStart = startIdx + lines.slice(0, i).join('\n').length + 1;
  return { fields: acc, bodyStart, style: 'blockquote-meta' };
}

// -------------------- public API --------------------

export function parseArticleFile(filePath: string): ParseResult {
  const warnings: string[] = [];
  let src: string;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { ok: false, error: `read failed: ${String(e)}`, warnings };
  }
  const fileBase = path.basename(filePath, '.md');

  // Try extractors in order. First one with a slug or seoTitle wins; if none
  // produces a slug, fall back to filename and try to find a title from H1.
  const candidates = [
    tryYamlFrontmatter(src),
    tryMetaSection(src),
    tryBlockquoteMeta(src),
    tryBoldAfterH1(src),
  ].filter((x): x is ExtractResult => x !== null);

  let chosen: ExtractResult | null = null;
  for (const c of candidates) {
    if (c.fields.slug || c.fields.seoTitle || c.fields.title) {
      chosen = c;
      break;
    }
  }
  if (!chosen && candidates.length > 0) chosen = candidates[0];

  let fields: Partial<ParsedArticle> & { secondaryKeywordsRaw?: string };
  let bodyStart: number;
  let style: ParsedArticle['headerStyle'];

  if (chosen) {
    fields = chosen.fields;
    bodyStart = chosen.bodyStart;
    style = chosen.style;
  } else {
    fields = {};
    bodyStart = 0;
    style = 'fallback-filename';
    warnings.push('no header style matched; falling back to filename slug + first H1 title');
  }

  // Title fallback: first H1 after bodyStart
  if (!fields.title) {
    const after = src.slice(bodyStart);
    const hm = /^#\s+(.+)$/m.exec(after);
    if (hm) fields.title = hm[1].trim();
    else if (fields.seoTitle) fields.title = fields.seoTitle;
    else {
      // Last resort: first H1 anywhere
      const hAny = /^#\s+(.+)$/m.exec(src);
      if (hAny) fields.title = hAny[1].trim();
    }
  }

  const slug = normalizeSlug(fields.slug as string | undefined, fileBase);
  if (!fields.title) {
    return { ok: false, error: `no title found (slug=${slug})`, warnings };
  }

  let body = src.slice(bodyStart);
  const titleStr = stripQuotes(fields.title).trim();

  // Strip writer's-room scaffolding tokens (H1:/H2:/H3: prefixes,
  // authoring-note parentheticals) before the leading-H1 dedupe so the
  // dedupe sees the cleaned heading text.
  body = stripScaffolding(body, titleStr);

  // Drop a leading H1 if it duplicates the title (we keep title in DB column;
  // public page renders title separately). Preserves original wave12 behavior
  // for the 44 clean articles (yaml/bold-after-h1 styles where the H1 line
  // immediately precedes the body and is a near-duplicate of the title).
  body = body.replace(/^\s*#\s+.+\n+/, '');

  body = stripAuthorNotes(body);

  const secondaryKeywords = parseSecondaryKeywords(fields.secondaryKeywordsRaw);

  const article: ParsedArticle = {
    slug,
    title: stripQuotes(fields.title).trim(),
    seoTitle: (fields.seoTitle as string | undefined) ? stripQuotes(fields.seoTitle as string).trim() : null,
    metaDescription: (fields.metaDescription as string | undefined) ? stripQuotes(fields.metaDescription as string).trim() : null,
    primaryKeyword: (fields.primaryKeyword as string | undefined) ? stripQuotes(fields.primaryKeyword as string).trim() : null,
    secondaryKeywords,
    cluster: (fields.cluster as string | undefined) ? stripQuotes(fields.cluster as string).trim() : null,
    imageAlt: (fields.imageAlt as string | undefined) ? stripQuotes(fields.imageAlt as string).trim() : null,
    canonicalUrl: (fields.canonicalUrl as string | undefined) ? stripQuotes(fields.canonicalUrl as string).trim() : null,
    bodyMarkdown: body,
    headerStyle: style,
  };

  if (article.bodyMarkdown.length < 200) {
    warnings.push(`body suspiciously short (${article.bodyMarkdown.length} chars)`);
  }

  return { ok: true, article, warnings };
}
