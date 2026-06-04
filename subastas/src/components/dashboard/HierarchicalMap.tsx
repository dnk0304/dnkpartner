'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AuctionItem } from '@/types';
import { MapPin, ArrowLeft, Layers } from 'lucide-react';
import { ALL_PROVINCES } from '@/lib/constants';
import { capitalizeLocation } from '@/lib/utils';

interface HierarchicalMapProps {
  items: AuctionItem[];
  onMarkerClick?: (item: AuctionItem) => void;
  onProvinceClick?: (province: string) => void;
  onBackToProvinces?: () => void;
  onBackToMunicipalities?: () => void;
}

type ViewLevel = 'province' | 'municipality' | 'auction';

interface ProvinceData {
  name: string;
  count: number;
  activeCount: number;
  preAuctionCount: number;
  finishedCount: number;
  center: [number, number];
  auctions: AuctionItem[];
}

interface MunicipalityData {
  name: string;
  province: string;
  count: number;
  activeCount: number;
  preAuctionCount: number;
  center: [number, number];
  auctions: AuctionItem[];
  hasCoords: boolean;
}

// Spain provinces with approximate coordinates
const PROVINCE_COORDS: Record<string, [number, number]> = {
  'a coruna': [43.3713, -8.3960],
  'alava': [42.8467, -2.6724],
  'albacete': [38.9943, -1.8585],
  'alicante': [38.3452, -0.4810],
  'almeria': [36.8402, -2.4681],
  'asturias': [43.3614, -5.8593],
  'avila': [40.6566, -4.6981],
  'badajoz': [38.8794, -6.9707],
  'barcelona': [41.3851, 2.1734],
  'bizkaia': [43.2630, -2.9350],
  'burgos': [42.3439, -3.6969],
  'caceres': [39.4753, -6.3724],
  'cadiz': [36.5270, -6.2886],
  'cantabria': [43.1828, -3.9878],
  'castellon': [39.9864, -0.0513],
  'ciudad real': [38.9848, -3.9276],
  'cordoba': [37.8882, -4.7794],
  'cuenca': [40.0704, -2.1374],
  'gipuzkoa': [43.1397, -2.2564],
  'girona': [41.9794, 2.8214],
  'granada': [37.1773, -3.5986],
  'guadalajara': [40.6325, -3.1679],
  'huelva': [37.2614, -6.9447],
  'huesca': [42.1401, -0.4080],
  'illes balears': [39.5696, 2.6502],
  'jaen': [37.7796, -3.7849],
  'la rioja': [42.2871, -2.5396],
  'las palmas': [28.1000, -15.4130],
  'leon': [42.5987, -5.5671],
  'lleida': [41.6176, 0.6200],
  'lugo': [43.0097, -7.5567],
  'madrid': [40.4168, -3.7038],
  'malaga': [36.7213, -4.4214],
  'murcia': [37.9922, -1.1307],
  'navarra': [42.6954, -1.6761],
  'ourense': [42.3405, -7.8632],
  'palencia': [42.0096, -4.5288],
  'pontevedra': [42.4330, -8.6446],
  'salamanca': [40.9701, -5.6635],
  'santa cruz de tenerife': [28.4636, -16.2518],
  'segovia': [40.9429, -4.1088],
  'sevilla': [37.3891, -5.9845],
  'soria': [41.7665, -2.4790],
  'tarragona': [41.1189, 1.2445],
  'teruel': [40.3456, -1.1065],
  'toledo': [39.8628, -4.0273],
  'valencia': [39.4699, -0.3763],
  'valladolid': [41.6523, -4.7245],
  'zamora': [41.5034, -5.7467],
  'zaragoza': [41.6488, -0.8891],
};

const CANARY_PROVINCES = new Set(['Las Palmas', 'Santa Cruz de Tenerife']);
const BALEARIC_PROVINCES = new Set(['Illes Balears']);

const normalizeText = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

const canonicalProvinceLookup = ALL_PROVINCES.reduce<Record<string, string>>((acc, province) => {
  acc[normalizeText(province)] = province;
  return acc;
}, {});

