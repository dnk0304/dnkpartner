'use client';

import React from 'react';
import { AuctionStatus } from '@/types';

interface StatusToggleProps {
  activeCount: number;
  finishedCount: number;
  preAuctionCount: number;
  currentStatus: AuctionStatus | null;
  onStatusChange: (status: AuctionStatus | null) => void;
}

export const StatusToggle: React.FC<StatusToggleProps> = ({
  activeCount,
  finishedCount,
  preAuctionCount,
  currentStatus,
  onStatusChange,
}) => {
  const totalCount = activeCount + finishedCount + preAuctionCount;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* All Auctions */}
      <button
        onClick={() => onStatusChange(null)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border
          ${currentStatus === null
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }
        `}
      >
        <span>Todas</span>
        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
          currentStatus === null ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
        }`}>
          {totalCount.toLocaleString()}
        </span>
      </button>
      
      {/* Active Auctions */}
      <button
        onClick={() => onStatusChange('active')}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border
          ${currentStatus === 'active'
            ? 'bg-green-600 text-white border-green-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }
        `}
      >
        <span>Activas</span>
        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
          currentStatus === 'active' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'
        }`}>
          {activeCount.toLocaleString()}
        </span>
      </button>
      
      {/* Finished Auctions */}
      <button
        onClick={() => onStatusChange('finished')}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border
          ${currentStatus === 'finished'
            ? 'bg-gray-700 text-white border-gray-700'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }
        `}
      >
        <span>Finalizadas</span>
        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
          currentStatus === 'finished' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600'
        }`}>
          {finishedCount.toLocaleString()}
        </span>
      </button>
      
      {/* Pre-Auctions */}
      <button
        onClick={() => onStatusChange('pre-auction')}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border
          ${currentStatus === 'pre-auction'
            ? 'bg-amber-600 text-white border-amber-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }
        `}
      >
        <span>Pre-Subastas</span>
        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
          currentStatus === 'pre-auction' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'
        }`}>
          {preAuctionCount.toLocaleString()}
        </span>
      </button>
    </div>
  );
};
