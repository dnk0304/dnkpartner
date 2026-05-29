'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Map, X } from 'lucide-react';

interface DashboardLayoutProps {
  topBar: React.ReactNode;
  feed: React.ReactNode;
  map: React.ReactNode;
  mapVisible?: boolean;
  onMapToggle?: () => void;
}

const MAP_VISIBILITY_KEY = 'subastapro_map_visible';

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  topBar, 
  feed, 
  map,
  mapVisible: controlledMapVisible,
  onMapToggle: controlledOnMapToggle,
}) => {
  const [internalMapVisible, setInternalMapVisible] = useState(false);
  const mapVisible = controlledMapVisible !== undefined ? controlledMapVisible : internalMapVisible;
  
  const toggleMap = () => {
    if (controlledOnMapToggle) {
      controlledOnMapToggle();
    } else {
      setInternalMapVisible(prev => !prev);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(MAP_VISIBILITY_KEY, String(mapVisible));
    } catch (error) {
      console.error('Failed to save map visibility preference:', error);
    }
  }, [mapVisible]);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white">
      {/* Top Bar - Fixed */}
      <div className="flex-none z-50">
        {topBar}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Feed - Adjusts width based on map visibility */}
        <main className={`
          flex-1 overflow-auto bg-gray-50 transition-all duration-300 ease-in-out
          ${mapVisible ? 'w-full lg:w-1/2 xl:w-[55%]' : 'w-full'}
        `}>
          <div className="max-w-[1920px] mx-auto h-full">
            {feed}
          </div>
        </main>

        {/* Map - Split Screen on Desktop, Overlay on Mobile */}
        <div className={`
          fixed inset-0 z-40 lg:static lg:z-0
          transition-all duration-300 ease-in-out bg-gray-100 border-l border-gray-200
          ${mapVisible 
            ? 'translate-x-0 opacity-100 lg:w-1/2 xl:w-[45%]' 
            : 'translate-x-full opacity-0 lg:w-0 lg:opacity-100 lg:translate-x-0'
          }
        `}>
          {/* Mobile Close Button */}
          <div className="absolute top-4 right-4 z-50 lg:hidden">
            <Button 
              size="icon" 
              variant="secondary" 
              className="rounded-full shadow-lg h-10 w-10 bg-white"
              onClick={toggleMap}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="h-full w-full relative">
            {map}
            
            {/* Accuracy Legend Overlay */}
            <div className="absolute bottom-6 left-6 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-soft border border-gray-100 text-xs text-gray-600 flex flex-col gap-2">
              <div className="font-semibold text-gray-900 mb-1">Location Accuracy</div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm" />
                <span>Verified Exact Location</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500 border-2 border-white shadow-sm" />
                <span>Approximate Area</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
