'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Mail } from 'lucide-react';
import { AuthBackdrop } from '@/components/AuthBackdrop';

export default function ForgotPasswordPage() {
  return (
    <div className="relative min-h-screen bg-brand-light/40 flex items-center justify-center px-4 py-12">
      <AuthBackdrop />
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="flex items-center justify-center mb-10"
          aria-label="DNK Partner — home"
        >
          <Image
            src="/brand/dnk-partner-logo.png"
            alt="DNK Partner"
            width={1503}
            height={704}
            priority
            className="h-12 w-auto"
          />
        </Link>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
            <Mail className="w-6 h-6 text-brand-primary" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-brand-accent tracking-tight">
            Reset password
          </h1>
          <p className="mt-3 text-brand-dark/65 text-sm leading-relaxed">
            Password resets are handled by support. Email us and we&apos;ll
            get you back in.
          </p>

          <a
            href="mailto:support@dnkpartner.com"
            className="mt-6 inline-flex items-center justify-center gap-1.5 w-full py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium rounded-lg transition-colors text-sm shadow-sm shadow-brand-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            <Mail className="w-4 h-4" />
            support@dnkpartner.com
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          <Link
            href="/login"
            className="font-medium text-brand-primary hover:text-brand-primary-hover transition-colors"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
