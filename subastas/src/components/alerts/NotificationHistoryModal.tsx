"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Bell, ImageOff, Mail, MapPin } from 'lucide-react';
import { APP_TIME_ZONE } from '@/components/observatory/format';

/**
 * One notified-auction row, as returned by GET /api/user/notifications.
 * Mirrors NotificationHistoryItem from `@/lib/notifications/history` — kept as a
 * local shape so the client bundle never pulls the server mapper.
 */
export interface NotificationHistoryItem {
  id: string;
  auctionId: string;
  title: string | null;
  slug: string;
  url: string;
  province: string | null;
  municipality: string | null;
  imageUrl: string | null;
  channel: string | null;
  sentAt: string | null;
  read: boolean;
}

interface NotificationHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationHistoryItem[];
  count7d: number | null;
  countTotal: number | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

/**
 * Thumbnail with a graceful fallback: auction images are external and may 404
 * or be null, so we swap to a neutral placeholder tile on error / when unset
 * instead of showing a broken-image glyph.
 */
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- external auction host, not in next.config images.domains
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-gray-400">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/**
 * Format an ISO timestamp as a locale-aware relative string ("hace 3 horas")
 * for recent sends, falling back to an absolute date beyond a week.
 */
function useSentAtFormatter() {
  const locale = useLocale();
  return (iso: string | null): string => {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffMs = then - Date.now();
    const absSec = Math.abs(diffMs) / 1000;
    // Never server-rendered: this runs only inside <DialogContent>, which Radix mounts on open,
    // and the rows come from a client fetch (items are empty during SSR).
    // intl-gate-ok: client-only modal body, never present in SSR HTML
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (absSec < 60) return rtf.format(Math.round(diffMs / 1000), 'second');
    if (absSec < 3600) return rtf.format(Math.round(diffMs / 60000), 'minute');
    if (absSec < 86400) return rtf.format(Math.round(diffMs / 3600000), 'hour');
    if (absSec < 86400 * 7) return rtf.format(Math.round(diffMs / 86400000), 'day');
    // Hydration (#418), not style: pinned zone so the fallback absolute date is host-independent.
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: APP_TIME_ZONE }).format(new Date(iso));
  };
}

export function NotificationHistoryModal({
  open,
  onOpenChange,
  items,
  count7d,
  countTotal,
  hasMore,
  loading,
  loadingMore,
  error,
  onLoadMore,
  onRetry,
}: NotificationHistoryModalProps) {
  const t = useTranslations('alertsPage');
  const formatSentAt = useSentAtFormatter();

  const isInitialLoad = loading && items.length === 0;
  const isEmpty = !loading && !error && items.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-xl motion-reduce:!animate-none motion-reduce:!zoom-in-100 motion-reduce:!fade-in-100"
      >
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-green-600" aria-hidden="true" />
            {t('historyTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('historyDescription', { count: count7d ?? 0 })}
            {typeof countTotal === 'number' && countTotal > (count7d ?? 0) ? (
              <> · {t('historyTotal', { count: countTotal })}</>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto px-3 py-3">
          {isInitialLoad ? (
            <div className="py-12 text-center" role="status" aria-live="polite">
              <div className="inline-block h-7 w-7 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-green-600" />
              <p className="mt-3 text-sm text-gray-500">{t('historyLoading')}</p>
            </div>
          ) : error && items.length === 0 ? (
            <div className="py-12 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700">{t('historyError')}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                {t('historyRetry')}
              </Button>
            </div>
          ) : isEmpty ? (
            <div className="py-12 text-center">
              <Bell className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700">{t('historyEmptyTitle')}</p>
              <p className="mt-1 text-sm text-gray-500">{t('historyEmptySubtitle')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((item) => {
                const title = item.title || t('historyUntitled');
                const place = [item.municipality, item.province].filter(Boolean).join(', ');
                const when = formatSentAt(item.sentAt);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.url}
                      className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={t('historyViewAuction', { title })}
                    >
                      <Thumb src={item.imageUrl} alt="" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">{title}</p>
                        {place ? (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-gray-500">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                            {place}
                          </p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="gap-1 font-normal">
                            <Mail className="h-3 w-3" aria-hidden="true" />
                            {t('historyChannelEmail')}
                          </Badge>
                          {when ? (
                            <span className="text-xs text-gray-500">{when}</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {hasMore && items.length > 0 ? (
            <div className="px-3 pb-1 pt-3 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? t('historyLoadingMore') : t('historyLoadMore')}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
