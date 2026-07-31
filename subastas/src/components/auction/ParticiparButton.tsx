"use client";

/**
 * ParticiparButton — the auth-gated "Participar" call-to-action (wave169).
 *
 * The user's entry point to the OFFICIAL auction (where a bid is placed). The
 * official URL is NEVER a prop here and never touches the DOM — this is a real
 * <button> (no href) that only ever knows the auction `id`. All resolution +
 * gating happens server-side in GET /api/participar/[id].
 *
 * CONTRACT (everything a caller — card or detail — must pass):
 *   - `auctionId` (required): the auction id. That's the whole payload.
 *   - `slug` (optional): the detail-page slug, used ONLY to build the
 *     post-registration `next` for logged-out users so they return to the
 *     right auction. When omitted we fall back to the current pathname (correct
 *     on the detail page itself); if that too is unavailable the server route
 *     rebuilds the slug on the anonymous redirect anyway, so the button is
 *     always correct — slug just makes the logged-out same-tab UX nicer.
 *
 * Behaviour (auth pattern mirrors CrearAlertaCTA):
 *   - unauthenticated → same-tab navigate to /register?next=<detail> (sign-up).
 *   - authenticated / loading → open /api/participar/<id> in a new tab; the
 *     server 302s to the official URL (or to /register if the session turns out
 *     to be absent — the route is safe on its own).
 *
 * NOTE (Forge → Pixel): this is the FUNCTIONAL contract implementation. Pixel
 * owns the final visual design (P1) and the card-surface placements (P2); the
 * styling here is deliberately minimal (reuses the existing action-button
 * classes) so the detail page is coherent and buildable in the meantime.
 */

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type ParticiparButtonProps = {
  auctionId: string;
  /** Detail-page slug for the logged-out post-register `next`. Optional. */
  slug?: string | null;
  /** Visual variant. "primary" = solid CTA; "soft" = bordered secondary. */
  variant?: "primary" | "soft";
  /** Label override. Defaults to "Participar". */
  label?: string;
  /** Accessible label override. */
  ariaLabel?: string;
  className?: string;
};

export function ParticiparButton({
  auctionId,
  slug,
  variant = "primary",
  label = "Participar",
  ariaLabel = "Participar en esta subasta oficial",
  className,
}: ParticiparButtonProps) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, setNavigating] = React.useState(false);

  const handleClick = React.useCallback(() => {
    if (status === "unauthenticated") {
      setNavigating(true);
      const dest = slug ? `/subastas/subasta/${slug}` : pathname || "/";
      const enc = encodeURIComponent(dest);
      router.push(`/register?callbackUrl=${enc}&next=${enc}`);
      return;
    }
    // Authenticated (or still loading — the server route is safe either way):
    // open the gated redirect in a new tab. The official URL is resolved
    // server-side and never appears in this document.
    window.open(`/api/participar/${auctionId}`, "_blank", "noopener");
  }, [status, slug, pathname, auctionId, router]);

  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={navigating}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40 focus-visible:ring-offset-2",
        isPrimary
          ? "bg-[var(--color-action)] text-white hover:bg-[var(--color-action-hover)]"
          : "border border-[var(--color-action)] bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] hover:bg-[var(--color-action-soft)]/80",
        navigating && "opacity-70 cursor-progress",
        className,
      )}
    >
      {label}
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
