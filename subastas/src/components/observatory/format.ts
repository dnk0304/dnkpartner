/**
 * Small formatting helpers used across observatory components.
 * Centralized so every price/date/relative-time renders the same way.
 */

const EURO_FORMAT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const NUM_FORMAT = new Intl.NumberFormat("es-ES");

const DATE_LONG = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeStyle: "short",
});

const DATE_MED = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
});

const DATE_SHORT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIME_HM = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return EURO_FORMAT.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return NUM_FORMAT.format(value);
}

export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_LONG.format(d);
}

export function formatDateMed(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_MED.format(d);
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_SHORT.format(d);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return TIME_HM.format(d);
}

/** "hace 3 min", "hace 2 h", "hace 4 d", "ayer", "ahora". */
export function formatRelativeEs(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return "ahora mismo";
  if (sec < 60) return `hace ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "ayer";
  if (day < 7) return `hace ${day} d`;
  return DATE_MED.format(d);
}

/** Capitalize first letter — for province/municipality which often come lowercased. */
export function capitalize(value: string | null | undefined): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Title-case a multi-word string, preserving common Spanish particles. */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "";
  const particles = new Set(["de", "del", "la", "las", "el", "los", "y", "en"]);
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      particles.has(w) && i > 0 ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}
