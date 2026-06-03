/**
 * Auction-document storage — THE CONTRACT between Ghost (scraper writer) and
 * the Next.js serve route (reader).
 *
 * Files live on a Hetzner host volume mounted into BOTH containers at
 * AUCTION_DOCS_DIR (default /data/auction-docs). The scraper container writes;
 * the Next.js app container reads. The volume is NOT in the image — Ken mounts
 * it on deploy so cached PDFs survive redeploys (mirrors auction-images).
 *
 * Per-auction layout:
 *   /data/auction-docs/<safeKey(boeId)>/<filename>.pdf
 *
 * Download docs (Nota Simple, Edicto, Anexo, Pliego) keep their BOE filename;
 * snapshots are always written to `snapshot.pdf` (single file per auction,
 * overwritten on re-scrape — see Ken's storage-growth flag).
 *
 * Lookup at request time: the serve route NEVER receives a raw path. It
 * receives an AuctionDocument.id, loads `storedPath` from the DB row, and
 * resolves that *relative* path under AUCTION_DOCS_DIR. The path is validated
 * with `isValidRelPath` to prevent traversal.
 *
 * Ghost (Python) MUST mirror this safeKey rule exactly. The mirror lives in
 * `subastas/scraper/lib/doc_storage.py` (added in the Ghost wave). Any change
 * to the safeKey normalization, the AUCTION_DOCS_DIR default, or the
 * <safeKey>/<filename> layout MUST be coordinated across both files.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export const AUCTION_DOCS_DIR =
  process.env.AUCTION_DOCS_DIR || '/data/auction-docs';

/**
 * Canonical sentinel for the single per-auction snapshot row. Ghost writes
 * this exact string in the AuctionDocument.idDoc column so the
 * @@unique([auctionId, idDoc]) constraint dedupes snapshot upserts to one row.
 */
export const SNAPSHOT_FILENAME = 'snapshot.pdf';
export const SNAPSHOT_ID_DOC_SENTINEL = 'SNAPSHOT';

/** Valid safeKey: alnum + _ . - up to 128 chars. Matches auction-images. */
const SAFE_KEY_RE = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Valid stored filename: alnum + _ . - up to 200 chars; MUST end in `.pdf`.
 * Filenames the scraper persists are derived from BOE link text — sanitize at
 * write time and validate at read time so a malformed DB row can never escape
 * the storage root.
 */
const SAFE_FILENAME_RE = /^[A-Za-z0-9_.-]{1,200}\.pdf$/;

/** Relative path = `<safeKey>/<filename.pdf>`. Validated at read time. */
const SAFE_REL_PATH_RE =
  /^[A-Za-z0-9_.-]{1,128}\/[A-Za-z0-9_.-]{1,200}\.pdf$/;

export function safeKey(boeId: string): string {
  return boeId.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 128);
}

export function isValidKey(raw: string): boolean {
  return SAFE_KEY_RE.test(raw);
}

export function isValidFilename(raw: string): boolean {
  return SAFE_FILENAME_RE.test(raw);
}

export function isValidRelPath(raw: string): boolean {
  return SAFE_REL_PATH_RE.test(raw);
}

/**
 * Sanitize a BOE-link-derived filename. Replaces every non-`[A-Za-z0-9_.-]`
 * run with `_`, truncates to 196 chars, and ensures a `.pdf` extension.
 * Ghost SHOULD use this (via the Python mirror) when persisting downloads so
 * the stored filename is guaranteed `isValidFilename`-clean.
 */
export function safeFilename(input: string): string {
  const trimmed = input.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 196);
  const base = trimmed.replace(/\.pdf$/i, '');
  return `${base || 'document'}.pdf`;
}

/** Per-auction directory under AUCTION_DOCS_DIR (absolute). */
export function docDirFor(boeId: string): string {
  return path.join(AUCTION_DOCS_DIR, safeKey(boeId));
}

/** Absolute disk path for a downloaded doc file. */
export function docDiskPathFor(boeId: string, filename: string): string {
  return path.join(AUCTION_DOCS_DIR, safeKey(boeId), filename);
}

/** Absolute disk path for the single per-auction snapshot. */
export function snapshotDiskPathFor(boeId: string): string {
  return path.join(AUCTION_DOCS_DIR, safeKey(boeId), SNAPSHOT_FILENAME);
}

/** Stored relative path (the value that goes into AuctionDocument.storedPath). */
export function relPathFor(boeId: string, filename: string): string {
  return `${safeKey(boeId)}/${filename}`;
}

/** The public download URL the API exposes per stored document. */
export function publicPathForDocId(id: string): string {
  return `/api/auction-doc/${encodeURIComponent(id)}`;
}

export async function ensureDocDir(boeId: string): Promise<void> {
  await fs.mkdir(docDirFor(boeId), { recursive: true });
}

/**
 * Read a stored doc by RELATIVE path (`<safeKey>/<filename.pdf>`). The path
 * is validated against SAFE_REL_PATH_RE before touching the disk so a
 * malformed DB row cannot escape AUCTION_DOCS_DIR. Returns null on any
 * filesystem error (including "not found").
 */
export async function readDoc(relPath: string): Promise<Buffer | null> {
  if (!isValidRelPath(relPath)) return null;
  const abs = path.join(AUCTION_DOCS_DIR, relPath);
  // Defence-in-depth: resolve and verify the absolute path is still under
  // AUCTION_DOCS_DIR. SAFE_REL_PATH_RE forbids `..` / leading `/` already,
  // but the prefix check costs nothing and survives a future regex change.
  const root = path.resolve(AUCTION_DOCS_DIR);
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return null;
  }
  try {
    return await fs.readFile(resolved);
  } catch {
    return null;
  }
}
