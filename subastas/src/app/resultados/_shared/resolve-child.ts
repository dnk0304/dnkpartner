/**
 * Resolver for the two-segment /resultados shapes, shared by
 * `[seg1]/[seg2]/page.tsx` (page 1) and `[seg1]/[seg2]/pagina/[page]/page.tsx`.
 *
 * Extracted rather than copied (Forge 2026-08-12): the province/municipio
 * resolution here decides which URLs are 200 vs 404 vs 301, and a second copy
 * would eventually disagree with the first about which town slug is canonical —
 * which shows up as a paginated page 404ing on a hub that resolves fine.
 *
 * Behaviour is unchanged from the inline version it replaces.
 */

import {
  PROVINCE_SLUG_TO_DB_KEY,
  PROVINCE_ALIAS_TO_CANONICAL,
  provinceLabelForSlug,
} from '@/lib/seo/slugs';
import { municipalitySlugToDbName } from '@/lib/seo/page-data';
import { registroMunicipioSlugToDbName } from '@/lib/registro/registro-read';
import { resolveResultadosSeg } from '@/lib/registro/resultados-routing';
import type { RegistryOutcome } from '@/lib/registro/registro-ui';

export type ResultadosChildShape =
  | {
      kind: 'outcome-province';
      outcome: RegistryOutcome;
      outcomeSlug: string;
      provDbKey: string;
      provSlug: string;
      provLabel: string;
    }
  | {
      kind: 'province-muni';
      provDbKey: string;
      provSlug: string;
      provLabel: string;
      muniName: string;
      muniSlug: string;
      total: number;
    }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

export async function resolveResultadosChild(
  seg1: string,
  seg2: string,
): Promise<ResultadosChildShape> {
  const r1 = resolveResultadosSeg(seg1);
  if (r1.kind === 'redirect') return { kind: 'redirect', to: `${r1.to}/${seg2}` };
  if (r1.kind === 'invalid') return { kind: 'notfound' };

  if (r1.kind === 'outcome') {
    // seg2 must be a province (canonical or alias)
    const dbKey = PROVINCE_SLUG_TO_DB_KEY[seg2];
    if (dbKey) {
      return {
        kind: 'outcome-province',
        outcome: r1.outcome,
        outcomeSlug: r1.slug,
        provDbKey: dbKey,
        provSlug: seg2,
        provLabel: provinceLabelForSlug(seg2) ?? dbKey,
      };
    }
    const canon = PROVINCE_ALIAS_TO_CANONICAL[seg2];
    if (canon) return { kind: 'redirect', to: `/resultados/${r1.slug}/${canon}` };
    return { kind: 'notfound' };
  }

  // r1 = province → seg2 = municipio
  const provDbKey = r1.dbKey;
  const inRegistry = await registroMunicipioSlugToDbName(provDbKey, seg2);
  if (inRegistry) {
    return {
      kind: 'province-muni',
      provDbKey,
      provSlug: r1.slug,
      provLabel: r1.label,
      muniName: inRegistry.municipalityName,
      muniSlug: inRegistry.municipioSlug,
      total: inRegistry.total,
    };
  }
  // Resolvable-but-empty town (any-status): still render, noindex.
  const fallback = await municipalitySlugToDbName(provDbKey, seg2);
  if (fallback) {
    return {
      kind: 'province-muni',
      provDbKey,
      provSlug: r1.slug,
      provLabel: r1.label,
      muniName: fallback,
      muniSlug: seg2,
      total: 0,
    };
  }
  return { kind: 'notfound' };
}
