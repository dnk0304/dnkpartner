import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — DNK Partner',
  description:
    'How DNK Partner handles your data.',
};

// Privacy policy — Phase 1 placeholder (2026-05-28).
// The ComputerCaller original was product-specific (Android phone bridge,
// SMS sync, Whop billing). DNK Partner currently has no product surface, so
// this page is intentionally minimal. Update with real policy text once
// portfolio products ship and the actual data flows are defined.

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-semibold tracking-tight text-brand-accent">Privacy Policy</h1>
        <p className="mt-2 text-sm text-brand-dark/55">Last updated: 28 May 2026</p>

        <div className="mt-10 space-y-8 text-brand-dark/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              The short version
            </h2>
            <p>
              DNK Partner is the umbrella site for Dennis Kotlenko&apos;s
              portfolio of products and services. We collect only what we need
              to give you an account and contact you about the service.
              We don&apos;t sell your data, share it with advertisers, or use
              it to train AI.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              What we collect
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Your account.</strong> Email address and a hashed
                password (or your Google account identifier if you sign in
                with Google). Used to log you in and send service emails
                (account verification, password resets).
              </li>
              <li>
                <strong>Operational logs.</strong> Connection timestamps and
                error logs for keeping the service running.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Who we share with
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Resend</strong> — sends account emails (verify, reset
                password). They see your email address and the email contents.
              </li>
              <li>
                <strong>Google</strong> — if you sign in with Google, Google
                sees your sign-in attempt (standard OAuth flow).
              </li>
              <li>
                <strong>Hosting.</strong> Our servers run on Hetzner
                infrastructure in Germany. They host data, they don&apos;t
                read it.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Your choices
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Delete your account.</strong> Email{' '}
                <a
                  href="mailto:support@dnkpartner.com"
                  className="text-brand-primary hover:text-brand-primary-hover underline-offset-4 hover:underline transition-colors"
                >
                  support@dnkpartner.com
                </a>{' '}
                and we&apos;ll wipe your account within 7 days.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-brand-accent mb-2">
              Contact
            </h2>
            <p>
              Questions, requests, complaints — email{' '}
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
            <Link href="/terms" className="hover:text-brand-accent transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
