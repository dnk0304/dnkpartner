/**
 * Footer used by the blog + article pages. Slim, no live "last update"
 * timestamp (that one lives on the observatory home where it's load-bearing).
 *
 * The footer link to /blog in the rest of the app lives in
 * HomeObservatory.tsx (Phase 9b additions). Keeping the link discoverable
 * across pages is part of the SEO play for the 56 imported guides.
 */
import Link from "next/link";

export function BlogFooter() {
  return (
    <footer className="mt-16 border-t border-[--color-hairline] py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 text-center text-xs text-[--color-ink-tertiary] sm:flex-row sm:justify-between sm:text-left">
        <p>
          SubastasActivas · datos oficiales del Portal de Subastas del BOE.
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/" className="hover:text-[--color-ink-primary]">
            Inicio
          </Link>
          <Link href="/subastas" className="hover:text-[--color-ink-primary]">
            Subastas
          </Link>
          <Link href="/blog" className="hover:text-[--color-ink-primary]">
            Guías
          </Link>
        </nav>
      </div>
    </footer>
  );
}
