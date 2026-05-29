'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Lock, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface GuestTeaserBannerProps {
  activeCount: number;
  preAuctionCount: number;
}

export const GuestTeaserBanner: React.FC<GuestTeaserBannerProps> = ({ activeCount, preAuctionCount }) => {
  return (
    <div className="bg-black text-white relative overflow-hidden">
      {/* Abstract Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-purple-500 to-blue-500 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-yellow-500 to-red-500 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-4 relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-4">
          <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
            <Lock className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="font-medium text-sm sm:text-base">
              You are viewing a limited preview.
            </p>
            <p className="text-xs sm:text-sm text-gray-400">
              Unlock <span className="text-white font-bold">{activeCount} active auctions</span> and <span className="text-yellow-400 font-bold">{preAuctionCount} pre-auctions</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Link href="/login" className="w-full sm:w-auto">
            <Button variant="ghost" className="w-full text-white hover:text-white hover:bg-white/10">
              Log in
            </Button>
          </Link>
          <Link href="/register" className="w-full sm:w-auto">
            <Button className="w-full bg-white text-black hover:bg-gray-100 font-bold gap-2">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

      </div>
    </div>
  );
};
