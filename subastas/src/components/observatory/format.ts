/**
 * Small formatting helpers used across observatory components.
 * Centralized so every price/date/relative-time renders the same way.
 */

// i18n Phase 1 (2026-07-10): date/number formatters are locale-aware. Every
// date function takes an optional trailing `locale` (default "es" so the
// hundreds of existing call sites keep compiling); pass `useLocale()` /
// `getLocale()` at the call site to render en-GB dates on /en.
import type { Locale } from "@/i18n/routing";

/**
 * APP_TIME_ZONE — the zone EVERY server-rendered date/time is formatted in.
 *
 * Two separate reasons, both load-bearing:
 *
 * 1. HYDRATION. With no `timeZone` option an Intl formatter uses the HOST zone. The container runs
 *    UTC, the visitor's browser runs Europe/Madrid. Same instant, different wall clock, different
 *    string, React #418 on every row that shows a time. The zone must be pinned to a constant so
 *    both sides produce identical bytes.
 *
 * 2. CORRECTNESS — and this is why the constant is "UTC" and not "Europe/Madrid". The BOE auction
 *    columns are Postgres `timestamp` (no zone) and the scraper writes MADRID WALL TIME into them
 *    (see 5c3a0d1 "resumeAt must carry Madrid wall time, not a UTC-normalised value" — the ISO
 *    branch was normalising BOE's 12:00 CET down to 10:00 and all 164 stored resumeAt values were
 *    1-2h early). Prisma hands a zone-less timestamp back as a Date whose UTC fields hold exactly
 *    those stored digits. So formatting in UTC prints the Madrid wall time the BOE published;
 *    formatting in "Europe/Madrid" would add the offset a SECOND time and shift every auction hour
 *    forward by 1-2h. UTC here means "render the stored digits", not "render in UTC".
 *
 * This matches the pre-existing convention in src/lib/noticias.ts (`timeZone: 'UTC'`).
 */
export const APP_TIME_ZONE = "UTC";

/**
 * DATE_TIME_CONNECTOR — the literal glue between the date part and the time part.
 *
 * THE BUG THIS CONSTANT EXISTS TO KILL. `Intl.DateTimeFormat(tag, { dateStyle: "long", timeStyle:
 * "short" })` does not just concatenate; ICU picks a locale-specific compound pattern whose
 * connector LITERAL is CLDR data. Node and Chromium ship different ICU versions, and es-ES changed:
 *
 *     Node (ICU 77 / CLDR 47)  →  "5 de agosto de 2026, 8:56"
 *     Chromium (newer CLDR)    →  "5 de agosto de 2026, a las 8:56"
 *
 * Every auction detail page renders one of these, so ~100% of detail loads threw React #418 in
 * production. No amount of pinning locale or zone fixes it — the divergence is in the pattern data
 * itself. The only durable fix is to stop asking ICU for the compound string at all: format the
 * date and the time with SEPARATE single-purpose formatters (whose patterns are CLDR-stable) and
 * join them with a connector WE own. `scripts/intl-ssr-guard.ts` bans the dateStyle+timeStyle pair
 * repo-wide so this cannot come back.
 */
const DATE_TIME_CONNECTOR: Record<Locale, string> = { es: ", ", en: ", " };

// Cached per-locale formatter instances (Intl construction is expensive).
// es → es-ES; en → en-GB ("7 July 2026", dd/mm/yyyy).
function cache(build: (tag: string) => Intl.DateTimeFormat): Record<Locale, Intl.DateTimeFormat> {
  return { es: build("es-ES"), en: build("en-GB") };
}

const EURO_FORMAT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const NUM_FORMAT = new Intl.NumberFormat("es-ES");

// Grouped variant — forces the Spanish thousands separator even on 4-digit
// values (es-ES defaults to `min2` grouping, so 1450 renders without a dot).
// Used by the m²/€/m² fact-strip helpers where "1.450 €/m²" is the spec.
// Prices/numbers stay es-ES on both locales: "1.450 €" is the site-wide
// figure style (audit did not flag number formats; changing them would churn
// every snapshot).
const NUM_FORMAT_GROUPED = new Intl.NumberFormat("es-ES", { useGrouping: "always" });

