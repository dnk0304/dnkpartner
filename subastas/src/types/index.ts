// New BOE-accurate status values
export type AuctionStatus = 
  | 'proxima-apertura'   // Pre-auction (Prox. apertura)
  | 'celebrandose'       // Currently active
  | 'suspendida'         // Suspended
  | 'cancelada'          // Cancelled
  | 'concluida-portal'   // Concluded in Portal de Subastas
  | 'finalizada-autoridad' // Finished by Managing Authority
  // Legacy values for backward compatibility
  | 'active' 
  | 'finished' 
  | 'pre-auction';

// Auction type (Tipo de Subasta) — canonical BOE families.
// Canonical going-forward values match the BOE prefix scraper:
//   judicial / notarial / aeat / otras_tributarias / administrativas.
// Legacy singular forms (tributaria / administrativa) are kept so older
// historical rows keep round-tripping; the API maps both spellings to the
// same DB filter so a chip click matches every row of that family.
export type AuctionType =
  | 'judicial'           // Subastas Judiciales (SUB-JA/JV/JC)
  | 'notarial'           // Subastas Notariales (SUB-NH/NN)
  | 'aeat'               // Agencia Tributaria (SUB-AT)
  | 'otras_tributarias'  // Otras administraciones tributarias (SUB-RC) — canonical new
  | 'administrativas'    // Administrativas generales (SUB-GA) — canonical new
  | 'tributaria'         // Legacy singular — kept for back-compat with older rows
  | 'administrativa'     // Legacy singular — kept for back-compat with older rows
  | 'bancaria';          // Subastas Bancarias

export type AuctionSource = 
  | 'BOE Judiciales'
  | 'Agencia Tributaria'
  | 'Seguridad Social'
  | 'Notariales'
  | 'Ayuntamientos'
  | 'Diputaciones'
  | 'Consejos Comarcales'
  | 'Agencias Tributarias'
  | 'Ad. Generales'
  | 'BOE'  // Legacy
  | 'TEJU'; // Legacy

export type AuctionCategory = 
  // Real Estate
  | 'Viviendas' 
  | 'Garajes' 
  | 'Trasteros' 
  | 'Terrenos' 
  | 'Locales' 
  | 'Fincas rústicas' 
  | 'Naves industriales' 
  | 'Otros inmuebles'
  // Movable Assets
  | 'Turismos' 
  | 'Motocicletas' 
  | 'Vehículos Industriales' 
  | 'Barcos' 
  | 'Maquinaria' 
  | 'Joyas' 
  | 'Arte';

export interface AuctionItem {
  id: string;
  title: string;
  category: AuctionCategory;
  province: string;
  community: string;
  currentBid: number | null;
  appraisalValue: number | null;
  minimumBid?: number | null;
  // Cantidad reclamada — the amount being claimed. Populated on ~30% of
  // active rows overall (uneven by auctionType — NOTARIAL 100%, AEAT ~0.6%).
  // Card UIs gate on `claimedAmount && claimedAmount > 0` and render
  // "Cantidad reclamada" as a secondary line; omit the line entirely when
  // absent (no orphan "—" cell).
  claimedAmount?: number | null;
  courtName?: string | null;
  procedureNumber?: string | null;
  boeLink?: string | null;
  edictUrl?: string | null;
  pdfUrl?: string | null;
  status: AuctionStatus;
  auctionType?: AuctionType; // Tipo de Subasta
  // 2026-06-03 (Pixel cards): opensAt + propertyType are declared together
  // with the document-archive bien fields lower in this interface (see
  // "Document-archive wave" block) so the full doc-UI contract lives in one
  // place. Kept as a single source of truth — no duplicates here.
  endDate: Date; // For urgency calculation
  source: string; // Changed to string to support all AuctionSource values
  imageUrl: string;
  isLocked?: boolean; // For tiered access control
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  courtReference?: string | null;
  originalSource?: string | null;
  transitionedAt?: Date | null;
  municipality?: string | null;
  // Google Maps URLs
  mapUrl?: string | null;
  streetViewUrl?: string | null;
  placeUrl?: string | null;
  directionsUrl?: string | null;
  // Detail fields
  generalInfo?: string | null;
  warning?: string | null;
  propertyDescription?: string | null;
  lotDescription?: string | null;
  chargesDetail?: string | null;
  // #16 — pujas / bids (parsed from BOE "Pujas" tab).
  //   pujaStatus       : 'CON_PUJA' | 'SIN_PUJA' | null (null = unscraped)
  //   currentBidAmount : highest bid in EUROS (server already converts the
  //                      BIGINT-cents column to a finite number). Null when
  //                      BOE hides the figure behind login but bids exist.
  pujaStatus?: 'CON_PUJA' | 'SIN_PUJA' | string | null;
  currentBidAmount?: number | null;
  // #17 — Situación posesoria.
  //   'OCUPADO' | 'NO_OCUPADO' | 'NO_CONSTA' | null (null = unscraped).
  occupancy?: 'OCUPADO' | 'NO_OCUPADO' | 'NO_CONSTA' | string | null;
  /**
   * Referencia catastral — the 20-character Spanish cadastral identifier.
   * Only ~2.5% of active rows currently carry a value (the BOE-gazette
   * enrichment was shelved at low yield); when present, the detail surface
   * renders a "Ver en Catastro" external link via `buildCatastroUrl()`.
   * Null on the 97.5% of rows without one.
   */
  cadastralRef?: string | null;
  // ── Document-archive wave (2026-06-03) ──────────────────────────────────
  /**
   * Official START date ("Fecha de inicio") parsed by the document-archive
   * scraper. ISO 8601 string from the API; renderable through
   * formatDateMed/formatDateShort. Null = not yet scheduled / not scraped —
   * cards hide the start-date slot when null (graceful empty).
   */
  opensAt?: string | null;
  /**
   * Accurate BOE bien-heading type (e.g. "Vivienda", "Garaje", "Trastero",
   * "Inmueble (Trastero)"). When present it drives the card type headline
   * via `prettifyAuctionType()`. Falls back to `category` when null — most
   * pre-backfill rows are still null today.
   */
  propertyType?: string | null;
  /**
   * True when the row has at least one row in AuctionDocument. Drives a
   * compact "documentos" indicator on cards — the full list is fetched by
   * the detail endpoint only (`/api/auctions/[id]`).
   */
  hasDocuments?: boolean | null;
  // ── Bien-detail fields (document-archive scraper) — null-safe ───────────
  postalCode?: string | null;
  idufir?: string | null;
  registryInscription?: string | null;
  legalTitle?: string | null;
  bienLocalidad?: string | null;
  bienProvincia?: string | null;
  viviendaHabitual?: boolean | null;
}

/**
 * AuctionDocument — projected on the detail payload only (NOT on cards).
 * See `/api/auctions/[id]` route. `downloadUrl` is `/api/auction-doc/<id>`
 * when a local copy exists, else null → consumer must fall back to
 * `officialUrl` (the BOE source link).
 */
export interface AuctionDocument {
  id: string;
  docType: string;
  title: string | null;
  kind: string;
  officialUrl: string | null;
  downloadUrl: string | null;
}

export type UserTier = 'free' | 'gold' | 'diamond';
