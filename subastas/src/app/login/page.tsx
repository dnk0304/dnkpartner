'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Inline Google "G" mark. SVG so it renders without an extra asset fetch
 * (the old <img src="/google.svg"> wasn't shipped, hence the missing icon).
 * Brand colours per Google's identity guidelines.
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('login');
  // `registered=1` is passed by the register page on successful sign-up so we
  // can render an explicit confirmation here. Pre-fix the user was bounced to
  // a stock login form with no signal anything had happened (QC P1 finding).
  // We also pre-fill the email so they can just type their password.
  const justRegistered = searchParams?.get('registered') === '1';
  const prefilledEmail = searchParams?.get('email') ?? '';
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t('errorBadCredentials'));
      } else if (result?.ok) {
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError(t('errorUnexpected'));
      console.error('Sign in error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSocialLoading('google');
    try {
      await signIn('google', { callbackUrl: '/' });
    } catch (err) {
      setError(t('errorGoogle'));
      console.error('google sign in error:', err);
      setSocialLoading(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 font-sans text-gray-900">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -left-[10%] h-[70%] w-[50%] rounded-full bg-blue-50/50 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] h-[60%] w-[40%] rounded-full bg-amber-50/50 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white shadow-xl">
            <span className="text-xl font-bold">S</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('welcomeTitle')}</h1>
          <p className="mt-2 text-sm text-gray-600">{t('tagline')}</p>
        </div>

        <Card className="border-gray-200 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-gray-900">{t('cardTitle')}</CardTitle>
            <CardDescription className="text-gray-700">
              {t('cardDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {justRegistered && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
                <div>
                  <p className="font-medium">{t('registeredBannerTitle')}</p>
                  <p className="text-green-800">{t('registeredBannerBody')}</p>
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full text-gray-900"
              disabled={isLoading || socialLoading !== null}
              onClick={handleGoogleSignIn}
            >
              {socialLoading === 'google' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('connectingGoogle')}
                </>
              ) : (
                <>
                  <GoogleIcon className="mr-2 h-4 w-4" />
                  {t('continueWithGoogle')}
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-600">{t('or')}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-900">{t('emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  className="bg-gray-50/50 text-gray-900"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-gray-900">{t('passwordLabel')}</Label>
                  <Link href="/forgot-password" className="text-xs font-medium text-gray-700 hover:text-black hover:underline">
                    {t('forgotPassword')}
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  className="bg-gray-50/50 text-gray-900"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-black hover:bg-gray-800 text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('submitting')}
                  </>
                ) : (
                  <>
                    {t('submit')} <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="pt-4 text-center text-xs text-gray-700">
              {t('noAccount')}{' '}
              <Link href="/register" className="font-medium text-black hover:underline">
                {t('signUp')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
