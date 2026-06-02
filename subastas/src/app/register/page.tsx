'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { apiFetch } from "@/lib/api-path";

/**
 * Inline Google "G" mark. Mirrors /login — see comment there. Keeping the
 * SVG inline (rather than sharing a component) so both auth pages can be
 * code-split independently without a shared chunk dependency.
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

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const validatePassword = () => {
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!validatePassword()) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'No se ha podido crear la cuenta. Inténtalo de nuevo.');
      } else {
        setIsSuccess(true);
        // Automatically redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err) {
      setError('Se ha producido un error inesperado. Inténtalo de nuevo.');
      console.error('Registration error:', err);
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
      setError('No se pudo registrar con Google. Inténtalo de nuevo.');
      console.error('google register error:', err);
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Únete a SubastasActivas</h1>
          <p className="mt-2 text-sm text-gray-600">Empieza a seguir subastas judiciales en toda España.</p>
        </div>

        <Card className="border-gray-200 shadow-xl">
          {!isSuccess ? (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl text-gray-900">Crear cuenta</CardTitle>
                <CardDescription className="text-gray-700">
                  Introduce tus datos para empezar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                      Conectando con Google…
                    </>
                  ) : (
                    <>
                      <GoogleIcon className="mr-2 h-4 w-4" />
                      Continuar con Google
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-600">o regístrate con email</span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-900">Correo electrónico</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="nombre@ejemplo.com"
                      className="bg-gray-50/50 text-gray-900"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-900">Contraseña</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Crea una contraseña segura"
                        className="bg-gray-50/50 pr-10 text-gray-900"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-600">
                      Debe tener al menos 8 caracteres.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-gray-900">Confirmar contraseña</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirma tu contraseña"
                        className="bg-gray-50/50 pr-10 text-gray-900"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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
                        Creando cuenta…
                      </>
                    ) : (
                      'Crear cuenta'
                    )}
                  </Button>
                </form>

                <div className="pt-4 text-center text-xs text-gray-700">
                  ¿Ya tienes cuenta?{' '}
                  <Link href="/login" className="font-medium text-black hover:underline">
                    Inicia sesión
                  </Link>
                </div>

                <p className="text-xs text-center text-gray-600 pt-2">
                  Al crear una cuenta aceptas nuestros{' '}
                  <Link href="/terms" className="underline hover:text-gray-900">
                    Términos del servicio
                  </Link>{' '}
                  y la{' '}
                  <Link href="/privacy" className="underline hover:text-gray-900">
                    Política de privacidad
                  </Link>
                  .
                </p>
              </CardContent>
            </>
          ) : (
            <CardContent className="pt-6 pb-8">
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">¡Cuenta creada!</h3>
                  <p className="mt-2 text-sm text-gray-700">
                    Tu cuenta se ha creado correctamente con <strong>{email}</strong>
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Redirigiéndote al inicio de sesión…
                  </p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
