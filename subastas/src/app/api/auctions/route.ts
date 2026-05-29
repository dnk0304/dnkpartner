import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { query, queryOne } from '@/lib/db';
import { UserTier } from '@/types';
import { generateMapImageUrl, getOptimalZoom } from '@/lib/map-image';
import { getVehicleCategoryImageUrl } from '@/lib/vehicle-images';
import { getPropertyCategoryImageUrl } from '@/lib/property-images';
import { auctionCache } from '@/lib/cache';

const normalizeText = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

// New BOE-accurate status values
type DBStatus = 
  | 'PROXIMA_APERTURA' | 'CELEBRANDOSE' | 'SUSPENDIDA' | 'CANCELADA' | 'CONCLUIDA_PORTAL' | 'FINALIZADA_AUTORIDAD'
  // Legacy values
  | 'ACTIVE' | 'FINISHED' | 'PRE_AUCTION' | 'SUSPENDED' | 'CANCELLED';

// Auction type values
type DBAuctionType = 'JUDICIAL' | 'NOTARIAL' | 'AEAT' | 'TRIBUTARIA' | 'ADMINISTRATIVA' | 'BANCARIA';

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
  currentBid: number | null;
  minimumBid: number | null;
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
}

// Map DB status to frontend status
function mapStatus(dbStatus: DBStatus): string {
  const statusMap: Record<DBStatus, string> = {
    // New BOE-accurate statuses
    'PROXIMA_APERTURA': 'proxima-apertura',
    'CELEBRANDOSE': 'celebrandose',
    'SUSPENDIDA': 'suspendida',
    'CANCELADA': 'cancelada',
    'CONCLUIDA_PORTAL': 'concluida-portal',
    'FINALIZADA_AUTORIDAD': 'finalizada-autoridad',
    // Legacy statuses (map to new ones)
    'PRE_AUCTION': 'proxima-apertura',
    'ACTIVE': 'celebrandose',
    'FINISHED': 'concluida-portal',
    'SUSPENDED': 'suspendida',
    'CANCELLED': 'cancelada'
  };
  return statusMap[dbStatus] || 'celebrandose';
}

// Map DB auction type to frontend auction type
function mapAuctionType(dbType: DBAuctionType | null): string | undefined {
  if (!dbType) return undefined;
  const typeMap: Record<DBAuctionType, string> = {
    'JUDICIAL': 'judicial',
    'NOTARIAL': 'notarial',
    'AEAT': 'aeat',
    'TRIBUTARIA': 'tributaria',
    'ADMINISTRATIVA': 'administrativa',
    'BANCARIA': 'bancaria'
  };
  return typeMap[dbType];
}

// Check if status represents a finished state
function isFinishedStatus(dbStatus: DBStatus): boolean {
  return ['FINISHED', 'CONCLUIDA_PORTAL', 'FINALIZADA_AUTORIDAD', 'CANCELLED', 'CANCELADA'].includes(dbStatus);
}

// Check if status represents an active state
function isActiveStatus(dbStatus: DBStatus): boolean {
  return ['ACTIVE', 'CELEBRANDOSE', 'SUSPENDED', 'SUSPENDIDA'].includes(dbStatus);
}

// Check if status represents a pre-auction state
function isPreAuctionStatus(dbStatus: DBStatus): boolean {
  return ['PRE_AUCTION', 'PROXIMA_APERTURA'].includes(dbStatus);
}

// Property categories that should use Street View or map images
const PROPERTY_CATEGORIES = ['Viviendas', 'Locales', 'Terrenos', 'Garajes', 'Trasteros', 'Fincas rústicas', 'Naves industriales', 'Otros inmuebles'];