const PROVINCE_ALIASES: Record<string, string> = {
  'vizcaya': 'Bizkaia',
  'guipuzcoa': 'Gipuzkoa',
  'alava': 'Álava',
  'coruna': 'A Coruña',
  'a coruna': 'A Coruña',
  'illes balear': 'Illes Balears',
  'islas baleares': 'Illes Balears',
  'baleares': 'Illes Balears',
  'santa cruz tenerife': 'Santa Cruz de Tenerife',
  'las palmas de gran canaria': 'Las Palmas',
};

const getCanonicalProvince = (province?: string | null) => {
  if (!province) return null;
  const normalized = normalizeText(province);
  if (!normalized || normalized === 'desconocida' || normalized === 'unknown') return null;
  if (PROVINCE_ALIASES[normalized]) return PROVINCE_ALIASES[normalized];
  if (canonicalProvinceLookup[normalized]) return canonicalProvinceLookup[normalized];
  return capitalizeLocation(province);
};

const getProvinceCoordKey = (province: string) => {
  return normalizeText(province);
};

// Province/municipality cluster marker. Size grows with the active-count
// so a glance shows where activity is concentrated. Zero-count clusters
// render in muted grey so empty regions don't pop visually.
//
// Note: previous version had two `display: flex` declarations and the
// invalid CSS token `flex-col;` (a Tailwind class, not a CSS property).
// Browsers silently dropped both and the rendered layout was
// non-deterministic across engines. Reduced to a single clean flex
// container with semantic markup. The shell carries an aria-label so SR
// users hear "N subastas activas" instead of a bare number.
const createProvinceIcon = (active: number) => {
  const size = Math.min(64, Math.max(34, 34 + Math.log(Math.max(active, 1)) * 4));
  const ring = active > 0 ? '#16a34a' : '#94a3b8'; // green-600 / slate-400
  const labelColor = active > 0 ? '#15803d' : '#475569'; // green-700 / slate-600

  return L.divIcon({
    html: `
      <div
        class="province-marker-shell"
        role="button"
        aria-label="${active} subastas activas"
        style="
          width:${size}px;
          height:${size}px;
          border-radius:50%;
          background:${ring};
          box-shadow:0 4px 12px rgba(0,0,0,0.3);
          border:2px solid #ffffff;
          display:flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          transition:transform 0.18s ease-out;
        "
        onmouseover="this.style.transform='scale(1.08)'"
        onmouseout="this.style.transform='scale(1)'"
        onfocus="this.style.transform='scale(1.08)'"
        onblur="this.style.transform='scale(1)'"
      >
        <span style="
          width:${size - 8}px;
          height:${size - 8}px;
          background:#ffffff;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:700;
          font-size:${size > 44 ? '13px' : '11px'};
          color:${labelColor};
          line-height:1;
        ">${active}</span>
      </div>
    `,
    className: 'province-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const getAuctionPinColor = (status: string) => {
  if (['active', 'celebrandose'].includes(status)) return '#22c55e';
  if (['pre-auction', 'proxima-apertura'].includes(status)) return '#f59e0b';
  if (['suspendida'].includes(status)) return '#eab308';
  if (['cancelada'].includes(status)) return '#ef4444';
  return '#6b7280';
};

const createAuctionIcon = (status: string) => {
  const color = getAuctionPinColor(status);
  return L.divIcon({
    html: `
      <div style="display:flex;align-items:center;justify-content:center;">
        <svg width="28" height="36" viewBox="0 0 24 32" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3))">
          <path d="M12 0C7.6 0 4 3.6 4 8c0 5.4 8 16 8 16s8-10.6 8-16c0-4.4-3.6-8-8-8z" fill="${color}"/>
          <circle cx="12" cy="8" r="5" fill="white"/>
        </svg>
      </div>
    `,
    className: 'auction-marker',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  });
};

// Format price
const formatPrice = (price: number | null) => {
  if (price === null) return '---';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(price);
};

const getCategoryBreakdown = (auctions: AuctionItem[]) => {
  const counts = new Map<string, number>();
  auctions.forEach((auction) => {
    if (!auction.category) return;
    counts.set(auction.category, (counts.get(auction.category) || 0) + 1);
  });

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const getPriceRange = (auctions: AuctionItem[]) => {
  const values = auctions
    .map((auction) => auction.appraisalValue)
    .filter((value): value is number => typeof value === 'number' && value > 0);

  if (values.length === 0) {
    return 'Sin tasación';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return formatPrice(min);
  }

  return `${formatPrice(min)} - ${formatPrice(max)}`;
};

const getJitteredCenter = (base: [number, number], label: string, radius: number = 0.25): [number, number] => {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash << 5) - hash + label.charCodeAt(i);
    hash |= 0;
  }

  const angle = Math.abs(hash) % 360;
  const distance = (Math.abs(hash) % 1000) / 1000 * radius;
  const offsetLat = Math.cos((angle * Math.PI) / 180) * distance;
  const offsetLng = Math.sin((angle * Math.PI) / 180) * distance;

  return [base[0] + offsetLat, base[1] + offsetLng];
};

// Map view controller
const MapViewController: React.FC<{ 
  viewLevel: ViewLevel;
  selectedProvince: string | null;
  selectedMunicipality: string | null;
  provinceData: ProvinceData[];
  municipalityData: MunicipalityData[];
}> = ({ viewLevel, selectedProvince, selectedMunicipality, provinceData, municipalityData }) => {
  const map = useMap();

  useEffect(() => {
  if (viewLevel === 'province') {
      // Zoom out to show all Spain
      map.setView([40.4168, -3.7038], 6, { animate: true });
    } else if (viewLevel === 'municipality' && selectedProvince) {
      // Zoom into selected province
      const province = provinceData.find(p => p.name === selectedProvince);
      if (province) {
        map.setView(province.center, 10, { animate: true });
      }
    } else if (viewLevel === 'auction' && selectedMunicipality) {
      const municipality = municipalityData.find(m => m.name === selectedMunicipality);
      if (municipality) {
        map.setView(municipality.center, 14, { animate: true });
      }
    }
    
    setTimeout(() => map.invalidateSize(), 100);
  }, [viewLevel, selectedProvince, selectedMunicipality, map, provinceData, municipalityData]);

  return null;
};

export const HierarchicalMap: React.FC<HierarchicalMapProps> = ({ items, onMarkerClick, onProvinceClick, onBackToProvinces, onBackToMunicipalities }) => {
  const [viewLevel, setViewLevel] = useState<ViewLevel>('province');
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null);

  // Aggregate data by province
  const provinceData = useMemo<ProvinceData[]>(() => {
    const dataMap = new Map<string, ProvinceData>();
    
    items.forEach(item => {
      const canonicalProvince = getCanonicalProvince(item.province);
      if (!canonicalProvince) return;
      
      const provinceKey = getProvinceCoordKey(canonicalProvince);
      const center = PROVINCE_COORDS[provinceKey] || [40.4168, -3.7038];
      
      if (!dataMap.has(canonicalProvince)) {
        dataMap.set(canonicalProvince, {
          name: canonicalProvince,
          count: 0,
          activeCount: 0,
          preAuctionCount: 0,
          finishedCount: 0,
          center,
          auctions: [],
        });
      }
      
      const data = dataMap.get(canonicalProvince)!;
      data.count++;
      data.auctions.push(item);
      
      const isActive = ['active', 'celebrandose', 'suspendida'].includes(item.status);
      const isPre = ['pre-auction', 'proxima-apertura'].includes(item.status);
      
      if (isActive) data.activeCount++;
      else if (isPre) data.preAuctionCount++;
      else data.finishedCount++;
    });
    
    return Array.from(dataMap.values());
  }, [items]);

  const handleProvinceClick = (provinceName: string) => {
    setSelectedProvince(provinceName);
    setSelectedMunicipality(null);
    setViewLevel('municipality');
    onProvinceClick?.(provinceName);
  };

  const handleMunicipalityClick = (municipalityName: string) => {
    setSelectedMunicipality(municipalityName);
    setViewLevel('auction');
  };

  const handleBackToProvinces = () => {
    setSelectedProvince(null);
    setSelectedMunicipality(null);
    setViewLevel('province');
    onBackToProvinces?.();
  };

  const handleBackToMunicipalities = () => {
    setSelectedMunicipality(null);
    setViewLevel('municipality');
    onBackToMunicipalities?.();
  };

  const provinceAuctions = useMemo(() => {
    if (!selectedProvince) return [];
    return provinceData.find(p => p.name === selectedProvince)?.auctions || [];
  }, [selectedProvince, provinceData]);

  const municipalityData = useMemo<MunicipalityData[]>(() => {
    if (!selectedProvince) return [];
    const dataMap = new Map<string, {
      name: string;
      province: string;
      count: number;
      activeCount: number;
      preAuctionCount: number;
      sumLat: number;
      sumLng: number;
      coordCount: number;
      auctions: AuctionItem[];
    }>();

    provinceAuctions.forEach(item => {
      const municipalityLabel = item.municipality && item.municipality.toLowerCase() !== 'desconocida'
        ? capitalizeLocation(item.municipality)
        : 'Sin municipio';

      const key = normalizeText(municipalityLabel);
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          name: municipalityLabel,
          province: selectedProvince,
          count: 0,
          activeCount: 0,
          preAuctionCount: 0,
          sumLat: 0,
          sumLng: 0,
          coordCount: 0,
          auctions: [],
        });
      }

      const entry = dataMap.get(key)!;
      entry.count++;
      entry.auctions.push(item);

      const isActive = ['active', 'celebrandose', 'suspendida'].includes(item.status);
      const isPre = ['pre-auction', 'proxima-apertura'].includes(item.status);
      if (isActive) entry.activeCount++;
      else if (isPre) entry.preAuctionCount++;

      if (item.latitude && item.longitude) {
        entry.sumLat += item.latitude;
        entry.sumLng += item.longitude;
        entry.coordCount += 1;
      }
    });

    const provinceCenter = provinceData.find(p => p.name === selectedProvince)?.center || [40.4168, -3.7038];

    return Array.from(dataMap.values())
      .map((entry) => ({
        name: entry.name,
        province: entry.province,
        count: entry.count,
        activeCount: entry.activeCount,
        preAuctionCount: entry.preAuctionCount,
        center: (entry.coordCount > 0
          ? [entry.sumLat / entry.coordCount, entry.sumLng / entry.coordCount]
          : getJitteredCenter(provinceCenter, `${entry.province}-${entry.name}`)) as [number, number],
        auctions: entry.auctions,
        hasCoords: entry.coordCount > 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [provinceAuctions, selectedProvince, provinceData]);

  const selectedMunicipalityAuctions = useMemo(() => {
    if (!selectedMunicipality) return [];
    const normalized = normalizeText(selectedMunicipality);
    return provinceAuctions.filter(item => {
      const name = item.municipality && item.municipality.toLowerCase() !== 'desconocida'
        ? capitalizeLocation(item.municipality)
        : 'Sin municipio';
      return normalizeText(name) === normalized;
    });
  }, [provinceAuctions, selectedMunicipality]);

  const auctionsWithCoords = useMemo(
    () => selectedMunicipalityAuctions.filter(item => item.latitude && item.longitude),
    [selectedMunicipalityAuctions]
  );

  const islandProvinceData = useMemo(() => {
    const byName = new Map(provinceData.map(p => [p.name, p]));
    const makeProvince = (name: string): ProvinceData => {
      const existing = byName.get(name);
      if (existing) return existing;
      const center = PROVINCE_COORDS[getProvinceCoordKey(name)] || [40.4168, -3.7038];
      return {
        name,
        count: 0,
        activeCount: 0,
        preAuctionCount: 0,
        finishedCount: 0,
        center,
        auctions: [],
      };
    };

    return {
      canary: Array.from(CANARY_PROVINCES).map(makeProvince),
      balearic: Array.from(BALEARIC_PROVINCES).map(makeProvince),
    };
  }, [provinceData]);

  // Inject the hierarchical-map's bespoke Leaflet styles. CRITICAL: every
  // selector is SCOPED under `[data-hierarchical-map]` (see the wrapper
  // below) so the rules cannot leak to other Leaflet instances on the same
  // page — notably the per-auction map rendered inside AuctionDetailModal
  // when the home carousel opens the popup over THIS section. Pre-scope
  // the rules were global and applied `.leaflet-container { z-index: 0
  // !important }` to every Leaflet map, which interacted with the Radix
  // Dialog's stacking context and caused the modal's per-auction map to
  // visually overlap the modal's mid-section content (price tiles,
  // "Próxima apertura" badge). Scoping keeps the visual polish (popup
  // chrome, zoom buttons, forced 100% sizing) on this map only.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      [data-hierarchical-map] .leaflet-container {
        height: 100% !important;
        width: 100% !important;
        z-index: 0 !important;
      }
      [data-hierarchical-map] .province-marker,
      [data-hierarchical-map] .municipality-marker,
      [data-hierarchical-map] .auction-marker {
        background: transparent !important;
        border: none !important;
      }
      [data-hierarchical-map] .leaflet-popup-content-wrapper {
        background: #ffffff !important;
        color: #1f2937 !important;
        border-radius: 12px !important;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
        border: 1px solid #e5e7eb !important;
      }
      [data-hierarchical-map] .leaflet-popup-tip {
        background: #ffffff !important;
        border-left: 1px solid #e5e7eb !important;
        border-top: 1px solid #e5e7eb !important;
      }
      [data-hierarchical-map] .leaflet-control-zoom a {
        background: #ffffff !important;
        color: #1f2937 !important;
        border-color: #d1d5db !important;
      }
      [data-hierarchical-map] .leaflet-control-zoom a:hover {
        background: #f3f4f6 !important;
      }
    `;
    document.head.appendChild(style);
    return (): void => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div
      data-hierarchical-map=""
      className="h-full w-full relative min-h-[500px] rounded-xl overflow-hidden border border-gray-200 shadow-sm"
    >
      <MapContainer
        center={[40.4168, -3.7038]}
        zoom={6}
        className="h-full w-full z-0"
        style={{ background: '#f8f9fa', height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapViewController
          viewLevel={viewLevel}
          selectedProvince={selectedProvince}
          selectedMunicipality={selectedMunicipality}
          provinceData={provinceData}
          municipalityData={municipalityData}
        />

        {/* Province-level markers */}
        {viewLevel === 'province' && provinceData.map(province => (
          <Marker
            key={province.name}
            position={province.center}
            icon={createProvinceIcon(province.activeCount)}
            eventHandlers={{
              click: () => handleProvinceClick(province.name),
            }}
          >
            <Tooltip direction="top" sticky>
              {(() => {
                const breakdown = getCategoryBreakdown(province.auctions);
                const visible = breakdown.slice(0, 6);
                const remaining = breakdown.length - visible.length;

                return (
                  <div className="min-w-[200px]">
                    <div className="text-sm font-semibold text-gray-900 mb-2">{province.name}</div>
                    <div className="text-xs text-gray-600 mb-2">
                      {province.count} subastas
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      Rango: <span className="font-semibold text-gray-800">{getPriceRange(province.auctions)}</span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-700">
                      {visible.map(([category, count]) => (
                        <div key={category} className="flex justify-between gap-4">
                          <span className="truncate">{category}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))}
                      {remaining > 0 && (
                        <div className="text-gray-500">+ {remaining} más</div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      Activas: <span className="font-semibold text-green-600">{province.activeCount}</span> · Pre: <span className="font-semibold text-amber-600">{province.preAuctionCount}</span>
                    </div>
                  </div>
                );
              })()}
            </Tooltip>
            <Popup>
              <div className="min-w-[220px]">
                <h3 className="font-bold text-base text-gray-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  {province.name}
                </h3>
                
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Total subastas:</span>
                    <span className="font-semibold text-gray-900">{province.count}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Activas:</span>
                    <span className="font-semibold text-green-600">{province.activeCount}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Pre-Subasta:</span>
                    <span className="font-semibold text-amber-600">{province.preAuctionCount}</span>
                  </div>
                </div>
                
                <button
                  onClick={() => handleProvinceClick(province.name)}
                  className="w-full px-3 py-2 bg-[--color-action-soft] border border-[--color-action] hover:bg-[--color-action-soft]/80 text-[--color-ink-primary] text-sm font-medium rounded-lg transition-colors"
                >
                  Ver municipios
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Municipality-level markers */}
        {viewLevel === 'municipality' && municipalityData.map(municipality => (
          <Marker
            key={`${municipality.province}-${municipality.name}`}
            position={municipality.center}
            icon={createProvinceIcon(municipality.activeCount)}
            eventHandlers={{
              click: () => handleMunicipalityClick(municipality.name),
            }}
          >
            <Tooltip direction="top" sticky>
              {(() => {
                const breakdown = getCategoryBreakdown(municipality.auctions);
                const visible = breakdown.slice(0, 6);
                const remaining = breakdown.length - visible.length;

                return (
                  <div className="min-w-[200px]">
                    <div className="text-sm font-semibold text-gray-900 mb-2">{municipality.name}</div>
                    <div className="text-xs text-gray-600 mb-2">
                      {municipality.count} subastas
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      Rango: <span className="font-semibold text-gray-800">{getPriceRange(municipality.auctions)}</span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-700">
                      {visible.map(([category, count]) => (
                        <div key={category} className="flex justify-between gap-4">
                          <span className="truncate">{category}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))}
                      {remaining > 0 && (
                        <div className="text-gray-500">+ {remaining} más</div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      Activas: <span className="font-semibold text-green-600">{municipality.activeCount}</span> · Pre: <span className="font-semibold text-amber-600">{municipality.preAuctionCount}</span>
                    </div>
                  </div>
                );
              })()}
            </Tooltip>
            <Popup>
              <div className="min-w-[220px]">
                <h3 className="font-bold text-base text-gray-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  {municipality.name}
                </h3>
                
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Total subastas:</span>
                    <span className="font-semibold text-gray-900">{municipality.count}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Activas:</span>
                    <span className="font-semibold text-green-600">{municipality.activeCount}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Pre-Subasta:</span>
                    <span className="font-semibold text-amber-600">{municipality.preAuctionCount}</span>
                  </div>
                </div>
                
                <button
                  onClick={() => handleMunicipalityClick(municipality.name)}
                  className="w-full px-3 py-2 bg-[--color-action-soft] border border-[--color-action] hover:bg-[--color-action-soft]/80 text-[--color-ink-primary] text-sm font-medium rounded-lg transition-colors"
                >
                  Ver subastas
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Auction-level markers */}
        {viewLevel === 'auction' && auctionsWithCoords.map(auction => (
          <Marker
            key={auction.id}
            position={[auction.latitude as number, auction.longitude as number]}
            icon={createAuctionIcon(auction.status)}
          >
            <Popup>
              <div className="min-w-[200px]">
                <h3 className="font-semibold text-sm text-gray-900 mb-1">
                  {auction.title}
                </h3>
                <p className="text-xs text-gray-600 mb-2">
                  {auction.municipality ? capitalizeLocation(auction.municipality) : 'Sin municipio'} - {auction.province ? capitalizeLocation(auction.province) : 'Sin provincia'}
                </p>
                <p className="text-xs text-gray-700 font-medium mb-3">
                  {formatPrice(auction.appraisalValue)}
                </p>
                <button
                  onClick={() => onMarkerClick?.(auction)}
                  className="w-full px-3 py-2 bg-[--color-action-soft] border border-[--color-action] hover:bg-[--color-action-soft]/80 text-[--color-ink-primary] text-xs font-medium rounded-lg transition-colors"
                >
                  Ver subasta
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {/* Legend Overlay */}
      <div
        className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg p-3 border border-gray-300 shadow-lg"
        role="note"
        aria-label="Leyenda del mapa"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600" aria-hidden="true" />
            <span className="text-xs text-gray-700 font-medium">Subastas activas</span>
          </div>
        </div>
      </div>

      {/* Empty-state overlay — surfaced when the API returns no pins (data
          gap, request error, or filters that exclude every coord). Without
          this the map just shows a blank Spain and looks broken. */}
      {items.length === 0 && viewLevel === 'province' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-1/2 left-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2 max-w-xs rounded-xl border border-gray-200 bg-white/95 px-5 py-4 text-center shadow-lg backdrop-blur"
        >
          <p className="text-sm font-semibold text-gray-900">
            Sin subastas geolocalizadas
          </p>
          <p className="mt-1 text-xs text-gray-600">
            No hay subastas con coordenadas para los filtros activos. Prueba a
            ampliar las categorías o estados.
          </p>
        </div>
      )}

      {/* Back buttons */}
      {viewLevel === 'municipality' && (
        <button
          onClick={handleBackToProvinces}
          className="absolute top-4 left-4 z-[1000] px-4 py-2 bg-white/95 hover:bg-white border border-gray-300 rounded-lg shadow-lg transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4 text-gray-700" />
          <span className="text-sm font-medium text-gray-900">Volver a provincias</span>
        </button>
      )}

      {viewLevel === 'auction' && (
        <button
          onClick={handleBackToMunicipalities}
          className="absolute top-4 left-4 z-[1000] px-4 py-2 bg-white/95 hover:bg-white border border-gray-300 rounded-lg shadow-lg transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4 text-gray-700" />
          <span className="text-sm font-medium text-gray-900">Volver a municipios</span>
        </button>
      )}

      {/* View indicator */}
      {viewLevel !== 'province' && selectedProvince && (
        <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-300 shadow-lg">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-900">
              {selectedProvince}
              {viewLevel === 'auction' && selectedMunicipality ? ` - ${selectedMunicipality}` : ''}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {viewLevel === 'municipality' ? `${municipalityData.length} municipios` : `${auctionsWithCoords.length} subastas`}
          </p>
        </div>
      )}

      {/* Island Insets */}
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-3">
        <InsetMap
          title="Islas Canarias"
          center={[28.45, -16.25]}
          zoom={6}
          provinces={islandProvinceData.canary}
          onProvinceClick={handleProvinceClick}
        />
        <InsetMap
          title="Illes Balears"
          center={[39.6, 2.95]}
          zoom={7}
          provinces={islandProvinceData.balearic}
          onProvinceClick={handleProvinceClick}
        />
      </div>
    </div>
  );
};

interface InsetMapProps {
  title: string;
  center: [number, number];
  zoom: number;
  provinces: ProvinceData[];
  onProvinceClick: (provinceName: string) => void;
}

const InsetMap: React.FC<InsetMapProps> = ({ title, center, zoom, provinces, onProvinceClick }) => {
  return (
    <div className="w-[200px] h-[140px] bg-white/95 border border-gray-300 rounded-lg shadow-lg overflow-hidden">
      <div className="text-[11px] font-semibold text-gray-700 px-2 py-1 border-b border-gray-200 bg-white/90">
        {title}
      </div>
      <div className="h-[110px]">
        <MapContainer
          center={center}
          zoom={zoom}
          className="h-full w-full"
          zoomControl={false}
          scrollWheelZoom={true}
          dragging={false}
          doubleClickZoom={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          {provinces.map((province) => (
            <Marker
              key={`${title}-${province.name}`}
              position={province.center}
              icon={createProvinceIcon(province.activeCount)}
              eventHandlers={{
                click: () => onProvinceClick(province.name),
              }}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
};
