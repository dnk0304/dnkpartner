/**
 * lib/factory/xlsx.ts — zero-dependency OOXML (.xlsx) workbook writer.
 *
 * WHY THIS EXISTS (factory Stage-3 working-artifacts, brief 2026-06-19):
 * The factory's Stage-3 BUILD emitted markdown only. A head-to-head proved that
 * for a COMPUTATIONAL product (e.g. a Divorce Organizer with an equalization
 * calculator), a static doc loses to a real Excel workbook with LIVE formulas
 * that computes the answer. This module renders a typed sheet spec to a valid
 * `.xlsx` byte Buffer with live `<f>` formula cells (Excel/LibreOffice compute
 * them on open) — NO npm dependency, Node built-ins only (`zlib`, `Buffer`).
 *
 * A `.xlsx` is a ZIP of XML parts. We:
 *   - emit minimal valid OOXML parts (Content_Types, rels, workbook, sheets,
 *     styles) using INLINE strings (`t="inlineStr"`) — simpler than a
 *     sharedStrings part and opens clean in Excel/LibreOffice;
 *   - write formula cells as `<c r="B10"><f>SUM(B2:B9)</f></c>` (live), with an
 *     optional cached `<v>0</v>` so a non-recalculating viewer still shows
 *     something — Excel recomputes on open via fullCalcOnLoad;
 *   - pack the parts into a ZIP using the STORE method (compression 0). Store is
 *     a valid ZIP that Excel opens fine and sidesteps any deflate size/CRC
 *     mismatch risk. Workbooks here are small (a few KB), so store is the right
 *     trade: maximal correctness over a few KB of compression.
 *
 * PURE + SYNCHRONOUS + NO I/O. The caller writes the bytes / base64.
 */

import { deflateRawSync } from 'node:zlib';

// ─── Public surface (keep tiny + typed) ──────────────────────────────────────

/** Cell style buckets → a fixed cellXfs index (see STYLE_INDEX below). */
export type CellStyle = 'header' | 'input' | 'formula' | 'label' | 'money';

export interface SheetCell {
  /** Literal value: number → numeric cell; string → inline-string cell. */
  v?: string | number;
  /** Formula WITHOUT a leading '=' (e.g. "SUM(B2:B9)"). Takes precedence over v. */
  f?: string;
  /** Visual style bucket → a styles.xml cellXfs index. */
  style?: CellStyle;
}

export interface SheetDef {
  /** Sheet tab name (sanitized to Excel's 31-char / illegal-char rules). */
  name: string;
  /** Row-major grid of cells. Ragged rows are fine (short rows are padded). */
  rows: SheetCell[][];
  /** Optional per-column widths (Excel "character" units). Index 0 = column A. */
  cols?: number[];
}

// ─── XML escaping ────────────────────────────────────────────────────────────

