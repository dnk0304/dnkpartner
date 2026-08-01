/**
 * Notification rendering — turns an event_outbox row (eventType + payload) into
 * channel-specific content (email subject/html/text, push title/body, in-app
 * type+payload).
 *
 * Each template is pure: it does NOT read the database. Ghost packs everything
 * the renderer needs into the payload at outbox-write time (per Wave 2a brief).
 * This keeps the dispatcher hot path DB-free and allows us to re-render historic
 * notifications without a second auction lookup.
 */
import type { NotificationType } from '@prisma/client';

// Locked event taxonomy (matches Ghost Wave 2a brief).
export const EVENT_TYPES = {
  GO_LIVE: 'auction.go_live',
  STATUS_CHANGE: 'auction.status_change',
  NEW_BID: 'auction.new_bid',
  SUSPENDED: 'auction.suspended',
  RESCHEDULED: 'auction.rescheduled',
  ENDING_SOON: 'auction.ending_soon',
  FINISHED: 'auction.finished',
} as const;

export type DispatcherEventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export type DispatchPayload = Record<string, unknown>;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderedPush {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface RenderedInApp {
  type: NotificationType;
  payload: DispatchPayload;
}

/**
 * Map our locked external event taxonomy to the Notification.type enum stored
 * in the database (which is a separate, persistence-shape enum).
 */
export function notificationTypeForEvent(eventType: string): NotificationType {
  switch (eventType) {
    case EVENT_TYPES.GO_LIVE:
      return 'GO_LIVE';
    case EVENT_TYPES.STATUS_CHANGE:
      return 'STATUS_CHANGE';
    case EVENT_TYPES.NEW_BID:
      return 'NEW_BID';
    case EVENT_TYPES.SUSPENDED:
      return 'SUSPENDED';
    case EVENT_TYPES.RESCHEDULED:
      return 'RESUMED';
    case EVENT_TYPES.ENDING_SOON:
      return 'ENDING_SOON';
    case EVENT_TYPES.FINISHED:
      return 'FINISHED';
    default:
      return 'NEW_MATCH';
  }
}

/**
 * Map an event type back to the Favorite.notifyOn* boolean field that gates
 * delivery for that user. Returns null when the event type isn't gated by a
 * follower preference (e.g. CANCELLED hasn't been added to follower prefs yet —
 * fall through to "send by default" in that case).
 */
export function followerPrefField(
  eventType: string,
):
  | 'notifyOnGoLive'
  | 'notifyOnBid'
  | 'notifyOnStatus'
  | 'notifyOnSuspension'
  | 'notifyOnResume'
  | 'notifyOnFinish'
  | null {
  switch (eventType) {
    case EVENT_TYPES.GO_LIVE:
      return 'notifyOnGoLive';
    case EVENT_TYPES.NEW_BID:
      return 'notifyOnBid';
    case EVENT_TYPES.STATUS_CHANGE:
    case EVENT_TYPES.ENDING_SOON:
      return 'notifyOnStatus';
    case EVENT_TYPES.SUSPENDED:
      return 'notifyOnSuspension';
    case EVENT_TYPES.RESCHEDULED:
      return 'notifyOnResume';
    case EVENT_TYPES.FINISHED:
      return 'notifyOnFinish';
    default:
      return null;
  }
}

function buildAuctionUrl(payload: DispatchPayload, appUrl: string): string {
  const auctionId = (payload.auctionId as string) ?? '';
  return `${appUrl.replace(/\/$/, '')}/auction/${encodeURIComponent(auctionId)}`;
}

function fmtMoney(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

/**
 * FINISHED "Puja final" fragment — honest about hidden/absent amounts.
 * Ghost packs finalBidCents (highest captured live BOE bid, in CENTS) and
 * pujaStatus into the outbox payload. Order of truth:
 *   1. finalBidCents finite & > 0        -> the real euro amount ("€128.400")
 *   2. pujaStatus SIN_PUJA               -> "subasta desierta (sin pujas)"
 *   3. pujaStatus CON_PUJA / CON_PUJA-*  -> "con puja (importe no publicado)"
 *   4. anything else (legacy rows)       -> "—"  (no regression)
 * Returns only the fragment AFTER "Puja final: " — callers add the label.
 */
function fmtFinalBid(payload: DispatchPayload): string {
  const cents = payload.finalBidCents;
  if (typeof cents === 'number' && Number.isFinite(cents) && cents > 0) {
    return fmtMoney(cents / 100);
  }
  const puja = payload.pujaStatus;
  if (puja === 'SIN_PUJA') return 'subasta desierta (sin pujas)';
  if (typeof puja === 'string' && puja.startsWith('CON_PUJA')) {
    return 'con puja (importe no publicado)';
  }
  return '—';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c];
  });
}

