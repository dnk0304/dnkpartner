import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { auth } from '@/lib/auth';
import { UserTier } from '@/types';
import { coarseCoord, GUEST_KEEP_VALOR_SUBASTA } from '@/lib/guest-teaser';
import {
  getAppropriateImageUrl as sharedGetAppropriateImageUrl,
  isRealAuctionImage as sharedIsRealAuctionImage,
} from '@/lib/auction-image-projection';
import { auctionCache } from '@/lib/cache';
import { boeLinkFor } from '@/lib/boe-link';
import { derivePricePerM2, coerceFiniteNumber } from '@/lib/auction-derive';
import { buildCategoryRankCaseSql } from '@/lib/category-rank';
import {
  ACTIVE_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  FINISHED_DB_STATUSES,
  ACTIVE_CLOCK_GUARD_SQL,
  DB_TO_FRONTEND_STATUS,
  isActiveStatus as sharedIsActiveStatus,
  isPreAuctionStatus as sharedIsPreAuctionStatus,
  isFinishedStatus as sharedIsFinishedStatus,
} from '@/lib/auction-status';
import { normalizeText } from '@/lib/normalize';
import { OFFICIAL_CATEGORIES } from '@/lib/constants';
import { isKnownSource } from '@/lib/source-labels';
import { toCanonicalProvince } from '@/lib/spain-provinces';
import { resolveProvinceSlugToCanonical } from '@/lib/province-slug';
import {
  MAP_CATEGORY_OTROS,
  mapCategoryToDbLabels,
  isMapCategoryOtros,
  MAP_CATEGORY_ALL_KNOWN_DB_LABELS,
} from '@/lib/map-category';

// Cached "SELECT DISTINCT province" \u2014 full scan against 229k rows on every
// filtered request is wildly expensive. Provinces change rarely (Spain has 52);
// 5-minute TTL is more than enough.
let provinceCache: { values: string[]; expiresAt: number } | null = null;
async function getCachedDistinctProvinces(): Promise<string[]> {
  if (provinceCache && provinceCache.expiresAt > Date.now()) {
    return provinceCache.values;
  }
  const rows = await query<{ province: string }>(
    'SELECT DISTINCT province FROM Auction WHERE province IS NOT NULL',
    []
  );
  provinceCache = {
    values: rows.map((r) => r.province),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return provinceCache.values;
}

// FORGE 2026-06-04 (Wave 56 \u2014 Option A municipality SEO):
// Cached "SELECT DISTINCT municipality" per province. Mirrors the province
// cache shape. Used by the new server-side `?municipality=` filter so a
// folded slug like "abrera" matches every DB casing variant ("Abrera",
// "ABRERA") in one parameterized IN-list. Keyed by province (always sent
// alongside municipality on town SEO pages) to keep each cache slot small.
// 5-minute TTL \u2014 distinct municipality lists move slowly.
const municipalityCacheByProvince = new Map<
  string,
  { values: string[]; expiresAt: number }
>();
async function getCachedDistinctMunicipalitiesInProvince(province: string): Promise<string[]> {
  const cached = municipalityCacheByProvince.get(province);
  if (cached && cached.expiresAt > Date.now()) return cached.values;
  const rows = await query<{ municipality: string }>(
    'SELECT DISTINCT municipality FROM Auction WHERE municipality IS NOT NULL AND province = ?',
    [province],
  );
  const values = rows.map((r) => r.municipality).filter((v): v is string => Boolean(v));
  municipalityCacheByProvince.set(province, {
    values,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return values;
}

// FORGE 2026-06-07 (multi-town-api): GLOBAL distinct-municipality fold cache.
// Powers the province-agnostic `?municipios=` multi-select where towns can
// span provinces (e.g. Calldetenes (Barcelona) + Getafe (Madrid) in one list).
// Returns a Map<foldedSlug, DBCasings[]> so a folded slug like "calldetenes"
// resolves to every DB casing variant ("Calldetenes", "CALLDETENES") in O(1)
// across the whole table. Same 5-min TTL as the per-province cache; the
// distinct municipality list moves slowly.
// IMPORTANT: this is NOT province-scoped — same-name towns across provinces
// (e.g. two "Sant Joan") will both match. Accepted v1 behavior per Ken's brief.
let municipalityGlobalCache: {
  byFolded: Map<string, string[]>;
  expiresAt: number;
} | null = null;
async function getCachedDistinctMunicipalitiesGlobal(): Promise<Map<string, string[]>> {
  if (municipalityGlobalCache && municipalityGlobalCache.expiresAt > Date.now()) {
    return municipalityGlobalCache.byFolded;
  }
  const rows = await query<{ municipality: string }>(
    'SELECT DISTINCT municipality FROM Auction WHERE municipality IS NOT NULL',
    [],
  );
  const byFolded = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.municipality) continue;
    const folded = normalizeText(r.municipality);
    if (!folded) continue;
    const bucket = byFolded.get(folded);
    if (bucket) bucket.push(r.municipality);
    else byFolded.set(folded, [r.municipality]);
  }
  municipalityGlobalCache = {
    byFolded,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return byFolded;
}

// FORGE 2026-06-07 (multi-town-api): array-param caps. Keeps the IN-list bounded
// and rejects probe attempts past sane UI limits.
const MAX_MUNICIPIOS = 25;
const MAX_PROVINCIAS = 10;

// Parse a CSV query param into a deduped, trimmed, capped string array.
// Returns null when absent / fully empty (caller treats null as "no constraint").
function parseCsvParam(raw: string | null, cap: number): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 80); // 80 chars covers every real muni/province slug
  if (list.length === 0) return null;
  const unique = [...new Set(list)];
  return unique.slice(0, cap);
}

// Streetview directory listing cache moved to `@/lib/auction-image-projection`
// alongside the resolver that consumes it (Wave B0, 2026-06-07). Same 60s TTL.

// New BOE-accurate status values
type DBStatus = 
  | 'PROXIMA_APERTURA' | 'CELEBRANDOSE' | 'SUSPENDIDA' | 'CANCELADA' | 'CONCLUIDA_PORTAL' | 'FINALIZADA_AUTORIDAD'
  // Legacy values
  | 'ACTIVE' | 'FINISHED' | 'PRE_AUCTION' | 'SUSPENDED' | 'CANCELLED';

// Auction type values — DB stores either the new canonical plural form
// (OTRAS_TRIBUTARIAS / ADMINISTRATIVAS) from the per-category scrapers, or
// the legacy singular form (TRIBUTARIA / ADMINISTRATIVA) on older rows.
// Both are accepted here; the mapAuctionType collapser folds them to a
// single canonical frontend value so the UI never has to know.
type DBAuctionType =
  | 'JUDICIAL'
  | 'NOTARIAL'
  | 'AEAT'
  | 'OTRAS_TRIBUTARIAS'
  | 'TRIBUTARIA'         // legacy
  | 'ADMINISTRATIVAS'
  | 'ADMINISTRATIVA'     // legacy
  | 'BANCARIA';

interface AuctionFromDB {
  id: string;
  boeId: string;
  title: string;
  category: string;
  province: string;
  municipality: string | null;
  status: DBStatus;
  auctionType: DBAuctionType | null;
  appraisalValue: number | null;
  // Valor subasta — the BOE "Valor subasta" reference figure. Distinct from
  // appraisalValue (Tasación) and claimedAmount (Cantidad reclamada) after
  // Ghost's 2026-06-04 split (commit `443a864`). Already selected by
  // `SELECT Auction.*`; surfaced on the full-access card payload so cards
  // can render the three values as three distinct lines. Honest-NULL.
  valorSubasta: number | null;
  currentBid: number | null;
  minimumBid: number | null;
  // Cantidad reclamada — the amount being claimed in the auction. Already
  // selected by `SELECT Auction.*`; surfaced on the full-access card payload
  // so card UIs can render "Cantidad reclamada" as a secondary line when
  // present. Coverage is uneven by auctionType (AEAT ~0.6%, NOTARIAL 100%,
  // OTRAS_TRIBUTARIAS ~84%) — the card must gate on truthy+>0.
  claimedAmount: number | null;
  courtName: string | null;
  procedureNumber: string | null;
  boeLink: string | null;
  auctionId: string | null;
  lotNumber: string | null;
  boeAnnouncement: string | null;
  lotDescription: string | null;
  propertyDescription: string | null;
  chargesDetail: string | null;
  charges: string | null;
  possessionStatus: string | null;
  visitable: number | null;
  cadastralRef: string | null;
  cadastralData: string | null;
  registryInfo: string | null;
  contactInfo: string | null;
  propertyType: string | null;
  edictUrl: string | null;
  pdfUrl: string | null;
  publishedAt: string;
  // opensAt — the auction's official start date ("Fecha de inicio").
  // Already in `SELECT Auction.*`; surfacing it on the card payload so the
  // PROXIMA_APERTURA cards can render "start date" alongside endsAt. Nullable;
  // null = not scheduled yet / not scraped (BOE-side cleanup task).
  opensAt: string | null;
  // resumeAt — the suspended-scraper's "fecha prevista de reanudación" date.
  // Already in the row via `SELECT Auction.*`. Projected on the card payload
  // so the status-branched date line for SUSPENDIDA rows renders
  // "Fecha prevista de reanudación: <resumeAt>" (or "Fecha por confirmar"
  // when null). Wave52 (Pixel 2026-06-04).
  resumeAt: string | null;
  endsAt: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  imageUrl: string | null;
  source: string | null;
  courtReference: string | null;
  originalSource: string | null;
  transitionedAt: string | null;
  // Google Maps URLs
  mapUrl: string | null;
  streetViewUrl: string | null;
  placeUrl: string | null;
  directionsUrl: string | null;
  // #16 / #17 — pujas + occupancy. BigInt comes back from pg as a string;
  // we coerce to number (EUROS) in transformAuction. Nulls are preserved.
  pujaStatus: string | null;
  currentBidAmount: string | number | bigint | null;
  occupancy: string | null;
  // Document-archive wave (2026-06-03). Computed via a correlated EXISTS
  // subquery in the SELECT so the list query stays single-shot. pg returns
  // PG booleans as JS booleans through node-postgres.
  hasDocuments: boolean | null;
  // Wave E2 (2026-06-07) — vehicle make/model/year, additive nullable cols.
  // Already in the row via `SELECT Auction.*`. Surfaced on the card payload
  // so cards can render "Turismo - SEAT León en Murcia". Honest-NULL on
  // non-VEHICLE rows and on VEHICLE rows pre-backfill.
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  // surfaceM2 (2026-06-19) — building surface area in m², from Ghost's prose
  // extraction (`8956c5f`). Arrives via `SELECT Auction.*`. Stored as Float in
  // the schema so pg returns a JS number; coerced defensively in transform
  // anyway (NUMERIC would arrive as a string). Honest-NULL when not extracted.
  // Drives the read-time €/m² derive (no stored pricePerM2 column).
  surfaceM2: number | null;
  // Property-portal attributes (Phase 1/2, 2026-07-11 → 07-16). Arrive via
  // `SELECT Auction.*`. Honest-NULL passthrough — projected onto the card
  // payload as BADGE-ONLY facts (no filter param is derived from them here;
  // filters for floorLevel/hasGarage/catastroUse/catastroYearBuilt are a
  // separate Forge-backed backend task — see the flag in the Phase-2 brief).
  bedrooms: number | null;
  bathrooms: number | null;
  hasTerrace: boolean | null;
  hasGarden: boolean | null;
  hasGarage: boolean | null;
  hasStorageRoom: boolean | null;
  floorLevel: string | null;
  catastroYearBuilt: number | null;
  catastroUse: string | null;
}

