/**
 * ArticleCover — the full-width cover hero on the /guia/[slug] article header.
 *
 * Thin server wrapper over <CoverImage> that adds the category chip, sized as
 * an editorial hero (wider 16:9 crop, eager load). Shares the exact cover
 * surface used on the listing cards, so a guide looks the same in the library
 * and on its own page.
 */
import type { ThemeKey } from "@/lib/article-cover";
import { CoverImage } from "./CoverImage";
import { ThemeGlyph } from "./article-theme";

export function ArticleCover({
  src,
  alt,
  theme,
  chipLabel,
}: {
  src: string;
  alt: string;
  theme: ThemeKey;
  chipLabel: string;
}) {
  return (
    <div className="relative mb-8">
      <CoverImage
        src={src}
        alt={alt}
        theme={theme}
        priority
        sizes="(max-width: 768px) 100vw, 48rem"
        aspect="aspect-[16/9]"
        rounded="rounded-[12px]"
      />
      <div className="absolute left-3 top-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm ring-1 ring-white/15">
          <ThemeGlyph theme={theme} className="h-3.5 w-3.5" />
          {chipLabel}
        </span>
      </div>
    </div>
  );
}
