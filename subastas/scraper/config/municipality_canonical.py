"""Province-scoped canonicalisation of a scraped municipality string to the INE register.

WHY THIS EXISTS
---------------
`canonical_municipality_name()` title-cases anything it does not recognise. That is
how the corpus grew 302 "municipios de Madrid" against a real 179: a single
mis-scraped string (`Msdrid`, `Fuenalbrada`, `Carabanchel Alto`, `Tenerife`) became a
brand-new town, and each fake town minted a permanent URL.

This module is the ingest-side guard (MUNI-B task 4). It answers ONE question:

    given a scraped name AND the row's province, which INE municipality is this?

It returns the official name or **None**. It never invents, and it never returns a
name that is not in the register.

CONFIDENCE POLICY (measured against the 241k-row corpus, 2026-08-13)
--------------------------------------------------------------------
Deterministic tiers first, edit-distance last and gated:

  T1 exact         - key matches the register (incl. co-official + INE's inverted
                     "Ejido, El" form).
  T2 paren-article - "Rozas de Madrid (las)" -> "Las Rozas de Madrid". The register
                     inverts on a comma; the corpus also inverts in parentheses.
  T3 particles     - connective particles dropped/altered: "Alcala Henares" ->
                     "Alcalá de Henares". Compares content tokens; must be unique.
  T4 truncation    - "Arganda" -> "Arganda del Rey". Corpus tokens are a strict
                     subset of exactly one municipality's tokens. GUARDED (below).
  T5 fuzzy         - Damerau-Levenshtein, unique best candidate, length-gated:
                     d=1 needs len>=8, d=2 needs len>=14.

The T5 gate is not a guess. Among REAL municipalities inside a single province there
are 52 pairs exactly 1 edit apart (Ibi/Tibi, Monda/Ronda, Alella/Calella,
Rubí/Rubio) and 484 pairs 2 apart -- all short. Below the gate a "correction" is as
likely to be a different real town as a typo, so it is refused.

T4 GUARDS (each one caught a real, high-volume error)
  * province name  - "Castellon" in Castellón is the PROVINCE, not a truncation of
                     Castelló de la Plana (703 rows).
  * island name    - "Tenerife" is the island, not Santa Cruz de Tenerife (242 rows).
  * head token     - a truncation must keep the canonical's first significant token,
                     so "La Cañada" does not become "Zapardiel de la Cañada".

Unresolved is a recoverable state; wrong is not. A wrong town in a permanent URL is
the one failure mode this module exists to prevent.
"""
from __future__ import annotations

import csv
import os
import re
import threading
import unicodedata
from typing import Dict, Optional, Set, Tuple

_DIR = os.path.dirname(os.path.abspath(__file__))
_FILES = ("ine_municipalities.csv", "ine_municipalities_coofficial.csv")

# Leading articles as INE writes them inverted ("Name, Article").
_ARTICLES = {"el", "la", "los", "las", "l", "els", "les", "a", "as", "o", "os",
             "lo", "es", "sa", "ses", "sos"}
# Connective particles the corpus drops or swaps. 'san'/'santa' are NOT here:
# they are load-bearing parts of a name.
_STOP = {"de", "del", "la", "las", "el", "los", "i", "y", "a", "o", "e",
         "les", "els", "lo", "l", "da", "do", "das", "dos"}

_ISLANDS = {"tenerife", "gran canaria", "mallorca", "menorca", "ibiza", "eivissa",
            "fuerteventura", "lanzarote", "la palma", "palma", "la gomera", "gomera",
            "el hierro", "hierro", "formentera", "canarias", "baleares"}
_ISLAND_PROVINCES = {"santa cruz de tenerife", "las palmas", "illes balears"}

_PROVINCE_ALIASES = {
    "baleares": "illes balears",
    "islas baleares": "illes balears",
    "guipuzcoa": "gipuzkoa",
    "vizcaya": "bizkaia",
    "alava": "araba alava",
    "araba": "araba alava",
    "la coruna": "a coruna",
    "coruna": "a coruna",
    "gerona": "girona",
    "lerida": "lleida",
    "orense": "ourense",
}

_PAREN_RE = re.compile(r"^(.*?)\s*\(([^)]+)\)\s*$")

_lock = threading.Lock()
_loaded = False
# province_key -> {muni_key: (official_display_name, ine_code)}
_REG: Dict[str, Dict[str, Tuple[str, str]]] = {}
# province_key -> ine_code -> token set / head tokens
_TOKENS: Dict[str, Dict[str, Set[str]]] = {}
_HEADS: Dict[str, Dict[str, Set[str]]] = {}
_CONTENT: Dict[str, Dict[Tuple[str, ...], Set[str]]] = {}
_DISPLAY: Dict[str, str] = {}   # ine_code -> display (un-inverted) name


def _fold(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value.lower())
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", stripped).strip()


def municipality_key(value: Optional[str]) -> str:
    """Grouping key. Un-inverts INE's trailing article, folds punctuation to space.

    Deliberately does NOT do fuzzy matching -- a typo must fail here and be handled
    by an explicit, gated tier, never silently.
    """
    if not value:
        return ""
    working = str(value).strip()
    comma = working.rfind(",")
    if comma > 0:
        head, tail = working[:comma].strip(), working[comma + 1:].strip()
        if head and _fold(tail).replace("'", "").replace("’", "") in _ARTICLES:
            working = f"{tail} {head}"
    folded = _fold(working)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", folded)).strip()


def province_key(value: Optional[str]) -> str:
    if not value:
        return ""
    key = municipality_key(value)
    return _PROVINCE_ALIASES.get(key, key)


