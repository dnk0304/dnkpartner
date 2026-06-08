"use client";

/**
 * FacturasCard — "Historial de facturas". The endpoint returns [] today, so the
 * live path is the empty state ("No hay facturas disponibles") plus a reassuring
 * note. The list markup is built so that when Forge wires real invoices the same
 * component renders rows (fecha / importe / estado / Ver) without a contract
 * change.
 */

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText, ArrowUpRight } from "lucide-react";
import { AccountSection } from "./AccountSection";
import { formatAccountDate, formatAmount } from "./format";

export type Invoice = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  url: string | null;
};

export function FacturasCard({ invoices }: { invoices: Invoice[] }) {
  const t = useTranslations("account");
  const locale = useLocale();

  return (
    <AccountSection eyebrow={t("invoicesEyebrow")} title={t("invoicesTitle")}>
      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-hairline)] bg-[var(--color-surface-muted)]/40 px-5 py-10 text-center">
          <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-[var(--color-ink-tertiary)] shadow-sm">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="font-medium text-[var(--color-ink-primary)]">
            {t("invoicesEmpty")}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--color-ink-tertiary)]">
            {t("invoicesEmptyNote")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-hairline)] text-left text-xs uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t("invoicesDate")}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t("invoicesAmount")}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t("invoicesStatus")}
                </th>
                <th scope="col" className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
                >
                  <td className="py-3 pr-4 text-[var(--color-ink-primary)] tnum">
                    {formatAccountDate(inv.date, locale)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-primary)] tnum">
                    {formatAmount(inv.amount, inv.currency, locale)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-secondary)]">
                    {inv.status}
                  </td>
                  <td className="py-3 text-right">
                    {inv.url ? (
                      <a
                        href={inv.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--color-action)] hover:text-[var(--color-action-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-action)]/30"
                      >
                        {t("invoicesView")}
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-[var(--color-ink-quiet)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountSection>
  );
}
