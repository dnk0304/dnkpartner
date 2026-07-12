"use client";

/**
 * CoverImage — the article cover surface for cards and the article header.
 *
 * Graceful-by-construction: a themed cool-green duotone + category glyph is
 * ALWAYS painted (pure CSS, no network). The photo — an explicit `imageUrl` or
 * one of Vinci's themed `cover-*.webp` fallbacks — is layered on top and only
 * shows once it decodes. If the file is missing (Vinci hasn't shipped it yet)
 * or 404s, `onError` hides the <img> and the gradient remains. Result: never a
 * broken-image icon, and the page looks finished before the art lands.
 *
 * SEO / CLS: the aspect ratio is reserved by the wrapper, so there is no layout
 * shift. The <img> keeps a real `alt`; it is SSR'd into the initial HTML, so
 * crawlers still see it. `onError` is a progressive enhancement only.
 */
import { useState } from "react";
import type { ThemeKey } from "@/lib/article-cover";
import { ThemeGlyph, themeGradient } from "./article-theme";

type Status = "pending" | "loaded" | "failed";

export function CoverImage({
  src,
  alt,
  theme,
  priority = false,
  sizes,
  className = "",
  rounded = "rounded-[10px]",
  aspect = "aspect-[16/10]",
}: {
  src: string;
  alt: string;
  theme: ThemeKey;
  /** Header hero → true (eager, high fetch priority). Cards → false (lazy). */
  priority?: boolean;
  sizes?: string;
  className?: string;
  rounded?: string;
  aspect?: string;
}) {
  const [status, setStatus] = useState<Status>("pending");

  return (
    <div
      className={`relative isolate w-full overflow-hidden ${aspect} ${rounded} ${className}`}
      style={{ background: themeGradient(theme) }}
    >
      {/* Glyph watermark — the category's line-mark, quiet behind the photo. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <ThemeGlyph
          theme={theme}
          className="h-[38%] w-[38%] text-white/12"
        />
      </div>

      {/* Photo layer — SSR'd with real alt (crawlable), but painted at
          opacity:0 and faded in only once it decodes. A missing/404 cover
          (Vinci not shipped yet) stays at opacity:0, so its alt text never
          flashes over the gradient — the placeholder simply remains. */}
      {status !== "failed" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          sizes={sizes}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      {/* Pine scrim — unifying green duotone through-line + text legibility. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
        style={{
          background:
            "linear-gradient(to top, rgba(15,40,32,0.55), rgba(15,40,32,0))",
        }}
      />

      {/* Hairline inset ring keeps covers crisp on white surfaces. */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/5" />
    </div>
  );
}
