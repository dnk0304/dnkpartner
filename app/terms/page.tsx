import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service — DNK Partner',
  description:
    'The agreement between you and DNK Partner when you use the service.',
};

// Terms of Service — Phase 1 placeholder (2026-05-28).
// The ComputerCaller original referenced a specific product (Android phone
// bridge, Whop billing, €7.99/mo subscription). DNK Partner currently has no
// product surface, so this page is intentionally minimal. Update with real
// terms once portfolio products ship and billing/usage rules are defined.
//
// Pixel pass (2026-05-28): re-skinned to the DNK Partner brand palette — see
// app/globals.css for token provenance. Legal copy untouched.

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-brand-dark">
      <header className="sticky top-0 z-20 bg-brand-light/80 backdrop-blur border-b border-slate-200/70">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-md"
            aria-label="DNK Partner — home"
          >
            <Image
              src="/brand/dnk-partner-logo.png"
              alt="DNK Partner"
              width={1503}
              height={704}
              priority
              className="h-10 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-brand-dark/70 hover:text-brand-accent transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-brand-accent">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-brand-dark/55">Last updated: 28 May 2026</p>

        <div className="mt-10 space-y-8 text-brand-dark/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              The service
            </h2>
            <p>
              DNK Partner is the umbrella site for Dennis Kotlenko&apos;s
              portfolio of products and services. By creating an account, you
              agree to the terms below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Your account
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>You are responsible for keeping your password secure.</li>
              <li>One person per account. Don&apos;t share logins.</li>
              <li>
                We may suspend accounts that abuse the service (spam,
                harassment, impersonation, illegal activity).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Availability
            </h2>
            <p>
              We aim for high availability but make no uptime guarantees.
              Scheduled maintenance happens occasionally. We&apos;ll try to
              notify in advance for anything significant.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Liability
            </h2>
            <p>
              The service is provided &quot;as is&quot;. We&apos;re not liable
              for indirect or consequential damages arising from use of the
              service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Changes
            </h2>
            <p>
              We may update these terms. Material changes will be announced by
              email or in-app notice at least 14 days before they take effect.
              Continuing to use the service after the effective date means you
              accept the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Governing law
            </h2>
            <p>
              These terms are governed by European Law. Disputes are resolved
              under European jurisdiction unless local consumer-protection law
              gives you the right to your own jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Contact
            </h2>
            <p>
              Operator:{' '}
              <a
                href="mailto:support@dnkpartner.com"
                className="text-brand-primary hover:text-brand-primary-hover underline-offset-4 hover:underline transition-colors"
              >
                support@dnkpartner.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200/70 bg-brand-light/60 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between gap-3">
          <span className="text-sm text-brand-dark/65">
            © {new Date().getFullYear()} DNK Partner
          </span>
          <div className="flex items-center gap-5 text-sm text-brand-dark/65">
            <Link href="/privacy" className="hover:text-brand-accent transition-colors">
              Privacy
            </Link>
            <a
              href="mailto:support@dnkpartner.com"
              className="hover:text-brand-accent transition-colors"
            >
              support@dnkpartner.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
