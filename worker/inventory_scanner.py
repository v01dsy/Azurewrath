# worker/inventory_scanner.py
"""
Inventory scanner — runs as a background thread inside the worker.

Handles two job types from the ScanJob table:
  - "inventory": scan a player's full collectibles inventory + save snapshot
  - "owners":    scan all owners of a specific item

Next.js writes pending ScanJob rows; this scanner picks them up,
processes them, and updates the status. No Vercel timeout limit.
"""

import os
import re
import time
import logging
import threading
import traceback
import uuid
from datetime import datetime, timezone, timedelta

import psycopg2
import psycopg2.extras
import requests

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv('DATABASE_URL', '')
ROBLOX_COOKIE = os.getenv('ROBLOX_SECURITY_COOKIE', '').strip('"').strip("'")

PAGE_DELAY = 1.0
OWNER_PAGE_DELAY = 1.5
UAID_SEARCH_DELAY = 1.0
USER_PROCESS_DELAY = 1.5
BREATHER_INTERVAL = 25     # was 15 — more requests before needing a break
BREATHER_DURATION = 10     # was 21 — shorter rest period
USER_PROCESS_DELAY = 1.0   # was 2.5 — faster between owners


# ─── DB helpers ────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(DATABASE_URL)


def get_today_bounds_utc():
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start, end


def make_cuid():
    """Generate a cuid-like unique ID."""
    import time as t
    ts = hex(int(t.time() * 1000))[2:]
    rand = uuid.uuid4().hex[:16]
    return f"c{ts}{rand}"


# ─── Roblox API helpers ────────────────────────────────────────────────────

def roblox_headers():
    h = {'User-Agent': 'Mozilla/5.0'}
    if ROBLOX_COOKIE:
        h['Cookie'] = f'.ROBLOSECURITY={ROBLOX_COOKIE}'
    return h


def fetch_with_retry(url, max_retries=5, base_delay=3.0, extra_headers=None):
    """GET a URL with exponential backoff on 429 and network errors."""
    headers = roblox_headers()
    if extra_headers:
        headers.update(extra_headers)

    for attempt in range(max_retries):
        try:
            res = requests.get(url, headers=headers, timeout=30)
        except requests.RequestException as e:
            wait = base_delay * (2 ** attempt)
            logger.warning(f"[inventory_scanner] Network error (attempt {attempt+1}): {e} — retrying in {wait}s")
            time.sleep(wait)
            continue

        if res.status_code == 429:
            wait = base_delay * (2 ** attempt)
            logger.warning(f"[inventory_scanner] 429 rate limited — waiting {wait}s (attempt {attempt+1})")
            time.sleep(wait)
            continue

        if res.status_code == 400:
            raise Exception(f"[inventory_scanner] 400 Bad Request: {url}")
        if res.status_code == 404:
            raise Exception(f"[inventory_scanner] 404 Not Found: {url}")
        if not res.ok:
            wait = base_delay * (2 ** attempt)
            logger.warning(f"[inventory_scanner] HTTP {res.status_code} — retrying in {wait}s")
            time.sleep(wait)
            continue

        return res.json()

    raise Exception(f"[inventory_scanner] All {max_retries} retries exhausted for {url}")


# ─── Job queue helpers ─────────────────────────────────────────────────────

def claim_next_job(conn):
    """Atomically claim the next pending job. Returns job dict or None."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            UPDATE "ScanJob"
            SET status = 'running', "updatedAt" = NOW()
            WHERE id = (
                SELECT id FROM "ScanJob"
                WHERE status = 'pending'
                ORDER BY "startedAt" ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        """)
        conn.commit()
        return cur.fetchone()


def update_job(conn, job_id, **kwargs):
    fields = ', '.join(f'"{k}" = %s' for k in kwargs)
    values = list(kwargs.values())
    with conn.cursor() as cur:
        cur.execute(
            f'UPDATE "ScanJob" SET {fields}, "updatedAt" = NOW() WHERE id = %s',
            values + [job_id]
        )
    conn.commit()


def is_stop_requested(conn, job_id):
    with conn.cursor() as cur:
        cur.execute('SELECT status FROM "ScanJob" WHERE id = %s', (job_id,))
        row = cur.fetchone()
        return row and row[0] == 'stopped'


# ─── Ensure items exist in DB ──────────────────────────────────────────────

def ensure_items_exist(conn, asset_ids):
    """Insert placeholder Item rows for any unknown assetIds."""
    if not asset_ids:
        return
    with conn.cursor() as cur:
        cur.execute(
            'SELECT "assetId" FROM "Item" WHERE "assetId" = ANY(%s)',
            (list(asset_ids),)
        )
        existing = {row[0] for row in cur.fetchall()}
        missing = [aid for aid in asset_ids if aid not in existing]
        if missing:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO "Item" ("assetId", name, manipulated, "createdAt", "updatedAt")
                VALUES %s
                ON CONFLICT DO NOTHING
            """, [(aid, f'Unknown Item {aid}', False, datetime.now(timezone.utc), datetime.now(timezone.utc))
                  for aid in missing])
    conn.commit()


# ─── Calculate snapshot totals ─────────────────────────────────────────────

def calculate_snapshot_totals(conn, items):
    """Calculate totalRAP, totalItems, uniqueItems for a list of inventory items."""
    asset_ids = list({item['asset_id'] for item in items})
    if not asset_ids:
        return 0, 0, 0

    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON ("itemId") "itemId", rap
            FROM "PriceHistory"
            WHERE "itemId" = ANY(%s) AND rap IS NOT NULL
            ORDER BY "itemId", timestamp DESC
        """, (asset_ids,))
        rap_map = {row[0]: row[1] for row in cur.fetchall()}

    total_rap = sum(rap_map.get(item['asset_id'], 0) for item in items)
    total_items = len(items)
    unique_items = len(set(item['asset_id'] for item in items))
    return total_rap, total_items, unique_items