// The date half of formatDateLong. Single-purpose (dateStyle only) so ICU cannot inject a compound
// connector literal — see DATE_TIME_CONNECTOR.
// intl-gate-ok: pinned timeZone (APP_TIME_ZONE) and deliberately NOT paired with timeStyle
const DATE_LONG_DATE = cache((tag) => new Intl.DateTimeFormat(tag, {
  dateStyle: "long",
  timeZone: APP_TIME_ZONE,
}));

// The time half of formatDateLong. `timeStyle: "short"` (not hour/minute 2-digit) preserves the
// existing "8:56" rendering; formatTime below keeps its own zero-padded "08:56" contract.
// intl-gate-ok: pinned timeZone (APP_TIME_ZONE) and deliberately NOT paired with dateStyle
const DATE_LONG_TIME = cache((tag) => new Intl.DateTimeFormat(tag, {
  timeStyle: "short",
  timeZone: APP_TIME_ZONE,
}));

const DATE_MED = cache((tag) => new Intl.DateTimeFormat(tag, {
  dateStyle: "medium",
  timeZone: APP_TIME_ZONE,
}));

const DATE_SHORT = cache((tag) => new Intl.DateTimeFormat(tag, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
}));

const TIME_HM = cache((tag) => new Intl.DateTimeFormat(tag, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
}));

// Day key in APP_TIME_ZONE, as epoch-ms at UTC midnight of that calendar day. Host-zone
// independent, so a day bucket computed on the server equals the one computed in the browser.
// intl-gate-ok: pinned timeZone (APP_TIME_ZONE); en-CA is a fixed ISO-shaped format, not user-facing
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_TIME_ZONE,
});

function dayKeyMs(d: Date): number {
  return Date.parse(`${DAY_KEY.format(d)}T00:00:00Z`);
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return EURO_FORMAT.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return NUM_FORMAT.format(value);
}

/**
 * formatM2 — surface area as "85 m²" / "1.250 m²" (Spanish thousands sep,
 * non-breaking space before the unit so the figure never wraps off its unit).
 *
 * Honest-NULL: returns null (NOT "—") when the value is absent or ≤0, so the
 * caller can OMIT the pill entirely rather than render an orphan dash. Most
 * historical rows have no m²; the fact strip must collapse cleanly.
 */
export function formatM2(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `${NUM_FORMAT_GROUPED.format(Math.round(value))} m²`;
}

/**
 * formatPricePerM2 — derived €/m² as "1.450 €/m²" (Spanish thousands sep, no
 * decimals, non-breaking space before the unit). Forge derives + rounds this
 * server-side (numerator precedence valorSubasta→appraisalValue); we only
 * render it — never recompute.
 *
 * Honest-NULL: returns null when absent or ≤0 so the figure omits cleanly.
 */
export function formatPricePerM2(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `${NUM_FORMAT_GROUPED.format(Math.round(value))} €/m²`;
}

export function formatDateLong(value: string | Date | null | undefined, locale: Locale = "es"): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  // Composed, never compound — see DATE_TIME_CONNECTOR for why this is not one formatter.
  return `${DATE_LONG_DATE[locale].format(d)}${DATE_TIME_CONNECTOR[locale]}${DATE_LONG_TIME[locale].format(d)}`;
}

export function formatDateMed(value: string | Date | null | undefined, locale: Locale = "es"): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_MED[locale].format(d);
}

export function formatDateShort(value: string | Date | null | undefined, locale: Locale = "es"): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_SHORT[locale].format(d);
}

export function formatTime(value: string | Date | null | undefined, locale: Locale = "es"): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return TIME_HM[locale].format(d);
}

/**
 * Day-granularity update label for the "Datos actualizados {when}" trust
 * signal. Returns "hoy" / "ayer" / a medium-format date.
 *
 * Why not `formatRelativeEs`: Dennis (2026-06-03) — minute-level relative
 * times ("hace 3 min", "hace 2 h") read as nervous on a judicial-data site;
 * we sync continuously and the user only needs to know it's current TODAY.
 * A day-granularity label is calmer and matches what the data actually
 * promises ("daily official sync, intra-day deltas").
 */
