'use client';

/**
 * AuctionDocsDisclosure — compact, collapsed-by-default "Documentos oficiales"
 * side widget for the auction detail page (wave173, 2026-08-01).
 *
 * Why it exists: the documents list used to sprawl down the MAIN body of the
 * detail page, forcing a long scroll. This relocates it into a small native
 * <details>/<summary> disclosure that lives in the right rail on desktop and at
 * the tail of the single-column flow on mobile — collapsed until the user asks
 * for it.
 *
 * Access model (Option A, Dennis-decided):
 *   - `documentsLocked === false` (paid / trial-active): full affordances —
 *     "Descargar" (our cached copy, downloadUrl) + "Fuente BOE" (officialUrl).
 *   - `documentsLocked === true` (guest / expired-trial): the widget still
 *     renders as a TEASER — doc types/titles are shown so the value is visible,
 *     but our cached "Descargar" button is replaced by a single upgrade CTA.
 *     The FREE public BOE source link (officialUrl) STAYS visible + clickable
 *     whenever the payload provides it — it is intentionally crawlable.
 *
 * Trust the server projection: when locked, downloadUrl is already null in the
 * payload. We branch per-URL on null and NEVER fabricate an href — we render
 * the lock/upgrade affordance, not a disabled link with a real target.
 *
 * Keyboard/a11y: native <summary> is a focusable disclosure button — Enter and
 * Space toggle it, and we mirror the open state onto `aria-expanded` +
 * `aria-controls` for AT. The default marker is hidden in favour of a chevron.
 */

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  FolderClosed,
  Lock,
} from 'lucide-react';
import { isPaid } from '@/lib/whop/plan-map';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';
import type { AuctionDocument } from '@/types';

/**
 * Pretty label for an `AuctionDocument.docType` slug. Maps the doc-archive
 * scraper's known slugs to Spanish UX labels; unknown values are capitalised
 * so future scraper additions still render readably. (Mirrors the helper the
 * detail/modal surfaces already use.)
 */
export function prettifyDocType(docType: string | null | undefined): string {
  if (!docType) return 'Documento';
  const k = docType.toLowerCase().replace(/[-_\s]+/g, '_');
  const MAP: Record<string, string> = {
    nota_simple: 'Nota simple',
    edicto: 'Edicto',
    edicto_juzgado: 'Edicto del juzgado',
    anuncio_boe: 'Anuncio del BOE',
    tasacion: 'Tasación',
    tasación: 'Tasación',
    informe: 'Informe',
    pliego: 'Pliego de condiciones',
    pliego_condiciones: 'Pliego de condiciones',
    cargas: 'Cargas',
  };
  if (MAP[k]) return MAP[k];
  const trimmed = String(docType).trim();
  if (!trimmed) return 'Documento';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** Is this a per-auction BOE snapshot row? Those are noise here (the canonical
 *  "Fuente BOE" link covers the same ground) — filtered on both passes. */
function isSnapshot(doc: AuctionDocument): boolean {
  const kind = (doc.kind ?? '').toLowerCase();
  if (kind === 'snapshot') return true;
  return (doc.docType ?? '').toUpperCase() === 'SNAPSHOT';
}

/** Public single-file link (BOE anuncio PDF / juzgado edicto). NEVER gated —
 *  these are SEO-public BOE/juzgado sources, shown in both lock states. */
function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <li className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-[var(--color-brand)] hover:underline focus-visible:outline-none focus-visible:underline cursor-pointer"
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{label}</span>
        <ExternalLink className="h-3.5 w-3.5 opacity-60 shrink-0" aria-hidden="true" />
      </a>
    </li>
  );
}

export interface AuctionDocsDisclosureProps {
  /** Full documents[] array from the payload (snapshots filtered internally). */
  documents?: AuctionDocument[] | null;
  /** Legacy single-doc fields — SEO-public BOE/juzgado PDFs (never gated). */
  pdfUrl?: string | null;
  edictUrl?: string | null;
  /** Server-projected paid gate. true → cached downloads withheld (Option A). */
  documentsLocked?: boolean | null;
  /** Current detail path, so the register CTA can bounce the user back. */
  detailPath?: string | null;
  /** Extra classes on the outer <details> (e.g. responsive visibility). */
  className?: string;
}

/**
 * The collapsed side disclosure. Returns null when there is genuinely nothing
 * to show (no documents[] and no legacy links) so the rail never reads empty.
 */
