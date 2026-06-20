/**
 * artifactMarkdown — turn a FactoryArtifact payload into clean, readable Markdown.
 *
 * WHY this exists: the six stages do NOT share one payload shape. Only the
 * Stage-3 "build" artifact ships a ready `{ title, markdown }`. The other five
 * (niche_brief, blueprint, audit_report, brand_package, channel_recommendation)
 * persist STRUCTURED JSON — rich, real content, but no markdown field. To give
 * Dennis one readable document per stage AND one honest .md download, we
 * serialize each known shape into Markdown here, and fall back to a faithful
 * pretty-print for anything we don't recognise (never fabricate, never hide
 * fields). The viewer renders this Markdown; the download writes the very same
 * bytes — so what he reads is exactly what he downloads.
 *
 * Pure + dependency-free. Defensive at every edge: payloads are opaque Json.
 */

import type { Artifact } from './types';

// ─── Human stage labels (the brief's exact copy) ─────────────────────────────

export interface StageView {
  /** Big human title shown in the viewer + as the doc H1 fallback. */
  label: string;
  /** One-line plain-English subtitle. */
  blurb: string;
  /** Optional honesty note rendered as a callout (e.g. Stage 3 is a sample). */
  note?: string;
  /** True for the Blueprint — the viewer features it. */
  feature?: boolean;
}

export const STAGE_VIEW: Record<number, StageView> = {
  1: {
    label: 'Niche & validation',
    blurb: 'The angles we scored and the one we picked — with the demand evidence behind it.',
  },
  2: {
    label: 'Blueprint — your guide to build & launch it',
    blurb: 'The how-to: what to build, who it is for, how to price and position it.',
    feature: true,
  },
  3: {
    label: 'Product — the finished files',
    blurb:
      'The full product the buyer gets. Read it here, then download the document — and the working spreadsheet when the product comes with one.',
  },
  4: {
    label: 'Quality audit',
    blurb: 'The expert review: what passed, what to fix before you ship.',
  },
  5: { label: 'Brand & naming', blurb: 'Product name, store name, tagline and the reasoning.' },
  6: {
    label: 'Where & how to sell it',
    blurb: 'The recommended channel and the go-to-market reasoning.',
  },
};

export function stageView(stage: number): StageView {
  return STAGE_VIEW[stage] ?? { label: `Stage ${stage}`, blurb: '' };
}

/**
 * The honesty note to render for a SPECIFIC artifact (callout above the body).
 *
 * Stage 3 now ships the FULL product, so there is no "sample / proof" caveat any
 * more. We add a note for Stage 3 in ONE case only: a NON-computational product
 * (no live-formula workbook) — there it's a document-only deliverable, and we say
 * so plainly rather than implying a spreadsheet that doesn't exist. A
 * computational Stage-3 build (markdown + working .xlsx) gets no note. Every
 * other stage falls back to its static StageView.note (currently none).
 */
export function stageNote(artifact: Artifact): string | undefined {
  if (artifact.stage === 3) {
    const p = artifact.payload;
    const wb = isRecord(p) && isRecord(p.workbook) ? p.workbook : undefined;
    const isComputational = wb?.computational === true;
    if (!isComputational) {
      return 'This product is a document — there is no spreadsheet to download for it.';
    }
    return undefined;
  }
  return stageView(artifact.stage).note;
}

