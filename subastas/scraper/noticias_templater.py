#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
noticias_templater.py — deterministic phrase-variety templater for the monthly
per-province recap articles (Forge, 2026-07-20).

Consumes SAGA's template pack (noticias_prose_pack.json) EXACTLY per its
_how_to_use / _conditions / _placeholders:

  * One article = TITLE + META + [opening] + ([low_activity] | [outcome]+[price]
    +[rank]) + [closing].
  * Each slot is CONDITION -> list of interchangeable variants. We evaluate the
    condition, then pick a variant DETERMINISTICALLY:
        idx = seeded_hash(province_slug + period + slot_name + lang) % len(variants)
    A different slot_name per slot (and the lang suffix) keeps the same province
    off the same array index in every slot / language.
  * es and en are picked INDEPENDENTLY (own seed) — parallel in count only.

No LLM, no network, no randomness — same inputs always yield the same article,
which is the whole point of a job that must run unattended every month.

SAGA's four flagged items, handled HERE:
  (1) {mes_anterior}: derived by the CALLER (scheduler) and passed in stats.
  (2) {pct_vendidas}: computed by the CALLER as round(sold/totalConcluded*100).
  (3) no top-lot variable: there is no notable-lot slot in the pack, so nothing
      to render — we simply never emit one.
  (4) CANCELADA: deliberately excluded from the copy (never referenced by any
      slot; it is carried in statsJson for charts only).

