"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Crown, 
  TrendingUp, 
  Calendar, 
  AlertCircle, 
  Building2, 
  FileText,
  Phone,
  CheckCircle2,
  Clock,
  MapPin,
  Euro
} from 'lucide-react';
import Link from 'next/link';

interface PreAuctionItem {
  id: string;
  title: string;
  category: string;
  province: string;
  appraisalValue: number;
  estimatedDate: string;
  status: 'judicial_process' | 'pending_publish' | 'announced';
  source: 'TEJU';
  daysUntilAuction: number;
  courtName?: string;
  procedureNumber?: string;
  address?: string;
  cargasAnteriores?: { type: string; amount: number }[];
  cargasPreferentes?: { type: string; amount: number }[];
  occupancyStatus?: string;
}

export default function DiamondDashboard() {
  const [preAuctions, setPreAuctions] = useState<PreAuctionItem[]>([]);
  const [removedAuctions, setRemovedAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pipeline');

  useEffect(() => {
    // Fetch Diamond-exclusive data
    const fetchDiamondData = async () => {
      try {
        setLoading(true);
        // For now, mock data - will connect to API later
        const mockPreAuctions: PreAuctionItem[] = [
          {
            id: 'teju-1',
            title: 'Vivienda de lujo en Las Canteras',
            category: 'Viviendas',
            province: 'Las Palmas',
            appraisalValue: 450000,
            estimatedDate: '2026-02-15',
            status: 'judicial_process',
            source: 'TEJU',
            daysUntilAuction: 26,
            courtName: 'Juzgado Primera Instancia nº 3',
            procedureNumber: 'PJ-2024-00453',
            address: 'Calle León y Castillo, 45, 3ºA',
            cargasAnteriores: [
              { type: 'Hipoteca', amount: 280000 }
            ],
            cargasPreferentes: [
              { type: 'IBI pendiente', amount: 1200 },
              { type: 'Comunidad', amount: 800 }
            ],
            occupancyStatus: 'Desocupado'
          },
          {
            id: 'teju-2',
            title: 'Local comercial en zona centro',
            category: 'Locales',
            province: 'Las Palmas',
            appraisalValue: 320000,
            estimatedDate: '2026-02-28',
            status: 'pending_publish',
            source: 'TEJU',
            daysUntilAuction: 39,
            courtName: 'Juzgado Primera Instancia nº 5',
            procedureNumber: 'PJ-2024-00521',
            address: 'Calle Mayor de Triana, 89',
            cargasAnteriores: [
              { type: 'Hipoteca', amount: 180000 }
            ],
            cargasPreferentes: [
              { type: 'IBI pendiente', amount: 2400 }
            ],
            occupancyStatus: 'Ocupado - Inquilino'
          },
          {
            id: 'teju-3',
            title: 'Piso con vistas al mar en Tafira',
            category: 'Viviendas',
            province: 'Las Palmas',
            appraisalValue: 285000,
            estimatedDate: '2026-03-10',
            status: 'announced',
            source: 'TEJU',
            daysUntilAuction: 49,
            courtName: 'Juzgado Primera Instancia nº 7',
            procedureNumber: 'PJ-2024-00389',
            address: 'Avenida Tafira Alta, 156, 5ºB',
            cargasAnteriores: [],
            cargasPreferentes: [
              { type: 'Comunidad', amount: 1500 }
            ],
            occupancyStatus: 'Desocupado'
          }
        ];

        const mockRemovedAuctions = [
          {
            id: 'removed-1',
            title: 'Apartamento en Santa Catalina',
            province: 'Las Palmas',
            appraisalValue: 195000,
            removedDate: '2026-01-15',
            reason: 'Acuerdo entre partes',
            savedDate: '2025-12-10'
          },
          {
            id: 'removed-2',
            title: 'Garaje en zona comercial',
            province: 'Las Palmas',
            appraisalValue: 28000,
            removedDate: '2026-01-10',
            reason: 'Pago de deuda',
            savedDate: '2025-12-05'
          }
        ];

        setPreAuctions(mockPreAuctions);
        setRemovedAuctions(mockRemovedAuctions);
      } catch (err) {
        console.error('Error fetching Diamond data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiamondData();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'judicial_process':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
          <Clock className="w-3 h-3 mr-1" />
          En Tramitación
        </Badge>;
      case 'pending_publish':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
          <AlertCircle className="w-3 h-3 mr-1" />
          Pendiente BOE
        </Badge>;
      case 'announced':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Anunciada
        </Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <Crown className="w-8 h-8 text-yellow-400" />
                <div>
                  <h1 className="text-2xl font-bold text-white">Diamond Dashboard</h1>
                  <p className="text-sm text-gray-400">Acceso exclusivo a subastas pre-BOE</p>
                </div>
              </div>
              <Badge className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold">
                DIAMOND
              </Badge>
            </div>
            <div className="flex gap-3">
              <Link href="/">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                  Ver Subastas Activas
                </Button>
              </Link>
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                <Phone className="w-4 h-4 mr-2" />
                Contactar Concierge
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300">
                Pre-Subastas Activas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{preAuctions.length}</div>
              <p className="text-xs text-gray-400 mt-1">Oportunidades exclusivas</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300">
                Próxima en 30 días
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {preAuctions.filter(a => a.daysUntilAuction <= 30).length}
              </div>
              <p className="text-xs text-gray-400 mt-1">Requieren atención</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300">
                Retiradas del Mercado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{removedAuctions.length}</div>
              <p className="text-xs text-gray-400 mt-1">Últimos 30 días</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300">
                Valor Total Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                €{(preAuctions.reduce((sum, a) => sum + a.appraisalValue, 0) / 1000000).toFixed(1)}M
              </div>
              <p className="text-xs text-gray-400 mt-1">En valoración</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white/10 backdrop-blur-sm border-white/20">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-white/20">
              <TrendingUp className="w-4 h-4 mr-2" />
              Pipeline Exclusivo
            </TabsTrigger>
            <TabsTrigger value="removed" className="data-[state=active]:bg-white/20">
              <AlertCircle className="w-4 h-4 mr-2" />
              Retiradas
            </TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-white/20">
              <Calendar className="w-4 h-4 mr-2" />
              Línea Temporal
            </TabsTrigger>
          </TabsList>

          {/* Pipeline Tab */}
          <TabsContent value="pipeline" className="space-y-4 mt-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-white border-r-transparent"></div>
                <p className="mt-4 text-gray-400">Cargando datos exclusivos...</p>
              </div>
            ) : (
              preAuctions.map((item) => (
                <Card key={item.id} className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CardTitle className="text-xl text-white">{item.title}</CardTitle>
                          {getStatusBadge(item.status)}
                          {item.daysUntilAuction <= 30 && (
                            <Badge variant="destructive">
                              <Clock className="w-3 h-3 mr-1" />
                              {item.daysUntilAuction} días
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-gray-300">
                          {item.category} • {item.province}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-white">€{item.appraisalValue.toLocaleString()}</p>
                        <p className="text-sm text-gray-400">Tasación</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-black/20 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-400">Juzgado</p>
                          <p className="text-sm text-white font-medium">{item.courtName}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-400">Procedimiento</p>
                          <p className="text-sm text-white font-medium">{item.procedureNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-400">Dirección</p>
                          <p className="text-sm text-white font-medium">{item.address}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-400">Fecha Estimada BOE</p>
                          <p className="text-sm text-white font-medium">
                            {new Date(item.estimatedDate).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Cargas y Occupación */}
                    <div className="space-y-3">
                      {item.cargasAnteriores && item.cargasAnteriores.length > 0 && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <p className="text-xs font-semibold text-amber-400 mb-2">⚠️ Cargas Anteriores</p>
                          {item.cargasAnteriores.map((carga, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-300">{carga.type}</span>
                              <span className="text-white font-medium">€{carga.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.cargasPreferentes && item.cargasPreferentes.length > 0 && (
                        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                          <p className="text-xs font-semibold text-blue-400 mb-2">💡 Cargas Preferentes</p>
                          {item.cargasPreferentes.map((carga, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-300">{carga.type}</span>
                              <span className="text-white font-medium">€{carga.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.occupancyStatus && (
                        <div className={`p-3 rounded-lg ${
                          item.occupancyStatus === 'Desocupado' 
                            ? 'bg-green-500/10 border border-green-500/30' 
                            : 'bg-red-500/10 border border-red-500/30'
                        }`}>
                          <p className="text-xs font-semibold mb-1" style={{
                            color: item.occupancyStatus === 'Desocupado' ? '#4ade80' : '#f87171'
                          }}>
                            🏠 Estado de Ocupación
                          </p>
                          <p className="text-sm text-white">{item.occupancyStatus}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <Button className="flex-1 bg-purple-600 hover:bg-purple-700">
                        Ver Detalles Completos
                      </Button>
                      <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                        <Phone className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Removed Tab */}
          <TabsContent value="removed" className="space-y-4 mt-6">
            {removedAuctions.map((item) => (
              <Card key={item.id} className="bg-white/10 backdrop-blur-sm border-white/20">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg text-white">{item.title}</CardTitle>
                      <CardDescription className="text-gray-300">{item.province}</CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                      Retirada
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Tasación</p>
                      <p className="text-white font-medium">€{item.appraisalValue.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Retirada</p>
                      <p className="text-white font-medium">
                        {new Date(item.removedDate).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Motivo</p>
                      <p className="text-white font-medium">{item.reason}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-6">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardHeader>
                <CardTitle className="text-white">Proceso Judicial Típico</CardTitle>
                <CardDescription className="text-gray-300">
                  Línea temporal desde embargo hasta subasta
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {[
                    { phase: 'Embargo', duration: '1-2 meses', icon: AlertCircle, color: 'red' },
                    { phase: 'Tasación Pericial', duration: '2-3 meses', icon: FileText, color: 'yellow' },
                    { phase: 'Publicación TEJU', duration: '1 mes', icon: Building2, color: 'blue' },
                    { phase: 'Anuncio BOE', duration: '20 días', icon: Calendar, color: 'purple' },
                    { phase: 'Subasta', duration: 'Día fijado', icon: TrendingUp, color: 'green' }
                  ].map((step, idx) => {
                    const Icon = step.icon;
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full bg-${step.color}-500/20 flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-6 h-6 text-${step.color}-400`} />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-white">{step.phase}</p>
                          <p className="text-sm text-gray-400">{step.duration}</p>
                        </div>
                        {idx < 4 && (
                          <div className="w-px h-8 bg-white/20 absolute ml-6 mt-12" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
