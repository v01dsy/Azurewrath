# worker/manipulation_detector.py
"""
Auto-detects potentially manipulated items and suggests unmarks.
Call detect_manipulation(cursor) at the end of save_results_to_db().

Rules:
  MANIPULATION FLAG (rap_growth)        : RAP grew >= RAP_GROWTH_PCT% above the true pre-spike
                                          baseline. Baseline is determined by finding the last
                                          "normal" sale (pct_change < NORMAL_SALE_PCT%) immediately
                                          before a spike sale (pct_change >= SPIKE_SALE_PCT%).
                                          This avoids false baselines from time-window averages.
  MANIPULATION FLAG (sale_above_best)   : The implied sale price was >= PRICE_ABOVE_BEST_PCT% above
                                          the item's best listed price at the time of sale.
                                          Implied sale price = oldRap + ((newRap - oldRap) * 10)
  UNMARK SUGGESTION                     : Item is marked manipulated AND current RAP has fallen
                                          back to within 10% of manipulatedRap (the pre-spike
                                          baseline), AND the RAP was at some point significantly
                                          above manipulatedRap after being marked.

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
RAP_GROWTH_PCT               = 25.0   # % above baseline to flag as manipulation
PRICE_ABOVE_BEST_PCT         = 5.0    # % above best price to flag a sale
DISMISSED_FLOOR_REGROWTH_PCT = 25.0   # % above dismissed floor before re-flagging
NORMAL_SALE_PCT              = 10.0   # max % change considered a "normal" sale
SPIKE_SALE_PCT               = 20.0   # min % change on the NEXT sale to confirm spike started


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


# ── Rule 1: suspicious RAP growth (sale-cluster baseline) ────────────────────
def _flag_rap_growth(cursor):
    """
    Find items where the current RAP is significantly above their true pre-spike baseline.

    Baseline detection:
      - Look at each item's sale history
      - Find the last sale where pct_change < NORMAL_SALE_PCT% AND the very next sale
        was >= SPIKE_SALE_PCT% (i.e. the last calm sale before the spike chain began)
      - Use that sale's oldRap as the true baseline
      - If no such transition exists, skip the item (no clear spike pattern)
    """
    cursor.execute("""
        WITH sale_changes AS (
            SELECT
                s."itemId",
                s."oldRap",
                s."newRap",
                s."saleDate",
                CASE
                    WHEN s."oldRap" > 0
                    THEN ((s."newRap" - s."oldRap") / s."oldRap") * 100
                    ELSE 0
                END AS pct_change,
                LEAD(
                    CASE
                        WHEN s."oldRap" > 0
                        THEN ((s."newRap" - s."oldRap") / s."oldRap") * 100
                        ELSE 0
                    END
                ) OVER (PARTITION BY s."itemId" ORDER BY s."saleDate") AS next_pct_change
            FROM "Sale" s
            WHERE s."newRap" > s."oldRap"
        ),
        -- Last normal sale immediately before a spike for each item
        baselines AS (
            SELECT DISTINCT ON ("itemId")
                "itemId",
                "oldRap" AS baseline_rap,
                "saleDate" AS baseline_date
            FROM sale_changes
            WHERE pct_change < %(normal_pct)s
              AND next_pct_change >= %(spike_pct)s
            ORDER BY "itemId", "saleDate" DESC
        ),
        -- Current RAP per item
        current AS (
            SELECT DISTINCT ON ("itemId")
                "itemId",
                rap AS current_rap
            FROM "PriceHistory"
            WHERE rap IS NOT NULL
            ORDER BY "itemId", timestamp DESC
        )
        SELECT
            i."assetId",
            i.name,
            i.manipulated,
            b.baseline_rap,
            c.current_rap,
            ROUND(
                (((c.current_rap - b.baseline_rap) / NULLIF(b.baseline_rap, 0)) * 100)::numeric,
                2
            ) AS growth_pct,
            b.baseline_date
        FROM baselines b
        JOIN current c ON c."itemId" = b."itemId"
        JOIN "Item" i ON i."assetId" = b."itemId"
        WHERE
            c.current_rap > b.baseline_rap
            AND ((c.current_rap - b.baseline_rap) / NULLIF(b.baseline_rap, 0)) * 100 >= %(growth_pct)s
            AND NOT i.manipulated
    """, {
        'normal_pct': NORMAL_SALE_PCT,
        'spike_pct': SPIKE_SALE_PCT,
        'growth_pct': RAP_GROWTH_PCT,
    })

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, _, baseline_rap, current_rap, growth_pct, baseline_date in rows:

        # Skip if already a pending flag for this item
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        # Get the highest RAP at which a rap_growth flag was ever dismissed for this item
        cursor.execute("""
            SELECT MAX("rapAtFlag")
            FROM "ManipulationFlag"
            WHERE "assetId" = %s
              AND "flagType" = 'manipulation'
              AND "detectionMethod" = 'rap_growth'
              AND status = 'dismissed'
        """, (asset_id,))
        row = cursor.fetchone()
        dismissed_floor = row[0] if row and row[0] is not None else None

        if dismissed_floor is not None:
            required_rap = dismissed_floor * (1 + DISMISSED_FLOOR_REGROWTH_PCT / 100)
            if current_rap < required_rap:
                logger.debug(
                    f"[manip_detector] Skipping '{name}' — RAP {int(current_rap):,} is below "
                    f"re-flag threshold {int(required_rap):,} (floor: {int(dismissed_floor):,})"
                )
                continue

        reason = (
            f"RAP grew {growth_pct:.1f}% above pre-spike baseline "
            f"(baseline: {int(baseline_rap):,} → current: {int(current_rap):,} R$)"
        )
        if dismissed_floor is not None:
            reason += f" [previously dismissed at {int(dismissed_floor):,} R$]"

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, 'rap_growth', NOW())
        """, (
            str(uuid.uuid4()),
            int(asset_id),
            reason,
            float(baseline_rap),
            float(growth_pct),
        ))

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

        # Skip if this exact sale has already been flagged at any status
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
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "detectionMethod", "saleDate", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, 'sale_above_best', %s, NOW())
        """, (
            str(uuid.uuid4()),
            int(asset_id),
            reason,
            float(old_rap),
            float(overpay_pct),
            sale_date,
        ))

        logger.info(f"[manip_detector] 🚩 Flagged '{name}' (sale above best price) — {reason}")


# ── Rule 3: unmark suggestions ───────────────────────────────────────────────
def _suggest_unmarks(cursor):
    """
    Suggest unmarking an item if:
      1. It is currently marked manipulated
      2. The RAP has fallen back to within 10% of manipulatedRap
      3. The RAP was at some point >= 25% ABOVE manipulatedRap after being marked
         (confirms it actually spiked and came back down, not just marked at current level)
    """
    cursor.execute("""
        WITH latest AS (
            SELECT DISTINCT ON ("itemId") "itemId", rap
            FROM "PriceHistory"
            WHERE rap IS NOT NULL
            ORDER BY "itemId", timestamp DESC
        ),
        peak_after_mark AS (
            SELECT ph."itemId", MAX(ph.rap) AS peak_rap
            FROM "PriceHistory" ph
            JOIN "Item" i ON i."assetId" = ph."itemId"
            WHERE i.manipulated = TRUE
              AND i."manipulatedAt" IS NOT NULL
              AND ph.timestamp > i."manipulatedAt"
              AND ph.rap IS NOT NULL
            GROUP BY ph."itemId"
        )
        SELECT
            i."assetId", i.name, i."manipulatedRap", i."manipulatedAt",
            l.rap AS current_rap, p.peak_rap
        FROM "Item" i
        JOIN latest l ON l."itemId" = i."assetId"
        JOIN peak_after_mark p ON p."itemId" = i."assetId"
        WHERE i.manipulated = TRUE
          AND i."manipulatedRap" IS NOT NULL
          AND i."manipulatedAt" IS NOT NULL
          AND l.rap <= i."manipulatedRap" * 1.1
          AND p.peak_rap >= i."manipulatedRap" * 1.25
    """)

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, manipulated_rap, manipulated_at, current_rap, peak_rap in rows:

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
              AND "createdAt" > COALESCE(%s, '1970-01-01'::timestamptz)
            LIMIT 1
        """, (asset_id, manipulated_at))
        if cursor.fetchone():
            continue

        reason = (
            f"RAP has returned near pre-manipulation levels "
            f"(baseline: {int(manipulated_rap):,} R$, peaked at: {int(peak_rap):,} R$, "
            f"current: {int(current_rap):,} R$)"
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'unmark_suggestion', 'pending', %s, %s, 'unmark_suggestion', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(current_rap)))

        logger.info(f"[manip_detector] 💡 Unmark suggestion for '{name}' — {reason}")