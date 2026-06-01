'use client';

import React from 'react';
import { AuctionItem } from '@/types';
import { AuctionCard } from './AuctionCard';
import { ArrowRight, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CategorySectionProps {
  title: string;
  count: number;
  auctions: AuctionItem[];
  userTier: 'free' | 'gold' | 'diamond' | null;
  onAuctionClick: (auction: AuctionItem) => void;
  onSeeAll: () => void;
  statusColor: 'green' | 'amber' | 'gray';
  isPremiumFeature?: boolean;
  premiumBadgeText?: string;
  isGuest?: boolean;
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  title,
  count,
  auctions,
  userTier,
  onAuctionClick,
  onSeeAll,
  statusColor,
  isPremiumFeature = false,
  premiumBadgeText = 'Premium',
  isGuest = false,
}) => {
  const borderColor = {
    green: 'border-green-200',
    amber: 'border-amber-200',
    gray: 'border-gray-200',
  }[statusColor];

  const bgColor = {
    green: 'bg-green-50/50',
    amber: 'bg-amber-50/50',
    gray: 'bg-gray-50/50',
  }[statusColor];

  const textColor = {
    green: 'text-green-700',
    amber: 'text-amber-700',
    gray: 'text-gray-700',
  }[statusColor];

  const displayAuctions = auctions.slice(0, 12); // Show max 12 items in horizontal scroll

  return (
    <div className={`border-t ${borderColor} ${bgColor} py-6`}>
      <div className="px-6">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className={`text-2xl font-bold ${textColor}`}>
              {title}
            </h2>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${bgColor} ${textColor} border ${borderColor}`}>
              {count}
            </span>
            {isPremiumFeature && (
              <Badge className="bg-[--color-action-soft] text-[--color-ink-primary] border border-[--color-action] gap-1">
                <Crown className="h-3 w-3" />
                {premiumBadgeText}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={onSeeAll}
            className={`gap-2 ${textColor} hover:${bgColor}`}
          >
            Ver Todas
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Horizontal Scrolling Grid */}
        <div className="relative">
          {displayAuctions.length === 0 ? (
            // Empty state for this section
            <div className="flex items-center justify-center p-12 text-center">
              <p className="text-gray-500">No hay {title.toLowerCase()} disponibles</p>
            </div>
          ) : (
            <div
              className="flex gap-6 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e0 transparent',
              }}
            >
              {displayAuctions.map((auction) => (
                <div
                  key={auction.id}
                  className="flex-shrink-0 w-[320px] snap-start"
                >
                  <AuctionCard
                    item={auction}
                    userTier={userTier || 'free'}
                    onClick={() => onAuctionClick(auction)}
                  />
                </div>
              ))}

              {/* Show "See More" card at the end if there are more items */}
              {auctions.length > 12 && (
                <div
                  className="flex-shrink-0 w-[320px] snap-start"
                  onClick={onSeeAll}
                >
                  <div className={`h-full border-2 border-dashed ${borderColor} rounded-lg flex flex-col items-center justify-center p-8 cursor-pointer hover:${bgColor} transition-colors`}>
                    <div className={`w-16 h-16 rounded-full ${bgColor} flex items-center justify-center mb-4`}>
                      <ArrowRight className={`h-8 w-8 ${textColor}`} />
                    </div>
                    <h3 className={`text-lg font-semibold ${textColor} mb-2`}>
                      Ver {auctions.length - 12} más
                    </h3>
                    <p className="text-sm text-gray-500 text-center">
                      Haz clic para ver todas las subastas {title.toLowerCase()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scroll indicators (gradient fade) */}
          {displayAuctions.length > 0 && (
            <div className="absolute top-0 right-0 bottom-4 w-24 bg-gradient-to-l from-white to-transparent pointer-events-none" />
          )}
        </div>
      </div>
    </div>
  );
};
