"use client";

import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, MapPin } from 'lucide-react';
import { capitalizeLocation } from '@/lib/utils';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';

interface ProvinceGridProps {
  provinceCounts: Record<string, {
    active: number;
    preAuction: number;
    finished: number;
    total: number;
  }>;
  onProvinceClick: (province: string) => void;
  onMunicipalityClick?: (municipality: string, province: string) => void;
  /**
   * AUTHORITATIVE "total auctions we have" (Dennis 2026-07-28) = the true full
   * registry count (COUNT(*) WHERE inScope=true, incl. unknown-status +
   * province-less rows), supplied by HomeObservatory from
   * /api/auctions/counts `totals.registryTotal`. When present (> 0) it drives
   * the headline "Total subastas" counter — DECOUPLED from Σ(province rows),
   * which can only ever count province-assigned auctions. Omitted / 0 falls back
   * to the Σ-of-rows total so the counter never blanks.
   */
  totalAuctions?: number;
}

interface MunicipalityData {
  name: string;
  active: number;
  preAuction: number;
  total: number;
}

// Province order to match alertasubastas.com
const PROVINCES: Array<{ label: string; key: string }> = [
  { label: 'La Coruña', key: 'A Coruña' },
  { label: 'Álava', key: 'Álava' },
  { label: 'Albacete', key: 'Albacete' },
  { label: 'Alicante', key: 'Alicante' },
  { label: 'Almería', key: 'Almería' },
  { label: 'Asturias', key: 'Asturias' },
  { label: 'Ávila', key: 'Ávila' },
  { label: 'Badajoz', key: 'Badajoz' },
  { label: 'Barcelona', key: 'Barcelona' },
  { label: 'Burgos', key: 'Burgos' },
  { label: 'Cáceres', key: 'Cáceres' },
  { label: 'Cádiz', key: 'Cádiz' },
  { label: 'Cantabria', key: 'Cantabria' },
  { label: 'Castellón', key: 'Castellón' },
  { label: 'Ceuta', key: 'Ceuta' },
  { label: 'Ciudad Real', key: 'Ciudad Real' },
  { label: 'Córdoba', key: 'Córdoba' },
  { label: 'Cuenca', key: 'Cuenca' },
  { label: 'Gerona', key: 'Girona' },
  { label: 'Granada', key: 'Granada' },
  { label: 'Guadalajara', key: 'Guadalajara' },
  { label: 'Guipúzcoa', key: 'Gipuzkoa' },
  { label: 'Huelva', key: 'Huelva' },
  { label: 'Huesca', key: 'Huesca' },
  { label: 'Islas Baleares', key: 'Illes Balears' },
  { label: 'Jaén', key: 'Jaén' },
  { label: 'León', key: 'León' },
  { label: 'Lérida', key: 'Lleida' },
  { label: 'Lugo', key: 'Lugo' },
  { label: 'Madrid', key: 'Madrid' },
  { label: 'Málaga', key: 'Málaga' },
  { label: 'Melilla', key: 'Melilla' },
  { label: 'Murcia', key: 'Murcia' },
  { label: 'Navarra', key: 'Navarra' },
  { label: 'Orense', key: 'Ourense' },
  { label: 'Palencia', key: 'Palencia' },
  { label: 'Las Palmas', key: 'Las Palmas' },
  { label: 'Pontevedra', key: 'Pontevedra' },
  { label: 'La Rioja', key: 'La Rioja' },
  { label: 'Salamanca', key: 'Salamanca' },
  { label: 'Segovia', key: 'Segovia' },
  { label: 'Sevilla', key: 'Sevilla' },
  { label: 'Soria', key: 'Soria' },
  { label: 'Tarragona', key: 'Tarragona' },
  { label: 'Santa Cruz de Tenerife', key: 'Santa Cruz de Tenerife' },
  { label: 'Teruel', key: 'Teruel' },
  { label: 'Toledo', key: 'Toledo' },
  { label: 'Valencia', key: 'Valencia' },
  { label: 'Valladolid', key: 'Valladolid' },
  { label: 'Vizcaya', key: 'Bizkaia' },
  { label: 'Zamora', key: 'Zamora' },
  { label: 'Zaragoza', key: 'Zaragoza' }
];

