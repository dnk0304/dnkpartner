"use client";

/**
 * Diamond Dashboard — Diamond-tier pre-BOE pipeline view.
 *
 * Redesign #3: rebuilt LIGHT — pure white surfaces, slate frame, all-black
 * ink, soft-tint warning chips per the palette tokens. No dark mode, no
 * purple/pink gradients, no white text. Same data, register feel.
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
} from 'lucide-react';
import Link from 'next/link';
import { APP_TIME_ZONE } from '@/components/observatory/format';

// Hydration (#418), not style: same numeric d/m/yyyy shape as toLocaleDateString('es-ES'),
// with the time zone pinned so SSR and the client agree on the day.
const DIAMOND_DATE_FMT = new Intl.DateTimeFormat('es-ES', { timeZone: APP_TIME_ZONE });

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

interface RemovedAuction {
  id: string;
  title: string;
  province: string;
  appraisalValue: number;
  removedDate: string;
  reason: string;
}

export default function DiamondDashboard() {
  const [preAuctions, setPreAuctions] = useState<PreAuctionItem[]>([]);
  const [removedAuctions, setRemovedAuctions] = useState<RemovedAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pipeline');

  useEffect(() => {
    const fetchDiamondData = async () => {
      try {
        setLoading(true);
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
            cargasAnteriores: [{ type: 'Hipoteca', amount: 280000 }],
            cargasPreferentes: [
              { type: 'IBI pendiente', amount: 1200 },
              { type: 'Comunidad', amount: 800 },
            ],
            occupancyStatus: 'Desocupado',
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
            cargasAnteriores: [{ type: 'Hipoteca', amount: 180000 }],
            cargasPreferentes: [{ type: 'IBI pendiente', amount: 2400 }],
            occupancyStatus: 'Ocupado - Inquilino',
          },
          {
            id: 'teju-3',
            title: 'Piso con vistas al mar en Tafira',
            category: 'Viviendas',
            province: 'Las Palmas',
            appraisalValue: 280000,
            estimatedDate: '2026-03-10',
            status: 'announced',
            source: 'TEJU',
            daysUntilAuction: 49,
            courtName: 'Juzgado Primera Instancia nº 1',
            procedureNumber: 'PJ-2024-00612',
            address: 'Carretera del Centro, 145',
            cargasAnteriores: [{ type: 'Hipoteca', amount: 150000 }],
            cargasPreferentes: [],
            occupancyStatus: 'Desocupado',
          },
        ];
        setPreAuctions(mockPreAuctions);

        const mockRemovedAuctions: RemovedAuction[] = [
          {
            id: 'rm-1',
            title: 'Vivienda en Vegueta',
            province: 'Las Palmas',
            appraisalValue: 220000,
            removedDate: '2026-01-10',
            reason: 'Acuerdo extrajudicial',
          },
        ];
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
        return (
          <Badge className="bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] border border-[var(--color-action)]/40">
            <Clock className="w-3 h-3 mr-1" />
            En tramitación
          </Badge>
        );
      case 'pending_publish':
        return (
          <Badge className="bg-[var(--color-warn-attention-soft)] text-[var(--color-ink-primary)] border border-[var(--color-warn-attention)]/40">
            <AlertCircle className="w-3 h-3 mr-1" />
            Pendiente BOE
          </Badge>
        );
      case 'announced':
        return (
          <Badge className="bg-[var(--color-status-live-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-live)]/40">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Anunciada
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      {/* Header — white surface, all-black ink */}
      <div className="hairline-b bg-[var(--color-surface)]">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <Crown className="w-8 h-8 text-[var(--color-gold)]" />
                <div>
                  <h1 className="font-display text-2xl font-bold text-[var(--color-ink-primary)]">
                    Panel Diamond
                  </h1>
                  <p className="text-sm text-[var(--color-ink-secondary)]">
                    Acceso exclusivo a subastas pre-BOE
                  </p>
                </div>
              </div>
              <Badge className="bg-[var(--color-warn-attention-soft)] text-[var(--color-ink-primary)] border border-[var(--color-warn-attention)] font-bold">
                DIAMOND
              </Badge>
            </div>
            <div className="flex gap-3">
              <Link href="/">
                <Button
                  variant="outline"
                  className="border-[var(--color-hairline)] text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-muted)]"
                >
                  Ver subastas activas
                </Button>
              </Link>
              <Button className="bg-[var(--color-action-soft)] border border-[var(--color-action)] text-[var(--color-ink-primary)] hover:bg-[var(--color-action-soft)]/80">
                <Phone className="w-4 h-4 mr-2" />
                Contactar concierge
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard
            label="Pre-Subastas activas"
            value={preAuctions.length.toString()}
            footnote="Oportunidades exclusivas"
          />
          <StatCard
            label="Próxima en 30 días"
            value={preAuctions
              .filter((a) => a.daysUntilAuction <= 30)
              .length.toString()}
            footnote="Requieren atención"
          />
          <StatCard
            label="Retiradas del mercado"
            value={removedAuctions.length.toString()}
            footnote="Últimos 30 días"
          />
          <StatCard
            label="Valor total pipeline"
            value={`€${(preAuctions.reduce((s, a) => s + a.appraisalValue, 0) / 1_000_000).toFixed(1)}M`}
            footnote="En valoración"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[var(--color-surface)] border border-[var(--color-hairline)]">
            <TabsTrigger
              value="pipeline"
              className="data-[state=active]:bg-[var(--color-surface-muted)] text-[var(--color-ink-primary)]"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Pipeline exclusivo
            </TabsTrigger>
            <TabsTrigger
              value="removed"
              className="data-[state=active]:bg-[var(--color-surface-muted)] text-[var(--color-ink-primary)]"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Retiradas
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="data-[state=active]:bg-[var(--color-surface-muted)] text-[var(--color-ink-primary)]"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Línea temporal
            </TabsTrigger>
          </TabsList>

          {/* Pipeline */}
          <TabsContent value="pipeline" className="space-y-4 mt-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--color-ink-primary)] border-r-transparent" />
                <p className="mt-4 text-[var(--color-ink-secondary)]">
                  Cargando datos exclusivos…
                </p>
              </div>
            ) : (
              preAuctions.map((item) => (
                <Card
                  key={item.id}
                  className="bg-[var(--color-surface)] border border-[var(--color-hairline)] hover:shadow-[var(--shadow-card)] transition-shadow"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <CardTitle className="text-xl text-[var(--color-ink-primary)]">
                            {item.title}
                          </CardTitle>
                          {getStatusBadge(item.status)}
                          {item.daysUntilAuction <= 30 && (
                            <Badge className="bg-[var(--color-warn-critical-soft)] text-[var(--color-ink-primary)] border border-[var(--color-warn-critical)]">
                              <Clock className="w-3 h-3 mr-1" />
                              {item.daysUntilAuction} días
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-[var(--color-ink-secondary)]">
                          {item.category} · {item.province}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-[var(--color-ink-primary)] tnum">
                          €{item.appraisalValue.toLocaleString('es-ES')}
                        </p>
                        <p className="text-sm text-[var(--color-ink-tertiary)]">
                          Tasación
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[var(--color-surface-muted)] rounded-lg">
                      <DetailRow
                        icon={<Building2 className="w-4 h-4 text-[var(--color-ink-tertiary)] mt-1" />}
                        label="Juzgado"
                        value={item.courtName}
                      />
                      <DetailRow
                        icon={<FileText className="w-4 h-4 text-[var(--color-ink-tertiary)] mt-1" />}
                        label="Procedimiento"
                        value={item.procedureNumber}
                      />
                      <DetailRow
                        icon={<MapPin className="w-4 h-4 text-[var(--color-ink-tertiary)] mt-1" />}
                        label="Dirección"
                        value={item.address}
                      />
                      <DetailRow
                        icon={<Calendar className="w-4 h-4 text-[var(--color-ink-tertiary)] mt-1" />}
                        label="Fecha estimada BOE"
                        value={DIAMOND_DATE_FMT.format(new Date(item.estimatedDate))}
                      />
                    </div>

                    {/* Cargas y ocupación */}
                    <div className="space-y-3">
                      {item.cargasAnteriores &&
                        item.cargasAnteriores.length > 0 && (
                          <div className="p-3 bg-[var(--color-warn-attention-soft)] border border-[var(--color-warn-attention)]/40 rounded-lg">
                            <p className="text-xs font-semibold text-[var(--color-ink-primary)] mb-2">
                              Cargas anteriores
                            </p>
                            {item.cargasAnteriores.map((carga, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between text-sm text-[var(--color-ink-primary)]"
                              >
                                <span>{carga.type}</span>
                                <span className="font-semibold tnum">
                                  €{carga.amount.toLocaleString('es-ES')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {item.cargasPreferentes &&
                        item.cargasPreferentes.length > 0 && (
                          <div className="p-3 bg-[var(--color-action-soft)] border border-[var(--color-action)]/40 rounded-lg">
                            <p className="text-xs font-semibold text-[var(--color-ink-primary)] mb-2">
                              Cargas preferentes
                            </p>
                            {item.cargasPreferentes.map((carga, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between text-sm text-[var(--color-ink-primary)]"
                              >
                                <span>{carga.type}</span>
                                <span className="font-semibold tnum">
                                  €{carga.amount.toLocaleString('es-ES')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {item.occupancyStatus && (
                        <div
                          className={`p-3 rounded-lg border ${
                            item.occupancyStatus === 'Desocupado'
                              ? 'bg-[var(--color-status-live-soft)] border-[var(--color-status-live)]/40'
                              : 'bg-[var(--color-status-cancelled-soft)] border-[var(--color-status-cancelled)]/40'
                          }`}
                        >
                          <p className="text-xs font-semibold mb-1 text-[var(--color-ink-primary)]">
                            Estado de ocupación
                          </p>
                          <p className="text-sm text-[var(--color-ink-primary)]">
                            {item.occupancyStatus}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <Button className="flex-1 bg-[var(--color-action-soft)] border border-[var(--color-action)] text-[var(--color-ink-primary)] hover:bg-[var(--color-action-soft)]/80">
                        Ver detalles completos
                      </Button>
                      <Button
                        variant="outline"
                        className="border-[var(--color-hairline)] text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-muted)]"
                      >
                        <Phone className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Removed */}
          <TabsContent value="removed" className="space-y-4 mt-6">
            {removedAuctions.map((item) => (
              <Card
                key={item.id}
                className="bg-[var(--color-surface)] border border-[var(--color-hairline)]"
              >
                <CardHeader>
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="text-lg text-[var(--color-ink-primary)]">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="text-[var(--color-ink-secondary)]">
                        {item.province}
                      </CardDescription>
                    </div>
                    <Badge className="bg-[var(--color-status-cancelled-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-cancelled)]/40">
                      Retirada
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[var(--color-ink-tertiary)]">Tasación</p>
                      <p className="text-[var(--color-ink-primary)] font-semibold tnum">
                        €{item.appraisalValue.toLocaleString('es-ES')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--color-ink-tertiary)]">Retirada</p>
                      <p className="text-[var(--color-ink-primary)] font-semibold tnum">
                        {DIAMOND_DATE_FMT.format(new Date(item.removedDate))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--color-ink-tertiary)]">Motivo</p>
                      <p className="text-[var(--color-ink-primary)] font-semibold">
                        {item.reason}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="mt-6">
            <Card className="bg-[var(--color-surface)] border border-[var(--color-hairline)]">
              <CardHeader>
                <CardTitle className="text-[var(--color-ink-primary)]">
                  Proceso judicial típico
                </CardTitle>
                <CardDescription className="text-[var(--color-ink-secondary)]">
                  Línea temporal desde embargo hasta subasta
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {[
                    {
                      phase: 'Embargo',
                      duration: '1-2 meses',
                      icon: AlertCircle,
                      tint: 'bg-[var(--color-warn-critical-soft)]',
                      ink: 'text-[var(--color-warn-critical)]',
                    },
                    {
                      phase: 'Tasación pericial',
                      duration: '2-3 meses',
                      icon: FileText,
                      tint: 'bg-[var(--color-warn-attention-soft)]',
                      ink: 'text-[var(--color-warn-attention)]',
                    },
                    {
                      phase: 'Publicación TEJU',
                      duration: '1 mes',
                      icon: Building2,
                      tint: 'bg-[var(--color-action-soft)]',
                      ink: 'text-[var(--color-action)]',
                    },
                    {
                      phase: 'Anuncio BOE',
                      duration: '20 días',
                      icon: Calendar,
                      tint: 'bg-[var(--color-surface-muted)]',
                      ink: 'text-[var(--color-ink-secondary)]',
                    },
                    {
                      phase: 'Subasta',
                      duration: 'Día fijado',
                      icon: TrendingUp,
                      tint: 'bg-[var(--color-status-live-soft)]',
                      ink: 'text-[var(--color-status-live)]',
                    },
                  ].map((step, idx) => {
                    const Icon = step.icon;
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-full ${step.tint} flex items-center justify-center flex-shrink-0`}
                        >
                          <Icon className={`w-6 h-6 ${step.ink}`} />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-[var(--color-ink-primary)]">
                            {step.phase}
                          </p>
                          <p className="text-sm text-[var(--color-ink-tertiary)]">
                            {step.duration}
                          </p>
                        </div>
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

function StatCard({
  label,
  value,
  footnote,
}: {
  label: string;
  value: string;
  footnote: string;
}) {
  return (
    <Card className="bg-[var(--color-surface)] border border-[var(--color-hairline)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-[var(--color-ink-secondary)]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-[var(--color-ink-primary)] tnum">
          {value}
        </div>
        <p className="text-xs text-[var(--color-ink-tertiary)] mt-1">{footnote}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-ink-tertiary)]">{label}</p>
        <p className="text-sm text-[var(--color-ink-primary)] font-medium truncate">
          {value ?? '—'}
        </p>
      </div>
    </div>
  );
}
