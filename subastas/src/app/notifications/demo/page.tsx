"use client";

/**
 * /notifications/demo — Pixel Wave 2c demo harness.
 *
 * Lets Niki/Ken see the Follow + Notify + Bell + Push widgets in isolation
 * without depending on Forge's map/detail-page work. Replace `auctionId`
 * with a real Auction.id from the DB to exercise the live API.
 *
 * This page is purely a developer-facing preview; not linked in the public
 * nav. Safe to remove once Wave 3 wires these into the real detail page.
 */

import * as React from "react";
import Link from "next/link";
import { FollowButton } from "@/components/notifications/FollowButton";
import { NotifyPrefsPopover } from "@/components/notifications/NotifyPrefsPopover";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { WebPushToggle } from "@/components/notifications/WebPushToggle";

export default function NotificationsDemoPage() {
  // Pick any auction ID — for live testing, paste a real one from the DB.
  const [auctionId, setAuctionId] = React.useState<string>("DEMO_AUCTION_ID");
  const [following, setFollowing] = React.useState(false);

  return (
    <main className="min-h-screen bg-[#FBF8F3] py-10">
      <div className="mx-auto max-w-3xl px-4 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#1F3A5F]">
              Notificaciones · demo
            </h1>
            <p className="text-sm text-[#1F3A5F]/70 mt-1 max-w-xl">
              Vista previa de los componentes de Wave 2c en aislamiento. La
              campana, el botón Seguir y el panel de Alertas se conectan a la
              API real — usa un <code className="text-xs">auctionId</code> válido
              para que el guardado persista.
            </p>
          </div>
          <NotificationBell />
        </header>

        <section className="rounded-lg border border-[#1F3A5F]/15 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1F3A5F]/60">
            Auction ID para probar
          </h2>
          <input
            type="text"
            value={auctionId}
            onChange={(e) => setAuctionId(e.target.value)}
            className="w-full rounded-md border border-[#1F3A5F]/20 px-3 h-9 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40"
            placeholder="DEMO_AUCTION_ID"
            aria-label="ID de subasta para probar follow/prefs"
          />
        </section>

        <section className="rounded-lg border border-[#1F3A5F]/15 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1F3A5F]/60 mb-3">
            Follow + Alertas (par recomendado)
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <FollowButton
              auctionId={auctionId}
              initialFollowing={following}
              onChange={setFollowing}
            />
            <NotifyPrefsPopover auctionId={auctionId} isFollowing={following} />
          </div>
          <p className="text-xs text-[#1F3A5F]/60 mt-3">
            «Seguir» y «Alertas» son verbos distintos. Solo se pueden configurar
            alertas si ya sigues la subasta.
          </p>
        </section>

        <section className="rounded-lg border border-[#1F3A5F]/15 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1F3A5F]/60 mb-3">
            Otras variantes del botón Seguir
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <FollowButton auctionId={auctionId} variant="compact" initialFollowing={following} onChange={setFollowing} />
            <FollowButton auctionId={auctionId} variant="icon" initialFollowing={following} onChange={setFollowing} />
            <NotifyPrefsPopover auctionId={auctionId} isFollowing={following} triggerVariant="compact" />
            <NotifyPrefsPopover auctionId={auctionId} isFollowing={following} triggerVariant="icon" />
          </div>
        </section>

        <section className="rounded-lg border border-[#1F3A5F]/15 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1F3A5F]/60 mb-3">
            Push del navegador (control independiente)
          </h2>
          <WebPushToggle />
        </section>

        <footer className="text-xs text-[#1F3A5F]/60 text-center">
          <Link href="/notifications" className="underline hover:text-[#1F3A5F]">
            Ver la página de notificaciones →
          </Link>
        </footer>
      </div>
    </main>
  );
}
