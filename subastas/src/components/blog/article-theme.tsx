/**
 * Article category theming — the visual taxonomy for the /blog "Guías" showcase.
 *
 * Builds on Forge's `clusterToThemeKey` (src/lib/article-cover.ts): every raw
 * `cluster` label collapses to one of 12 stable theme keys. This module gives
 * each key its human-facing identity — a localized label + one-line blurb, a
 * cohesive cool-green duotone (used for the cover placeholder when Vinci's
 * photo is missing), and a hairline line-glyph.
 *
 * Design discipline: the site's identity is a cool clinical-green system (2
 * greens + white + ink). Categories are differentiated by GLYPH + LABEL, not by
 * clashing hues — every tint below stays inside the pine/teal/slate family so
 * the whole library reads as ONE curated set even with mixed real/fallback art.
 */
import type { ThemeKey } from "@/lib/article-cover";
import { clusterToThemeKey } from "@/lib/article-cover";
import type { Locale } from "@/i18n/routing";

/** Resolve a raw cluster to a theme key, never null (unmatched → "generic"). */
export function resolveTheme(cluster: string | null | undefined): ThemeKey {
  return clusterToThemeKey(cluster) ?? "generic";
}

export type ThemeMeta = {
  /** Short chip/section label. */
  label: Record<Locale, string>;
  /** One-line section subtitle — describes the category (SEO + wayfinding). */
  blurb: Record<Locale, string>;
  /** Cover-placeholder duotone: [dark, mid] — cohesive cool-green family. */
  tint: readonly [string, string];
};

export const THEME_META: Record<ThemeKey, ThemeMeta> = {
  judicial: {
    label: { es: "Judicial", en: "Judicial" },
    blurb: {
      es: "Cómo funcionan las subastas de juzgados y concursos.",
      en: "How court and insolvency auctions work.",
    },
    tint: ["#1F4A3A", "#2E6B54"],
  },
  vivienda: {
    label: { es: "Vivienda", en: "Housing" },
    blurb: {
      es: "Pisos, casas y adjudicaciones de inmuebles residenciales.",
      en: "Flats, houses and residential property awards.",
    },
    tint: ["#1C4A44", "#2A7268"],
  },
  vehiculos: {
    label: { es: "Vehículos", en: "Vehicles" },
    blurb: {
      es: "Coches, motos y flotas embargadas en subasta.",
      en: "Seized cars, motorbikes and fleets at auction.",
    },
    tint: ["#1E3A4A", "#2E5F73"],
  },
  hacienda: {
    label: { es: "Hacienda", en: "Tax authority" },
    blurb: {
      es: "Subastas de la AEAT y procedimientos de apremio.",
      en: "AEAT tax-authority auctions and enforcement.",
    },
    tint: ["#243B36", "#3B6157"],
  },
  notarial: {
    label: { es: "Notarial", en: "Notarial" },
    blurb: {
      es: "Subastas notariales y el papel del notario.",
      en: "Notarial auctions and the notary's role.",
    },
    tint: ["#2A4A3A", "#3E6E55"],
  },
  pujas: {
    label: { es: "Cómo pujar", en: "Bidding" },
    blurb: {
      es: "Mecánica de la puja electrónica, paso a paso.",
      en: "Electronic bidding mechanics, step by step.",
    },
    tint: ["#12694F", "#17926D"],
  },
  valoracion: {
    label: { es: "Valoración", en: "Valuation" },
    blurb: {
      es: "Tasación, valor de subasta y precio real.",
      en: "Appraisal, auction value and real price.",
    },
    tint: ["#194A4A", "#227373"],
  },
  deposito: {
    label: { es: "Depósito", en: "Deposit" },
    blurb: {
      es: "Depósitos, avales y financiación de la puja.",
      en: "Deposits, bonds and financing the bid.",
    },
    tint: ["#1D3F4E", "#2C6377"],
  },
  terreno: {
    label: { es: "Terrenos", en: "Land" },
    blurb: {
      es: "Fincas rústicas, parcelas y solares.",
      en: "Rural estates, plots and building land.",
    },
    tint: ["#33452A", "#4E6B3B"],
  },
  comercial: {
    label: { es: "Comercial", en: "Commercial" },
    blurb: {
      es: "Locales, naves, garajes y oficinas.",
      en: "Premises, warehouses, garages and offices.",
    },
    tint: ["#2B3E4A", "#425F70"],
  },
  registro: {
    label: { es: "Registro", en: "Registry" },
    blurb: {
      es: "Registro de la propiedad, cargas e inscripción.",
      en: "Land registry, charges and inscription.",
    },
    tint: ["#204A45", "#2F726A"],
  },
  generic: {
    label: { es: "General", en: "General" },
    blurb: {
      es: "Guías prácticas sobre subastas judiciales del BOE.",
      en: "Practical guides to BOE judicial auctions.",
    },
    tint: ["#26433A", "#3C665A"],
  },
};

