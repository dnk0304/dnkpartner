'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const errorMessages: Record<string, { title: string; message: string }> = {
  Configuration: {
    title: 'Configuration Error',
    message: 'There is a problem with the server configuration. Please contact support.',
  },
  AccessDenied: {
    title: 'Access Denied',
    message: 'You do not have permission to sign in.',
  },
  Verification: {
    title: 'Verification Failed',
    message: 'The sign-in link may have expired or has already been used. Please request a new link.',
  },
  OAuthSignin: {
    title: 'OAuth Error',
    message: 'Error signing in with OAuth provider. Please try again.',
  },
  OAuthCallback: {
    title: 'OAuth Error',
    message: 'Error handling OAuth callback. Please try again.',
  },
  OAuthCreateAccount: {
    title: 'OAuth Error',
    message: 'Could not create OAuth account. Please try again.',
  },
  EmailCreateAccount: {
    title: 'Email Error',
    message: 'Could not create account with email. Please try again.',
  },
  Callback: {
    title: 'Callback Error',
    message: 'Error during authentication callback. Please try again.',
  },
  OAuthAccountNotLinked: {
    title: 'Account Not Linked',
    message: 'To confirm your identity, sign in with the same account you used originally.',
  },
  EmailSignin: {
    title: 'Email Error',
    message: 'Failed to send email. Please try again.',
  },
  CredentialsSignin: {
    title: 'Sign In Failed',
    message: 'Sign in failed. Check the details you provided are correct.',
  },
  SessionRequired: {
    title: 'Authentication Required',
    message: 'Please sign in to access this page.',
  },
  default: {
    title: 'Authentication Error',
    message: 'An unexpected error occurred. Please try again.',
  },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'default';
  
  const { title, message } = errorMessages[error] || errorMessages.default;

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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Authentication Error</h1>
        </div>

        <Card className="border-gray-200 shadow-xl">
          <CardContent className="pt-6 pb-8">
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
              </div>

              {error === 'Verification' && (
                <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 border border-blue-200">
                  <p className="font-medium mb-1">💡 Common causes:</p>
                  <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside text-left">
                    <li>The link has expired (valid for 24 hours)</li>
                    <li>The link has already been used</li>
                    <li>The link was opened in a different browser</li>
                  </ul>
                </div>
              )}

              <div className="pt-4 flex flex-col gap-2">
                <Button asChild className="w-full bg-black hover:bg-gray-800">
                  <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to sign in
                  </Link>
                </Button>
                
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">Go to homepage</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-500">
          Need help?{' '}
          <Link href="/support" className="font-medium text-black hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}