export function AuctionDocsDisclosure({
  documents,
  pdfUrl,
  edictUrl,
  documentsLocked,
  detailPath,
  className,
}: AuctionDocsDisclosureProps) {
  const uid = useId();
  const panelId = `docs-panel-${uid}`;
  const [open, setOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  // Server owns the lock decision; session only routes the CTA (mirrors
  // GatedField): signed-in → in-place UpgradeModal, signed-out → /register.
  const locked = documentsLocked === true;

  const visibleDocs = (documents ?? []).filter((d) => !isSnapshot(d));
  const legacyCount = (pdfUrl ? 1 : 0) + (edictUrl ? 1 : 0);
  const count = visibleDocs.length + legacyCount;

  // Nothing to surface — omit the widget entirely.
  if (count === 0) return null;

  const registerHref = detailPath
    ? `/register?next=${encodeURIComponent(detailPath)}`
    : '/register';

  return (
    <>
      <details
        className={
          'group rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] overflow-hidden' +
          (className ? ' ' + className : '')
        }
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary
          aria-expanded={open}
          aria-controls={panelId}
          className="flex items-center gap-2.5 cursor-pointer select-none list-none
                     px-3.5 py-3 text-sm font-medium text-[var(--color-ink-primary)]
                     hover:bg-[var(--color-surface-muted)] transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40
                     [&::-webkit-details-marker]:hidden"
        >
          {locked ? (
            <Lock className="h-4 w-4 shrink-0 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
          ) : (
            <FolderClosed className="h-4 w-4 shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
          )}
          <span className="flex-1 font-serif">Documentos oficiales</span>
          <span
            className="inline-flex min-w-[1.375rem] items-center justify-center rounded-full
                       bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs font-semibold tnum
                       text-[var(--color-ink-secondary)]"
            aria-hidden="true"
          >
            {count}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[var(--color-ink-tertiary)] transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div id={panelId} className="border-t border-[var(--color-hairline)] p-3">
          {locked && (
            <p className="mb-2.5 text-xs leading-relaxed text-[var(--color-ink-tertiary)]">
              Consulta la nota simple, tasación y demás documentos del expediente
              con tu plan. La fuente pública del BOE sigue disponible.
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {/* documents[] — full rows. Unlocked: Descargar + Fuente BOE.
                Locked: teaser row (type/title + lock) with the public BOE
                source link kept when present; no cached download. */}
            {visibleDocs.map((doc) => {
              const label = doc.title?.trim() || prettifyDocType(doc.docType);

              if (locked) {
                // Teaser: always render the type/title; keep officialUrl when
                // the payload provides it (Option A crawlable BOE source).
                return (
                  <li
                    key={doc.id}
                    className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                          {prettifyDocType(doc.docType)}
                        </div>
                        <div className="flex items-center gap-1.5 font-medium text-[var(--color-ink-primary)] break-words">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                          <span className="min-w-0 break-words">{label}</span>
                        </div>
                      </div>
                      {doc.officialUrl && (
                        <a
                          href={doc.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-secondary)] shrink-0 hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink-tertiary)]/30 cursor-pointer"
                          aria-label={`Ver ${label} en el BOE`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Fuente BOE
                        </a>
                      )}
                    </div>
                  </li>
                );
              }

              // Unlocked. Prefer our cached copy; fall back to officialUrl as
              // the single primary action when there is no download.
              const primaryHref = doc.downloadUrl ?? doc.officialUrl;
              if (!primaryHref) return null;
              return (
                <li
                  key={doc.id}
                  className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                        {prettifyDocType(doc.docType)}
                      </div>
                      <div className="font-medium text-[var(--color-ink-primary)] break-words">
                        {label}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={primaryHref}
                        {...(doc.downloadUrl
                          ? { download: '' }
                          : { target: '_blank', rel: 'noopener noreferrer' })}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40 cursor-pointer"
                        aria-label={
                          doc.downloadUrl
                            ? `Descargar ${label}`
                            : `Abrir ${label} (fuente BOE)`
                        }
                      >
                        {doc.downloadUrl ? (
                          <>
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Descargar
                          </>
                        ) : (
                          <>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Abrir BOE
                          </>
                        )}
                      </a>
                      {doc.downloadUrl && doc.officialUrl && (
                        <a
                          href={doc.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink-tertiary)]/30 cursor-pointer"
                          aria-label={`Ver ${label} en el BOE`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Fuente BOE
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}

            {/* SEO-public legacy single-doc links — never gated, both states. */}
            {pdfUrl && <DocLink href={pdfUrl} label="Anuncio del BOE (PDF)" />}
            {edictUrl && <DocLink href={edictUrl} label="Edicto del juzgado (PDF)" />}
          </ul>

          {/* Upgrade CTA — only when locked. Signed-in → in-place UpgradeModal;
              signed-out → /register (bounce back to this auction). No cached
              URLs are ever placed in the DOM here. */}
          {locked &&
            (isAuthenticated ? (
              <button
                type="button"
                onClick={() => setUpgradeOpen(true)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-brand)] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40 cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Accede a los documentos con un plan
              </button>
            ) : (
              <Link
                href={registerHref}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-brand)] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40 cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Accede a los documentos con un plan
              </Link>
            ))}
        </div>
      </details>

      {isAuthenticated && locked && (
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      )}
    </>
  );
}

export default AuctionDocsDisclosure;
