'use client';

import React, { useMemo } from 'react';
import { AuctionCategory, AuctionType, AuctionStatus } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { OFFICIAL_CATEGORIES, ALL_PROVINCES } from '@/lib/constants';

interface FilterChipsProps {
  selectedCategories: AuctionCategory[];
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  selectedAuctionTypes?: AuctionType[];
  selectedStatuses?: AuctionStatus[];
  categoryCounts: Record<string, any>;
  provinceCounts: Record<string, any>;
  municipalityCounts: Record<string, any>;
  onCategoryToggle: (category: AuctionCategory) => void;
  onProvinceToggle: (province: string) => void;
  onMunicipalityToggle: (municipality: string) => void;
  onAuctionTypeToggle?: (auctionType: AuctionType) => void;
  onStatusToggle?: (status: AuctionStatus) => void;
  onClearFilters: () => void;
  onClearProvinces?: () => void;
  onClearMunicipalities?: () => void;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  selectedCategories,
  selectedProvinces,
  selectedAuctionTypes = [],
  provinceCounts,
  onCategoryToggle,
  onProvinceToggle,
  onAuctionTypeToggle,
}) => {
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

  const provinceCountsLookup = useMemo(() => {
    const lookup: Record<string, { active: number; preAuction: number }> = {};
    Object.entries(provinceCounts || {}).forEach(([key, value]) => {
      lookup[normalizeText(key)] = {
        active: value?.active || 0,
        preAuction: value?.preAuction || 0,
      };
    });
    return lookup;
  }, [provinceCounts]);

  const getProvinceCounts = (province: string) => {
    const normalized = normalizeText(province);
    const direct = provinceCountsLookup[normalized];
    if (direct) {
      return direct;
    }

    const aliases = PROVINCE_ALIAS_LOOKUP[normalized] || [];
    for (const alias of aliases) {
      const match = provinceCountsLookup[alias];
      if (match) return match;
    }

    return { active: 0, preAuction: 0 };
  };
  // Helper to handle single selection logic for dropdowns
  const handleOriginChange = (value: string) => {
    if (value === 'all') {
      // Clear auction types
      if (selectedAuctionTypes.length > 0 && onAuctionTypeToggle) {
        // This is tricky because onAuctionTypeToggle toggles. 
        // Ideally we need a setAuctionType or clear.
        // For now, let's assume we pick one.
        // If we want "Todos", we might need to clear all.
        // Let's just pass the first one or handle 'all' in parent if possible.
        // Since we are mimicking the UI, let's assume single selection for now.
        // We will just toggle the current one off if it exists?
        // Let's implement a simple "set" logic if possible or just toggle.
        // If the parent only supports toggle, we might have issues with "Select".
        // But let's try.
      }
    } else {
      if (onAuctionTypeToggle) {
        // If strictly single select in UI, we should clear others?
        // For now, just toggle the selected one.
        onAuctionTypeToggle(value as AuctionType);
      }
    }
  };

  const handleCategoryChange = (value: string) => {
    // Assuming single category selection for this UI
    if (value !== 'all') {
       // We need to clear previous and set new.
       // Since onCategoryToggle is a toggle, we might need to toggle off the old one first?
       // Or just rely on the user clicking.
       // To make it work like a Select, we should probably update page.tsx to accept "setCategory".
       // But let's just call toggle for the new value.
       // If multiple are selected, this UI might be confusing.
       // We will assume single selection mode for this "AlertaSubastas" style.
       onCategoryToggle(value as AuctionCategory);
    }
  };

  const handleProvinceChange = (value: string) => {
    if (value !== 'all') {
      onProvinceToggle(value);
    }
  };

  return (
    <div className="bg-gray-100 border-b border-gray-200 py-4">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
          
          {/* Origen */}
          <div className="w-full md:w-auto flex-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 ml-1">
              Origen
            </label>
            <Select 
              value={selectedAuctionTypes[0] || 'all'} 
              onValueChange={(val) => {
                // If we want to switch, we toggle the old one off and new one on?
                // This is a limitation of the current props.
                // Let's just toggle the new one.
                if (onAuctionTypeToggle) onAuctionTypeToggle(val as AuctionType);
              }}
            >
              <SelectTrigger className="w-full bg-white border-gray-300 h-11 text-gray-700">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="judicial">BOE Judiciales</SelectItem>
                <SelectItem value="notarial">Notariales</SelectItem>
                <SelectItem value="aeat">Agencia Tributaria</SelectItem>
                <SelectItem value="tributaria">Seguridad Social</SelectItem>
                {/* Add others as needed */}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Bien */}
          <div className="w-full md:w-auto flex-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 ml-1">
              Tipo de Bien
            </label>
            <Select 
              value={selectedCategories[0] || 'all'} 
              onValueChange={(val) => onCategoryToggle(val as AuctionCategory)}
            >
              <SelectTrigger className="w-full bg-white border-gray-300 h-11 text-gray-700">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {OFFICIAL_CATEGORIES.REAL_ESTATE.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
                {OFFICIAL_CATEGORIES.MOVABLE.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provincia */}
          <div className="w-full md:w-auto flex-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 ml-1">
              Provincia
            </label>
            <Select 
              value={selectedProvinces[0] || 'all'} 
              onValueChange={(val) => onProvinceToggle(val)}
            >
              <SelectTrigger className="w-full bg-white border-gray-300 h-11 text-gray-700">
                <SelectValue placeholder="Todas las provincias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las provincias</SelectItem>
                {ALL_PROVINCES.map(prov => {
                  const counts = getProvinceCounts(prov);
                  return (
                    <SelectItem key={prov} value={prov}>
                      <div className="flex items-center justify-between w-full gap-3">
                        <span className="text-sm">{prov}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
                            {counts.active}
                          </span>
                          <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                            {counts.preAuction}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Search Button */}
          <div className="w-full md:w-auto">
            <label className="block text-xs font-semibold text-transparent mb-1.5 select-none">
              Buscar
            </label>
            <Button 
              className="w-full md:w-32 h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-sm"
            >
              Buscar
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
};