def uninvert(name: str) -> str:
    """'Ejido, El' -> 'El Ejido'; applied per co-official segment."""
    if "/" in name:
        return "/".join(uninvert(p) for p in name.split("/"))
    comma = name.rfind(",")
    if comma > 0:
        head, tail = name[:comma].strip(), name[comma + 1:].strip()
        if _fold(tail).rstrip("'") in {a.rstrip("'") for a in _ARTICLES}:
            sep = "" if tail.endswith(("'", "’")) else " "
            return f"{tail}{sep}{head}"
    return name


def _content(key: str) -> Tuple[str, ...]:
    return tuple(sorted(t for t in key.split() if t not in _STOP))


def _load() -> None:
    global _loaded
    with _lock:
        if _loaded:
            return
        official: Dict[str, Tuple[str, str]] = {}

        def rows(path):
            with open(path, encoding="utf-8-sig") as fh:
                lines = [l for l in fh if not l.startswith("#") and l.strip()]
            return list(csv.DictReader(lines))

        def add(province, display, code, alias):
            pkey, mkey = province_key(province), municipality_key(alias)
            if not pkey or not mkey or not code:
                return
            _REG.setdefault(pkey, {}).setdefault(mkey, (display, code))
            toks = [t for t in mkey.split() if t not in _STOP]
            _TOKENS.setdefault(pkey, {}).setdefault(code, set()).update(toks)
            if toks:
                _HEADS.setdefault(pkey, {}).setdefault(code, set()).add(toks[0])
            _CONTENT.setdefault(pkey, {}).setdefault(_content(mkey), set()).add(code)

        path = os.path.join(_DIR, _FILES[0])
        for row in rows(path):
            code = (row.get("ine") or "").strip()
            if not code:
                continue
            display, province = row["nombre_ine"], row["provincia"]
            official[code] = (display, province)
            _DISPLAY[code] = uninvert(display)
            add(province, display, code, row["municipio"])
            add(province, display, code, display)

        coof = os.path.join(_DIR, _FILES[1])
        if os.path.exists(coof):
            for row in rows(coof):
                code = (row.get("ine") or "").strip()
                if not code or code not in official:
                    continue
                display, province = official[code]
                add(province, display, code, row["municipio"])
        _loaded = True


def _damerau(a: str, b: str, maxd: int = 3) -> int:
    if abs(len(a) - len(b)) > maxd:
        return 99
    la, lb = len(a), len(b)
    prev2 = None
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if (prev2 is not None and i > 1 and j > 1
                    and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]):
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        prev2, prev = prev, cur
    return prev[lb]


def resolve_municipality(name: Optional[str],
                         province: Optional[str]) -> Tuple[Optional[str], Optional[str], str]:
    """Resolve a scraped municipality to the INE register, scoped to `province`.

    Returns ``(display_name, ine_code, tier)``. On failure returns
    ``(None, None, reason)`` -- an honest unknown, never a guess.
    """
    _load()
    pkey = province_key(province)
    pool = _REG.get(pkey)
    if not pool:
        return None, None, "NO_PROVINCE"
    mkey = municipality_key(name)
    if not mkey:
        return None, None, "EMPTY"

    # T1 exact
    hit = pool.get(mkey)
    if hit:
        return _DISPLAY[hit[1]], hit[1], "T1_EXACT"

    # T2 parenthesised article -> re-test exact
    m = _PAREN_RE.match(str(name).strip())
    if m:
        head, tail = m.group(1).strip(), m.group(2).strip()
        if head and municipality_key(tail) in _ARTICLES:
            hit = pool.get(municipality_key(f"{tail} {head}"))
            if hit:
                return _DISPLAY[hit[1]], hit[1], "T2_PAREN_ARTICLE"

    content = _content(mkey)

    # T3 connective particles, must be unique
    codes = _CONTENT.get(pkey, {}).get(content) if content else None
    if codes and len(codes) == 1:
        code = next(iter(codes))
        return _DISPLAY[code], code, "T3_PARTICLES"

    # T4 truncation, guarded
    if content:
        tokens = set(content)
        if tokens <= {t for t in pkey.split() if t not in _STOP}:
            return None, None, "REJECT_PROVINCE_NAME"
        if pkey in _ISLAND_PROVINCES and " ".join(content) in _ISLANDS:
            return None, None, "REJECT_ISLAND_NAME"
        hits = [c for c, toks in _TOKENS.get(pkey, {}).items() if tokens < toks]
        if len(hits) == 1:
            if _HEADS.get(pkey, {}).get(hits[0], set()) & tokens:
                return _DISPLAY[hits[0]], hits[0], "T4_TRUNCATION"
            return None, None, "REJECT_NO_HEAD_TOKEN"
        if len(hits) > 1:
            return None, None, "AMBIGUOUS_TRUNCATION"

    # T5 gated fuzzy
    best, best_d = [], 99
    for key, (_disp, code) in pool.items():
        d = _damerau(mkey, key)
        if d < best_d:
            best_d, best = d, [code]
        elif d == best_d and code not in best:
            best.append(code)
    if best_d < 99 and len(best) == 1:
        length = len(mkey)
        if (best_d == 1 and length >= 8) or (best_d == 2 and length >= 14):
            return _DISPLAY[best[0]], best[0], "T5_FUZZY"
        return None, None, "FUZZY_BELOW_BAR"
    return None, None, "UNRESOLVED"


def canonical_municipality_for_province(name: Optional[str],
                                        province: Optional[str]) -> Optional[str]:
    """Convenience wrapper: the official display name, or None."""
    return resolve_municipality(name, province)[0]
