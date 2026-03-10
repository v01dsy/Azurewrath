# worker/manipulation_detector.py
"""
Auto-detects potentially manipulated items and suggests unmarks.
Call detect_manipulation(cursor) at the end of save_results_to_db().

Rules:
  MANIPULATION FLAG (rap_growth)        : RAP grew >= RAP_GROWTH_PCT% within TIME_WINDOW_HRS hours.
  MANIPULATION FLAG (sale_above_best)   : The implied sale price was >= PRICE_ABOVE_BEST_PCT% above
                                          the item's best listed price at the time of sale.
                                          Implied sale price = oldRap + ((newRap - oldRap) * 10)
  UNMARK SUGGESTION                     : Item is marked manipulated AND current RAP has fallen
                                          back to within 10% of manipulatedRap (the pre-spike baseline).

Dismissal behaviour:
  rap_growth      : dismissed floor is the highest rapAtFlag ever dismissed. Only re-flag if
                    current RAP is >= DISMISSED_FLOOR_REGROWTH_PCT% above that floor.
  sale_above_best : saleDate is stored on the flag row. A sale is never re-flagged if any flag
                    (pending, accepted, or dismissed) already exists for that exact assetId + saleDate.
"""

import uuid, logging, traceback
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Tracks when the detector last ran — sale_above_best only looks at sales
# newer than this so we never re-process old sales.
_last_run: datetime = datetime.now(timezone.utc)

# ── Thresholds ────────────────────────────────────────────────────────────────
RAP_GROWTH_PCT               = 25.0
PRICE_ABOVE_BEST_PCT         = 5.0
TIME_WINDOW_HRS              = 48.0
DISMISSED_FLOOR_REGROWTH_PCT = 25.0


def detect_manipulation(cursor):
    global _last_run
    since = _last_run
    _last_run = datetime.now(timezone.utc)
    try:
        _flag_rap_growth(cursor)
        _flag_sale_above_best_price(cursor, since)
        _suggest_unmarks(cursor)
    except Exception as e:
        logger.error(f"[manip_detector] {e}\n{traceback.format_exc()}")


# ── Rule 1: suspicious RAP growth ────────────────────────────────────────────
def _flag_rap_growth(cursor):
    cursor.execute("""
        WITH rap_window AS (
            SELECT
                "itemId",
                FIRST_VALUE(rap) OVER (
                    PARTITION BY "itemId"
                    ORDER BY timestamp ASC
                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                ) AS rap_start,
                LAST_VALUE(rap) OVER (
                    PARTITION BY "itemId"
                    ORDER BY timestamp ASC
                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                ) AS rap_end,
                EXTRACT(EPOCH FROM (MAX(timestamp) OVER (PARTITION BY "itemId") -
                                    MIN(timestamp) OVER (PARTITION BY "itemId"))) / 3600 AS hrs
            FROM "PriceHistory"
            WHERE rap IS NOT NULL
              AND timestamp >= NOW() - INTERVAL '%s hours'
        ),
        agg AS (
            SELECT DISTINCT "itemId", rap_start, rap_end, hrs
            FROM rap_window
        )
        SELECT
            i."assetId", i.name, i.manipulated,
            a.rap_start, a.rap_end,
            ROUND((((a.rap_end - a.rap_start) / NULLIF(a.rap_start, 0)) * 100)::numeric, 2) AS growth_pct,
            a.hrs
        FROM agg a
        JOIN "Item" i ON i."assetId" = a."itemId"
        WHERE
            a.rap_end > a.rap_start
            AND NOT i.manipulated
            AND ((a.rap_end - a.rap_start) / NULLIF(a.rap_start, 0)) * 100 >= %s
    """, (TIME_WINDOW_HRS, RAP_GROWTH_PCT))

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, _, rap_start, rap_end, growth_pct, hrs in rows:

        # Skip if already a pending flag for this item
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        # Get the highest RAP at which a flag was ever dismissed for this item
        cursor.execute("""
            SELECT MAX("rapAtFlag")
            FROM "ManipulationFlag"
            WHERE "assetId" = %s
              AND "flagType" = 'manipulation'
              AND status = 'dismissed'
        """, (asset_id,))
        row = cursor.fetchone()
        dismissed_floor = row[0] if row and row[0] is not None else None

        if dismissed_floor is not None:
            required_rap = dismissed_floor * (1 + DISMISSED_FLOOR_REGROWTH_PCT / 100)
            if rap_end < required_rap:
                logger.debug(
                    f"[manip_detector] Skipping '{name}' — RAP {int(rap_end):,} is below "
                    f"re-flag threshold {int(required_rap):,} (floor: {int(dismissed_floor):,})"
                )
                continue

        reason = (
            f"RAP grew {growth_pct:.1f}% in {hrs:.1f}h "
            f"({int(rap_start):,} → {int(rap_end):,} R$)"
        )
        if dismissed_floor is not None:
            reason += f" [previously dismissed at {int(dismissed_floor):,} R$]"

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "timeWindowHrs", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, %s, 'rap_growth', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(rap_end), float(growth_pct), float(hrs)))

        logger.info(f"[manip_detector] 🚩 Flagged '{name}' (RAP growth) — {reason}")


