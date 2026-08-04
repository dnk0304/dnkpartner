/**
 * json-ld — schema.org structured data emitter for the auction detail page.
 *
 * Wave-B leapfrog (2026-06-07): neither competitor portal emits structured
 * data; SubastasActivas does. We build a Product+Offer + Place/GeoCoordinates
 * + BreadcrumbList graph and let the page inject it as
 * `<script type="application/ld+json">` server-side.
 *
 * NULL-safe by design: when a sub-graph's load-bearing data is missing
 * (no price for Offer, no coords for Place, …) the node is OMITTED rather
 * than emitted with empty fields. Better silent than wrong (Google flags
 * invalid Offer prices as errors).
 *
 * No external HTTP. Pure projection. Render-time only — no migration.
 */

import { buildAuctionSlug } from "./auction-slug";
import { auctionDisplayTitle } from "./display-title";
import { PROVINCE_DB_KEY_TO_SLUG } from "./slugs";
import { sanitizeExtractedText } from "../sanitize-extracted-text";

const SITE = "https://subastasactivas.com";

type AuctionLike = {
  id: string;
  boeId?: string | null;
  title?: string | null;
  category?: string | null;
  province?: string | null;
  municipality?: string | null;
  status?: string | null;
  auctionType?: string | null;
  propertyType?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  postalCode?: string | null;
  appraisalValue?: number | null;
  valorSubasta?: number | null;
  endsAt?: Date | string | null;
  publishedAt?: Date | string | null;
  propertyDescription?: string | null;
  lotDescription?: string | null;
};

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map our internal status enum to schema.org ItemAvailability values.
 * Conservative — when in doubt, fall back to InStock so the offer renders.
 */
function statusToAvailability(status: string | null | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (s === "FINALIZADA_AUTORIDAD" || s === "CONCLUIDA_PORTAL" || s === "FINISHED") {
    return "https://schema.org/SoldOut";
  }
  if (s === "CANCELADA" || s === "CANCELLED" || s === "SUSPENDIDA" || s === "SUSPENDED") {
    return "https://schema.org/Discontinued";
  }
  // PROXIMA_APERTURA / PRE_AUCTION → PreOrder is the closest fit.
  if (s === "PROXIMA_APERTURA" || s === "PRE_AUCTION") {
    return "https://schema.org/PreOrder";
  }
  // CELEBRANDOSE / ACTIVE / default
  return "https://schema.org/InStock";
}

/**
 * Build the JSON-LD graph for an auction detail page. Returns a JSON-
 * serialisable plain object — the caller stringifies and injects as
 * `<script type="application/ld+json">`.
 *
 * The graph is an array of @types so the page emits one script tag and
 * Google parses every node. Order doesn't matter to Google but we keep
 * Product → Place → BreadcrumbList for legibility.
 */
export function buildAuctionJsonLd(auction: AuctionLike): object | null {
  const canonicalSlug = buildAuctionSlug({
    id: auction.id,
    auctionType: auction.auctionType ?? null,
    province: auction.province ?? null,
    municipality: auction.municipality ?? null,
  });
  const pageUrl = `${SITE}/subastas/subasta/${canonicalSlug}`;

  const displayName = auctionDisplayTitle({
    address: auction.address ?? null,
    // Bug 2 (2026-06-09): keep JSON-LD `name` in sync with the H1 — same
    // read-time lotDescription "Dirección" fallback for junk-address rows.
    lotDescription: auction.lotDescription ?? null,
    propertyType: auction.propertyType ?? null,
    auctionType: auction.auctionType ?? null,
    category: auction.category ?? null,
    municipality: auction.municipality ?? null,
    province: auction.province ?? null,
    title: auction.title ?? null,
  });

  // SANITIZE-DISPLAY (2026-08-04, Ken ruling). This description is emitted
  // into `<script type="application/ld+json">` and ingested by search engines.
  // Sanitising the rendered page body but NOT this would hide the problem from
  // humans and leave it for machines — so the SAME redaction runs here.
  // `sanitizeExtractedText` also applies the page-dump rejection.
  const description =
    sanitizeExtractedText(auction.propertyDescription ?? auction.lotDescription ?? null);

  const graph: Record<string, unknown>[] = [];

  // Product + Offer
  const price = toFiniteNumber(auction.valorSubasta) ?? toFiniteNumber(auction.appraisalValue);
  const validThrough = toIso(auction.endsAt);
  const product: Record<string, unknown> = {
    "@type": "Product",
    "@id": `${pageUrl}#product`,
    name: displayName,
    url: pageUrl,
  };
  if (description) product.description = description.slice(0, 500);
  if (auction.category) product.category = auction.category;
  // Offer only when we have a meaningful price; Google rejects price=0/null.
  if (price != null && price > 0) {
    const offer: Record<string, unknown> = {
      "@type": "Offer",
      price,
      priceCurrency: "EUR",
      availability: statusToAvailability(auction.status),
      url: pageUrl,
    };
    if (validThrough) offer.priceValidUntil = validThrough;
    if (validThrough) offer.validThrough = validThrough;
    product.offers = offer;
  }
  graph.push(product);

  // Place / GeoCoordinates — only when coords are real numbers.
  const lat = toFiniteNumber(auction.latitude);
  const lng = toFiniteNumber(auction.longitude);
  if (lat != null && lng != null) {
    const place: Record<string, unknown> = {
      "@type": "Place",
      "@id": `${pageUrl}#place`,
      geo: {
        "@type": "GeoCoordinates",
        latitude: lat,
        longitude: lng,
      },
    };
    const addressNode: Record<string, unknown> = { "@type": "PostalAddress", addressCountry: "ES" };
    if (auction.address) addressNode.streetAddress = auction.address;
    if (auction.municipality) addressNode.addressLocality = auction.municipality;
    if (auction.province) addressNode.addressRegion = auction.province;
    if (auction.postalCode) addressNode.postalCode = auction.postalCode;
    place.address = addressNode;
    graph.push(place);
  }

  // BreadcrumbList — Inicio → Subastas → Provincia → Auction
  const crumbs: Record<string, unknown>[] = [
    { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
    { "@type": "ListItem", position: 2, name: "Subastas", item: `${SITE}/subastas` },
  ];
  if (auction.province) {
    const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[auction.province];
    const provinceUrl = provinceSlug
      ? `${SITE}/subastas/${provinceSlug}`
      : `${SITE}/subastas?province=${encodeURIComponent(auction.province)}`;
    crumbs.push({
      "@type": "ListItem",
      position: crumbs.length + 1,
      name: auction.province.charAt(0).toUpperCase() + auction.province.slice(1).toLowerCase(),
      item: provinceUrl,
    });
  }
  crumbs.push({
    "@type": "ListItem",
    position: crumbs.length + 1,
    name: displayName,
    item: pageUrl,
  });
  graph.push({
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: crumbs,
  });

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
