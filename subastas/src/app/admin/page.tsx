"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
  Users,
  Clock,
  Search,
  AlertTriangle,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-path";

/**
 * Admin root dashboard.
 *
 * Pulls REAL data from the (now admin-gated) /api/admin/health endpoint.
 * Previously this page rendered a hardcoded `mockHealth` object — looked
 * legit but was fiction. Mock-only fields (api.responseTime, requestsToday,
 * errorRate, notifications.emailsSent/smsSent/failedDeliveries,
 * scrapers.*.successRate, database.lastBackup) have been DELETED rather
 * than shown as fake numbers. The corresponding tabs/cards are removed.
 *
 * Page-shell auth is enforced by /admin/layout.tsx (server redirect).
 */

interface SystemHealth {
  database: {
    status: "healthy" | "warning" | "error";
    auctionCount: number;
    userCount: number;
    alertCount: number;
  };
  scrapers: {
    boe: {
      status: "running" | "idle" | "error";
      lastRun: string | null;
      auctionsFound: number;
    };
  };
}

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealthData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/admin/health");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        success: boolean;
        data?: SystemHealth;
        error?: string;
      };
      if (!body.success || !body.data) {
        throw new Error(body.error || "Failed to load health data");
      }
      setHealth(body.data);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Error fetching health data:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
      case "running":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-300">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Activo
          </Badge>
        );
      case "idle":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-300"
          >
            <Clock className="w-3 h-3 mr-1" />
            En Espera
          </Badge>
        );
      case "warning":
      case "degraded":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-300"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Advertencia
          </Badge>
        );
      case "error":
      case "down":
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return "Sin datos";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Justo ahora";
    if (diffMins < 60) return `Hace ${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays}d`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Activity className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Panel de Administración
                </h1>
                <p className="text-sm text-gray-600">
                  Monitoreo de base de datos y scrapers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right mr-4">
                <p className="text-xs text-gray-500">Última actualización</p>
                <p className="text-sm font-medium">
                  {lastUpdated.toLocaleTimeString("es-ES")}
                </p>
              </div>
              <Button
                onClick={fetchHealthData}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Actualizar
              </Button>
              <Link href="/">
                <Button variant="outline" size="sm">
                  Volver
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {loading && !health ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-gray-500">Cargando datos del sistema...</p>
          </div>
        ) : error && !health ? (
          <div className="text-center py-12">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="mt-4 text-red-600">
              No se pudo cargar el estado del sistema: {error}
            </p>
          </div>
        ) : health ? (
          <>
            {/* Overview Cards — REAL DB-sourced only */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">
                      Base de Datos
                    </CardTitle>
                    <Database className="w-5 h-5 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {health.database.auctionCount.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Subastas totales</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">
                      Usuarios
                    </CardTitle>
                    <Users className="w-5 h-5 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {health.database.userCount.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Registrados</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">
                      Alertas
                    </CardTitle>
                    <Bell className="w-5 h-5 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {health.database.alertCount.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Configuradas</p>
                </CardContent>
              </Card>
            </div>

            {/* Scrapers + DB tabs only. API + Notifications tabs removed
                until a real metrics/email-log source exists. */}
            <Tabs defaultValue="scrapers" className="space-y-6">
              <TabsList>
                <TabsTrigger value="scrapers">
                  <Search className="w-4 h-4 mr-2" />
                  Scrapers
                </TabsTrigger>
                <TabsTrigger value="database">
                  <Database className="w-4 h-4 mr-2" />
                  Base de Datos
                </TabsTrigger>
              </TabsList>

              {/* Scrapers Tab — BOE only (TEJU removed; no real source) */}
              <TabsContent value="scrapers" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>BOE Scraper</CardTitle>
                        <CardDescription>
                          Actividad del scraper de subastas BOE (últimas 24h)
                        </CardDescription>
                      </div>
                      {getStatusBadge(health.scrapers.boe.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">
                          Última ingestión
                        </p>
                        <p className="font-semibold">
                          {formatTimeAgo(health.scrapers.boe.lastRun)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">
                          Subastas nuevas (24h)
                        </p>
                        <p className="font-semibold">
                          {health.scrapers.boe.auctionsFound.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Derivado de filas insertadas en Auction. Para control
                      manual de scrapers visita{" "}
                      <Link
                        href="/admin/scraper"
                        className="underline hover:text-gray-700"
                      >
                        /admin/scraper
                      </Link>
                      .
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Programación de Tareas</CardTitle>
                    <CardDescription>
                      Frecuencia configurada del scheduler
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-gray-600" />
                          <div>
                            <p className="font-medium">
                              BOE Discovery (Nuevas subastas)
                            </p>
                            <p className="text-sm text-gray-600">
                              Busca nuevas publicaciones en el BOE
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">Cada 6 horas</Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-gray-600" />
                          <div>
                            <p className="font-medium">
                              BOE Pulse (Actualización de pujas)
                            </p>
                            <p className="text-sm text-gray-600">
                              Actualiza pujas de subastas activas
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">Cada 15 min</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Database Tab — real counts only */}
              <TabsContent value="database" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Subastas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {health.database.auctionCount.toLocaleString()}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Registros totales
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Usuarios</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {health.database.userCount.toLocaleString()}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Cuentas registradas
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">
                        Alertas Activas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {health.database.alertCount.toLocaleString()}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Configuradas</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </div>
  );
}