# ─── Fetch Roblox user info ────────────────────────────────────────────────

def fetch_user_info(roblox_user_id):
    try:
        data = fetch_with_retry(f'https://users.roblox.com/v1/users/{roblox_user_id}')
        return data
    except Exception as e:
        logger.warning(f"[inventory_scanner] Could not fetch user info for {roblox_user_id}: {e}")
        return None


def fetch_headshot(roblox_user_id):
    try:
        data = fetch_with_retry(
            f'https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={roblox_user_id}&size=150x150&format=Webp'
        )
        if data and data.get('data'):
            return data['data'][0].get('imageUrl')
    except Exception as e:
        logger.warning(f"[inventory_scanner] Could not fetch headshot for {roblox_user_id}: {e}")
    return None


# ─── Scan full inventory ───────────────────────────────────────────────────

def scan_full_inventory(roblox_user_id):
    """Fetch all collectibles pages for a user. Returns list of item dicts."""
    full_inventory = []
    cursor = None
    page_count = 0

    logger.info(f"🔍 Starting inventory scan for userId: {roblox_user_id}")

    while True:
        url = f'https://inventory.roblox.com/v1/users/{roblox_user_id}/assets/collectibles?sortOrder=Asc&limit=100'
        if cursor:
            url += f'&cursor={cursor}'

        page_count += 1
        logger.info(f"📄 Fetching page {page_count}, current total: {len(full_inventory)}")

        try:
            data = fetch_with_retry(url)
        except Exception as e:
            logger.error(f"[inventory_scanner] Failed to fetch inventory page {page_count}: {e}")
            break

        items = data.get('data', [])
        if not items and page_count == 1:
            logger.info("[inventory_scanner] ✅ User has empty collectibles inventory")
            break

        for item in items:
            if not item.get('assetId') or not item.get('userAssetId'):
                continue
            full_inventory.append({
                'asset_id': item['assetId'],
                'user_asset_id': item['userAssetId'],
                'serial_number': item.get('serialNumber'),
                'name': item.get('name', f"Unknown Item {item['assetId']}"),
                'is_on_hold': item.get('isOnHold', False),
            })

        logger.info(f"[inventory_scanner] ✅ Page {page_count} added {len(items)} items. Total: {len(full_inventory)}")

        cursor = data.get('nextPageCursor')
        if not cursor:
            break

        time.sleep(PAGE_DELAY)

    logger.info(f"[inventory_scanner] ✅ Fetched {len(full_inventory)} items in {page_count} pages")
    return full_inventory


# ─── UAID cursor cache ─────────────────────────────────────────────────────

def get_cached_cursor(conn, asset_id, target_uaid):
    """Find the closest cached cursor below target_uaid for this asset."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT cursor, "pageNum"
            FROM "UaidCursorCache"
            WHERE "assetId" = %s AND "lastUaid" < %s
            ORDER BY "lastUaid" DESC
            LIMIT 1
        """, (asset_id, target_uaid))
        row = cur.fetchone()
        if row:
            return row[0], row[1]
    return None, 0


def save_cursor(conn, asset_id, cursor_str, last_uaid, page_num):
    """Save a cursor checkpoint, skip if duplicate."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO "UaidCursorCache" (id, "assetId", cursor, "lastUaid", "pageNum", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT ("assetId", "lastUaid") DO NOTHING
            """, (make_cuid(), asset_id, cursor_str, last_uaid, page_num))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.warning(f"[inventory_scanner] Could not save cursor cache: {e}")


# ─── Fetch UAID timestamps from owners API ────────────────────────────────

