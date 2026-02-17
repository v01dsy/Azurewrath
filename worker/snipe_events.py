"""
worker/snipe_events.py
──────────────────────
Call  fire_snipe_events(cursor, results)  inside save_results_to_db(),
right after the existing notifications block.

It writes qualifying deals to the "SnipeDeal" table so the SSE stream
endpoint can pick them up and push them to browsers in real-time.

Add to your imports at the top of main.py:
    from snipe_events import fire_snipe_events

Then inside save_results_to_db(), after the notification block, add:
    fire_snipe_events(cursor, results)
"""

import uuid
import logging
from io import StringIO

logger = logging.getLogger(__name__)

# Minimum deal % to even bother writing to SnipeDeal.
# Individual users can set higher thresholds in their SnipeConfig.
GLOBAL_MIN_DEAL = 5.0

# Purge SnipeDeal rows older than this many minutes to keep the table tiny.
SNIPE_DEAL_TTL_MINUTES = 5


def fire_snipe_events(cursor, results: list[dict]):
    """
    For every item in `results` that is currently a good deal,
    insert a row into "SnipeDeal".  The SSE endpoint reads this table
    and pushes matching rows to connected browsers.

    `results` is the list produced by process_items_data():
      {
        'asset_id': int,
        'name': str,
        'price': float | None,   # best price (lowest resale)
        'rap': float | None,
      }
    """
    try:
        # 1. Purge stale rows first so the table stays tiny
        cursor.execute(
            """
            DELETE FROM "SnipeDeal"
            WHERE "createdAt" < NOW() - INTERVAL '%s minutes'
            """,
            (SNIPE_DEAL_TTL_MINUTES,)
        )

        # 2. Build rows for qualifying deals
        rows = []
        for r in results:
            price = r.get('price')
            rap = r.get('rap')

            if not price or not rap or rap <= 0:
                continue

            if price >= rap:
                continue

            deal_pct = ((rap - price) / rap) * 100

            if deal_pct < GLOBAL_MIN_DEAL:
                continue

            rows.append((
                str(uuid.uuid4()),   # id
                int(r['asset_id']),  # assetId
                r['name'],           # name
                r.get('image_url'),  # imageUrl (may be None)
                float(price),        # price
                float(rap),          # rap
                round(deal_pct, 2),  # deal %
            ))

        if not rows:
            return

        # 3. Bulk insert
        buffer = StringIO()
        for row in rows:
            parts = []
            for val in row:
                if val is None:
                    parts.append('\\N')
                else:
                    parts.append(str(val).replace('\t', ' ').replace('\n', ' '))
            buffer.write('\t'.join(parts) + '\n')

        buffer.seek(0)
        cursor.copy_from(
            buffer,
            'SnipeDeal',
            columns=('id', 'assetId', 'name', 'imageUrl', 'price', 'rap', 'deal'),
            null='\\N',
        )

        logger.info(f"🎯 SnipeDeal: inserted {len(rows)} deal(s)")

    except Exception as e:
        logger.error(f"❌ fire_snipe_events error: {e}")
        # Don't re-raise — snipe events are non-critical