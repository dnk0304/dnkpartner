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
  courtName?: string | null;
  procedureNumber?: string | null;
  boeLink?: string | null;
  edictUrl?: string | null;
  pdfUrl?: string | null;
  status: AuctionStatus;
  auctionType?: AuctionType; // Tipo de Subasta
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
}

export type UserTier = 'free' | 'gold' | 'diamond';
