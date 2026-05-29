'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send reset link. Please try again.');
      } else {
        setIsSuccess(true);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Forgot password error:', err);
    } finally {
      setIsLoading(false);
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reset your password</h1>
          <p className="mt-2 text-sm text-gray-500">We&apos;ll send you a link to reset your password</p>
        </div>

        <Card className="border-gray-200 shadow-xl">
          {!isSuccess ? (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Forgot password</CardTitle>
                <CardDescription>
                  Enter your email address and we&apos;ll send you a reset link
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      className="bg-gray-50/50"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Send Reset Link
                      </>
                    )}
                  </Button>
                </form>

                <div className="pt-4 text-center">
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/login">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to login
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="pt-6 pb-8">
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Check your email</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    We&apos;ve sent a password reset link to <strong>{email}</strong>
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Click the link in the email to reset your password.
                  </p>
                </div>

                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
                  <p className="font-medium mb-1">📧 Didn&apos;t receive it?</p>
                  <p className="text-xs text-amber-700">
                    Check your spam folder. The link expires in 1 hour.
                  </p>
                </div>

                <div className="pt-4 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsSuccess(false);
                      setEmail('');
                    }}
                    className="w-full"
                  >
                    Try a different email
                  </Button>
                  
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/login">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to login
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