// Vehicle categories that should use generated vehicle images
const VEHICLE_CATEGORIES = ['Turismos', 'Motocicletas', 'Vehículos Industriales', 'Barcos'];

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
function getAppropriateImageUrl(item: AuctionFromDB): string {
  const zoom = getOptimalZoom(item.category);
  const safeStreetviewPath = item.boeId
    ? `/streetview/${item.boeId.replace(/[^a-zA-Z0-9_-]+/g, '_')}.jpg`
    : null;
  const isActiveOrPreAuction = ['ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA'].includes(item.status);

  const streetviewFileExists = (publicPath: string | null): boolean => {
    if (!publicPath || !publicPath.startsWith('/streetview/')) return false;
    const absolutePath = path.join(process.cwd(), 'public', publicPath.replace(/^\/+/, ''));
    return fs.existsSync(absolutePath);
  };

  const hasValidLocalImage = (publicPath: string | null): boolean => {
    if (!publicPath) return false;
    if (!publicPath.startsWith('/streetview/')) return true;
    return streetviewFileExists(publicPath);
  };

  const storedStreetviewImage = item.imageUrl && item.imageUrl.startsWith('/streetview/') && streetviewFileExists(item.imageUrl)
    ? item.imageUrl
    : null;
  const storedStreetviewUrl = item.streetViewUrl && item.streetViewUrl.startsWith('/streetview/') && streetviewFileExists(item.streetViewUrl)
    ? item.streetViewUrl
    : null;
  const storedImageUrl = item.imageUrl && !item.imageUrl.includes('unsplash.com') && !item.imageUrl.includes('images.unsplash') && hasValidLocalImage(item.imageUrl)
    ? item.imageUrl
    : null;

  // Property auctions - prioritize Street View screenshot for active/pre-auction cards
  if (PROPERTY_CATEGORIES.includes(item.category)) {
    if (isActiveOrPreAuction) {
      if (storedStreetviewImage) return storedStreetviewImage;
      if (storedStreetviewUrl) return storedStreetviewUrl;
      if (safeStreetviewPath && streetviewFileExists(safeStreetviewPath)) {
        return safeStreetviewPath;
      }
      // If coordinates available, show map with pinpoint; otherwise show property-type image
      if (item.latitude && item.longitude) {
        return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
      }
      return getPropertyCategoryImageUrl(item.category);
    }

    // Non-active/pre: fall back to stored image or map (if coords) or property-type image
    if (storedImageUrl) {
      return storedImageUrl;
    }
    if (item.latitude && item.longitude) {
      return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
    }
    return getPropertyCategoryImageUrl(item.category);
  }
  
  // Vehicle auctions - use category-based placeholders
  if (VEHICLE_CATEGORIES.includes(item.category)) {
    return getVehicleCategoryImageUrl(item.category);
  }
  
  // Fallback for other categories
  const fallbackImageUrl = hasValidLocalImage(item.imageUrl) ? item.imageUrl : null;
  if (fallbackImageUrl) return fallbackImageUrl;
  if (item.latitude && item.longitude) {
    return generateMapImageUrl(item.latitude, item.longitude, 800, 600, zoom);
  }
  return getPropertyCategoryImageUrl('Otros inmuebles');
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

  if (isLocked) {
    // Locked teaser
    return {
      id: item.id,
      title: `🔒 ${item.title}`,
      category: item.category,
      province: item.province,
      municipality: item.municipality,
      community: 'Canarias',
      currentBid: null,
      appraisalValue,
      minimumBid: null,
      courtName: null,
      procedureNumber: null,
      boeLink: null,
      edictUrl: null,
      pdfUrl: null,
      status: frontendStatus,
      auctionType: frontendAuctionType,
      endDate: endsAt || new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      source: (item.source || 'BOE') as 'BOE' | 'TEJU',
      imageUrl,
      isLocked: true,
      address: null,
      latitude: item.latitude,
      longitude: item.longitude,
      // Map URLs - null for locked
      mapUrl: null,
      streetViewUrl: null,
      placeUrl: null,
      directionsUrl: null,
      generalInfo,
      warning,
      propertyDescription: item.propertyDescription,
      lotDescription: item.lotDescription,
      chargesDetail: item.chargesDetail
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
    minimumBid: item.minimumBid,
    courtName: item.courtName,
    procedureNumber: item.procedureNumber,
    boeLink: item.boeLink,
    edictUrl: item.edictUrl,
    pdfUrl: item.pdfUrl,
    status: frontendStatus,
    auctionType: frontendAuctionType,
    endDate: endsAt || publishedAt,
    source: (item.source || 'BOE') as 'BOE' | 'TEJU',
    imageUrl,
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
    chargesDetail: item.chargesDetail
  };
}

function applyTierMasking(auctions: AuctionFromDB[], userTier: UserTier | 'GUEST', hasActiveTrial: boolean = false) {
  const maskedList: any[] = [];
  const activePerMunicipality: Map<string, number> = new Map();

  for (const item of auctions) {
    // A. Finished/cancelled - always show to everyone
    if (isFinishedStatus(item.status)) {
      maskedList.push(transformAuction(item, userTier, false));
      continue;
    }

    // B. Suspended - show but mark appropriately
    if (item.status === 'SUSPENDED' || item.status === 'SUSPENDIDA') {
      maskedList.push(transformAuction(item, userTier, false));
      continue;
    }

    // C. GUEST users - LOGIN DISABLED: show everything unlocked
    // TODO: Re-enable guest masking after auction system is fully working
    if (userTier === 'GUEST') {
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

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const province = searchParams.get('province');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const statuses = searchParams.get('statuses'); // Support multiple statuses
    const auctionType = searchParams.get('auctionType');
    const auctionTypes = searchParams.get('auctionTypes'); // Support multiple types
    const tierParam = searchParams.get('tier');
    const userIdParam = searchParams.get('userId');
    
    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor'); // For cursor-based pagination
    
    // Validate pagination
    const safeLimit = Math.min(Math.max(limit, 1), 100); // Max 100 per page
    const offset = (page - 1) * safeLimit;
    
    const tier = (tierParam || 'GUEST') as UserTier | 'GUEST';
    
    // Create cache key
    const cacheKey = {
      province: province || 'all',
      category: category || 'all',
      status: status || 'all',
      statuses: statuses || 'all',
      auctionType: auctionType || 'all',
      auctionTypes: auctionTypes || 'all',
      tier,
      page,
      limit: safeLimit,
      cursor: cursor || 'none'
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
        const user = queryOne<{ trialEndDate: string | null }>(`
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

    // Build optimized SQL query with filters at database level
    let sql = `SELECT * FROM Auction WHERE 1=1
      AND province IS NOT NULL
      AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
      AND LENGTH(TRIM(province)) > 1`;
    const params: any[] = [];
    
    // Apply filters
    if (province) {
      const normalizedProvince = normalizeText(province);
      const dbProvinces = query<{ province: string }>(
        'SELECT DISTINCT province FROM Auction WHERE province IS NOT NULL',
        []
      );
      const provinceMatches = dbProvinces
        .map((row) => row.province)
        .filter((value) => normalizeText(value) === normalizedProvince);

      if (provinceMatches.length > 0) {
        sql += ` AND province IN (${provinceMatches.map(() => '?').join(',')})`;
        params.push(...provinceMatches);
      } else {
        sql += ' AND LOWER(province) = LOWER(?)';
        params.push(province);
      }
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    
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
      // Legacy single status support
      if (status === 'active') {
        sql += ' AND status IN (?, ?, ?, ?)';
        params.push('ACTIVE', 'SUSPENDED', 'CELEBRANDOSE', 'SUSPENDIDA');
      } else if (status === 'finished') {
        sql += ' AND status IN (?, ?, ?, ?, ?)';
        params.push('FINISHED', 'CANCELLED', 'CONCLUIDA_PORTAL', 'FINALIZADA_AUTORIDAD', 'CANCELADA');
      } else if (status === 'pre-auction') {
        sql += ' AND status IN (?, ?)';
        params.push('PRE_AUCTION', 'PROXIMA_APERTURA');
      }
    }
    
    // Filter by auction type
    if (auctionTypes) {
      const typeList = auctionTypes.split(',').map(t => t.trim().toUpperCase());
      if (typeList.length > 0) {
        sql += ` AND auctionType IN (${typeList.map(() => '?').join(', ')})`;
        params.push(...typeList);
      }
    } else if (auctionType) {
      sql += ' AND auctionType = ?';
      params.push(auctionType.toUpperCase());
    }
    
    // Cursor-based pagination (faster for large datasets)
    if (cursor) {
      sql += ' AND publishedAt < ?';
      params.push(cursor);
    }
    
    // Order by publishedAt (uses index)
    sql += ' ORDER BY publishedAt DESC';
    
    // Add limit for pagination
    sql += ' LIMIT ?';
    params.push(safeLimit + 1); // Fetch one extra to check if there are more results
    
    // Execute query
    const queryStart = Date.now();
    const auctions = query<AuctionFromDB>(sql, params);
    const queryTime = Date.now() - queryStart;
    
    // Check if there are more results
    const hasMore = auctions.length > safeLimit;
    const results = hasMore ? auctions.slice(0, safeLimit) : auctions;
    
    // Get next cursor (last item's publishedAt)
    const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].publishedAt : null;
    
    // Get total count (only if needed for pagination UI)
    let totalCount = null;
    if (page === 1) {
      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count')
                          .replace(/ORDER BY.*/, '')
                          .replace(/LIMIT.*/, '');
      const countParams = params.slice(0, -1); // Remove LIMIT param
      totalCount = queryOne<{ count: number }>(countSql, countParams)?.count || 0;
    }
    
    // Apply tier-based masking
    const maskStart = Date.now();
    const maskedAuctions = applyTierMasking(results, tier, hasActiveTrial);
    const maskTime = Date.now() - maskStart;
    
    // Get teaser counts for guests
    let teaserCounts = null;
    if (tier === 'GUEST' && page === 1) {
      const activeCount = queryOne<{ count: number }>(`
        SELECT COUNT(*) as count FROM Auction WHERE status IN ('ACTIVE', 'SUSPENDED', 'CELEBRANDOSE', 'SUSPENDIDA')
      `, [])?.count || 0;
      
      const preAuctionCount = queryOne<{ count: number }>(`
        SELECT COUNT(*) as count FROM Auction WHERE status IN ('PRE_AUCTION', 'PROXIMA_APERTURA')
      `, [])?.count || 0;
      
      teaserCounts = {
        active: activeCount,
        preAuction: preAuctionCount
      };
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
