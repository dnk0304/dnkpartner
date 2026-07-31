'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  Users,
  Mail,
  AlertCircle,
  CheckCircle2,
  Clock,
  BarChart3,
  RefreshCw,
  Shield,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from "@/lib/api-path";

/**
 * Admin root dashboard — FULL real-data version.
 *
 * Dennis's wave18 directive: the full dashboard lives at /admin (not at
 * /admin/dashboard). This page was promoted from /admin/dashboard.
 * /admin/dashboard now redirects here.
 *
 * Page-shell auth is enforced by /admin/layout.tsx (server gate via
 * requireAdmin). The previously-inline client-side email check has been
 * removed — it was redundant with the server gate and only ran AFTER the
 * client bundle loaded.
 *
 * Data sources: /api/admin/backfill, /stats, /users, /emails (all gated).
 *
 * CLIENT-CRASH HARDENING (wave171 follow-up): every one of those endpoints
 * can return (a) its real success payload, (b) an `{ error: '...' }` body
 * (403/500 — still a truthy object), or (c) nothing on a network fault.
 * The render code below NEVER touches a raw response. Each response is run
 * through a `normalize*()` function that returns a guaranteed-shaped
 * view-model with numeric/array defaults, so a missing/partial/error payload
 * renders a sane empty state instead of throwing
 * `Cannot read properties of undefined`. In particular the backfill route
 * returns `{ scrapers, totals }` (NOT the legacy `{ progress, completedMonths }`
 * shape) — the normalizer is the single point that reconciles that.
 */

// ---------------------------------------------------------------------------
// View-models — the ONLY shapes the render tree is allowed to read. Every
// field is non-optional with a safe default, so there is no undefined access.
// ---------------------------------------------------------------------------

interface BackfillView {
  isRunning: boolean;
  percentage: number;
  completed: number;
  total: number;
  remaining: number;
  totalAuctions: number;
  errors: { month?: string; error?: string; timestamp?: string }[];
}

interface StatsView {
  total: number;
  withCoords: number;
  withoutCoords: number;
  coordsPct: number;
  byCategory: { category: string; count: number }[];
  byProvince: { province: string; count: number }[];
}

interface UserRowView {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  alertCount: number;
  hasSubscription: boolean;
  status?: 'paid' | 'trial' | 'expired';
  trialDaysLeft: number | null;
  trialEndDate: string | null;
  createdAt: string | null;
}

interface UsersView {
  total: number;
  withSubscriptions: number;
  withActiveTrials: number;
  freeCount: number;
  users: UserRowView[];
}

interface EmailsView {
  totalAlerts: number;
  activeAlerts: number;
  inactiveAlerts: number;
  topUsers: { userId: string; email: string; count: number }[];
  recentActivity: { date: string; count: number }[];
}

const toNum = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const toArr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/**
 * Reconcile the LIVE backfill API shape `{ scrapers, totals }` into the flat
 * view-model the panel renders. The legacy `{ progress, completedMonths }`
 * shape this file was originally written against does not exist on the route —
 * reading it was the source of the `percentage` TypeError.
 */
function normalizeBackfill(raw: any): BackfillView {
  const scrapers = toArr(raw?.scrapers);
  const totals = raw?.totals ?? {};
  const total = toNum(totals.batches);
  const completed = toNum(totals.completed);
  const errors = scrapers.flatMap((s: any) => toArr(s?.errors));
  return {
    isRunning: scrapers.some((s: any) => Boolean(s?.isRunning)),
    percentage: toNum(totals.percentage),
    completed,
    total,
    remaining: Math.max(0, total - completed),
    totalAuctions: toNum(totals.auctions),
    errors,
  };
}

function normalizeStats(raw: any): StatsView {
  const total = toNum(raw?.total);
  const withCoords = toNum(raw?.coordinates?.withCoords);
  const withoutCoords = toNum(raw?.coordinates?.withoutCoords);
  return {
    total,
    withCoords,
    withoutCoords,
    coordsPct: total > 0 ? Math.round((withCoords / total) * 100) : 0,
    byCategory: toArr(raw?.byCategory)
      .filter((c: any) => c && c.category != null)
      .map((c: any) => ({ category: String(c.category), count: toNum(c.count) })),
    byProvince: toArr(raw?.byProvince)
      .filter((p: any) => p && p.province != null)
      .map((p: any) => ({ province: String(p.province), count: toNum(p.count) })),
  };
}

