/**
 * Date formatting for the account panel. NULL-honest: a null/invalid date
 * renders as an em-dash so we never fabricate "Cuenta creada el …" from a
 * missing value. Locale-aware so the EN surface reads English month names.
 */

const EM_DASH = "—";

export function formatAccountDate(
  value: string | Date | null | undefined,
  locale: string,
): string {
  if (!value) return EM_DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return EM_DASH;
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
