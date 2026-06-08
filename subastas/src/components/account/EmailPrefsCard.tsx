"use client";

/**
 * EmailPrefsCard — "Preferencias de email". Three checkboxes backed by
 * GET/PUT /api/user/email-preferences. Toggling is optimistic: we flip the UI
 * immediately, PUT only the changed key, and revert that key if the request
 * fails (surfacing a small inline error). Each row is a label-wrapped checkbox
 * so the whole row is a click/tap target and screen readers announce the hint.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api-path";
import { AccountSection } from "./AccountSection";

export type EmailPrefs = {
  newsletter: boolean;
  weeklyNoNew: boolean;
  radar: boolean;
};

type PrefKey = keyof EmailPrefs;

export function EmailPrefsCard({ initial }: { initial: EmailPrefs }) {
  const t = useTranslations("account");
  const [prefs, setPrefs] = React.useState<EmailPrefs>(initial);
  const [error, setError] = React.useState<string | null>(null);
  // Track in-flight keys so a toggle can't double-fire while saving.
  const [pending, setPending] = React.useState<Set<PrefKey>>(new Set());

  const rows: { key: PrefKey; label: string; hint: string }[] = [
    { key: "newsletter", label: t("prefsNewsletter"), hint: t("prefsNewsletterHint") },
    { key: "weeklyNoNew", label: t("prefsWeekly"), hint: t("prefsWeeklyHint") },
    { key: "radar", label: t("prefsRadar"), hint: t("prefsRadarHint") },
  ];

  const toggle = async (key: PrefKey, nextValue: boolean) => {
    if (pending.has(key)) return;
    setError(null);
    setPrefs((p) => ({ ...p, [key]: nextValue }));
    setPending((s) => new Set(s).add(key));
    try {
      const res = await apiFetch("/api/user/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      if (!res.ok) throw new Error("save failed");
      const body = await res.json().catch(() => null);
      // Reconcile with the server's authoritative post-update state.
      if (body?.prefs) setPrefs(body.prefs as EmailPrefs);
    } catch {
      // Revert just the failed key.
      setPrefs((p) => ({ ...p, [key]: !nextValue }));
      setError(t("prefsError"));
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <AccountSection eyebrow={t("prefsEyebrow")} title={t("prefsTitle")}>
      <p className="text-sm text-[var(--color-ink-secondary)]">{t("prefsLead")}</p>
      <ul className="mt-4 grid gap-1">
        {rows.map(({ key, label, hint }, i) => {
          const id = `pref-${key}`;
          return (
            <li
              key={key}
              className={
                i > 0 ? "border-t border-[var(--color-hairline-soft)] pt-3 mt-3" : ""
              }
            >
              <label
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3"
              >
                <Checkbox
                  id={id}
                  checked={prefs[key]}
                  onCheckedChange={(c) => toggle(key, c === true)}
                  className="mt-0.5 data-[state=checked]:border-[var(--color-action)] data-[state=checked]:bg-[var(--color-action)] data-[state=checked]:text-white"
                  aria-describedby={`${id}-hint`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--color-ink-primary)]">
                    {label}
                  </span>
                  <span
                    id={`${id}-hint`}
                    className="mt-0.5 block text-sm text-[var(--color-ink-tertiary)]"
                  >
                    {hint}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--color-warn-critical)]">
          {error}
        </p>
      ) : null}
    </AccountSection>
  );
}
