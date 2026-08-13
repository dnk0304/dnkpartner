/**
 * archive-path — THE one place that turns "which archive node do I mean?" into
 * a URL, for every internal link in the app.
 *
 * WHY IT EXISTS. v4 does not add URLs so much as it MOVES them: the outcome
 * facet reverses from `/resultados/{outcome}/{prov}` to
 * `/resultados/{prov}/{outcome}`. A component that builds that path from a
 * template literal is therefore not "a hardcoded string" — it is a SECOND,
 * invisible copy of the switch, stuck permanently in the OFF position. D7's
 * audit last round found four components in exactly that state on the detail
 * side (`ForexCarousel.tsx:1285`, `HomeCarouselSection.tsx:97`,
 * `SimilarAuctionsCarousel.tsx:214`, `ParticiparButton.tsx:81`), which is why
 * this dispatch was told to grep rather than assume. The archive equivalents are
 * `RegistryNav.tsx` (ProvinceResultGrid + OutcomeChips) and the shelf links —
 * all of them now come through here.
 *
 * Path construction itself is NOT reimplemented: node → path is
 * `archiveNodePath` in `archive-partitions.ts`, the same function the sitemap
 * and the planner use. This module only decides WHICH node shape the current
 * switch state calls for, then delegates. One brain for the shape, one brain for
 * the string.
 *
 * ⚠️ Server-only, because `isUrlV4SwitchOn()` reads a non-public env var. Client
 * components must receive an already-resolved href as a prop — which is also the
 * correct SEO answer, since a link that only exists after hydration is not a
 * crawl path (see `archive-page.tsx`).
 */

import 'server-only';

import {
  archiveNodePath,
  archivePagePath,
  archivePageLinks,
  municipioIndexPath,
  type ArchiveNode,
} from '@/lib/seo/archive-partitions';
import { isUrlV4SwitchOn } from '@/lib/seo/url-v4-switch';

/**
 * Canonical internal path for an archive node under the CURRENT switch state.
 *
 * The only shape that actually differs between v3 and v4 is the outcome facet
 * (segment order reversed). Everything else — province hubs, town archives, the
 * `/municipios` index — has the same URL in both, so those return an identical
 * string either way and callers do not need to care which mode they are in.
 * That is the point: one call site, correct in both states, no `if` at the call
 * site to forget.
 */
export function resolveArchivePath(node: ArchiveNode): string {
  if (!isUrlV4SwitchOn() && node.outcome !== undefined && node.prov !== undefined) {
    // LEGACY ORDER, byte-identical to what ships today.
    return `/resultados/${node.outcome}/${node.prov}`;
  }
  return archiveNodePath(node);
}

/** Page N of a node under the current switch state. Page 1 is the bare path. */
export function resolveArchivePagePath(node: ArchiveNode, page: number): string {
  const base = resolveArchivePath(node);
  return page <= 1 ? base : `${base}/pagina/${page}`;
}

/**
 * The FULL page fan for a node — every page URL, page 1 first.
 *
 * Ken's ruling (2026-08-13) makes this mandatory on every capped list: *"every
 * page of a capped list links to all pages… without it the depth number is
 * fiction"*. It is what turns a 10-link prev/next chain into one hop and is the
 * entire mechanism by which the deepest detail page moves from depth 9 to 7.
 * Delegated to the planner's `archivePageLinks` rather than rebuilt here, so the
 * depth guarantee lives in the module that also proves the ≤10 cap.
 */
export function resolveArchivePageLinks(node: ArchiveNode, pages: number): string[] {
  if (!isUrlV4SwitchOn() && node.outcome !== undefined && node.prov !== undefined) {
    const base = resolveArchivePath(node);
    const out: string[] = [];
    for (let p = 1; p <= Math.max(pages, 1); p++) out.push(p <= 1 ? base : `${base}/pagina/${p}`);
    return out;
  }
  return archivePageLinks(node, pages);
}

/**
 * `/resultados/{prov}/municipios` — identical in v3 and v4. Routed through here
 * anyway so that "every archive link goes through one helper" is a rule with no
 * exceptions to remember; an exception is how the next reversal gets missed.
 */
export function resolveMunicipioIndexPath(prov: string): string {
  return municipioIndexPath(prov);
}

/** Re-exported so a caller needs one import for node→path work. */
export { archiveNodePath, archivePagePath };
