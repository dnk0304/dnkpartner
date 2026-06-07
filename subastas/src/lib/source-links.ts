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
import { getSourceLabel } from "./source-labels";

const BOE_DETAIL_BASE = "https://subastas.boe.es/detalleSubasta.php";

/**
 * Build a source-aware "go to the official source" label.
 *
 * QC P1 (2026-06-07): a PLABI row was rendering "Anuncio del BOE (PDF)" on a
 * link that pointed at plabi.justicia.es — the static "BOE" label leaked
 * through for non-BOE rows. Per-source label resolution per resource type
 * keeps labels honest. Examples:
 *
 *   BOE       → "Ver subasta original", "Anuncio del BOE (PDF)"
 *   PLABI     → "Ver en PLABI",          "Anuncio de PLABI (PDF)"
 *   SEGSOCIAL → "Ver subasta original",  "Anuncio de Seguridad Social (PDF)"
 *
 * Falls back to a generic "Documento oficial (PDF)" / "Ver fuente original"
 * when the source label can't be resolved (so we NEVER emit a misleading
 * "del BOE" suffix for an unknown source).
 */
function sourceAwareLabel(
  resource: "subasta" | "lote" | "pujas" | "edicto" | "pdf",
  source: string | null | undefined,
): string {
  const upper = (source ?? "").trim().toUpperCase();
  const label = getSourceLabel(source);
  // BOE / TEJU collapse to the same family — keep the historical BOE-leaning
  // copy ("Ver subasta original" / "Anuncio del BOE (PDF)") so the labels
  // don't churn for the 95% case.
  const isBoeFamily = upper === "BOE" || upper === "TEJU" || upper === "";
  switch (resource) {
    case "subasta":
      if (isBoeFamily) return "Ver subasta original";
      // PLABI: "Ver en PLABI" reads more naturally than "Ver subasta
      // original" on a portal that calls them "liquidaciones".
      if (upper === "PLABI") return "Ver en PLABI";
      return "Ver subasta original";
    case "lote":
      return "Ver lote original";
    case "pujas":
      return "Ver pujas";
    case "edicto":
      return "Ver edicto";
    case "pdf":
      // PDF anuncio — the label MUST name the right source. Falling back to
      // a generic "Anuncio oficial (PDF)" when we can't resolve the source
      // is much better than mislabelling a PLABI doc as "del BOE".
      if (isBoeFamily) return "Anuncio del BOE (PDF)";
      if (label) return `Anuncio de ${label} (PDF)`;
      return "Anuncio oficial (PDF)";
    default:
      return "Ver fuente";
  }
}

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

  const src = auction.source ?? null;

  if (isSegSocial(auction)) {
    // SEGSOCIAL: no deterministic BOE deep-link. Route via originalSource.
    const upstream = (auction.originalSource ?? "").trim();
    if (upstream) {
      out.push({
        key: "subasta",
        label: sourceAwareLabel("subasta", src),
        href: upstream,
      });
    }
  } else if ((src ?? "").trim().toUpperCase() === "PLABI") {
    // PLABI: no deterministic BOE deep-link either. Route via the upstream
    // URL stored on `originalSource` (PLABI scraper writes it on every row).
    // QC P1 (2026-06-07) — the previous code path fell into the BOE branch
    // and emitted "Anuncio del BOE (PDF)" / "Ver subasta original" pointing
    // at plabi.justicia.es. Now the PLABI row gets PLABI-flavoured copy.
    const upstream = (auction.originalSource ?? "").trim();
    if (upstream) {
      out.push({
        key: "subasta",
        label: sourceAwareLabel("subasta", src),
        href: upstream,
      });
    }
  } else {
    // BOE / judicial / notarial / AEAT — deterministic from boeId.
    const subasta = boeLinkFor(auction.boeId, auction.boeLink);
    if (subasta) {
      out.push({
        key: "subasta",
        label: sourceAwareLabel("subasta", src),
        href: subasta,
      });
    }

    // Lote deep-link only when this row is a split-lote child (loteNumber is
    // set). Skipping when boeId is absent (no idSub to anchor on).
    const trimmedBoeId = (auction.boeId ?? "").trim();
    if (trimmedBoeId && lote != null && Number.isFinite(lote)) {
      out.push({
        key: "lote",
        label: sourceAwareLabel("lote", src),
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
        label: sourceAwareLabel("pujas", src),
        href: `${buildBoeSubastaHref(trimmedBoeId, lote)}#pujas`,
      });
    }
  }

  // Edicto / PDF live on the row regardless of source. The label is
  // source-aware so a PLABI row's PDF is "Anuncio de PLABI (PDF)" — not
  // "Anuncio del BOE (PDF)" (QC P1 fix, 2026-06-07).
  const edicto = (auction.edictUrl ?? "").trim();
  if (edicto) {
    out.push({ key: "edicto", label: sourceAwareLabel("edicto", src), href: edicto });
  }

  const pdf = (auction.pdfUrl ?? "").trim();
  if (pdf) {
    out.push({ key: "pdf", label: sourceAwareLabel("pdf", src), href: pdf });
  }

  return out;
}
