"use client";

/**
 * DetailStatusPanel — the sticky right-rail "state" panel on the detail page.
 *
 * The single most important block in the product. It must answer in one
 * glance:
 *   - What's the auction doing right now?
 *   - When does it open / close?
 *   - What's the current bid?
 *   - How do I act (follow / configure alerts / go to BOE to bid)?
 *
 * The panel docks sticky-top once the user scrolls past the hero so the live
 * countdown and "Ir al Portal del BOE" CTA never leave the viewport on
 * desktop. On mobile it lives above the description (not sticky — the mobile
 * action bar handles the persistent CTAs).
 */

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { AuctionItem } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { NotifyPrefsPopover } from "@/components/notifications/NotifyPrefsPopover";
import { formatPrice, formatDateLong } from "./format";
import { getStatusMeta, isLive, isUpcoming, effectiveStatus } from "./status";
import { statusDateLabel } from "@/lib/auction-status";
import { getSourceLabel } from "@/lib/source-labels";
import { cn } from "@/lib/utils";

export type DetailStatusPanelProps = {
  auction: AuctionItem & {
    startedAt?: string | Date | null;
    endsAt?: string | Date | null;
    resumeAt?: string | Date | null;
    minimumBid?: number | null;
    depositAmount?: number | null;
    bidIncrement?: number | null;
    claimedAmount?: number | null;
    valorSubasta?: number | null;
  };
  initialFollowing: boolean;
  className?: string;
};

