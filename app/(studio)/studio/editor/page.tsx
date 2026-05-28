import type { Metadata } from "next";
import Link from "next/link";

/**
 * /studio/editor — "Coming soon" stub for the future drag-and-drop website
 * editor (Elementor / Shopify themes style).
 *
 * Why this exists as a NATIVE Next.js route (not proxied to the dnkstudio
 * Express container): the Next.js rewrite in next.config.ts forwards
 * `/studio/:path*` to the studio backend EXCEPT `/studio/editor[/...]`
 * (negative lookahead in the source pattern). Dennis wants 4 cards on the
 * dashboard — 3 active (KDP / image / trends — all live in the studio app)
 * plus this 1 "Coming soon" placeholder.
 *
 * Auth: the parent middleware (proxy.ts) gates `/studio/*` so this stub is
 * only reachable post-login. No additional gate needed here.
 *
 * Polish pass: Pixel — once Phase 2 dashboard cards land, this stub will be
 * re-styled to match. For now the markup is intentionally minimal so the
 * polish surface area is small.
 */

export const metadata: Metadata = {
  title: "Drag-and-drop editor — coming soon",
  description:
    "The DNK Studio drag-and-drop website editor is in development. Talk to us about scope.",
  // Don't index the placeholder.
  robots: { index: false, follow: false },
};

export default function StudioEditorComingSoon() {
  return (
    <main className="min-h-screen grid place-items-center px-6 bg-slate-50">
      <div className="text-center max-w-xl">
        <h1 className="text-3xl font-semibold text-slate-900">
          Drag-and-drop website editor
        </h1>
        <p className="mt-3 text-slate-600">
          Coming soon — this is the future drag-and-drop site builder
          (Elementor / Shopify themes style). Want to talk about scope?
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-teal-700 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
