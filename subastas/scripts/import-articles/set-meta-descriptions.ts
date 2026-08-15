/**
 * Wire the 14 missing `<meta name="description">` values for /guia articles.
 *
 * Copy source: SAGA, `META-DESCRIPTIONS-14.md` (2026-08-15), brief
 * `DISPATCH-BRIEF-SAGA-14-meta-descriptions.md`. The strings below are
 * VERBATIM — Forge does not edit Saga's copy. Char counts were re-verified
 * independently (all 152–160, none over 160, all 14 matched her stated count).
 *
 * Usage (inside the app container, which has tsx + @prisma/client + src/):
 *   tsx scripts/import-articles/set-meta-descriptions.ts --dry-run   # report only
 *   tsx scripts/import-articles/set-meta-descriptions.ts             # write
 *
 * --dry-run : SELECT only, NO writes. ALWAYS run first and confirm
 *             "would set = 14".
 *
 * SAFETY — this is the whole point of the script's shape:
 *   • It writes ONLY the 14 slugs named below, by exact slug match.
 *   • It writes ONLY where metaDescription IS NULL or blank. A slug that
 *     already has a description is reported as ALREADY-SET and left alone —
 *     never overwritten. That is what keeps "the other 41 are unchanged" a
 *     property of the code rather than something we hope for, and it is also
 *     what makes a second run a no-op.
 *   • It censuses non-null descriptions before and after and FAILS if the
 *     delta is anything other than the number of rows it just set. If some
 *     other writer touches the table mid-run, this run reports it loudly
 *     instead of silently taking credit for it.
 *
 * Re-runnable: a second run finds 0 blank rows among the 14 and does nothing.
 */
import { prisma } from '../../src/lib/prisma';

/** slug → description. VERBATIM from Saga. Do not reflow, retrim or suffix. */
const DESCRIPTIONS: Record<string, string> = {
  'subastas-hacienda-como-funcionan':
    'Las subastas de Hacienda se rigen por la normativa tributaria, no por la LEC: requisitos, depósito del 5%, tramos de puja y el paso a paso en subastas.boe.es.',
  'subastas-hacienda-real-decreto-117-2024':
    'El RD 117/2024 trajo puja mínima del 10% del tipo y coeficientes 0,8 y 0,6 en subastas desiertas de Hacienda. Te contamos qué cambia, qué no y cómo te afecta.',
  'subastas-notariales':
    'Las subastas notariales las dirige un notario, no un juzgado: ventas voluntarias, ejecución extrajudicial de hipoteca, cómo pujar y en qué se diferencian.',
  'subasta-naves-industriales-apremio':
    'En subasta de naves industriales no decide el precio final: arrendamiento vigente, licencia de actividad, fiscalidad por IVA y depósito del 20% (LEC 2025).',
  'subasta-plazas-garaje-boe':
    'La subasta de plazas de garaje es la puerta de entrada más barata: depósito del 20% con mínimo de 1.000 €, cargas, deudas de comunidad y rentabilidad real.',
  'subasta-locales-comerciales-apremio':
    'Un local comercial en subasta puede venir con inquilino incluido. Arrendamiento, licencia de actividad, cargas, ITP o IVA y el depósito del 20% (LEC 2025).',
  'subasta-fincas-rusticas-apremio':
    'En subasta de fincas rústicas manda la due diligence: tanteo y retracto de colindantes, lindes, accesos, agua y usos. Depósito del 20% tras la LEC 2025.',
  'subastas-judiciales-espana':
    'Las subastas judiciales son la venta forzosa que ordena un juzgado: depósito del 20% con mínimo 1.000 €, 20 días naturales de puja y qué pasa después de ganar.',
  'subastas-concursales':
    'En las subastas concursales manda el plan de liquidación y la administración concursal: qué bienes salen, cómo se puja y qué revisar antes. Con datos del BOE.',
  'subastas-seguridad-social-paso-a-paso':
    'Las subastas de la Seguridad Social siguen la normativa recaudatoria de la TGSS: depósito habitual del 25% del tipo, requisitos y cómo pujar en subastas.boe.es.',
  'tablon-anuncios-subastas-seguridad-social':
    'Las subastas de la TGSS se anuncian en su tablón electrónico y se pujan en el BOE. Así se leen las dos fuentes para localizar los lotes antes que nadie.',
  'subasta-trasteros-via-apremio':
    'Antes de pujar por un trastero, la pregunta clave: ¿es finca registral independiente o cuota indivisa? Depósito del 20% con mínimo 1.000 €, cargas y comunidad.',
  'subasta-ejecucion-hipotecaria':
    'La ejecución hipotecaria tiene reglas propias: depósito del 20%, 20 días de subasta y suelos de adjudicación reforzados si es la vivienda habitual del deudor.',
  'subasta-division-cosa-comun':
    'Nadie está obligado a seguir en un proindiviso. Cuándo un juez ordena subastar el bien, cómo se reparte el dinero y cómo pujar (los copropietarios también).',
};

