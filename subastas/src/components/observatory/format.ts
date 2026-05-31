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

/**
 * displayTitle — produce a human-readable title for an auction card.
 *
 * The upstream `title` field is unreliable: ~94% of all rows (40.6% of ACTIVE
 * rows) carry the literal string "Unknown" because of bad scraper data
 * (FLAG-TITLE-FALLBACK-MISSES-LITERAL-UNKNOWN, Ken). `propertyType` is 100%
 * null on active rows, so we cannot use it. Fallback order:
 *
 *   1. real title (not empty, not the literal "Unknown")
 *   2. "Subasta en {municipality}, {province}"
 *   3. "Subasta en {province}"
 *   4. "Subasta judicial"
 *
 * We never render "Unknown" to the user.
 */
export function displayTitle(input: {
  title?: string | null;
  municipality?: string | null;
  province?: string | null;
}): string {
  const raw = (input.title ?? "").trim();
  const isJunk = raw === "" || raw.toLowerCase() === "unknown";
  if (!isJunk) return raw;

  const muni = input.municipality ? titleCase(input.municipality) : "";
  const prov = input.province ? capitalize(input.province) : "";

  if (muni && prov) return `Subasta en ${muni}, ${prov}`;
  if (muni) return `Subasta en ${muni}`;
  if (prov) return `Subasta en ${prov}`;
  return "Subasta judicial";
}

/** Days remaining until target (floor, ≥0). Returns null when target invalid. */
export function daysLeft(target: string | Date | null | undefined): number | null {
  if (!target) return null;
  const d = target instanceof Date ? target : new Date(target);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

/** Short days-left badge: "3 d" / "Hoy" / "Finalizada". */
export function formatDaysLeft(target: string | Date | null | undefined): string {
  const dl = daysLeft(target);
  if (dl == null) return "Sin fecha";
  if (dl === 0) {
    const d = target instanceof Date ? target : new Date(target as string);
    if (d.getTime() <= Date.now()) return "Finalizada";
    return "Hoy";
  }
  if (dl === 1) return "1 d";
  return `${dl} d`;
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
