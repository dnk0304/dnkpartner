// wave13-hotfix verify: round-trip resolveAuctionIdFromSlug(buildAuctionSlug(a)) === a.id
// for both a UUID id (legacy prod corpus) and a cuid id (new rows).

import { buildAuctionSlug, resolveAuctionIdFromSlug } from '../src/lib/seo/auction-slug.ts';

const cases = [
  {
    label: 'dashed UUID (legacy prod — the bug)',
    a: {
      id: '44787f11-11ad-4a6b-9d64-125dee2655a6',
      auctionType: 'JUDICIAL',
      province: 'BARCELONA',
      municipality: 'Hacienda Barcelona',
    },
  },
  {
    label: 'cuid (new schema default)',
    a: {
      id: 'clxz7y9q40000abcdef123456',
      auctionType: 'JUDICIAL',
      province: 'MADRID',
      municipality: 'Madrid',
    },
  },
  {
    label: 'dashed UUID with sin-municipio',
    a: {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      auctionType: 'HACIENDA',
      province: 'VALENCIA',
      municipality: null,
    },
  },
  {
    label: 'uppercase UUID hex',
    a: {
      id: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'.toLowerCase(),
      auctionType: 'JUDICIAL',
      province: 'SEVILLA',
      municipality: 'Sevilla',
    },
  },
];

let allPass = true;
for (const { label, a } of cases) {
  const slug = buildAuctionSlug(a);
  const resolved = resolveAuctionIdFromSlug(slug);
  const ok = resolved === a.id;
  if (!ok) allPass = false;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`        id       = ${a.id}`);
  console.log(`        slug     = ${slug}`);
  console.log(`        resolved = ${resolved}`);
}

// Bug-reproduction case from the brief: simulate the old behavior vs new
const buggySlug = 'hacienda-barcelona-barcelona-44787f11-11ad-4a6b-9d64-125dee2655a6';
const buggyResolved = resolveAuctionIdFromSlug(buggySlug);
const buggyExpected = '44787f11-11ad-4a6b-9d64-125dee2655a6';
const buggyOk = buggyResolved === buggyExpected;
if (!buggyOk) allPass = false;
console.log(`\n${buggyOk ? 'PASS' : 'FAIL'}  brief-repro: ${buggySlug}`);
console.log(`        resolved = ${buggyResolved}`);
console.log(`        expected = ${buggyExpected}`);

process.exit(allPass ? 0 : 1);