def fetch_uaid_timestamps(conn, asset_id, user_asset_id):
    """
    Page through the owners API to find this UAID and get its created/updated timestamps.
    Uses cursor cache to resume from closest known position.
    If not found on the expected page, checks 1 page back and 1 page forward.
    Returns (created, updated) or (None, None).
    """
    target_uaid = int(user_asset_id)
    page_num = 0
    requests_since_break = 0
    last_page_num_reached = 0

    cached_cursor, cached_page = get_cached_cursor(conn, asset_id, target_uaid)
    cursor = cached_cursor
    if cursor:
        page_num = cached_page
        logger.info(f"[UAID search] Resuming from cached cursor at page ~{page_num}")

    while True:
        url = f'https://inventory.roblox.com/v2/assets/{asset_id}/owners?limit=100&sortOrder=Asc'
        if cursor:
            url += f'&cursor={cursor}'

        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
        except Exception as e:
            logger.warning(f"[UAID search] Failed to fetch page: {e}")
            break

        entries = data.get('data', [])
        page_num += 1
        last_page_num_reached = page_num

        if not entries:
            break

        next_cursor = data.get('nextPageCursor')

        # Save the cursor used to reach this page, with lastUaid from next_cursor
        if next_cursor:
            last_uaid_from_cursor = int(next_cursor.split('_')[0])
            save_cursor(conn, asset_id, cursor, last_uaid_from_cursor, page_num - 1)

            if last_uaid_from_cursor < target_uaid:
                logger.info(f"[inventory_scanner] [UAID search] Page {page_num}: lastUaid={last_uaid_from_cursor} < target={target_uaid}, skipping")
                cursor = next_cursor
                requests_since_break += 1
                if requests_since_break >= BREATHER_INTERVAL:
                    logger.info(f"[inventory_scanner] ⏸️ [UAID search] Taking {BREATHER_DURATION}s breather...")
                    time.sleep(BREATHER_DURATION)
                    requests_since_break = 0
                else:
                    time.sleep(UAID_SEARCH_DELAY)
                continue

        # Scan every entry on this page
        for entry in entries:
            if int(entry.get('id', 0)) == target_uaid:
                logger.info(f"[inventory_scanner] [UAID search] Found on page {page_num}")
                return entry.get('created'), entry.get('updated')

        logger.info(f"[inventory_scanner] [UAID search] Page {page_num}: not found — trying fallback")
        break

    # ── Fallback: check 1 page back and 1 page forward ────────────────────
    pages_to_check = []

    # 1 page back
    if last_page_num_reached - 1 > 0:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cursor FROM "UaidCursorCache"
                WHERE "assetId" = %s AND "pageNum" = %s
                LIMIT 1
            """, (asset_id, last_page_num_reached - 1))
            row = cur.fetchone()
            if row:
                pages_to_check.append(('back', row[0]))

    # 1 page forward
    with conn.cursor() as cur:
        cur.execute("""
            SELECT cursor FROM "UaidCursorCache"
            WHERE "assetId" = %s AND "pageNum" = %s
            LIMIT 1
        """, (asset_id, last_page_num_reached))
        row = cur.fetchone()
        if row:
            pages_to_check.append(('forward', row[0]))

    for direction, fallback_cursor in pages_to_check:
        logger.info(f"[inventory_scanner] [UAID search] Fallback: checking 1 page {direction} (from page {last_page_num_reached})...")
        url = f'https://inventory.roblox.com/v2/assets/{asset_id}/owners?limit=100&sortOrder=Asc'
        if fallback_cursor:
            url += f'&cursor={fallback_cursor}'
        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
            for entry in data.get('data', []):
                if int(entry.get('id', 0)) == target_uaid:
                    logger.info(f"[inventory_scanner] [UAID search] Found in fallback ({direction})")
                    return entry.get('created'), entry.get('updated')
        except Exception as e:
            logger.warning(f"[inventory_scanner] [UAID search] Fallback fetch failed ({direction}): {e}")

    logger.info(f"[inventory_scanner] [UAID search] Not found after fallback — giving up")
    return None, None

# ─── Phase 2 concurrency limiter ──────────────────────────────────────────
PHASE2_SEMAPHORE = threading.Semaphore(4)


def backfill_timestamps(conn, snapshot_id, uaids_to_backfill):
    """
    For each new UAID, find its created/updated timestamps from the owners API
    and update the InventoryItem row.
    Max 4 concurrent Phase 2 threads via semaphore.
    """
    with PHASE2_SEMAPHORE:
        logger.info(f"[inventory_scanner] 🕐 [Phase 2] Backfilling timestamps for {len(uaids_to_backfill)} UAIDs...")

        for uaid_info in uaids_to_backfill:
            user_asset_id = uaid_info['user_asset_id']
            asset_id = uaid_info['asset_id']

            try:
                created, updated = fetch_uaid_timestamps(conn, asset_id, user_asset_id)

                if not created and not updated:
                    logger.info(f"[inventory_scanner] [Phase 2 UAID {user_asset_id}] No timestamps found")
                    time.sleep(30)
                    continue

                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE "InventoryItem"
                        SET
                            "uaidCreatedAt" = COALESCE("uaidCreatedAt", %s),
                            "uaidUpdatedAt" = %s
                        WHERE "snapshotId" = %s AND "userAssetId" = %s
                    """, (
                        datetime.fromisoformat(created.replace('Z', '+00:00')) if created else None,
                        datetime.fromisoformat(updated.replace('Z', '+00:00')) if updated else None,
                        snapshot_id,
                        user_asset_id
                    ))
                conn.commit()
                logger.info(f"[inventory_scanner] [Phase 2 UAID {user_asset_id}] ✅ created={created} updated={updated}")

            except Exception as e:
                conn.rollback()
                logger.warning(f"[inventory_scanner] [Phase 2 UAID {user_asset_id}] Failed: {e}")

            time.sleep(30)

        logger.info("[inventory_scanner] ✅ [Phase 2] Timestamp backfill complete")


# ─── Save inventory snapshot ───────────────────────────────────────────────

