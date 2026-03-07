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

Dismissal behaviour:
  When a flag is dismissed, the rapAtFlag of that dismissed flag becomes a permanent
  "normal floor" for that item.  A new flag is only raised if the current RAP has grown
  >= DISMISSED_FLOOR_REGROWTH_PCT% above the highest previously-dismissed rapAtFlag.
  There is NO time-based expiry — dismissed means "this is normal now" until something
  meaningfully new happens.

Neither acts automatically — both create pending ManipulationFlag rows
for an admin to Accept or Dismiss in /admin/manipulation.
"""

import uuid, logging, traceback

logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────
RAP_GROWTH_PCT              = 25.0  # % RAP growth within window = suspicious
PRICE_ABOVE_BEST_PCT        = 5.0   # % implied sale above best price = suspicious
TIME_WINDOW_HRS             = 48.0  # look-back window in hours

# How much further above a dismissed floor the RAP must climb before we flag again.
# e.g. dismissed at 10,000 RAP → only re-flag if RAP hits 12,500+ (25% above floor).
DISMISSED_FLOOR_REGROWTH_PCT = 25.0


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

        # Get the highest RAP at which a flag was ever dismissed for this item.
        # That dismissed RAP is the permanent "normal floor".
        # Only re-flag if current RAP is >= DISMISSED_FLOOR_REGROWTH_PCT% above that floor.
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
        """, (str(uuid.uuid4()), int(asset_id), reason, float(rap_start), float(growth_pct), float(hrs)))
        #                                                                   ^^^ pre-spike baseline, not rap_end

        logger.info(f"[manip_detector] 🚩 Flagged '{name}' (RAP growth) — {reason}")


# ── Rule 2: sale implied above best price ────────────────────────────────────
def _flag_sale_above_best_price(cursor):
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
            WHERE s."saleDate" >= NOW() - INTERVAL '%s hours'
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
    """, (TIME_WINDOW_HRS, PRICE_ABOVE_BEST_PCT))

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

        # Same dismissed-floor logic — only re-flag if RAP is meaningfully above
        # the highest RAP that was previously dismissed.
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
            if new_rap < required_rap:
                logger.debug(
                    f"[manip_detector] Skipping sale flag '{name}' — RAP {int(new_rap):,} is below "
                    f"re-flag threshold {int(required_rap):,} (floor: {int(dismissed_floor):,})"
                )
                continue

        reason = (
            f"Sale implied {overpay_pct:.1f}% above best price "
            f"(best: {int(best_price):,} R$ → implied sale: {int(implied_price):,} R$, new RAP: {int(new_rap):,} R$)"
        )
        if dismissed_floor is not None:
            reason += f" [previously dismissed at {int(dismissed_floor):,} R$]"

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "timeWindowHrs", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, %s, 'sale_above_best', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(old_rap), float(overpay_pct), float(TIME_WINDOW_HRS)))
        #                                                                  ^^^ pre-spike baseline, not new_rap

        logger.info(f"[manip_detector] 🚩 Flagged '{name}' (sale above best price) — {reason}")


# ── Rule 3: unmark suggestions ───────────────────────────────────────────────
def _suggest_unmarks(cursor):
    cursor.execute("""
        WITH latest AS (
            SELECT DISTINCT ON ("itemId") "itemId", rap
            FROM "PriceHistory"
            WHERE rap IS NOT NULL
            ORDER BY "itemId", timestamp DESC
        ),
        pre_spike AS (
            -- Last PriceHistory RAP entry strictly before the item was marked.
            -- No arbitrary time offset — items marked quickly after being added still get a baseline.
            SELECT DISTINCT ON (i."assetId") i."assetId",
                ph.rap AS pre_rap
            FROM "Item" i
            JOIN "PriceHistory" ph ON ph."itemId" = i."assetId"
            WHERE i.manipulated = TRUE
              AND i."manipulatedAt" IS NOT NULL
              AND ph.timestamp < i."manipulatedAt"
              AND ph.rap IS NOT NULL
            ORDER BY i."assetId", ph.timestamp DESC
        )
        SELECT i."assetId", i.name, i."manipulatedRap", i."manipulatedAt", l.rap AS current_rap, p.pre_rap
        FROM "Item" i
        JOIN latest l ON l."itemId" = i."assetId"
        LEFT JOIN pre_spike p ON p."assetId" = i."assetId"
        WHERE i.manipulated = TRUE
          AND i."manipulatedRap" IS NOT NULL
          AND i."manipulatedAt" IS NOT NULL
          AND l.rap <= COALESCE(p.pre_rap * 1.1, i."manipulatedRap" * 0.75)
    """)

    rows = cursor.fetchall()
    if not rows:
        return

    for asset_id, name, manipulated_rap, manipulated_at, current_rap, pre_rap in rows:

        # Skip if already a pending unmark suggestion
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'unmark_suggestion' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        # Skip if already accepted or dismissed AFTER the current manipulatedAt.
        # This means it's already been handled for this manipulation event.
        # If RAP changes again (new spike + new drop), manipulatedAt updates and
        # suggestions fire fresh.
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'unmark_suggestion'
              AND status IN ('accepted', 'dismissed')
              AND "createdAt" > %s
            LIMIT 1
        """, (asset_id, manipulated_at))
        if cursor.fetchone():
            continue

        baseline = pre_rap if pre_rap else manipulated_rap * 0.75
        reason = (
            f"RAP has returned near pre-manipulation levels "
            f"(pre-spike: {int(baseline):,} R$, current: {int(current_rap):,} R$, flagged at: {int(manipulated_rap):,} R$)"
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "detectionMethod", "createdAt")
            VALUES (%s, %s, 'unmark_suggestion', 'pending', %s, %s, 'unmark_suggestion', NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(current_rap)))

        logger.info(f"[manip_detector] 💡 Unmark suggestion for '{name}' — {reason}")