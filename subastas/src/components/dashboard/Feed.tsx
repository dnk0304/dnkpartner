import React from 'react';
import { AuctionItem, UserTier } from '@/types';
import { AuctionCard } from './AuctionCard';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FeedProps {
  items: AuctionItem[];
  userTier: UserTier;
}

export const Feed: React.FC<FeedProps> = ({ items, userTier }) => {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-gray-500">
        <p className="text-lg font-medium">No auctions found</p>
        <p className="text-sm">Try adjusting your filters or search terms.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-6 p-6 sm:grid-cols-1 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2">
        {items.map((item) => (
          <AuctionCard key={item.id} item={item} userTier={userTier} />
        ))}
      </div>
      {/* Spacer for bottom */}
      <div className="h-20" /> 
    </ScrollArea>
  );
};
