/**
 * Notification + Follow UI types — mirror Wave 2b API contracts (frozen).
 *
 * Source of truth: WAVE2B_API_CONTRACTS.md.
 *
 * Keep the type names close to the contract field names so a future schema
 * drift is loud (TS won't tolerate a renamed field).
 */

export type NotifyChannel = "email" | "push" | "inapp";

/**
 * Event taxonomy from the dispatcher (Ghost <-> dispatcher contract).
 * The notification.type column carries one of these enum values.
 */
export type NotificationType =
  | "GO_LIVE"
  | "NEW_BID"
  | "STATUS_CHANGE"
  | "SUSPENDED"
  | "RESCHEDULED"
  | "ENDING_SOON"
  | "FINISHED";

export interface NotificationPayload {
  title?: string;
  province?: string;
  municipality?: string;
  currentBid?: number;
  toStatus?: string;
  fromStatus?: string;
  suspensionReason?: string;
  resumeAt?: string;
  endsAt?: string;
  finalBid?: number;
  __event?: string;
  __dedupe?: string;
  [key: string]: unknown;
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  channel: NotifyChannel;
  auctionId: string | null;
  read: boolean;
  sentAt: string;
  deliveredAt: string | null;
  payload: NotificationPayload;
}

export interface NotificationListResponse {
  success: true;
  data: NotificationRow[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}

export interface UnreadCountResponse {
  success: true;
  count: number;
}

export interface FollowPrefs {
  notifyOnGoLive: boolean;
  notifyOnBid: boolean;
  notifyOnStatus: boolean;
  notifyOnSuspension: boolean;
  notifyOnResume: boolean;
  notifyOnFinish: boolean;
  channels: string;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export interface FollowRow extends FollowPrefs {
  id: string;
  auctionId: string;
  notes: string | null;
  createdAt: string;
  auction?: {
    id: string;
    title: string | null;
    province: string | null;
    municipality: string | null;
    status: string | null;
    currentBid: number | null;
    appraisalValue: number | null;
    endsAt: string | null;
    imageUrl: string | null;
  };
}

export interface FollowListResponse {
  success: true;
  data: FollowRow[];
}

export interface FollowResponse {
  success: true;
  data: FollowRow;
}

export interface PrefsResponse {
  success: true;
  data: FollowPrefs & { id?: string; auctionId?: string };
}

export const DEFAULT_PREFS: FollowPrefs = {
  notifyOnGoLive: true,
  notifyOnBid: true,
  notifyOnStatus: true,
  notifyOnSuspension: true,
  notifyOnResume: true,
  notifyOnFinish: true,
  channels: "email,inapp",
  quietHoursStart: null,
  quietHoursEnd: null,
};

// --- Channel CSV helpers ---

export function parseChannels(csv: string | null | undefined): NotifyChannel[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is NotifyChannel => c === "email" || c === "push" || c === "inapp");
}

export function serializeChannels(channels: NotifyChannel[]): string {
  return Array.from(new Set(channels)).join(",");
}

// --- Spanish copy + formatters ---

export const TYPE_LABELS_ES: Record<NotificationType, string> = {
  GO_LIVE: "Subasta en vivo",
  NEW_BID: "Nueva puja",
  STATUS_CHANGE: "Cambio de estado",
  SUSPENDED: "Subasta suspendida",
  RESCHEDULED: "Subasta reanudada",
  ENDING_SOON: "Termina pronto",
  FINISHED: "Subasta finalizada",
};

export const CHANNEL_LABELS_ES: Record<NotifyChannel, string> = {
  email: "Correo electrónico",
  push: "Notificación del navegador",
  inapp: "Bandeja en la web",
};

export const PREF_FIELD_LABELS_ES: Record<
  keyof Omit<FollowPrefs, "channels" | "quietHoursStart" | "quietHoursEnd">,
  { label: string; help: string }
> = {
  notifyOnGoLive: {
    label: "Cuando entre en vivo",
    help: "La subasta abre el periodo de pujas.",
  },
  notifyOnBid: {
    label: "Cuando haya una nueva puja",
    help: "Otro postor mejora la mejor oferta.",
  },
  notifyOnStatus: {
    label: "Cambios de estado y avisos finales",
    help: "Próxima a terminar y otros cambios de estado oficiales.",
  },
  notifyOnSuspension: {
    label: "Si se suspende",
    help: "La subasta queda en pausa por orden judicial.",
  },
  notifyOnResume: {
    label: "Si se reanuda o reprograma",
    help: "Se fija una nueva fecha tras una suspensión.",
  },
  notifyOnFinish: {
    label: "Cuando termine",
    help: "Cierre de pujas con resultado final.",
  },
};

const RTF = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" }) : null;
const DTF =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" })
    : null;

export function formatRelativeEs(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffSec = Math.round((d.getTime() - now) / 1000);
  const absSec = Math.abs(diffSec);
  if (!RTF) return d.toLocaleString("es-ES");
  if (absSec < 60) return RTF.format(diffSec, "second");
  if (absSec < 3600) return RTF.format(Math.round(diffSec / 60), "minute");
  if (absSec < 86_400) return RTF.format(Math.round(diffSec / 3600), "hour");
  if (absSec < 86_400 * 7) return RTF.format(Math.round(diffSec / 86_400), "day");
  return DTF ? DTF.format(d) : d.toLocaleString("es-ES");
}

export function formatBidEur(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Derive a human-readable summary from a notification row using its payload.
 * Stays compact — full detail lives in the linked auction page.
 */
export function summarizeNotification(n: NotificationRow): { title: string; body: string } {
  const title = TYPE_LABELS_ES[n.type] ?? "Notificación";
  const auctionTitle = n.payload?.title?.trim();
  const place = [n.payload?.municipality, n.payload?.province].filter(Boolean).join(", ");
  const bid = formatBidEur(n.payload?.currentBid ?? n.payload?.finalBid ?? null);

  switch (n.type) {
    case "NEW_BID":
      return {
        title,
        body: auctionTitle ? `${auctionTitle} · puja actual ${bid}` : `Puja actual ${bid}`,
      };
    case "GO_LIVE":
      return {
        title,
        body: auctionTitle ? `${auctionTitle} ya admite pujas.` : "La subasta ya admite pujas.",
      };
    case "ENDING_SOON":
      return {
        title,
        body: auctionTitle ? `${auctionTitle} termina pronto.` : "Termina pronto.",
      };
    case "FINISHED":
      return {
        title,
        body: auctionTitle ? `${auctionTitle} ha terminado. Resultado: ${bid}.` : `Resultado final: ${bid}.`,
      };
    case "SUSPENDED":
      return {
        title,
        body: n.payload?.suspensionReason
          ? `${auctionTitle ?? "Subasta"} suspendida: ${n.payload.suspensionReason}`
          : `${auctionTitle ?? "Subasta"} suspendida.`,
      };
    case "RESCHEDULED":
      return {
        title,
        body: n.payload?.resumeAt
          ? `${auctionTitle ?? "Subasta"} reanudada — ${formatRelativeEs(n.payload.resumeAt)}.`
          : `${auctionTitle ?? "Subasta"} reanudada.`,
      };
    case "STATUS_CHANGE":
      return {
        title,
        body: n.payload?.toStatus
          ? `${auctionTitle ?? "Subasta"} → ${n.payload.toStatus}${place ? ` · ${place}` : ""}`
          : auctionTitle ?? "Cambio de estado.",
      };
    default:
      return { title, body: auctionTitle ?? "" };
  }
}
