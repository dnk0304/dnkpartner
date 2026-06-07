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
  // Movable Assets — Wave C1a (2026-06-07) widened to include real DB labels
  // for vehicles that Ghost produces (`Camiones`, `Embarcaciones`,
  // `Otros vehículos`). These were missing so the "Últimos vehículos" row
  // dropped Camiones (9 active) + Otros vehículos (16) + Embarcaciones
  // rows entirely.
  | 'Turismos'
  | 'Motocicletas'
  | 'Vehículos Industriales'
  | 'Camiones'
  | 'Barcos'
  | 'Embarcaciones'
  | 'Otros vehículos'
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
  // Tasación — the official appraisal value (`Tasación`). After Ghost's
  // 2026-06-04 three-values split (commit `443a864`), this field carries
  // ONLY the BOE "Tasación" figure — the previously-conflated "Valor subasta"
  // moved to its own column (`valorSubasta` below). Honest-NULL: omit when
  // absent, never coerce to 0.
  appraisalValue: number | null;
  // Valor subasta — DISTINCT from `appraisalValue` (Tasación). BOE judicial
  // pages routinely render "Tasación 0,00 €" while carrying the real reference
  // figure under "Valor subasta"; the scraper now stores the two SEPARATELY so
  // cards can show Tasación + Valor subasta + Cantidad reclamada as three
  // distinct numbers. Honest-NULL: omit when absent (never 0).
  valorSubasta?: number | null;
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
   * Suspended-auction resume date — populated by the suspended-scraper
   * (`SuspendedScraper` writes `Auction.resumeAt` when the courts publish
   * a "fecha prevista de reanudación"). Null on every non-SUSPENDIDA row
   * and on suspended rows where the date is unknown ("Fecha por confirmar").
   *
   * Wave52 status-DATES wiring (Pixel 2026-06-04): the card date line for
   * a SUSPENDIDA row renders "Fecha prevista de reanudación: <resumeAt>"
   * or "· Fecha por confirmar" when null — NEVER endsAt / a fake countdown.
   */
  resumeAt?: string | null;
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
  // ── Vehicle fields (wave E2, 2026-06-07) — null on non-VEHICLE rows and
  // on VEHICLE rows pre-backfill. The card-title helper renders
  // "{Tipo} - {make} {model} en {town}" when make+model are present and
  // falls back to "{Tipo} en {town}" otherwise (graceful empty — never an
  // orphan dash). vehicleYear is a 4-digit Int (e.g. 2018), never a 2-digit
  // shorthand; the detail page may render it alongside make/model. ────────
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
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
