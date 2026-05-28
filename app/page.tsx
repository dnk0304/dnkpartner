import Image from 'next/image';
import Link from 'next/link';
import {
  Layers,
  Smartphone,
  Apple,
  LayoutDashboard,
  Globe,
  Mail,
  ArrowRight,
} from 'lucide-react';

/**
 * DNK Partner — landing page (Phase 2, Pixel, 2026-05-28; trimmed 2026-05-28).
 *
 * Single scroll, ~6 sections:
 *   1. Sticky header (logo only — public face has no sign-in affordance)
 *   2. Hero (logo + tagline + single email CTA)
 *   3. Services strip (5 text-only cards)
 *   4. About
 *   5. CTA section (single email CTA)
 *   6. Footer
 *
 * Per Dennis: the site is a private portal. Login lives at /login and is
 * not exposed from the public landing. The only public affordance is email.
 *
 * Design language references the ComputerCaller card pattern:
 *   `bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md`
 * — but tinted with DNK Partner's brand palette (teal `brand-primary` for
 * icon backgrounds + buttons, navy `brand-accent` for headings + footer).
 *
 * Palette sampled from public/brand/dnk-partner-logo.png — see globals.css
 * for the full provenance + WCAG audit trail.
 *
 * Imagery: none for v0 (Dennis: "Just do text for now so we don't waste
 * tokens. Then we can add imagery later."). Lucide icons + brand-coloured
 * surfaces carry the visual weight.
 *
 * All interactive elements:
 *   - keyboard-navigable
 *   - `focus-visible:ring-2 focus-visible:ring-brand-primary/40`
 *   - sufficient WCAG AA contrast (audited in globals.css)
 *
 * Mobile baseline: iPhone-SE 375px. Test for horizontal scroll, stacked
 * button rows, single-column service grid.
 */

// Service card definitions. Kept as data so the card render stays single-
// pass + the copy lives next to its icon for review. Per brief:
// - one short clause per card, max ~12 words
// - no semicolons, no em-dashes in body
// - banned: synergy / leverage / transform
const SERVICES = [
  {
    icon: Layers,
    title: 'App creation',
    body: 'End-to-end mobile and web product development.',
  },
  {
    icon: Smartphone,
    title: 'Android',
    body: 'Native Android apps, signed releases, Play Store submission.',
  },
  {
    icon: Apple,
    title: 'iOS',
    body: 'iPhone and iPad apps, App Store ready.',
  },
  {
    icon: LayoutDashboard,
    title: 'Webapps',
    body: 'Authenticated dashboards, real-time interfaces, custom workflows.',
  },
  {
    icon: Globe,
    title: 'Webpages',
    body: 'Marketing sites, landing pages, brand presences that convert.',
  },
] as const;

