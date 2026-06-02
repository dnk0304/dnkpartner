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
  Shield
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
 */

interface BackfillStatus {
  isRunning: boolean;
  completedMonths: string[];
  totalAuctions: number;
  errors: any[];
  progress: {
    total: number;
    completed: number;
    remaining: number;
    percentage: number;
  };
}

interface AuctionStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; count: number }[];
  bySource: { source: string; count: number }[];
  byProvince: { province: string; count: number }[];
  coordinates: {
    withCoords: number;
    withoutCoords: number;
  };
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

interface UsersData {
  users: any[];
  summary: {
    total: number;
    byTier: { tier: string; count: number }[];
    withSubscriptions: number;
    withActiveTrials: number;
  };
}

interface EmailData {
  totalAlerts: number;
  activeAlerts: number;
  inactiveAlerts: number;
  topUsers: any[];
  recentActivity: any[];
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [backfillStatus, setBackfillStatus] = useState<BackfillStatus | null>(null);
  const [auctionStats, setAuctionStats] = useState<AuctionStats | null>(null);
  const [usersData, setUsersData] = useState<UsersData | null>(null);
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'backfill' | 'users' | 'emails'>('overview');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [backfill, stats, users, emails] = await Promise.all([
        apiFetch('/api/admin/backfill').then(r => r.json()),
        apiFetch('/api/admin/stats').then(r => r.json()),
        apiFetch('/api/admin/users').then(r => r.json()),
        apiFetch('/api/admin/emails').then(r => r.json())
      ]);

      setBackfillStatus(backfill);
      setAuctionStats(stats);
      setUsersData(users);
      setEmailData(emails);
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
        {activeTab === 'overview' && auctionStats && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Subastas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">{auctionStats.total.toLocaleString()}</div>
                  <p className="text-xs text-gray-500 mt-1">En toda la base de datos</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Con Coordenadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {auctionStats.coordinates.withCoords.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.round((auctionStats.coordinates.withCoords / auctionStats.total) * 100)}% del total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Sin Coordenadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600">
                    {auctionStats.coordinates.withoutCoords.toLocaleString()}
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
                    {backfillStatus?.progress.percentage || 0}%
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {backfillStatus?.progress.completed || 0} / {backfillStatus?.progress.total || 72} meses
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
                  {auctionStats.byCategory.slice(0, 10).map((cat) => (
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
                  {auctionStats.byProvince.map((prov) => (
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
        {activeTab === 'backfill' && backfillStatus && (
          <div className="space-y-6">
            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Estado del Scraper Backfill</span>
                  {backfillStatus.isRunning ? (
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
                      <span>{backfillStatus.progress.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                        style={{ width: `${backfillStatus.progress.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{backfillStatus.progress.completed} meses completados</span>
                      <span>{backfillStatus.progress.remaining} meses restantes</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-600">Total Subastas</p>
                      <p className="text-2xl font-bold text-gray-900">{backfillStatus.totalAuctions.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Meses Completados</p>
                      <p className="text-2xl font-bold text-green-600">{backfillStatus.progress.completed}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Errores</p>
                      <p className="text-2xl font-bold text-red-600">{backfillStatus.errors.length}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Errors */}
            {backfillStatus.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    Errores ({backfillStatus.errors.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {backfillStatus.errors.map((err: any, idx: number) => (
                      <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="font-medium text-sm text-red-900">{err.month}</p>
                        <p className="text-xs text-red-700 mt-1">{err.error}</p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(err.timestamp).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Completed Months */}
            <Card>
              <CardHeader>
                <CardTitle>Meses Completados ({backfillStatus.completedMonths.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-6 gap-2">
                  {backfillStatus.completedMonths.sort().reverse().map((month) => (
                    <Badge key={month} variant="outline" className="justify-center">
                      <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                      {month}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
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
                  <div className="text-3xl font-bold text-gray-900">{usersData.summary.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Con Suscripción</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{usersData.summary.withSubscriptions}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Trials Activos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">{usersData.summary.withActiveTrials}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Usuarios Free</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-600">
                    {usersData.summary.byTier.find(t => t.tier === 'FREE')?.count || 0}
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
                          <td className="py-2 px-4 text-gray-600">
                            {new Date(user.createdAt).toLocaleDateString()}
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
