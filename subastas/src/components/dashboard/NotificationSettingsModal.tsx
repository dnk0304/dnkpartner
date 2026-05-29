'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Bell, Mail, MapPin, Tag, TrendingUp, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OFFICIAL_CATEGORIES, ALL_PROVINCES } from '@/lib/constants';

interface Alert {
  id: string;
  province?: string | null;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  open,
  onClose,
}) => {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Load existing alerts
  useEffect(() => {
    if (open && session?.user?.id) {
      loadAlerts();
    }
  }, [open, session]);

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/user/alerts');
      const data = await response.json();

      if (response.ok) {
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.error('Error loading alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/user/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailNotifications,
          alerts,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar las notificaciones');
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Error al guardar las notificaciones');
    } finally {
      setIsSaving(false);
    }
  };

  const addAlert = () => {
    setAlerts([
      ...alerts,
      {
        id: `temp-${Date.now()}`,
        province: null,
        category: null,
        minPrice: null,
        maxPrice: null,
      },
    ]);
  };

  const removeAlert = (id: string) => {
    setAlerts(alerts.filter((alert) => alert.id !== id));
  };

  const updateAlert = (id: string, field: keyof Alert, value: any) => {
    setAlerts(
      alerts.map((alert) =>
        alert.id === id ? { ...alert, [field]: value } : alert
      )
    );
  };

  const allCategories = [
    ...OFFICIAL_CATEGORIES.REAL_ESTATE,
    ...OFFICIAL_CATEGORIES.MOVABLE,
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bell className="h-5 w-5" />
            Notificaciones y Alertas
          </DialogTitle>
          <DialogDescription>
            Configura cómo y cuándo quieres recibir notificaciones
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Email Notifications Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-600" />
                <div>
                  <Label htmlFor="email-notifications" className="text-base font-semibold">
                    Notificaciones por Email
                  </Label>
                  <p className="text-sm text-gray-600">
                    Recibe alertas de nuevas subastas por correo
                  </p>
                </div>
              </div>
              <Switch
                id="email-notifications"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>

            {/* Custom Alerts Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Alertas Personalizadas
                  </h4>
                  <p className="text-sm text-gray-600">
                    Recibe notificaciones cuando aparezcan subastas que coincidan con tus criterios
                  </p>
                </div>
              </div>

              {/* Alert List */}
              {alerts.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <Bell className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-4">
                    No tienes alertas configuradas
                  </p>
                  <Button onClick={addAlert} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Crear Primera Alerta
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-4 bg-white border-2 border-gray-200 rounded-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                          Alerta #{alert.id.slice(0, 8)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAlert(alert.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Province */}
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-600 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Provincia
                          </Label>
                          <Select
                            value={alert.province || 'any'}
                            onValueChange={(value) =>
                              updateAlert(alert.id, 'province', value === 'any' ? null : value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Cualquiera" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Cualquiera</SelectItem>
                              {ALL_PROVINCES.map((province) => (
                                <SelectItem key={province} value={province}>
                                  {province}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Category */}
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-600 flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            Categoría
                          </Label>
                          <Select
                            value={alert.category || 'any'}
                            onValueChange={(value) =>
                              updateAlert(alert.id, 'category', value === 'any' ? null : value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Cualquiera" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Cualquiera</SelectItem>
                              {allCategories.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                        <strong>Criterios:</strong>{' '}
                        {alert.province || 'Todas las provincias'} •{' '}
                        {alert.category || 'Todas las categorías'}
                      </div>
                    </div>
                  ))}

                  {/* Add More Button */}
                  <Button
                    onClick={addAlert}
                    variant="outline"
                    className="w-full gap-2 border-dashed border-2"
                  >
                    <Plus className="h-4 w-4" />
                    Añadir Otra Alerta
                  </Button>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>💡 Consejo:</strong> Las alertas te notificarán cuando aparezcan nuevas
                subastas que coincidan con tus criterios. Puedes crear múltiples alertas para
                diferentes combinaciones.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                ¡Notificaciones guardadas con éxito!
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Guardar Cambios
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