def save_inventory_snapshot(conn, user_id, roblox_user_id, skip_phase2=False):
    """
    Full port of inventoryTracker.ts saveInventorySnapshot.
    Phase 1: save snapshot immediately with isOnHold.
    Phase 2: backfill UAID timestamps in background (fire and forget thread).
    """
    logger.info(f"\n========== INVENTORY SCAN ==========")
    logger.info(f"userId: {user_id} | robloxUserId: {roblox_user_id}")

    # Find latest snapshot
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT id, "createdAt"
            FROM "InventorySnapshot"
            WHERE "userId" = %s
            ORDER BY "createdAt" DESC
            LIMIT 1
        """, (user_id,))
        latest_snapshot = cur.fetchone()

    # Fetch current inventory from Roblox
    full_inventory = scan_full_inventory(str(roblox_user_id))
    current_uaid_set = {str(item['user_asset_id']) for item in full_inventory}
    roblox_item_map = {str(item['user_asset_id']): item for item in full_inventory}

    # Ensure all items exist in Item table
    asset_ids = list({item['asset_id'] for item in full_inventory})
    ensure_items_exist(conn, asset_ids)

    today_start, today_end = get_today_bounds_utc()
    now = datetime.now(timezone.utc)

    # ── FIRST SCAN EVER ──────────────────────────────────────────────────
    if not latest_snapshot:
        logger.info("[inventory_scanner] FIRST EVER scan — Phase 1: saving snapshot...")

        item_rows = []
        for item in full_inventory:
            item_rows.append({
                'asset_id': item['asset_id'],
                'user_asset_id': item['user_asset_id'],
                'serial_number': item.get('serial_number'),
                'is_on_hold': item.get('is_on_hold', False),
            })

        total_rap, total_items, unique_items = calculate_snapshot_totals(conn, item_rows)
        snapshot_id = make_cuid()

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO "InventorySnapshot" (id, "userId", "totalRAP", "totalItems", "uniqueItems", "createdAt")
                VALUES (%s, %s, %s, %s, %s, NOW())
            """, (snapshot_id, user_id, total_rap, total_items, unique_items))

            psycopg2.extras.execute_values(cur, """
                INSERT INTO "InventoryItem"
                    ("snapshotId", "assetId", "userAssetId", "serialNumber", "isOnHold", "scannedAt",
                     "uaidCreatedAt", "uaidUpdatedAt")
                VALUES %s
                ON CONFLICT DO NOTHING
            """, [(
                snapshot_id,
                row['asset_id'],
                row['user_asset_id'],
                row['serial_number'],
                row['is_on_hold'],
                now,
                None,
                None,
            ) for row in item_rows])

        conn.commit()
        logger.info(f"[inventory_scanner] ✅ [Phase 1] FIRST snapshot created (ID: {snapshot_id}, {len(item_rows)} items)")

        # Phase 2 — backfill all items
        uaids_to_backfill = [
            {'user_asset_id': item['user_asset_id'], 'asset_id': item['asset_id']}
            for item in full_inventory
        ]
        if uaids_to_backfill and not skip_phase2:
            t = threading.Thread(
                target=backfill_timestamps,
                args=(get_conn(), snapshot_id, uaids_to_backfill),
                daemon=True
            )
            t.start()
        return snapshot_id

    # ── SUBSEQUENT SCAN ───────────────────────────────────────────────────
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT "userAssetId", "assetId", "serialNumber", "scannedAt",
                   "uaidCreatedAt", "uaidUpdatedAt", "isOnHold"
            FROM "InventoryItem"
            WHERE "snapshotId" = %s
        """, (latest_snapshot['id'],))
        prev_items = cur.fetchall()

    prev_uaid_set = {str(row['userAssetId']) for row in prev_items}
    prev_item_map = {str(row['userAssetId']): row for row in prev_items}

    new_uaids = current_uaid_set - prev_uaid_set
    removed_uaids = prev_uaid_set - current_uaid_set

    logger.info(f"[inventory_scanner] Changes: {len(new_uaids)} new, {len(removed_uaids)} removed")

    all_items = []
    unchanged_count = 0

    # Unchanged items — preserve timestamps, refresh isOnHold
    for row in prev_items:
        uaid_str = str(row['userAssetId'])
        if uaid_str in current_uaid_set:
            fresh = roblox_item_map.get(uaid_str, {})
            all_items.append({
                'asset_id': row['assetId'],
                'user_asset_id': row['userAssetId'],
                'serial_number': row['serialNumber'],
                'scanned_at': row['scannedAt'],
                'uaid_created_at': row['uaidCreatedAt'],
                'uaid_updated_at': row['uaidUpdatedAt'],
                'is_on_hold': fresh.get('is_on_hold', False),
            })
            unchanged_count += 1

    # New items
    for uaid in new_uaids:
        item = roblox_item_map.get(uaid)
        if not item:
            continue
        all_items.append({
            'asset_id': item['asset_id'],
            'user_asset_id': item['user_asset_id'],
            'serial_number': item.get('serial_number'),
            'scanned_at': now,
            'uaid_created_at': None,
            'uaid_updated_at': None,
            'is_on_hold': item.get('is_on_hold', False),
        })

    logger.info(f"[inventory_scanner] Total items for snapshot: {len(all_items)}")
    total_rap, total_items, unique_items = calculate_snapshot_totals(conn, all_items)

    # Check if today's snapshot exists
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM "InventorySnapshot"
            WHERE "userId" = %s AND "createdAt" >= %s AND "createdAt" <= %s
            LIMIT 1
        """, (user_id, today_start, today_end))
        todays_snapshot = cur.fetchone()

    if todays_snapshot:
        snapshot_id = todays_snapshot[0]
        logger.info(f"[inventory_scanner] [Phase 1] Updating TODAY'S snapshot (ID: {snapshot_id})...")

        with conn.cursor() as cur:
            if removed_uaids:
                cur.execute("""
                    DELETE FROM "InventoryItem"
                    WHERE "snapshotId" = %s AND "userAssetId" = ANY(%s)
                """, (snapshot_id, [int(u) for u in removed_uaids]))

            if new_uaids:
                new_rows = [item for item in all_items if str(item['user_asset_id']) in new_uaids]
                psycopg2.extras.execute_values(cur, """
                    INSERT INTO "InventoryItem"
                        ("snapshotId", "assetId", "userAssetId", "serialNumber", "isOnHold",
                         "scannedAt", "uaidCreatedAt", "uaidUpdatedAt")
                    VALUES %s
                    ON CONFLICT DO NOTHING
                """, [(
                    snapshot_id,
                    row['asset_id'],
                    row['user_asset_id'],
                    row['serial_number'],
                    row['is_on_hold'],
                    now,
                    None,
                    None,
                ) for row in new_rows])

            for item in all_items:
                if str(item['user_asset_id']) not in new_uaids:
                    cur.execute("""
                        UPDATE "InventoryItem"
                        SET "isOnHold" = %s
                        WHERE "snapshotId" = %s AND "userAssetId" = %s
                    """, (item['is_on_hold'], snapshot_id, item['user_asset_id']))

            cur.execute("""
                UPDATE "InventorySnapshot"
                SET "totalRAP" = %s, "totalItems" = %s, "uniqueItems" = %s, "createdAt" = NOW()
                WHERE id = %s
            """, (total_rap, total_items, unique_items, snapshot_id))

        conn.commit()
        logger.info(f"[inventory_scanner] ✅ [Phase 1] UPDATED today's snapshot ({len(all_items)} items)")

    else:
        snapshot_id = make_cuid()
        logger.info(f"[inventory_scanner] [Phase 1] Creating NEW snapshot for new day (ID: {snapshot_id})...")

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO "InventorySnapshot" (id, "userId", "totalRAP", "totalItems", "uniqueItems", "createdAt")
                VALUES (%s, %s, %s, %s, %s, NOW())
            """, (snapshot_id, user_id, total_rap, total_items, unique_items))

            psycopg2.extras.execute_values(cur, """
                INSERT INTO "InventoryItem"
                    ("snapshotId", "assetId", "userAssetId", "serialNumber", "isOnHold",
                     "scannedAt", "uaidCreatedAt", "uaidUpdatedAt")
                VALUES %s
                ON CONFLICT DO NOTHING
            """, [(
                snapshot_id,
                item['asset_id'],
                item['user_asset_id'],
                item['serial_number'],
                item['is_on_hold'],
                item['scanned_at'],
                item['uaid_created_at'],
                item['uaid_updated_at'],
            ) for item in all_items])

        conn.commit()
        logger.info(f"[inventory_scanner] ✅ [Phase 1] NEW snapshot created ({len(all_items)} items)")

    # Phase 2 — backfill new UAIDs AND existing UAIDs with null timestamps
    uaids_to_backfill = []

    if new_uaids:
        uaids_to_backfill += [
            {'user_asset_id': roblox_item_map[u]['user_asset_id'], 'asset_id': roblox_item_map[u]['asset_id']}
            for u in new_uaids if u in roblox_item_map
        ]

    # Also pick up existing items with null timestamps
    for item in all_items:
        if str(item['user_asset_id']) not in new_uaids:
            if item.get('uaid_created_at') is None or item.get('uaid_updated_at') is None:
                uaids_to_backfill.append({
                    'user_asset_id': item['user_asset_id'],
                    'asset_id': item['asset_id'],
                })

    if uaids_to_backfill and not skip_phase2:
        t = threading.Thread(
            target=backfill_timestamps,
            args=(get_conn(), snapshot_id, uaids_to_backfill),
            daemon=True
        )
        t.start()

    logger.info("====================================\n")
    return snapshot_id

# ─── Backfill UAID timestamps by UAID only (no userId) ────────────────────

def backfill_uaid_by_uaid(conn, uaid, created, updated):
    """Update all InventoryItem rows for this UAID across all snapshots."""
    if not created and not updated:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE "InventoryItem"
                SET
                    "uaidCreatedAt" = COALESCE("uaidCreatedAt", %s),
                    "uaidUpdatedAt" = %s
                WHERE "userAssetId" = %s
            """, (
                datetime.fromisoformat(created.replace('Z', '+00:00')) if created else None,
                datetime.fromisoformat(updated.replace('Z', '+00:00')) if updated else None,
                uaid
            ))
        conn.commit()
        if cur.rowcount > 0:
            logger.info(f"📅 Backfilled null-owner UAID {uaid}: created={created}, updated={updated}")
    except Exception as e:
        conn.rollback()
        logger.warning(f"Could not backfill UAID {uaid}: {e}")


