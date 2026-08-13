"""BOE closure-certificate ("Certificación de cierre") reader.

WHY THIS EXISTS
---------------
When a BOE auction is CANCELLED (and for some terminal states), the public
detail page at ``detalleSubasta.php`` REMOVES the "Fecha de inicio" /
"Fecha de conclusión" rows entirely and shows only::

    La subasta ha sido cancelada por la autoridad gestora

So there is no end date to parse on the detail page — which is exactly why
those rows historically got a fabricated ``datetime.now() + 7 days`` value
(removed 2026-08-04) and now carry an honest NULL ``endsAt``.

The real, authoritative end instant IS published, just elsewhere: the closure
certificate PDF linked from the same page::

    https://subastas.boe.es/verCertificadoCierre.php?idSub=<BOE_ID>

which contains a machine-readable timeline, e.g.::

    Evolución de la subasta:
    Publicación en BOE: 20/10/2018
    Apertura: 23/10/2018 18:00:00  (ISO: 2018-10-23T18:00:00+02:00)
    Suspensión: 09/11/2018 08:57:05  (ISO: 2018-11-09T08:57:05+01:00)
    Cancelación: 27/11/2018 11:57:59  (ISO: 2018-11-27T11:57:59+01:00)

This module extracts that timeline. It NEVER invents a date: if the PDF is
absent, unparsable, or carries no terminal event, it returns ``None`` and the
caller must leave ``endsAt`` NULL.

CONVENTIONS (must match the corpus)
-----------------------------------
* ``endsAt`` is ``timestamp without time zone`` holding **Madrid wall time**
  (see the 2026-08-04 resumeAt tz incident). The certificate prints Madrid
  wall time in the human field and the same instant with offset in the ISO
  field, so we take the *human* field and, when only ISO is available, strip
  the tzinfo after normalising to the offset the certificate itself states.
* Terminal-event precedence: Cancelación > Conclusión/Cierre > Adjudicación.
  A suspension is NOT terminal and never becomes ``endsAt``.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

CERT_URL = "https://subastas.boe.es/verCertificadoCierre.php?idSub={boe_id}"

# Ordered by precedence: the first label that yields a datetime wins.
_TERMINAL_LABELS: tuple[tuple[str, str], ...] = (
    ("CANCELADA", r"Cancelaci[oó]n"),
    ("CONCLUIDA", r"Conclusi[oó]n"),
    ("CONCLUIDA", r"Cierre de la subasta"),
    ("CONCLUIDA", r"Finalizaci[oó]n"),
    ("ADJUDICADA", r"Adjudicaci[oó]n"),
)

_DT_HUMAN = r"(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?"
_ISO = r"\(ISO:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?)\s*\)"


@dataclass(frozen=True)
class ClosureEvent:
    """A terminal event read out of a closure certificate."""

    kind: str  # CANCELADA | CONCLUIDA | ADJUDICADA
    ends_at: datetime  # naive, Madrid wall time (corpus convention)
    label: str  # the raw Spanish label matched
    source: str  # 'human' | 'iso'


def pdf_to_text(data: bytes) -> str:
    """Extract text from certificate PDF bytes. Returns '' when unreadable."""
    if not data or not data.startswith(b"%PDF"):
        return ""
    try:
        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError:  # pragma: no cover - environment dependent
            from PyPDF2 import PdfReader  # type: ignore
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("closure-cert: PDF text extraction failed: %s", exc)
        return ""


def _parse_human(match: re.Match) -> Optional[datetime]:
    day, month, year, hh, mm, ss = match.group(1, 2, 3, 4, 5, 6)
    try:
        return datetime(
            int(year), int(month), int(day),
            int(hh or 0), int(mm or 0), int(ss or 0),
        )
    except ValueError:
        return None


def parse_closure_event(text: str) -> Optional[ClosureEvent]:
    """Return the terminal event from certificate text, or None.

    Honest-NULL: no terminal label, no date, or an impossible date -> None.
    """
    if not text:
        return None
    # Normalise whitespace so a label and its date may straddle a line break.
    flat = re.sub(r"[ \t]+", " ", text)
    flat = re.sub(r"\s*\n\s*", " ", flat)

    for kind, label_re in _TERMINAL_LABELS:
        # Label, then optional ':' then the human date, then optional ISO echo.
        pattern = rf"{label_re}\s*:?\s*{_DT_HUMAN}(?:\s*{_ISO})?"
        m = re.search(pattern, flat, re.IGNORECASE)
        if not m:
            continue
        dt = _parse_human(m)
        source = "human"
        if dt is None:
            iso = m.group(7)
            if not iso:
                continue
            try:
                dt = datetime.fromisoformat(iso).replace(tzinfo=None)
                source = "iso"
            except ValueError:
                continue
        if not _plausible(dt):
            logger.warning("closure-cert: implausible date %s for label %s", dt, label_re)
            continue
        return ClosureEvent(kind=kind, ends_at=dt, label=label_re, source=source)
    return None


def _plausible(dt: datetime) -> bool:
    """BOE's electronic portal started in 2015; nothing may be in the future."""
    now = datetime.now()
    return datetime(2015, 1, 1) <= dt <= now


def fetch_closure_event(boe_id: str, session=None, timeout: int = 40) -> Optional[ClosureEvent]:
    """Fetch + parse the closure certificate for ``boe_id``.

    Returns None on any failure (404, non-PDF, unparsable, no terminal event).
    Network errors are raised to the caller so a run can distinguish
    "no certificate" from "the network broke" — the caller must not write
    NULL on a transport failure.
    """
    import requests

    sess = session or requests
    url = CERT_URL.format(boe_id=boe_id)
    resp = sess.get(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "es-ES,es;q=0.9",
            "Referer": f"https://subastas.boe.es/detalleSubasta.php?idSub={boe_id}",
        },
        timeout=timeout,
    )
    if resp.status_code in (404, 410):
        # Genuine absence: this auction has no closure certificate.
        return None
    if resp.status_code != 200:
        # Throttling (429) or a portal wobble (5xx) must NOT be recorded as
        # "no certificate" — that would silently leave the row NULL forever.
        # Raise so the caller retries instead of deciding.
        raise RuntimeError(
            f"closure certificate for {boe_id}: HTTP {resp.status_code}"
        )
    if "pdf" not in (resp.headers.get("Content-Type") or "").lower():
        return None
    return parse_closure_event(pdf_to_text(resp.content))
