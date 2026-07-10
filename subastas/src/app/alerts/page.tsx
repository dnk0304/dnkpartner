"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Plus, 
  Trash2, 
  Edit,
  Check,
  AlertCircle,
  TrendingUp,
  MapPin,
  Euro
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { apiFetch } from "@/lib/api-path";

interface Alert {
  id: string;
  name: string;
  province?: string;
  municipality?: string;
  category?: string;
  source?: string;  // Origen: BOE Judiciales, Agencia Tributaria, etc.
  propertyType?: string;  // Tipo de bien
  minPrice?: number;
  maxPrice?: number;
  emailEnabled: boolean;
  smsEnabled: boolean;
  notificationType: 'individual' | 'grouped';
  createdAt: Date;
  matchCount?: number;
}

/**
 * Sentinel value for the "no filter" (Todos / Todas) option in the Radix
 * Selects below. Radix forbids `<SelectItem value="">` (empty string is
 * reserved for clearing the field), so we use this non-empty token in the UI
 * and map it back to "" at the state boundary — `formData` keeps storing ""
 * for "no filter", which means the POST body (`formData.x || undefined`) is
 * byte-for-byte unchanged from before this fix.
 */
const ALL = "__all__";

const PROVINCES = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias',
  'Ávila', 'Badajoz', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz',
  'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca',
  'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca',
  'Illes Balear', 'Jaén', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga',
  'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Las Palmas',
  'Pontevedra', 'La Rioja', 'Salamanca', 'Segovia', 'Sevilla', 'Soria',
  'Tarragona', 'Santa Cruz de Tenerife', 'Teruel', 'Toledo', 'Valencia',
  'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza'
];

const SOURCES = [
  'BOE Judiciales',
  'Agencia Tributaria',
  'Seguridad Social',
  'Notariales',
  'Ayuntamientos',
  'Diputaciones',
  'Consejos Comarcales',
  'Agencias Tributarias',
  'Ad. Generales'
];

const PROPERTY_TYPES = [
  'Viviendas',
  'Garajes',
  'Trasteros',
  'Solares (Terrenos)',
  'Fincas rústicas',
  'Locales comerciales',
  'Naves industriales',
  'Otros inmuebles',
  'Vehículos (Coches, Motos)',
  'Buques (Barcos, Veleros)',
  'Aviones y helicópteros',
  'Joyas, Arte y Antigüedades',
  'Maquinaria Industrial',
  'Mercaderias y materias primas',
  'Mobiliarios',
  'Instalaciones',
  'Utensilios y herramientas',
  'Derechos de propiedad industrial',
  'Derechos de propiedad intelectual',
  'Derechos de traspaso',
  'Otros bienes y derechos',
  'Otros'
];

const CATEGORIES = PROPERTY_TYPES;  // For compatibility

