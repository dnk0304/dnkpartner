"use client";

/**
 * PreciosClient — /precios.
 *
 * Single-offer redesign (2026-06-04, Pixel). One centered Acceso card,
 * 30-day free access trial, then 5,99 €/mes. No free permanent plan,
 * no card mention anywhere on the page or FAQ. Winter-green accent stays.
 *
 * What did NOT change:
 *   - The Whop checkout embed (`WhopCheckoutEmbed`) — the `metadata[userId]`
 *     webhook contract is critical and stays exactly as-is.
 *   - Tier-aware CTA behavior (already-paid → "Suscripción activa";
 *     signed-out → /login?callbackUrl=/precios#checkout).
 *
 * Layout (top → bottom):
 *   1. Hero eyebrow + headline + lead + "30 días de acceso gratis" pill
 *   2. ONE centered pricing card — Acceso (featured, gradient CTA)
 *   3. Embedded Whop checkout (#checkout anchor)
 *   4. FAQ
 *
 * Palette discipline: max two greens (`--color-action` + `--color-brand`,
 * carried by `--gradient-accent`) + white + one ink-gray. Gradient is an
 * accent only — appears on the featured card's CTA and the recommended
 * badge, nowhere else.
 */

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { WhopCheckoutEmbed } from "@/components/pricing/WhopCheckoutEmbed";
import { cn } from "@/lib/utils";