// ─── narrowing helpers ───────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}
function numOf(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Convert a slug/camelCase key into a Title Case label ("storeName" → "Store Name"). */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── per-stage serializers ───────────────────────────────────────────────────

function mdNicheBrief(p: Record<string, unknown>): string {
  const out: string[] = [];
  if (str(p.refinedNiche)) out.push(`**Refined niche:** ${p.refinedNiche}`, '');
  if (str(p.recommendedAngle)) out.push(`**Recommended angle:** ${p.recommendedAngle}`, '');

  const angles = Array.isArray(p.angles) ? p.angles : [];
  if (angles.length) {
    out.push('## Scored angles', '');
    for (const raw of angles) {
      if (!isRecord(raw)) continue;
      const name = str(raw.name) ?? 'Untitled angle';
      const isRec = str(p.recommendedAngle) === name;
      out.push(`### ${name}${isRec ? '  ⭐ recommended' : ''}`, '');
      const s = isRecord(raw.scores) ? raw.scores : {};
      const rows: Array<[string, number | undefined]> = [
        ['Pain', numOf(s.pain)],
        ['Worsening', numOf(s.worsening)],
        ['Purchasing power', numOf(s.purchasingPower)],
        ['Speed to value', numOf(s.speedToValue)],
        ['Competition gap', numOf(s.competitionGap)],
      ].filter(([, v]) => v !== undefined) as Array<[string, number]>;
      if (rows.length) {
        out.push('| Dimension | Score (1–10) |', '|---|:---:|');
        for (const [k, v] of rows) out.push(`| ${k} | ${v} |`);
        out.push('');
      }
      if (str(raw.demandEvidence)) out.push(`**Demand evidence:** ${raw.demandEvidence}`, '');
    }
  }
  if (str(p.reasoning)) out.push('## Why this angle', '', p.reasoning as string, '');
  return out.join('\n');
}

function mdBlueprint(p: Record<string, unknown>): string {
  const out: string[] = [];
  const section = (heading: string, obj: unknown) => {
    if (!isRecord(obj)) return;
    out.push(`## ${heading}`, '');
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) {
        out.push(`### ${humanizeKey(k)}`, '');
        for (const item of v) if (str(item)) out.push(`- ${item}`);
        out.push('');
      } else if (str(v)) {
        out.push(`**${humanizeKey(k)}:** ${v}`, '');
      } else if (isRecord(v)) {
        out.push(`### ${humanizeKey(k)}`, '');
        for (const [k2, v2] of Object.entries(v)) if (str(v2)) out.push(`**${humanizeKey(k2)}:** ${v2}`, '');
        out.push('');
      }
    }
  };
  section('The offer', p.offer);
  section('The market', p.market);
  section('Production', p.production);
  // Any extra top-level keys we didn't name explicitly.
  for (const [k, v] of Object.entries(p)) {
    if (['offer', 'market', 'production'].includes(k)) continue;
    if (str(v)) out.push(`## ${humanizeKey(k)}`, '', v as string, '');
    else if (isRecord(v) || Array.isArray(v)) section(humanizeKey(k), v);
  }
  return out.join('\n');
}

function mdAuditReport(p: Record<string, unknown>): string {
  const out: string[] = [];
  if (str(p.verdict)) out.push(`**Verdict:** ${p.verdict}`, '');
  const deltas = Array.isArray(p.deltas) ? p.deltas : [];
  if (deltas.length) {
    out.push('## What to fix before you ship', '');
    deltas.forEach((d, i) => {
      if (str(d)) out.push(`${i + 1}. ${d}`, '');
    });
  }
  const benchmarks = p.benchmarks;
  if (Array.isArray(benchmarks) && benchmarks.length) {
    out.push('## Benchmarks', '');
    for (const b of benchmarks) {
      if (str(b)) out.push(`- ${b}`);
      else if (isRecord(b)) {
        const parts = Object.entries(b)
          .filter(([, v]) => str(v) || numOf(v) !== undefined)
          .map(([k, v]) => `**${humanizeKey(k)}:** ${v}`);
        if (parts.length) out.push(`- ${parts.join(' · ')}`);
      }
    }
    out.push('');
  } else if (isRecord(benchmarks)) {
    out.push('## Benchmarks', '');
    for (const [k, v] of Object.entries(benchmarks)) if (str(v) || numOf(v) !== undefined) out.push(`**${humanizeKey(k)}:** ${v}`, '');
  }
  mdCompetitorScan(p.competitorScan, out);
  return out.join('\n');
}

/**
 * Compact, HONEST text rendering of the Stage-4 competitor scan so the
 * print/PDF + .md export carry the edge too — doc-only, matching the existing
 * print-honesty pattern. Renders nothing when the scan is absent. When the
 * source is model analysis (`llm-analysis`) the heading says so plainly — the
 * document must not imply live scraped competitor data any more than the UI does.
 */
