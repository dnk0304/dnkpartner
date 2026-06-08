"use client";

/**
 * SubscripcionCard — "Tu plan, precios y estado". Consumes GET /api/user/subscription
 * verbatim. NULL-honest dates (— when null). State chip colours map to brand
 * tokens: active = winter-green, trial = amber, expired/none = muted. When the
 * plan is not active we hide the plan rows and show a "Mejora tu cuenta" upgrade
 * panel linking to /precios. The "incluye" list is the 6 features the endpoint
 * forwards from /precios (single source of truth).
 */

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Check, ArrowUpRight } from "lucide-react";
import { AccountSection, DataRow } from "./AccountSection";
import { formatAccountDate } from "./format";
import { cn } from "@/lib/utils";

export type SubscriptionData = {
  isActive: boolean;
  state: "paid-active" | "trial-active" | "trial-expired" | "logged-out";
  plan: string | null;
  priceLabel: string | null;
  status: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndDate: string | null;
  includes: string[];
};

type ChipTone = "live" | "trial" | "muted";

function StateChip({ tone, label }: { tone: ChipTone; label: string }) {
  const styles: Record<ChipTone, string> = {
    live: "bg-[var(--color-status-live-soft)] text-[var(--color-brand)]",
    trial: "bg-[var(--color-warn-attention-soft)] text-[var(--color-warn-attention)]",
    muted: "bg-[var(--color-surface-muted)] text-[var(--color-ink-tertiary)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        styles[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "live"
            ? "bg-[var(--color-status-live)]"
            : tone === "trial"
              ? "bg-[var(--color-warn-attention)]"
              : "bg-[var(--color-ink-tertiary)]",
        )}
      />
      {label}
    </span>
  );
}

export function SubscripcionCard({ sub }: { sub: SubscriptionData }) {
  const t = useTranslations("account");
  const locale = useLocale();

  const { tone, label }: { tone: ChipTone; label: string } =
    sub.state === "paid-active"
      ? { tone: "live", label: t("subStatePaid") }
      : sub.state === "trial-active"
        ? { tone: "trial", label: t("subStateTrial") }
        : sub.state === "trial-expired"
          ? { tone: "muted", label: t("subStateExpired") }
          : { tone: "muted", label: t("subStateInactive") };

  // Trial uses trialEndDate as "fin del servicio"; paid uses currentPeriodEnd.
  const endValue =
    sub.state === "trial-active" || sub.state === "trial-expired"
      ? sub.trialEndDate
      : sub.currentPeriodEnd;

  return (
    <AccountSection
      eyebrow={t("subEyebrow")}
      title={t("subTitle")}
      action={<StateChip tone={tone} label={label} />}
    >
      {sub.isActive ? (
        <dl>
          <DataRow label={t("subPlan")}>{sub.plan ?? "—"}</DataRow>
          <DataRow label={t("subPrice")}>{sub.priceLabel ?? "—"}</DataRow>
          <DataRow label={t("subStart")}>
            {formatAccountDate(sub.currentPeriodStart, locale)}
          </DataRow>
          <DataRow label={t("subEnd")}>{formatAccountDate(endValue, locale)}</DataRow>
        </dl>
      ) : (
        <div
          className="rounded-lg border border-[var(--color-hairline)] p-5 text-center"
          style={{ background: "var(--gradient-accent)" }}
        >
          <h3 className="font-display text-base font-semibold text-[var(--color-ink-primary)]">
            {t("subNoPlanTitle")}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--color-ink-secondary)]">
            {t("subNoPlanLead")}
          </p>
          <Link
            href="/precios"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--color-action)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-cta)] transition-colors hover:bg-[var(--color-action-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-action)]/30"
          >
            {t("subUpgrade")}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {sub.isActive && sub.cancelAtPeriodEnd ? (
        <p className="mt-3 rounded-md bg-[var(--color-warn-attention-soft)] px-3 py-2 text-sm text-[var(--color-warn-attention)]">
          {t("subCancelNote")}
        </p>
      ) : null}

      {/* "incluye" feature list — always shown so even free users see the value. */}
      {sub.includes.length > 0 ? (
        <div className="mt-5 border-t border-[var(--color-hairline-soft)] pt-5">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
            {t("subIncludesTitle")}
          </p>
          <ul className="mt-3 grid gap-2.5">
            {sub.includes.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-[var(--color-ink-secondary)]">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-action-soft)] text-[var(--color-action)]"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AccountSection>
  );
}
