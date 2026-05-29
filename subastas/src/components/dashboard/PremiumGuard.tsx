import React from 'react';
import { Lock } from 'lucide-react';
import { UserTier, AuctionStatus } from '@/types';
import { Button } from '@/components/ui/button';

interface PremiumGuardProps {
  userTier: UserTier;
  auctionStatus: AuctionStatus;
  isLocked?: boolean;
  children: React.ReactNode;
  blurIntensity?: string;
}

export const PremiumGuard: React.FC<PremiumGuardProps> = ({
  userTier,
  auctionStatus,
  isLocked = false,
  children,
  blurIntensity = "blur-md"
}) => {
  // Determine tier required
  const tierRequired: "GOLD" | "DIAMOND" = auctionStatus === 'pre-auction' ? 'DIAMOND' : 'GOLD';
  
  // Use explicit isLocked flag if provided (from API), otherwise compute
  const shouldLock = isLocked !== undefined ? isLocked : (() => {
    if (userTier === 'diamond') return false;
    if (userTier === 'gold') return auctionStatus === 'pre-auction';
    if (userTier === 'free') return auctionStatus === 'active' || auctionStatus === 'pre-auction';
    return true;
  })();

  if (!shouldLock) {
    return <>{children}</>;
  }

  return (
    <div className="relative group overflow-hidden rounded-xl">
      {/* The Blurred Content */}
      <div className={`filter ${blurIntensity} grayscale pointer-events-none select-none transition-all duration-300`}>
        {children}
      </div>

      {/* The Premium Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-[2px] transition-all group-hover:bg-slate-950/60">
        <div className="bg-slate-900 border border-amber-500/50 p-4 rounded-2xl shadow-2xl flex flex-col items-center text-center max-w-[80%]">
          <Lock className={`w-8 h-8 mb-2 ${tierRequired === 'DIAMOND' ? 'text-blue-400' : 'text-amber-500'}`} />
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
            {tierRequired} Content
          </h4>
          <p className="text-xs text-slate-300 mt-1 mb-4">
            Unlock this deal and 45+ others in Las Palmas.
          </p>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-white font-bold w-full">
            Upgrade Now
          </Button>
        </div>
      </div>
    </div>
  );
};
