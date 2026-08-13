/**
 * /resultados/{prov}/{muni}/{tipo}/{ano}/t{n} — the trimestre rung — page N.
 *
 * Thin by design: every SEO behaviour (canonical, robots, the mandatory full
 * page fan, out-of-range 404, `pagina/1` → 307) lives once in
 * `_shared/archive-node-view.tsx`. Six route files sharing one contract is the
 * only way that contract stays true in six places.
 */
import type { Metadata } from 'next';
import { ArchiveNodeView, archiveNodeMetadata, archivePageParam } from '../../../../../../../_shared/archive-node-view';

type PageProps = { params: Promise<{ seg1: string; seg2: string; seg3: string; seg4: string; seg5: string; page: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1, seg2, seg3, seg4, seg5, page } = await params;
  const segs = [seg1, seg2, seg3, seg4, seg5];
  const n = Number.parseInt(page, 10);
  return archiveNodeMetadata(segs, Number.isFinite(n) ? n : 1);
}

export default async function Page({ params }: PageProps) {
  const { seg1, seg2, seg3, seg4, seg5, page } = await params;
  const segs = [seg1, seg2, seg3, seg4, seg5];
  const n = archivePageParam(segs, page);
  return <ArchiveNodeView segs={segs} page={n} />;
}
