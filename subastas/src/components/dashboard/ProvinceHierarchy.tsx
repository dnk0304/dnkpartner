'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronDown, MapPin, X, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ProvinceHierarchyProps {
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  provinceCounts: Record<string, { active: number; preAuction: number; finished: number; total: number }>;
  onProvinceToggle: (province: string) => void;
  onMunicipalityToggle: (municipality: string) => void;
  onClearProvinces: () => void;
  onClearMunicipalities: () => void;
}

interface MunicipalityData {
  name: string;
  count: number;
}

// All Spanish provinces in alphabetical order
const ALL_PROVINCES = [
  'A Coruña', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila',
  'Badajoz', 'Barcelona', 'Bizkaia', 'Burgos',
  'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca',
  'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara',
  'Huelva', 'Huesca',
  'Illes Balears',
  'Jaén',
  'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo',
  'Madrid', 'Málaga', 'Melilla', 'Murcia',
  'Navarra',
  'Ourense',
  'Palencia', 'Pontevedra',
  'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria',
  'Tarragona', 'Teruel', 'Toledo',
  'Valencia', 'Valladolid', 'Vizcaya',
  'Zamora', 'Zaragoza', 'Álava'
].sort((a, b) => a.localeCompare(b, 'es'));

export const ProvinceHierarchy: React.FC<ProvinceHierarchyProps> = ({
  selectedProvinces,
  selectedMunicipalities,
  provinceCounts,
  onProvinceToggle,
  onMunicipalityToggle,
  onClearProvinces,
  onClearMunicipalities,
}) => {
  const [expandedProvinces, setExpandedProvinces] = useState<Set<string>>(new Set());
  const [municipalityData, setMunicipalityData] = useState<Record<string, MunicipalityData[]>>({});
  const [loadingMunicipalities, setLoadingMunicipalities] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Filter provinces by search query
  const filteredProvinces = useMemo(() => {
    if (!searchQuery.trim()) return ALL_PROVINCES;
    const query = searchQuery.toLowerCase();
    return ALL_PROVINCES.filter(province =>
      province.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Fetch municipalities for a province
  const fetchMunicipalities = async (province: string) => {
    if (municipalityData[province] || loadingMunicipalities.has(province)) {
      return; // Already loaded or loading
    }

    setLoadingMunicipalities(prev => new Set(prev).add(province));

    try {
      // Use the canonical `status=active` predicate so this drill-down reads
      // the same active set as the rest of the app (542 globally). The route
      // returns `counts.active` as a flat {municipalityLabel: count} dict;
      // the legacy `data.data` shape this component used to expect never
      // existed. See DISPATCH-BRIEF-FORGE-count-hierarchy-sync §6.
      const response = await fetch(
        `/api/auctions/counts?groupBy=municipality&status=active&province=${encodeURIComponent(province)}`
      );

      if (!response.ok) throw new Error('Failed to fetch municipalities');

      const data = await response.json();

      if (data.success && data.counts && data.counts.active) {
        const municipalities: MunicipalityData[] = Object.entries(
          data.counts.active as Record<string, number>,
        )
          .map(([name, count]) => ({ name, count }))
          .filter(m => m.name && m.name.toLowerCase() !== 'null' && m.name.toLowerCase() !== 'undefined')
          .sort((a, b) => a.name.localeCompare(b.name, 'es'));

        setMunicipalityData(prev => ({
          ...prev,
          [province]: municipalities
        }));
      }
    } catch (error) {
      console.error(`Error fetching municipalities for ${province}:`, error);
    } finally {
      setLoadingMunicipalities(prev => {
        const next = new Set(prev);
        next.delete(province);
        return next;
      });
    }
  };

  // Toggle province expansion and load municipalities
  const toggleProvinceExpansion = (province: string) => {
    const isExpanding = !expandedProvinces.has(province);
    
    setExpandedProvinces(prev => {
      const next = new Set(prev);
      if (isExpanding) {
        next.add(province);
        fetchMunicipalities(province);
      } else {
        next.delete(province);
      }
      return next;
    });
  };

  // Auto-expand selected provinces
  useEffect(() => {
    selectedProvinces.forEach(province => {
      if (!expandedProvinces.has(province)) {
        setExpandedProvinces(prev => new Set(prev).add(province));
        fetchMunicipalities(province);
      }
    });
  }, [selectedProvinces]);

  const totalSelected = selectedProvinces.length + selectedMunicipalities.length;

  return (
    <div className="space-y-4">
      {/* Header with search and clear */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          Location {totalSelected > 0 && `(${totalSelected})`}
        </h3>
        {totalSelected > 0 && (
          <button
            onClick={() => {
              onClearProvinces();
              onClearMunicipalities();
            }}
            className="text-xs text-red-500 hover:text-red-600 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search provinces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-10 bg-gray-50 border-gray-200 focus:bg-white"
        />
      </div>

      {/* Selected locations chips */}
      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedProvinces.map(province => (
            <Badge
              key={`province-${province}`}
              variant="secondary"
              className="pl-3 pr-1 py-1.5 h-8 bg-blue-100 text-blue-900 hover:bg-blue-200 gap-1 rounded-full border border-blue-200"
            >
              <MapPin className="w-3 h-3" />
              {province}
              <button
                onClick={() => onProvinceToggle(province)}
                className="p-0.5 hover:bg-blue-300 rounded-full ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {selectedMunicipalities.map(municipality => (
            <Badge
              key={`municipality-${municipality}`}
              variant="secondary"
              className="pl-3 pr-1 py-1.5 h-8 bg-green-100 text-green-900 hover:bg-green-200 gap-1 rounded-full border border-green-200"
            >
              {municipality}
              <button
                onClick={() => onMunicipalityToggle(municipality)}
                className="p-0.5 hover:bg-green-300 rounded-full ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Province hierarchy list */}
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-1">
          {filteredProvinces.map((province) => {
            const isProvinceSelected = selectedProvinces.includes(province);
            const isExpanded = expandedProvinces.has(province);
            const isLoading = loadingMunicipalities.has(province);
            const count = (provinceCounts[province]?.active || 0) + (provinceCounts[province]?.preAuction || 0);
            const municipalities = municipalityData[province] || [];
            const hasMunicipalities = municipalities.length > 0;

            return (
              <div key={province} className="space-y-1">
                {/* Province row */}
                <div
                  className={`
                    group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all
                    ${isProvinceSelected
                      ? 'bg-[--color-action-soft] text-[--color-ink-primary] font-semibold ring-1 ring-[--color-action]'
                      : 'hover:bg-[--color-surface-muted] text-[--color-ink-primary]'
                    }
                  `}
                >
                  {/* Expand/collapse button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProvinceExpansion(province);
                    }}
                    className={`
                      p-0.5 rounded transition-transform
                      ${isProvinceSelected ? 'text-[--color-ink-primary] hover:bg-[--color-action]/20' : 'text-[--color-ink-tertiary] hover:bg-[--color-surface-muted]'}
                    `}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {/* Province checkbox and name */}
                  <div
                    onClick={() => onProvinceToggle(province)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onProvinceToggle(province); } }}
                    className="flex-1 flex items-center gap-3 cursor-pointer"
                  >
                    <div
                      className={`
                        w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                        ${isProvinceSelected
                          ? 'border-white bg-white'
                          : 'border-gray-300 bg-white group-hover:border-gray-400'
                        }
                      `}
                    >
                      {isProvinceSelected && (
                        <div className="w-2 h-2 bg-blue-600 rounded-sm" />
                      )}
                    </div>
                    <span className="text-sm font-medium">{province}</span>
                  </div>

                  {/* Count badge */}
                  {count > 0 && (
                    <span
                      className={`
                        text-xs px-2 py-0.5 rounded-full font-medium
                        ${isProvinceSelected
                          ? 'bg-[--color-surface] text-[--color-ink-primary] border border-[--color-action]/30'
                          : 'bg-[--color-surface-muted] text-[--color-ink-primary]'
                        }
                      `}
                    >
                      {count}
                    </span>
                  )}
                </div>

                {/* Municipalities list (expanded) */}
                {isExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    {isLoading ? (
                      <div className="px-3 py-2 text-xs text-gray-500 italic">
                        Loading municipalities...
                      </div>
                    ) : hasMunicipalities ? (
                      municipalities.map((municipality) => {
                        const isMunicipalitySelected = selectedMunicipalities.includes(municipality.name);
                        
                        return (
                          <div
                            key={municipality.name}
                            onClick={() => onMunicipalityToggle(municipality.name)}
                            className={`
                              group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm
                              ${isMunicipalitySelected
                                ? 'bg-[--color-status-live-soft] text-[--color-ink-primary] font-semibold ring-1 ring-[--color-status-live]'
                                : 'hover:bg-[--color-surface-muted] text-[--color-ink-primary]'
                              }
                            `}
                          >
                            <div
                              className={`
                                w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all
                                ${isMunicipalitySelected
                                  ? 'border-white bg-white'
                                  : 'border-gray-300 bg-white group-hover:border-gray-400'
                                }
                              `}
                            >
                              {isMunicipalitySelected && (
                                <div className="w-1.5 h-1.5 bg-green-600 rounded-sm" />
                              )}
                            </div>
                            <span className="flex-1">{municipality.name}</span>
                            {municipality.count > 0 && (
                              <span
                                className={`
                                  text-[10px] px-1.5 py-0.5 rounded-full font-medium
                                  ${isMunicipalitySelected
                                    ? 'bg-[--color-surface] text-[--color-ink-primary] border border-[--color-status-live]/30'
                                    : 'bg-[--color-surface-muted] text-[--color-ink-primary]'
                                  }
                                `}
                              >
                                {municipality.count}
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-500 italic">
                        No municipalities found
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
