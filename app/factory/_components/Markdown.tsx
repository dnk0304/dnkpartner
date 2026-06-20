'use client';

import React from 'react';

/**
 * Markdown — a small, dependency-free, SAFE Markdown renderer scoped to what the
 * factory artifacts actually use: headings, paragraphs, bold/italic/inline-code,
 * unordered + ordered lists, GFM tables (the Stage-3 build doc is tables), task
 * checkboxes (☐ glyphs + `[ ]`), blockquotes, horizontal rules and fenced code.
 *
 * WHY not react-markdown: it would mean adding react-markdown + remark-gfm +
 * rehype-sanitize to a no-commit local worktree. This renderer is ~200 lines,
 * has no runtime deps, and — critically — NEVER injects raw HTML: every text
 * node is escaped and rendered as React children, so there is no XSS surface
 * even though the content is owner-generated and owner-gated. Inline emphasis is
 * tokenised, not regex-replaced into innerHTML.
 *
 * Styling uses the dnk brand tokens (brand-accent headings, brand-dark body).
 */

export function Markdown({ source }: { source: string }) {
  const blocks = React.useMemo(() => parseBlocks(source), [source]);
  return <div className="space-y-3 text-[15px] leading-relaxed text-brand-dark/85">{blocks}</div>;
}

// ─── inline parsing (bold / italic / code) → React nodes, fully escaped ───────

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: code first (its content is literal), then bold, then italic.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-i${i++}`;
    if (tok.startsWith('`')) {
      nodes.push(
        <code key={k} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-accent">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(
        <strong key={k} className="font-semibold text-brand-accent">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={k} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ─── block parsing ───────────────────────────────────────────────────────────

function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function parseBlocks(src: string): React.ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank
    if (line.trim() === '') {
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      out.push(<hr key={key++} className="my-5 border-slate-200" />);
      i++;
      continue;
    }

    // fenced code
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[13px] text-brand-dark/80"
        >
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = renderInline(h[2].trim(), `h${key}`);
      const cls =
        level === 1
          ? 'mt-6 text-2xl font-bold text-brand-accent'
          : level === 2
            ? 'mt-5 text-xl font-semibold text-brand-accent'
            : level === 3
              ? 'mt-4 text-base font-semibold text-brand-accent'
              : 'mt-3 text-sm font-semibold uppercase tracking-wide text-brand-dark/70';
      out.push(React.createElement(`h${Math.min(level, 6)}`, { key: key++, className: cls }, content));
      i++;
      continue;
    }

    // table: header row + separator row
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                {header.map((c, ci) => (
                  <th
                    key={ci}
                    className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-brand-accent"
                  >
                    {renderInline(c, `th${key}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-slate-50/40' : 'bg-white'}>
                  {header.map((_, ci) => (
                    <td
                      key={ci}
                      className="border-b border-slate-100 px-3 py-1.5 align-top text-brand-dark/80"
                    >
                      {renderInline(r[ci] ?? '', `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(
        <blockquote
          key={key++}
          className="border-l-4 border-brand-primary/40 bg-brand-light/60 py-2 pl-4 pr-3 text-brand-dark/80"
        >
          {renderInline(buf.join(' '), `bq${key}`)}
        </blockquote>,
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(
        <ol key={key++} className="ml-5 list-decimal space-y-1.5 marker:text-brand-dark/40">
          {items.map((it, ii) => (
            <li key={ii} className="pl-1">
              {renderInline(it, `ol${key}-${ii}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // unordered list (supports `- [ ]` / `- [x]` task items)
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: { text: string; checked: boolean | null }[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        let t = lines[i].replace(/^\s*[-*+]\s+/, '');
        let checked: boolean | null = null;
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(t);
        if (task) {
          checked = task[1].toLowerCase() === 'x';
          t = task[2];
        }
        items.push({ text: t, checked });
        i++;
      }
      const hasTasks = items.some((it) => it.checked !== null);
      out.push(
        <ul
          key={key++}
          className={
            hasTasks
              ? 'space-y-1.5'
              : 'ml-5 list-disc space-y-1.5 marker:text-brand-dark/40'
          }
        >
          {items.map((it, ii) => (
            <li key={ii} className={it.checked !== null ? 'flex items-start gap-2' : 'pl-1'}>
              {it.checked !== null && (
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 text-[11px] leading-none text-brand-primary"
                >
                  {it.checked ? '✓' : ''}
                </span>
              )}
              <span>{renderInline(it.text, `ul${key}-${ii}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // paragraph: gather until blank / next block starter
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*(?:---|\*\*\*|___)\s*$/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="text-brand-dark/85">
        {renderInline(buf.join(' '), `p${key}`)}
      </p>,
    );
  }

  return out;
}
