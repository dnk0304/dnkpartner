"use client";

/**
 * RegistroTable — Direction B comparison-register view.
 *
 * The dense "news comparison page / Bloomberg terminal" rendering.
 * Inspiration: Idealista list, El País data tables. One row per auction,
 * all-black ink, tnum numerals, hairline dividers, single status dot
 * per row, warn-flag column for time/risk facts. No zebra stripes.
 *
 * Mobile: collapses to AuctionListCard via the parent's view-toggle
 * (this component is desktop-first ≥md).
 */

import * as React from "react";
import Link from "next/link";
import { AuctionItem } from "@/types";
import { StatusDot } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import {
  formatPrice,
  capitalize,
  titleCase,
  displayTitle,
  daysLeft,
} from "./format";
import { getStatusMeta, effectiveStatus } from "./status";
import type { AuctionStatus } from "@/types";
import { WarnFlag } from "./WarnFlag";
import { cn } from "@/lib/utils";

type Props = {
  items: AuctionItem[];
  /**
   * Server-sampled epoch ms for the initial render, threaded down from the
   * owning server component. Required with no default on purpose — see the
   * `nowMs` doc on LiveCountdownProps for the React #418 hydration contract.
   */
  nowMs: number;
  className?: string;
};

export function RegistroTable({ items, nowMs, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] overflow-hidden",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-muted)] text-[10px] uppercase tracking-wider text-[var(--color-ink-tertiary)]">
            <tr className="text-left">
              <th className="py-2.5 pl-4 pr-3 font-semibold">Estado</th>
              <th className="py-2.5 pr-3 font-semibold">Subasta</th>
              <th className="hidden lg:table-cell py-2.5 pr-3 font-semibold">Ubicación</th>
              <th className="py-2.5 pr-3 text-right font-semibold">Tasación</th>
              <th className="py-2.5 pr-3 text-right font-semibold">Puja mín.</th>
              <th className="hidden md:table-cell py-2.5 pr-3 font-semibold">Cierre</th>
              <th className="hidden xl:table-cell py-2.5 pr-4 font-semibold">Avisos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-hairline-soft)]">
            {items.map((it) => (
              <RegistroRow key={it.id} item={it} nowMs={nowMs} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegistroRow({
  item,
  nowMs,
}: {
  item: AuctionItem;
  /** Server-sampled epoch ms — see LiveCountdownProps#nowMs (React #418). */
  nowMs: number;
}) {
  // Clock-wins: if the DB still says celebrandose/proxima but endDate is in
  // the past (stale row not yet swept), every status-driven cell in this row
  // — ESTADO column, countdown, warn-flags — must agree it's concluded.
  // Otherwise ESTADO ("CELEBRÁNDOSE") contradicts CIERRE ("Finalizada"),
  // which is the exact bug Dennis screenshotted.
  const effective = effectiveStatus(item.status, item.endDate) as AuctionStatus;
  const meta = getStatusMeta(effective);
  const where = [
    item.municipality && titleCase(item.municipality),
    item.province && capitalize(item.province),
  ]
    .filter(Boolean)
    .join(" · ");
  const title = displayTitle(item);
  const dl = daysLeft(item.endDate);
  const critical = dl != null && dl <= 1 && effective !== "concluida-portal" && effective !== "finalizada-autoridad";
  const attention = dl != null && dl > 1 && dl <= 3;

  // Build small warn-flag set for the Avisos column.
  const flags: Array<React.ReactNode> = [];
  if (critical) {
    flags.push(
      <WarnFlag key="c" level="critical">
        Cierre &lt;24 h
      </WarnFlag>
    );
  } else if (attention) {
    flags.push(
      <WarnFlag key="a" level="attention">
        Cierre &lt;72 h
      </WarnFlag>
    );
  }
  if (effective === "suspendida") {
    flags.push(
      <WarnFlag key="s" level="attention">
        Suspendida
      </WarnFlag>
    );
  }
  if (item.boeLink) {
    flags.push(
      <WarnFlag key="b" level="positive">
        BOE oficial
      </WarnFlag>
    );
  }

  return (
    <tr
      className={cn(
        "group transition-colors hover:bg-[var(--color-action-soft)]/40",
        critical && "warn-bar-critical"
      )}
    >
      <td className="py-3 pl-4 pr-3 align-top">
        <Link
          href={`/auction/${encodeURIComponent(item.id)}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-primary)]"
          aria-label={`Estado: ${meta.label}`}
        >
          <StatusDot status={effective} size={8} />
          <span className="whitespace-nowrap">{meta.label}</span>
        </Link>
      </td>
      <td className="py-3 pr-3 align-top min-w-0">
        <Link
          href={`/auction/${encodeURIComponent(item.id)}`}
          className="block font-semibold text-[var(--color-ink-primary)] hover:text-[var(--color-action)] line-clamp-2"
        >
          {title}
        </Link>
        <div className="lg:hidden mt-0.5 text-[12px] text-[var(--color-ink-tertiary)] truncate">
          {where || "Ubicación no disponible"}
        </div>
      </td>
      <td className="hidden lg:table-cell py-3 pr-3 align-top text-[13px] text-[var(--color-ink-primary)]">
        {where || <span className="text-[var(--color-ink-quiet)]">Ubicación no disponible</span>}
      </td>
      <td className="py-3 pr-3 align-top text-right tnum font-semibold text-[var(--color-ink-primary)] whitespace-nowrap">
        {formatPrice(item.appraisalValue)}
      </td>
      <td className="py-3 pr-3 align-top text-right tnum font-semibold text-[var(--color-ink-primary)] whitespace-nowrap">
        {formatPrice(item.minimumBid)}
      </td>
      <td className="hidden md:table-cell py-3 pr-3 align-top text-[12px] text-[var(--color-ink-primary)] whitespace-nowrap">
        {item.endDate ? (
          <LiveCountdown target={item.endDate} size="sm" effectiveStatus={effective} nowMs={nowMs} />
        ) : (
          <span className="text-[var(--color-ink-quiet)]">—</span>
        )}
      </td>
      <td className="hidden xl:table-cell py-3 pr-4 align-top">
        <div className="flex flex-wrap gap-1">{flags}</div>
      </td>
    </tr>
  );
}
