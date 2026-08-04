/**
 * Run: npx tsx src/lib/geo/cp-municipality.test.ts   (exit code is the gate)
 *
 * Covers the two things a downstream URL build is allowed to rely on:
 *   1. the resolver degrades gracefully on every hostile input shape;
 *   2. the generated table itself is internally consistent — no conflicted or
 *      province-mismatched postcode ever leaked into the runtime entries.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { municipalityKey } from './municipality-key';
import {
  cpMunicipalityName,
  cpTableSize,
  normalizePostalCode,
  resolveCpMunicipality,
} from './cp-municipality';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
  }
}

const report = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../data/cp-municipality-report.json'), 'utf8'),
);
const entries = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../data/cp-municipality.json'), 'utf8'),
).entries as Record<string, { municipality: string; ine: string; support: number }>;

console.log('municipalityKey');
check('folds punctuation', municipalityKey('Vitoria-Gasteiz') === municipalityKey('Vitoria Gasteiz'));
check('folds accents', municipalityKey('Rubí') === municipalityKey('Rubi'));
check(
  'un-inverts the INE trailing article',
  municipalityKey('Coruña, A') === municipalityKey('A Coruña'),
);
check(
  'does NOT fold a typo onto the real name',
  municipalityKey('Vitoria-Gaseiz') !== municipalityKey('Vitoria-Gasteiz'),
);
check('empty input is empty key', municipalityKey(null) === '' && municipalityKey('  ') === '');
check(
  'a comma that is not an article is left alone',
  municipalityKey('Jerez, Cadiz') !== municipalityKey('Cadiz Jerez'),
);

console.log('normalizePostalCode');
check('accepts 5 digits', normalizePostalCode('04700') === '04700');
check('trims', normalizePostalCode('  04700 ') === '04700');
check('rejects 4 digits', normalizePostalCode('4700') === null);
check('rejects 6 digits', normalizePostalCode('047001') === null);
check('rejects prefixed', normalizePostalCode('ES-04700') === null);
check('rejects null/undefined', normalizePostalCode(null) === null && normalizePostalCode(undefined) === null);
check('rejects non-string', normalizePostalCode(4700 as unknown as string) === null);

console.log('resolveCpMunicipality — graceful degradation');
check('unknown postcode is unmapped, not a throw', resolveCpMunicipality('99999').status === 'unmapped');
check('junk is unmapped', resolveCpMunicipality('nope').status === 'unmapped');
check('null is unmapped', resolveCpMunicipality(null).status === 'unmapped');
check('empty is unmapped', resolveCpMunicipality('').status === 'unmapped');
check(
  'prototype keys cannot leak an entry',
  resolveCpMunicipality('constructor').status === 'unmapped' &&
    resolveCpMunicipality('__proto__').status === 'unmapped',
);
check('name helper returns null when unmapped', cpMunicipalityName('99999') === null);

console.log('resolveCpMunicipality — a known mapping');
const someCp = Object.keys(entries)[0];
const resolved = resolveCpMunicipality(someCp);
check(
  'mapped postcode resolves with full provenance',
  resolved.status === 'mapped' &&
    typeof resolved.municipality === 'string' &&
    /^[0-9]{5}$/.test(resolved.ine) &&
    resolved.support >= 1,
  resolved,
);

console.log('table integrity');
check('table is non-empty', cpTableSize() > 1000, cpTableSize());
check(
  'every key is a 5-digit postcode',
  Object.keys(entries).every((k) => /^[0-9]{5}$/.test(k)),
);
check(
  'every entry has a 5-digit INE code',
  Object.values(entries).every((e) => /^[0-9]{5}$/.test(e.ine)),
);
check(
  'NO conflicted postcode leaked into the runtime table',
  Object.keys(report.conflicts).every((cp) => !(cp in entries)),
);
check(
  'NO province-mismatched postcode leaked into the runtime table',
  Object.keys(report.provinceMismatch).every((cp) => !(cp in entries)),
);
check(
  'NO unresolved postcode leaked into the runtime table',
  Object.keys(report.unresolved).every((cp) => !(cp in entries)),
);
check(
  'every mapped postcode agrees with its INE province code',
  Object.entries(entries).every(([cp, e]) => cp.slice(0, 2) === e.ine.slice(0, 2)),
);
check(
  'the four buckets partition the postcodes seen — nothing double-counted or lost',
  Object.keys(entries).length +
    Object.keys(report.conflicts).length +
    Object.keys(report.provinceMismatch).length +
    Object.keys(report.unresolved).length ===
    report.summary.postcodes.seen,
);
check(
  'the report records the quarantine table it excluded',
  report.summary.quarantineTable === 'geo_quarantine_20260803' &&
    report.summary.universe.excludedQuarantined > 0,
);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
