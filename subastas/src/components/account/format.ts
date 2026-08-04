/**
 * Date formatting for the account panel. NULL-honest: a null/invalid date
 * renders as an em-dash so we never fabricate "Cuenta creada el …" from a
 * missing value. Locale-aware so the EN surface reads English month names.
 */

import { APP_TIME_ZONE } from "@/components/observatory/format";

const EM_DASH = "—";

// Hydration (#418), not style: pinned zone so the container (UTC) and the visitor's browser
// (Europe/Madrid) render the same calendar day for the same instant.
const ACCOUNT_DATE_FMT = {
  en: new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: APP_TIME_ZONE }),
  es: new Intl.DateTimeFormat("es-ES", { year: "numeric", month: "long", day: "numeric", timeZone: APP_TIME_ZONE }),
};

export function formatAccountDate(
  value: string | Date | null | undefined,
  locale: string,
): string {
  if (!value) return EM_DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return EM_DASH;
  return (locale === "en" ? ACCOUNT_DATE_FMT.en : ACCOUNT_DATE_FMT.es).format(d);
}

/** Currency formatter for invoice amounts (minor-unit-agnostic decimal). */
export function formatAmount(
  amount: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount);
  } catch {
    return `${amount} ${currency || "EUR"}`;
  }
}
