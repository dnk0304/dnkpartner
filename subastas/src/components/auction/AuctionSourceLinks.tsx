"use client";

/**
 * AuctionSourceLinks — labelled set of "go to the official source" buttons.
 *
 * Consumes the `sourceLinks[]` projection from `/api/auctions/[id]` (see
 * `src/lib/source-links.ts`). The data layer guarantees:
 *   - Every entry's href is non-empty.
 *   - The ordering is the recommended UX order (subasta → lote → pujas →
 *     edicto → pdf). We render in array order.
 *   - The BOE homepage is never emitted as a fallback.
 *
 * Visual: a wrap-friendly cluster of small outlined buttons with an icon
 * appropriate to the resource type. Sized to read as primary actions, not
 * decoration — the marketing brief is explicit that these are trust anchors
 * and should match the competitor's prominence.
 *
 * All links open in a new tab with rel="noopener noreferrer". An
 * <ExternalLink> glyph on each makes the new-tab affordance unambiguous.
 */

import * as React from "react";
import {
  ExternalLink,
  FileText,
  Gavel,
  Link2,
  ScrollText,
  FileSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SourceLink = {
  key: "subasta" | "lote" | "pujas" | "edicto" | "pdf";
  label: string;
  href: string;
};

const ICONS: Record<SourceLink["key"], React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  subasta: Link2,
  lote: FileSearch,
  pujas: Gavel,
  edicto: ScrollText,
  pdf: FileText,
};

export type AuctionSourceLinksProps = {
  links: SourceLink[];
  className?: string;
};

export function AuctionSourceLinks({ links, className }: AuctionSourceLinksProps) {
  if (!links || links.length === 0) return null;
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-2",
        className,
      )}
      aria-label="Enlaces a la fuente oficial"
    >
      {links.map((link) => {
        const Icon = ICONS[link.key] ?? Link2;
        return (
          <li key={`${link.key}-${link.href}`}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-2 rounded-md border border-[--color-hairline] bg-[--color-surface] px-3 py-2 text-sm font-medium text-[--color-ink-secondary] transition-colors",
                "hover:border-[--color-brand]/40 hover:bg-[--color-brand]/5 hover:text-[--color-ink-primary]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40",
              )}
              aria-label={`${link.label} (se abre en nueva pestaña)`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden={true} />
              <span>{link.label}</span>
              <ExternalLink className="h-3 w-3 opacity-50" aria-hidden={true} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