/** Render a per-event-type email. */
export function renderEmail(
  eventType: string,
  payload: DispatchPayload,
  appUrl: string,
): RenderedEmail {
  const title = (payload.title as string) ?? 'Subasta';
  const province = (payload.province as string) ?? '';
  const municipality = (payload.municipality as string) ?? '';
  const url = buildAuctionUrl(payload, appUrl);
  const loc = [municipality, province].filter(Boolean).join(', ');
  // Prefer the property street address (public on the detail cards); fall back
  // to municipality/province when there is no street (vehicles/plots).
  const addr = (payload.address as string | undefined)?.trim();
  const locLine = addr || loc;

  let subject: string;
  let intro: string;

  switch (eventType) {
    case EVENT_TYPES.GO_LIVE:
      subject = `🟢 Subasta en directo: ${title}`;
      intro = `La subasta que sigues está abierta para pujar.`;
      break;
    case EVENT_TYPES.NEW_BID: {
      const newBid = fmtMoney(payload.currentBid ?? payload.newBid);
      subject = `💶 Nueva puja (${newBid}): ${title}`;
      intro = `Se ha registrado una nueva puja: ${newBid}.`;
      break;
    }
    case EVENT_TYPES.STATUS_CHANGE: {
      const to = (payload.toStatus as string) ?? '';
      subject = `🔁 Cambio de estado (${to}): ${title}`;
      intro = `Estado actualizado a ${to}.`;
      break;
    }
    case EVENT_TYPES.SUSPENDED: {
      const reason = (payload.suspensionReason as string) ?? 'Suspendida';
      subject = `⏸️ Subasta suspendida: ${title}`;
      intro = `Motivo: ${reason}.`;
      break;
    }
    case EVENT_TYPES.RESCHEDULED: {
      const resumeAt = (payload.resumeAt as string) ?? '';
      subject = `🔄 Subasta reprogramada: ${title}`;
      intro = `Nueva fecha: ${resumeAt}.`;
      break;
    }
    case EVENT_TYPES.ENDING_SOON: {
      const endsAt = (payload.endsAt as string) ?? '';
      subject = `⏰ Termina pronto: ${title}`;
      intro = `Esta subasta finaliza el ${endsAt}.`;
      break;
    }
    case EVENT_TYPES.FINISHED: {
      subject = `🏁 Subasta finalizada: ${title}`;
      intro = `Puja final: ${fmtFinalBid(payload)}.`;
      break;
    }
    default:
      subject = `Actualización: ${title}`;
      intro = `Hay una actualización sobre una subasta que sigues.`;
  }

  const text = `${intro}\n\n${title}\n${locLine}\n\nVer subasta: ${url}\n`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f9fafb;color:#111827;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 16px;font-size:20px;">${escapeHtml(subject)}</h2>
    <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
    <p style="margin:0 0 8px;"><strong>${escapeHtml(title)}</strong></p>
    ${locLine ? `<p style="margin:0 0 16px;color:#6b7280;">${escapeHtml(locLine)}</p>` : ''}
    <p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">Ver subasta</a></p>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">Recibes este aviso porque sigues esta subasta. Cambia tus preferencias en el panel de seguimientos.</p>
  </div>
</body></html>`;

  return { subject, html, text };
}

/** Render a per-event-type push notification. */
export function renderPush(
  eventType: string,
  payload: DispatchPayload,
  appUrl: string,
): RenderedPush {
  const title = (payload.title as string) ?? 'Subasta';
  const url = buildAuctionUrl(payload, appUrl);
  const auctionId = (payload.auctionId as string) ?? '';

  let pushTitle: string;
  let body: string;
  switch (eventType) {
    case EVENT_TYPES.GO_LIVE:
      pushTitle = '🟢 Subasta en directo';
      body = title;
      break;
    case EVENT_TYPES.NEW_BID:
      pushTitle = `💶 Nueva puja: ${fmtMoney(payload.currentBid ?? payload.newBid)}`;
      body = title;
      break;
    case EVENT_TYPES.STATUS_CHANGE:
      pushTitle = `🔁 ${payload.toStatus ?? 'Estado actualizado'}`;
      body = title;
      break;
    case EVENT_TYPES.SUSPENDED:
      pushTitle = '⏸️ Subasta suspendida';
      body = title;
      break;
    case EVENT_TYPES.RESCHEDULED:
      pushTitle = '🔄 Subasta reprogramada';
      body = title;
      break;
    case EVENT_TYPES.ENDING_SOON:
      pushTitle = '⏰ Termina pronto';
      body = title;
      break;
    case EVENT_TYPES.FINISHED:
      pushTitle = '🏁 Subasta finalizada';
      body = `${title} — ${fmtFinalBid(payload)}`;
      break;
    default:
      pushTitle = 'Actualización de subasta';
      body = title;
  }

  // tag: collapse same-auction-same-event notifications in the browser tray.
  const tag = `${auctionId}:${eventType}`;
  return { title: pushTitle, body, url, tag };
}

/** Render an in-app notification (DB row content). */
export function renderInApp(
  eventType: string,
  payload: DispatchPayload,
): RenderedInApp {
  return {
    type: notificationTypeForEvent(eventType),
    payload,
  };
}
