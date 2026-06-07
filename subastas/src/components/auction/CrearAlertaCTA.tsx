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
import { buildAlertPrefill, type AlertPrefill } from "@/lib/alert-prefill";
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
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [navigating, setNavigating] = React.useState(false);

  const prefill: AlertPrefill = React.useMemo(
    () => buildAlertPrefill(auction),
    [auction],
  );

  const isPrimary = variant === "primary";
  const buttonLabel = label ?? "Crear alerta";
  const supportCopy =
    helper ??
    "Te avisamos cuando se publiquen subastas similares a esta.";

  const handleClick = React.useCallback(() => {
    if (status === "unauthenticated") {
      setNavigating(true);
      const back = pathname || "/";
      router.push(`/register?callbackUrl=${encodeURIComponent(back)}`);
      return;
    }
    setOpen(true);
  }, [pathname, router, status]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={navigating}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40 focus-visible:ring-offset-2",
          isPrimary
            ? // Primary — winter-green brand gradient feel via solid brand colour
              "bg-[--color-brand] px-4 py-2.5 text-sm text-white shadow-sm hover:opacity-95"
            : // Ghost — quieter pill for the soft ladder
              "border border-[--color-brand]/30 bg-[--color-brand]/5 px-3 py-2 text-xs text-[--color-ink-primary] hover:bg-[--color-brand]/10",
          navigating && "opacity-70 cursor-progress",
        )}
        aria-label={
          status === "unauthenticated"
            ? `${buttonLabel} — crea tu cuenta para activar`
            : buttonLabel
        }
      >
        {navigating ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Bell className={isPrimary ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        )}
        <span>{buttonLabel}</span>
      </button>
      {!hideHelper && isPrimary && (
        <p className="text-[11px] text-[--color-ink-tertiary]">
          {status === "unauthenticated"
            ? "Crea tu cuenta gratis para recibir avisos por email."
            : supportCopy}
        </p>
      )}
      {status === "authenticated" && (
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
    </div>
  );
}
