/**
 * source-links — the labelled set of "official source" links rendered on the
 * detail page ("Ver subasta original", "Ver lote original", "Ver pujas",
 * "Ver edicto", "Anuncio del BOE (PDF)").
 *
 * Why this exists (wave-B, 2026-06-07):
 *   Competitor portals show 3+ deep-links to the official source. We already
 *   store enough to derive them: `boeId` + `loteNumber` + `edictUrl` + `pdfUrl`
 *   + `originalSource`. Constructing them here keeps the projection layer in
 *   one place and prevents the homepage-fallback bug we already fixed for
 *   `boeLink` (lib/boe-link.ts) from re-emerging on each surface that wants
 *   one of the three labelled links.
 *
 * NULL-safe by design: only emits links whose `href` resolves. Never emits
 * the BOE homepage. Never fabricates a dead URL.
 *
 * Source routing:
 *   - BOE judicial / notarial / AEAT (source = "BOE" or any non-SEGSOCIAL):
 *       subastas.boe.es/detalleSubasta.php?idSub=<boeId>[&idLote=<n>]
 *   - SEGSOCIAL (TGSS portal): we don't have a deterministic builder, so we
 *     route via the stored `originalSource` URL (the scraped upstream URL).
 *     If absent, the row gets no `subasta` link.
 */

import { boeLinkFor } from "./boe-link";

const BOE_DETAIL_BASE = "https://subastas.boe.es/detalleSubasta.php";

export type SourceLink = {
  /** Stable key Pixel can switch on for icons / sort order. */
  key: "subasta" | "lote" | "pujas" | "edicto" | "pdf";
  /** Spanish user-facing label (UX copy lives here, not in Pixel). */
  label: string;
  /** Resolved URL. Always non-empty when this object exists. */
  href: string;
};

type AuctionLike = {
  boeId?: string | null;
  boeLink?: string | null;
  loteNumber?: number | bigint | null;
  edictUrl?: string | null;
  pdfUrl?: string | null;
  source?: string | null;
  originalSource?: string | null;
};

function isSegSocial(auction: AuctionLike): boolean {
  const src = (auction.source ?? "").toUpperCase();
  if (src === "SEGSOCIAL") return true;
  // Boe SegSocial rows carry SUB-SS-* boeIds (see teaser-snippet.ts header).
  const id = (auction.boeId ?? "").toUpperCase();
  return id.startsWith("SUB-SS-");
}

function buildBoeSubastaHref(boeId: string, loteNumber: number | null): string {
  const base = `${BOE_DETAIL_BASE}?idSub=${encodeURIComponent(boeId)}`;
  if (loteNumber != null && Number.isFinite(loteNumber)) {
    return `${base}&idLote=${encodeURIComponent(String(loteNumber))}`;
  }
  return base;
}

/**
 * Build the ordered, NULL-safe set of source links for an auction row.
 *
 * Order: subasta → lote → pujas → edicto → pdf. Pixel can re-order at render
 * time; the array order is the recommended UX order.
 */
export function buildSourceLinks(auction: AuctionLike): SourceLink[] {
  const out: SourceLink[] = [];

  const loteRaw = auction.loteNumber;
  const lote: number | null =
    loteRaw == null
      ? null
      : typeof loteRaw === "bigint"
        ? Number(loteRaw)
        : Number(loteRaw);

  if (isSegSocial(auction)) {
    // SEGSOCIAL: no deterministic BOE deep-link. Route via originalSource.
    const upstream = (auction.originalSource ?? "").trim();
    if (upstream) {
      out.push({
        key: "subasta",
        label: "Ver subasta original",
        href: upstream,
      });
    }
  } else {
    // BOE / judicial / notarial / AEAT — deterministic from boeId.
    const subasta = boeLinkFor(auction.boeId, auction.boeLink);
    if (subasta) {
      out.push({ key: "subasta", label: "Ver subasta original", href: subasta });
    }

    // Lote deep-link only when this row is a split-lote child (loteNumber is
    // set). Skipping when boeId is absent (no idSub to anchor on).
    const trimmedBoeId = (auction.boeId ?? "").trim();
    if (trimmedBoeId && lote != null && Number.isFinite(lote)) {
      out.push({
        key: "lote",
        label: "Ver lote original",
        href: buildBoeSubastaHref(trimmedBoeId, lote),
      });
    }

    // Pujas — BOE renders bids in a tab on the same detalleSubasta page.
    // There is no separate pujasSubasta.php deep-link; we anchor to the
    // tab fragment so the bidding pane is at least visible on landing.
    // If the only thing we'd link to is the bare subasta URL again with no
    // fragment value, skip — better one link than two identical ones.
    if (trimmedBoeId) {
      out.push({
        key: "pujas",
        label: "Ver pujas",
        href: `${buildBoeSubastaHref(trimmedBoeId, lote)}#pujas`,
      });
    }
  }

  // Edicto / PDF live on the row regardless of source (the scraper stores
  // both for BOE and SegSocial rows when present).
  const edicto = (auction.edictUrl ?? "").trim();
  if (edicto) {
    out.push({ key: "edicto", label: "Ver edicto", href: edicto });
  }

  const pdf = (auction.pdfUrl ?? "").trim();
  if (pdf) {
    out.push({ key: "pdf", label: "Anuncio del BOE (PDF)", href: pdf });
  }

  return out;
}