# ─── Owner scan ────────────────────────────────────────────────────────────

def process_owner_entry(conn, entry, asset_id, job_id):
    """Process a single owner entry from the owners API."""
    owner = entry.get('owner')
    roblox_user_id = owner.get('id') if owner else None
    entry_uaid = entry.get('id')
    entry_created = entry.get('created')
    entry_updated = entry.get('updated')

    if not roblox_user_id:
        if entry_uaid:
            backfill_uaid_by_uaid(conn, entry_uaid, entry_created, entry_updated)
        return 'null'

    roblox_user_id = str(roblox_user_id)

    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, "createdAt" FROM "InventorySnapshot"
            WHERE "userId" = %s
            ORDER BY "createdAt" DESC
            LIMIT 1
        """, (roblox_user_id,))
        existing = cur.fetchone()

    if existing:
        logger.info(f"[inventory_scanner] ⏭️ Already scanned — skipping inventory scan")
        if entry_uaid:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE "InventoryItem" ii
                    SET
                        "uaidCreatedAt" = COALESCE(ii."uaidCreatedAt", %s),
                        "uaidUpdatedAt" = %s
                    FROM "InventorySnapshot" snap
                    WHERE ii."snapshotId" = snap.id
                      AND snap."userId" = %s
                      AND ii."userAssetId" = %s
                """, (
                    datetime.fromisoformat(entry_created.replace('Z', '+00:00')) if entry_created else None,
                    datetime.fromisoformat(entry_updated.replace('Z', '+00:00')) if entry_updated else None,
                    roblox_user_id,
                    entry_uaid
                ))
            conn.commit()
        return 'skipped'

    logger.info(f"   📦 New user {roblox_user_id} — fetching info and scanning inventory...")

    user_info = fetch_user_info(roblox_user_id)
    headshot = fetch_headshot(roblox_user_id)

    username = f'user_{roblox_user_id}'
    display_name = username
    avatar_url = headshot
    description = None

    if user_info:
        username = user_info.get('name') or user_info.get('displayName') or username
        display_name = user_info.get('displayName') or username
        description = user_info.get('description')

    update_job(conn, job_id, currentUser=username)

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO "User" ("robloxUserId", username, "displayName", "avatarUrl", description,
                                "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT ("robloxUserId") DO UPDATE SET
                username = EXCLUDED.username,
                "displayName" = EXCLUDED."displayName",
                "avatarUrl" = EXCLUDED."avatarUrl",
                description = EXCLUDED.description,
                "updatedAt" = NOW()
        """, (roblox_user_id, username, display_name, avatar_url, description))
    conn.commit()

    try:
        snapshot_id = save_inventory_snapshot(conn, roblox_user_id, roblox_user_id)

        if entry_uaid and snapshot_id:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE "InventoryItem"
                    SET
                        "uaidCreatedAt" = COALESCE("uaidCreatedAt", %s),
                        "uaidUpdatedAt" = %s
                    WHERE "snapshotId" = %s AND "userAssetId" = %s
                """, (
                    datetime.fromisoformat(entry_created.replace('Z', '+00:00')) if entry_created else None,
                    datetime.fromisoformat(entry_updated.replace('Z', '+00:00')) if entry_updated else None,
                    snapshot_id,
                    entry_uaid
                ))
            conn.commit()

        return 'processed'
    except Exception as e:
        logger.error(f"   ❌ Failed to scan inventory for {roblox_user_id}: {e}")
        return 'failed'