# ── Rule 2: sale implied above best price ────────────────────────────────────
def _flag_sale_above_best_price(cursor, since: datetime):
    cursor.execute("""
        WITH recent_sales AS (
            SELECT
                s."itemId",
                s."oldRap",
                s."newRap",
                s."saleDate",
                (s."oldRap" + ((s."newRap" - s."oldRap") * 10)) AS implied_sale_price,
                (
                    SELECT ph.price
                    FROM "PriceHistory" ph
                    WHERE ph."itemId" = s."itemId"
                      AND ph.price IS NOT NULL
                      AND ph.price > 0
                      AND ph.timestamp <= s."saleDate"
                    ORDER BY ph.timestamp DESC
                    LIMIT 1
                ) AS best_price_at_sale
            FROM "Sale" s
            WHERE s."saleDate" > %s
              AND s."newRap" > s."oldRap"
        )
        SELECT
            rs."itemId",
            i.name,
            i.manipulated,
            rs."oldRap",
            rs."newRap",
            rs.implied_sale_price,
            rs.best_price_at_sale,
            ROUND((((rs.implied_sale_price - rs.best_price_at_sale) / NULLIF(rs.best_price_at_sale, 0)) * 100)::numeric, 2) AS overpay_pct,
            rs."saleDate"
        FROM recent_sales rs
        JOIN "Item" i ON i."assetId" = rs."itemId"
        WHERE
            rs.best_price_at_sale IS NOT NULL
            AND rs.implied_sale_price > rs.best_price_at_sale
            AND ((rs.implied_sale_price - rs.best_price_at_sale) / NULLIF(rs.best_price_at_sale, 0)) * 100 >= %s
            AND NOT i.manipulated
    """, (since, PRICE_ABOVE_BEST_PCT))

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, _, old_rap, new_rap, implied_price, best_price, overpay_pct, sale_date in rows:

        # Skip if already a pending flag for this item
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        # Skip if this exact sale has already been flagged at any status.
        # saleDate is stored directly on the flag row — exact match, no string parsing.
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s
              AND "detectionMethod" = 'sale_above_best'
              AND "saleDate" = %s
            LIMIT 1
        """, (asset_id, sale_date))
        if cursor.fetchone():
            logger.debug(
                f"[manip_detector] Skipping sale flag '{name}' — "
                f"sale at {sale_date} already flagged/dismissed"
            )
            continue

        reason = (
            f"Sale implied {overpay_pct:.1f}% above best price "
            f"(best: {int(best_price):,} R$ → implied sale: {int(implied_price):,} R$, new RAP: {int(new_rap):,} R$)"
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "timeWindowHrs", "detectionMethod", "saleDate", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, %s, 'sale_above_best', %s, NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(old_rap), float(overpay_pct), float(TIME_WINDOW_HRS), sale_date))

        logger.info(f"[manip_detector] 🚩 Flagged '{name}' (sale above best price) — {reason}")


# ── Rule 3: unmark suggestions ───────────────────────────────────────────────
def _suggest_unmarks(cursor):
    cursor.execute("""
        WITH latest AS (
            SELECT DISTINCT ON ("itemId") "itemId", rap
            FROM "PriceHistory"
            WHERE rap IS NOT NULL
            ORDER BY "itemId", timestamp DESC
        )
        SELECT i."assetId", i.name, i."manipulatedRap", i."manipulatedAt", l.rap AS current_rap
        FROM "Item" i
        JOIN latest l ON l."itemId" = i."assetId"
        WHERE i.manipulated = TRUE
          AND i."manipulatedRap" IS NOT NULL
          AND i."manipulatedAt" IS NOT NULL
          AND l.rap <= i."manipulatedRap" * 1.1
    """)

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, manipulated_rap, manipulated_at, current_rap in rows:

        # Skip if already a pending unmark suggestion
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'unmark_suggestion' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        # Skip if already accepted or dismissed AFTER the current manipulatedAt
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'unmark_suggestion'
              AND status IN ('accepted', 'dismissed')
              AND "createdAt" > %s
            LIMIT 1
        """, (asset_id, manipulated_at))
        if cursor.fetchone():
            continue

        reason = (
            f"RAP has returned near pre-manipulation levels "
            f"(marked at: {int(manipulated_rap):,} R$, current: {int(current_rap):,} R$)"
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'unmark_suggestion', 'pending', %s, %s, 'unmark_suggestion', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(current_rap)))

        logger.info(f"[manip_detector] 💡 Unmark suggestion for '{name}' — {reason}")