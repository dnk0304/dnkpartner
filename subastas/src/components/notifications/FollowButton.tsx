"use client";

/**
 * FollowButton — the canonical "Seguir" / "Siguiendo" control.
 *
 * Used in:
 *   - Auction cards (compact)
 *   - Wave 3 detail page (default)
 *   - Demo route /notifications/demo
 *
 * UX rules (per UX vision + Wave 2 brief):
 *   - "Seguir" (Follow) and "Alertas" (notify-prefs) are DISTINCT verbs.
 *     This button only handles follow/unfollow. Prefs live in NotifyPrefsPopover.
 *   - Optimistic toggle with server rollback on error.
 *   - Logged-out: button is enabled and directs to /login?callbackUrl=...
 *     (anonymous magic-link follow flagged BLOCKED — no API contract).
 *   - Visual tokens: judicial blue #1F3A5F / off-white #FBF8F3 / gold #B08A3E
 *     so it matches Wave 3 without depending on Wave 3 components.
 *
 * API:
 *   POST   /api/follows               { auctionId }
 *   DELETE /api/follows/[auctionId]
 */

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BookmarkPlus, BookmarkCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-path";
import { cn } from "@/lib/utils";

export type FollowButtonProps = {
  auctionId: string;
  initialFollowing?: boolean;
  /** "default" = primary button, "compact" = icon + label suited to cards */
  variant?: "default" | "compact" | "icon";
  /** Callback fired on every successful follow-state change. */
  onChange?: (following: boolean) => void;
  className?: string;
};

type LoadState = "idle" | "loading";

export function FollowButton({
  auctionId,
  initialFollowing = false,
  variant = "default",
  onChange,
  className,
}: FollowButtonProps) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = React.useState(initialFollowing);
  const [loadState, setLoadState] = React.useState<LoadState>("idle");
  const [error, setError] = React.useState<string | null>(null);

  // Sync external truth (e.g. server-rendered detail page rehydration).
  React.useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  const handleClick = React.useCallback(async () => {
    if (loadState === "loading") return;

    if (status === "unauthenticated") {
      // Take the user to account creation then back here (wave-C, 2026-06-07):
      // following an auction is the ONE gated action on the now-public detail
      // page. We send logged-out users to /register (not /login) — they almost
      // certainly need to create an account first, and /register has a "ya
      // tengo cuenta" link inline for the rare returning user.
      const back = pathname || "/";
      router.push(`/register?callbackUrl=${encodeURIComponent(back)}`);
      return;
    }

    setError(null);
    const next = !following;
    setFollowing(next); // optimistic
    setLoadState("loading");

    try {
      const res = next
        ? await apiFetch("/api/follows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ auctionId }),
          })
        : await apiFetch(`/api/follows/${encodeURIComponent(auctionId)}`, {
            method: "DELETE",
          });

      if (!res.ok) {
        // Rollback.
        setFollowing(!next);
        setError(`server_${res.status}`);
        return;
      }

      onChange?.(next);
    } catch {
      setFollowing(!next);
      setError("network_error");
    } finally {
      setLoadState("idle");
    }
  }, [auctionId, following, loadState, onChange, pathname, router, status]);

  const isLoading = loadState === "loading";

  // --- Visual variants ---
  // The judicial-blue palette: #1F3A5F primary, gold #B08A3E for "active".
  // We embed these as inline style fallbacks because the project's
  // global tokens are oklch-based and we want zero risk of drifting
  // out of the brand spec while Wave 3 hasn't locked Tailwind tokens.

  const labelFollow = "Seguir";
  const labelFollowing = "Siguiendo";

  const sharedFocus =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1F3A5F]";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-pressed={following}
        aria-label={following ? labelFollowing : labelFollow}
        title={following ? labelFollowing : labelFollow}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          following
            ? "border-[#B08A3E] bg-[#B08A3E]/10 text-[#B08A3E]"
            : "border-[#1F3A5F]/25 bg-white text-[#1F3A5F] hover:bg-[#1F3A5F]/5",
          isLoading && "opacity-70 cursor-progress",
          sharedFocus,
          className,
        )}
        data-state={following ? "following" : "follow"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : following ? (
          <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
        ) : (
          <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-pressed={following}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-full border transition-colors",
          following
            ? "border-[#B08A3E] bg-[#B08A3E]/10 text-[#B08A3E]"
            : "border-[#1F3A5F]/25 bg-white text-[#1F3A5F] hover:bg-[#1F3A5F]/5",
          isLoading && "opacity-70 cursor-progress",
          sharedFocus,
          className,
        )}
        data-state={following ? "following" : "follow"}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : following ? (
          <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span>{following ? labelFollowing : labelFollow}</span>
        {error && <span className="sr-only">Error: reintentar</span>}
      </button>
    );
  }

  // default variant — uses shadcn Button for size/focus consistency,
  // colors overridden to brand tokens via inline style.
  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={isLoading}
      aria-pressed={following}
      data-state={following ? "following" : "follow"}
      className={cn(
        "gap-2 rounded-md border font-medium transition-colors",
        following
          ? "border-[#B08A3E] bg-[#B08A3E]/10 text-[#B08A3E] hover:bg-[#B08A3E]/15"
          : "border-[#1F3A5F]/30 text-[#1F3A5F] hover:bg-[#1F3A5F]/5",
        sharedFocus,
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : following ? (
        <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
      ) : (
        <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{following ? labelFollowing : labelFollow}</span>
    </Button>
  );
}