export function ProvinceGrid({ provinceCounts, onProvinceClick, onMunicipalityClick, totalAuctions }: ProvinceGridProps) {
  const [expandedProvince, setExpandedProvince] = useState<string | null>(null);
  const [municipalityData, setMunicipalityData] = useState<Record<string, MunicipalityData[]>>({});
  const [loadingMunicipalities, setLoadingMunicipalities] = useState<string | null>(null);

  // Create a case-insensitive lookup map
  const normalizeText = (value: string) => {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const PROVINCE_ALIAS_LOOKUP: Record<string, string[]> = {
    'bizkaia': ['vizcaya'],
    'gipuzkoa': ['guipuzcoa'],
    'illes balears': ['illes balear'],
  };

  const countsLookup = useMemo(() => {
    const lookup: Record<string, any> = {};
    Object.entries(provinceCounts).forEach(([key, value]) => {
      lookup[normalizeText(key)] = value;
    });
    return lookup;
  }, [provinceCounts]);

  // Fetch municipalities for a province
  const fetchMunicipalities = async (province: string) => {
    if (municipalityData[province]) return;
    
    setLoadingMunicipalities(province);
    try {
      const response = await fetch(
        `/api/auctions/counts?groupBy=municipality&province=${encodeURIComponent(province)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        // API returns counts in data.counts.active, data.counts.preAuction, etc.
        if (data.success && data.counts) {
          // Get all unique municipality names from the counts
          const allMunicipalities = new Set<string>();
          if (data.counts.active) Object.keys(data.counts.active).forEach(m => allMunicipalities.add(m));
          if (data.counts.preAuction) Object.keys(data.counts.preAuction).forEach(m => allMunicipalities.add(m));
          if (data.counts.total) Object.keys(data.counts.total).forEach(m => allMunicipalities.add(m));
          
          const municipalities: MunicipalityData[] = Array.from(allMunicipalities)
            .map(name => ({
              name,
              active: data.counts.active?.[name] || 0,
              preAuction: data.counts.preAuction?.[name] || 0,
              total: (data.counts.active?.[name] || 0) + (data.counts.preAuction?.[name] || 0)
            }))
            .filter(m => m.name && m.name.toLowerCase() !== 'null' && m.name.toLowerCase() !== 'undefined' && m.name.toLowerCase() !== 'desconocida')
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));

          setMunicipalityData(prev => ({
            ...prev,
            [province]: municipalities
          }));
        }
      }
    } catch (error) {
      console.error(`Error fetching municipalities for ${province}:`, error);
    } finally {
      setLoadingMunicipalities(null);
    }
  };

  // Toggle province expansion
  const toggleProvinceExpansion = (province: string) => {
    if (expandedProvince === province) {
      setExpandedProvince(null);
    } else {
      setExpandedProvince(province);
      fetchMunicipalities(province);
    }
  };
  
  // Wave C3b (2026-06-07): aggregate total + per-bucket totals so the
  // heading can surface a "Total subastas" counter and the badge colors get
  // an explicit legend. We sum from `provinceCounts` (already passed in by
  // HomeObservatory) so this stays presentational — no extra fetch.
  //
  // Registry-sync (2026-07-28, Dennis): the HEADLINE total is now DECOUPLED
  // from Σ(province rows). The Σ-of-rows figure (`rowsTotal`) can only ever
  // count province-assigned auctions, so it structurally undercounts the true
  // catalog (it misses unknown-status INDETERMINADO rows the registry rollup
  // excludes AND province-less rows entirely). When the parent supplies the
  // authoritative `totalAuctions` (COUNT(*) WHERE inScope=true), we show THAT as
  // the headline — even though it will legitimately exceed the visible rows'
  // sum while province-less rows exist / the province backfill is pending. The
  // Σ-of-rows total remains the fallback so the counter never blanks.
  const aggregateTotals = useMemo(() => {
    let active = 0;
    let preAuction = 0;
    let finished = 0;
    let total = 0;
    for (const v of Object.values(provinceCounts)) {
      active += v.active || 0;
      preAuction += v.preAuction || 0;
      finished += v.finished || 0;
      total += v.total || 0;
    }
    // `total` may not include `finished` in every payload; fall back to the
    // sum-of-buckets if the explicit total reads suspiciously low.
    const bucketSum = active + preAuction + finished;
    const rowsTotal = Math.max(total, bucketSum);
    return {
      active,
      preAuction,
      finished,
      rowsTotal,
      // Authoritative full-catalog total when available, else Σ-of-rows.
      total: totalAuctions && totalAuctions > 0 ? totalAuctions : rowsTotal,
    };
  }, [provinceCounts, totalAuctions]);

  const formatNumber = (n: number) => n.toLocaleString('es-ES');

  return (
    <div className="bg-white py-8 border-t border-gray-200 mt-12">
      <div className="max-w-7xl mx-auto">
        {/* Heading row (Wave C3b, 2026-06-07): explicit legend explains the
            three coloured badges next to each province, and the total counter
            gives an at-a-glance sense of the tracked dataset size. */}
        <div className="px-2 mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h3 className="text-xl font-bold text-gray-900">
            Buscar subastas por provincia
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Legend — colour-coded dots match the badges below. Each dot is
                aria-hidden; the label carries the meaning for screen
                readers. */}
            <ul
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600"
              aria-label="Leyenda de estados"
            >
              <li className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-green-500"
                />
                Activas
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-amber-500"
                />
                Próximas
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-gray-400"
                />
                Finalizadas
              </li>
            </ul>
            {/* Total counter — pulled from the same provinceCounts payload
                so the number always matches the per-row badges. tnum keeps
                the digits aligned. */}
            <div
              className="inline-flex items-baseline gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1"
              aria-label={`Total de subastas registradas: ${aggregateTotals.total}`}
            >
              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                Total subastas
              </span>
              <span className="tnum text-sm font-semibold text-gray-900">
                {formatNumber(aggregateTotals.total)}
              </span>
            </div>
          </div>
        </div>
        
        {/* Province list in columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2">
          {PROVINCES.map((province) => {
            const normalized = normalizeText(province.key);
            const counts = countsLookup[normalized] || PROVINCE_ALIAS_LOOKUP[normalized]?.map(alias => countsLookup[alias]).find(Boolean);
            const totalActive = counts?.active || 0;
            const totalPreAuction = counts?.preAuction || 0;
            const totalFinished = counts?.finished || 0;
            // Slug for the registry results archive (/resultados/{slug}).
            // Every grid key maps 1:1 to a canonical slug, but guard against a
            // missing entry so we never emit /resultados/undefined.
            const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[province.key];
            const finishedIsLink = totalFinished > 0 && Boolean(provinceSlug);
            const isExpanded = expandedProvince === province.key;
            const isLoading = loadingMunicipalities === province.key;
            const municipalities = municipalityData[province.key] || [];
            
            return (
              <div key={province.key} className="border-b border-gray-100 last:border-0">
                {/* Province row */}
                <div className="flex items-center py-2 px-2 hover:bg-gray-50 transition-colors rounded-md">
                  {/* Expand button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProvinceExpansion(province.key);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 mr-1"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  
                  {/* Province name and click to select. Note: the Finalizadas
                      badge is a SIBLING <a>, not nested here — an anchor cannot
                      live inside this <button> (invalid interactive nesting). */}
                  <button
                    onClick={() => onProvinceClick(province.key)}
                    className="flex-1 flex items-center justify-between text-left group min-w-0"
                  >
                    <span className="text-sm font-medium text-blue-600 hover:underline truncate pr-2">
                      {province.label}
                    </span>

                    {/* Count badges - Split Active/Pre-Auction */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded border border-green-100 bg-green-50 ${
                          totalActive === 0 ? 'opacity-50' : 'text-green-600'
                        }`}
                        title="Activas"
                      >
                        {totalActive}
                      </span>
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded border border-amber-100 bg-amber-50 ${
                          totalPreAuction === 0 ? 'opacity-50' : 'text-amber-600'
                        }`}
                        title="Pre-Subasta"
                      >
                        {totalPreAuction}
                      </span>
                    </div>
                  </button>

                  {/* Finalizadas → crawlable link into the /resultados archive.
                      Real <a href> (SSR-rendered, keyboard-focusable, open-in-
                      new-tab) so it works as a discovery doorway for the crawl.
                      Falls back to plain text at 0 (nothing to see) or if a slug
                      is somehow missing (never emit /resultados/undefined). */}
                  {finishedIsLink ? (
                    <a
                      href={`/resultados/${provinceSlug}`}
                      title="Finalizadas"
                      aria-label={`Ver ${totalFinished} subastas finalizadas en ${province.label}`}
                      className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800 hover:underline cursor-pointer transition-colors"
                    >
                      {totalFinished}
                    </a>
                  ) : (
                    <span
                      className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 ${
                        totalFinished === 0 ? 'opacity-50' : 'text-gray-600'
                      }`}
                      title="Finalizadas"
                    >
                      {totalFinished}
                    </span>
                  )}
                </div>
                
                {/* Municipalities dropdown */}
                {isExpanded && (
                  <div className="pl-8 pr-2 py-2 bg-gray-50 text-sm border-l-2 border-gray-200 ml-4 mb-2">
                    {isLoading ? (
                      <div className="text-gray-500 italic">Cargando...</div>
                    ) : municipalities.length > 0 ? (
                      <div className="space-y-1">
                        {municipalities.map((municipality) => (
                          <button
                            key={municipality.name}
                            onClick={() => {
                              if (onMunicipalityClick) {
                                onMunicipalityClick(municipality.name, province.key);
                              }
                            }}
                            className="w-full flex items-center justify-between py-1 hover:text-blue-600 text-gray-600 text-left"
                          >
                            <span className="truncate pr-2">
                              {capitalizeLocation(municipality.name)}
                            </span>
                            <div className="flex items-center gap-1">
                              {municipality.active > 0 && (
                                <span className="text-xs text-green-600 font-medium">
                                  {municipality.active}
                                </span>
                              )}
                              {municipality.preAuction > 0 && (
                                <span className="text-xs text-amber-600 font-medium">
                                  {municipality.preAuction}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">Sin municipios</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
