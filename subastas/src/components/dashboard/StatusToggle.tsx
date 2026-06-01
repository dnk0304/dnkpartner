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

/**
 * StatusToggle — status filter pills.
 * Redesign #3: black ink on soft-tint when active, hairline border,
 * status-colour ring at 40%. Count badge same family.
 */
export const StatusToggle: React.FC<StatusToggleProps> = ({
  activeCount,
  finishedCount,
  preAuctionCount,
  currentStatus,
  onStatusChange,
}) => {
  const totalCount = activeCount + finishedCount + preAuctionCount;

  const pillBase =
    'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border';
  const inactive =
    'bg-[--color-surface] text-[--color-ink-primary] border-[--color-hairline] hover:bg-[--color-surface-muted]';
  const countBase = 'px-1.5 py-0.5 rounded-full text-xs font-semibold text-[--color-ink-primary]';
  const countInactive = 'bg-[--color-surface-muted]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Todas */}
      <button
        onClick={() => onStatusChange(null)}
        className={`${pillBase} ${
          currentStatus === null
            ? 'bg-[--color-action-soft] text-[--color-ink-primary] border-[--color-action] ring-1 ring-[--color-action]/30'
            : inactive
        }`}
      >
        <span>Todas</span>
        <span
          className={`${countBase} ${
            currentStatus === null ? 'bg-[--color-surface]' : countInactive
          }`}
        >
          {totalCount.toLocaleString()}
        </span>
      </button>

      {/* Activas */}
      <button
        onClick={() => onStatusChange('active')}
        className={`${pillBase} ${
          currentStatus === 'active'
            ? 'bg-[--color-status-live-soft] text-[--color-ink-primary] border-[--color-status-live] ring-1 ring-[--color-status-live]/30'
            : inactive
        }`}
      >
        <span>Activas</span>
        <span
          className={`${countBase} ${
            currentStatus === 'active' ? 'bg-[--color-surface]' : countInactive
          }`}
        >
          {activeCount.toLocaleString()}
        </span>
      </button>

      {/* Finalizadas */}
      <button
        onClick={() => onStatusChange('finished')}
        className={`${pillBase} ${
          currentStatus === 'finished'
            ? 'bg-[--color-status-concluded-soft] text-[--color-ink-primary] border-[--color-status-concluded] ring-1 ring-[--color-status-concluded]/30'
            : inactive
        }`}
      >
        <span>Finalizadas</span>
        <span
          className={`${countBase} ${
            currentStatus === 'finished' ? 'bg-[--color-surface]' : countInactive
          }`}
        >
          {finishedCount.toLocaleString()}
        </span>
      </button>

      {/* Pre-subastas */}
      <button
        onClick={() => onStatusChange('pre-auction')}
        className={`${pillBase} ${
          currentStatus === 'pre-auction'
            ? 'bg-[--color-status-upcoming-soft] text-[--color-ink-primary] border-[--color-status-upcoming] ring-1 ring-[--color-status-upcoming]/30'
            : inactive
        }`}
      >
        <span>Pre-Subastas</span>
        <span
          className={`${countBase} ${
            currentStatus === 'pre-auction' ? 'bg-[--color-surface]' : countInactive
          }`}
        >
          {preAuctionCount.toLocaleString()}
        </span>
      </button>
    </div>
  );
};
