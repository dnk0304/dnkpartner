"use client";

/**
 * `/subscription` — the logged-in account dashboard ("Tu cuenta").
 *
 * This route is what the header account menu links to (ObservatoryHeader
 * `account: /subscription`). Until now only `subscription/success/` existed, so
 * "Mi cuenta" 404'd — this page is the fix.
 *
 * Shape mirrors the `/favoritos` logged-in pattern: a `"use client"` page inside
 * SiteChrome (header + footer come from the root layout — we do NOT add our own),
 * an editorial header band with the account secondary nav, then the four stacked
 * "Tu cuenta" sections in OUR winter-green brand:
 *   1. Perfil (profile + edit-name / change-password modals)
 *   2. Subscripción (plan/price/state + upgrade CTA + "incluye" list)
 *   3. Preferencias de email (3 optimistic checkboxes)
 *   4. Facturas (empty state today; list-ready for later)
 * plus a "¿Necesitas ayuda?" help line.
 *
 * Gate: logged-out → /login?callbackUrl=/subscription (matches alerts/favoritos).
 * Data: the four GET endpoints are fetched in parallel after auth resolves.
 */

import * as React from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heart, Bell, UserCircle2, LogOut, Loader2, LifeBuoy } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { cn } from "@/lib/utils";
import { PerfilCard, type ProfileData } from "@/components/account/PerfilCard";
import {
  SubscripcionCard,
  type SubscriptionData,
} from "@/components/account/SubscripcionCard";
import { EmailPrefsCard, type EmailPrefs } from "@/components/account/EmailPrefsCard";
import { FacturasCard, type Invoice } from "@/components/account/FacturasCard";

type DashNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
};

function DashboardSecondaryNav({
  items,
  onSignOut,
  signOutLabel,
}: {
  items: DashNavItem[];
  onSignOut: () => void;
  signOutLabel: string;
}) {
  return (
    <nav
      aria-label="Navegación de cuenta"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-1 text-sm shadow-sm"
    >
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
            active
              ? "bg-[var(--color-action-soft)] text-[var(--color-brand)] font-medium"
              : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-action-soft)]/60 hover:text-[var(--color-brand)]",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onSignOut}
        className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[var(--color-ink-secondary)] transition-colors hover:bg-[var(--color-warn-critical-soft)]/50 hover:text-[var(--color-warn-critical)]"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span>{signOutLabel}</span>
      </button>
    </nav>
  );
}

export default function AccountPage() {
  const t = useTranslations("account");
  const { data: session, status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [sub, setSub] = React.useState<SubscriptionData | null>(null);
  const [prefs, setPrefs] = React.useState<EmailPrefs | null>(null);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Logged-out → bounce to login, returning here afterwards.
  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent("/subscription")}`);
    }
  }, [status, router]);

  React.useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [profileRes, subRes, prefsRes, invRes] = await Promise.all([
          apiFetch("/api/user/profile"),
          apiFetch("/api/user/subscription"),
          apiFetch("/api/user/email-preferences"),
          apiFetch("/api/user/invoices"),
        ]);

        const [profileBody, subBody, prefsBody, invBody] = await Promise.all([
          profileRes.json().catch(() => null),
          subRes.json().catch(() => null),
          prefsRes.json().catch(() => null),
          invRes.json().catch(() => null),
        ]);

        if (cancelled) return;

        if (profileBody?.user) {
          setProfile({
            name: profileBody.user.name ?? null,
            email: profileBody.user.email,
            createdAt: profileBody.user.createdAt ?? null,
            trialStartDate: profileBody.user.trialStartDate ?? null,
          });
        }
        if (subBody?.subscription) setSub(subBody.subscription as SubscriptionData);
        if (prefsBody?.prefs) setPrefs(prefsBody.prefs as EmailPrefs);
        setInvoices(Array.isArray(invBody?.invoices) ? invBody.invoices : []);

        // Profile is the one section we can't render without — flag if it failed.
        if (!profileBody?.user) setError(t("errorGeneric"));
      } catch {
        if (!cancelled) setError(t("errorGeneric"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, t]);

  const navItems: DashNavItem[] = [
    { href: "/favoritos", label: t("navFavorites"), icon: Heart },
    { href: "/alerts", label: t("navAlerts"), icon: Bell },
    { href: "/subscription", label: t("navAccount"), icon: UserCircle2, active: true },
  ];

  const isLoadingState =
    status === "loading" || (status === "authenticated" && loading);

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      <div className="mx-auto max-w-editorial px-4 py-8 md:px-6 md:py-12">
        {/* Editorial header band */}
        <header className="mb-8 flex flex-col gap-4 md:mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-ink-tertiary)]">
            {t("eyebrow")}
          </p>
          <div>
            <h1 className="font-display text-3xl font-semibold leading-tight text-[var(--color-ink-primary)] md:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-ink-secondary)]">
              {t("subtitle")}
            </p>
          </div>
          <DashboardSecondaryNav
            items={navItems}
            onSignOut={() => void signOut({ callbackUrl: "/" })}
            signOutLabel={t("signOut")}
          />
        </header>

        {/* Body */}
        {isLoadingState ? (
          <div className="flex items-center justify-center rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-16 text-[var(--color-ink-tertiary)]">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-sm">{t("loading")}</span>
          </div>
        ) : error && !profile ? (
          <div
            role="alert"
            className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-ink-secondary)]"
          >
            {error}
          </div>
        ) : (
          <div className="grid gap-5 md:gap-6">
            {profile ? (
              <PerfilCard
                profile={profile}
                onNameSaved={(name) =>
                  setProfile((p) => (p ? { ...p, name } : p))
                }
              />
            ) : null}

            {sub ? <SubscripcionCard sub={sub} /> : null}

            {prefs ? <EmailPrefsCard initial={prefs} /> : null}

            <FacturasCard invoices={invoices} />

            {/* Help line */}
            <section className="flex flex-col items-start justify-between gap-4 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] px-5 py-5 shadow-sm md:flex-row md:items-center md:px-6">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-action-soft)] text-[var(--color-action)]"
                >
                  <LifeBuoy className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-[var(--color-ink-primary)]">
                    {t("helpTitle")}
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-secondary)]">
                    {t("helpLead")}
                  </p>
                </div>
              </div>
              <Link
                href="/contacto"
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink-primary)] transition-colors hover:border-[var(--color-brand)]/30 hover:text-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
              >
                {t("helpCta")}
              </Link>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