const EXPECTED_COUNT = 14;
/** Google truncates well before this; Ken's rule is bounce, never silently trim. */
const MAX_LEN = 160;

/**
 * Guard the copy at load time. If someone edits a string above and pushes it
 * over the limit, this stops the run rather than shipping a truncated snippet.
 */
function assertCopyIsSane(): void {
  const slugs = Object.keys(DESCRIPTIONS);
  if (slugs.length !== EXPECTED_COUNT) {
    throw new Error(`expected ${EXPECTED_COUNT} descriptions, found ${slugs.length}`);
  }
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const [slug, desc] of Object.entries(DESCRIPTIONS)) {
    // Count code points, not UTF-16 units — accented chars must count as 1.
    const len = [...desc].length;
    if (len > MAX_LEN) problems.push(`${slug}: ${len} chars > ${MAX_LEN}`);
    if (desc.trim() !== desc) problems.push(`${slug}: leading/trailing whitespace`);
    const dup = seen.get(desc);
    if (dup) problems.push(`${slug}: duplicate of ${dup}`);
    seen.set(desc, slug);
  }
  if (problems.length > 0) {
    throw new Error(`copy guard failed:\n  ${problems.join('\n  ')}`);
  }
}

/** How many PUBLISHED articles currently have a non-blank description. */
async function describedCount(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n
    FROM "Article"
    WHERE status = 'PUBLISHED'
      AND "metaDescription" IS NOT NULL
      AND btrim("metaDescription") <> ''`;
  return Number(rows[0].n);
}

async function main(): Promise<void> {
  assertCopyIsSane();
  const dryRun = process.argv.includes('--dry-run');
  const slugs = Object.keys(DESCRIPTIONS);

  try {
    const rows = await prisma.$queryRaw<
      { slug: string; metaDescription: string | null; status: string }[]
    >`
      SELECT slug, "metaDescription", status::text AS status
      FROM "Article"
      WHERE slug = ANY(${slugs}::text[])`;

    const found = new Map(rows.map((r) => [r.slug, r]));
    const totalBefore = await describedCount();
    console.log(
      `PUBLISHED articles with a description, before: ${totalBefore}\n` +
        `Targeting ${slugs.length} slugs.\n`,
    );

    const toSet: string[] = [];
    for (const slug of slugs) {
      const row = found.get(slug);
      if (!row) {
        console.error(`  MISSING     ${slug}  (no such Article row)`);
        process.exitCode = 3;
        continue;
      }
      if (row.status !== 'PUBLISHED') {
        console.error(`  NOT-PUBLISHED ${slug}  (status=${row.status})`);
        process.exitCode = 3;
        continue;
      }
      if (row.metaDescription && row.metaDescription.trim() !== '') {
        // Not an error — this is the idempotent re-run path — but it IS drift
        // worth seeing if it shows up on the first run.
        console.log(`  ALREADY-SET ${slug}  (left untouched)`);
        continue;
      }
      toSet.push(slug);
      console.log(`  WILL-SET    ${slug}  (${[...DESCRIPTIONS[slug]].length} chars)`);
    }

    console.log(`\nwould set = ${toSet.length}`);
    if (dryRun) {
      console.log('--dry-run: no writes performed.');
      return;
    }
    if (toSet.length === 0) {
      console.log('Nothing to do. (idempotent no-op)');
      return;
    }

    // One statement per slug, each still guarded on blankness so a concurrent
    // writer cannot be clobbered between the SELECT above and the UPDATE.
    let written = 0;
    for (const slug of toSet) {
      written += await prisma.$executeRaw`
        UPDATE "Article"
        SET "metaDescription" = ${DESCRIPTIONS[slug]}
        WHERE slug = ${slug}
          AND ("metaDescription" IS NULL OR btrim("metaDescription") = '')`;
    }
    console.log(`\nSet ${written} descriptions.`);

    const totalAfter = await describedCount();
    console.log(`PUBLISHED articles with a description, after: ${totalAfter}`);
    if (totalAfter - totalBefore !== written) {
      console.error(
        `WARNING: census delta ${totalAfter - totalBefore} != rows written ${written}. ` +
          `Another writer touched "Article" during this run — re-census before deploying.`,
      );
      process.exitCode = 4;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
