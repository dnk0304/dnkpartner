/**
 * noticias-monthly.ts — read + format layer for the DB-backed monthly
 * per-province recap articles (NoticiaMonthly). Forge, 2026-07-20.
 *
 * The Python scheduler job (scheduler.generate_monthly_noticias) writes one row
 * per province × month; these helpers are the ONLY request-path reader. Every
 * read is a single-row / indexed lookup on NoticiaMonthly — never a live
 * Auction scan (the request-path rule). Charts render from the immutable
 * statsJson snapshot stored on the row, so no cross-table join at render time.
 *
 * The prose is plain text with '\n\n' paragraph breaks (no markdown) — the
 * route splits on '\n\n' into <p> elements.
 */
import { prisma } from '@/lib/prisma';
import { PROVINCE_SLUG_TO_DB_KEY, provinceLabelForSlug } from '@/lib/seo/slugs';

/** statsJson shape — mirrors what scheduler.generate_monthly_noticias writes. */
export interface NoticiaStats {
  intake: number;
  prevIntake: number;
  sold: number;
  desierta: number;
  cancelada: number;
  finalizadaSinResultado: number;
  totalConcluded: number;
  pctVendidas: number | null;
  soldMedianCents: number | null;
  p25Cents: number | null;
  p75Cents: number | null;
  discountAppraisalMedian: number | null;
  momIntakeDeltaPct: number | null;
  rankByIntake: number | null;
  provinceName: string;
  metaEs: string;
  metaEn: string;
}

export interface NoticiaArticle {
  period: string;
  province: string; // slug
  titleEs: string;
  titleEn: string;
  proseEs: string;
  proseEn: string;
  stats: NoticiaStats;
  published: boolean;
  generatedAt: Date;
}

export interface NoticiaEditionRef {
  period: string;
  province: string;
  title: string; // locale-resolved
  intake: number;
  sold: number;
  soldMedianCents: number | null;
  published: boolean;
}

/** Period must be 'YYYY-MM'. */
export const PERIOD_RE = /^\d{4}-\d{2}$/;

export function isValidPeriod(period: string): boolean {
  if (!PERIOD_RE.test(period)) return false;
  const m = Number(period.slice(5, 7));
  return m >= 1 && m <= 12;
}

/** True iff the slug is one of the 52 canonical provinces. */
export function isProvinceSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVINCE_SLUG_TO_DB_KEY, slug);
}

export { provinceLabelForSlug };

/** One published article for a province+period, or null. */
export async function getMonthlyArticle(
  provinceSlug: string,
  period: string,
): Promise<NoticiaArticle | null> {
  if (!isProvinceSlug(provinceSlug) || !isValidPeriod(period)) return null;
  const row = await prisma.noticiaMonthly.findUnique({
    where: { period_province: { period, province: provinceSlug } },
    select: {
      period: true,
      province: true,
      titleEs: true,
      titleEn: true,
      proseEs: true,
      proseEn: true,
      statsJson: true,
      published: true,
      generatedAt: true,
    },
  });
  if (!row || !row.published) return null;
  return {
    period: row.period,
    province: row.province,
    titleEs: row.titleEs,
    titleEn: row.titleEn,
    proseEs: row.proseEs,
    proseEn: row.proseEn,
    stats: row.statsJson as unknown as NoticiaStats,
    published: row.published,
    generatedAt: row.generatedAt,
  };
}

/** All published editions for a province, newest-first. */
export async function listProvinceEditions(
  provinceSlug: string,
  locale: 'es' | 'en',
): Promise<NoticiaEditionRef[]> {
  if (!isProvinceSlug(provinceSlug)) return [];
  const rows = await prisma.noticiaMonthly.findMany({
    where: { province: provinceSlug, published: true },
    orderBy: { period: 'desc' },
    select: { period: true, province: true, titleEs: true, titleEn: true, statsJson: true },
  });
  return rows.map((r) => {
    const s = r.statsJson as unknown as NoticiaStats;
    return {
      period: r.period,
      province: r.province,
      title: locale === 'en' ? r.titleEn : r.titleEs,
      intake: s?.intake ?? 0,
      sold: s?.sold ?? 0,
      soldMedianCents: s?.soldMedianCents ?? null,
      published: true,
    };
  });
}

/** The latest edition per province (newest month overall), for the hub. */
export async function listLatestEditions(
  locale: 'es' | 'en',
  limit = 60,
): Promise<NoticiaEditionRef[]> {
  // Newest month first; take that month's published rows. One indexed scan on
  // [published, period]. Small result set (≤52/month).
  const newest = await prisma.noticiaMonthly.findFirst({
    where: { published: true },
    orderBy: { period: 'desc' },
    select: { period: true },
  });
  if (!newest) return [];
  const rows = await prisma.noticiaMonthly.findMany({
    where: { published: true, period: newest.period },
    orderBy: { province: 'asc' },
    take: limit,
    select: { period: true, province: true, titleEs: true, titleEn: true, statsJson: true },
  });
  return rows
    .map((r) => {
      const s = r.statsJson as unknown as NoticiaStats;
      return {
        period: r.period,
        province: r.province,
        title: locale === 'en' ? r.titleEn : r.titleEs,
        intake: s?.intake ?? 0,
        sold: s?.sold ?? 0,
        soldMedianCents: s?.soldMedianCents ?? null,
        published: true,
      };
    })
    .sort((a, b) => b.intake - a.intake);
}

/** Distinct province slugs that have at least one published edition. */
export async function listProvincesWithEditions(): Promise<string[]> {
  const rows = await prisma.noticiaMonthly.findMany({
    where: { published: true },
    distinct: ['province'],
    select: { province: true },
  });
  return rows.map((r) => r.province);
}

/** Latest published period across all rows (for generateStaticParams). */
export async function latestPeriod(): Promise<string | null> {
  const row = await prisma.noticiaMonthly.findFirst({
    where: { published: true },
    orderBy: { period: 'desc' },
    select: { period: true },
  });
  return row?.period ?? null;
}

// --- formatting ----------------------------------------------------------

const MONTHS_ES = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MONTHS_EN = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM' -> 'junio de 2026' / 'June 2026'. */
export function periodLabel(period: string, locale: 'es' | 'en'): string {
  const y = period.slice(0, 4);
  const m = Number(period.slice(5, 7));
  const name = (locale === 'en' ? MONTHS_EN : MONTHS_ES)[m] ?? period;
  return locale === 'en' ? `${name} ${y}` : `${name} de ${y}`;
}

/** ISO date for the LAST day of a period month (news datePublished = month end). */
export function periodEndISO(period: string): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  const last = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0));
  return last.toISOString().slice(0, 10);
}

/** cents -> '12.500 €' (es) / '€12,500' (en). Whole euros. */
export function formatEur(cents: number | null | undefined, locale: 'es' | 'en'): string | null {
  if (cents == null) return null;
  const euros = Math.round(cents / 100);
  const grouped = euros.toLocaleString('en-US'); // 12,500
  return locale === 'en' ? `€${grouped}` : `${grouped.replace(/,/g, '.')} €`;
}

/** Split '\n\n'-delimited prose into paragraphs. */
export function proseParagraphs(prose: string): string[] {
  return prose.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
}
