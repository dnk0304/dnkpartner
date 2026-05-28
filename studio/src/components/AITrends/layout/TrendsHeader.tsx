import React, { useState, useEffect } from 'react';
import { Search, Globe } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import { useAITrends } from '../../../contexts/AITrendsContext';
import { NotificationBell } from '../components/NotificationBell';
import type { Marketplace, SnapshotMode } from '../../../types/AITrends';

interface TrendsHeaderProps {
  className?: string;
}

export function TrendsHeader({ className }: TrendsHeaderProps) {
  const {
    currentKeyword,
    setCurrentKeyword,
    marketplace,
    setMarketplace,
    snapshotMode,
    setSnapshotMode,
    triggerSearch,
  } = useAITrends();

  // Local state for input to avoid triggering on every keystroke
  const [searchInput, setSearchInput] = useState(currentKeyword);

  // Sync with context when currentKeyword changes externally
  useEffect(() => {
    setSearchInput(currentKeyword);
  }, [currentKeyword]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setCurrentKeyword(searchInput.trim());
      triggerSearch();
    }
  };

  const handleMarketplaceClick = (newMarketplace: Marketplace) => {
    setMarketplace(newMarketplace);
    if (currentKeyword) {
      triggerSearch();
    }
  };

  const handleSnapshotModeClick = (mode: SnapshotMode) => {
    setSnapshotMode(mode);
    if (currentKeyword) {
      triggerSearch();
    }
  };

  return (
    <header className={cn("h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10", className)}>
      <div className="flex-1 max-w-2xl">
        <form onSubmit={handleSearchSubmit} className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
          <input 
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Amazon keywords or ASINs..." 
            className="w-full h-10 pl-10 pr-4 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all outline-none"
          />
        </form>
      </div>

      <div className="flex items-center gap-4 ml-8">
        {/* Marketplace Selector */}
        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleMarketplaceClick('US')}
            className={cn(
              "h-7 text-xs font-medium transition-all",
              marketplace === 'US'
                ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Globe className="w-3 h-3 mr-1.5" />
            US
          </Button>
          <div className="w-px h-4 bg-gray-200" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleMarketplaceClick('UK')}
            className={cn(
              "h-7 text-xs font-medium transition-all",
              marketplace === 'UK'
                ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            UK
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleMarketplaceClick('DE')}
            className={cn(
              "h-7 text-xs font-medium transition-all",
              marketplace === 'DE'
                ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            DE
          </Button>
        </div>

        {/* Snapshot Mode Selector */}
        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSnapshotModeClick('live')}
            className={cn(
              "h-7 text-xs font-medium transition-all",
              snapshotMode === 'live'
                ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            Live
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSnapshotModeClick('24h')}
            className={cn(
              "h-7 text-xs font-medium transition-all",
              snapshotMode === '24h'
                ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            24h
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSnapshotModeClick('7d')}
            className={cn(
              "h-7 text-xs font-medium transition-all",
              snapshotMode === '7d'
                ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            7d
          </Button>
        </div>

        <div className="h-6 w-px bg-gray-200 mx-2" />

        <NotificationBell 
          onNavigateToKeyword={(keyword) => {
            setCurrentKeyword(keyword);
            triggerSearch();
          }}
        />
        
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:shadow-md transition-shadow">
          JD
        </div>
      </div>
    </header>
  );
}