// Map DB status to frontend status. Delegates to the shared
// DB_TO_FRONTEND_STATUS table (single source of truth — see
// `@/lib/auction-status`).
function mapStatus(dbStatus: DBStatus): string {
  return DB_TO_FRONTEND_STATUS[dbStatus] || 'celebrandose';
}

// Map DB auction type to frontend auction type — legacy singular labels
// (TRIBUTARIA / ADMINISTRATIVA) fold into the new canonical plurals so the UI
// only ever sees one identifier per BOE family.
function mapAuctionType(dbType: DBAuctionType | null): string | undefined {
  if (!dbType) return undefined;
  const typeMap: Record<DBAuctionType, string> = {
    'JUDICIAL': 'judicial',
    'NOTARIAL': 'notarial',
    'AEAT': 'aeat',
    'OTRAS_TRIBUTARIAS': 'otras_tributarias',
    'TRIBUTARIA': 'otras_tributarias',       // legacy → fold
    'ADMINISTRATIVAS': 'administrativas',
    'ADMINISTRATIVA': 'administrativas',     // legacy → fold
    'BANCARIA': 'bancaria',
  };
  return typeMap[dbType];
}

// Status-class predicates — thin wrappers over the shared lib so the
// existing call sites (applyTierMasking branches) keep their DBStatus typing
// while the underlying set is the single canonical one.
function isFinishedStatus(dbStatus: DBStatus): boolean {
  return sharedIsFinishedStatus(dbStatus);
}
function isActiveStatus(dbStatus: DBStatus): boolean {
  return sharedIsActiveStatus(dbStatus);
}
function isPreAuctionStatus(dbStatus: DBStatus): boolean {
  return sharedIsPreAuctionStatus(dbStatus);
}

// PROPERTY_CATEGORIES + VEHICLE_CATEGORIES moved to
// `@/lib/auction-image-projection` alongside the resolver that consumes them
// (Wave B0, 2026-06-07). No remaining call-sites in this route.

// FORGE 2026-06-03 (Item C — promote properties primarily) +
// RECONCILE 2026-06-03 (Ken, listing wave): the category → priority rank
// table and its SQL-CASE builder were pulled out into the shared single
// source of truth `@/lib/category-rank` (introduced on sa/recent-filter-params
// so /api/auctions/recent can reuse it). The previously-inline `CATEGORY_RANK`
// + `buildCategoryRankCaseSql()` are now imported above; the precomputed
// CASE string is still built once at module load to keep the ORDER BY plan
// identical to the original implementation.
const CATEGORY_RANK_CASE_SQL = buildCategoryRankCaseSql();

function buildGeneralInfo(item: AuctionFromDB): string | null {
  const parts: string[] = [];

  if (item.boeAnnouncement) {
    parts.push(item.boeAnnouncement.trim());
  }

  if (item.propertyDescription) {
    parts.push(item.propertyDescription.trim());
  }

  if (item.lotDescription) {
    parts.push(item.lotDescription.trim());
  }

  if (parts.length === 0) {
    if (item.auctionId) parts.push(`ID Subasta: ${item.auctionId}`);
    if (item.lotNumber) parts.push(`Lote: ${item.lotNumber}`);
    if (item.courtName) parts.push(`Autoridad gestora: ${item.courtName}`);
    if (item.procedureNumber) parts.push(`Procedimiento: ${item.procedureNumber}`);
    if (item.propertyType) parts.push(`Tipo de bien: ${item.propertyType}`);
    if (item.possessionStatus) parts.push(`Posesión: ${item.possessionStatus}`);
    if (item.visitable !== null) parts.push(`Visitable: ${item.visitable ? 'Sí' : 'No'}`);
    if (item.cadastralRef) parts.push(`Referencia catastral: ${item.cadastralRef}`);
    if (item.registryInfo) parts.push(`Registro: ${item.registryInfo}`);
    if (item.contactInfo) parts.push(`Contacto: ${item.contactInfo}`);
  }

  const text = parts.join('\n').trim();
  return text.length > 0 ? text : null;
}

