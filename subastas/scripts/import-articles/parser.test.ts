/**
 * Unit tests for the scaffolding-strip pass.
 *
 * Run with: npx tsx scripts/import-articles/parser.test.ts
 *
 * No test framework dependency — plain assertions, exit-code-driven so CI
 * can gate on a single tsx invocation. Prints a one-line summary per case.
 */
import { stripScaffolding } from './parser';

interface Case {
  name: string;
  input: string;
  title?: string;
  expect: string;
}

const CASES: Case[] = [
  {
    name: 'drops `## H1: …` line entirely (article main heading)',
    title: 'Cargas en una subasta',
    input: [
      '## H1: Cargas en una subasta: cuáles se cancelan y cuáles heredas',
      '',
      'Body paragraph.',
    ].join('\n'),
    expect: ['', 'Body paragraph.'].join('\n'),
  },
  {
    name: 'strips `### H2:` token, keeps heading text',
    input: '### H2: ¿Qué son las cargas de un inmueble?\n',
    expect: '### ¿Qué son las cargas de un inmueble?\n',
  },
  {
    name: 'strips `#### H3:` token, keeps heading text',
    input: '#### H3: El pliego de condiciones manda\n',
    expect: '#### El pliego de condiciones manda\n',
  },
  {
    name: 'strips featured-snippet bait parenthetical, keeps bold label',
    input: '**Definición (featured-snippet bait, ~55 palabras):**\nText.',
    expect: '**Definición:**\nText.',
  },
  {
    name: 'strips intro-style parenthetical with "palabras"',
    input: '**Intro (los primeros 100 palabras responden la query):**\nText.',
    expect: '**Intro:**\nText.',
  },
  {
    name: 'clean body passes through unchanged (no false positives)',
    input: [
      '## Cargas en una subasta',
      '',
      'Una **hipoteca** (garantía de un préstamo sobre el inmueble) pesa sobre el bien.',
      '',
      '- Item one',
      '- Item two',
      '',
      '> A regular blockquote.',
    ].join('\n'),
    expect: [
      '## Cargas en una subasta',
      '',
      'Una **hipoteca** (garantía de un préstamo sobre el inmueble) pesa sobre el bien.',
      '',
      '- Item one',
      '- Item two',
      '',
      '> A regular blockquote.',
    ].join('\n'),
  },
  {
    name: 'does NOT strip parenthetical without SEO-process language',
    input: '**Hipoteca (garantía de un préstamo):** Texto.',
    expect: '**Hipoteca (garantía de un préstamo):** Texto.',
  },
];

let failed = 0;
for (const c of CASES) {
  const got = stripScaffolding(c.input, c.title);
  const ok = got === c.expect;
  if (!ok) {
    failed++;
    console.log(`FAIL: ${c.name}`);
    console.log(`  expect: ${JSON.stringify(c.expect)}`);
    console.log(`  got:    ${JSON.stringify(got)}`);
  } else {
    console.log(`ok   : ${c.name}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed}/${CASES.length} cases failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} cases passed.`);
process.exit(0);
