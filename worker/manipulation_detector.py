# worker/manipulation_detector.py
"""
Auto-detects potentially manipulated items and suggests unmarks.
Call detect_manipulation(cursor) at the end of save_results_to_db().

Rules:
  MANIPULATION FLAG : RAP grew >= RAP_GROWTH_PCT% within TIME_WINDOW_HRS hours,
                      with no admin dismissal already in place.
  UNMARK SUGGESTION : Item is marked manipulated AND current RAP has fallen
                      back to or below the RAP when it was originally marked.

Neither acts automatically — both create pending ManipulationFlag rows
for an admin to Accept or Dismiss in /admin/manipulation.
"""

import uuid, logging, traceback

logger = logging.getLogger(__name__)

# ── Thresholds (tune as needed) ──────────────────────────────────────────────
RAP_GROWTH_PCT   = 25.0    # % growth within window = suspicious
TIME_WINDOW_HRS  = 48.0    # look-back window in hours
MIN_RAP          = 5_000   # ignore very cheap items (noise)


def detect_manipulation(cursor):
    try:
        _flag_rap_growth(cursor)
        _suggest_unmarks(cursor)
    except Exception as e:
        logger.error(f"[manip_detector] {e}\n{traceback.format_exc()}")


# ── Rule 1: suspicious RAP growth ────────────────────────────────────────────
def _flag_rap_growth(cursor):
    cursor.execute("""
        WITH window AS (
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
            FROM window
        )
        SELECT
            i."assetId", i.name, i.manipulated,
            a.rap_start, a.rap_end,
            ROUND(((a.rap_end - a.rap_start) / NULLIF(a.rap_start, 0)) * 100, 2) AS growth_pct,
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
        # Skip if a pending manipulation flag already exists
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'manipulation' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        # Also skip if there's a dismissed flag in the last 7 days (admin said no recently)
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
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "rapGrowthPct", "timeWindowHrs", "createdAt")
            VALUES (%s, %s, 'manipulation', 'pending', %s, %s, %s, %s, NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(rap_end), float(growth_pct), float(hrs)))

        logger.info(f"[manip_detector] 🚩 Flagged '{name}' — {reason}")


# ── Rule 2: unmark suggestions ───────────────────────────────────────────────
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

    for asset_id, name, manip_rap, current_rap in rows:
        cursor.execute("""
            SELECT 1 FROM "ManipulationFlag"
            WHERE "assetId" = %s AND "flagType" = 'unmark_suggestion' AND status = 'pending'
            LIMIT 1
        """, (asset_id,))
        if cursor.fetchone():
            continue

        reason = (
            f"RAP ({int(current_rap):,} R$) has fallen back to or below the level "
            f"when it was marked ({int(manip_rap):,} R$). May no longer be manipulated."
        )

        cursor.execute("""
            INSERT INTO "ManipulationFlag"
              (id, "assetId", "flagType", status, reason, "rapAtFlag", "createdAt")
            VALUES (%s, %s, 'unmark_suggestion', 'pending', %s, %s, NOW())
        """, (str(uuid.uuid4()), int(asset_id), reason, float(current_rap)))

        logger.info(f"[manip_detector] 💡 Unmark suggestion for '{name}' — {reason}")