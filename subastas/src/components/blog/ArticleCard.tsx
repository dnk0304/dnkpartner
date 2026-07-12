/**
 * ArticleCard — one cover-led card in the /blog "Guías" showcase (and the
 * /noticias grid). Pure presentational server component: the caller resolves
 * the cover src, theme, chip label and formatted date, then hands primitives
 * here. Whole card is a single <Link> for one clean tap/focus target.
 *
 * Two variants:
 *   - "card"    — vertical cover-on-top card (default, used in carousels/grids)
 *   - "feature" — wide lead card: cover left, text right on desktop; stacked on
 *                 mobile. Used once, for the newest guide/news item.
 */
import Link from "next/link";
import type { ThemeKey } from "@/lib/article-cover";
import { CoverImage } from "./CoverImage";
import { ThemeGlyph } from "./article-theme";

export type ArticleCardProps = {
  href: string;
  title: string;
  description?: string | null;
  theme: ThemeKey;
  chipLabel: string;
  coverSrc: string;
  coverAlt: string;
  dateISO?: string;
  dateLabel?: string;
  priority?: boolean;
  variant?: "card" | "feature";
};

function CategoryChip({ theme, label }: { theme: ThemeKey; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm ring-1 ring-white/15">
      <ThemeGlyph theme={theme} className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function ArticleCard({
  href,
  title,
  description,
  theme,
  chipLabel,
  coverSrc,
  coverAlt,
  dateISO,
  dateLabel,
  priority = false,
  variant = "card",
}: ArticleCardProps) {
  if (variant === "feature") {
    return (
      <Link
        href={href}
        className="group grid overflow-hidden rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-surface)] transition-shadow hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)] md:grid-cols-2"
      >
        <div className="relative overflow-hidden md:h-full">
          <CoverImage
            src={coverSrc}
            alt={coverAlt}
            theme={theme}
            priority={priority}
            sizes="(max-width: 768px) 100vw, 50vw"
            rounded="rounded-none"
            aspect="aspect-[16/10] md:aspect-auto md:h-full md:min-h-[15rem]"
            className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
          />
          <div className="absolute left-3 top-3">
            <CategoryChip theme={theme} label={chipLabel} />
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-7">
          <h3 className="font-display text-xl font-semibold leading-snug tracking-tight text-[var(--color-ink-primary)] group-hover:text-[var(--color-brand)] sm:text-2xl">
            {title}
          </h3>
          {description ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-[var(--color-ink-secondary)]">
              {description}
            </p>
          ) : null}
          {dateLabel ? (
            <time
              dateTime={dateISO}
              className="text-xs text-[var(--color-ink-quiet)]"
            >
              {dateLabel}
            </time>
          ) : null}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[12px] border border-[var(--color-hairline)] bg-[var(--color-surface)] transition-shadow hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]"
    >
      <div className="relative overflow-hidden">
        <CoverImage
          src={coverSrc}
          alt={coverAlt}
          theme={theme}
          priority={priority}
          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 22rem"
          rounded="rounded-none"
          aspect="aspect-[16/10]"
          className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
        />
        <div className="absolute left-3 top-3">
          <CategoryChip theme={theme} label={chipLabel} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-base font-semibold leading-snug tracking-tight text-[var(--color-ink-primary)] group-hover:text-[var(--color-brand)]">
          {title}
        </h3>
        {description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-ink-secondary)]">
            {description}
          </p>
        ) : null}
        {dateLabel ? (
          <time
            dateTime={dateISO}
            className="mt-auto pt-1 text-xs text-[var(--color-ink-quiet)]"
          >
            {dateLabel}
          </time>
        ) : null}
      </div>
    </Link>
  );
}