/**
 * Curated section order for the showcase — the reader's likely journey
 * (what it is → how to bid → the money → the asset types → the paperwork),
 * with "generic" last. Categories with zero published articles are skipped by
 * the page, so this is a display priority, not a required set.
 */
export const THEME_ORDER: readonly ThemeKey[] = [
  "judicial",
  "pujas",
  "valoracion",
  "deposito",
  "vivienda",
  "vehiculos",
  "terreno",
  "comercial",
  "hacienda",
  "notarial",
  "registro",
  "generic",
];

/**
 * CSS `background` value for a theme's cover placeholder. A layered radial +
 * linear duotone — quiet, premium, and identical whether or not a photo loads
 * on top (the photo, when present, simply covers it).
 */
export function themeGradient(theme: ThemeKey): string {
  const [dark, mid] = THEME_META[theme].tint;
  return `radial-gradient(120% 140% at 85% 12%, ${mid} 0%, ${dark} 68%)`;
}

/** Hairline line-glyph per category (24×24, inherits color via currentColor). */
export function ThemeGlyph({
  theme,
  className,
}: {
  theme: ThemeKey;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {GLYPH_PATHS[theme]}
    </svg>
  );
}

/** Minimal 1.5-stroke line icons — one per theme key. */
const GLYPH_PATHS: Record<ThemeKey, React.ReactNode> = {
  // gavel + block
  judicial: (
    <>
      <path d="M14 6l4 4-5 5-4-4z" />
      <path d="M9.5 10.5L4 16l1.5 1.5L11 12" />
      <path d="M13 17h7" />
    </>
  ),
  // house
  vivienda: (
    <>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  // car
  vehiculos: (
    <>
      <path d="M4 14l1.6-4.2A2 2 0 017.5 8.5h9a2 2 0 011.9 1.3L20 14v4h-2.5v-1.5h-11V18H4z" />
      <circle cx="7.5" cy="16" r="1" />
      <circle cx="16.5" cy="16" r="1" />
    </>
  ),
  // institution / columns
  hacienda: (
    <>
      <path d="M4 9l8-4 8 4" />
      <path d="M5 9v8m4-8v8m6-8v8m4-8v8" />
      <path d="M4 19h16" />
    </>
  ),
  // seal / stamp
  notarial: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M12 12.5V16" />
      <path d="M7 20h10l-1-4H8z" />
    </>
  ),
  // bidding paddle
  pujas: (
    <>
      <path d="M8 4h6a3 3 0 013 3v0a3 3 0 01-3 3H8z" />
      <path d="M11 10v10" />
      <path d="M8 20h6" />
    </>
  ),
  // price tag
  valoracion: (
    <>
      <path d="M4 12V5h7l9 9-7 7-9-9z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </>
  ),
  // shield
  deposito: (
    <>
      <path d="M12 4l7 2.5V11c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6.5z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </>
  ),
  // land / hills
  terreno: (
    <>
      <path d="M3 18l6-8 4 5 3-3.5L21 18z" />
      <path d="M3 18h18" />
    </>
  ),
  // storefront
  comercial: (
    <>
      <path d="M4 9l1.5-4h13L20 9" />
      <path d="M5 9a2.2 2.2 0 003.5 0 2.2 2.2 0 003.5 0 2.2 2.2 0 003.5 0 2.2 2.2 0 003.5 0" />
      <path d="M5 11v8h14v-8" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  // book / registry
  registro: (
    <>
      <path d="M6 4h11a1 1 0 011 1v14a1 1 0 01-1 1H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path d="M6 4v14a2 2 0 002 2h9" />
      <path d="M8 8h7M8 11h7" />
    </>
  ),
  // bookmark
  generic: (
    <>
      <path d="M7 4h10v16l-5-3.5L7 20z" />
    </>
  ),
};
