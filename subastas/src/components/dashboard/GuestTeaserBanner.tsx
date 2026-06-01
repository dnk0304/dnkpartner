'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';

interface GuestTeaserBannerProps {
  activeCount: number;
  preAuctionCount: number;
}

/**
 * GuestTeaserBanner — anonymous-visitor banner.
 *
 * Redesign #3: light surface, black ink, Spanish copy, hairline borders.
 * "Iniciar sesión" left as a ghost light-bg button. "Registrarse" CTA
 * follows the login/signup exception (bg-black text-white per Dennis).
 */
export const GuestTeaserBanner: React.FC<GuestTeaserBannerProps> = ({
  activeCount,
  preAuctionCount,
}) => {
  return (
    <div className="bg-[--color-surface] hairline-b text-[--color-ink-primary] relative">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-2 bg-[--color-warn-attention-soft] rounded-lg border border-[--color-warn-attention]/30">
            <Lock className="w-5 h-5 text-[--color-warn-attention]" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm sm:text-base text-[--color-ink-primary]">
              Estás viendo una versión limitada.
            </p>
            <p className="text-xs sm:text-sm text-[--color-ink-secondary] tnum">
              Desbloquea{' '}
              <span className="font-semibold text-[--color-ink-primary]">
                {activeCount.toLocaleString('es-ES')} subastas activas
              </span>{' '}
              y{' '}
              <span className="font-semibold text-[--color-ink-primary]">
                {preAuctionCount.toLocaleString('es-ES')} pre-subastas
              </span>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Link href="/login" className="w-full sm:w-auto">
            <Button
              variant="ghost"
              className="w-full text-[--color-ink-primary] hover:bg-[--color-surface-muted]"
            >
              Iniciar sesión
            </Button>
          </Link>
          <Link href="/register" className="w-full sm:w-auto">
            {/* Login/signup exception per Dennis — bg-black text-white preserved */}
            <Button className="w-full bg-black text-white hover:bg-gray-800 font-semibold gap-2">
              Empezar prueba gratuita <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
