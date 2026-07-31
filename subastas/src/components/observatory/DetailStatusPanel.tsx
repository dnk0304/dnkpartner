"use client";

/**
 * DetailStatusPanel — the consolidated sticky right-rail "summary card" on
 * the detail page.
 *
 * 2026-06-07 redesign (subastasia move 1): ONE rounded, soft-shadowed white
 * panel holding the entire summary intel. Big bold starting bid (valor
 * subasta) at the top; muted tasación directly beneath; dates + live
 * countdown; the source-aware CTA. Soft shadow is the ONE deliberate
 * exception to our flat/hairline rule on this page.
 *
 * The panel docks sticky-top once the user scrolls past the hero so the live
 * countdown and "Ir al Portal del BOE" CTA never leave the viewport on
 * desktop. On mobile it lives above the description (not sticky — the mobile
 * action bar handles the persistent CTAs).
 *
 * PLABI rows have NO end date (CELEBRÁNDOSE without endsAt). The countdown
 * block hides gracefully in that case — never an empty "Tiempo restante /
 * Fecha por confirmar" pill (QC fix, Pixel 2026-06-07).
 */

import * as React from "react";
import { AuctionItem } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { NotifyPrefsPopover } from "@/components/notifications/NotifyPrefsPopover";
import { CrearAlertaCTA } from "@/components/auction/CrearAlertaCTA";
import { ParticiparButton } from "@/components/auction/ParticiparButton";
import { formatPrice, formatDateLong } from "./format";
import { getStatusMeta, isLive, isUpcoming, effectiveStatus } from "./status";
import { statusDateLabel } from "@/lib/auction-status";
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

  const [following, setFollowing] = React.useState(initialFollowing);

  // Price hierarchy (subastasia move 2): BIG BOLD starting bid (valorSubasta)
  // on top; MUTED tasación under as the valuation. Honest-NULL: when one is
  // missing, the other becomes the headline figure.
  const hasValorSubasta = auction.valorSubasta != null && auction.valorSubasta > 0;
  const hasAppraisal = auction.appraisalValue != null && auction.appraisalValue > 0;
  const headlinePrice = hasValorSubasta
    ? auction.valorSubasta
    : hasAppraisal
      ? auction.appraisalValue
      : null;
  const headlineLabel = hasValorSubasta ? "Valor subasta" : "Tasación";
  // Show the secondary line ONLY when the headline is the bid (valorSubasta)
  // and the appraisal is ALSO present — so the comparison reads as the
  // "good deal" story.
  const secondaryAppraisal = hasValorSubasta && hasAppraisal ? auction.appraisalValue : null;

  return (
    <aside
      className={cn(
        "summary-card p-5 md:p-6 space-y-5",
        className,
      )}
      aria-labelledby="detail-state-heading"
    >
      <header className="flex items-start justify-between gap-3">
        <h2 id="detail-state-heading" className="sr-only">
          Resumen y estado de la subasta
        </h2>
        <div>
          <StatusBadge status={resolvedStatus} size="lg" />
          <p className="mt-2 text-xs text-[var(--color-ink-tertiary)]">{meta.helper}</p>
        </div>
      </header>

      {/* Price hierarchy — BIG BOLD bid, muted tasación under. */}
      {headlinePrice != null && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
            {headlineLabel}
          </div>
          <div className="mt-1 font-serif text-[2.25rem] md:text-[2.5rem] font-semibold leading-none tracking-tight tnum text-[var(--color-ink-primary)]">
            {formatPrice(headlinePrice)}
          </div>
          {secondaryAppraisal != null && (
            <div className="mt-1.5 text-xs text-[var(--color-ink-tertiary)] tnum">
              Tasación {formatPrice(secondaryAppraisal)}
            </div>
          )}
        </div>
      )}

      {/* Current bid — only when truly distinct (and present). */}
      {auction.currentBid != null && auction.currentBid > 0 && (
        <div className="hairline-t pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-tertiary)]">
            Puja actual
          </div>
          <div className="mt-1 tnum text-2xl font-semibold text-[var(--color-ink-primary)]">
            {formatPrice(auction.currentBid)}
          </div>
        </div>
      )}

      {/* Status-branched date / countdown block (Wave52, Pixel 2026-06-04).
          LIVE     → ticking countdown to endsAt.
          UPCOMING → ticking countdown to opensAt when set; otherwise hide
                     gracefully (PLABI-style rows have no opens/endsAt).
          SUSPEND  → static "Fecha prevista de reanudación: <resumeAt>" or
                     "Fecha por confirmar". NEVER a live countdown.
          TERMINAL → nothing.

          QC fix (Pixel 2026-06-07): PLABI rows are CELEBRÁNDOSE with NO
          endsAt — previously rendered an empty "Tiempo restante" pill. Now
          the entire block is suppressed when countdownTarget is null AND
          the row is live (no resumeAt either). */}
      {countdownTarget ? (
        <div className="rounded-lg bg-[var(--color-surface-muted)] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-tertiary)]">
            {live ? "Tiempo restante" : "Abre en"}
          </div>
          <LiveCountdown
            target={countdownTarget}
            size="lg"
            className="mt-1"
            effectiveStatus={resolvedStatus}
          />
          <div className="mt-1.5 text-xs text-[var(--color-ink-tertiary)] tnum">
            {live
              ? auction.endsAt
                ? `Termina el ${formatDateLong(auction.endsAt)}`
                : null
              : auction.startedAt
                ? `Abre el ${formatDateLong(auction.startedAt)}`
                : null}
          </div>
        </div>
      ) : suspended ? (
        // SUSPENDIDA — render resumeAt (or "Fecha por confirmar"), never a
        // countdown to endsAt.
        <div className="rounded-lg bg-[var(--color-surface-muted)] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-tertiary)]">
            Fecha prevista de reanudación
          </div>
          <div className="mt-1 text-base tnum text-[var(--color-ink-primary)]">
            {auction.resumeAt ? (
              formatDateLong(auction.resumeAt)
            ) : (
              <span className="text-[var(--color-ink-quiet)]">Fecha por confirmar</span>
            )}
          </div>
        </div>
      ) : null}

      {/* Secondary contractual figures — Puja mín., Depósito, Tramo,
          Cantidad reclamada. Keep them as a quiet stack under the headline
          price (honest-NULL: each row is gated on its own value). */}
      {(auction.claimedAmount || auction.minimumBid || auction.depositAmount || auction.bidIncrement) && (
        <dl className="space-y-2 hairline-t pt-4 text-sm">
          {auction.claimedAmount != null && auction.claimedAmount > 0 && (
            <ValueRow label="Cantidad reclamada" value={formatPrice(auction.claimedAmount)} />
          )}
          {auction.minimumBid != null && auction.minimumBid > 0 && (
            <ValueRow label="Puja mínima" value={formatPrice(auction.minimumBid)} />
          )}
          {auction.depositAmount != null && auction.depositAmount > 0 && (
            <ValueRow label="Depósito" value={formatPrice(auction.depositAmount)} />
          )}
          {auction.bidIncrement != null && auction.bidIncrement > 0 && (
            <ValueRow label="Tramo entre pujas" value={formatPrice(auction.bidIncrement)} />
          )}
        </dl>
      )}

      {/* Action cluster — the gated "Participar" CTA (wave169). The official
          auction URL is NO LONGER rendered here; it is resolved server-side by
          GET /api/participar/[id] behind the login gate. The button carries
          only auction.id — no official URL ever reaches this DOM. Logged-out
          users are routed to sign-up; logged-in users open the official portal
          in a new tab. */}
      <div className="space-y-3 hairline-t pt-4">
        <ParticiparButton auctionId={auction.id} />
        <p className="text-[11px] text-[var(--color-ink-tertiary)] text-center">
          Las pujas se realizan únicamente en el portal oficial.
        </p>

        {/* Alert CTA — now PAID-gated (wave-B1). Logged-out → /register;
            free logged-in → upgrade prompt; trial/paid → opens AlertsModal.
            CrearAlertaCTA handles all three paths. */}
        <CrearAlertaCTA auction={auction as unknown as Parameters<typeof CrearAlertaCTA>[0]["auction"]} hideHelper className="[&_button]:w-full" />

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
      <dt className="text-xs text-[var(--color-ink-secondary)]">{label}</dt>
      <dd className="tnum text-sm text-[var(--color-ink-primary)]">{value}</dd>
    </div>
  );
}
