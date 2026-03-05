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
                                          back to or below the RAP when it was originally marked.

Neither acts automatically — both create pending ManipulationFlag rows
for an admin to Accept or Dismiss in /admin/manipulation.
"""

import uuid, logging, traceback

logger = logging.getLogger(__name__)

# ── Thresholds (tune as needed) ──────────────────────────────────────────────
RAP_GROWTH_PCT       = 25.0   # % RAP growth within window = suspicious
PRICE_ABOVE_BEST_PCT = 5.0    # % implied sale above best price = suspicious
TIME_WINDOW_HRS      = 48.0   # look-back window in hours
MIN_RAP              = 5_000  # ignore very cheap items (noise)


def detect_manipulation(cursor):
    try:
        _flag_rap_growth(cursor)
        _flag_sale_above_best_price(cursor)
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
            a.rap_start >= %s
            AND a.rap_end > a.rap_start
            AND NOT i.manipulated
            AND ((a.rap_end - a.rap_start) / NULLIF(a.rap_start, 0)) * 100 >= %s
    """, (TIME_WINDOW_HRS, MIN_RAP, RAP_GROWTH_PCT))

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, _, rap_start, rap_end, growth_pct, hrs in rows:
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'dismissed'
              AND "reviewedAt" >= NOW() - INTERVAL '7 days'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        reason = (
            f"RAP grew {growth_pct:.1f}% in {hrs:.1f}h "
            f"({int(rap_start):,} → {int(rap_end):,} R$)"
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "timeWindowHrs", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, %s, 'rap_growth', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(rap_end), float(growth_pct), float(hrs)))

        logger.info(f"[manip_detector] 🚩 Flagged '{name}' (RAP growth) — {reason}")


# ── Rule 2: sale implied above best price ─────────────────────────────────────
def _flag_sale_above_best_price(cursor):
    # FIX: The old query checked `newRap > best_price_at_sale`, which almost never
    # passes because newRap (e.g. 2,545) is usually LESS than the listing price
    # (e.g. 3,398). The correct check is whether the IMPLIED SALE PRICE exceeded
    # the best listing price by >= PRICE_ABOVE_BEST_PCT%.
    # Implied sale price formula: oldRap + ((newRap - oldRap) * 10)
    cursor.execute("""
        WITH recent_sales AS (
            SELECT
                s."itemId",
                s."oldRap",
                s."newRap",
                s."saleDate",
                -- Implied sale price from RAP change
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
            WHERE s."saleDate" >= NOW() - INTERVAL '%s hours'
              AND s."newRap" > s."oldRap"
        )
        SELECT
            rs."itemId",
            i.name,
            i.manipulated,
            rs."newRap",
            rs.implied_sale_price,
            rs.best_price_at_sale,
            ROUND((((rs.implied_sale_price - rs.best_price_at_sale) / NULLIF(rs.best_price_at_sale, 0)) * 100)::numeric, 2) AS overpay_pct,
            rs."saleDate"
        FROM recent_sales rs
        JOIN "Item" i ON i."assetId" = rs."itemId"
        WHERE
            rs.best_price_at_sale IS NOT NULL
            AND rs.best_price_at_sale >= %s
            AND rs.implied_sale_price > rs.best_price_at_sale
            AND ((rs.implied_sale_price - rs.best_price_at_sale) / NULLIF(rs.best_price_at_sale, 0)) * 100 >= %s
            AND NOT i.manipulated
    """, (TIME_WINDOW_HRS, MIN_RAP, PRICE_ABOVE_BEST_PCT))

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, _, new_rap, implied_price, best_price, overpay_pct, sale_date in rows:
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'dismissed'
              AND "reviewedAt" >= NOW() - INTERVAL '7 days'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        reason = (
            f"Sale implied {overpay_pct:.1f}% above best price "
            f"(best: {int(best_price):,} R$ → implied sale: {int(implied_price):,} R$, new RAP: {int(new_rap):,} R$)"
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "timeWindowHrs", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, %s, 'sale_above_best', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(new_rap), float(overpay_pct), float(TIME_WINDOW_HRS)))

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
        SELECT i."assetId", i.name, i."manipulatedRap", l.rap AS current_rap
        FROM "Item" i
        JOIN latest l ON l."itemId" = i."assetId"
        WHERE i.manipulated = TRUE
          AND i."manipulatedRap" IS NOT NULL
          AND l.rap <= i."manipulatedRap"
    """)

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, manipulated_rap, current_rap in rows:
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'unmark_suggestion' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        reason = (
            f"RAP has returned to or below the manipulated RAP "
            f"(marked at: {int(manipulated_rap):,} R$, current: {int(current_rap):,} R$)"
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'unmark_suggestion', 'pending', %s, %s, 'unmark_suggestion', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(current_rap)))

        logger.info(f"[manip_detector] 💡 Unmark suggestion for '{name}' — {reason}")