function mdCompetitorScan(cs: unknown, out: string[]): void {
  if (!isRecord(cs)) return;

  const edgeThesis = str(cs.edgeThesis) ? (cs.edgeThesis as string).trim() : '';
  const edgeMoves = Array.isArray(cs.edgeMoves) ? cs.edgeMoves.filter(str) : [];
  const openGaps = Array.isArray(cs.openGaps) ? cs.openGaps.filter(str) : [];
  const redTeam = Array.isArray(cs.redTeamChallenges) ? cs.redTeamChallenges.filter(str) : [];
  const stronger = Array.isArray(cs.whereCompetitorsAreStronger)
    ? cs.whereCompetitorsAreStronger.filter(str)
    : [];
  const competitors = Array.isArray(cs.competitors) ? cs.competitors.filter(isRecord) : [];

  // Honest emptiness guard — mirror readCompetitorScan: nothing to show → nothing.
  const hasCompetitors = competitors.some((c) => str(c.name));
  if (!edgeThesis && !edgeMoves.length && !hasCompetitors) return;

  const confidence = numOf(cs.confidence);
  const isLive = cs.dataSource === 'dnk-trends';
  const sourceLabel = isLive
    ? 'dnk-trends live market data'
    : 'LLM market analysis (model analysis — not live scraped competitor data)';

  out.push('## Competitive Edge', '');
  const meta: string[] = [`_Source: ${sourceLabel}._`];
  if (confidence !== undefined) meta.push(`_Edge confidence: ${Math.round(confidence)}/100._`);
  out.push(meta.join(' '), '');

  if (edgeThesis) out.push(`**The edge:** ${edgeThesis}`, '');

  if (edgeMoves.length) {
    out.push('### Moves that win it', '');
    for (const m of edgeMoves) out.push(`- ${m}`);
    out.push('');
  }

  if (openGaps.length) {
    out.push('### Gaps we exploit', '');
    for (const g of openGaps) out.push(`- ${g}`);
    out.push('');
  }

  if (hasCompetitors) {
    out.push('### The field', '');
    for (const c of competitors) {
      const name = str(c.name) ? (c.name as string).trim() : '';
      if (!name) continue;
      const price = str(c.priceRange) ? ` (${(c.priceRange as string).trim()})` : '';
      out.push(`**${name}**${price}`);
      if (str(c.whatTheyOffer)) out.push(`- Offers: ${(c.whatTheyOffer as string).trim()}`);
      const strengths = Array.isArray(c.strengths) ? c.strengths.filter(str) : [];
      const weaknesses = Array.isArray(c.weaknesses) ? c.weaknesses.filter(str) : [];
      if (strengths.length) out.push(`- Their strength: ${strengths.join('; ')}`);
      if (weaknesses.length) out.push(`- Our opening: ${weaknesses.join('; ')}`);
      out.push('');
    }
  }

  // The spar — the honest counter-case the edge survived.
  if (redTeam.length || stronger.length) {
    out.push('### How the edge was stress-tested', '');
    out.push(
      '_Two experts sparred — one argued the edge, one red-teamed it. This is what the thesis survived._',
      '',
    );
    if (redTeam.length) {
      out.push('**Challenges it answered:**', '');
      for (const r of redTeam) out.push(`- ${r}`);
      out.push('');
    }
    if (stronger.length) {
      out.push('**Where competitors are honestly stronger:**', '');
      for (const s of stronger) out.push(`- ${s}`);
      out.push('');
    }
  }
}

function mdBrandPackage(p: Record<string, unknown>): string {
  const out: string[] = [];
  if (str(p.brandName)) out.push(`## Brand name: ${p.brandName}`, '');
  if (str(p.storeName)) out.push(`**Store name:** ${p.storeName}`, '');
  if (str(p.tagline)) out.push(`**Tagline:** ${p.tagline}`, '');
  out.push('');

  const altList = (heading: string, v: unknown) => {
    const arr = Array.isArray(v) ? v.filter(str) : [];
    if (arr.length) {
      out.push(`### ${heading}`, '');
      for (const a of arr) out.push(`- ${a}`);
      out.push('');
    }
  };
  altList('Brand name alternatives', p.brandNameAlternatives);
  altList('Store name alternatives', p.storeNameAlternatives);

  if (isRecord(p.visualIdentity)) {
    out.push('### Visual identity', '');
    for (const [k, v] of Object.entries(p.visualIdentity)) {
      if (str(v)) out.push(`**${humanizeKey(k)}:** ${v}`, '');
      else if (Array.isArray(v)) out.push(`**${humanizeKey(k)}:** ${v.filter(str).join(', ')}`, '');
    }
  } else if (str(p.visualIdentity)) {
    out.push('### Visual identity', '', p.visualIdentity as string, '');
  }
  if (str(p.rationale)) out.push('## Reasoning', '', p.rationale as string, '');
  return out.join('\n');
}

function mdChannel(p: Record<string, unknown>): string {
  const out: string[] = [];
  if (str(p.recommendedChannel)) out.push(`## Recommended channel: ${p.recommendedChannel}`, '');
  const comp = p.comparison;
  if (Array.isArray(comp) && comp.length) {
    out.push('## Channel comparison', '');
    for (const c of comp) {
      if (str(c)) out.push(`- ${c}`);
      else if (isRecord(c)) {
        const name = str(c.channel) ?? str(c.name) ?? 'Channel';
        const rest = Object.entries(c)
          .filter(([k]) => k !== 'channel' && k !== 'name')
          .filter(([, v]) => str(v) || numOf(v) !== undefined)
          .map(([k, v]) => `**${humanizeKey(k)}:** ${v}`);
        out.push(`- **${name}** — ${rest.join(' · ')}`);
      }
    }
    out.push('');
  } else if (isRecord(comp)) {
    out.push('## Channel comparison', '');
    for (const [k, v] of Object.entries(comp)) if (str(v)) out.push(`**${humanizeKey(k)}:** ${v}`, '');
  }
  if (str(p.reasoning)) out.push('## Reasoning', '', p.reasoning as string, '');
  return out.join('\n');
}