function extractWarning(item: AuctionFromDB): string | null {
  if (item.chargesDetail && item.chargesDetail.trim()) {
    return item.chargesDetail.trim();
  }

  if (item.boeAnnouncement) {
    const match = item.boeAnnouncement.match(/Advertencia[s]?:\s*(.*)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Generate an appropriate image URL based on auction category
 * - Properties: Use Street View URL if available, otherwise map image
 * - Vehicles: Use a placeholder vehicle image (to be replaced with AI-generated)
 * - Boats: Use a placeholder boat image
 */
/**
 * Forge P1 (2026-05-30): Catastro+StreetView auction-image pipeline.
 *
 * imageUrl is now populated out-of-band by the resolver (see
 * src/lib/auction-images/resolver.ts) — written by the backfill endpoint and
 * future enrichment hooks. The request path only READS that field.
 *
 * `/api/auction-image/<boeId>` paths are the truth source for "Solo con foto"
 * (Pixel's hasImage filter). Category placeholder URLs are NOT real photos
 * and MUST NOT satisfy the filter.
 */
// Wave B0 (2026-06-07): the image-resolution functions moved to
// `@/lib/auction-image-projection` so /api/auctions/carousel-mix can use the
// SAME ladder. Carousel cards were falling through to the rung-3 branded
// placeholder because the carousel route projected the raw DB `imageUrl`
// without running it through this resolver. These thin re-exports keep the
// existing local call-sites (`getAppropriateImageUrl(item)` and
// `isRealAuctionImage(item.imageUrl)`) unchanged.
function isRealAuctionImage(u: string | null | undefined): boolean {
  return sharedIsRealAuctionImage(u);
}
function getAppropriateImageUrl(item: AuctionFromDB): string {
  return sharedGetAppropriateImageUrl({
    imageUrl: item.imageUrl,
    streetViewUrl: item.streetViewUrl,
    latitude: item.latitude,
    longitude: item.longitude,
    boeId: item.boeId,
    category: item.category,
    status: item.status,
  });
}

/**
 * #16 — convert the BIGINT-cents `currentBidAmount` column (which pg returns
 * as a string) into a finite EURO number for the card layer. Returns null
 * when the value is null / blank / NaN / non-positive so the badge can stay
 * null-safe and never render a misleading "€0".
 */
function bidCentsToEuros(raw: string | number | bigint | null | undefined): number | null {
  if (raw == null) return null;
  let cents: number;
  if (typeof raw === 'bigint') {
    cents = Number(raw);
  } else if (typeof raw === 'number') {
    cents = raw;
  } else {
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    cents = Number(trimmed);
  }
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents / 100;
}

/**
 * #16 / #17 — normalize raw column strings to the canonical card-layer values.
 * Anything outside the known set falls back to null so an unexpected upstream
 * value never paints a misleading badge.
 */
function normalizePujaStatus(raw: string | null | undefined): 'CON_PUJA' | 'SIN_PUJA' | null {
  if (raw === 'CON_PUJA' || raw === 'SIN_PUJA') return raw;
  return null;
}
function normalizeOccupancy(
  raw: string | null | undefined,
): 'OCUPADO' | 'NO_OCUPADO' | 'NO_CONSTA' | null {
  if (raw === 'OCUPADO' || raw === 'NO_OCUPADO' || raw === 'NO_CONSTA') return raw;
  return null;
}

function transformAuction(item: AuctionFromDB, userTier: UserTier | 'GUEST', isLocked: boolean = false) {
  const publishedAt = new Date(item.publishedAt);
  const endsAt = item.endsAt ? new Date(item.endsAt) : null;
  const transitionedAt = item.transitionedAt ? new Date(item.transitionedAt) : null;
  const frontendStatus = mapStatus(item.status);
  const frontendAuctionType = mapAuctionType(item.auctionType);
  const imageUrl = getAppropriateImageUrl(item);
  const generalInfo = buildGeneralInfo(item);
  const warning = extractWarning(item);
  const isPreAuction = frontendStatus === 'pre-auction' || frontendStatus === 'proxima-apertura';
  const hasPdf = Boolean(item.pdfUrl);
  const baseAppraisalValue = item.appraisalValue && item.appraisalValue > 0 ? item.appraisalValue : null;
  const appraisalValue = isPreAuction && !hasPdf ? null : baseAppraisalValue;
  // #16 / #17 — projected straight through; the card layer renders nothing
  // when the value is null.
  const pujaStatus = normalizePujaStatus(item.pujaStatus);
  const currentBidAmount = bidCentsToEuros(item.currentBidAmount);
  const occupancy = normalizeOccupancy(item.occupancy);
  // Document-archive wave (2026-06-03). pg returns boolean from EXISTS as
  // a JS boolean; null/undefined collapse to false so cards never render
  // the "documentos" indicator on a row we never queried for.
  const hasDocuments = Boolean(item.hasDocuments);
  // surfaceM2 (2026-06-19) — coerce defensively (Float arrives as number;
  // NUMERIC would arrive as a string) → finite number or null.
  const surfaceM2 = coerceFiniteNumber(item.surfaceM2);
  // €/m² derived at read time (NOT stored). Numerator precedence:
  // valorSubasta>0 → appraisalValue>0 → null. Uses the post-pre-auction
  // `appraisalValue` computed above (pre-auction-without-pdf nulls appraisal;
  // €/m² then falls to valorSubasta or null — honest). NULL ⇒ card omits pill.
  const pricePerM2 = derivePricePerM2(item.valorSubasta, appraisalValue, surfaceM2);

  // Property-portal attributes (Phase 1/2, 2026-07-11 → 07-16) — idealista-style
  // BADGE-ONLY facts. PUBLIC auction information (same posture as surfaceM2 /
  // occupancy / vehicle make-model), so projected honestly on BOTH the locked
  // teaser and full-access payloads. Honest-NULL throughout:
  //   - strings (floorLevel, catastroUse): empty/whitespace → null (the card
  //     must never render an empty chip).
  //   - ints (bedrooms, bathrooms, catastroYearBuilt): finite number or null;
  //     the card only renders bed/bath chips for values > 0.
  //   - booleans (hasGarage, hasTerrace, hasGarden, hasStorageRoom): pass true/
  //     false/null through UNCHANGED — false is a real signal ("sin garaje")
  //     the card chooses not to badge, but we must not coerce null→false here.
  const propertyAttrs = {
    bedrooms: coerceFiniteNumber(item.bedrooms),
    bathrooms: coerceFiniteNumber(item.bathrooms),
    hasTerrace: item.hasTerrace ?? null,
    hasGarden: item.hasGarden ?? null,
    hasGarage: item.hasGarage ?? null,
    hasStorageRoom: item.hasStorageRoom ?? null,
    floorLevel: item.floorLevel && item.floorLevel.trim() ? item.floorLevel.trim() : null,
    catastroYearBuilt: coerceFiniteNumber(item.catastroYearBuilt),
    catastroUse: item.catastroUse && item.catastroUse.trim() ? item.catastroUse.trim() : null,
  };

  if (isLocked) {
    // ─────────────────────────────────────────────────────────────────────
    // GUEST / LOCKED TEASER — the anonymous field boundary. Must equal the
    // detail-page teaser (`/api/auctions/[id]` !isLoggedIn branch). Anything
    // marked WALL below requires login; see @/lib/guest-teaser for the policy
    // and the Dennis-flippable knobs. (Forge 2026-07-12, guest-teaser-gate.)
    // ─────────────────────────────────────────────────────────────────────
    //
    // Coarse the card image too: the rung-2 map-tile URL
    // (`/api/auction-map/m_<lat>_<lng>_z17`) otherwise embeds the EXACT coords
    // in the img src, defeating the coarse-coord wall. We (a) drop a stored
    // exact-coord map tile so it regenerates from coarse coords, and (b) feed
    // coarse lat/lng. Real photos (REAL_IMAGE_PREFIX) and boeId-keyed
    // /streetview screenshots carry no coords and pass through unchanged.
    const guestImageUrl = getAppropriateImageUrl({
      ...item,
      latitude: coarseCoord(item.latitude),
      longitude: coarseCoord(item.longitude),
      imageUrl:
        item.imageUrl && item.imageUrl.startsWith('/api/auction-map/')
          ? null
          : item.imageUrl,
    });
    return {
      id: item.id,
      // Address-led title is Dennis-locked PUBLIC (SEO surface). The 🔒 prefix
      // was a paywall-era artifact — dropped so the crawlable card title is
      // clean.
      title: item.title,
      category: item.category,
      province: item.province,
      municipality: item.municipality,
      community: 'Canarias',
      // WALL — valuation/bid BREAKDOWN. Only the reference valuations
      // (appraisalValue + valorSubasta) stay public, matching the detail
      // teaser; every bidding figure is login-gated.
      currentBid: null,
      appraisalValue,
      minimumBid: null,
      claimedAmount: null,
      // KEEP (public) — valorSubasta is a BOE reference figure, same posture
      // as appraisalValue. Judicial rows often carry only this, so keeping it
      // guarantees the SEO card has a price signal. Flip GUEST_KEEP_VALOR_SUBASTA
      // to wall it.
      valorSubasta: GUEST_KEEP_VALOR_SUBASTA ? (item.valorSubasta ?? null) : null,
      // WALL — court fields + BOE source links.
      courtName: null,
      procedureNumber: null,
      boeLink: null,
      edictUrl: null,
      pdfUrl: null,
      status: frontendStatus,
      auctionType: frontendAuctionType,
      // 2026-06-03 (Pixel cards): opensAt = "Fecha de inicio" (start date).
      // propertyType = accurate bien-type label for the headline. Both
      // nullable, null-safe. ISO string passthrough for opensAt — the card
      // layer parses it the same way it parses publishedAt/endsAt.
      opensAt: item.opensAt,
      // resumeAt — null on non-SUSPENDIDA rows; locked teasers still expose it
      // because the suspension date is public information from the courts.
      resumeAt: item.resumeAt,
      propertyType: item.propertyType,
      endDate: endsAt || new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      // Source is a free string in the DB so any new scraper source (SEGSOCIAL,
      // future ayuntamiento sources, etc.) self-flows through to the UI. The
      // type field on AuctionItem is already `string` — keep the cast off so
      // values like 'SEGSOCIAL' don't have to be widened in five places.
      source: item.source || 'BOE',
      imageUrl: guestImageUrl,
      hasImage: isRealAuctionImage(item.imageUrl),
      isLocked: true,
      // WALL — exact street address.
      address: null,
      // KEEP (coarse) — town-level coords so the card map-pin still renders;
      // exact parcel is walled. See GUEST_COORD_MODE.
      latitude: coarseCoord(item.latitude),
      longitude: coarseCoord(item.longitude),
      // WALL — precise map deep-links.
      mapUrl: null,
      streetViewUrl: null,
      placeUrl: null,
      directionsUrl: null,
      // WALL — the primary leak. generalInfo aggregates the full
      // property/vehicle description (VIN/bastidor, plate, ITV, cargas,
      // cadastral, registry, contact); `warning` is derived from chargesDetail.
      // Both login-gated. propertyDescription / lotDescription / chargesDetail
      // full text and cadastralRef are login-gated too.
      generalInfo: null,
      warning: null,
      propertyDescription: null,
      lotDescription: null,
      chargesDetail: null,
      cadastralRef: null,
      // #16 / #17 — pujaStatus + occupancy are low-info badges (kept public);
      // the live bid EUR amount is bid data → walled.
      pujaStatus,
      currentBidAmount: null,
      occupancy,
      // Document-archive wave (2026-06-03). Even locked teasers expose the
      // boolean — the BOE document set is public information; locking it
      // would be misleading without unlocking anything genuinely premium.
      hasDocuments,
      // Wave E2 (2026-06-07) — vehicle make/model/year are PUBLIC (Dennis-
      // locked: same posture as the address-as-title — public auction
      // information). Locked-tier teasers project them honestly so cards
      // render the vehicle headline even when other prices are masked.
      vehicleMake: item.vehicleMake ?? null,
      vehicleModel: item.vehicleModel ?? null,
      vehicleYear: item.vehicleYear ?? null,
      // surfaceM2 + €/m² (2026-06-19) — PUBLIC auction facts (same posture as
      // occupancy / vehicle make-model above), so projected honestly even on
      // locked teasers. €/m² is derived from valorSubasta/appraisalValue ÷ m²;
      // null ⇒ the card omits the pill.
      surfaceM2,
      pricePerM2,
      // Property-portal BADGE-ONLY facts (honest-NULL) — public, projected on
      // the locked teaser too (same posture as surfaceM2 / occupancy above).
      ...propertyAttrs,
    };
  }

  // Full access
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    province: item.province,
    municipality: item.municipality,
    community: 'Canarias',
    currentBid: item.currentBid,
    appraisalValue,
    // Valor subasta — the BOE "Valor subasta" reference figure (DISTINCT
    // from Tasación / Cantidad reclamada). Already in the row via
    // `SELECT Auction.*`. Honest-NULL passthrough — the scraper writes NULL
    // when the BOE page carries no Valor subasta, and the card must omit
    // the line entirely rather than rendering 0/—. Mirror of the
    // claimedAmount posture below.
    valorSubasta: item.valorSubasta ?? null,
    minimumBid: item.minimumBid,
    // Cantidad reclamada — the amount being claimed. Already in the row via
    // `SELECT Auction.*`. Card UIs render a "Cantidad reclamada" secondary
    // line when present (>0); null on AEAT (~99% of that bucket) is expected
    // and the card omits the line entirely.
    claimedAmount: item.claimedAmount ?? null,
    courtName: item.courtName,
    procedureNumber: item.procedureNumber,
    boeLink: boeLinkFor(item.boeId, item.boeLink),
    edictUrl: item.edictUrl,
    pdfUrl: item.pdfUrl,
    status: frontendStatus,
    auctionType: frontendAuctionType,
    // 2026-06-03 (Pixel cards): opensAt + propertyType, same rationale as
    // the locked teaser block above.
    opensAt: item.opensAt,
    // resumeAt — populated on SUSPENDIDA rows by the suspended-scraper. Card
    // date line uses it via `statusDateLabel('suspendida')` → "Fecha prevista
    // de reanudación". Null on every non-SUSPENDIDA row.
    resumeAt: item.resumeAt,
    propertyType: item.propertyType,
    endDate: endsAt || publishedAt,
    // See note on the locked-teaser branch above — source is a free string;
    // SEGSOCIAL and future sources flow through without a type widen.
    source: item.source || 'BOE',
    imageUrl,
    hasImage: isRealAuctionImage(item.imageUrl),
    isLocked: false,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    courtReference: item.courtReference,
    originalSource: item.originalSource,
    transitionedAt: transitionedAt,
    // Google Maps URLs
    mapUrl: item.mapUrl,
    streetViewUrl: item.streetViewUrl,
    placeUrl: item.placeUrl,
    directionsUrl: item.directionsUrl,
    generalInfo,
    warning,
    propertyDescription: item.propertyDescription,
    lotDescription: item.lotDescription,
    chargesDetail: item.chargesDetail,
    // Catastro RC — projected so the detail modal/page can render the
    // "Ver en Catastro" external link when populated (~2.5% of active rows).
    cadastralRef: item.cadastralRef,
    // #16 / #17 — null-safe; null = no badge on the card.
    pujaStatus,
    currentBidAmount,
    occupancy,
    // Document-archive wave (2026-06-03).
    hasDocuments,
    // Wave E2 (2026-06-07) — vehicle make/model/year (honest-NULL).
    vehicleMake: item.vehicleMake ?? null,
    vehicleModel: item.vehicleModel ?? null,
    vehicleYear: item.vehicleYear ?? null,
    // surfaceM2 + derived €/m² (2026-06-19, property-card-redesign). m² from
    // Ghost's prose extraction; €/m² = round(valorSubasta||appraisalValue ÷ m²)
    // — read-time derive, never stored. Honest-NULL ⇒ card omits the pill.
    surfaceM2,
    pricePerM2,
    // Property-portal BADGE-ONLY facts (Phase 1/2) — honest-NULL passthrough.
    ...propertyAttrs,
  };
}

function applyTierMasking(auctions: AuctionFromDB[], userTier: UserTier | 'GUEST', hasActiveTrial: boolean = false) {
  const maskedList: any[] = [];
  const activePerMunicipality: Map<string, number> = new Map();

  for (const item of auctions) {
    // GUEST (anonymous) — teaser ALWAYS, regardless of status. This MUST run
    // before the finished/suspended branches below: those call
    // transformAuction(..., false) unconditionally, so leaving a guest to fall
    // into them would leak the full shape on finished/suspended rows. Guest
    // sees the teaser everywhere; full detail requires registration.
    // (Forge 2026-07-12, guest-teaser-gate — replaces the old "LOGIN DISABLED:
    // show everything unlocked" switch.)
    if (userTier === 'GUEST') {
      maskedList.push(transformAuction(item, userTier, true));
      continue;
    }

    // A. Finished/cancelled - always show to everyone (logged-in)
    if (isFinishedStatus(item.status)) {
      maskedList.push(transformAuction(item, userTier, false));
      continue;
    }

    // B. Suspended - show but mark appropriately (logged-in)
    if (item.status === 'SUSPENDED' || item.status === 'SUSPENDIDA') {
      maskedList.push(transformAuction(item, userTier, false));
      continue;
    }

    // D. Handle active auctions for logged-in users
    if (isActiveStatus(item.status)) {
      const municipalityKey = item.municipality || item.province;
      const currentCount = activePerMunicipality.get(municipalityKey) || 0;

      if (userTier === 'free' && !hasActiveTrial && currentCount > 0) {
        // Lock additional auctions in same municipality for free users
        maskedList.push(transformAuction(item, userTier, true));
      } else {
        // Show full auction
        maskedList.push(transformAuction(item, userTier, false));
        if (userTier === 'free' && !hasActiveTrial) {
          activePerMunicipality.set(municipalityKey, currentCount + 1);
        }
      }
    }

    // E. Handle pre-auction - DIAMOND ONLY
    else if (isPreAuctionStatus(item.status)) {
      const isLocked = userTier !== 'diamond';
      maskedList.push(transformAuction(item, userTier, isLocked));
    }
  }

  return maskedList;
}

/**
 * FORGE 2026-06-02 — cursor encoding for endsAt_asc that handles the
 * NULLS-LAST tail. Format = `<isoOrNULL>|<uuid>` (pipe-delimited so it
 * survives URL encoding without further escaping).
 *
 *  - `2026-08-01T10:00:00.000Z|0193a...` → non-null endsAt, keyset across
 *    `(endsAt > ? OR (endsAt = ? AND id > ?) OR endsAt IS NULL)`.
 *  - `NULL|0193a...` → already in the null tail, keyset on `id > ?`.
 *  - Legacy plain ISO (no pipe) → backward-compatible; we widen the
 *    predicate to `endsAt > ? OR endsAt IS NULL` so the null tail is reached
 *    once future-endsAt rows are exhausted.
 *
 * Invariant: cursors are opaque to all callers (the frontend round-trips
 * `pagination.nextCursor`); we may rev the format freely.
 */
type EndsAtCursor =
  | { kind: 'legacy'; endsAt: string }
  | { kind: 'nonNull'; endsAt: string; id: string }
  | { kind: 'null'; id: string };

function parseEndsAtCursor(raw: string): EndsAtCursor {
  const pipe = raw.indexOf('|');
  if (pipe === -1) {
    // Legacy plain-ISO cursor from a pre-fix client.
    return { kind: 'legacy', endsAt: raw };
  }
  const left = raw.slice(0, pipe);
  const id = raw.slice(pipe + 1);
  if (left === 'NULL') {
    return { kind: 'null', id };
  }
  return { kind: 'nonNull', endsAt: left, id };
}

function encodeEndsAtCursor(endsAt: string | Date | null, id: string): string {
  if (endsAt == null) return `NULL|${id}`;
  // pg returns timestamp columns as Date objects. Normalize to ISO so the
  // cursor is a stable URL-safe string that can be parsed back unambiguously.
  const iso = endsAt instanceof Date ? endsAt.toISOString() : endsAt;
  return `${iso}|${id}`;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const province = searchParams.get('province');
    // FORGE 2026-06-04 (Wave 56) — server-side `municipality` filter for
    // /subastas/[province]/[municipio] SEO pages. lockedFilter sends BOTH
    // province AND municipality, so we apply the muni predicate on top of the
    // province one (same-named towns across provinces stay separate). No-op
    // when absent — every existing 1-dim caller is unaffected.
    const municipality = searchParams.get('municipality');
    // FORGE 2026-06-07 (multi-town-api / Feature F1): multi-select town +
    // province filters for the MAIN /subastas page. Province-AGNOSTIC: towns
    // can span provinces (e.g. ?municipios=calldetenes,getafe → Barcelona +
    // Madrid in one list). Single `province`/`municipality` params above stay
    // untouched so the locked SEO town pages keep working.
    const municipiosRaw = searchParams.get('municipios');
    const provinciasRaw = searchParams.get('provincias');
    const municipiosList = parseCsvParam(municipiosRaw, MAX_MUNICIPIOS);
    const provinciasList = parseCsvParam(provinciasRaw, MAX_PROVINCIAS);
    const category = searchParams.get('category');
    // FORGE 2026-07-10 (geoip-nearby brief, Task 2): `categoryGroup` mirrors
    // carousel-mix's semantics EXACTLY (same OFFICIAL_CATEGORIES sets, same
    // "ignored when an exact category/categories pin is present" rule) so the
    // homepage "Ver todas" links on the Inmuebles/Vehículos tabs land on a
    // list segmented the same way the carousel was. Only two values are
    // valid; anything else is null (no constraint).
    const rawCategoryGroup = (searchParams.get('categoryGroup') ?? '').trim().toLowerCase();
    const categoryGroup: 'movable' | 'real_estate' | null =
      rawCategoryGroup === 'movable' || rawCategoryGroup === 'real_estate' ? rawCategoryGroup : null;
    // Wave79 (2026-06-07): curated "map sidebar" filter. Optional + additive
    // — single key (e.g. ?mapCategory=vivienda). Expands to the underlying DB
    // labels via the single-source-of-truth `mapCategoryToDbLabels`. "otros"
    // is the catch-all. Unknown key → ignored (no `1=0`) so a stale chip from
    // an in-flight client doesn't collapse the result set.
    const mapCategory = searchParams.get('mapCategory');
    const status = searchParams.get('status');
    const statuses = searchParams.get('statuses'); // Support multiple statuses
    const auctionType = searchParams.get('auctionType');
    const auctionTypes = searchParams.get('auctionTypes'); // Support multiple types
    const tierParam = searchParams.get('tier');
    const userIdParam = searchParams.get('userId');

    // Source filter (2026-06-07, Wave66). Optional + additive — absent param
    // leaves the source-dimension unconstrained (every source returned).
    // Accepts single (?source=SEGSOCIAL) or multi (?sources=BOE,SEGSOCIAL)
    // forms; values are whitelisted against KNOWN_SOURCES so the user can't
    // probe arbitrary strings into the WHERE.
    const sourceRaw = searchParams.get('source');
    const sourcesRaw = searchParams.get('sources');
    const sourcesList = (() => {
      const raw: string[] = [];
      if (sourcesRaw) raw.push(...sourcesRaw.split(','));
      if (sourceRaw) raw.push(sourceRaw);
      const cleaned = raw
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0)
        .filter((s) => isKnownSource(s));
      const unique = [...new Set(cleaned)];
      return unique.length > 0 ? unique : null;
    })();

    // --- P1 advanced filter params (Dennis decision F, all FREE) ----------
    // Whitelisted, parameterized, backward-compatible (absent => no constraint).
    // Powers Pixel's 4 advanced presets + hasImage filter.
    const priceMaxRaw = searchParams.get('priceMax');
    const pctTasacionMaxRaw = searchParams.get('pctTasacionMax');
    const endsBeforeRaw = searchParams.get('endsBefore');
    const hasImageRaw = searchParams.get('hasImage');
    const categoriesRaw = searchParams.get('categories'); // multi-value rollup (e.g. "Coches")
    // search: free-text keyword matched against ALL card-visible text columns
    // (title, municipality, bienLocalidad, address, province, bienProvincia,
    // category, propertyType, propertyDescription, lotDescription,
    // boeAnnouncement, boeId, auctionId, procedureNumber, courtName,
    // cadastralRef, postalCode), accent + case-insensitive via shared
    // normalizeText() + matching SQL translate(lower(...)). Validated &
    // applied BEFORE the preStatusSqlLen snapshot below so totalCount &
    // teaserCounts reflect the search-narrowed set.
    const searchRaw = searchParams.get('search');

    // priceMax: positive finite number, else ignored.
    const priceMax = (() => {
      if (priceMaxRaw == null) return null;
      const n = Number(priceMaxRaw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    // pctTasacionMax: 0 < n <= 1000 (allow generous ceiling; UI passes 70 etc.)
    const pctTasacionMax = (() => {
      if (pctTasacionMaxRaw == null) return null;
      const n = Number(pctTasacionMaxRaw);
      return Number.isFinite(n) && n > 0 && n <= 1000 ? n : null;
    })();
    // endsBefore: accept ISO date or ISO datetime. Validate via Date parse.
    const endsBefore = (() => {
      if (!endsBeforeRaw) return null;
      const t = Date.parse(endsBeforeRaw);
      if (Number.isNaN(t)) return null;
      return new Date(t).toISOString();
    })();
    // endsAfter: user LOWER bound on endsAt. Same ISO validation as endsBefore.
    // NOTE: deliberately NO ">= NOW()" guard (unlike endsBefore) — a user may
    // legitimately set a past lower bound when browsing finished auctions.
    const endsAfterRaw = searchParams.get('endsAfter');
    const endsAfter = (() => {
      if (!endsAfterRaw) return null;
      const t = Date.parse(endsAfterRaw);
      if (Number.isNaN(t)) return null;
      return new Date(t).toISOString();
    })();
    // publishedAfter / publishedBefore: ISO bounds on publishedAt (NOT NULL,
    // indexed, the default-sort column). Same Date.parse validation.
    const publishedAfterRaw = searchParams.get('publishedAfter');
    const publishedAfter = (() => {
      if (!publishedAfterRaw) return null;
      const t = Date.parse(publishedAfterRaw);
      if (Number.isNaN(t)) return null;
      return new Date(t).toISOString();
    })();
    const publishedBeforeRaw = searchParams.get('publishedBefore');
    const publishedBefore = (() => {
      if (!publishedBeforeRaw) return null;
      const t = Date.parse(publishedBeforeRaw);
      if (Number.isNaN(t)) return null;
      return new Date(t).toISOString();
    })();
    // pujaStatus: strict whitelist — only CON_PUJA / SIN_PUJA engage; any other
    // value is ignored (no constraint). SIN_PUJA excludes nulls server-side
    // (null = unscraped/unknown, NOT "no bid").
    const pujaStatusRaw = searchParams.get('pujaStatus');
    const pujaStatus: 'CON_PUJA' | 'SIN_PUJA' | null =
      pujaStatusRaw === 'CON_PUJA' || pujaStatusRaw === 'SIN_PUJA' ? pujaStatusRaw : null;
    // hasImage: only the literal "true" engages the filter (any other value => no constraint).
    const hasImage = hasImageRaw === 'true';
    // categories: comma-separated list; trim, dedupe, drop empties.
    const categoriesList = (() => {
      if (!categoriesRaw) return null;
      const list = categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const unique = [...new Set(list)];
      return unique.length > 0 ? unique : null;
    })();
    // searchTerm: trim, empty/whitespace -> null, cap length at 120 chars
    // (defense against absurd %...% scans), then JS-fold via shared
    // normalizeText() (lower + NFD + strip combining marks). The SQL side
    // folds matching columns identically via translate(lower(COALESCE(col,''))),
    // so a plain LIKE (not ILIKE) is correct and slightly cheaper.
    const searchTerm = (() => {
      if (!searchRaw) return null;
      const trimmed = searchRaw.trim();
      if (!trimmed) return null;
      const capped = trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
      const folded = normalizeText(capped);
      return folded || null;
    })();
    
    // FORGE 2026-07-10 (geoip-nearby brief, Task 3 — radius sort). All three
    // params must be present + valid to engage: nearLat/nearLng (finite,
    // geodetic range) and radiusKm (positive, hard-capped at 200). When
    // active: rows with NULL coords are excluded, a parameterized haversine
    // bounds the set to the radius, and ORDER BY distance ASC replaces the
    // sort plan (offset pagination — a computed distance can't be cleanly
    // keyset-paginated, same rationale as price sorts).
    const nearLat = (() => {
      const n = Number(searchParams.get('nearLat'));
      return Number.isFinite(n) && Math.abs(n) <= 90 ? n : null;
    })();
    const nearLng = (() => {
      const n = Number(searchParams.get('nearLng'));
      return Number.isFinite(n) && Math.abs(n) <= 180 ? n : null;
    })();
    const radiusKm = (() => {
      const raw = searchParams.get('radiusKm');
      if (raw == null) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : null;
    })();
    const radiusActive = nearLat != null && nearLng != null && radiusKm != null;

    // --- Phase-2 honest property-attribute filters (Forge 2026-07-16) --------
    // Back Pixel's AdvancedFiltersSheet follow-up. All parameterized, additive,
    // backward-compatible (absent param => no constraint). Columns already exist
    // (populated by the property-attribute parser); NO migration. Honest-null:
    // an ACTIVE filter EXCLUDES rows with NULL in the filtered column (standard
    // SQL predicate) — "filter by floor 3" must NOT return rows with unknown
    // floor. See the WHERE block + cacheKey additions below (CACHE-KEY LAW).
    const MAX_PROPERTY_ATTR_VALUES = 25;
    // floorLevel / catastroUse: single value or comma-separated IN list. Reuse
    // the generic CSV parser (trim, dedupe, cap count, drop empties/oversized).
    const floorLevelList = parseCsvParam(searchParams.get('floorLevel'), MAX_PROPERTY_ATTR_VALUES);
    const catastroUseList = parseCsvParam(searchParams.get('catastroUse'), MAX_PROPERTY_ATTR_VALUES);
    // hasGarage: ONLY the literal "true" engages ("show only garaged"). Any
    // other value (incl. "false") => no constraint — false is a sparse,
    // honest-null-equivalent signal we must never filter to.
    const hasGarageOnly = searchParams.get('hasGarage') === 'true';
    // yearBuiltMin / yearBuiltMax: inclusive int range on catastroYearBuilt;
    // each bound independent + optional; non-numeric ignored. Bounded to a sane
    // calendar window so a garbage probe can't push absurd bounds into the plan.
    const parseYearBound = (raw: string | null): number | null => {
      if (raw == null) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      const y = Math.trunc(n);
      return y >= 1000 && y <= 3000 ? y : null;
    };
    const yearBuiltMin = parseYearBound(searchParams.get('yearBuiltMin'));
    const yearBuiltMax = parseYearBound(searchParams.get('yearBuiltMax'));

    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor'); // For cursor-based pagination

    // Validate pagination
    const safeLimit = Math.min(Math.max(limit, 1), 100); // Max 100 per page
    const offset = (page - 1) * safeLimit;

    // --- Sort whitelist (P0 dropdown) -----------------------------------
    // Whitelist input -> safe ORDER BY clause. Never interpolate raw input.
    //
    // FORGE 2026-06-03 (Item C — promote properties primarily):
    //   New default = `category_rank` — properties (viviendas first) float to
    //   the top, with `publishedAt DESC` preserving recency WITHIN each tier
    //   and `id DESC` as a stable deterministic tiebreak for pagination.
    //   Implemented as a SQL CASE on `category` (NO migration, no new column).
    //
    //   Explicit `sort=` params still resolve to their existing plans below —
    //   this only changes the DEFAULT when no sort is supplied. User choice
    //   always wins.
    //
    //   Pagination: `category_rank` uses cursorMode='offset' because a CASE
    //   expression cannot be cleanly keyset-paginated. The existing page-
    //   fallback path (when `?page=N` is supplied without `?cursor=`) already
    //   handles this — `usingOffset` is set further down. Counts and
    //   teaserCounts are computed from snapshots taken BEFORE the ORDER BY
    //   is appended, so this change cannot affect them.
    type SortKey = 'category_rank' | 'endsAt_asc' | 'published_desc' | 'price_asc' | 'price_desc';
    const EFFECTIVE_PRICE = 'COALESCE("currentBid", "minimumBid", "appraisalValue")';
    const SORT_MAP: Record<SortKey, { orderBy: string; cursorMode: 'endsAt' | 'publishedAt' | 'offset' }> = {
      category_rank:   { orderBy: `${CATEGORY_RANK_CASE_SQL} ASC, "publishedAt" DESC, id DESC`, cursorMode: 'offset' },
      endsAt_asc:      { orderBy: '"endsAt" ASC NULLS LAST, id ASC',     cursorMode: 'endsAt' },
      published_desc:  { orderBy: '"publishedAt" DESC, id DESC',          cursorMode: 'publishedAt' },
      price_asc:       { orderBy: `${EFFECTIVE_PRICE} ASC NULLS LAST, id ASC`,  cursorMode: 'offset' },
      price_desc:      { orderBy: `${EFFECTIVE_PRICE} DESC NULLS LAST, id ASC`, cursorMode: 'offset' },
    };
    const rawSort = searchParams.get('sort');
    // Accept `publishedAt_desc` as alias for `published_desc` (Ken's brief uses
    // both spellings — keep both pointing at the same ORDER BY).
    const normalizedSort: SortKey = (() => {
      switch (rawSort) {
        case 'category_rank':
        case 'endsAt_asc':
        case 'published_desc':
        case 'price_asc':
        case 'price_desc':
          return rawSort;
        case 'publishedAt_desc':
          return 'published_desc';
        default:
          // FORGE 2026-06-07 (C2 batch-c #9): default flipped
          // `category_rank` → `published_desc` so a URL-less /subastas surfaces
          // active/próximas by `publishedAt DESC` first, then finished/older
          // rows fall to the tail. Mirrors DEFAULT_SORT in
          // src/components/observatory/filters.ts. Explicit ?sort=category_rank
          // still resolves above and continues to work for legacy callers.
          return 'published_desc';
      }
    })();
    // Parameterized great-circle distance in km (haversine). Binds, in order:
    // nearLat, nearLat, nearLng — NEVER interpolate the values themselves.
    // `latitude`/`longitude` are all-lowercase columns (no quoting concerns).
    const DISTANCE_KM_SQL =
      '2 * 6371 * asin(sqrt(power(sin(radians(latitude - ?) / 2), 2) + cos(radians(?)) * cos(radians(latitude)) * power(sin(radians(longitude - ?) / 2), 2)))';

    // Radius mode overrides the sort plan: nearest first, id tiebreak for
    // deterministic pages. Explicit ?sort= is intentionally superseded — a
    // radius query IS a distance ordering by definition.
    const sortPlan: { orderBy: string; cursorMode: 'endsAt' | 'publishedAt' | 'offset' } =
      radiusActive
        ? { orderBy: `${DISTANCE_KM_SQL} ASC, id ASC`, cursorMode: 'offset' }
        : SORT_MAP[normalizedSort];

    // Tier resolution — server-side, mirroring the detail route's gate.
    //
    // The frontend does NOT send a `tier` param, so a client value can never be
    // trusted to unlock; the login signal comes from the session. Fail-closed:
    // any auth() error is treated as logged-out so a session-store blip can
    // never hand a guest the full payload.
    //   - anonymous            → 'GUEST'  (teaser; a spoofed ?tier= is ignored)
    //   - any registered user  → full     (binary gate, exactly like
    //                            /api/auctions/[id] which unlocks on isLoggedIn
    //                            with no tier distinction). We default a
    //                            logged-in caller to 'diamond' (full access);
    //                            an explicit ?tier= is still honoured so a
    //                            future freemium client can opt into gating.
    let isLoggedIn = false;
    try {
      const session = await auth();
      isLoggedIn = !!session?.user?.id;
    } catch {
      isLoggedIn = false;
    }
    const tier: UserTier | 'GUEST' = isLoggedIn
      ? ((tierParam as UserTier) || 'diamond')
      : 'GUEST';

    // Create cache key (include sort so different orderings don't collide)
    const cacheKey = {
      province: province || 'all',
      municipality: municipality || 'all',
      // multi-select (folded+sorted so order-insensitive cache hit)
      municipios: municipiosList ? [...municipiosList].map((s) => normalizeText(s)).sort().join('|') : 'none',
      provincias: provinciasList ? [...provinciasList].map((s) => normalizeText(s)).sort().join('|') : 'none',
      category: category || 'all',
      // CACHE-KEY LAW (wave118 lesson): every new filter param MUST be keyed
      // here in the same commit it's added to the WHERE — omission = stale
      // cross-filter cache hits.
      categoryGroup: categoryGroup ?? 'none',
      mapCategory: mapCategory || 'all',
      status: status || 'all',
      statuses: statuses || 'all',
      auctionType: auctionType || 'all',
      auctionTypes: auctionTypes || 'all',
      tier,
      page,
      limit: safeLimit,
      cursor: cursor || 'none',
      sort: normalizedSort,
      // P1 advanced filters — must be in cache key to avoid cross-filter collisions.
      priceMax: priceMax ?? 'none',
      pctTasacionMax: pctTasacionMax ?? 'none',
      endsBefore: endsBefore ?? 'none',
      endsAfter: endsAfter ?? 'none',
      publishedAfter: publishedAfter ?? 'none',
      publishedBefore: publishedBefore ?? 'none',
      pujaStatus: pujaStatus ?? 'none',
      hasImage: hasImage ? 'true' : 'none',
      categories: categoriesList ? categoriesList.join('|') : 'none',
      // Keyed on the FOLDED form (post-normalizeText) so "Arguineguin" and
      // "arguineguín" collapse to one cache entry — the SQL predicate also
      // compares on the identical folded value.
      search: searchTerm ?? 'none',
      sources: sourcesList ? sourcesList.join('|') : 'none',
      // Task 3 radius params (CACHE-KEY LAW — same commit as the WHERE).
      nearLat: nearLat ?? 'none',
      nearLng: nearLng ?? 'none',
      radiusKm: radiusKm ?? 'none',
      // Phase-2 property-attribute filters (CACHE-KEY LAW — same commit as the
      // WHERE; wave118→119 lesson: an unkeyed filter param collides with the
      // cached unfiltered entry and silently no-ops).
      floorLevel: floorLevelList ? floorLevelList.join('|') : 'none',
      catastroUse: catastroUseList ? catastroUseList.join('|') : 'none',
      hasGarage: hasGarageOnly ? 'true' : 'none',
      yearBuiltMin: yearBuiltMin ?? 'none',
      yearBuiltMax: yearBuiltMax ?? 'none',
    };
    
    // Try cache first (30 second TTL)
    const cached = auctionCache.get(cacheKey);
    if (cached) {
      console.log(`⚡ Cache HIT - returned in ${Date.now() - startTime}ms`);
      return NextResponse.json(cached);
    }
    
    // Check if user has active trial
    let hasActiveTrial = false;
    if (tier === 'free' && userIdParam) {
      try {
        const user = await queryOne<{ trialEndDate: string | Date | null }>(`
          SELECT trialEndDate FROM User WHERE id = ?
        `, [userIdParam]);

        if (user?.trialEndDate) {
          const trialEnd = new Date(user.trialEndDate);
          hasActiveTrial = trialEnd.getTime() > Date.now();
        }
      } catch (error) {
        console.error('Error checking trial status:', error);
      }
    }

    // Build optimized SQL query with filters at database level.
    //
    // FORGE 2026-06-02 (P1 count-vs-list reconciliation):
    // The list WHERE and the badge-count WHERE MUST share a single predicate.
    // Previously teaserCounts.active was derived from a bare
    // `status IN (…)` SELECT with no province/junk-row filter, so it returned
    // 466 while the list returned 447 (~19 province-null/junk rows hidden by
    // the list but counted by the badge). We now build the WHERE clause in
    // layered snapshots so the list SELECT, the list COUNT, and the teaser
    // counts ALL reuse the same upstream filters (province + category +
    // advanced filters + auction type). Single source of truth.
    // Document-archive wave (2026-06-03): correlated EXISTS subquery yields a
    // per-row `hasDocuments` boolean so cards can show a compact "documentos"
    // indicator without us inlining the full doc array on the list. Uses the
    // ("AuctionDocument"."auctionId") index so cost is ~one index probe per row.
    // The base SELECT shape is preserved (SELECT *) so downstream code that
    // assumes every Auction column is present keeps working; we only ADD a
    // computed column. Note: the snapshot-prefix slicing below uses
    // `preStatusSqlLen`/`preCursorSqlLen` indexes into this string AFTER the
    // SELECT line — those still work because the slices are computed AFTER
    // this base assignment.
    // db.ts auto-quotes mixed-case identifiers (Auction, AuctionDocument,
    // hasDocuments, auctionId) so we write the SQL the same way the rest of
    // this file does — unquoted PascalCase / camelCase. The alias `ad` is
    // all-lowercase, which PG accepts unquoted, so no special handling
    // needed there. The "AS hasDocuments" alias is auto-handled by the
    // quote-aliases pass in db.ts.
    let sql = `SELECT Auction.*, EXISTS (
        SELECT 1 FROM AuctionDocument ad
         WHERE ad.auctionId = Auction.id
       ) AS hasDocuments
      FROM Auction WHERE 1=1
      AND province IS NOT NULL
      AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
      AND LENGTH(TRIM(province)) > 1`;
    const params: any[] = [];
    
    // Apply filters
    if (province) {
      const normalizedProvince = normalizeText(province);
      const dbProvinces = await getCachedDistinctProvinces();
      const provinceMatches = dbProvinces
        .filter((value) => normalizeText(value) === normalizedProvince);

      if (provinceMatches.length > 0) {
        sql += ` AND province IN (${provinceMatches.map(() => '?').join(',')})`;
        params.push(...provinceMatches);
      } else {
        sql += ' AND LOWER(province) = LOWER(?)';
        params.push(province);
      }
    }

    // FORGE 2026-06-04 (Wave 56) — server-side `municipality` filter.
    //
    // Folded match via the SAME normalizeText() the search and province blocks
    // use, against the per-province distinct-municipalities cache so a slug
    // like "Abrera" matches every DB casing variant in one IN-list. Province
    // MUST be applied (above) so same-name towns across provinces stay
    // separate; the town SEO page always sends both. If the muni param was
    // sent without a province, we fall back to a folded LIKE-on-LOWER (cheap
    // since the row set is already filtered by status/category).
    //
    // The predicate sits AFTER province and BEFORE preStatusSqlLen so
    // totalCount + teaserCounts.{active,preAuction} all reflect the
    // municipality-narrowed set — count/list invariant preserved.
    if (municipality && municipality.trim().length > 0) {
      const folded = normalizeText(municipality);
      if (province) {
        // Find the original-casing DB names whose folded form matches.
        // Scoped to the SAME province values we already pushed above (so
        // there is no cross-province leakage).
        const dbProvinces = await getCachedDistinctProvinces();
        const provinceMatches = dbProvinces.filter((v) => normalizeText(v) === normalizeText(province));
        const targetProvinces = provinceMatches.length > 0 ? provinceMatches : [province];
        const muniSet = new Set<string>();
        for (const prov of targetProvinces) {
          const munis = await getCachedDistinctMunicipalitiesInProvince(prov);
          for (const m of munis) {
            if (normalizeText(m) === folded) muniSet.add(m);
          }
        }
        const muniMatches = Array.from(muniSet);
        if (muniMatches.length > 0) {
          sql += ` AND municipality IN (${muniMatches.map(() => '?').join(',')})`;
          params.push(...muniMatches);
        } else {
          // No DB casing match — fall through to LOWER() comparison so the
          // request still produces a deterministic (likely-empty) result set
          // instead of leaking all municipalities in the province.
          sql += ' AND LOWER(municipality) = LOWER(?)';
          params.push(municipality);
        }
      } else {
        // No province context — fall back to a folded LOWER compare. Used
        // rarely (the town SEO page always sends province too).
        sql += ' AND LOWER(municipality) = LOWER(?)';
        params.push(municipality);
      }
    }

    // FORGE 2026-06-07 (multi-town-api / Feature F1): province-agnostic
    // multi-select location predicate.
    //
    // Semantics (locked by Ken's brief): UNION — a row matches if it's in
    // ANY selected municipio OR ANY selected provincia. This lets the user
    // tick "Calldetenes" + "Getafe" (towns from 2 different provinces) and
    // also "Lleida" (whole province) and see one combined list.
    //
    // Resolution:
    //   - municipios CSV → fold each slug via normalizeText, look up the
    //     GLOBAL distinct-muni cache → all DB casings across ALL provinces
    //     OR'd into a single IN-list. Cross-province same-name towns
    //     (e.g. two "Sant Joan") both match — accepted v1 behavior.
    //   - provincias CSV → fold each slug via the canonical-province helper
    //     so "barcelona" / "Barcelona" / "Barcelona / Provincia" all resolve
    //     to the same DB casings via the existing distinct-province cache.
    //
    // Empty match (e.g. ?municipios=garbageslug with no other location filter)
    // → push `1=0` so the result set is deterministically empty rather than
    // leaking the whole table.
    //
    // Placement: BEFORE preStatusSqlLen so totalCount + teaserCounts both
    // reflect the multi-town set — count-vs-list invariant preserved (same
    // pattern the seg-social ?sources= work used).
    //
    // Coexistence with single `province` / `municipality`: those still apply
    // (AND) so the locked SEO town pages keep their narrow scope. In practice
    // the unlocked /subastas multi-select UI sends ONLY the array params and
    // omits the singletons; the locked SEO pages send ONLY the singletons.
    if ((municipiosList && municipiosList.length > 0) || (provinciasList && provinciasList.length > 0)) {
      const orParts: string[] = [];

      if (municipiosList && municipiosList.length > 0) {
        const globalMuniMap = await getCachedDistinctMunicipalitiesGlobal();
        const muniDbCasings = new Set<string>();
        for (const slug of municipiosList) {
          const folded = normalizeText(slug);
          const variants = globalMuniMap.get(folded);
          if (variants) {
            for (const v of variants) muniDbCasings.add(v);
          }
        }
        if (muniDbCasings.size > 0) {
          const arr = Array.from(muniDbCasings);
          orParts.push(`municipality IN (${arr.map(() => '?').join(', ')})`);
          params.push(...arr);
        }
      }

      if (provinciasList && provinciasList.length > 0) {
        // Wave79 (2026-06-07): primary resolver is the SEO slug grammar
        // (`resolveProvinceSlugToCanonical`), which round-trips every slug the
        // ProvinceTownTree emits — including the overridden ones ("a-coruna",
        // "baleares", "araba-alava", "gipuzkoa", "bizkaia",
        // "santa-cruz-de-tenerife", "las-palmas") and the legacy aliases
        // ("la-coruna", "illes-balears", "mallorca", "vizcaya", …) — to the
        // canonical {label, key}. The previous resolver did only
        // `normalizeText(slug)` which kept the slug hyphen-form and so
        // multi-word / overridden-slug provinces returned 0 rows even though
        // the count sidebar (which uses `toCanonicalProvince` on the raw DB
        // label) correctly tallied them. The folded + raw-label fallbacks
        // below are kept so a non-slug spelling on the wire (e.g. raw
        // "Illes Balears") still resolves.
        const dbProvinces = await getCachedDistinctProvinces();
        const provDbCasings = new Set<string>();
        for (const slug of provinciasList) {
          const folded = normalizeText(slug);
          const canonical = resolveProvinceSlugToCanonical(slug)
            ?? toCanonicalProvince(slug);
          for (const v of dbProvinces) {
            const vFolded = normalizeText(v);
            if (vFolded === folded) provDbCasings.add(v);
            if (canonical) {
              if (vFolded === normalizeText(canonical.key)) provDbCasings.add(v);
              if (vFolded === normalizeText(canonical.label)) provDbCasings.add(v);
            }
          }
        }
        if (provDbCasings.size > 0) {
          const arr = Array.from(provDbCasings);
          orParts.push(`province IN (${arr.map(() => '?').join(', ')})`);
          params.push(...arr);
        }
      }

      if (orParts.length > 0) {
        sql += ` AND (${orParts.join(' OR ')})`;
      } else {
        // Both params supplied but neither resolved to any DB value —
        // deterministic empty result, never leak-all.
        sql += ' AND 1=0';
      }
    }

    if (categoriesList && categoriesList.length > 0) {
      // P1: multi-value category rollup (e.g. "Coches" = Turismos,Motocicletas,...)
      // Takes precedence over single `category` if both are provided.
      sql += ` AND category IN (${categoriesList.map(() => '?').join(', ')})`;
      params.push(...categoriesList);
    } else if (category) {
      sql += ' AND category = ?';
      params.push(category);
    } else if (categoryGroup) {
      // FORGE 2026-07-10 (Task 2): group filter engages ONLY when no exact
      // category/categories pin is present — an explicit pin was deliberate
      // and wins (identical precedence to carousel-mix L501-518). Placement
      // BEFORE preStatusSqlLen so totalCount + teaserCounts honor it
      // (count=list invariant).
      const groupLabels =
        categoryGroup === 'movable' ? OFFICIAL_CATEGORIES.MOVABLE : OFFICIAL_CATEGORIES.REAL_ESTATE;
      if (groupLabels.length > 0) {
        sql += ` AND category IN (${groupLabels.map(() => '?').join(', ')})`;
        params.push(...groupLabels);
      }
    }

    // Wave79 (2026-06-07): curated `mapCategory` filter. Applied AFTER the
    // free-form `category`/`categories` filters so a stricter chip
    // ("vivienda") narrows further if the FE sent both. Placement sits
    // BEFORE preStatusSqlLen so totalCount + teaserCounts both honor the
    // narrowing — count=list invariant.
    if (mapCategory) {
      if (isMapCategoryOtros(mapCategory)) {
        if (MAP_CATEGORY_ALL_KNOWN_DB_LABELS.length > 0) {
          sql += ` AND (category IS NULL OR category NOT IN (${MAP_CATEGORY_ALL_KNOWN_DB_LABELS.map(() => '?').join(', ')}))`;
          params.push(...MAP_CATEGORY_ALL_KNOWN_DB_LABELS);
        }
      } else {
        const labels = mapCategoryToDbLabels(mapCategory);
        if (labels && labels.length > 0) {
          sql += ` AND category IN (${labels.map(() => '?').join(', ')})`;
          params.push(...labels);
        }
        // Unknown key (not curated, not "otros") — ignore.
      }
    }

    // --- P1 advanced filters (parameterized, never interpolated) ---------
    // priceMax: same COALESCE expression used by price sort (currentBid -> minimumBid -> appraisalValue).
    if (priceMax != null) {
      sql += ` AND ${EFFECTIVE_PRICE} <= ?`;
      params.push(priceMax);
    }
    // pctTasacionMax: rows where effective price is <= (pct/100) * appraisalValue.
    // Exclude rows with null/zero appraisalValue (cannot compute a meaningful ratio).
    if (pctTasacionMax != null) {
      sql += ` AND "appraisalValue" IS NOT NULL AND "appraisalValue" > 0 AND ${EFFECTIVE_PRICE} IS NOT NULL AND ${EFFECTIVE_PRICE} <= (? / 100.0) * "appraisalValue"`;
      params.push(pctTasacionMax);
    }
    // endsBefore: future-but-soon window — endsAt between now and the supplied bound.
    if (endsBefore) {
      sql += ' AND "endsAt" IS NOT NULL AND "endsAt" >= NOW() AND "endsAt" <= ?';
      params.push(endsBefore);
    }
    // endsAfter: user LOWER bound. NO NOW() guard (see parse note) — past
    // lower bounds are valid for finished-auction browsing. Sits in the same
    // region as endsBefore so totalCount + teaserCounts honor it (count=list).
    if (endsAfter) {
      sql += ' AND "endsAt" IS NOT NULL AND "endsAt" >= ?';
      params.push(endsAfter);
    }
    // publishedAfter / publishedBefore: window on publishedAt (NOT NULL, indexed).
    if (publishedAfter) {
      sql += ' AND "publishedAt" >= ?';
      params.push(publishedAfter);
    }
    if (publishedBefore) {
      sql += ' AND "publishedAt" <= ?';
      params.push(publishedBefore);
    }
    // pujaStatus: low-cardinality equality on the already-narrowed pool.
    // SIN_PUJA excludes nulls (null = unscraped/unknown, not "no bids") — this
    // is the correct semantic per the schema #16 comment. Whitelisted at parse.
    if (pujaStatus) {
      sql += ' AND "pujaStatus" = ?';
      params.push(pujaStatus);
    }
    // hasImage=true: real photo only (resolver-populated /api/auction-image/ OR legacy /streetview/).
    // Category placeholders must NOT satisfy this filter — mirrors isRealAuctionImage().
    if (hasImage) {
      sql += ` AND "imageUrl" IS NOT NULL AND ("imageUrl" LIKE '/api/auction-image/%' OR "imageUrl" LIKE '/streetview/%')`;
    }

    // Source filter (2026-06-07, Wave66). Whitelisted values only — see
    // KNOWN_SOURCES in `@/lib/source-labels`. Lives BEFORE preStatusSqlLen so
    // totalCount + teaserCounts honor the source narrowing the same way the
    // list does (the badge reconciles against the same row set).
    if (sourcesList && sourcesList.length > 0) {
      sql += ` AND source IN (${sourcesList.map(() => '?').join(', ')})`;
      params.push(...sourcesList);
    }

    // FORGE 2026-07-10 (Task 3): radius filter — NULL-coord rows are excluded
    // when active (~79% coverage on the active pool; a row without coords
    // cannot honestly claim to be "within N km"). Fully parameterized. Sits
    // BEFORE preStatusSqlLen so totalCount + teaserCounts honor the radius
    // (count=list invariant).
    if (radiusActive) {
      sql += ` AND latitude IS NOT NULL AND longitude IS NOT NULL AND ${DISTANCE_KM_SQL} <= ?`;
      params.push(nearLat, nearLat, nearLng, radiusKm);
    }

    // --- Phase-2 honest property-attribute filters (Forge 2026-07-16) --------
    // Parameterized; each ACTIVE filter EXCLUDES NULLs in its column (an IN(...)
    // never matches NULL; the year-range predicate guards IS NOT NULL). This is
    // the correct honest behavior — an unknown floor/use/year does NOT satisfy a
    // floor/use/year filter. Placed BEFORE preStatusSqlLen so totalCount +
    // teaserCounts honor the narrowing (count=list invariant, same as every
    // advanced filter above). Additive: absent param => no constraint.
    if (floorLevelList && floorLevelList.length > 0) {
      sql += ` AND "floorLevel" IN (${floorLevelList.map(() => '?').join(', ')})`;
      params.push(...floorLevelList);
    }
    if (catastroUseList && catastroUseList.length > 0) {
      sql += ` AND "catastroUse" IN (${catastroUseList.map(() => '?').join(', ')})`;
      params.push(...catastroUseList);
    }
    // hasGarage=true → garaged rows only. `= true` excludes both NULL and false
    // (false = "sin garaje"/sparse-unknown, which this toggle must not surface).
    if (hasGarageOnly) {
      sql += ' AND "hasGarage" = true';
    }
    // yearBuiltMin / yearBuiltMax → inclusive range on catastroYearBuilt; each
    // bound independent. Explicit IS NOT NULL so a NULL year is excluded under
    // an active bound (an unknown build year cannot honestly satisfy a range).
    if (yearBuiltMin != null) {
      sql += ' AND "catastroYearBuilt" IS NOT NULL AND "catastroYearBuilt" >= ?';
      params.push(yearBuiltMin);
    }
    if (yearBuiltMax != null) {
      sql += ' AND "catastroYearBuilt" IS NOT NULL AND "catastroYearBuilt" <= ?';
      params.push(yearBuiltMax);
    }

    // FORGE 2026-06-03 (search across ALL card-text columns, accent +
    // case-insensitive, count-correct).
    //
    // Goal: typing "Arguineguin" must return EVERY listing whose card text
    // contains that word in ANY of the rendered fields — title, municipality,
    // bienLocalidad, address, province, bienProvincia, category, propertyType,
    // propertyDescription, lotDescription, boeAnnouncement, boeId, auctionId,
    // procedureNumber, courtName, cadastralRef, postalCode. Also accent-fold
    // so "Arguineguín" (BOE spelling) matches "Arguineguin" (user typing).
    //
    // Why this placement: the predicate sits BEFORE preStatusSqlLen so
    // (a) totalCount, (b) teaserCounts.active and .preAuction snapshots
    // ALL include the search filter — the badge / result-count UI stays in
    // sync with the visible row set. The cursor / OFFSET pagination below
    // sees the same filtered base and stays correct over the narrowed pool.
    //
    // Why translate()+lower() and NOT unaccent(): unaccent is NOT installed on
    // this DB (pg_trgm IS); we deliberately avoid a schema migration in this
    // wave. The JS side folds via shared normalizeText() (lower + NFD +
    // strip combining marks) so the bound term is already lowercase-and-
    // accent-stripped. The SQL translate() list mirrors the Spanish accent
    // set the JS produces. Keep both sides in sync — adding a char to one
    // requires adding it to the other.
    //
    // Performance: over ~542 active rows this is a sub-50ms seq scan with
    // multi-column LIKE %term%. No index needed at current scale.
    if (searchTerm) {
      // ACCENT_PAIRS — kept inline as a SQL literal so the placeholder count
      // (the ? bindings) is exactly: 1 per column × 17 columns = 17 binds.
      const SEARCH_COLUMNS = [
        'title',
        'municipality',
        'bienLocalidad',
        'address',
        'province',
        'bienProvincia',
        'category',
        'propertyType',
        'propertyDescription',
        'lotDescription',
        'boeAnnouncement',
        'boeId',
        'auctionId',
        'procedureNumber',
        'courtName',
        'cadastralRef',
        'postalCode',
      ];
      // Spanish diacritic fold — covers á à ä â ã é è ë ê í ì ï î ó ò ö ô õ
      // ú ù ü û ñ ç. JS normalizeText() already produces the de-accented
      // lowercase form on the bound side, so we use plain LIKE (not ILIKE).
      const ACCENT_FROM = 'áàäâãéèëêíìïîóòöôõúùüûñç';
      const ACCENT_TO   = 'aaaaaeeeeiiiiooooouuuunc';
      const orClauses = SEARCH_COLUMNS
        .map((col) =>
          `translate(lower(COALESCE(${col}, '')), '${ACCENT_FROM}', '${ACCENT_TO}') LIKE ?`
        )
        .join(' OR ');
      sql += ` AND (${orClauses})`;
      const like = `%${searchTerm}%`;
      for (let i = 0; i < SEARCH_COLUMNS.length; i++) {
        params.push(like);
      }
    }

    // FORGE 2026-06-02: snapshot AFTER all non-status, non-pagination filters.
    // This is the "filters minus status" prefix the teaser-count queries reuse,
    // so e.g. teaserCounts.active honors a `?province=Madrid` filter exactly
    // the same way the list does.
    //
    // FORGE 2026-06-03: `search` is included in this prefix (it's a
    // non-status filter), so totalCount + teaserCounts.{active,preAuction}
    // both reflect the search-narrowed set. This is what makes the result-
    // count badge in the H1 stay truthful when Dennis types "Arguineguin".
    const preStatusSqlLen = sql.length;
    const preStatusParamsLen = params.length;

    // Filter by status at SQL level for better performance
    if (statuses) {
      // Multiple statuses support (comma-separated)
      const statusList = statuses.split(',').map(s => s.trim().toUpperCase());
      const dbStatuses: string[] = [];
      
      for (const s of statusList) {
        // Map frontend status to DB status(es)
        switch (s) {
          case 'PROXIMA-APERTURA':
          case 'PROXIMA_APERTURA':
            dbStatuses.push('PROXIMA_APERTURA', 'PRE_AUCTION');
            break;
          case 'CELEBRANDOSE':
            dbStatuses.push('CELEBRANDOSE', 'ACTIVE');
            break;
          case 'SUSPENDIDA':
            dbStatuses.push('SUSPENDIDA', 'SUSPENDED');
            break;
          case 'CANCELADA':
            dbStatuses.push('CANCELADA', 'CANCELLED');
            break;
          case 'CONCLUIDA-PORTAL':
          case 'CONCLUIDA_PORTAL':
            dbStatuses.push('CONCLUIDA_PORTAL', 'FINISHED');
            break;
          case 'FINALIZADA-AUTORIDAD':
          case 'FINALIZADA_AUTORIDAD':
            dbStatuses.push('FINALIZADA_AUTORIDAD');
            break;
          default:
            dbStatuses.push(s);
        }
      }
      
      const uniqueStatuses = [...new Set(dbStatuses)];
      if (uniqueStatuses.length > 0) {
        sql += ` AND status IN (${uniqueStatuses.map(() => '?').join(', ')})`;
        params.push(...uniqueStatuses);
      }
    } else if (status) {
      // Legacy single status support. Status sets come from
      // `@/lib/auction-status` (single source of truth — list, counts, map,
      // carousel all consume the same arrays). The canonical clock guard is
      // appended to `status=active` so a stale CELEBRANDOSE row whose
      // endsAt has passed is NOT counted as active (matches the carousel
      // and reality — the scheduler sweep just hasn't caught it yet).
      if (status === 'active') {
        const set = ACTIVE_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')}) AND ${ACTIVE_CLOCK_GUARD_SQL}`;
        params.push(...set);
      } else if (status === 'finished') {
        const set = FINISHED_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')})`;
        params.push(...set);
      } else if (status === 'pre-auction') {
        const set = PRE_AUCTION_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')})`;
        params.push(...set);
      }
    }
    
    // Filter by auction type. The frontend speaks the canonical plural form
    // (otras_tributarias / administrativas); the DB has BOTH the plural form
    // (new per-category scrapers) and the legacy singular form (older rows).
    // Expand each requested type to all DB labels that family ever used.
    const TYPE_QUERY_TO_DB: Record<string, string[]> = {
      JUDICIAL: ['JUDICIAL'],
      NOTARIAL: ['NOTARIAL'],
      AEAT: ['AEAT'],
      OTRAS_TRIBUTARIAS: ['OTRAS_TRIBUTARIAS', 'TRIBUTARIA'],
      TRIBUTARIA: ['OTRAS_TRIBUTARIAS', 'TRIBUTARIA'],
      ADMINISTRATIVAS: ['ADMINISTRATIVAS', 'ADMINISTRATIVA'],
      ADMINISTRATIVA: ['ADMINISTRATIVAS', 'ADMINISTRATIVA'],
      BANCARIA: ['BANCARIA'],
    };
    if (auctionTypes) {
      const typeList = auctionTypes.split(',').map(t => t.trim().toUpperCase());
      const dbTypeSet = new Set<string>();
      for (const t of typeList) {
        const expanded = TYPE_QUERY_TO_DB[t];
        if (expanded) expanded.forEach((v) => dbTypeSet.add(v));
        else dbTypeSet.add(t); // unknown — pass through, never crash the query
      }
      const dbTypes = Array.from(dbTypeSet);
      if (dbTypes.length > 0) {
        sql += ` AND auctionType IN (${dbTypes.map(() => '?').join(', ')})`;
        params.push(...dbTypes);
      }
    } else if (auctionType) {
      const upper = auctionType.toUpperCase();
      const expanded = TYPE_QUERY_TO_DB[upper] ?? [upper];
      sql += ` AND auctionType IN (${expanded.map(() => '?').join(', ')})`;
      params.push(...expanded);
    }
    
    // FORGE 2026-06-02: snapshot AFTER status/type filters, BEFORE cursor and
    // pagination. This is the canonical "list predicate" used by the totalCount
    // query so the badge and totalCount reconcile against the SAME row set.
    const preCursorSqlLen = sql.length;
    const preCursorParamsLen = params.length;

    // Cursor-based pagination — cursor semantics depend on active sort.
    //
    // FORGE 2026-06-02 (P1 null-tail reachability fix):
    //   endsAt_asc cursor was previously `endsAt > ?` with `endsAt IS NOT NULL`,
    //   which permanently stranded the NULLS-LAST tail (46 SUSPENDIDA rows with
    //   null endsAt today): they were counted but unreachable by scrolling.
    //   Cursor now encodes BOTH endsAt and id as `<isoOrNULL>|<uuid>` (URL-safe,
    //   pipe-delimited) so we can correctly keyset across the null boundary.
    //
    //   The cursor format is backward-compatible: a legacy plain-ISO cursor
    //   (no pipe) is parsed as `<iso>|""` and we fall back to the old
    //   `endsAt > ?` predicate; the new format adds the null-tail predicate.
    //
    //   published_desc unchanged (no null tail — publishedAt is NOT NULL).
    //   price_asc/desc cursor pagination unsupported (use page=/OFFSET).
    //
    // FORGE 2026-06-02 (P1 page-fallback):
    //   The UI sends `page=` (not `cursor=`) on infinite scroll, so even with
    //   the cursor fix above, exhaustion was impossible on endsAt_asc /
    //   published_desc — no OFFSET was being appended on those sorts. We now
    //   fall back to OFFSET whenever a cursor-capable sort is paginated by
    //   page= alone. Both strategies share the same deterministic ORDER BY
    //   (`endsAt ASC NULLS LAST, id ASC` etc.) so they remain consistent and
    //   both reach the null tail.
    let usingOffset = false;
    if (cursor && sortPlan.cursorMode === 'endsAt') {
      const parsed = parseEndsAtCursor(cursor);
      if (parsed.kind === 'legacy') {
        // Old plain-ISO cursor — keep prior semantics for in-flight clients,
        // BUT relax `IS NOT NULL` so the null tail becomes reachable once the
        // future-endsAt rows are exhausted.
        sql += ' AND ("endsAt" > ? OR "endsAt" IS NULL)';
        params.push(parsed.endsAt);
      } else if (parsed.kind === 'nonNull') {
        // Standard 2-column keyset under ORDER BY endsAt ASC NULLS LAST, id ASC.
        sql += ' AND ("endsAt" > ? OR ("endsAt" = ? AND id > ?) OR "endsAt" IS NULL)';
        params.push(parsed.endsAt, parsed.endsAt, parsed.id);
      } else {
        // parsed.kind === 'null' — we're already inside the NULL tail.
        sql += ' AND "endsAt" IS NULL AND id > ?';
        params.push(parsed.id);
      }
    } else if (cursor && sortPlan.cursorMode === 'publishedAt') {
      sql += ' AND "publishedAt" < ?';
      params.push(cursor);
    } else if (sortPlan.cursorMode === 'offset') {
      // Price sorts: fall back to LIMIT/OFFSET pagination using the existing
      // `page` param. Do NOT honor cursor here — it would silently misalign.
      usingOffset = true;
    } else if (!cursor && page > 1 && (sortPlan.cursorMode === 'endsAt' || sortPlan.cursorMode === 'publishedAt')) {
      // FORGE 2026-06-02: UI sends ?page=N without a cursor on infinite scroll.
      // Without OFFSET that would return page 1 forever on endsAt_asc /
      // published_desc. Fall through to OFFSET pagination for backward compat;
      // the deterministic ORDER BY (with id tiebreak) keeps pages stable.
      usingOffset = true;
    }

    // Whitelisted ORDER BY (safe; never interpolates user input)
    sql += ` ORDER BY ${sortPlan.orderBy}`;
    if (radiusActive) {
      // The radius ORDER BY embeds DISTANCE_KM_SQL — bind its 3 placeholders
      // (nearLat, nearLat, nearLng) here, in string order, BEFORE the LIMIT
      // bind below. These sit past preCursorParamsLen so the count/teaser
      // predicate slices are unaffected.
      params.push(nearLat, nearLat, nearLng);
    }

    // Add limit (+1 to detect hasMore) and optional offset for price sorts
    sql += ' LIMIT ?';
    params.push(safeLimit + 1);
    if (usingOffset && offset > 0) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
    
    // Execute query
    const queryStart = Date.now();
    const auctions = await query<AuctionFromDB>(sql, params);
    const queryTime = Date.now() - queryStart;
    
    // Check if there are more results
    const hasMore = auctions.length > safeLimit;
    const results = hasMore ? auctions.slice(0, safeLimit) : auctions;

    // Next cursor — depends on sort. Null for price sorts (offset-only).
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const last = results[results.length - 1];
      if (sortPlan.cursorMode === 'endsAt') {
        // FORGE 2026-06-02: encode endsAt + id so we can keyset across the
        // NULLS-LAST boundary. `last.endsAt === null` is no longer a dead-end;
        // it advances inside the null tail by id.
        nextCursor = encodeEndsAtCursor(last.endsAt, last.id);
      } else if (sortPlan.cursorMode === 'publishedAt') {
        nextCursor = last.publishedAt;
      }
    }

    // Get total count (only if needed for pagination UI).
    //
    // FORGE 2026-06-02: the COUNT runs against the snapshot AT preCursorSqlLen
    // — i.e. base + non-status filters + status filter, NOT cursor or
    // pagination. This is the canonical "list predicate" and the same one we
    // reuse below for teaserCounts so the badge and totalCount can never drift
    // again. (The prior implementation tail-stripped LIMIT/OFFSET from the
    // already-mutated `sql` string, which silently included whatever cursor
    // was applied — wrong on the first paginated request.)
    // Helper to strip the SELECT-list prefix off a snapshot of `sql` so we
    // can reuse the predicate inside a COUNT query. The previous regex
    // (`/^SELECT \* FROM Auction WHERE /`) broke when the document-archive
    // wave widened the SELECT list with the `hasDocuments` EXISTS subquery
    // (2026-06-03) — we now anchor on the stable `WHERE 1=1` boundary that
    // every predicate snapshot includes.
    const PREDICATE_BOUNDARY = 'WHERE 1=1';
    const stripPredicate = (snapshot: string): string => {
      const idx = snapshot.indexOf(PREDICATE_BOUNDARY);
      // Defensive: if the boundary disappears in a future refactor, fall
      // back to passing the whole snapshot through so the COUNT can still
      // be debugged from logs rather than silently returning garbage.
      return idx === -1 ? snapshot : snapshot.slice(idx);
    };

    let totalCount: number | null = null;
    if (page === 1) {
      const listPredicateSql = sql.slice(0, preCursorSqlLen);
      const listPredicateParams = params.slice(0, preCursorParamsLen);
      const countSql = `SELECT COUNT(*) as count FROM Auction ${stripPredicate(listPredicateSql)}`;
      const countRow = await queryOne<{ count: string | number }>(countSql, listPredicateParams);
      // PG returns COUNT(*) as bigint -> string; coerce.
      totalCount = countRow ? Number(countRow.count) : 0;
    }
    
    // Apply tier-based masking
    const maskStart = Date.now();
    const maskedAuctions = applyTierMasking(results, tier, hasActiveTrial);
    const maskTime = Date.now() - maskStart;
    
    // Get teaser counts for guests.
    //
    // FORGE 2026-06-02 (P1 count-vs-list reconciliation):
    // The badge counts now reuse the SAME base predicate as the list
    // (province junk filter + province=, category, categories, advanced
    // filters, auction type — everything EXCEPT status), so the badge
    // numbers always match what the user can actually browse to. The status
    // set is the only thing that varies per badge.
    //
    // Canonical predicate = list base (preStatusSqlLen snapshot) AND
    //                       status IN (<badge's status set>)
    //
    // For ?status=active specifically: badge "active" → SAME 4-status set the
    // list uses → identical row set → teaserCounts.active === totalCount.
    let teaserCounts = null;
    if (tier === 'GUEST' && page === 1) {
      const basePredicateSql = sql.slice(0, preStatusSqlLen);
      const basePredicateParams = params.slice(0, preStatusParamsLen);
      const baseWhere = stripPredicate(basePredicateSql);

      // Per-badge count helper. `withClockGuard=true` appends the canonical
      // ACTIVE_CLOCK_GUARD_SQL so the active badge sees the SAME rows as the
      // `?status=active` list (both drop CELEBRANDOSE rows whose endsAt has
      // passed). Pre-auction badge does NOT need the clock guard (those
      // auctions haven't started — they have no "has it ended" question).
      const countWithStatus = async (
        statusSet: readonly string[],
        withClockGuard: boolean,
      ): Promise<number> => {
        const placeholders = statusSet.map(() => '?').join(', ');
        const clock = withClockGuard ? ` AND ${ACTIVE_CLOCK_GUARD_SQL}` : '';
        const countSql = `SELECT COUNT(*) as count FROM Auction ${baseWhere} AND status IN (${placeholders})${clock}`;
        const row = await queryOne<{ count: string | number }>(
          countSql,
          [...basePredicateParams, ...statusSet],
        );
        return row ? Number(row.count) : 0;
      };

      const [active, preAuction] = await Promise.all([
        countWithStatus(ACTIVE_DB_STATUSES, true),
        countWithStatus(PRE_AUCTION_DB_STATUSES, false),
      ]);

      teaserCounts = { active, preAuction };
    }

    const response = {
      success: true,
      data: maskedAuctions,
      count: maskedAuctions.length,
      pagination: {
        page,
        limit: safeLimit,
        hasMore,
        nextCursor,
        totalCount
      },
      teaserCounts,
      userTier: tier,
      performance: {
        total: Date.now() - startTime,
        query: queryTime,
        masking: maskTime
      }
    };
    
    // Cache the response
    auctionCache.set(cacheKey, response, 30000); // 30 second cache
    
    console.log(`✅ Auctions loaded in ${Date.now() - startTime}ms (query: ${queryTime}ms, masking: ${maskTime}ms)`);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching auctions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch auctions', 
        details: error instanceof Error ? error.message : String(error),
        performance: { total: Date.now() - startTime }
      },
      { status: 500 }
    );
  }
}
