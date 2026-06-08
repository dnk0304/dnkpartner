/**
 * Breadcrumbs + BreadcrumbList JSON-LD (07 §5.3).
 *
 * Segment links must point to canonical URLs only — the caller is responsible
 * for passing canonical hrefs.
 */

import Link from 'next/link';

export type Crumb = { label: string; href: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: c.href.startsWith('http') ? c.href : `https://subastasactivas.com${c.href}`,
    })),
  };
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-xs text-[var(--color-text-muted)] mb-3">
        <ol className="flex flex-wrap items-center gap-1">
          {items.map((c, i) => (
            <li key={c.href} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>›</span> : null}
              {i < items.length - 1 ? (
                <Link href={c.href} className="hover:underline">{c.label}</Link>
              ) : (
                <span aria-current="page" className="text-[var(--color-text)]">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