/** Escape the five XML predefined entities for text/attribute content. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── A1 cell references ──────────────────────────────────────────────────────

/** 0-based column index → A1 column letters (0→A, 25→Z, 26→AA, …). */
export function colLetter(col0: number): string {
  let n = Math.max(0, Math.floor(col0));
  let s = '';
  for (;;) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    if (n < 26) break;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** (row0, col0) 0-based → A1 reference (e.g. 0,0 → "A1"). */
function cellRef(row0: number, col0: number): string {
  return `${colLetter(col0)}${row0 + 1}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
//
// A tiny, fixed cellXfs table. The order here IS the index a `style` maps to.
// Keep it to a handful — do not gold-plate. styles.xml below is authored to
// match these indices exactly.
const STYLE_INDEX: Record<CellStyle, number> = {
  label: 0, // default look (also the implicit style for unstyled cells)
  header: 1, // bold white text on a dark fill
  input: 2, // amber fill — buyer types here
  formula: 3, // grey fill — locked/computed
  money: 4, // money number format #,##0.00
};

/**
 * styles.xml — 1 numFmt (money), 2 fonts (default, bold-white), 3 fills
 * (none/gray125 reserved + header + input + formula), and 5 cellXfs whose
 * indices line up with STYLE_INDEX above.
 *
 * Fills 0 and 1 are RESERVED by the OOXML spec (none, gray125) — real fills
 * start at index 2. So header→fillId 2, input→3, formula→4.
 */
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="5">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  // 0 label: default
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  // 1 header: bold white on dark fill
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  // 2 input: amber fill
  `<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>` +
  // 3 formula: grey fill
  `<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>` +
  // 4 money: #,##0.00 number format
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// ─── Sheet-name sanitation ───────────────────────────────────────────────────
//
// Excel sheet names: max 31 chars, cannot contain : \ / ? * [ ], cannot be
// blank. We also de-duplicate (Sheet, Sheet (2), …) so two specs with the same
// label don't make Excel reject the workbook.
function sanitizeSheetName(name: string, used: Set<string>): string {
  let n = (name ?? '').replace(/[:\\/?*[\]]/g, ' ').trim();
  if (!n) n = 'Sheet';
  if (n.length > 31) n = n.slice(0, 31).trim();
  let candidate = n;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = (n.slice(0, 31 - suffix.length) + suffix).trim();
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// ─── Worksheet XML ───────────────────────────────────────────────────────────

/** Is this a finite number we can write as a numeric cell? */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Strip an accidental leading '=' the model may include in a formula string. */
function normalizeFormula(f: string): string {
  return f.replace(/^\s*=+/, '').trim();
}

/** Render one cell's <c> element, or '' for a fully empty cell. */
function renderCell(cell: SheetCell | undefined, row0: number, col0: number): string {
  if (!cell) return '';
  const ref = cellRef(row0, col0);
  const styleAttr =
    cell.style && cell.style in STYLE_INDEX ? ` s="${STYLE_INDEX[cell.style]}"` : '';

  // Formula cell: live <f>. Cache <v>0 so non-recalc viewers show a value; Excel
  // overwrites it on open (fullCalcOnLoad). A numeric literal v on the same cell
  // is used as the cached value when present.
  if (typeof cell.f === 'string' && cell.f.trim()) {
    const formula = normalizeFormula(cell.f);
    const cached = isFiniteNumber(cell.v) ? cell.v : 0;
    return `<c r="${ref}"${styleAttr}><f>${xmlEscape(formula)}</f><v>${cached}</v></c>`;
  }

  // Numeric literal.
  if (isFiniteNumber(cell.v)) {
    return `<c r="${ref}"${styleAttr}><v>${cell.v}</v></c>`;
  }

  // String literal → inline string (no sharedStrings part needed).
  if (cell.v !== undefined && cell.v !== null && String(cell.v) !== '') {
    return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
      String(cell.v),
    )}</t></is></c>`;
  }

  // Empty value but styled → emit an empty styled cell so the fill still shows.
  if (styleAttr) return `<c r="${ref}"${styleAttr}/>`;
  return '';
}

/** Render one full worksheet XML part. */
function renderSheet(def: SheetDef): string {
  const rows = Array.isArray(def.rows) ? def.rows : [];

  // <cols> — optional per-column widths.
  let colsXml = '';
  if (Array.isArray(def.cols) && def.cols.length > 0) {
    const colEntries = def.cols
      .map((w, i) =>
        isFiniteNumber(w) && w > 0
          ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
          : '',
      )
      .join('');
    if (colEntries) colsXml = `<cols>${colEntries}</cols>`;
  }

  const rowsXml = rows
    .map((row, r) => {
      const cells = Array.isArray(row) ? row : [];
      const cellXml = cells.map((cell, c) => renderCell(cell, r, c)).join('');
      // Skip emitting truly empty rows to keep the part lean.
      if (!cellXml) return '';
      return `<row r="${r + 1}">${cellXml}</row>`;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    `</worksheet>`
  );
}

// ─── Workbook + rels + content-types ─────────────────────────────────────────

function renderContentTypes(sheetCount: number): string {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheetOverrides +
    `</Types>`
  );
}

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

