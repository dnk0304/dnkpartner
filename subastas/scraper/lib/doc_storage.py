"""
Auction-document storage — the PYTHON mirror of the TS contract Forge defined
in `subastas/src/lib/auction-docs/storage.ts`. Ghost (this scraper) WRITES
PDFs + AuctionDocument rows; the Next.js serve route (/api/auction-doc/[id])
READS them. Both stacks must agree byte-for-byte on the safeKey rule, the
AUCTION_DOCS_DIR default, and the <safeKey>/<filename>.pdf layout — any change
here MUST be mirrored there.

Canonical layout (per auction, keyed by boeId):
    ${AUCTION_DOCS_DIR}/<safeKey(boeId)>/<filename>.pdf

Files live on a Hetzner host volume bind-mounted into BOTH the scraper and the
app containers at AUCTION_DOCS_DIR (default /data/auction-docs) — NOT in the
image — so cached PDFs survive redeploys (mirrors /data/auction-images).

`storedPath` written to the DB is the RELATIVE path `<safeKey>/<file>.pdf` so
the serve route can resolve it under whatever AUCTION_DOCS_DIR is mounted.
"""
import os
import re

# Default mirrors auction-images/storage.ts. Ken bind-mounts this on deploy.
AUCTION_DOCS_DIR = os.environ.get("AUCTION_DOCS_DIR", "/data/auction-docs")

# Canonical sentinel for the single per-auction snapshot row. Ghost writes this
# exact string in AuctionDocument.idDoc so @@unique([auctionId, idDoc]) dedupes
# snapshot upserts to one row (overwritten in place).
SNAPSHOT_FILENAME = "snapshot.pdf"
SNAPSHOT_ID_DOC_SENTINEL = "SNAPSHOT"

# safeKey: identical regex to TS — replace every non-[A-Za-z0-9_.-] run with
# '_', cap at 128 chars. MUST match auction-images so the two stacks agree.
_SAFE_KEY_SUB_RE = re.compile(r"[^a-zA-Z0-9_.-]+")
# Filename sanitizer: same class, cap 196 (before the .pdf suffix).
_SAFE_FILENAME_SUB_RE = re.compile(r"[^a-zA-Z0-9_.-]+")

# Validators (mirror the TS read-time guards) — used by tests / defence-in-depth.
_SAFE_KEY_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
_SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,200}\.pdf$")
_SAFE_REL_PATH_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}/[A-Za-z0-9_.-]{1,200}\.pdf$")


def safe_key(boe_id: str) -> str:
    """Mirror of TS safeKey(): boeId.replace(/[^a-zA-Z0-9_.-]+/g,'_').slice(0,128)."""
    return _SAFE_KEY_SUB_RE.sub("_", boe_id or "")[:128]


def is_valid_key(raw: str) -> bool:
    return bool(_SAFE_KEY_RE.match(raw or ""))


def is_valid_filename(raw: str) -> bool:
    return bool(_SAFE_FILENAME_RE.match(raw or ""))


def is_valid_rel_path(raw: str) -> bool:
    return bool(_SAFE_REL_PATH_RE.match(raw or ""))


def safe_filename(input_str: str) -> str:
    """
    Mirror of TS safeFilename(): replace every non-[A-Za-z0-9_.-] run with '_',
    truncate to 196 chars, drop a trailing .pdf, and re-add `.pdf`. Guarantees
    the result is is_valid_filename-clean (so a malformed DB row can never
    escape the storage root).
    """
    trimmed = _SAFE_FILENAME_SUB_RE.sub("_", input_str or "")[:196]
    base = re.sub(r"\.pdf$", "", trimmed, flags=re.IGNORECASE)
    return f"{base or 'document'}.pdf"


def doc_dir_for(boe_id: str) -> str:
    """Per-auction directory under AUCTION_DOCS_DIR (absolute)."""
    return os.path.join(AUCTION_DOCS_DIR, safe_key(boe_id))


def doc_disk_path_for(boe_id: str, filename: str) -> str:
    """Absolute disk path for a downloaded doc file."""
    return os.path.join(AUCTION_DOCS_DIR, safe_key(boe_id), filename)


def snapshot_disk_path_for(boe_id: str) -> str:
    """Absolute disk path for the single per-auction snapshot."""
    return os.path.join(AUCTION_DOCS_DIR, safe_key(boe_id), SNAPSHOT_FILENAME)


def rel_path_for(boe_id: str, filename: str) -> str:
    """Stored relative path (the value that goes into AuctionDocument.storedPath)."""
    return f"{safe_key(boe_id)}/{filename}"


def ensure_doc_dir(boe_id: str) -> str:
    """mkdir -p the per-auction dir; return the absolute dir path."""
    d = doc_dir_for(boe_id)
    os.makedirs(d, exist_ok=True)
    return d
