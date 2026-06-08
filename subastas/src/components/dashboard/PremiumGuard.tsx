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

      {/* The Premium Overlay — light variant, all-black text */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--color-surface)]/70 backdrop-blur-[2px]">
        <div className="bg-[var(--color-surface)] border border-[var(--color-gold)] p-4 rounded-2xl shadow-[var(--shadow-lift)] flex flex-col items-center text-center max-w-[80%]">
          <Lock className={`w-8 h-8 mb-2 ${tierRequired === 'DIAMOND' ? 'text-[var(--color-action)]' : 'text-[var(--color-gold)]'}`} />
          <h4 className="text-sm font-bold text-[var(--color-ink-primary)] uppercase tracking-wider">
            Contenido {tierRequired}
          </h4>
          <p className="text-xs text-[var(--color-ink-secondary)] mt-1 mb-4">
            Desbloquea esta subasta y otras 45+ en tu zona.
          </p>
          <Button size="sm" className="bg-[var(--color-gold)] hover:bg-[var(--color-gold-hover)] text-[var(--color-ink-primary)] font-bold w-full">
            Mejorar plan
          </Button>
        </div>
      </div>
    </div>
  );
};
