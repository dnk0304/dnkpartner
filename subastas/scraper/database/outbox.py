"""
EventOutbox writer — Wave 2a
Writes domain events into the event_outbox table in the SAME psycopg2 transaction
as the mutation that caused them. Call write_event(cursor, ...) before conn.commit().

Taxonomy (match Forge Wave 2 brief exactly):
  auction.go_live        — auction transitions to live/active
  auction.status_change  — any status transition (also writes AuctionStatusHistory)
  auction.new_bid        — bid count / current price increased (also writes AuctionBidHistory)
  auction.suspended      — suspended; populates suspensionReason + resumeAt when known
  auction.rescheduled    — resume/new date set after suspension
  auction.ending_soon    — crosses the ≤24h threshold (once-only per auction)
  auction.finished       — auction closed/ended

dedupeKey format: {auctionId}:{eventType}:{discriminator}
  status events: discriminator = new status
  bid events:    discriminator = bid amount as int string
  ending_soon:   discriminator = "24h"
  go_live:       discriminator = "live"
"""

import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

ENDING_SOON_HOURS = 24  # threshold for ending_soon event


def write_event(
    cursor,
    *,
    auction_id: str,
    event_type: str,
    payload: Dict[str, Any],
    discriminator: str,
) -> bool:
    """
    Insert one row into event_outbox using the caller's cursor (same transaction).
    Uses INSERT ... ON CONFLICT (dedupeKey) DO NOTHING for idempotency.

    Args:
        cursor: open psycopg2 cursor (caller owns the transaction)
        auction_id: Auction.id (PK, not boeId)
        event_type: one of the 7 taxonomy strings above
        payload: dict — must carry enough for notification rendering without a 2nd DB read
        discriminator: stable suffix for dedupeKey

    Returns True if a new row was inserted, False if deduped (already existed).
    """
    dedupe_key = f"{auction_id}:{event_type}:{discriminator}"
    payload_json = json.dumps(payload, default=_json_default)

    try:
        cursor.execute(
            """
            INSERT INTO event_outbox ("id", "auctionId", "eventType", payload, "dedupeKey", "createdAt")
            VALUES (gen_random_uuid()::text, %s, %s, %s::jsonb, %s, %s)
            ON CONFLICT ("dedupeKey") DO NOTHING
            """,
            (auction_id, event_type, payload_json, dedupe_key, datetime.utcnow()),
        )
        inserted = cursor.rowcount == 1
        if inserted:
            logger.debug(f"outbox: wrote {event_type} dedupe={dedupe_key}")
        else:
            logger.debug(f"outbox: deduped (skip) {event_type} dedupe={dedupe_key}")
        return inserted
    except Exception as e:
        logger.error(f"outbox: write_event failed ({event_type}, {dedupe_key}): {e}")
        raise