function normalizeUsers(raw: any): UsersView {
  const summary = raw?.summary ?? {};
  const byTier = toArr(summary.byTier);
  return {
    total: toNum(summary.total),
    // API summary exposes `paid` (tier-based) + `trial` (active trials); the
    // legacy `withSubscriptions` / `withActiveTrials` names don't exist.
    withSubscriptions: toNum(summary.paid),
    withActiveTrials: toNum(summary.trial),
    freeCount: toNum(byTier.find((t: any) => t?.tier === 'FREE')?.count),
    users: toArr(raw?.users).map((u: any) => ({
      id: String(u?.id ?? ''),
      email: String(u?.email ?? ''),
      name: u?.name ?? null,
      tier: String(u?.tier ?? ''),
      alertCount: toNum(u?.alertCount),
      hasSubscription: Boolean(u?.hasSubscription),
      status: u?.status,
      trialDaysLeft: u?.trialDaysLeft ?? null,
      trialEndDate: u?.trialEndDate ?? null,
      createdAt: u?.createdAt ?? null,
    })),
  };
}

function normalizeEmails(raw: any): EmailsView {
  return {
    totalAlerts: toNum(raw?.totalAlerts),
    activeAlerts: toNum(raw?.activeAlerts),
    inactiveAlerts: toNum(raw?.inactiveAlerts),
    topUsers: toArr(raw?.topUsers).map((u: any) => ({
      userId: String(u?.userId ?? ''),
      email: String(u?.email ?? ''),
      count: toNum(u?.count),
    })),
    recentActivity: toArr(raw?.recentActivity).map((a: any) => ({
      date: String(a?.date ?? ''),
      count: toNum(a?.count),
    })),
  };
}

/**
 * Trial-standing cell for the Users table. Reads the API's derived `status`
 * (paid | trial | expired) plus the additive `trialDaysLeft` field (Forge) —
 * no client-side date math. Every state carries a text label so the meaning
 * never depends on color alone (WCAG 1.4.1).
 *   - paid      -> green "Pagado" (a paying user is never "expired")
 *   - trial     -> blue "N días" (+ end date on hover/subtext)
 *   - expired w/ a past trial date -> red "Caducado"
 *   - no trial date at all         -> muted "—" (never started a trial)
 */
