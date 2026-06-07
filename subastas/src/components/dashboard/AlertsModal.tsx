'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, Check, Plus, Trash2, Loader2 } from 'lucide-react';
import { ALL_PROVINCES, OFFICIAL_CATEGORIES, AUCTION_SOURCES } from '@/lib/constants';
import { AuctionType, AuctionStatus } from '@/types';
import { capitalizeLocation } from '@/lib/utils';
import { apiFetch } from "@/lib/api-path";

interface AlertsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProvince?: string;
  initialMunicipality?: string;
  initialCategory?: string;
  // Wave-B (2026-06-07): when the modal is opened from an auction detail
  // page we pre-fill source / type / price band as well so the user lands on
  // a form that already matches the auction's shape. All optional + null-safe.
  initialSource?: string;
  initialAuctionType?: string;
  initialMinPrice?: number;
  initialMaxPrice?: number;
}

interface AlertRule {
  id: string;
  name?: string;
  province?: string;
  municipality?: string;
  category?: string;
  source?: string;
  auctionType?: AuctionType;
  statuses?: AuctionStatus[];
  minPrice?: number;
  maxPrice?: number;
  keywords?: string;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  notificationType?: 'individual' | 'grouped';
}

export const AlertsModal: React.FC<AlertsModalProps> = ({
  open,
  onOpenChange,
  initialProvince,
  initialMunicipality,
  initialCategory,
  initialSource,
  initialAuctionType,
  initialMinPrice,
  initialMaxPrice,
}) => {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);

  // Form state
  const [alertName, setAlertName] = useState<string>('');
  const [selectedProvince, setSelectedProvince] = useState<string>(initialProvince || '');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>(initialMunicipality || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'all');
  const [selectedSource, setSelectedSource] = useState<string>(initialSource || 'all');
  const [selectedAuctionType, setSelectedAuctionType] = useState<string>(initialAuctionType || 'all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [minPrice, setMinPrice] = useState<string>(
    initialMinPrice != null ? String(initialMinPrice) : '',
  );
  const [maxPrice, setMaxPrice] = useState<string>(
    initialMaxPrice != null ? String(initialMaxPrice) : '',
  );
  const [keywords, setKeywords] = useState<string>('');
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [notificationType, setNotificationType] = useState<'individual' | 'grouped'>('grouped');

  // Reset form when opening with new initial values
  useEffect(() => {
    if (open) {
      if (initialProvince) setSelectedProvince(initialProvince);
      if (initialMunicipality) setSelectedMunicipality(initialMunicipality);
      if (initialCategory) setSelectedCategory(initialCategory);
      if (initialSource) setSelectedSource(initialSource);
      if (initialAuctionType) setSelectedAuctionType(initialAuctionType);
      if (initialMinPrice != null) setMinPrice(String(initialMinPrice));
      if (initialMaxPrice != null) setMaxPrice(String(initialMaxPrice));
      fetchAlerts();
    }
  }, [
    open,
    initialProvince,
    initialMunicipality,
    initialCategory,
    initialSource,
    initialAuctionType,
    initialMinPrice,
    initialMaxPrice,
  ]);

  const fetchAlerts = async () => {
    setFetching(true);
    try {
      const response = await apiFetch('/api/user/alerts');
      if (response.ok) {
        const data = await response.json();
        const normalizedAlerts = (data.alerts || []).map((alert: any) => ({
          ...alert,
          statuses: typeof alert.statuses === 'string'
            ? alert.statuses.split(',').map((status: string) => status.trim()).filter(Boolean)
            : alert.statuses,
          emailEnabled: alert.emailEnabled === undefined ? true : Boolean(alert.emailEnabled),
        }));
        setAlerts(normalizedAlerts);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setFetching(false);
    }
  };

  // Fetch municipalities when province changes
  useEffect(() => {
    if (!selectedProvince || selectedProvince === 'all') {
      setMunicipalities([]);
      return;
    }

    const fetchMunicipalities = async () => {
      setLoadingMunicipalities(true);
      try {
        const response = await fetch(
          `/api/auctions/counts?groupBy=municipality&province=${encodeURIComponent(selectedProvince)}`
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.counts) {
            const allMunicipalities = new Set<string>();
            if (data.counts.total) Object.keys(data.counts.total).forEach(m => allMunicipalities.add(m));
            
            setMunicipalities(
              Array.from(allMunicipalities)
                .filter(m => m && m.toLowerCase() !== 'null' && m.toLowerCase() !== 'desconocida')
                .sort((a, b) => a.localeCompare(b, 'es'))
            );
          }
        }
      } catch (error) {
        console.error('Error fetching municipalities:', error);
      } finally {
        setLoadingMunicipalities(false);
      }
    };

    fetchMunicipalities();
  }, [selectedProvince]);

  const handleAddAlert = () => {
    const newAlert: AlertRule = {
      id: `temp_${Date.now()}`,
      name: alertName || undefined,
      province: selectedProvince && selectedProvince !== 'all' ? selectedProvince : undefined,
      municipality: selectedMunicipality && selectedMunicipality !== 'all' ? selectedMunicipality : undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      source: selectedSource !== 'all' ? selectedSource : undefined,
      auctionType: selectedAuctionType !== 'all' ? (selectedAuctionType as AuctionType) : undefined,
      statuses: selectedStatus !== 'all' ? [selectedStatus as AuctionStatus] : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      keywords: keywords || undefined,
      emailEnabled,
      notificationType,
    };

    setAlerts([...alerts, newAlert]);
    
    // Reset form but keep province for convenience
    setAlertName('');
    setSelectedMunicipality('');
    setSelectedSource('all');
    setSelectedAuctionType('all');
    setSelectedStatus('all');
    setMinPrice('');
    setMaxPrice('');
    setKeywords('');
    setNotificationType('grouped');
  };

  const handleRemoveAlert = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const payloadAlerts = alerts.map((alert) => ({
        ...alert,
        statuses: alert.statuses?.join(','),
      }));

      const response = await apiFetch('/api/user/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts: payloadAlerts }),
      });

      if (response.ok) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error saving alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" />
            Configurar Alertas
          </DialogTitle>
          <DialogDescription>
            Recibe notificaciones cuando aparezcan nuevas subastas que coincidan con tus criterios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* New Alert Form */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nueva Alerta
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Nombre de la alerta</Label>
                <Input
                  placeholder="Ej: Viviendas en Valencia"
                  value={alertName}
                  onChange={(e) => setAlertName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Provincia</Label>
                <Select value={selectedProvince} onValueChange={setSelectedProvince}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las provincias</SelectItem>
                    {ALL_PROVINCES.map(prov => (
                      <SelectItem key={prov} value={prov}>{prov}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Municipio</Label>
                <Select 
                  value={selectedMunicipality} 
                  onValueChange={setSelectedMunicipality}
                  disabled={!selectedProvince || selectedProvince === 'all' || loadingMunicipalities}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingMunicipalities ? "Cargando..." : "Cualquier municipio"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cualquier municipio</SelectItem>
                    {municipalities.map(muni => (
                      <SelectItem key={muni} value={muni}>{capitalizeLocation(muni)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {OFFICIAL_CATEGORIES.REAL_ESTATE.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    {OFFICIAL_CATEGORIES.MOVABLE.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Origen</Label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los orígenes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los orígenes</SelectItem>
                    {AUCTION_SOURCES.filter(source => source !== 'Todos').map(source => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo de subasta</Label>
                <Select value={selectedAuctionType} onValueChange={setSelectedAuctionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="judicial">Judicial</SelectItem>
                    <SelectItem value="notarial">Notarial</SelectItem>
                    <SelectItem value="aeat">AEAT</SelectItem>
                    <SelectItem value="tributaria">Tributaria</SelectItem>
                    <SelectItem value="administrativa">Administrativa</SelectItem>
                    <SelectItem value="bancaria">Bancaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="pre-auction">Pre-Subasta</SelectItem>
                    <SelectItem value="finished">Finalizada</SelectItem>
                    <SelectItem value="celebrandose">Celebrándose</SelectItem>
                    <SelectItem value="proxima-apertura">Próx. apertura</SelectItem>
                    <SelectItem value="suspendida">Suspendida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Precio Mínimo (€)</Label>
                <Input 
                  type="number" 
                  placeholder="Sin mínimo" 
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Precio Máximo (€)</Label>
                <Input 
                  type="number" 
                  placeholder="Sin límite" 
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Palabras clave (opcional)</Label>
              <Input 
                placeholder="Ej: playa, centro, ático..." 
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Notificación por email</Label>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <span className="text-sm text-gray-600">Enviar a mi email registrado</span>
                  <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipo de notificación</Label>
                <Select value={notificationType} onValueChange={(value) => setNotificationType(value as 'individual' | 'grouped')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grouped">Resumen agrupado</SelectItem>
                    <SelectItem value="individual">Una por subasta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={handleAddAlert}
              className="w-full bg-[--color-action-soft] border border-[--color-action] text-[--color-ink-primary] hover:bg-[--color-action-soft]/80"
              disabled={!selectedProvince && selectedCategory === 'all' && !keywords && !alertName}
            >
              Añadir Alerta
            </Button>
          </div>

          {/* Active Alerts List */}
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-900">Mis Alertas Activas ({alerts.length})</h4>
            
            {fetching ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p>Cargando alertas...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No tienes alertas configuradas</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-300 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {alert.name || (alert.province ? alert.province : 'Toda España')}
                        </span>
                        {alert.municipality && alert.municipality !== 'all' && (
                          <span className="text-sm text-gray-600 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            {capitalizeLocation(alert.municipality)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                        {alert.source && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {alert.source}
                          </span>
                        )}
                        {alert.auctionType && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {alert.auctionType}
                          </span>
                        )}
                        {alert.statuses && alert.statuses.length > 0 && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {alert.statuses.join(', ')}
                          </span>
                        )}
                        {alert.category && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {alert.category}
                          </span>
                        )}
                        {(alert.minPrice || alert.maxPrice) && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {alert.minPrice ? `Min: ${alert.minPrice.toLocaleString()}€` : 'Min: 0€'} • {alert.maxPrice ? `Max: ${alert.maxPrice.toLocaleString()}€` : 'Max: ∞'}
                          </span>
                        )}
                        {alert.keywords && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            "{alert.keywords}"
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAlert(alert.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-[--color-status-live-soft] border border-[--color-status-live] text-[--color-ink-primary] hover:bg-[--color-status-live-soft]/80 gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
