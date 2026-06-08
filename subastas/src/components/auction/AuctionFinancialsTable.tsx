"use client";

/**
 * AuctionFinancialsTable — labelled breakdown of every euro figure on the
 * auction (wave-C, 2026-06-07).
 *
 * Consumes the `financials[]` array projected by `/api/auctions/[id]` (see
 * `src/lib/financials.ts` for the canonical ordering + derivation rules).
 * Honest-NULL: rows with `value === null` render "No disponible" — we never
 * fabricate a zero or hide a row that the data layer intentionally surfaced.
 *
 * Derived rows (today: depósito 5%) carry a small "estimado" tag + the
 * server-supplied disclosure note as a tooltip + a screen-reader hint. The
 * tag is intentionally muted — the row stays trustworthy at a glance, the
 * caveat only surfaces when the user pauses on it.
 *
 * Visual: a quiet 2-column table inside a card surface. Right-aligned tnum
 * money column for clean digit stacking. No striping (the row count is
 * fixed at 7 — striping adds noise, not signal).
 *
 * a11y: real <table> with <th scope="row"> on the labels. The "estimado"
 * caveat is paired to its row via aria-describedby so screen readers
 * announce "Depósito (5%) 25.000 €, estimado 5% del valor de subasta".
 */

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type FinancialEntry = {
  key: string;
  label: string;
  value: number | null;
  currency: "EUR";
  derived: boolean;
  note?: string;
};

export type AuctionFinancialsTableProps = {
  financials: FinancialEntry[];
  className?: string;
};

const EUR_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatEuro(value: number | null): string {
  if (value == null) return "No disponible";
  try {
    return EUR_FORMATTER.format(value);
  } catch {
    return `${value} €`;
  }
}

export function AuctionFinancialsTable({
  financials,
  className,
}: AuctionFinancialsTableProps) {
  // Hide entries whose value is null AND would clearly not yet be relevant
  // (final adjudication on a live auction). Keep all other null rows so the
  // user sees the full contractual structure — absence is itself a signal.
  const rows = financials.filter((entry) => {
    if (entry.key === "finalBid" && entry.value == null) return false;
    return true;
  });

  if (rows.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)]",
        className,
      )}
    >
      <table className="w-full text-sm" aria-label="Desglose financiero">
        <caption className="sr-only">
          Desglose financiero de la subasta. Valores en euros. Las filas marcadas
          como estimadas se calculan a partir del valor de subasta.
        </caption>
        <tbody>
          {rows.map((entry, idx) => {
            const noteId = entry.note ? `fin-note-${entry.key}` : undefined;
            const isUnknown = entry.value == null;
            return (
              <tr
                key={entry.key}
                className={cn(
                  idx > 0 && "border-t border-[var(--color-hairline)]",
                )}
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-normal text-[var(--color-ink-secondary)]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span>{entry.label}</span>
                    {entry.derived && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-tertiary)]"
                        title={entry.note ?? "Valor estimado"}
                        aria-describedby={noteId}
                      >
                        <Info className="h-2.5 w-2.5" aria-hidden="true" />
                        estimado
                      </span>
                    )}
                  </span>
                  {entry.note && (
                    <span id={noteId} className="sr-only">
                      {entry.note}
                    </span>
                  )}
                </th>
                <td
                  className={cn(
                    "px-4 py-3 text-right tnum",
                    isUnknown
                      ? "text-[var(--color-ink-quiet)]"
                      : "font-medium text-[var(--color-ink-primary)]",
                  )}
                >
                  {formatEuro(entry.value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