function TrialCell({
  status,
  trialDaysLeft,
  trialEndDate,
}: {
  status?: 'paid' | 'trial' | 'expired';
  trialDaysLeft: number | null;
  trialEndDate: string | null;
}) {
  if (status === 'paid') {
    return (
      <Badge className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-100">
        Pagado
      </Badge>
    );
  }

  if (status === 'trial' && trialDaysLeft !== null && trialDaysLeft > 0) {
    const endLabel = trialEndDate
      ? `Prueba finaliza el ${new Date(trialEndDate).toLocaleDateString()}`
      : undefined;
    return (
      <span className="inline-flex items-center gap-1.5" title={endLabel}>
        <Badge className="bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-100">
          <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
          {trialDaysLeft} {trialDaysLeft === 1 ? 'día' : 'días'}
        </Badge>
      </span>
    );
  }

  // No trial date ever set — not expired, simply never on trial.
  if (trialDaysLeft === null) {
    return <span className="text-gray-400">—</span>;
  }

  // Trial date exists but has elapsed.
  return (
    <Badge className="bg-red-100 text-red-800 border border-red-300 hover:bg-red-100">
      Caducado
    </Badge>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [backfill, setBackfill] = useState<BackfillView | null>(null);
  const [stats, setStats] = useState<StatsView | null>(null);
  const [usersData, setUsersData] = useState<UsersView | null>(null);
  const [emailData, setEmailData] = useState<EmailsView | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'backfill' | 'users' | 'emails'>('overview');

  useEffect(() => {
    fetchAllData();
  }, []);

  const safeJson = async (path: string): Promise<any> => {
    try {
      const r = await apiFetch(path);
      return await r.json();
    } catch {
      return null;
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [backfillRaw, statsRaw, usersRaw, emailsRaw] = await Promise.all([
        safeJson('/api/admin/backfill'),
        safeJson('/api/admin/stats'),
        safeJson('/api/admin/users'),
        safeJson('/api/admin/emails'),
      ]);

      // Normalizers are total functions: null / {error} / partial -> safe view.
      setBackfill(normalizeBackfill(backfillRaw));
      setStats(normalizeStats(statsRaw));
      setUsersData(normalizeUsers(usersRaw));
      setEmailData(normalizeEmails(emailsRaw));
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Cargando panel de administración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Panel de Administración</h1>
            </div>
            <p className="text-gray-600 mt-1">Gestión del sistema y monitoreo</p>
          </div>
          <Button onClick={fetchAllData} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'overview'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BarChart3 className="inline h-4 w-4 mr-2" />
            Resumen
          </button>
          <button
            onClick={() => setActiveTab('backfill')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'backfill'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Database className="inline h-4 w-4 mr-2" />
            Scraper Backfill
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'users'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="inline h-4 w-4 mr-2" />
            Usuarios
          </button>
          <button
            onClick={() => setActiveTab('emails')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'emails'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="inline h-4 w-4 mr-2" />
            Emails & Alertas
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Subastas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
                  <p className="text-xs text-gray-500 mt-1">En toda la base de datos</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Con Coordenadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {stats.withCoords.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.coordsPct}% del total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Sin Coordenadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600">
                    {stats.withoutCoords.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Pendientes de geocodificación</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Progreso Backfill</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">
                    {backfill?.percentage ?? 0}%
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {backfill?.completed ?? 0} / {backfill?.total ?? 0} lotes
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Top Categories */}
            <Card>
              <CardHeader>
                <CardTitle>Top Categorías</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.byCategory.slice(0, 10).map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{cat.category}</span>
                      <Badge variant="secondary">{cat.count.toLocaleString()}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Provinces */}
            <Card>
              <CardHeader>
                <CardTitle>Top Provincias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.byProvince.map((prov) => (
                    <div key={prov.province} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{prov.province}</span>
                      <Badge variant="secondary">{prov.count.toLocaleString()}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Backfill Tab */}
        {activeTab === 'backfill' && backfill && (
          <div className="space-y-6">
            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Estado del Scraper Backfill</span>
                  {backfill.isRunning ? (
                    <Badge className="bg-green-500">
                      <Clock className="h-3 w-3 mr-1 animate-pulse" />
                      En Ejecución
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Detenido</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium">Progreso Total</span>
                      <span>{backfill.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                        style={{ width: `${backfill.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{backfill.completed} lotes completados</span>
                      <span>{backfill.remaining} lotes restantes</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-600">Total Subastas</p>
                      <p className="text-2xl font-bold text-gray-900">{backfill.totalAuctions.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Lotes Completados</p>
                      <p className="text-2xl font-bold text-green-600">{backfill.completed}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Errores</p>
                      <p className="text-2xl font-bold text-red-600">{backfill.errors.length}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Errors */}
            {backfill.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    Errores ({backfill.errors.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {backfill.errors.map((err, idx) => (
                      <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        {err?.month && <p className="font-medium text-sm text-red-900">{err.month}</p>}
                        <p className="text-xs text-red-700 mt-1">
                          {typeof err === 'string' ? err : err?.error ?? 'Error desconocido'}
                        </p>
                        {formatDateTime(err?.timestamp) && (
                          <p className="text-xs text-gray-500 mt-1">{formatDateTime(err?.timestamp)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && usersData && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Usuarios</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">{usersData.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Con Suscripción</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{usersData.withSubscriptions}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Trials Activos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">{usersData.withActiveTrials}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Usuarios Free</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-600">
                    {usersData.freeCount}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Users List */}
            <Card>
              <CardHeader>
                <CardTitle>Lista de Usuarios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">Email</th>
                        <th className="text-left py-2 px-4">Nombre</th>
                        <th className="text-left py-2 px-4">Tier</th>
                        <th className="text-left py-2 px-4">Alertas</th>
                        <th className="text-left py-2 px-4">Suscripción</th>
                        <th scope="col" className="text-left py-2 px-4">Prueba</th>
                        <th className="text-left py-2 px-4">Registro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.users.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-4">{user.email}</td>
                          <td className="py-2 px-4">{user.name || '-'}</td>
                          <td className="py-2 px-4">
                            <Badge variant={user.tier === 'FREE' ? 'secondary' : 'default'}>
                              {user.tier}
                            </Badge>
                          </td>
                          <td className="py-2 px-4">{user.alertCount}</td>
                          <td className="py-2 px-4">
                            {user.hasSubscription ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 px-4">
                            <TrialCell
                              status={user.status}
                              trialDaysLeft={user.trialDaysLeft}
                              trialEndDate={user.trialEndDate}
                            />
                          </td>
                          <td className="py-2 px-4 text-gray-600">
                            {formatDate(user.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Emails Tab */}
        {activeTab === 'emails' && emailData && (
          <div className="space-y-6">
            {/* Email Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Alertas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">{emailData.totalAlerts}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Alertas Activas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{emailData.activeAlerts}</div>
                  <p className="text-xs text-gray-500 mt-1">Enviando notificaciones</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Alertas Inactivas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-600">{emailData.inactiveAlerts}</div>
                </CardContent>
              </Card>
            </div>

            {/* Top Alert Users */}
            <Card>
              <CardHeader>
                <CardTitle>Usuarios con Más Alertas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {emailData.topUsers.map((user) => (
                    <div key={user.userId} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                      <span className="text-sm font-medium text-gray-700">{user.email}</span>
                      <Badge>{user.count} alertas</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Actividad Reciente (Últimos 30 días)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {emailData.recentActivity.map((activity) => (
                    <div key={activity.date} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{activity.date}</span>
                      <Badge variant="secondary">{activity.count} alertas creadas</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
