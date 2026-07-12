"use client";

/**
 * CategoryCarousel — one category section of the /blog "Guías" showcase.
 *
 * A horizontal scroll-snap rail of cover cards with prev/next controls, that
 * expands into a responsive grid ("Ver todas"). Cards are server-rendered and
 * passed in as `children`, so the interactive shell adds zero data coupling.
 *
 * Accessibility:
 *   - The rail is a labelled region; cards are links, so Tab moves through them
 *     and the browser keeps the focused card in view.
 *   - Prev/next are real <button>s with labels; they hide once expanded.
 *   - Smooth scroll + any transform is dropped under prefers-reduced-motion.
 */
import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ThemeKey } from "@/lib/article-cover";
import { ThemeGlyph, THEME_META } from "./article-theme";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function CategoryCarousel({
  theme,
  label,
  blurb,
  count,
  viewAllLabel,
  viewLessLabel,
  prevLabel,
  nextLabel,
  children,
}: {
  theme: ThemeKey;
  label: string;
  blurb: string;
  count: number;
  viewAllLabel: string;
  viewLessLabel: string;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const items = Children.toArray(children);
  const showToggle = count > 3;

  const updateBounds = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflows(max > 4);
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    if (expanded) return;
    updateBounds();
    const el = railRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateBounds, { passive: true });
    window.addEventListener("resize", updateBounds);
    return () => {
      el.removeEventListener("scroll", updateBounds);
      window.removeEventListener("resize", updateBounds);
    };
  }, [expanded, updateBounds]);

  const scrollByCards = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + 16 : el.clientWidth * 0.8;
    el.scrollBy({
      left: dir * step,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const showArrows = !expanded && overflows;

  return (
    <section
      aria-labelledby={`cat-${theme}`}
      className="scroll-mt-24"
    >
      {/* Eyebrow header */}
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-white"
            style={{
              background: `linear-gradient(135deg, ${THEME_META[theme].tint[1]}, ${THEME_META[theme].tint[0]})`,
            }}
          >
            <ThemeGlyph theme={theme} className="h-5 w-5" />
          </span>
          <div>
            <h2
              id={`cat-${theme}`}
              className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-[var(--color-ink-primary)]"
            >
              {label}
              <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--color-ink-tertiary)]">
                {count}
              </span>
            </h2>
            <p className="mt-0.5 text-sm leading-snug text-[var(--color-ink-quiet)]">
              {blurb}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {showToggle ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--color-action)] transition-colors hover:bg-[var(--color-action-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              {expanded ? viewLessLabel : viewAllLabel}
            </button>
          ) : null}
          {showArrows ? (
            <div className="hidden items-center gap-1.5 sm:flex">
              <RailButton
                label={prevLabel}
                disabled={atStart}
                onClick={() => scrollByCards(-1)}
                dir="prev"
              />
              <RailButton
                label={nextLabel}
                disabled={atEnd}
                onClick={() => scrollByCards(1)}
                dir="next"
              />
            </div>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((child, i) => (
            <div key={i}>{child}</div>
          ))}
        </div>
      ) : (
        <div
          ref={railRef}
          role="region"
          aria-label={label}
          className="sa-rail -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3"
        >
          {items.map((child, i) => (
            <div
              key={i}
              className="w-[82%] shrink-0 snap-start sm:w-[20rem] lg:w-[21rem]"
            >
              {child}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RailButton({
  label,
  onClick,
  disabled,
  dir,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  dir: "prev" | "next";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink-secondary)] transition hover:border-[var(--color-action)] hover:text-[var(--color-action)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        {dir === "prev" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