/** Last-resort faithful render for an unknown shape — never drops data. */
function mdGeneric(p: unknown): string {
  if (typeof p === 'string') return p;
  if (!isRecord(p)) return '```json\n' + JSON.stringify(p, null, 2) + '\n```';
  const out: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (str(v)) out.push(`## ${humanizeKey(k)}`, '', v as string, '');
    else if (Array.isArray(v)) {
      out.push(`## ${humanizeKey(k)}`, '');
      for (const item of v) {
        if (str(item)) out.push(`- ${item}`);
        else out.push('```json', JSON.stringify(item, null, 2), '```');
      }
      out.push('');
    } else if (isRecord(v)) {
      out.push(`## ${humanizeKey(k)}`, '');
      for (const [k2, v2] of Object.entries(v)) if (str(v2)) out.push(`**${humanizeKey(k2)}:** ${v2}`, '');
      out.push('');
    }
  }
  return out.join('\n');
}

// ─── public API ──────────────────────────────────────────────────────────────

/** The artifact's own title if it has one, else a stage-based fallback. */
export function artifactTitle(artifact: Artifact): string {
  const p = artifact.payload;
  if (isRecord(p) && str(p.title)) return p.title as string;
  return stageView(artifact.stage).label;
}

/**
 * The artifact body as Markdown. Stage 3 already carries markdown; the rest are
 * serialized from their structured payloads. Returns '' only for a truly empty
 * payload (the viewer shows an honest empty state then).
 */
export function artifactToMarkdown(artifact: Artifact): string {
  const p = artifact.payload;

  // Stage-3 build (and anything else that already shipped markdown).
  if (isRecord(p) && str(p.markdown)) return (p.markdown as string).trim();

  if (!isRecord(p)) return mdGeneric(p).trim();

  let body: string;
  switch (artifact.kind) {
    case 'niche_brief':
      body = mdNicheBrief(p);
      break;
    case 'blueprint':
      body = mdBlueprint(p);
      break;
    case 'audit_report':
      body = mdAuditReport(p);
      break;
    case 'brand_package':
      body = mdBrandPackage(p);
      break;
    case 'channel_recommendation':
      body = mdChannel(p);
      break;
    default:
      body = mdGeneric(p);
  }
  body = body.trim();
  return body || mdGeneric(p).trim();
}

/** A full standalone .md document (H1 title + body) for download. */
export function artifactToMarkdownDocument(artifact: Artifact): string {
  const title = artifactTitle(artifact);
  const body = artifactToMarkdown(artifact);
  return `# ${title}\n\n${body}\n`;
}

/** Safe, human, filesystem-friendly filename from the artifact title. */
export function artifactFilename(artifact: Artifact): string {
  const base = artifactTitle(artifact)
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const prefix = String(artifact.stage).padStart(2, '0');
  return `${prefix} ${base || `stage-${artifact.stage}`}.md`;
}

/** One combined .md document covering every stage, ordered by stage. */
export function combinedMarkdownDocument(seed: string, artifacts: Artifact[]): string {
  // The Stage-1 candidate set serializes only as raw JSON (mdGeneric); the
  // on-screen recap renders it as cards instead, and the chosen-niche brief
  // carries the readable Stage-1 record — so it's excluded from the combined .md
  // to keep the export free of the JSON dump we removed from the UI.
  const ordered = [...artifacts]
    .filter((a) => a.kind !== 'niche_candidates')
    .sort((a, b) => a.stage - b.stage);
  const parts: string[] = [`# ${seed}`, '', '_Product Factory — full project export._', ''];
  for (const a of ordered) {
    const v = stageView(a.stage);
    parts.push('---', '', `# Stage ${a.stage} — ${v.label}`, '');
    const note = stageNote(a);
    if (note) parts.push(`> ${note}`, '');
    parts.push(`## ${artifactTitle(a)}`, '', artifactToMarkdown(a), '');
  }
  return parts.join('\n') + '\n';
}

export function combinedFilename(seed: string): string {
  const base = seed
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${base || 'project'} — full project.md`;
}