function renderWorkbook(names: string[]): string {
  // calcPr fullCalcOnLoad="1" forces Excel/LibreOffice to recompute every
  // formula when the file opens — this is what makes the cached <v>0 irrelevant
  // and the formulas truly LIVE on first open.
  const sheets = names
    .map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheets}</sheets>` +
    `<calcPr calcId="0" fullCalcOnLoad="1"/>` +
    `</workbook>`
  );
}

function renderWorkbookRels(sheetCount: number): string {
  const sheetRels = Array.from({ length: sheetCount }, (_, i) =>
    `<Relationship Id="rId${i + 1}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
    `Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  // styles rel id continues after the sheet ids.
  const stylesId = sheetCount + 1;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheetRels +
    `<Relationship Id="rId${stylesId}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ` +
    `Target="styles.xml"/>` +
    `</Relationships>`
  );
}

// ─── ZIP container (deflate, with correct CRC32 + sizes) ─────────────────────
//
// A .xlsx is a standard ZIP. We build it by hand: a local file header + the
// (deflated) data per part, then a central directory, then the EOCD. We use
// `zlib.deflateRawSync` (raw DEFLATE, ZIP method 8) and fall back to STORE
// (method 0) for any part where deflate doesn't actually shrink it — both are
// valid and Excel opens either. CRC32 is computed over the UNCOMPRESSED bytes.

/** Precomputed CRC32 table (IEEE polynomial 0xEDB88320). */
const CRC_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC32 of a Buffer (unsigned 32-bit). */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer; // uncompressed bytes
}

/**
 * Assemble a ZIP archive from in-memory entries. Each entry is independently
 * deflated; if deflate doesn't shrink it, it's stored. Headers carry the real
 * CRC32 and both compressed + uncompressed sizes (no data-descriptor / bit-3).
 */
function buildZip(entries: ZipEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const uncompressedSize = entry.data.length;

    // Try DEFLATE; fall back to STORE if it doesn't help (or empty part).
    const deflated = uncompressedSize > 0 ? deflateRawSync(entry.data) : Buffer.alloc(0);
    const useDeflate = deflated.length > 0 && deflated.length < uncompressedSize;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : entry.data;
    const compressedSize = payload.length;

    // ── Local file header (signature 0x04034b50) ──
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // general-purpose flags (none; no bit-3)
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01-ish, valid constant)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra-field length
    localChunks.push(local, nameBuf, payload);

    // ── Central directory record (signature 0x02014b50) ──
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0x21, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    centralChunks.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const localData = Buffer.concat(localChunks);

  // ── End of central directory (signature 0x06054b50) ──
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // central dir size
  eocd.writeUInt32LE(localData.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localData, centralDir, eocd]);
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Render a set of sheets to a valid `.xlsx` byte Buffer with LIVE formulas.
 *
 * - At least one sheet is required (an empty workbook is invalid OOXML); if the
 *   caller passes none, a single empty "Sheet1" is emitted so the result still
 *   opens rather than throwing.
 * - Sheet names are sanitized + de-duplicated to satisfy Excel's naming rules.
 * - Formula cells become live `<f>`; Excel recomputes them on open
 *   (fullCalcOnLoad), so the cached `<v>0` is only a fallback for dumb viewers.
 *
 * Pure + synchronous + no I/O. The caller persists the bytes / base64.
 */
export function buildXlsx(sheets: SheetDef[]): Buffer {
  const input = Array.isArray(sheets) && sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }];

  const used = new Set<string>();
  const names: string[] = [];
  const sheetParts: ZipEntry[] = [];

  input.forEach((def, i) => {
    const safeName = sanitizeSheetName(def?.name ?? `Sheet${i + 1}`, used);
    names.push(safeName);
    sheetParts.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(renderSheet({ name: safeName, rows: def?.rows ?? [], cols: def?.cols }), 'utf8'),
    });
  });

  const entries: ZipEntry[] = [
    // [Content_Types].xml MUST be the first entry in the archive.
    { name: '[Content_Types].xml', data: Buffer.from(renderContentTypes(input.length), 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(renderWorkbook(names), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(renderWorkbookRels(input.length), 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES_XML, 'utf8') },
    ...sheetParts,
  ];

  return buildZip(entries);
}
