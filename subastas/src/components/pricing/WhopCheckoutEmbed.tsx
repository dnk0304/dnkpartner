"use client";

/**
 * WhopCheckoutEmbed — renders Whop's official embedded checkout for the
 * Acceso plan (`plan_c4MzcxWSJP7eT`) inside the /precios page.
 *
 * Why the official package (and not a raw iframe)
 * -----------------------------------------------
 * Whop's checkout response (`https://whop.com/checkout/<plan>`) returns
 * `Content-Security-Policy: frame-ancestors 'self' https://app.contentful.com`
 * + `X-Frame-Options: SAMEORIGIN`, so a hand-rolled `<iframe>` is blocked by
 * the browser (`ERR_BLOCKED_BY_RESPONSE`) and the user sees a blank box.
 * The `@whop/checkout/react` package mounts an iframe against an
 * EMBED-friendly Whop origin and is the only supported way to embed.
 *
 * Identity linking (CRITICAL — see /api/whop/webhook)
 * ----------------------------------------------------
 * The official embed has NO `metadata` prop — you can only attach metadata by
 * creating a checkout configuration server-side via the Whop API and passing
 * the returned id (`ch_…`) as `sessionId`. That's what `/api/whop/checkout-session`
 * does: it auth-gates, calls Whop with `metadata: { userId, email }`, and
 * returns the `ch_…` id. Whop then echoes the metadata back on every
 * `membership.activated` / `membership.deactivated` event under
 * `data.metadata.userId`, which the webhook reads to upgrade the local User.
 *
 * Render flow
 * -----------
 *   1. Mount with a skeleton.
 *   2. POST /api/whop/checkout-session to mint a session id bound to userId.
 *   3. Render <WhopCheckoutEmbed sessionId={…} prefill={{ email }} />.
 *   4. On error, surface a retry control — never silently leave a blank box.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { WhopCheckoutEmbed as OfficialWhopCheckoutEmbed } from "@whop/checkout/react";

export const WHOP_ACCESO_PLAN_ID = "plan_c4MzcxWSJP7eT" as const;

export type WhopCheckoutEmbedProps = {
  /**
   * The logged-in local user's id. Passed to the server route which attaches
   * it as `metadata.userId` on the upstream Whop checkout configuration.
   * When empty/null the parent should render the sign-in prompt instead.
   */
  userId: string;
  /** Optional email passthrough to pre-fill the Whop form. */
  userEmail?: string | null;
  className?: string;
};

type SessionState =
  | { status: "loading" }
  | { status: "ready"; sessionId: string }
  | { status: "error"; message: string };

async function mintSession(): Promise<
  { ok: true; sessionId: string } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/whop/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: WHOP_ACCESO_PLAN_ID }),
    });
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; sessionId?: string; error?: string }
      | null;
    if (!res.ok || !data?.success || !data.sessionId) {
      return { ok: false, message: data?.error ?? `http_${res.status}` };
    }
    return { ok: true, sessionId: data.sessionId };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "unknown",
    };
  }
}

export function WhopCheckoutEmbed({
  userId,
  userEmail,
  className,
}: WhopCheckoutEmbedProps) {
  const t = useTranslations("pricing");
  const [state, setState] = React.useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  // Mint a checkout session whenever the userId or retry counter changes. We
  // intentionally exclude `userEmail` from the deps — re-creating a session
  // just because the email object identity shifted would burn API calls.
  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void mintSession().then((r) => {
      if (cancelled) return;
      if (r.ok) setState({ status: "ready", sessionId: r.sessionId });
      else setState({ status: "error", message: r.message });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const wrapperCls = [
    "relative w-full overflow-hidden rounded-xl border border-[--color-hairline] bg-[--color-surface]",
    className ?? "",
  ].join(" ");

  if (state.status === "loading") {
    return (
      <div
        className={wrapperCls}
        data-whop-plan-id={WHOP_ACCESO_PLAN_ID}
        data-whop-metadata-user-id={userId}
      >
        <div
          className="flex min-h-[420px] items-center justify-center"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[--color-hairline] border-t-[--color-ink-primary]" />
            <p className="text-sm text-[--color-ink-tertiary]">
              {t("checkoutLoading")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className={wrapperCls}
        data-whop-plan-id={WHOP_ACCESO_PLAN_ID}
        data-whop-metadata-user-id={userId}
        data-whop-checkout-error={state.message}
      >
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <p className="text-sm font-medium text-[--color-ink-primary]">
            {t("checkoutLoading")}
          </p>
          <p className="text-xs text-[--color-ink-tertiary]">{state.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="cursor-pointer rounded-md border border-[--color-hairline] bg-transparent px-3 py-1.5 text-xs font-medium text-[--color-ink-primary] hover:bg-[--color-surface-muted]"
          >
            {t("checkoutHeading")}
          </button>
        </div>
      </div>
    );
  }

  // Ready — hand off to the official embed. The package's discriminated
  // union accepts either `planId` OR `sessionId`; we pass `sessionId` only
  // (the plan_id is already baked into the server-minted configuration, and
  // metadata travels with it).
  return (
    <div
      className={wrapperCls}
      data-whop-plan-id={WHOP_ACCESO_PLAN_ID}
      data-whop-metadata-user-id={userId}
      data-whop-session-id={state.sessionId}
    >
      <OfficialWhopCheckoutEmbed
        sessionId={state.sessionId}
        theme="light"
        prefill={userEmail ? { email: userEmail } : undefined}
        fallback={
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[--color-hairline] border-t-[--color-ink-primary]" />
              <p className="text-sm text-[--color-ink-tertiary]">
                {t("checkoutLoading")}
              </p>
            </div>
          </div>
        }
      />
    </div>
  );
}