# ─── owner scan job ────────────────────────────────────────────────────

def run_owners_scan(conn, job):
    """Full owner scan for an item — port of scanOwnersStreaming."""
    asset_id = job['assetId']
    job_id = job['id']

    logger.info(f"\n🚀 ========== OWNER SCAN START ==========")
    logger.info(f"📦 Asset: {asset_id} | Job: {job_id}")

    base_url = f'https://inventory.roblox.com/v2/assets/{asset_id}/owners?limit=100&sortOrder=Asc'
    cursor = None
    page_num = 0
    processed = 0
    skipped = 0
    failed = 0
    null_count = 0
    total = 0

    logger.info("⏳ Cold start delay 3s...")
    time.sleep(3)

    while True:
        if is_stop_requested(conn, job_id):
            logger.info("🛑 Stop requested — halting")
            break

        url = base_url + (f'&cursor={cursor}' if cursor else '')

        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
        except Exception as e:
            logger.error(f"❌ Failed to fetch page {page_num + 1}: {e}")
            break

        page_num += 1
        entries = data.get('data', [])
        valid = [e for e in entries if e.get('owner') and e['owner'].get('id')]
        null_entries = [e for e in entries if not (e.get('owner') and e['owner'].get('id'))]

        logger.info(f"📄 Page {page_num}: {len(valid)} valid, {len(null_entries)} null")

        total += len(valid)
        update_job(conn, job_id, total=total, pagesFound=page_num)

        for entry in null_entries:
            if entry.get('id'):
                backfill_uaid_by_uaid(conn, entry['id'], entry.get('created'), entry.get('updated'))
                null_count += 1

        for entry in valid:
            if is_stop_requested(conn, job_id):
                break

            owner_id = entry['owner']['id']
            logger.info(f"\n👤 [{processed + skipped + 1}/{total}] userId: {owner_id}")
            update_job(conn, job_id, currentUser=f'userId:{owner_id}', processed=processed + skipped)

            result = process_owner_entry(conn, entry, asset_id, job_id)
            if result == 'processed':
                processed += 1
            elif result == 'skipped':
                skipped += 1
            elif result == 'failed':
                failed += 1

            update_job(conn, job_id, processed=processed + skipped, failed=failed)
            time.sleep(USER_PROCESS_DELAY)

        next_cursor = data.get('nextPageCursor')

        # Save cursor checkpoint for future UAID searches on this asset
        if next_cursor:
            try:
                last_uaid = int(next_cursor.split('_')[0])
                save_cursor(conn, asset_id, cursor, last_uaid, page_num - 1)
                logger.info(f"💾 Saved cursor for page {page_num - 1}, lastUaid={last_uaid}")
            except Exception as e:
                logger.warning(f"Could not save cursor cache for page {page_num}: {e}")

        cursor = next_cursor
        if not cursor:
            break

        time.sleep(OWNER_PAGE_DELAY)

    final_status = 'stopped' if is_stop_requested(conn, job_id) else 'done'
    update_job(conn, job_id, status=final_status, currentUser=None,
               processed=processed + skipped, failed=failed)

    logger.info(f"\n{'🛑 SCAN STOPPED' if final_status == 'stopped' else '🎉 SCAN COMPLETE'} — Asset: {asset_id}")
    logger.info(f"   ✅ Scanned: {processed} | ⏭️ Skipped: {skipped} | ❌ Failed: {failed} | 🚫 Null: {null_count}")


