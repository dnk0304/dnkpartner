/**
 * intl-ssr-tzprobe — the DYNAMIC half of the intl-ssr gate.
 *
 * The static scan (scripts/intl-ssr-guard.ts) proves nobody WROTE an unpinned formatter. This proves
 * the pinned ones actually BEHAVE. It renders a fixed set of instants through the real exported
 * formatters and prints the result; the guard runs it twice in child processes under two different
 * `TZ` values and diffs the two outputs byte-for-byte.
 *
 * Node honours `process.env.TZ`, so `TZ=UTC` reproduces the production container and
 * `TZ=Europe/Madrid` reproduces a Spanish visitor's browser. If the two outputs differ, the SSR HTML
 * and the first client render will differ too — that difference IS the React #418. Identical output
 * means the formatters carry no host-zone dependence.
 *
 * (This catches the TIME ZONE half of the class. The ICU/CLDR-version half — Node's compound
 * date+time connector vs Chromium's — cannot be observed from Node at all; it is covered
 * structurally by the `no-datestyle-timestyle-pair` rule in the static scan, and empirically by the
 * Playwright soak in scripts/audit/.)
 *
 * Run directly to see the rendered strings:  npx tsx scripts/intl-ssr-tzprobe.ts
 */

import {
  formatDateLong,
  formatDateMed,
  formatDateShort,
  formatTime,
  formatUpdatedDayEs,
} from "../src/components/observatory/format";

// Instants chosen to sit on the boundaries where a host-zone dependence shows up: an ordinary
// midday, a value late enough that Madrid is already on the NEXT day, one just after UTC midnight
// (Madrid still on the PREVIOUS day), a year boundary, and a winter date (CET, +1) versus the
// summer ones (CEST, +2) so a DST-only bug cannot hide.
const SAMPLES = [
  "2026-08-05T08:56:00.000Z",
  "2026-08-05T23:30:00.000Z",
  "2026-08-04T00:30:00.000Z",
  "2026-12-31T23:59:00.000Z",
  "2026-01-15T23:30:00.000Z",
  "2026-01-01T00:15:00.000Z",
];

const lines: string[] = [];
for (const iso of SAMPLES) {
  for (const locale of ["es", "en"] as const) {
    lines.push(
      [
        iso,
        locale,
        formatDateLong(iso, locale),
        formatDateMed(iso, locale),
        formatDateShort(iso, locale),
        formatTime(iso, locale),
        // formatUpdatedDayEs compares against the live clock, so only its ZONE-dependent day-bucket
        // is of interest here; both children run within milliseconds of each other, which makes a
        // day-boundary straddle between them effectively impossible.
        formatUpdatedDayEs(iso, locale),
      ].join(" | "),
    );
  }
}

console.log(lines.join("\n"));