Pure stdlib. Importable by scheduler.generate_monthly_noticias().
"""

import hashlib
import json
import os
from pathlib import Path

PACK_PATH = Path(os.getenv(
    "NOTICIAS_PROSE_PACK",
    str(Path(__file__).parent / "noticias_prose_pack.json"),
))

# --- Localized month names ------------------------------------------------
MONTHS_ES = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
MONTHS_EN = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def load_pack(path=PACK_PATH):
    """Load SAGA's template pack once. Raises loudly if malformed/missing so a
    bad deploy fails fast rather than silently producing empty articles."""
    with open(path, "r", encoding="utf-8") as f:
        pack = json.load(f)
    for lang in ("es", "en"):
        if lang not in pack:
            raise ValueError(f"noticias pack missing '{lang}' section")
    return pack


def _seed_idx(province_slug, period, slot_name, lang, n):
    """Deterministic variant index: stable-but-varied across province/period/slot
    /lang. md5 -> int keeps it stable across Python runs (unlike hash())."""
    if n <= 0:
        return 0
    key = f"{province_slug}|{period}|{slot_name}|{lang}".encode("utf-8")
    h = int(hashlib.md5(key).hexdigest(), 16)
    return h % n


def _pick(pack, lang, group, condition, province_slug, period, slot_name):
    """Pick one variant deterministically from pack[lang][group][condition]
    (or pack[lang][group] when it's already a flat list)."""
    node = pack[lang].get(group)
    if node is None:
        return ""
    variants = node[condition] if isinstance(node, dict) else node
    if not variants:
        return ""
    idx = _seed_idx(province_slug, period, slot_name, lang, len(variants))
    return variants[idx]


# --- Placeholder formatting ----------------------------------------------

def format_eur(cents, lang):
    """cents (int) -> '12.500 €' (es) / '€12,500' (en). Whole euros. None-safe."""
    if cents is None:
        return ""
    euros = int(round(int(cents) / 100.0))
    # group thousands with a temporary separator, then localize
    grouped = f"{euros:,}"  # e.g. "12,500"
    if lang == "es":
        # es: dot thousands, € suffix
        return grouped.replace(",", ".") + " €"
    return "€" + grouped


def _condition_opening(stats):
    mom = stats.get("momIntakeDeltaPct")
    if mom is None:
        return "no_prior"
    if mom >= 5:
        return "up"
    if mom <= -5:
        return "down"
    return "flat"


def _condition_outcome(stats):
    sold = stats.get("sold", 0)
    desierta = stats.get("desierta", 0)
    if sold > 0 and desierta == 0:
        return "all_sold"
    if sold == 0 and desierta > 0:
        return "all_desierta"
    return "normal"


def _condition_price(stats):
    sold = stats.get("sold", 0)
    if sold >= 5 and stats.get("soldMedianCents") is not None:
        return "normal"
    return "suppressed"


def _condition_rank(stats):
    rank = stats.get("rankByIntake")
    if rank is None:
        return "neutral"
    if rank <= 3:
        return "top3"
    if rank <= 10:
        return "top10"
    return "neutral"


def _is_low_activity(stats):
    """SAGA gate: intake < 3 AND totalConcluded < 3 -> low_activity slot."""
    return stats.get("intake", 0) < 3 and stats.get("totalConcluded", 0) < 3


def _placeholders(stats, lang):
    """Build the PRE-FORMATTED placeholder dict for str.format-style fills."""
    period = stats["period"]  # "YYYY-MM"
    year = int(period[:4])
    month = int(period[5:7])
    months = MONTHS_ES if lang == "es" else MONTHS_EN
    prev_month = 12 if month == 1 else month - 1
    intake = stats.get("intake", 0)
    total_concluded = stats.get("totalConcluded", 0)
    sold = stats.get("sold", 0)
    pct = None
    if total_concluded > 0:
        pct = int(round(sold / total_concluded * 100))
    disc = stats.get("discountAppraisalMedian")
    mom = stats.get("momIntakeDeltaPct")
    return {
        "provincia": stats["provinceName"],
        "mes": months[month],
        "año": year,
        "mes_anterior": months[prev_month],
        "nuevas": intake,
        "concluidas": total_concluded,
        "vendidas": sold,
        "desiertas": stats.get("desierta", 0),
        "pct_vendidas": pct if pct is not None else 0,
        "precio_mediano": format_eur(stats.get("soldMedianCents"), lang),
        "p25": format_eur(stats.get("p25Cents"), lang),
        "p75": format_eur(stats.get("p75Cents"), lang),
        "descuento": abs(int(round(disc))) if disc is not None else 0,
        "mom_pct": abs(int(round(mom))) if mom is not None else 0,
        "rank": stats.get("rankByIntake") or 0,
    }


def _fill(template, ph):
    """Fill {placeholder} tokens. Unknown tokens are left intact (defensive)."""
    out = template
    for k, v in ph.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def _pluralize(text, intake, lang):
    """Intake==1 fixups: the pack phrases the noun right after its number, so a
    targeted swap reads correctly ('1 nuevas subastas' -> '1 nueva subasta')."""
    if intake != 1:
        return text
    if lang == "es":
        text = text.replace("nuevas subastas", "nueva subasta")
        text = text.replace("subastas nuevas", "subasta nueva")
    else:
        text = text.replace("new auctions", "new auction")
    return text


def render_article(pack, stats):
    """Return {'titleEs','titleEn','proseEs','proseEn'} for one province-month.

    `stats` must carry: period ('YYYY-MM'), provinceSlug, provinceName, intake,
    sold, desierta, totalConcluded, soldMedianCents, p25Cents, p75Cents,
    discountAppraisalMedian, momIntakeDeltaPct (None when no prior), rankByIntake.
    """
    slug = stats["provinceSlug"]
    period = stats["period"]
    low = _is_low_activity(stats)
    out = {}

    for lang, title_key, prose_key in (("es", "titleEs", "proseEs"),
                                       ("en", "titleEn", "proseEn")):
        ph = _placeholders(stats, lang)

        title = _fill(_pick(pack, lang, "title", None, slug, period, "title"), ph)

        opening = _fill(
            _pick(pack, lang, "opening", _condition_opening(stats),
                  slug, period, "opening"), ph)

        if low:
            body = _fill(
                _pick(pack, lang, "low_activity", None, slug, period,
                      "low_activity"), ph)
            middle_paras = [body]
        else:
            outcome = _fill(
                _pick(pack, lang, "outcome", _condition_outcome(stats),
                      slug, period, "outcome"), ph)
            price = _fill(
                _pick(pack, lang, "price", _condition_price(stats),
                      slug, period, "price"), ph)
            rank = _fill(
                _pick(pack, lang, "rank", _condition_rank(stats),
                      slug, period, "rank"), ph)
            # outcome + price form one paragraph; rank (may be empty) tags on.
            para2 = " ".join(s for s in (outcome, price) if s).strip()
            para3 = rank.strip()
            middle_paras = [p for p in (para2, para3) if p]

        closing = _fill(
            _pick(pack, lang, "closing", None, slug, period, "closing"), ph)

        paras = [opening] + middle_paras + [closing]
        prose = "\n\n".join(_pluralize(p, ph["nuevas"], lang)
                            for p in paras if p and p.strip())

        out[title_key] = _pluralize(title, ph["nuevas"], lang).strip()
        out[prose_key] = prose

    return out


def render_meta_description(pack, stats, lang):
    """Pick a meta_description variant (for generateMetadata) — stored so the
    route needn't recompute it. Not part of the article body."""
    ph = _placeholders(stats, lang)
    return _fill(
        _pick(pack, lang, "meta_description", None,
              stats["provinceSlug"], stats["period"], "meta_description"), ph)