# ─── FULL owner scan job ────────────────────────────────────────────────────

def run_owners_full_scan(conn, job):
    """
    Full owner scan — like run_owners_scan but also processes unknown users.
    For unknown users: add to DB, scan inventory, grab timestamps for this UAID only.
    For known users: only update null timestamps for this asset's UAIDs.
    """
    asset_id = job['assetId']
    job_id = job['id']

    logger.info(f"\n[inventory_scanner] 🚀 ========== FULL OWNER SCAN START ==========")
    logger.info(f"[inventory_scanner] 📦 Asset: {asset_id} | Job: {job_id}")

    base_url = f'https://inventory.roblox.com/v2/assets/{asset_id}/owners?limit=100&sortOrder=Asc'
    cursor = None
    page_num = 0
    processed = 0
    skipped = 0
    failed = 0
    null_count = 0
    total = 0

    time.sleep(3)

    while True:
        if is_stop_requested(conn, job_id):
            logger.info("🛑 Stop requested — halting")
            break

        url = base_url + (f'&cursor={cursor}' if cursor else '')

        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
        except Exception as e:
            logger.error(f"❌ Failed to fetch page {page_num + 1}: {e}")
            break

        page_num += 1
        entries = data.get('data', [])
        valid = [e for e in entries if e.get('owner') and e['owner'].get('id')]
        null_entries = [e for e in entries if not (e.get('owner') and e['owner'].get('id'))]

        logger.info(f"[inventory_scanner] 📄 Page {page_num}: {len(valid)} valid, {len(null_entries)} null")

        total += len(valid)
        update_job(conn, job_id, total=total, pagesFound=page_num)

        # Handle null-owner entries the same as regular scan
        for entry in null_entries:
            if entry.get('id'):
                backfill_uaid_by_uaid(conn, entry['id'], entry.get('created'), entry.get('updated'))
                null_count += 1

        for entry in valid:
            if is_stop_requested(conn, job_id):
                break

            owner_id = int(entry['owner']['id'])
            entry_uaid = entry.get('id')
            entry_created = entry.get('created')
            entry_updated = entry.get('updated')

            logger.info(f"[inventory_scanner] 👤 [{processed + skipped + 1}/{total}] userId: {owner_id}")
            update_job(conn, job_id, currentUser=f'userId:{owner_id}', processed=processed + skipped)

            # Check if user exists in DB
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id FROM "InventorySnapshot"
                    WHERE "userId" = %s
                    ORDER BY "createdAt" DESC
                    LIMIT 1
                """, (owner_id,))
                existing_snapshot = cur.fetchone()

            if existing_snapshot:
                # User already in DB — only update null timestamps for this UAID
                if entry_uaid and (entry_created or entry_updated):
                    with conn.cursor() as cur:
                        cur.execute("""
                            UPDATE "InventoryItem" ii
                            SET
                                "uaidCreatedAt" = COALESCE(ii."uaidCreatedAt", %s),
                                "uaidUpdatedAt" = COALESCE(ii."uaidUpdatedAt", %s)
                            FROM "InventorySnapshot" snap
                            WHERE ii."snapshotId" = snap.id
                              AND snap."userId" = %s
                              AND ii."userAssetId" = %s
                              AND (ii."uaidCreatedAt" IS NULL OR ii."uaidUpdatedAt" IS NULL)
                        """, (
                            datetime.fromisoformat(entry_created.replace('Z', '+00:00')) if entry_created else None,
                            datetime.fromisoformat(entry_updated.replace('Z', '+00:00')) if entry_updated else None,
                            owner_id,
                            entry_uaid
                        ))
                    conn.commit()
                    logger.info(f"[inventory_scanner] ✅ Updated timestamps for existing user {owner_id}")
                else:
                    logger.info(f"[inventory_scanner] ⏭️ Timestamps already set for {owner_id} — skipping")
                skipped += 1
            else:
                # New user — add to DB, scan inventory, timestamps for this UAID only
                logger.info(f"[inventory_scanner] 📦 New user {owner_id} — fetching info and scanning inventory...")

                user_info = fetch_user_info(owner_id)
                headshot = fetch_headshot(owner_id)

                username = f'user_{owner_id}'
                display_name = username
                if user_info:
                    username = user_info.get('name') or username
                    display_name = user_info.get('displayName') or username

                update_job(conn, job_id, currentUser=username)

                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO "User" ("robloxUserId", username, "displayName", "avatarUrl",
                                           "createdAt", "updatedAt")
                        VALUES (%s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT ("robloxUserId") DO UPDATE SET
                            username = EXCLUDED.username,
                            "displayName" = EXCLUDED."displayName",
                            "avatarUrl" = EXCLUDED."avatarUrl",
                            "updatedAt" = NOW()
                    """, (owner_id, username, display_name, headshot))
                conn.commit()

                try:
                    # Scan inventory but skip Phase 2 (we handle this UAID's timestamps manually)
                    snapshot_id = save_inventory_snapshot(conn, owner_id, owner_id, skip_phase2=True)

                    # Now set timestamps for just this UAID
                    if entry_uaid and snapshot_id:
                        with conn.cursor() as cur:
                            cur.execute("""
                                UPDATE "InventoryItem"
                                SET
                                    "uaidCreatedAt" = COALESCE("uaidCreatedAt", %s),
                                    "uaidUpdatedAt" = COALESCE("uaidUpdatedAt", %s)
                                WHERE "snapshotId" = %s AND "userAssetId" = %s
                            """, (
                                datetime.fromisoformat(entry_created.replace('Z', '+00:00')) if entry_created else None,
                                datetime.fromisoformat(entry_updated.replace('Z', '+00:00')) if entry_updated else None,
                                snapshot_id,
                                entry_uaid
                            ))
                        conn.commit()
                        logger.info(f"[inventory_scanner] ✅ Set timestamps for UAID {entry_uaid}")

                    processed += 1
                except Exception as e:
                    logger.error(f"[inventory_scanner] ❌ Failed to process new user {owner_id}: {e}")
                    failed += 1

            update_job(conn, job_id, processed=processed + skipped, failed=failed)
            time.sleep(USER_PROCESS_DELAY)

        next_cursor = data.get('nextPageCursor')
        if next_cursor:
            try:
                last_uaid = int(next_cursor.split('_')[0])
                save_cursor(conn, asset_id, cursor, last_uaid, page_num - 1)
            except Exception as e:
                logger.warning(f"Could not save cursor: {e}")

        cursor = next_cursor
        if not cursor:
            break

        time.sleep(OWNER_PAGE_DELAY)

    final_status = 'stopped' if is_stop_requested(conn, job_id) else 'done'
    update_job(conn, job_id, status=final_status, currentUser=None,
               processed=processed + skipped, failed=failed)

    logger.info(f"\n[inventory_scanner] {'🛑 SCAN STOPPED' if final_status == 'stopped' else '🎉 FULL SCAN COMPLETE'}")
    logger.info(f"[inventory_scanner]   ✅ New users: {processed} | ⏭️ Skipped: {skipped} | ❌ Failed: {failed} | 🚫 Null: {null_count}")