def write_status_history(
    cursor,
    *,
    auction_id: str,
    from_status: Optional[str],
    to_status: str,
    source: str = "scraper",
    reason: Optional[str] = None,
    resume_at: Optional[datetime] = None,
    detected_by: Optional[str] = None,
) -> None:
    """Insert a row into AuctionStatusHistory (same transaction)."""
    try:
        cursor.execute(
            """
            INSERT INTO "AuctionStatusHistory"
                ("id", "auctionId", "fromStatus", "toStatus", "changedAt", "source", "reason", "resumeAt", "detectedBy")
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                auction_id,
                from_status,
                to_status,
                datetime.utcnow(),
                source,
                reason,
                resume_at,
                detected_by,
            ),
        )
    except Exception as e:
        logger.error(f"outbox: write_status_history failed ({auction_id}): {e}")
        raise


def write_bid_history(
    cursor,
    *,
    auction_id: str,
    bid: float,
    bid_type: str = "current",
    source: str = "scraper",
) -> None:
    """Insert a row into AuctionBidHistory (same transaction)."""
    try:
        cursor.execute(
            """
            INSERT INTO "AuctionBidHistory"
                ("id", "auctionId", "bid", "bidType", "seenAt", "source")
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s)
            """,
            (auction_id, bid, bid_type, datetime.utcnow(), source),
        )
    except Exception as e:
        logger.error(f"outbox: write_bid_history failed ({auction_id}): {e}")
        raise


# ---------------------------------------------------------------------------
# High-level helpers — one per event type
# ---------------------------------------------------------------------------


def emit_status_change(
    cursor,
    *,
    auction_id: str,
    boe_id: str,
    boe_link: str,
    title: str,
    from_status: str,
    to_status: str,
    province: str = "",
    municipality: str = "",
    appraisal_value: float = 0.0,
    current_bid: Optional[float] = None,
    ends_at: Optional[datetime] = None,
    suspension_reason: Optional[str] = None,
    resume_at: Optional[datetime] = None,
    detected_by: str = "scheduler",
) -> None:
    """
    Emit the correct event for a status transition.
    Writes both EventOutbox + AuctionStatusHistory in the caller's transaction.
    """
    now = datetime.utcnow()

    # Determine specific event type
    if to_status == "CELEBRANDOSE" and from_status not in ("CELEBRANDOSE", "ACTIVE"):
        event_type = "auction.go_live"
        discriminator = "live"
    elif to_status in ("CONCLUIDA_PORTAL", "FINALIZADA_AUTORIDAD", "CANCELADA", "FINISHED", "CANCELLED"):
        event_type = "auction.finished"
        discriminator = to_status
    elif to_status == "SUSPENDIDA":
        event_type = "auction.suspended"
        discriminator = f"suspended:{now.strftime('%Y%m%d')}"
    elif to_status == "CELEBRANDOSE" and from_status == "SUSPENDIDA":
        event_type = "auction.rescheduled"
        discriminator = resume_at.strftime("%Y%m%d") if resume_at else "rescheduled"
    else:
        event_type = "auction.status_change"
        discriminator = to_status

    payload = {
        "boeId": boe_id,
        "boeLink": boe_link,
        "title": title,
        "fromStatus": from_status,
        "toStatus": to_status,
        "province": province,
        "municipality": municipality,
        "appraisalValue": appraisal_value,
        "currentBid": current_bid,
        "endsAt": ends_at.isoformat() if ends_at else None,
        "suspensionReason": suspension_reason,
        "resumeAt": resume_at.isoformat() if resume_at else None,
        "detectedAt": now.isoformat(),
    }

    write_event(cursor, auction_id=auction_id, event_type=event_type, payload=payload, discriminator=discriminator)
    write_status_history(
        cursor,
        auction_id=auction_id,
        from_status=from_status,
        to_status=to_status,
        source="scraper",
        reason=suspension_reason,
        resume_at=resume_at,
        detected_by=detected_by,
    )


def emit_new_bid(
    cursor,
    *,
    auction_id: str,
    boe_id: str,
    boe_link: str,
    title: str,
    new_bid: float,
    previous_bid: Optional[float],
    province: str = "",
    municipality: str = "",
    appraisal_value: float = 0.0,
    ends_at: Optional[datetime] = None,
) -> None:
    """
    Emit auction.new_bid + write AuctionBidHistory.
    discriminator = bid amount as integer cents to avoid float formatting drift.
    """
    discriminator = str(int(round(new_bid * 100)))
    payload = {
        "boeId": boe_id,
        "boeLink": boe_link,
        "title": title,
        "newBid": new_bid,
        "previousBid": previous_bid,
        "province": province,
        "municipality": municipality,
        "appraisalValue": appraisal_value,
        "endsAt": ends_at.isoformat() if ends_at else None,
        "detectedAt": datetime.utcnow().isoformat(),
    }

    write_event(cursor, auction_id=auction_id, event_type="auction.new_bid", payload=payload, discriminator=discriminator)
    write_bid_history(cursor, auction_id=auction_id, bid=new_bid, bid_type="current")


def emit_ending_soon(
    cursor,
    *,
    auction_id: str,
    boe_id: str,
    boe_link: str,
    title: str,
    ends_at: datetime,
    province: str = "",
    municipality: str = "",
    appraisal_value: float = 0.0,
    current_bid: Optional[float] = None,
    threshold_hours: int = ENDING_SOON_HOURS,
) -> bool:
    """
    Emit auction.ending_soon — once-only per auction per threshold.
    Uses dedupeKey = {auctionId}:auction.ending_soon:{threshold_hours}h
    Returns True if newly emitted, False if already fired.
    """
    payload = {
        "boeId": boe_id,
        "boeLink": boe_link,
        "title": title,
        "endsAt": ends_at.isoformat(),
        "province": province,
        "municipality": municipality,
        "appraisalValue": appraisal_value,
        "currentBid": current_bid,
        "thresholdHours": threshold_hours,
        "detectedAt": datetime.utcnow().isoformat(),
    }
    return write_event(
        cursor,
        auction_id=auction_id,
        event_type="auction.ending_soon",
        payload=payload,
        discriminator=f"{threshold_hours}h",
    )


def _json_default(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
