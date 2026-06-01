'use client';

import React from 'react';
import { MapPin, X } from 'lucide-react';

interface MapToggleButtonProps {
  isVisible: boolean;
  onToggle: () => void;
  itemCount: number;
}

export const MapToggleButton: React.FC<MapToggleButtonProps> = ({
  isVisible,
  onToggle,
  itemCount,
}) => {
  return (
    <button
      onClick={onToggle}
      className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 bg-[--color-status-live-soft] border border-[--color-status-live] hover:bg-[--color-status-live-soft]/80 text-[--color-ink-primary] rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
      aria-label={isVisible ? 'Ocultar mapa' : 'Mostrar mapa'}
    >
      {isVisible ? (
        <>
          <X className="w-5 h-5" />
          <span className="font-medium">Ocultar mapa</span>
        </>
      ) : (
        <>
          <MapPin className="w-5 h-5" />
          <span className="font-medium">Mostrar mapa</span>
          {itemCount > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-white text-emerald-600 rounded-full text-xs font-bold">
              {itemCount}
            </span>
          )}
        </>
      )}
    </button>
  );
};
