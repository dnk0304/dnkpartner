"use client";

/**
 * CrearAlertaCTA — the page's primary money CTA.
 *
 * Renders a "Crear alerta" button that opens AlertsModal pre-filled from
 * the current auction (via `buildAlertPrefill`). The popup itself is fully
 * accessible (focus-trapped Radix Dialog inside AlertsModal).
 *
 * Logged-out path: instead of opening the form, we route the user to
 * /register?callbackUrl=... — the alert POST is the one gated action on
 * this otherwise public page. The button is NEVER disabled; logged-out
 * users get the value prop + a clear next step ("Crea tu cuenta para
 * recibir avisos").
 *
 * The component also exposes a `variant` so it can be reused as both the
 * sticky button near the title AND the repeated CTA after the financial
 * table (marketing M8). Both placements share the same prefill + auth-gate
 * logic, only the visual is tuned.
 *
 * Soft conversion ladder (marketing M5): the `ladder` slot accepts extra
 * actions (Guardar favorita / Envíame similares) that render alongside the
 * primary CTA. We do not own those buttons here — the consumer composes
 * them — but we provide a layout shell that keeps them visually balanced
 * against the primary CTA.
 */

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, Loader2 } from "lucide-react";
import { AlertsModal } from "@/components/dashboard/AlertsModal";
import { UpgradeModal } from "@/components/dashboard/UpgradeModal";
import { buildAlertPrefill, type AlertPrefill } from "@/lib/alert-prefill";
import { useAccess } from "@/lib/access-client";
import { cn } from "@/lib/utils";

type AuctionLike = Parameters<typeof buildAlertPrefill>[0];

export type CrearAlertaCTAProps = {
  auction: AuctionLike;
  /**
   * "primary" — full button with icon + label, used near the title and after
   * the financial table.
   * "ghost" — lighter pill, for the secondary "Envíame similares" call-out
   * inside the soft conversion ladder.
   */
  variant?: "primary" | "ghost";
  /** Label override (e.g. "Envíame similares" for the soft-ladder variant). */
  label?: string;
  /** Optional support copy under the button. Defaults to the marketing copy. */
  helper?: string | null;
  /** Hide the helper line entirely. */
  hideHelper?: boolean;
  className?: string;
};

export function CrearAlertaCTA({
  auction,
  variant = "primary",
  label,
  helper,
  hideHelper = false,
  className,
}: CrearAlertaCTAProps) {
  const { status } = useSession();
  const access = useAccess();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [navigating, setNavigating] = React.useState(false);

  const prefill: AlertPrefill = React.useMemo(
    () => buildAlertPrefill(auction),
    [auction],
  );

  const isPrimary = variant === "primary";
  const buttonLabel = label ?? "Crear alerta";
  // The button label changes based on access tier — logged-out users see
  // the original "Crear alerta" framing; free logged-in users see the
  // paid-prompt framing inline so they know what's behind the click.
  // The API (wave-B1) returns 402 for free logged-in callers; we short-
  // circuit on the client to avoid the round-trip.
  const isLoggedOut = status === "unauthenticated";
  const isFreeLoggedIn = !isLoggedOut && status === "authenticated" && !access.hasFullAccess && !access.loading;
  const effectiveLabel = label
    ? buttonLabel
    : isFreeLoggedIn
      ? "Activa el plan Acceso para alertas"
      : buttonLabel;
  const supportCopy =
    helper ??
    (isFreeLoggedIn
      ? "Las alertas requieren el plan Acceso. Sigue navegando gratis."
      : "Te avisamos cuando se publiquen subastas similares a esta.");

  const handleClick = React.useCallback(() => {
    if (isLoggedOut) {
      setNavigating(true);
      const back = pathname || "/";
      // Brief asks for `?next=` — but the rest of the app uses `callbackUrl`.
      // Send BOTH so /register can read either.
      router.push(`/register?callbackUrl=${encodeURIComponent(back)}&next=${encodeURIComponent(back)}`);
      return;
    }
    if (isFreeLoggedIn) {
      // Paid surface — show the upgrade modal directly. The API would 402
      // on submit anyway; this surfaces the boundary up-front instead of
      // letting the user fill the form and hit a wall.
      setUpgradeOpen(true);
      return;
    }
    setOpen(true);
  }, [isLoggedOut, isFreeLoggedIn, pathname, router]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={navigating}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40 focus-visible:ring-offset-2",
          isPrimary
            ? // Primary — solid action-green CTA (saturated; the gradient
              // is intentionally absent here so the call to action stays
              // strong after the site-wide gradient was toned down).
              "bg-[var(--color-action)] px-4 py-2.5 text-sm text-white shadow-sm hover:bg-[var(--color-action-hover)] focus-visible:ring-[var(--color-action)]/40"
            : // Ghost — quieter pill for the soft ladder
              "border border-[var(--color-action)]/30 bg-[var(--color-action)]/5 px-3 py-2 text-xs text-[var(--color-ink-primary)] hover:bg-[var(--color-action)]/10 focus-visible:ring-[var(--color-action)]/40",
          navigating && "opacity-70 cursor-progress",
        )}
        aria-label={
          isLoggedOut
            ? `${effectiveLabel} — crea tu cuenta para activar`
            : isFreeLoggedIn
              ? `${effectiveLabel} — activa el plan Acceso`
              : effectiveLabel
        }
      >
        {navigating ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Bell className={isPrimary ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        )}
        <span>{effectiveLabel}</span>
      </button>
      {!hideHelper && isPrimary && (
        <p className="text-[11px] text-[var(--color-ink-tertiary)]">
          {isLoggedOut
            ? "Crea tu cuenta gratis para gestionar tus alertas (plan Acceso)."
            : supportCopy}
        </p>
      )}
      {status === "authenticated" && access.hasFullAccess && (
        <AlertsModal
          open={open}
          onOpenChange={setOpen}
          initialProvince={prefill.initialProvince}
          initialMunicipality={prefill.initialMunicipality}
          initialCategory={prefill.initialCategory}
          initialSource={prefill.initialSource}
          initialAuctionType={prefill.initialAuctionType}
          initialMinPrice={prefill.initialMinPrice}
          initialMaxPrice={prefill.initialMaxPrice}
        />
      )}
      {isFreeLoggedIn && (
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      )}
    </div>
  );
}