export default function AlertsPage() {
  const t = useTranslations('alertsPage');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    province: '',
    municipality: '',
    source: '',  // Origen
    propertyType: '',  // Tipo de bien
    category: '',
    minPrice: '',
    maxPrice: '',
    emailEnabled: true,
    smsEnabled: false,
    notificationType: 'grouped' as 'individual' | 'grouped'
  });

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/user/alerts');
      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }
      const data = await response.json();
      const alertsData = (data.alerts || data.data || []).map((alert: any) => ({
        ...alert,
        createdAt: alert.createdAt ? new Date(alert.createdAt) : new Date(),
      }));
      setAlerts(alertsData);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlert = async () => {
    try {
      const response = await apiFetch('/api/user/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          province: formData.province || undefined,
          municipality: formData.municipality || undefined,
          source: formData.source || undefined,
          propertyType: formData.propertyType || undefined,
          category: formData.category || undefined,
          minPrice: formData.minPrice || undefined,
          maxPrice: formData.maxPrice || undefined,
          emailEnabled: formData.emailEnabled,
          smsEnabled: formData.smsEnabled,
          notificationType: formData.notificationType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create alert');
      }

      await fetchAlerts();
      resetForm();
      setIsCreating(false);
    } catch (err) {
      console.error('Error creating alert:', err);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      const response = await apiFetch(`/api/user/alerts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete alert');
      }
      await fetchAlerts();
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      province: '',
      municipality: '',
      source: '',
      propertyType: '',
      category: '',
      minPrice: '',
      maxPrice: '',
      emailEnabled: true,
      smsEnabled: false,
      notificationType: 'grouped'
    });
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Bell className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
                <p className="text-sm text-gray-600">{t('subtitle')}</p>
              </div>
            </div>
            <Link href="/">
              <Button variant="outline">{t('backToDashboard')}</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('statActiveAlerts')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{alerts.length}</div>
              <p className="text-xs text-gray-500 mt-1">{t('statConfigured')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('statMatchesToday')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {alerts.reduce((sum, a) => sum + (a.matchCount || 0), 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('statNewAuctions')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('statNotificationsSent')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">24</div>
              <p className="text-xs text-gray-500 mt-1">{t('statLast7Days')}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create/Edit Form */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>
                  {isCreating || editingId ? t('formTitleNew') : t('formTitleCreate')}
                </CardTitle>
                <CardDescription>
                  {t('formDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">{t('nameLabel')}</Label>
                  <Input
                    id="name"
                    placeholder={t('namePlaceholder')}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="source">{t('sourceLabel')}</Label>
                  <Select
                    value={formData.source || ALL}
                    onValueChange={(value) => setFormData({ ...formData, source: value === ALL ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('sourcePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t('allMasculine')}</SelectItem>
                      {SOURCES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="propertyType">{t('propertyTypeLabel')}</Label>
                  <Select
                    value={formData.propertyType || ALL}
                    onValueChange={(value) => setFormData({ ...formData, propertyType: value === ALL ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('propertyTypePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t('allMasculine')}</SelectItem>
                      {PROPERTY_TYPES.map(pt => (
                        <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="province">{t('provinceLabel')}</Label>
                  <Select
                    value={formData.province || ALL}
                    onValueChange={(value) => setFormData({ ...formData, province: value === ALL ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('provincePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t('allFeminine')}</SelectItem>
                      {PROVINCES.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="municipality">{t('municipalityLabel')}</Label>
                  <Input
                    id="municipality"
                    placeholder={t('municipalityPlaceholder')}
                    value={formData.municipality}
                    onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="category">{t('categoryLabel')}</Label>
                  <Select
                    value={formData.category || ALL}
                    onValueChange={(value) => setFormData({ ...formData, category: value === ALL ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('categoryPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t('allFeminine')}</SelectItem>
                      {CATEGORIES.slice(0, 11).map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minPrice">{t('minPriceLabel')}</Label>
                    <Input
                      id="minPrice"
                      type="number"
                      placeholder="0"
                      value={formData.minPrice}
                      onChange={(e) => setFormData({ ...formData, minPrice: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxPrice">{t('maxPriceLabel')}</Label>
                    <Input
                      id="maxPrice"
                      type="number"
                      placeholder={t('maxPricePlaceholder')}
                      value={formData.maxPrice}
                      onChange={(e) => setFormData({ ...formData, maxPrice: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <Label htmlFor="notificationType">{t('notificationTypeLabel')}</Label>
                  <Select
                    value={formData.notificationType}
                    onValueChange={(value) => setFormData({ ...formData, notificationType: value as 'individual' | 'grouped' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">{t('notificationIndividual')}</SelectItem>
                      <SelectItem value="grouped">{t('notificationGrouped')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>{t('channelsLabel')}</Label>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">Email</span>
                    </div>
                    <Switch
                      checked={formData.emailEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, emailEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">SMS</span>
                      <Badge variant="secondary" className="ml-2">Gold+</Badge>
                    </div>
                    <Switch
                      checked={formData.smsEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, smsEnabled: checked })}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  {(isCreating || editingId) ? (
                    <>
                      <Button 
                        className="flex-1" 
                        onClick={handleCreateAlert}
                        disabled={!formData.name}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {t('save')}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setIsCreating(false);
                          resetForm();
                        }}
                      >
                        {t('cancel')}
                      </Button>
                    </>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => setIsCreating(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t('formTitleCreate')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerts List */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('myAlerts', { count: alerts.length })}</CardTitle>
                <CardDescription>
                  {t('myAlertsDescription')}
                </CardDescription>
              </CardHeader>
            </Card>

            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
                <p className="mt-4 text-gray-500">{t('loadingAlerts')}</p>
              </div>
            ) : alerts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">{t('emptyTitle')}</p>
                  <p className="text-sm text-gray-500 mt-2">{t('emptySubtitle')}</p>
                </CardContent>
              </Card>
            ) : (
              alerts.map((alert) => (
                <Card key={alert.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-semibold text-lg">{alert.name}</h3>
                          {alert.matchCount && alert.matchCount > 0 && (
                            <Badge className="bg-blue-100 text-blue-700">
                              {t('matchesBadge', { count: alert.matchCount })}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 mb-3">
                          {alert.province && (
                            <Badge variant="outline">
                              <MapPin className="w-3 h-3 mr-1" />
                              {alert.province}
                            </Badge>
                          )}
                          {alert.category && (
                            <Badge variant="outline">
                              {alert.category}
                            </Badge>
                          )}
                          {(alert.minPrice || alert.maxPrice) && (
                            <Badge variant="outline">
                              <Euro className="w-3 h-3 mr-1" />
                              {alert.minPrice ? `${alert.minPrice.toLocaleString()}` : '0'}
                              {' - '}
                              {alert.maxPrice ? `${alert.maxPrice.toLocaleString()}` : '∞'}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Mail className={`w-4 h-4 ${alert.emailEnabled ? 'text-green-600' : 'text-gray-300'}`} />
                            <span>Email</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageSquare className={`w-4 h-4 ${alert.smsEnabled ? 'text-green-600' : 'text-gray-300'}`} />
                            <span>SMS</span>
                          </div>
                          <span>•</span>
                          <span>{t('createdOn', { date: alert.createdAt.toLocaleDateString('es-ES') })}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingId(alert.id);
                            setFormData({
                              name: alert.name,
                              province: alert.province || '',
                              municipality: alert.municipality || '',
                              source: alert.source || '',
                              propertyType: alert.propertyType || '',
                              category: alert.category || '',
                              minPrice: alert.minPrice?.toString() || '',
                              maxPrice: alert.maxPrice?.toString() || '',
                              emailEnabled: alert.emailEnabled,
                              smsEnabled: alert.smsEnabled,
                              notificationType: alert.notificationType
                            });
                            setIsCreating(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteAlert(alert.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* How it Works Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>{t('howItWorksTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t('feature1Title')}</h4>
                  <p className="text-sm text-gray-600">
                    {t('feature1Text')}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t('feature2Title')}</h4>
                  <p className="text-sm text-gray-600">
                    {t('feature2Text')}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Check className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t('feature3Title')}</h4>
                  <p className="text-sm text-gray-600">
                    {t('feature3Text')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
