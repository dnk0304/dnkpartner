/**
 * /subastas/[slug]/[municipio] — town (province + municipality) SEO page.
 *
 * Wave 56, Option A: nested directly under the clean province URL. The
 * `[slug]` segment is the PROVINCE slug; if it resolves as a category we
 * 404 (categories have no municipality children). The `[municipio]` segment
 * is resolved within that province via `municipalitySlugToDbName` — case +
 * accent folded against the live distinct-municipality set, highest-count
 * casing wins per slug (per-province collision guard).
 *
 * Locked filter: `{ province: dbKey, municipality: dbMunicipalityName }`
 * — the new server-side `municipality` filter on /api/auctions (Wave 56
 * additive) makes counts/list/badge correct at the server.
 *
 * Index gate: count>0 → index,follow; count==0 → noindex,follow (still 200).
 *
 * SEO body (intro/footer/internal-link clusters) is Pixel's brief — this file
 * owns the route skeleton + data + canonical + JSON-LD + lockedFilter wiring.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  resolveSubastasSlug,
  RESERVED_SEGMENTS,
  TIPO_SLUGS,
  TIPO_LABEL_PLURAL,
} from '@/lib/seo/slugs';
import {
  countActiveAuctions,
  minStartingPrice,
  municipalitySlugToDbName,
  municipalitiesInProvince,
} from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { capitalizeLocation } from '@/lib/utils';
import SubastasListClient from '../../SubastasListClient';

type PageProps = { params: Promise<{ slug: string; municipio: string }> };
const SITE = 'https://subastasactivas.com';

type SiblingMuni = { name: string; count: number; municipioSlug: string };

type Resolved = {
  provinceSlug: string;
  provinceDbKey: string;
  provinceLabel: string;
  municipioSlug: string;
  municipalityName: string;
  count: number;
  minPrice: number | null;
  siblings: SiblingMuni[];
  provinceTotal: number;
};

async function loadTown(slug: string, municipio: string): Promise<Resolved | null> {
  // Belt-and-braces — middleware (D) catches reserved first-segments before
  // routing, but if anything slips through we 404 here too.
  if (RESERVED_SEGMENTS.has(slug) || RESERVED_SEGMENTS.has(municipio)) return null;
  const r = resolveSubastasSlug(slug);
  if (r.kind !== 'province') return null; // categories have no town children

  const municipalityName = await municipalitySlugToDbName(r.dbKey, municipio);
  if (!municipalityName) return null;

  const [count, minPrice, allMunis, provinceTotal] = await Promise.all([
    countActiveAuctions({ province: r.dbKey, municipality: municipalityName }),
    minStartingPrice({ province: r.dbKey, municipality: municipalityName }),
    municipalitiesInProvince(r.dbKey),
    countActiveAuctions({ province: r.dbKey }),
  ]);

  // Sibling cluster: every active municipality in the same province
  // EXCEPT the current one. Already sorted by count desc.
  const siblings: SiblingMuni[] = allMunis
    .filter((m) => m.municipioSlug !== municipio)
    .map((m) => ({ name: m.name, count: m.count, municipioSlug: m.municipioSlug }));

  return {
    provinceSlug: r.slug,
    provinceDbKey: r.dbKey,
    provinceLabel: r.label,
    municipioSlug: municipio,
    municipalityName,
    count,
    minPrice,
    siblings,
    provinceTotal,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, municipio } = await params;
  const data = await loadTown(slug, municipio);
  if (!data) return { title: 'Página no encontrada' };
  const muniLabel = capitalizeLocation(data.municipalityName);
  const title = `${data.count.toLocaleString('es-ES')} subastas en ${muniLabel} (${data.provinceLabel}) · estado en vivo | SubastasActivas`;
  const description = `${data.count.toLocaleString('es-ES')} subastas públicas activas en ${muniLabel} (${data.provinceLabel}) con estado en vivo, precio de salida y enlace al BOE. Actualizado a diario.`.slice(0, 158);
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE}/subastas/${data.provinceSlug}/${data.municipioSlug}`,
    },
    robots: data.count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function MunicipioPage({ params }: PageProps) {
  const { slug, municipio } = await params;
  const data = await loadTown(slug, municipio);
  if (!data) notFound();
  const muniLabel = capitalizeLocation(data.municipalityName);

  // BreadcrumbList + CollectionPage JSON-LD (mirror province page).
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Subastas en ${muniLabel} (${data.provinceLabel})`,
    description: `Subastas públicas activas en ${muniLabel}, ${data.provinceLabel}.`,
    url: `${SITE}/subastas/${data.provinceSlug}/${data.municipioSlug}`,
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Subastas', item: `${SITE}/subastas` },
      {
        '@type': 'ListItem',
        position: 3,
        name: data.provinceLabel,
        item: `${SITE}/subastas/${data.provinceSlug}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: muniLabel,
        item: `${SITE}/subastas/${data.provinceSlug}/${data.municipioSlug}`,
      },
    ],
  };

  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Subastas', href: '/subastas' },
          { label: data.provinceLabel, href: `/subastas/${data.provinceSlug}` },
          { label: muniLabel, href: `/subastas/${data.provinceSlug}/${data.municipioSlug}` },
        ]}
      />
      <SeoIntroBlock
        count={data.count}
        noun="subastas públicas"
        location={`${muniLabel} (${data.provinceLabel})`}
        minPrice={data.minPrice}
        guideHref="/guia/como-funcionan-las-subastas-boe"
        guideLabel="Cómo funcionan las subastas BOE"
      />
    </>
  );

  const footerSlot = (
    <>
      {/* Back-to-province CTA — single prominent link to the parent province
          page (full inventory). This is the primary back-link the brief asks
          for ("Ver todas las subastas en {Provincia}"). */}
      <section className="mt-2">
        <Link
          href={`/subastas/${data.provinceSlug}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[--color-border] text-sm font-medium hover:bg-[--color-surface-muted]"
        >
          <span>Ver todas las subastas en {data.provinceLabel}</span>
          <span className="text-[--color-text-muted] tnum">
            ({data.provinceTotal.toLocaleString('es-ES')})
          </span>
        </Link>
      </section>

      {/* Sibling-municipality cluster — every OTHER active municipality in
          the same province, each linking to its own clean town URL. Drives
          the lateral crawl path between siblings (the SEO win). */}
      {data.siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">
            Otros municipios en {data.provinceLabel}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.siblings.map((m) => (
              <li key={m.municipioSlug}>
                <Link
                  href={`/subastas/${data.provinceSlug}/${m.municipioSlug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[--color-border] text-xs hover:bg-[--color-surface-muted]"
                >
                  <span>{capitalizeLocation(m.name)}</span>
                  <span className="text-[--color-text-muted] tnum">
                    ({m.count.toLocaleString('es-ES')})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tipo cluster — mirrors the province page. Tipo pages are
          location-agnostic so this is the same set everywhere; it preserves
          the crawl path the brief calls out. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">Por tipo de subasta</h2>
        <ul className="flex flex-wrap gap-2">
          {TIPO_SLUGS.map((t) => (
            <li key={t}>
              <Link
                href={`/subastas/tipo/${t}`}
                className="inline-block px-3 py-1 rounded-full border border-[--color-border] text-xs hover:bg-[--color-surface-muted]"
              >
                {TIPO_LABEL_PLURAL[t]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[--color-page]" />}>
      <SubastasListClient
        lockedFilter={{
          province: data.provinceDbKey,
          municipality: data.municipalityName,
        }}
        // Single indexable H1, mirrors the brief: "Subastas en {Municipio}
        // ({Provincia})" — proper-cased via capitalizeLocation.
        seoTitle={`Subastas en ${muniLabel} (${data.provinceLabel})`}
        seoIntroSlot={introSlot}
        seoFooterSlot={footerSlot}
      />
    </Suspense>
  );
}
