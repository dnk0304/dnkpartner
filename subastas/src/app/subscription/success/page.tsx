"use client";

import React, { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">¡Suscripción Confirmada!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-gray-600">
            Tu suscripción se ha activado correctamente. Ya tienes acceso a todas las funciones premium.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-left">
            <p className="font-semibold text-blue-900 mb-2">¿Qué sigue?</p>
            <ul className="space-y-1 text-blue-800">
              <li>✓ Configura tus alertas personalizadas</li>
              <li>✓ Explora todas las subastas desbloqueadas</li>
              <li>✓ Recibe notificaciones en tiempo real</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Link href="/" className="w-full">
              <Button className="w-full">
                Ir al Dashboard
              </Button>
            </Link>
            <Link href="/alerts" className="w-full">
              <Button variant="outline" className="w-full">
                Configurar Alertas
              </Button>
            </Link>
          </div>

          {sessionId && (
            <p className="text-xs text-gray-500 pt-4">
              ID de sesión: {sessionId.slice(0, 20)}...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