# ─── Inventory scan job ────────────────────────────────────────────────────

def run_inventory_scan(conn, job):
    """Handle a single inventory scan job."""
    user_id = job.get('userId')
    job_id = job['id']

    if not user_id:
        logger.error(f"Job {job_id} has no userId — skipping")
        update_job(conn, job_id, status='done')
        return

    logger.info(f"\n[inventory_scanner] 📦 INVENTORY SCAN JOB — userId: {user_id}")

    try:
        with conn.cursor() as cur:
            cur.execute('SELECT "robloxUserId" FROM "User" WHERE "robloxUserId" = %s', (user_id,))
            user_exists = cur.fetchone()

        if not user_exists:
            user_info = fetch_user_info(str(user_id))
            headshot = fetch_headshot(str(user_id))
            username = f'user_{user_id}'
            display_name = username
            if user_info:
                username = user_info.get('name') or username
                display_name = user_info.get('displayName') or username

            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO "User" ("robloxUserId", username, "displayName", "avatarUrl",
                                       "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT DO NOTHING
                """, (user_id, username, display_name, headshot))
            conn.commit()

        update_job(conn, job_id, currentUser=f'userId:{user_id}')
        save_inventory_snapshot(conn, user_id, user_id)
        update_job(conn, job_id, status='done', currentUser=None)
        logger.info(f"[inventory_scanner] ✅ Inventory scan complete for userId: {user_id}")

    except Exception as e:
        logger.error(f"[inventory_scanner] ❌ Inventory scan failed for userId {user_id}: {e}")
        logger.error(traceback.format_exc())
        update_job(conn, job_id, status='done', currentUser=None)


# ─── Main scanner loop ─────────────────────────────────────────────────────

def scanner_loop():
    """Continuously poll for pending ScanJob rows and process them."""
    logger.info("[inventory_scanner] 🚀 Inventory scanner started — polling for jobs...")

    while True:
        try:
            conn = get_conn()
            conn.autocommit = False

            job = claim_next_job(conn)

            if not job:
                conn.close()
                time.sleep(POLL_INTERVAL)
                continue

            job_type = job.get('type', 'owners')
            logger.info(f"[inventory_scanner] 📋 Claimed job {job['id']} (type: {job_type})")

            if job_type == 'inventory':
                run_inventory_scan(conn, job)
            elif job_type == 'owners':
                run_owners_scan(conn, job)
            elif job_type == 'owners_full':       
                run_owners_full_scan(conn, job)       
            else:
                logger.warning(f"[inventory_scanner] Unknown job type: {job_type}")
                update_job(conn, job['id'], status='done')

            conn.close()

        except Exception as e:
            logger.error(f"[inventory_scanner] ❌ Scanner loop error: {e}")
            logger.error(traceback.format_exc())
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(5)


def start_inventory_scanner():
    """Start the scanner in a background daemon thread."""
    logger.info(f"[inventory_scanner] Cookie present: {bool(ROBLOX_COOKIE)}, length: {len(ROBLOX_COOKIE)}, prefix: {ROBLOX_COOKIE[:20] if ROBLOX_COOKIE else 'MISSING'}")
    t = threading.Thread(target=scanner_loop, daemon=True)
    t.start()
    logger.info("[inventory_scanner] ✅ Inventory scanner thread started")
    return t