'use client';

import React, { useEffect, useState } from 'react';
import { AuctionItem } from '@/types';
import dynamic from 'next/dynamic';

interface AuctionMapProps {
  items: AuctionItem[];
  onMarkerClick?: (item: AuctionItem) => void;
  onProvinceClick?: (province: string) => void;
  onBackToProvinces?: () => void;
  onBackToMunicipalities?: () => void;
}

// Dynamically import the map component to avoid SSR issues
const MapComponent = dynamic(
  () => import('./MapInner').then((mod) => mod.MapInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-[#1a1b1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">Cargando mapa...</span>
        </div>
      </div>
    ),
  }
);

export const AuctionMap: React.FC<AuctionMapProps> = ({ items, onMarkerClick, onProvinceClick, onBackToProvinces, onBackToMunicipalities }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-full w-full bg-[#1a1b1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">Cargando mapa...</span>
        </div>
      </div>
    );
  }

  return (
    <MapComponent
      items={items}
      onMarkerClick={onMarkerClick}
      onProvinceClick={onProvinceClick}
      onBackToProvinces={onBackToProvinces}
      onBackToMunicipalities={onBackToMunicipalities}
    />
  );
};