export function DetailStatusPanel({
  auction,
  initialFollowing,
  className,
}: DetailStatusPanelProps) {
  // Defence-in-depth: even though AuctionDetailClient resolves an
  // effectiveStatus before passing the AuctionItem down, recompute here so
  // any future caller (modal, list-card detail flyout) gets the clock-wins
  // guarantee for free. `endsAt` in the past forces "concluida-portal".
  const resolvedStatus = effectiveStatus(auction.status, auction.endsAt ?? null);
  const meta = getStatusMeta(resolvedStatus);
  const live = isLive(resolvedStatus);
  const upcoming = isUpcoming(resolvedStatus);
  // Status-branched date intent — shared with email + every card surface.
  const dateLabelKind = statusDateLabel(resolvedStatus);
  const suspended = dateLabelKind === "Fecha prevista de reanudación";

  // Pick the right countdown target: live → endsAt; upcoming → startedAt
  // (opensAt is the canonical start, but only ever when GENUINELY set; we
  // do NOT fall back to endsAt for upcoming — that would re-introduce the
  // "Termina en 6d" bug on pre-auctions). Suspended → no countdown; the
  // panel renders a static "Fecha prevista de reanudación" line instead.
  // Terminal → nothing.
  const countdownTarget = live
    ? (auction.endsAt ?? auction.endDate ?? null)
    : upcoming
      ? (auction.startedAt ?? null)
      : null;
  const countdownPrefix = live ? "Termina en" : upcoming ? "Abre en" : undefined;

  const [following, setFollowing] = React.useState(initialFollowing);

  return (
    <aside
      className={cn(
        "rounded-lg border border-[--color-hairline] bg-[--color-surface] p-5 md:p-6 space-y-5",
        className,
      )}
      aria-labelledby="detail-state-heading"
    >
      <header>
        <h2 id="detail-state-heading" className="sr-only">
          Estado actual de la subasta
        </h2>
        <StatusBadge status={resolvedStatus} size="lg" />
        <p className="mt-2 text-xs text-[--color-ink-tertiary]">{meta.helper}</p>
      </header>

      {/* Status-branched date / countdown block (Wave52, Pixel 2026-06-04).
          LIVE     → ticking countdown to endsAt.
          UPCOMING → ticking countdown to opensAt when set, otherwise a
                     static "Próxima apertura · Fecha por confirmar" line.
                     We deliberately do NOT fall back to endsAt for upcoming
                     — pre-auctions' endsAt is a placeholder and surfacing
                     it as "Termina en …" is the bug Dennis flagged.
          SUSPEND  → static "Fecha prevista de reanudación: <resumeAt>" or
                     "Fecha por confirmar". NEVER a live countdown.
          TERMINAL → nothing. */}
      {countdownTarget ? (
        <div className="rounded-md bg-[--color-surface-muted] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
            {live ? "Tiempo restante" : "Abre en"}
          </div>
          <LiveCountdown
            target={countdownTarget}
            size="lg"
            className="mt-1"
            effectiveStatus={resolvedStatus}
          />
          <div className="mt-1.5 text-xs text-[--color-ink-tertiary] tnum">
            {live
              ? auction.endsAt
                ? `Termina el ${formatDateLong(auction.endsAt)}`
                : null
              : auction.startedAt
                ? `Abre el ${formatDateLong(auction.startedAt)}`
                : null}
          </div>
        </div>
      ) : upcoming ? (
        // PROXIMA without a real opensAt — static, NO countdown, NO fake end.
        <div className="rounded-md bg-[--color-surface-muted] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
            Próxima apertura
          </div>
          <div className="mt-1 text-base text-[--color-ink-quiet]">
            Fecha por confirmar
          </div>
        </div>
      ) : suspended ? (
        // SUSPENDIDA — render resumeAt (or "Fecha por confirmar"), never a
        // countdown to endsAt.
        <div className="rounded-md bg-[--color-surface-muted] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
            Fecha prevista de reanudación
          </div>
          <div className="mt-1 text-base tnum text-[--color-ink-primary]">
            {auction.resumeAt ? (
              formatDateLong(auction.resumeAt)
            ) : (
              <span className="text-[--color-ink-quiet]">Fecha por confirmar</span>
            )}
          </div>
        </div>
      ) : null}

      {/* Current bid */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
          Puja actual
        </div>
        <div className="mt-1 tnum font-serif text-2xl md:text-3xl text-[--color-ink-primary]">
          {formatPrice(auction.currentBid)}
        </div>
      </div>

      {/* Values — Tasación + Valor subasta + Cantidad reclamada are the
          three Dennis-canonical figures (locked 2026-06-04, brief
          `three-values-card-display`). Each is rendered ONLY when present
          (honest-NULL); a value of 0 is treated as absent on the user-visible
          columns since the scraper writes honest-NULL there too. Tasación is
          kept first for continuity with the old layout; Valor subasta sits
          immediately under it so the two BOE-distinct figures read side-by-
          side. Puja mínima, Depósito and Tramo stay below as secondary
          contractual fields. */}
      <dl className="space-y-2 hairline-t pt-4 text-sm">
        {auction.appraisalValue != null && auction.appraisalValue > 0 && (
          <ValueRow label="Tasación" value={formatPrice(auction.appraisalValue)} />
        )}
        {auction.valorSubasta != null && auction.valorSubasta > 0 && (
          <ValueRow label="Valor subasta" value={formatPrice(auction.valorSubasta)} />
        )}
        {auction.claimedAmount != null && auction.claimedAmount > 0 && (
          <ValueRow label="Cantidad reclamada" value={formatPrice(auction.claimedAmount)} />
        )}
        {auction.minimumBid != null && (
          <ValueRow label="Puja mínima" value={formatPrice(auction.minimumBid)} />
        )}
        {auction.depositAmount != null && (
          <ValueRow label="Depósito" value={formatPrice(auction.depositAmount)} />
        )}
        {auction.bidIncrement != null && (
          <ValueRow label="Tramo entre pujas" value={formatPrice(auction.bidIncrement)} />
        )}
      </dl>

      {/* Action cluster — source-aware official-source CTA (QC P1 fix,
          2026-06-07). A PLABI row used to render "Ir al Portal del BOE"
          pointing at plabi.justicia.es; we now resolve the label and href
          per source. Falls back to BOE for BOE/legacy rows. */}
      <div className="space-y-3 hairline-t pt-4">
        {(() => {
          const upper = (auction.source ?? "").trim().toUpperCase();
          const isBoeFamily = upper === "BOE" || upper === "TEJU" || upper === "";
          // PLABI / SEGSOCIAL — use the row's originalSource when present,
          // never the BOE homepage. BOE family keeps the legacy fallback.
          const href = isBoeFamily
            ? (auction.boeLink ?? "https://subastas.boe.es")
            : ((auction as { originalSource?: string | null }).originalSource ?? auction.boeLink ?? null);
          const label = isBoeFamily
            ? "Ir al Portal del BOE"
            : `Ir al portal de ${getSourceLabel(auction.source) ?? "la fuente"}`;
          if (!href) return null;
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors",
                "bg-[--color-action-soft] border border-[--color-action] text-[--color-ink-primary] hover:bg-[--color-action-soft]/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40 focus-visible:ring-offset-2",
              )}
            >
              {label}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          );
        })()}
        <p className="text-[11px] text-[--color-ink-tertiary] text-center">
          Las pujas se realizan únicamente en el portal oficial.
        </p>

        <div className="flex items-stretch gap-2">
          <FollowButton
            auctionId={auction.id}
            initialFollowing={initialFollowing}
            onChange={setFollowing}
            className="flex-1 justify-center"
          />
          <NotifyPrefsPopover
            auctionId={auction.id}
            isFollowing={following}
            triggerVariant="default"
          />
        </div>
      </div>
    </aside>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-[--color-ink-secondary]">{label}</dt>
      <dd className="tnum text-sm text-[--color-ink-primary]">{value}</dd>
    </div>
  );
}
