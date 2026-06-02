"use client";

/**
 * PreciosClient — interactive shell for /precios.
 *
 * Layout (top → bottom):
 *   1. ObservatoryHeader (consistent persistent nav)
 *   2. Hero strip — eyebrow + title + lead + trial badge
 *   3. Two-column pricing grid — Free vs Acceso (€5.99 with 30-day trial)
 *   4. Embedded Whop checkout — iframe to plan `plan_c4MzcxWSJP7eT` with
 *      the local userId wired into `metadata[userId]` so the live webhook
 *      can auto-upgrade the user on `membership.activated`. Signed-out
 *      users see a sign-in CTA in place of the embed (we need their userId
 *      to attach to the checkout — see WhopCheckoutEmbed for the contract).
 *   5. FAQ — 4 quick answers (cancel, trial, security, expiry)
 *   6. Footer — match the home page footer pattern
 *
 * Visual signature: light surface, all-black ink, hairline borders,
 * cursor-pointer on actionable elements — matches the rest of the site.
 */

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Check, ArrowRight, ShieldCheck } from "lucide-react";
import { ObservatoryHeader } from "@/components/observatory/ObservatoryHeader";
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

  // Anchor for the "Empezar 30 días gratis" CTA — when authed, it jumps the
  // user down to the embedded checkout iframe. When signed out, it routes
  // them to login first with a callbackUrl back to /precios so they land
  // exactly where they need to be after auth.
  const accesoHref = isAuthed
    ? "#checkout"
    : `/login?callbackUrl=${encodeURIComponent("/precios#checkout")}`;

  return (
    <div className="min-h-screen bg-[--color-page] text-[--color-ink-primary]">
      <ObservatoryHeader hideSearch />

      <main className="mx-auto max-w-editorial px-4 py-10 md:px-6 md:py-14">
        {/* Hero */}
        <section className="max-w-readable">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[--color-ink-tertiary]">
            {t("heroEyebrow")}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight md:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[--color-ink-secondary] md:text-base">
            {t("heroLead")}
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[--color-hairline] bg-[--color-surface] px-3 py-1.5">
            <ShieldCheck
              className="h-3.5 w-3.5 text-[--color-ink-secondary]"
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-[--color-ink-primary]">
              {t("trialBadge")}
            </span>
          </div>
        </section>

        {/* Pricing grid — two columns */}
        <section
          className="mt-10 grid grid-cols-1 gap-5 md:mt-12 md:grid-cols-2 md:gap-6"
          aria-label={t("heroTitle")}
        >
          {/* FREE */}
          <PricingCard
            name={t("freeName")}
            price={t("freePrice")}
            priceSuffix={null}
            tagline={t("freeTagline")}
            features={[
              t("freeFeature1"),
              t("freeFeature2"),
              t("freeFeature3"),
              t("freeFeature4"),
            ]}
            cta={
              isAuthed ? (
                <CtaButton variant="ghost" disabled>
                  {t("freeCtaSignedIn")}
                </CtaButton>
              ) : (
                <CtaButton variant="ghost" href="/register">
                  {t("freeCta")}
                </CtaButton>
              )
            }
          />

          {/* ACCESO */}
          <PricingCard
            featured
            badge={t("accesoBadge")}
            name={t("accesoName")}
            price={t("accesoPrice")}
            priceSuffix={t("monthlySuffix")}
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
                <CtaButton variant="primary" href={accesoHref}>
                  {t("accesoCta")}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </CtaButton>
              ) : (
                <CtaButton variant="primary" href={accesoHref}>
                  {t("accesoCtaSignedOut")}
                </CtaButton>
              )
            }
          />
        </section>

        {/* Embedded checkout */}
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
                  className={cn(
                    "mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[--color-ink-primary] px-4 py-2 text-sm font-medium text-white",
                    "hover:bg-[--color-ink-primary]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-ink-primary]/30",
                  )}
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

        {/* FAQ */}
        <section className="mt-16 max-w-readable">
          <h2 className="font-display text-2xl font-semibold">
            {t("faqHeading")}
          </h2>
          <dl className="mt-6 divide-y divide-[--color-hairline] rounded-lg border border-[--color-hairline] bg-[--color-surface]">
            <FaqItem q={t("faqQ1")} a={t("faqA1")} />
            <FaqItem q={t("faqQ2")} a={t("faqA2")} />
            <FaqItem q={t("faqQ3")} a={t("faqA3")} />
            <FaqItem q={t("faqQ4")} a={t("faqA4")} />
          </dl>
        </section>
      </main>

      <footer className="hairline-t mt-12 py-8 text-center text-xs text-[--color-ink-tertiary]">
        <nav className="flex items-center justify-center gap-4">
          <Link
            href="/"
            className="cursor-pointer hover:text-[--color-ink-primary]"
          >
            SubastasActivas
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/subastas"
            className="cursor-pointer hover:text-[--color-ink-primary]"
          >
            {/* Reuse home namespace string for consistency */}
            Subastas
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/blog"
            className="cursor-pointer hover:text-[--color-ink-primary]"
          >
            Blog
          </Link>
        </nav>
      </footer>
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
          ? "border-[--color-ink-primary] shadow-[var(--shadow-card)]"
          : "border-[--color-hairline]",
      )}
    >
      {featured && badge && (
        <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-[--color-ink-primary] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
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
        <span className="font-display text-4xl font-semibold tnum text-[--color-ink-primary]">
          {price}
        </span>
        {priceSuffix && (
          <span className="text-sm text-[--color-ink-tertiary]">
            {priceSuffix}
          </span>
        )}
      </div>
      {trialNote && (
        <p className="mt-2 text-xs font-medium text-[--color-ink-secondary]">
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
                  ? "bg-[--color-ink-primary] text-white"
                  : "bg-[--color-surface-muted] text-[--color-ink-primary]",
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
  variant: "primary" | "ghost";
  disabled?: boolean;
};

function CtaButton({ children, href, variant, disabled }: CtaButtonProps) {
  const classes = cn(
    "inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-ink-primary]/30",
    variant === "primary" && !disabled
      ? "cursor-pointer bg-[--color-ink-primary] text-white hover:bg-[--color-ink-primary]/90"
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
      <button type="button" disabled className={classes}>
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
