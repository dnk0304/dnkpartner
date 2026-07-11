"""
catastro_client — Dirección General del Catastro DNPRC enrichment.

Phase 1 Leg B (Dennis-approved 2026-07-11). Enriches auction rows that carry a
20-char cadastralRef with año-construcción / uso / superficie from the FREE OVC
Consulta_DNPRC web service:

  https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/
  Consulta_DNPRC?RefCat=<ref>

No auth, no captcha, JSON. Public non-protected Catastro data, reusable under the
Spanish open-data regime (Ley 18/2015; attribution: Dirección General del
Catastro). Spec: catastro.hacienda.gob.es/ws/Webservices_Libres.pdf. No
documented hard quota — community practice is ~1 req/s to avoid an IP block; the
CALLER (scheduler leg) enforces the 1 req/s rate limit, not this module.

Feasibility (100 real active refs, GHOST-FINDINGS.md): 94 OK, superficie 99%,
año 89%, uso 100%; layout/rooms confirmed ABSENT from the response. Structured
error codes cod 4 ("no está correctamente formada") and cod 5 ("no existe") are
expected and returned as a status — never raised.

CHECKSUM — this module also validates the cadastralRef's two control letters
locally (positions 19-20) BEFORE any HTTP call, so a stored ref mangled at the
BOE source is caught for free (returns status 'checksum', no request spent). The
algorithm was calibrated against all 473 real active refs and VERIFIED against
the live API: 466/473 pass both the checksum and the API; the 7 that fail the
checksum ALL return cod 4 from the API — zero false positives, zero false
negatives. (The 7 are corrupt at the BOE source, faithfully extracted; see the
résumé.)
"""
from __future__ import annotations

import json
import urllib.request
from typing import Callable, Dict, Optional

DNPRC_URL = (
    "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/"
    "json/Consulta_DNPRC?RefCat="
)
_UA = "Mozilla/5.0 (compatible; dnksubastas-catastro/1.0; +https://dnksubastas.es)"

# --- Catastro control-digit (checksum) algorithm ---------------------------
# The 20-char inmueble ref = 14 parcel chars + 4 sequence chars + 2 control
# letters. The control letters are computed from two weighted sums (positions
# 1-7 + 15-18, and 8-14 + 15-18) mod 23, indexed into a fixed dictionary.
_LETTER_VALUES = {c: i + 1 for i, c in enumerate("ABCDEFGHIJKLMNÑOPQRSTUVWXYZ")}
_WEIGHTS = [13, 15, 12, 5, 4, 17, 9, 21, 3, 7, 1]
_DC_TABLE = "MQWERTYUIOPASDFGHJKLBZX"


def _char_value(ch: str) -> int:
    if ch.isdigit():
        return int(ch)
    return _LETTER_VALUES.get(ch.upper(), 0)


def control_letters(ref18: str) -> str:
    """Return the 2 expected control letters for the first 18 chars of a ref."""
    s1 = ref18[0:7] + ref18[14:18]
    s2 = ref18[7:14] + ref18[14:18]
    out = []
    for s in (s1, s2):
        total = sum(w * _char_value(c) for w, c in zip(_WEIGHTS, s))
        out.append(_DC_TABLE[total % 23])
    return "".join(out)


def is_valid_cadastral_ref(ref: Optional[str]) -> bool:
    """
    True iff `ref` is a well-formed 20-char inmueble reference whose two control
    letters match the computed check. A malformed / mis-extracted ref is rejected
    here so we never spend an HTTP request on a ref the API will only reject with
    cod 4.
    """
    if not ref:
        return False
    r = ref.strip().upper().replace(" ", "")
    if len(r) != 20:
        return False
    return control_letters(r[:18]) == r[18:]


# --- Response parsing (pure, unit-testable) --------------------------------

class CatastroResult:
    """Outcome of one DNPRC lookup. `status` is one of:
    ok | not_found (cod 5) | malformed (cod 4) | checksum (local reject) |
    error (HTTP/timeout/parse). Data fields are None unless status == 'ok'."""

    __slots__ = ("status", "surface_m2", "year_built", "use", "cod", "detail")

    def __init__(self, status, surface_m2=None, year_built=None, use=None,
                 cod=None, detail=None):
        self.status = status
        self.surface_m2 = surface_m2
        self.year_built = year_built
        self.use = use
        self.cod = cod
        self.detail = detail

    def as_dict(self) -> Dict[str, object]:
        return {"status": self.status, "surface_m2": self.surface_m2,
                "year_built": self.year_built, "use": self.use, "cod": self.cod}

    def __repr__(self):
        return f"CatastroResult({self.as_dict()})"


def _to_float(v) -> Optional[float]:
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace(",", "."))
    except (ValueError, TypeError):
        return None


def _to_int(v) -> Optional[int]:
    if v in (None, ""):
        return None
    try:
        return int(str(v).strip())
    except (ValueError, TypeError):
        return None


def parse_dnprc_response(body: str) -> CatastroResult:
    """
    Parse a raw Consulta_DNPRC JSON body into a CatastroResult. Handles the
    structured error envelope (lerr -> cod 4/5) and the standard single-inmueble
    payload (bico.bi.debi -> sfc/ant/luso). NEVER raises on well-formed error
    JSON; a genuinely unparseable body returns status 'error'.
    """
    try:
        d = json.loads(body)
    except (ValueError, TypeError):
        return CatastroResult("error", detail="invalid JSON")

    res = (d or {}).get("consulta_dnprcResult") or {}

    # Structured error envelope.
    lerr = res.get("lerr")
    if lerr:
        err = lerr[0] if isinstance(lerr, list) and lerr else {}
        cod = _to_int(err.get("cod"))
        if cod == 5:
            return CatastroResult("not_found", cod=5, detail=err.get("des"))
        if cod == 4:
            return CatastroResult("malformed", cod=4, detail=err.get("des"))
        return CatastroResult("error", cod=cod, detail=err.get("des"))

    bico = res.get("bico") or {}
    bi = bico.get("bi") or {}
    debi = bi.get("debi") or {}
    if not debi:
        # No single-inmueble payload (e.g. a 14-char parcel returns lrcdnp; not
        # in our 20-char active pool) — treat as no usable data, not an error.
        return CatastroResult("ok", detail="no debi block")

    return CatastroResult(
        "ok",
        surface_m2=_to_float(debi.get("sfc")),
        year_built=_to_int(debi.get("ant")),
        use=(debi.get("luso") or None),
    )


# --- Fetch (network; injectable for tests) ---------------------------------

def _default_fetch(url: str, timeout: float) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def consulta_dnprc(
    ref: str,
    timeout: float = 20.0,
    fetch: Optional[Callable[[str, float], str]] = None,
    retry_once: bool = True,
) -> CatastroResult:
    """
    Look up one cadastralRef. Rejects a bad-checksum ref locally (status
    'checksum', no HTTP). On a network/timeout failure retries once, then returns
    status 'error'. `fetch` is injectable (url, timeout)->body for tests.
    """
    if not is_valid_cadastral_ref(ref):
        return CatastroResult("checksum", detail="control-letter mismatch or bad length")

    r = ref.strip().upper().replace(" ", "")
    do_fetch = fetch or _default_fetch
    url = DNPRC_URL + r

    attempts = 2 if retry_once else 1
    last_exc = None
    for _ in range(attempts):
        try:
            body = do_fetch(url, timeout)
            return parse_dnprc_response(body)
        except Exception as e:  # noqa: BLE001 — network/timeout are expected
            last_exc = e
    return CatastroResult("error", detail=repr(last_exc))
