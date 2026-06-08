'use client';

import React, { useState } from 'react';
import { X, Maximize2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AuctionItem } from '@/types';

const MapInner = dynamic(() => import('./MapInner').then(mod => ({ default: mod.MapInner })), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center">
      <span className="text-gray-500 text-sm">Cargando mapa...</span>
    </div>
  ),
});

interface MiniMapProps {
  items: AuctionItem[];
  onMarkerClick: (item: AuctionItem) => void;
  onExpand: () => void;
}

export const MiniMap: React.FC<MiniMapProps> = ({ items, onMarkerClick, onExpand }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="relative h-20 w-56 rounded-xl overflow-hidden border-2 border-gray-300 hover:border-gray-400 transition-all duration-200 hover:shadow-lg group flex-shrink-0"
      >
        <div className="absolute inset-0 bg-gray-100">
          <MapInner items={items} onMarkerClick={onMarkerClick} />
        </div>
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-md bg-[var(--color-surface)]/95 border border-[var(--color-hairline)] px-2 py-1 text-[var(--color-ink-primary)] backdrop-blur-sm">
          <div className="flex flex-col items-start">
            <span className="text-xs font-semibold">{items.length} subastas</span>
            <span className="text-[10px] text-[var(--color-ink-secondary)]">Click para expandir</span>
          </div>
          <Maximize2 className="h-4 w-4" />
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            Mapa de Subastas ({items.length})
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onExpand}
              className="px-4 py-2 bg-[var(--color-action-soft)] border border-[var(--color-action)] text-[var(--color-ink-primary)] rounded-lg hover:bg-[var(--color-action-soft)]/80 transition-colors text-sm font-medium"
            >
              <Maximize2 className="h-4 w-4 inline mr-2" />
              Ver en pantalla completa
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="h-full w-full pt-16">
          <MapInner items={items} onMarkerClick={onMarkerClick} />
        </div>
      </div>
    </div>
  );
};
