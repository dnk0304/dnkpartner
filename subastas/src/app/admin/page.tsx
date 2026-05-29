"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  Database, 
  Globe, 
  RefreshCw, 
  Server,
  TrendingUp,
  Users,
  Zap,
  Clock,
  Eye,
  Search,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';

interface SystemHealth {
  database: {
    status: 'healthy' | 'warning' | 'error';
    auctionCount: number;
    userCount: number;
    alertCount: number;
    lastBackup?: string;
  };
  scrapers: {
    boe: {
      status: 'running' | 'idle' | 'error';
      lastRun: string;
      successRate: number;
      auctionsFound: number;
      errors?: string[];
    };
    teju: {
      status: 'running' | 'idle' | 'error';
      lastRun: string;
      successRate: number;
      auctionsFound: number;
      errors?: string[];
    };
  };
  api: {
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    requestsToday: number;
    errorRate: number;
  };
  notifications: {
    emailsSent: number;
    smsSent: number;
    failedDeliveries: number;
  };
}

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchHealthData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchHealthData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchHealthData = async () => {
    try {
      setLoading(true);

      // Mock data - in production, fetch from real API
      const mockHealth: SystemHealth = {
        database: {
          status: 'healthy',
          auctionCount: 1847,
          userCount: 423,
          alertCount: 1256,
          lastBackup: '2026-01-20T02:00:00Z'
        },
        scrapers: {
          boe: {
            status: 'idle',
            lastRun: '2026-01-20T09:15:00Z',
            successRate: 98.5,
            auctionsFound: 37,
            errors: []
          },
          teju: {
            status: 'running',
            lastRun: '2026-01-20T09:30:00Z',
            successRate: 92.3,
            auctionsFound: 12,
            errors: ['OCR falló en 2 PDFs']
          }
        },
        api: {
          status: 'healthy',
          responseTime: 145,
          requestsToday: 8432,
          errorRate: 0.3
        },
        notifications: {
          emailsSent: 234,
          smsSent: 89,
          failedDeliveries: 3
        }
      };

      setHealth(mockHealth);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching health data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'running':
        return <Badge className="bg-green-100 text-green-700 border-green-300">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Activo
        </Badge>;
      case 'idle':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
          <Clock className="w-3 h-3 mr-1" />
          En Espera
        </Badge>;
      case 'warning':
      case 'degraded':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Advertencia
        </Badge>;
      case 'error':
      case 'down':
        return <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Error
        </Badge>;
      default:
        return null;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Justo ahora';
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
                <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
                <p className="text-sm text-gray-600">Monitoreo de sistemas y scrapers en tiempo real</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right mr-4">
                <p className="text-xs text-gray-500">Última actualización</p>
                <p className="text-sm font-medium">{lastUpdated.toLocaleTimeString('es-ES')}</p>
              </div>
              <Button onClick={fetchHealthData} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Link href="/">
                <Button variant="outline" size="sm">Volver</Button>
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
        ) : health ? (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">
                      Estado General
                    </CardTitle>
                    <Server className="w-5 h-5 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(health.api.status)}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Todos los sistemas operativos</p>
                </CardContent>
              </Card>

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
                  <div className="text-3xl font-bold">{health.database.auctionCount.toLocaleString()}</div>
                  <p className="text-xs text-gray-500 mt-1">Subastas totales</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">
                      API Performance
                    </CardTitle>
                    <Zap className="w-5 h-5 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{health.api.responseTime}ms</div>
                  <p className="text-xs text-gray-500 mt-1">Tiempo de respuesta</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">
                      Usuarios Activos
                    </CardTitle>
                    <Users className="w-5 h-5 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{health.database.userCount}</div>
                  <p className="text-xs text-gray-500 mt-1">Registrados</p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Sections */}
            <Tabs defaultValue="scrapers" className="space-y-6">
              <TabsList>
                <TabsTrigger value="scrapers">
                  <Search className="w-4 h-4 mr-2" />
                  Scrapers
                </TabsTrigger>
                <TabsTrigger value="api">
                  <Globe className="w-4 h-4 mr-2" />
                  API
                </TabsTrigger>
                <TabsTrigger value="database">
                  <Database className="w-4 h-4 mr-2" />
                  Base de Datos
                </TabsTrigger>
                <TabsTrigger value="notifications">
                  <Zap className="w-4 h-4 mr-2" />
                  Notificaciones
                </TabsTrigger>
              </TabsList>

              {/* Scrapers Tab */}
              <TabsContent value="scrapers" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* BOE Scraper */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>BOE Scraper</CardTitle>
                          <CardDescription>Extracción de subastas activas del BOE</CardDescription>
                        </div>
                        {getStatusBadge(health.scrapers.boe.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Última ejecución</p>
                          <p className="font-semibold">{formatTimeAgo(health.scrapers.boe.lastRun)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Subastas encontradas</p>
                          <p className="font-semibold">{health.scrapers.boe.auctionsFound}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Tasa de éxito</p>
                          <p className="font-semibold text-green-600">{health.scrapers.boe.successRate}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Errores</p>
                          <p className="font-semibold">{health.scrapers.boe.errors?.length || 0}</p>
                        </div>
                      </div>

                      {health.scrapers.boe.errors && health.scrapers.boe.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-red-800 mb-1">Errores recientes:</p>
                          {health.scrapers.boe.errors.map((error, idx) => (
                            <p key={idx} className="text-xs text-red-700">• {error}</p>
                          ))}
                        </div>
                      )}

                      <Button className="w-full" variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Ejecutar Ahora
                      </Button>
                    </CardContent>
                  </Card>

                  {/* TEJU Scraper */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>TEJU Scraper</CardTitle>
                          <CardDescription>Extracción de pre-subastas con OCR</CardDescription>
                        </div>
                        {getStatusBadge(health.scrapers.teju.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Última ejecución</p>
                          <p className="font-semibold">{formatTimeAgo(health.scrapers.teju.lastRun)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Pre-subastas encontradas</p>
                          <p className="font-semibold">{health.scrapers.teju.auctionsFound}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Tasa de éxito</p>
                          <p className="font-semibold text-yellow-600">{health.scrapers.teju.successRate}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Errores</p>
                          <p className="font-semibold">{health.scrapers.teju.errors?.length || 0}</p>
                        </div>
                      </div>

                      {health.scrapers.teju.errors && health.scrapers.teju.errors.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">Advertencias:</p>
                          {health.scrapers.teju.errors.map((error, idx) => (
                            <p key={idx} className="text-xs text-yellow-700">• {error}</p>
                          ))}
                        </div>
                      )}

                      <Button className="w-full" variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Ejecutar Ahora
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Scraper Schedule */}
                <Card>
                  <CardHeader>
                    <CardTitle>Programación de Tareas</CardTitle>
                    <CardDescription>Frecuencia de ejecución de scrapers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-gray-600" />
                          <div>
                            <p className="font-medium">BOE Discovery (Nuevas subastas)</p>
                            <p className="text-sm text-gray-600">Busca nuevas publicaciones en el BOE</p>
                          </div>
                        </div>
                        <Badge variant="outline">Cada 6 horas</Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-gray-600" />
                          <div>
                            <p className="font-medium">BOE Pulse (Actualización de pujas)</p>
                            <p className="text-sm text-gray-600">Actualiza pujas de subastas activas</p>
                          </div>
                        </div>
                        <Badge variant="outline">Cada 15 min</Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-gray-600" />
                          <div>
                            <p className="font-medium">TEJU Pre-Auctions</p>
                            <p className="text-sm text-gray-600">Extrae datos de PDFs judiciales</p>
                          </div>
                        </div>
                        <Badge variant="outline">Cada 12 horas</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* API Tab */}
              <TabsContent value="api" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Peticiones Hoy</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{health.api.requestsToday.toLocaleString()}</div>
                      <p className="text-xs text-gray-500 mt-1">+12% vs ayer</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Tasa de Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-600">{health.api.errorRate}%</div>
                      <p className="text-xs text-gray-500 mt-1">Muy bajo</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Tiempo Respuesta</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{health.api.responseTime}ms</div>
                      <p className="text-xs text-gray-500 mt-1">Promedio P95</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Endpoints Más Usados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { endpoint: '/api/auctions', requests: 3421, avgTime: 142 },
                        { endpoint: '/api/stats', requests: 2156, avgTime: 89 },
                        { endpoint: '/api/alerts', requests: 1543, avgTime: 156 },
                        { endpoint: '/api/stripe/checkout', requests: 312, avgTime: 234 }
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-mono text-sm font-medium">{item.endpoint}</p>
                            <p className="text-xs text-gray-600">{item.requests} peticiones</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{item.avgTime}ms</p>
                            <p className="text-xs text-gray-600">promedio</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Database Tab */}
              <TabsContent value="database" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Subastas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{health.database.auctionCount.toLocaleString()}</div>
                      <p className="text-xs text-gray-500 mt-1">Registros totales</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Usuarios</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{health.database.userCount}</div>
                      <p className="text-xs text-gray-500 mt-1">Cuentas registradas</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Alertas Activas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{health.database.alertCount.toLocaleString()}</div>
                      <p className="text-xs text-gray-500 mt-1">Configuradas</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Respaldo y Mantenimiento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium">Último respaldo</p>
                          <p className="text-sm text-gray-600">
                            {health.database.lastBackup ? new Date(health.database.lastBackup).toLocaleString('es-ES') : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Crear Backup
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Tamaño BD</p>
                        <p className="font-semibold text-lg">142 MB</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Espacio libre</p>
                        <p className="font-semibold text-lg">8.5 GB</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Emails Enviados</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{health.notifications.emailsSent}</div>
                      <p className="text-xs text-gray-500 mt-1">Hoy</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">SMS Enviados</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{health.notifications.smsSent}</div>
                      <p className="text-xs text-gray-500 mt-1">Hoy</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Fallos de Entrega</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-yellow-600">{health.notifications.failedDeliveries}</div>
                      <p className="text-xs text-gray-500 mt-1">Últimas 24h</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Configuración de Servicios</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">SendGrid (Email)</p>
                        <p className="text-sm text-gray-600">Proveedor de correo electrónico</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700">Conectado</Badge>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Twilio (SMS)</p>
                        <p className="text-sm text-gray-600">Proveedor de mensajería SMS</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700">Conectado</Badge>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">Verificación de alertas</p>
                        <p className="text-sm text-gray-600">Comprobación cada 15 minutos</p>
                      </div>
                      <Button variant="outline" size="sm">
                        Ejecutar Ahora
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </div>
  );
}