export function formatUpdatedDayEs(value: string | Date | null | undefined, locale: Locale = "es"): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  // Compare on DAY boundaries (not wall-clock diff) so a 23:55 update viewed at 00:05 reads as
  // "ayer", not "hoy" — but the boundary must be the APP's day, not the HOST's. The previous
  // implementation used local getters (getFullYear/getMonth/getDate), which put the container (UTC)
  // and the visitor (Europe/Madrid) in different buckets for any timestamp inside the offset window
  // — "hoy" server-side, "ayer" client-side, React #418 in the header and footer of EVERY page.
  // en-CA yields an ISO-shaped "YYYY-MM-DD" that sorts and subtracts cleanly.
  const diffDays = Math.round((dayKeyMs(new Date()) - dayKeyMs(d)) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return locale === "en" ? "today" : "hoy";
  if (diffDays === 1) return locale === "en" ? "yesterday" : "ayer";
  // Older than yesterday: show the date so the user knows exactly how stale.
  return locale === "en" ? `on ${DATE_MED.en.format(d)}` : `el ${DATE_MED.es.format(d)}`;
}

/** es: "hace 3 min", "hace 2 h", "ayer", "ahora mismo" · en: "3 min ago", … */
export function formatRelativeEs(value: string | Date | null | undefined, locale: Locale = "es"): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const en = locale === "en";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return en ? "just now" : "ahora mismo";
  if (sec < 60) return en ? `${sec} s ago` : `hace ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return en ? `${min} min ago` : `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return en ? `${hr} h ago` : `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return en ? "yesterday" : "ayer";
  if (day < 7) return en ? `${day} d ago` : `hace ${day} d`;
  return DATE_MED[locale].format(d);
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

/** Short days-left badge: "3 d" / "Hoy" / "Finalizada" (en: "Today"/"Ended"). */
export function formatDaysLeft(target: string | Date | null | undefined, locale: Locale = "es"): string {
  const en = locale === "en";
  const dl = daysLeft(target);
  if (dl == null) return en ? "No date" : "Sin fecha";
  if (dl === 0) {
    const d = target instanceof Date ? target : new Date(target as string);
    if (d.getTime() <= Date.now()) return en ? "Ended" : "Finalizada";
    return en ? "Today" : "Hoy";
  }
  if (dl === 1) return "1 d";
  return `${dl} d`;
}

/**
 * prettifyAuctionType — turn a raw category/propertyType label into the
 * short, human-readable headline shown on the carousel card.
 *
 * Inputs:
 *   - `propertyType` from the BOE bien-heading parse: e.g. "Inmueble
 *     (Trastero)", "Trastero", "Garaje".
 *   - `category` from the row-level scraper: e.g. "Viviendas", "Trasteros",
 *     "Otros inmuebles".
 *
 * Behaviour:
 *   - Strip a leading "Inmueble (…)" wrapper so the parens label is the type.
 *   - Singularise the obvious plurals so the headline reads as "this card =
 *     ONE of these" ("Viviendas" → "Vivienda"). The list is intentionally
 *     short — better to render the raw category than to risk a wrong singular.
 *   - Generic fallback ("Subasta") for null / empty / "Unknown".
 *
 * Never returns the BOE ref — refs are NEVER headlines.
 */
export function prettifyAuctionType(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw || raw.toLowerCase() === "unknown") return "Subasta";

  // Strip "Inmueble (TYPE)" → "TYPE".
  const parens = raw.match(/^\s*Inmueble\s*\(([^)]+)\)\s*$/i);
  const stripped = (parens ? parens[1] : raw).trim();

  // Singularise common Spanish plurals from the category set.
  const SINGULAR: Record<string, string> = {
    viviendas: "Vivienda",
    garajes: "Garaje",
    trasteros: "Trastero",
    terrenos: "Terreno",
    locales: "Local",
    "fincas rústicas": "Finca rústica",
    "naves industriales": "Nave industrial",
    "otros inmuebles": "Otros inmuebles",
    turismos: "Turismo",
    motocicletas: "Motocicleta",
    "vehículos industriales": "Vehículo industrial",
    barcos: "Barco",
    maquinaria: "Maquinaria",
    joyas: "Joya",
    arte: "Arte",
  };
  const lower = stripped.toLowerCase();
  if (SINGULAR[lower]) return SINGULAR[lower];

  // Default: capitalise first letter (preserves accents).
  return capitalize(stripped);
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
