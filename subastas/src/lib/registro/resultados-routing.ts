/**
 * resultados-routing — resolve the first dynamic segment of /resultados/{seg}.
 *
 * The slot is shared by outcome slugs (adjudicadas / desiertas / canceladas /
 * finalizadas-sin-resultado — 4) and province slugs (52). The two sets are
 * disjoint by construction (outcome slugs are fixed words, province slugs are
 * place names), so resolution is deterministic: outcome first, then province,
 * then province alias → 301, else invalid.
 */

import {
  PROVINCE_SLUG_TO_DB_KEY,
  PROVINCE_ALIAS_TO_CANONICAL,
  provinceLabelForSlug,
} from '@/lib/seo/slugs';
import { registryOutcomeFromSlug, type RegistryOutcome } from '@/lib/registro/registro-ui';

export type ResultadosSeg =
  | { kind: 'outcome'; outcome: RegistryOutcome; slug: string }
  | { kind: 'province'; slug: string; dbKey: string; label: string }
  | { kind: 'redirect'; to: string }
  | { kind: 'invalid' };

export function resolveResultadosSeg(seg: string): ResultadosSeg {
  if (!seg) return { kind: 'invalid' };

  const outcome = registryOutcomeFromSlug(seg);
  if (outcome) return { kind: 'outcome', outcome, slug: seg };

  const dbKey = PROVINCE_SLUG_TO_DB_KEY[seg];
  if (dbKey) {
    return { kind: 'province', slug: seg, dbKey, label: provinceLabelForSlug(seg) ?? dbKey };
  }

  const canon = PROVINCE_ALIAS_TO_CANONICAL[seg];
  if (canon) return { kind: 'redirect', to: `/resultados/${canon}` };

  return { kind: 'invalid' };
}
