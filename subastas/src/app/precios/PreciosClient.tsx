"use client";

/**
 * PreciosClient — /precios.
 *
 * Mirrors the alertasubastas.com/precios LAYOUT in OUR tokens
 * (2026-06-07, Pixel — wave68). Strong crisp WHITE everywhere,
 * winter-green gradient as the only accent (CTA, badges, check icons,
 * featured card edge). Single offer only — NO second tier, NO toggle.
 *
 * Layout (top → bottom):
 *   1. Hero — eyebrow + headline + subhead + trust-badge pill
 *   2. Single centered pricing card (Acceso, RECOMENDADO)
 *   3. Trust row — "Cancela cuando quieras · Pago seguro · Sin compromiso"
 *   4. Feature/benefit grid — 6 honest features (real product surfaces)
 *   5. Embedded Whop checkout (id="checkout") — CONTRACT-CRITICAL, untouched
 *   6. FAQ
 *   7. Persistent footer (from SiteChrome — NOT rendered here)
 *
 * What we deliberately did NOT add:
 *   - Testimonials / "Muro de Opiniones" — we have no real ones, refuse to fake.
 *   - Stats band — no live numbers we can cite without fabricating.
 *   - Monthly/annual toggle — single flat €5.99/mo, a toggle would be noise.
 *   - Any mention of "tarjeta"/"card"/"Stripe" — Whop handles payments,
 *     we don't surface the instrument.
 *
 * What did NOT change:
 *   - WhopCheckoutEmbed mount + `metadata[userId]` webhook contract.
 *   - Tier-aware CTA behavior + #checkout anchor.
 *   - Whop API routes, gate logic, middleware.
 */

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Check,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  XCircle,
  Lock,
  BellRing,
  Heart,
  FileText,
  Map as MapIcon,
  Database,
  RefreshCw,
} from "lucide-react";
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

  const accesoHref = isAuthed
    ? "#checkout"
    : `/login?callbackUrl=${encodeURIComponent("/precios#checkout")}`;

  return (
    // Strong crisp WHITE canvas across the whole page — overrides
    // --color-page (#F7FAF8) deliberately for this layout per design lead.
    <div className="min-h-screen bg-white text-[var(--color-ink-primary)]">
      <main className="mx-auto max-w-editorial px-4 py-12 md:px-6 md:py-20">
        {/* ──────────────────────────────────────────────────────────────
            1. HERO — centered. eyebrow, headline, subhead, trust pill.
            ────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-action)]">
            {t("heroEyebrow")}
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--color-ink-primary)] md:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-secondary)] md:text-[17px]">
            {t("heroLead")}
          </p>

          {/* Trust pill — winter-green soft fill, gradient-aware icon. */}
          <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--color-action-soft)] px-4 py-2">
            <Sparkles
              className="h-3.5 w-3.5 text-[var(--color-action)]"
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-[var(--color-brand)]">
              {t("trialBadge")}
            </span>
            <span className="text-xs text-[var(--color-ink-secondary)]">
              · {t("trialSub")}
            </span>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            2. PRICING CARD — single centered offer.
            ────────────────────────────────────────────────────────────── */}
        <section
          className="mx-auto mt-12 max-w-md md:mt-16"
          aria-label={t("heroTitle")}
        >
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
              ) : (
                <CtaButton variant="gradient" href={accesoHref}>
                  {isAuthed ? t("accesoCta") : t("accesoCtaSignedOut")}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </CtaButton>
              )
            }
          />
        </section>

        {/* ──────────────────────────────────────────────────────────────
            3. TRUST ROW — single horizontal reassurance line under card.
            Icons + labels in winter-green. NO card/Stripe wording.
            ────────────────────────────────────────────────────────────── */}
        <section className="mt-10" aria-label={t("trustRowAria")}>
          <ul
            className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 text-sm text-[var(--color-ink-secondary)] sm:flex-row sm:gap-8"
            role="list"
          >
            <TrustItem icon={XCircle} label={t("trustCancel")} />
            <TrustItem icon={ShieldCheck} label={t("trustSecure")} />
            <TrustItem icon={Lock} label={t("trustNoCommit")} />
          </ul>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            4. FEATURE / BENEFIT GRID — what's included, 3×2 desktop.
            Honest: built from real product surfaces only.
            ────────────────────────────────────────────────────────────── */}
        <section className="mt-20 md:mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-action)]">
              {t("featuresEyebrow")}
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--color-ink-primary)] md:text-4xl">
              {t("featuresHeading")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--color-ink-secondary)]">
              {t("featuresLead")}
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 md:gap-8">
            <FeatureCard
              icon={BellRing}
              title={t("feat1Title")}
              body={t("feat1Body")}
            />
            <FeatureCard
              icon={Heart}
              title={t("feat2Title")}
              body={t("feat2Body")}
            />
            <FeatureCard
              icon={FileText}
              title={t("feat3Title")}
              body={t("feat3Body")}
            />
            <FeatureCard
              icon={MapIcon}
              title={t("feat4Title")}
              body={t("feat4Body")}
            />
            <FeatureCard
              icon={Database}
              title={t("feat5Title")}
              body={t("feat5Body")}
            />
            <FeatureCard
              icon={RefreshCw}
              title={t("feat6Title")}
              body={t("feat6Body")}
            />
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            5. CHECKOUT — Whop embed. CONTRACT-CRITICAL: do not alter the
            WhopCheckoutEmbed props or the metadata[userId] linkage.
            ────────────────────────────────────────────────────────────── */}
        <section id="checkout" className="mt-20 scroll-mt-24 md:mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-semibold text-[var(--color-ink-primary)] md:text-3xl">
              {t("checkoutHeading")}
            </h2>
            <p className="mt-3 text-sm text-[var(--color-ink-secondary)] md:text-base">
              {t("checkoutSub")}
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl">
            {hasAcceso ? (
              <div className="rounded-2xl border border-[var(--color-hairline)] bg-white p-6 text-center">
                <p className="text-sm font-medium text-[var(--color-ink-primary)]">
                  {t("accesoCtaActive")}
                </p>
              </div>
            ) : isAuthed && user?.id ? (
              <WhopCheckoutEmbed
                userId={user.id}
                userEmail={user.email ?? null}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-hairline)] bg-white p-8 text-center">
                <p className="mx-auto max-w-md text-sm text-[var(--color-ink-secondary)]">
                  {t("checkoutSignInPrompt")}
                </p>
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent("/precios#checkout")}`}
                  className="cta-gradient mt-4 text-sm px-4 py-2 rounded-md"
                >
                  {t("checkoutSignInCta")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <p className="mt-3 text-xs text-[var(--color-ink-tertiary)]">
                  {t("checkoutSignInThenReturn")}
                </p>
              </div>
            )}
            {/* Clickwrap consent — shown only when the subscribe action is
                reachable (not already subscribed). Clicking "Suscribirme"
                inside the Whop embed = acceptance; this surfaces the linked
                Terms + Privacy at the action. Muted, adjacent to checkout. */}
            {!hasAcceso && (
              <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-ink-tertiary)]">
                {t.rich("checkoutConsent", {
                  terms: (chunks) => (
                    <Link
                      href="/legal/aviso-legal"
                      className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]"
                    >
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link
                      href="/legal/privacidad"
                      className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
            <p className="mt-3 text-center text-xs text-[var(--color-ink-tertiary)]">
              {t("trustNote")}
            </p>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            6. FAQ — accordion-style flat list, quiet surface.
            ────────────────────────────────────────────────────────────── */}
        <section className="mx-auto mt-20 max-w-3xl md:mt-24">
          <div className="text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-ink-primary)] md:text-4xl">
              {t("faqHeading")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--color-ink-secondary)] md:text-base">
              {t("faqLead")}
            </p>
          </div>
          <dl className="mt-10 divide-y divide-[var(--color-hairline)] rounded-2xl border border-[var(--color-hairline)] bg-white">
            <FaqItem q={t("faqQ1")} a={t("faqA1")} />
            <FaqItem q={t("faqQ2")} a={t("faqA2")} />
            <FaqItem q={t("faqQ3")} a={t("faqA3")} />
            <FaqItem q={t("faqQ4")} a={t("faqA4")} />
          </dl>
        </section>
      </main>
      {/* Persistent footer comes from SiteChrome in the root layout. */}
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
        "relative flex flex-col rounded-2xl border bg-white p-7 md:p-8",
        featured
          ? "border-[var(--color-action)] ring-1 ring-[var(--color-action)]/30 shadow-[var(--shadow-lift)]"
          : "border-[var(--color-hairline)] shadow-[var(--shadow-card)]",
      )}
    >
      {featured && badge && (
        <span
          className="cta-gradient absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-full"
          style={{ boxShadow: "var(--shadow-cta)" }}
        >
          {badge}
        </span>
      )}

      <header className="text-center">
        <h3 className="font-display text-xl font-semibold text-[var(--color-ink-primary)]">
          {name}
        </h3>
        <p className="mx-auto mt-2 max-w-xs text-sm text-[var(--color-ink-secondary)]">
          {tagline}
        </p>
      </header>

      <div className="mt-6 flex items-baseline justify-center gap-1.5">
        <span className="font-display text-[44px] font-semibold leading-none tnum text-[var(--color-ink-primary)]">
          {price}
        </span>
        {priceSuffix && (
          <span className="text-sm text-[var(--color-ink-tertiary)]">
            {priceSuffix}
          </span>
        )}
      </div>
      {priceMeta && (
        <p className="mt-1.5 text-center text-xs text-[var(--color-ink-tertiary)]">
          {priceMeta}
        </p>
      )}
      {trialNote && (
        <p className="mt-3 text-center text-xs font-medium text-[var(--color-action)]">
          {trialNote}
        </p>
      )}

      <div className="mt-7">{cta}</div>

      <ul className="mt-7 space-y-3 border-t border-[var(--color-hairline-soft)] pt-6" role="list">
        {features.map((feat) => (
          <li
            key={feat}
            className="flex items-start gap-2.5 text-sm text-[var(--color-ink-primary)]"
          >
            {/* Contrast fix (Pixel 2026-06-07): the pale-mint --gradient-accent
                made the white check disappear after the lighter-cold token
                refresh. Solid --color-action (saturated mint #17926D) keeps
                the icon WCAG-AA on white ink (4.78:1). */}
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-action)]"
              aria-hidden="true"
            >
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
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
  if (variant === "gradient" && !disabled) {
    const cls =
      "cta-gradient w-full text-sm px-4 py-3 rounded-md font-semibold";
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
    "inline-flex w-full items-center justify-center rounded-md px-4 py-3 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40",
    variant === "primary" && !disabled
      ? "cursor-pointer bg-[var(--color-action)] text-white hover:bg-[var(--color-action-hover)]"
      : "",
    variant === "ghost" && !disabled
      ? "cursor-pointer border border-[var(--color-hairline)] bg-transparent text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-muted)]"
      : "",
    disabled
      ? "cursor-not-allowed border border-[var(--color-hairline)] bg-[var(--color-surface-muted)] text-[var(--color-ink-tertiary)]"
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

type IconType = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function TrustItem({ icon: Icon, label }: { icon: IconType; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {/* Contrast fix (Pixel 2026-06-07): saturated --color-action keeps the
          white glyph readable. Pale --gradient-accent + white = invisible. */}
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-action)]"
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5 text-white" aria-hidden={true} />
      </span>
      <span>{label}</span>
    </li>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: IconType;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-hairline)] bg-white p-6">
      {/* Contrast fix (Pixel 2026-06-07): saturated --color-action keeps the
          white feature icon readable. Pale --gradient-accent + white failed
          AA after the cold-mint token refresh. */}
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-action)]"
        aria-hidden="true"
      >
        <Icon className="h-5 w-5 text-white" aria-hidden={true} />
      </span>
      <h3 className="mt-4 font-display text-base font-semibold text-[var(--color-ink-primary)]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-secondary)]">
        {body}
      </p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="px-5 py-5 md:px-7 md:py-6">
      <dt className="text-sm font-semibold text-[var(--color-ink-primary)] md:text-base">
        {q}
      </dt>
      <dd className="mt-2 text-sm leading-relaxed text-[var(--color-ink-secondary)]">
        {a}
      </dd>
    </div>
  );
}
