"use client";

/**
 * WhopCheckoutEmbed — embeds the Whop checkout for the Acceso plan
 * (`plan_c4MzcxWSJP7eT`) directly inside the /precios page via an iframe.
 *
 * Why iframe (not the Whop React SDK)?
 *   The Whop embed SDK package + method names change frequently (per Forge's
 *   F#10 brief note). The signed checkout URL is the stable, documented
 *   surface and supports `?embed=true` to render in an iframe-friendly mode.
 *   Once Forge pins a concrete SDK version we can swap the implementation
 *   without touching the parent page — this component is the seam.
 *
 * Identity linking (CRITICAL — see /api/whop/webhook):
 *   We pass the locally-authenticated user's id as `metadata[userId]` on the
 *   checkout URL. Whop echoes it back on every `membership.activated` /
 *   `membership.deactivated` event under `data.metadata.userId`, which is how
 *   the webhook maps the new Whop membership → the local `User` row and
 *   upgrades them to ACCESO. Without this query param the upgrade can still
 *   work via the email fallback, but linking by id is the reliable path.
 *
 * Accessibility:
 *   - The iframe gets `title` (required for a11y) + `loading="lazy"`.
 *   - `allow="payment"` lets Whop's checkout call the Payment Request API
 *     (Apple Pay / Google Pay) where the browser supports it.
 *   - We render a skeleton until `load` fires so users don't stare at a blank
 *     box while the third-party frame initialises.
 */

import * as React from "react";
import { useTranslations } from "next-intl";

export const WHOP_ACCESO_PLAN_ID = "plan_c4MzcxWSJP7eT" as const;
const WHOP_CHECKOUT_BASE = `https://whop.com/checkout/${WHOP_ACCESO_PLAN_ID}` as const;

export type WhopCheckoutEmbedProps = {
  /**
   * The logged-in local user's id. When present, it's attached to the
   * checkout URL as `metadata[userId]=...` so the webhook can link the
   * resulting Whop membership to this local user. When `null`, the parent
   * should render the sign-in prompt instead of this component.
   */
  userId: string;
  /** Optional email passthrough to pre-fill the Whop form. */
  userEmail?: string | null;
  className?: string;
};

export function WhopCheckoutEmbed({
  userId,
  userEmail,
  className,
}: WhopCheckoutEmbedProps) {
  const t = useTranslations("pricing");
  const [loaded, setLoaded] = React.useState(false);

  // Build the checkout URL with the metadata.userId wire-up. We use
  // `metadata[userId]` (bracket form) which Whop's checkout-with-metadata
  // contract accepts and forwards to the membership event payload as
  // `data.metadata.userId` — exactly what the webhook reads.
  const checkoutUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set("embed", "true");
    params.set("metadata[userId]", userId);
    if (userEmail) params.set("email", userEmail);
    return `${WHOP_CHECKOUT_BASE}?${params.toString()}`;
  }, [userId, userEmail]);

  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-xl border border-[--color-hairline] bg-[--color-surface]",
        className ?? "",
      ].join(" ")}
    >
      {!loaded && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-[--color-surface]"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[--color-hairline] border-t-[--color-ink-primary]" />
            <p className="text-sm text-[--color-ink-tertiary]">
              {t("checkoutLoading")}
            </p>
          </div>
        </div>
      )}
      <iframe
        // The data-* attribute makes the wiring trivially inspectable in
        // verification (Pixel paste evidence) and any future debugging.
        data-whop-plan-id={WHOP_ACCESO_PLAN_ID}
        data-whop-metadata-user-id={userId}
        src={checkoutUrl}
        title={t("checkoutHeading")}
        loading="lazy"
        // `payment` is the modern Permissions-Policy token for the Payment
        // Request API; Whop checkout uses it for Apple Pay / Google Pay.
        allow="payment *; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
        className="block h-[720px] w-full border-0"
      />
    </div>
  );
}
