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

// Auction type (Tipo de Subasta)
export type AuctionType = 
  | 'judicial'        // Subastas Judiciales (courts)
  | 'notarial'        // Subastas Notariales
  | 'aeat'            // Agencia Tributaria
  | 'tributaria'      // Otras administraciones tributarias
  | 'administrativa'  // Subastas administrativas generales
  | 'bancaria';       // Subastas Bancarias

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
}

export type UserTier = 'free' | 'gold' | 'diamond';
