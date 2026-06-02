'use client';

import React, { useEffect, useState } from 'react';
import { AuctionItem } from '@/types';
import dynamic from 'next/dynamic';

// Dynamically import MapInner to avoid SSR issues
const MapInner = dynamic(() => import('./MapInner').then(mod => ({ default: mod.MapInner })), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-[#1a1b1e]">
      <div className="text-gray-400">Cargando mapa...</div>
    </div>
  ),
});

interface MapContainerProps {
  items: AuctionItem[];
  isVisible: boolean;
  onToggle: () => void;
  position?: 'sidebar' | 'overlay' | 'fullscreen';
  onMarkerClick?: (item: AuctionItem) => void;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  items,
  isVisible,
  onToggle,
  position = 'sidebar',
  onMarkerClick,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server
  if (!mounted) {
    return null;
  }

  // Sidebar position (default) - slides in from right
  if (position === 'sidebar') {
    return (
      <aside
        className={`
          fixed top-0 right-0 h-screen z-40
          transition-all duration-300 ease-in-out
          border-l border-gray-700 bg-[#1a1b1e]
          ${isVisible 
            ? 'translate-x-0 w-[400px] xl:w-[450px] 2xl:w-[500px]' 
            : 'translate-x-full w-0'
          }
        `}
        style={{
          boxShadow: isVisible ? '-4px 0 20px rgba(0, 0, 0, 0.3)' : 'none',
        }}
      >
        {isVisible && (
          <div className="h-full w-full">
            <MapInner items={items} onMarkerClick={onMarkerClick} />
          </div>
        )}
      </aside>
    );
  }

  // Overlay position - appears over content
  if (position === 'overlay') {
    return (
      <>
        {/* Backdrop */}
        {isVisible && (
          <div
            className="fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 cursor-pointer"
            onClick={onToggle}
            role="button"
            tabIndex={-1}
            aria-label="Cerrar mapa"
          />
        )}
        
        {/* Map overlay */}
        <div
          className={`
            fixed inset-4 z-40 rounded-xl overflow-hidden
            transition-all duration-300 ease-in-out
            ${isVisible 
              ? 'opacity-100 scale-100' 
              : 'opacity-0 scale-95 pointer-events-none'
            }
          `}
        >
          <MapInner items={items} onMarkerClick={onMarkerClick} />
          
          {/* Close button */}
          {isVisible && (
            <button
              onClick={onToggle}
              className="absolute top-4 right-4 z-[1001] p-2 bg-[--color-surface]/95 hover:bg-[--color-surface-muted] border border-[--color-hairline] text-[--color-ink-primary] rounded-lg transition-colors"
              aria-label="Cerrar mapa"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </>
    );
  }

  // Fullscreen position
  if (position === 'fullscreen') {
    return (
      <>
        {isVisible && (
          <div className="fixed inset-0 z-50 bg-[#1a1b1e]">
            <MapInner items={items} onMarkerClick={onMarkerClick} />
            
            {/* Close button */}
            <button
              onClick={onToggle}
              className="absolute top-4 right-4 z-[1001] p-3 bg-[--color-surface]/95 hover:bg-[--color-surface-muted] border border-[--color-hairline] text-[--color-ink-primary] rounded-lg transition-colors shadow-xl"
              aria-label="Cerrar mapa"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </>
    );
  }

  return null;
};
