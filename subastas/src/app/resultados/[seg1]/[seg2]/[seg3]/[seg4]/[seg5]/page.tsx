/**
 * /resultados/{prov}/{muni}/{tipo}/{ano}/t{n} — the trimestre rung — page 1.
 *
 * Thin by design: every SEO behaviour lives once in
 * `_shared/archive-node-view.tsx`. See that file for the contract.
 */
import type { Metadata } from 'next';
import { ArchiveNodeView, archiveNodeMetadata } from '../../../../../_shared/archive-node-view';

type PageProps = { params: Promise<{ seg1: string; seg2: string; seg3: string; seg4: string; seg5: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1, seg2, seg3, seg4, seg5 } = await params;
  return archiveNodeMetadata([seg1, seg2, seg3, seg4, seg5]);
}

export default async function Page({ params }: PageProps) {
  const { seg1, seg2, seg3, seg4, seg5 } = await params;
  return <ArchiveNodeView segs={[seg1, seg2, seg3, seg4, seg5]} />;
}