const CONTACT_EMAIL = 'hello@dnkpartner.com';

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white text-brand-dark font-sans">
      {/* ─────────────────────────  Header  ───────────────────────── */}
      <header
        className="
          sticky top-0 z-30
          bg-brand-light/80 backdrop-blur
          border-b border-slate-200/70
        "
      >
        {/* Single-item header: logo only. No right-side affordance — the
            public site is brochure-only, sign-in is unlisted at /login. */}
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
          <Link
            href="/"
            className="flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-md"
            aria-label="DNK Partner — home"
          >
            {/* Logo height locked: h-12 desktop, h-10 mobile so the header
                stays a stable 64px tall. Width auto keeps aspect ratio. */}
            <Image
              src="/brand/dnk-partner-logo.png"
              alt="DNK Partner"
              width={1503}
              height={704}
              priority
              className="h-10 sm:h-12 w-auto"
            />
          </Link>
        </div>
      </header>

      {/* ─────────────────────────  Hero  ───────────────────────── */}
      <section
        aria-labelledby="hero-heading"
        className="
          relative
          pt-16 pb-20 sm:pt-24 sm:pb-28
          bg-gradient-to-b from-brand-light to-white
        "
      >
        <div className="max-w-4xl mx-auto px-6 flex flex-col items-center text-center">
          {/* Hero logo — larger than header. `priority` because it's above-
              the-fold. Cap visual width at max-w-md so it doesn't dwarf
              tablet viewports. */}
          <Image
            src="/brand/dnk-partner-logo.png"
            alt=""
            aria-hidden="true"
            width={1503}
            height={704}
            priority
            className="w-full max-w-md h-auto"
          />

          {/* Headline + lead. Split per brief: first sentence as h1,
              second sentence as p lead. `text-balance` for clean
              line-breaks at large sizes. */}
          <h1
            id="hero-heading"
            className="
              mt-10 sm:mt-12
              text-3xl sm:text-5xl md:text-6xl
              font-semibold tracking-tight text-balance
              text-brand-accent
            "
          >
            DNK Partner — Where effective solutions are gathered.
          </h1>
          <p
            className="
              mt-6 sm:mt-7
              max-w-2xl
              text-lg sm:text-xl
              text-brand-dark/70
              text-balance
              leading-relaxed
            "
          >
            Sales services, effectivity, creativity and product solutions —{' '}
            <span
              className="
                font-medium
                bg-gradient-to-r from-brand-primary to-brand-accent
                bg-clip-text text-transparent
              "
            >
              All at one place.
            </span>
          </p>

          {/* Single CTA. With sign-in removed, the previous dual-button
              row collapses to one centred button. Mobile keeps full-width
              tap target; sm+ shrinks to intrinsic width so it doesn't
              stretch awkwardly across the hero. */}
          <div className="mt-9 sm:mt-10 w-full max-w-md sm:max-w-none flex justify-center">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="
                w-full sm:w-auto
                inline-flex items-center justify-center gap-2
                px-5 py-3 rounded-xl
                bg-brand-primary hover:bg-brand-primary-hover
                text-white text-sm font-medium
                shadow-sm shadow-brand-primary/20
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40
                transition-colors
              "
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              Get in touch
            </a>
          </div>
        </div>
      </section>

      {/* ─────────────────────────  Services  ───────────────────────── */}
      <section
        aria-labelledby="services-heading"
        className="py-20 sm:py-24 bg-white"
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col items-center text-center mb-12 sm:mb-14">
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-brand-primary">
              Services
            </p>
            <h2
              id="services-heading"
              className="
                mt-3
                text-3xl sm:text-4xl font-semibold tracking-tight
                text-brand-accent text-balance
              "
            >
              What we build
            </h2>
            <p className="mt-3 max-w-xl text-base sm:text-lg text-brand-dark/65 text-balance leading-relaxed">
              End-to-end product development across the platforms that matter.
            </p>
          </div>

          {/* Grid — mobile 1 col, sm 2 cols, lg 3 cols. With 5 cards the
              last row has 2 cards on lg (centered visually because cols 1+2
              fill, 3 empty). Not stretched to 5-across because at lg widths
              the cards would feel cramped and the bodies would wrap awkwardly.
              3-wide reads cleaner than 5-wide for this card density. */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {SERVICES.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="
                  group p-6
                  bg-white border border-slate-200 rounded-2xl
                  shadow-sm hover:shadow-md hover:border-slate-300
                  transition-all
                "
              >
                <div
                  className="
                    w-10 h-10 rounded-xl
                    bg-brand-primary/10 border border-brand-primary/20
                    flex items-center justify-center
                    mb-5
                  "
                >
                  <Icon
                    className="w-5 h-5 text-brand-primary"
                    aria-hidden="true"
                    strokeWidth={2}
                  />
                </div>
                <h3 className="text-base font-semibold text-brand-accent mb-1.5">
                  {title}
                </h3>
                <p className="text-sm text-brand-dark/65 leading-relaxed">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─────────────────────────  About  ───────────────────────── */}
      <section
        aria-labelledby="about-heading"
        className="py-20 sm:py-24 bg-brand-light/40"
      >
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-brand-primary text-center">
            About
          </p>
          <h2
            id="about-heading"
            className="
              mt-3 text-center
              text-3xl sm:text-4xl font-semibold tracking-tight
              text-brand-accent text-balance
            "
          >
            One team. From sketch to production.
          </h2>
          <p className="mt-6 text-base sm:text-lg text-brand-dark/75 leading-relaxed text-balance">
            DNK Partner gathers product, design, and engineering capability
            into one team. We build apps and sites that ship — not pitch decks.
            Whether you need a working Android beta in two weeks or a
            long-running web platform, the same hands carry it from first
            sketch to production.
          </p>
        </div>
      </section>

      {/* ─────────────────────────  CTA  ───────────────────────── */}
      <section
        aria-labelledby="cta-heading"
        className="py-20 sm:py-24 bg-gradient-to-b from-brand-light/40 to-white"
      >
        <div className="max-w-3xl mx-auto px-6 flex flex-col items-center text-center">
          <h2
            id="cta-heading"
            className="
              text-3xl sm:text-4xl md:text-5xl
              font-semibold tracking-tight
              text-brand-accent text-balance
            "
          >
            Have a product idea?
          </h2>
          <p className="mt-4 max-w-xl text-base sm:text-lg text-brand-dark/70 leading-relaxed text-balance">
            Email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-brand-primary hover:text-brand-primary-hover underline-offset-4 hover:underline transition-colors"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            and we&apos;ll get back to you.
          </p>

          {/* Single email CTA — same pattern as hero. */}
          <div className="mt-9 w-full max-w-md sm:max-w-none flex justify-center">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="
                w-full sm:w-auto
                inline-flex items-center justify-center gap-2
                px-5 py-3 rounded-xl
                bg-brand-primary hover:bg-brand-primary-hover
                text-white text-sm font-medium
                shadow-sm shadow-brand-primary/20
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40
                transition-colors
              "
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              Email us
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {/* ─────────────────────────  Footer  ───────────────────────── */}
      <footer className="bg-brand-light/60 border-t border-slate-200/70">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-brand-dark/65">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/dnk-partner-logo.png"
              alt=""
              aria-hidden="true"
              width={1503}
              height={704}
              className="h-7 w-auto"
            />
            <span>© {year} DNK Partner</span>
          </div>
          <nav aria-label="Footer">
            <ul className="flex items-center gap-5">
              <li>
                <Link
                  href="/privacy"
                  className="hover:text-brand-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="hover:text-brand-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm"
                >
                  Terms
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="hover:text-brand-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm"
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
