/**
 * ArticleContent — SHARED article-body renderer.
 *
 * Single source of truth for rendering an article's markdown body. Used by
 * BOTH the public page (`/guia/[slug]`) and the admin editor's preview pane
 * so the editor's "Previsualizar" is byte-for-byte the same render as what
 * publishes live (true WYSIWYG).
 *
 * Implementation notes:
 *   - react-markdown + remark-gfm (tables, strikethrough, task lists).
 *   - No `rehype-raw`. Raw HTML in markdown is intentionally NOT supported —
 *     this preserves the no-raw-HTML security posture for Dennis-authored
 *     content. Do not add it here without a security review.
 *   - The `.article-prose` class (defined in `globals.css`) pins typography
 *     to the design tokens (h2/h3/h4, tables, lists, links). Keeping the
 *     wrapping div + class inside this component guarantees the editor
 *     preview and the public page share the same prose styling.
 *
 * Column width / outer layout is intentionally the responsibility of the
 * CALLER — the public page wraps the content in `max-w-3xl px-6`; the
 * editor preview wraps it in its own panel. Both feed the same body into
 * the same renderer.
 */
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * In-body image styling. SAGA authors inline images as plain markdown
 * `![alt](/images/guia/inline-*.webp)` — still a plain <img> (no rehype-raw,
 * no raw HTML). This override only restyles it: rounded, hairline, responsive,
 * lazy-loaded, block-centered. No <figure> wrapper — react-markdown emits the
 * image inside a <p>, and a block <figure> there is invalid HTML; the `alt`
 * text already carries the accessible description.
 */
const markdownComponents: Components = {
  img: ({
    node: _node,
    alt,
    ...props
  }: ComponentPropsWithoutRef<"img"> & { node?: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className="mx-auto my-6 block h-auto max-w-full rounded-[10px] border border-[var(--color-hairline)]"
    />
  ),
};

export function ArticleContent({ body }: { body: string }) {
  return (
    <div className="article-prose text-[var(--color-ink-primary)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