export default function PreciosClient() {
  const t = useTranslations("pricing");
  const { data: session, status } = useSession();
  const user = session?.user as
    | { id?: string; email?: string | null; tier?: string }
    | undefined;
  const isAuthed = status === "authenticated" && !!user?.id;
  const hasAcceso = (user?.tier ?? "FREE") !== "FREE";

  // Anchor for the "Empezar 30 días gratis" CTA — when authed, jump to the
  // embedded checkout iframe; signed-out, send to /login with a callback
  // that lands the user back on the checkout anchor after auth.
  const accesoHref = isAuthed
    ? "#checkout"
    : `/login?callbackUrl=${encodeURIComponent("/precios#checkout")}`;

  return (
    <div className="min-h-screen bg-[--color-page] text-[--color-ink-primary]">
      {/* Header + footer come from SiteChrome in the root layout. */}

      <main className="mx-auto max-w-editorial px-4 py-10 md:px-6 md:py-14">
        {/* ──────────────────────────────────────────────────────────────
            Hero — eyebrow, headline, lead, trial pill.
            ────────────────────────────────────────────────────────────── */}
        <section className="max-w-readable">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[--color-action]">
            {t("heroEyebrow")}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-[42px] md:leading-[1.1]">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[--color-ink-secondary] md:text-base">
            {t("heroLead")}
          </p>

          {/* "30 días de acceso gratis" pill — winter-green soft tint,
              flag-icon prefix, deliberate visual weight so it reads as the
              core value prop, not decoration. */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[--color-action-soft] px-3.5 py-2">
            <Sparkles
              className="h-3.5 w-3.5 text-[--color-action]"
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-[--color-brand]">
              {t("trialBadge")}
            </span>
            <span className="text-xs text-[--color-ink-secondary]">
              · {t("trialSub")}
            </span>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            Pricing — ONE centered Acceso card with gradient CTA.
            ────────────────────────────────────────────────────────────── */}
        <section
          className="mx-auto mt-10 max-w-md md:mt-12"
          aria-label={t("heroTitle")}
        >
          {/* ACCESO */}
          <PricingCard
            featured
            badge={t("accesoBadge")}
            name={t("accesoName")}
            price={t("accesoPrice")}
            priceSuffix={t("monthlySuffix")}
            priceMeta={t("billedMonthly")}
            tagline={t("accesoTagline")}
            trialNote={t("accesoTrial")}
            features={[
              t("accesoFeature1"),
              t("accesoFeature2"),
              t("accesoFeature3"),
              t("accesoFeature4"),
              t("accesoFeature5"),
              t("accesoFeature6"),
            ]}
            cta={
              hasAcceso ? (
                <CtaButton variant="ghost" disabled>
                  {t("accesoCtaActive")}
                </CtaButton>
              ) : isAuthed ? (
                <CtaButton variant="gradient" href={accesoHref}>
                  {t("accesoCta")}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </CtaButton>
              ) : (
                <CtaButton variant="gradient" href={accesoHref}>
                  {t("accesoCtaSignedOut")}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </CtaButton>
              )
            }
          />
        </section>

        {/* ──────────────────────────────────────────────────────────────
            Embedded checkout — Whop. CONTRACT-CRITICAL: do not alter the
            WhopCheckoutEmbed props or the metadata[userId] linkage.
            ────────────────────────────────────────────────────────────── */}
        <section id="checkout" className="mt-14 scroll-mt-24">
          <div className="max-w-readable">
            <h2 className="font-display text-2xl font-semibold">
              {t("checkoutHeading")}
            </h2>
            <p className="mt-2 text-sm text-[--color-ink-secondary]">
              {t("checkoutSub")}
            </p>
          </div>

          <div className="mt-6">
            {hasAcceso ? (
              <div className="rounded-xl border border-[--color-hairline] bg-[--color-surface] p-6 text-center">
                <p className="text-sm font-medium text-[--color-ink-primary]">
                  {t("accesoCtaActive")}
                </p>
              </div>
            ) : isAuthed && user?.id ? (
              <WhopCheckoutEmbed
                userId={user.id}
                userEmail={user.email ?? null}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-[--color-hairline] bg-[--color-surface] p-8 text-center">
                <p className="mx-auto max-w-md text-sm text-[--color-ink-secondary]">
                  {t("checkoutSignInPrompt")}
                </p>
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent("/precios#checkout")}`}
                  className="cta-gradient mt-4 text-sm px-4 py-2 rounded-md"
                >
                  {t("checkoutSignInCta")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <p className="mt-3 text-xs text-[--color-ink-tertiary]">
                  {t("checkoutSignInThenReturn")}
                </p>
              </div>
            )}
            <p className="mt-3 text-center text-xs text-[--color-ink-tertiary]">
              {t("trustNote")}
            </p>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            FAQ — 4 questions. Unchanged structure; quiet surface so it
            doesn't compete with the pricing card or checkout.
            ────────────────────────────────────────────────────────────── */}
        <section className="mt-16 max-w-readable">
          <h2 className="font-display text-2xl font-semibold">
            {t("faqHeading")}
          </h2>
          <dl className="mt-6 divide-y divide-[--color-hairline] rounded-xl border border-[--color-hairline] bg-[--color-surface]">
            <FaqItem q={t("faqQ1")} a={t("faqA1")} />
            <FaqItem q={t("faqQ2")} a={t("faqA2")} />
            <FaqItem q={t("faqQ3")} a={t("faqA3")} />
            <FaqItem q={t("faqQ4")} a={t("faqA4")} />
          </dl>
        </section>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Internal building blocks                                                */
/* ----------------------------------------------------------------------- */

type PricingCardProps = {
  name: string;
  price: string;
  priceSuffix: string | null;
  priceMeta?: string;
  tagline: string;
  features: string[];
  cta: React.ReactNode;
  featured?: boolean;
  badge?: string;
  trialNote?: string;
};

function PricingCard({
  name,
  price,
  priceSuffix,
  priceMeta,
  tagline,
  features,
  cta,
  featured = false,
  badge,
  trialNote,
}: PricingCardProps) {
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-2xl border bg-[--color-surface] p-6 md:p-7",
        featured
          ? "border-[--color-action] ring-1 ring-[--color-action]/30 shadow-[var(--shadow-lift)]"
          : "border-[--color-hairline] shadow-[var(--shadow-card)]",
      )}
    >
      {featured && badge && (
        <span
          className="cta-gradient absolute -top-3 left-6 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-full"
          style={{ boxShadow: "var(--shadow-cta)" }}
        >
          {badge}
        </span>
      )}

      <header>
        <h3 className="font-display text-xl font-semibold text-[--color-ink-primary]">
          {name}
        </h3>
        <p className="mt-1.5 text-sm text-[--color-ink-secondary]">
          {tagline}
        </p>
      </header>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-[40px] font-semibold leading-none tnum text-[--color-ink-primary]">
          {price}
        </span>
        {priceSuffix && (
          <span className="text-sm text-[--color-ink-tertiary]">
            {priceSuffix}
          </span>
        )}
      </div>
      {priceMeta && (
        <p className="mt-1 text-xs text-[--color-ink-tertiary]">{priceMeta}</p>
      )}
      {trialNote && (
        <p className="mt-2 text-xs font-medium text-[--color-action]">
          {trialNote}
        </p>
      )}

      <div className="mt-6">{cta}</div>

      <ul className="mt-6 space-y-3" role="list">
        {features.map((feat) => (
          <li
            key={feat}
            className="flex items-start gap-2.5 text-sm text-[--color-ink-primary]"
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                featured
                  ? "bg-[--color-action] text-white"
                  : "bg-[--color-action-soft] text-[--color-action]",
              )}
              aria-hidden="true"
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="leading-snug">{feat}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

type CtaButtonProps = {
  children: React.ReactNode;
  href?: string;
  variant: "primary" | "ghost" | "gradient";
  disabled?: boolean;
};

function CtaButton({ children, href, variant, disabled }: CtaButtonProps) {
  // Gradient variant uses the .cta-gradient utility from globals.css —
  // shared with the landing hero so visual signature stays consistent.
  if (variant === "gradient" && !disabled) {
    const cls = "cta-gradient w-full text-sm px-4 py-2.5 rounded-md";
    if (href) {
      return (
        <Link href={href} className={cls}>
          {children}
        </Link>
      );
    }
    return (
      <button type="button" className={cls}>
        {children}
      </button>
    );
  }

  const classes = cn(
    "inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/40",
    variant === "primary" && !disabled
      ? "cursor-pointer bg-[--color-action] text-white hover:bg-[--color-action-hover]"
      : "",
    variant === "ghost" && !disabled
      ? "cursor-pointer border border-[--color-hairline] bg-transparent text-[--color-ink-primary] hover:bg-[--color-surface-muted]"
      : "",
    disabled
      ? "cursor-not-allowed border border-[--color-hairline] bg-[--color-surface-muted] text-[--color-ink-tertiary]"
      : "",
  );
  if (disabled || !href) {
    return (
      <button type="button" disabled={disabled} className={classes}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="px-5 py-4 md:px-6 md:py-5">
      <dt className="text-sm font-semibold text-[--color-ink-primary]">{q}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-[--color-ink-secondary]">
        {a}
      </dd>
    </div>
  );
}
