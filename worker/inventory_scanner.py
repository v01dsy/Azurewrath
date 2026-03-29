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

# ─── Multi-cookie support ──────────────────────────────────────────────────
def _load_cookies() -> list[str]:
    cookies = []
    for i in range(1, 11):
        val = os.getenv(f'ROBLOX_SECURITY_COOKIE_{i}', '').strip('"').strip("'")
        if val:
            cookies.append(val)
    if not cookies:
        single = os.getenv('ROBLOX_SECURITY_COOKIE', '').strip('"').strip("'")
        if single:
            cookies.append(single)
    return cookies

ROBLOX_COOKIES = _load_cookies()
ROBLOX_COOKIE = ROBLOX_COOKIES[0] if ROBLOX_COOKIES else ''

_thread_local = threading.local()

PAGE_DELAY = 1.0
OWNER_PAGE_DELAY = 1.5
UAID_SEARCH_DELAY = 1.0
USER_PROCESS_DELAY = 1.0
BREATHER_INTERVAL = 25
BREATHER_DURATION = 10
POLL_INTERVAL = 2


# ─── DB helpers ────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(DATABASE_URL)


def get_today_bounds_utc():
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start, end


def make_cuid():
    import time as t
    ts = hex(int(t.time() * 1000))[2:]
    rand = uuid.uuid4().hex[:16]
    return f"c{ts}{rand}"


# ─── Roblox API helpers ────────────────────────────────────────────────────

def thread_tag() -> str:
    idx = getattr(_thread_local, 'cookie_index', '?')
    return f"[Cookie {idx}]"


def roblox_headers():
    cookie = getattr(_thread_local, 'cookie', ROBLOX_COOKIE)
    h = {'User-Agent': 'Mozilla/5.0'}
    if cookie:
        h['Cookie'] = f'.ROBLOSECURITY={cookie}'
    return h


def fetch_with_retry(url, max_retries=5, base_delay=3.0, extra_headers=None):
    headers = roblox_headers()
    tag = thread_tag()
    if extra_headers:
        headers.update(extra_headers)

    for attempt in range(max_retries):
        try:
            res = requests.get(url, headers=headers, timeout=30)
        except requests.RequestException as e:
            wait = base_delay * (2 ** attempt)
            logger.warning(f"[inventory_scanner] {tag} Network error (attempt {attempt+1}): {e} — retrying in {wait}s")
            time.sleep(wait)
            continue

        if res.status_code == 429:
            wait = base_delay * (2 ** attempt)
            logger.warning(f"[inventory_scanner] {tag} 429 rate limited — waiting {wait}s (attempt {attempt+1})")
            time.sleep(wait)
            continue

        if res.status_code == 400:
            raise Exception(f"[inventory_scanner] {tag} 400 Bad Request: {url}")
        if res.status_code == 404:
            raise Exception(f"[inventory_scanner] {tag} 404 Not Found: {url}")
        if not res.ok:
            wait = base_delay * (2 ** attempt)
            logger.warning(f"[inventory_scanner] {tag} HTTP {res.status_code} — retrying in {wait}s")
            time.sleep(wait)
            continue

        return res.json()

    raise Exception(f"[inventory_scanner] {tag} All {max_retries} retries exhausted for {url}")


# ─── Job queue helpers ─────────────────────────────────────────────────────

def claim_next_job(conn):
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

def fetch_user_info(user_id):
    tag = thread_tag()
    try:
        data = fetch_with_retry(f'https://users.roblox.com/v1/users/{user_id}')
        return data
    except Exception as e:
        logger.warning(f"[inventory_scanner] {tag} Could not fetch user info for [userId {user_id}]: {e}")
        return None


def fetch_headshot(user_id):
    tag = thread_tag()
    try:
        data = fetch_with_retry(
            f'https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={user_id}&size=150x150&format=Webp'
        )
        if data and data.get('data'):
            return data['data'][0].get('imageUrl')
    except Exception as e:
        logger.warning(f"[inventory_scanner] {tag} Could not fetch headshot for [userId {user_id}]: {e}")
    return None

def fetch_avatar(user_id):
    tag = thread_tag()
    try:
        data = fetch_with_retry(
            f'https://thumbnails.roblox.com/v1/users/avatar?userIds={user_id}&size=420x420&format=Webp&isCircular=false'
        )
        if data and data.get('data'):
            return data['data'][0].get('imageUrl')
    except Exception as e:
        logger.warning(f"[inventory_scanner] {tag} Could not fetch avatar for [userId {user_id}]: {e}")
    return None


# ─── Scan full inventory ───────────────────────────────────────────────────

def scan_full_inventory(user_id):
    full_inventory = []
    cursor = None
    page_count = 0
    tag = thread_tag()

    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] 🔍 Starting inventory scan")

    while True:
        url = f'https://inventory.roblox.com/v1/users/{user_id}/assets/collectibles?sortOrder=Asc&limit=100'
        if cursor:
            url += f'&cursor={cursor}'

        page_count += 1

        try:
            data = fetch_with_retry(url)
        except Exception as e:
            logger.error(f"[inventory_scanner] {tag} [userId {user_id}] Failed to fetch inventory page {page_count}: {e}")
            break

        items = data.get('data', [])
        if not items and page_count == 1:
            logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ Empty collectibles inventory")
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

        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] Page {page_count} — {len(items)} items, total: {len(full_inventory)}")

        cursor = data.get('nextPageCursor')
        if not cursor:
            break

        time.sleep(PAGE_DELAY)

    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ Fetched {len(full_inventory)} items in {page_count} pages")
    return full_inventory


# ─── UAID cursor cache ─────────────────────────────────────────────────────

def get_cached_cursor(conn, asset_id, target_uaid):
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
    tag = thread_tag()
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
        logger.warning(f"[inventory_scanner] {tag} Could not save cursor cache: {e}")


# ─── Fetch UAID timestamps from owners API ────────────────────────────────

def fetch_uaid_timestamps(conn, asset_id, user_asset_id, user_id):
    target_uaid = int(user_asset_id)
    page_num = 0
    requests_since_break = 0
    last_page_num_reached = 0
    tag = thread_tag()

    cached_cursor, cached_page = get_cached_cursor(conn, asset_id, target_uaid)
    cursor = cached_cursor
    if cursor:
        page_num = cached_page
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Resuming from cached cursor at page ~{page_num}")

    while True:
        url = f'https://inventory.roblox.com/v2/assets/{asset_id}/owners?limit=100&sortOrder=Asc'
        if cursor:
            url += f'&cursor={cursor}'

        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
        except Exception as e:
            logger.warning(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Failed to fetch page: {e}")
            break

        entries = data.get('data', [])
        page_num += 1
        last_page_num_reached = page_num

        if not entries:
            break

        next_cursor = data.get('nextPageCursor')

        if next_cursor:
            last_uaid_from_cursor = int(next_cursor.split('_')[0])
            save_cursor(conn, asset_id, cursor, last_uaid_from_cursor, page_num - 1)

            if last_uaid_from_cursor < target_uaid:
                logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Page {page_num}: lastUaid={last_uaid_from_cursor} < target={target_uaid}, skipping")
                cursor = next_cursor
                requests_since_break += 1
                if requests_since_break >= BREATHER_INTERVAL:
                    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Taking {BREATHER_DURATION}s breather...")
                    time.sleep(BREATHER_DURATION)
                    requests_since_break = 0
                else:
                    time.sleep(UAID_SEARCH_DELAY)
                continue

        for entry in entries:
            if int(entry.get('id', 0)) == target_uaid:
                logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Found on page {page_num}")
                return entry.get('created'), entry.get('updated')

        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Page {page_num}: not found — trying fallback")
        break

    pages_to_check = []

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
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Fallback: checking 1 page {direction}...")
        url = f'https://inventory.roblox.com/v2/assets/{asset_id}/owners?limit=100&sortOrder=Asc'
        if fallback_cursor:
            url += f'&cursor={fallback_cursor}'
        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
            for entry in data.get('data', []):
                if int(entry.get('id', 0)) == target_uaid:
                    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Found in fallback ({direction})")
                    return entry.get('created'), entry.get('updated')
        except Exception as e:
            logger.warning(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Fallback fetch failed ({direction}): {e}")

    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [UAID search] Not found after fallback — giving up")
    return None, None


# ─── Phase 2 concurrency limiter ──────────────────────────────────────────
PHASE2_SEMAPHORE = threading.Semaphore(4)


def backfill_timestamps(conn, snapshot_id, uaids_to_backfill, user_id):
    tag = thread_tag()
    with PHASE2_SEMAPHORE:
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] 🕐 [Phase 2] Backfilling timestamps for {len(uaids_to_backfill)} UAIDs...")

        for uaid_info in uaids_to_backfill:
            user_asset_id = uaid_info['user_asset_id']
            asset_id = uaid_info['asset_id']

            try:
                created, updated = fetch_uaid_timestamps(conn, asset_id, user_asset_id, user_id)

                if not created and not updated:
                    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [Phase 2] UAID {user_asset_id} — no timestamps found")
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
                logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [Phase 2] UAID {user_asset_id} ✅ created={created} updated={updated}")

            except Exception as e:
                conn.rollback()
                logger.warning(f"[inventory_scanner] {tag} [userId {user_id}] [Phase 2] UAID {user_asset_id} Failed: {e}")

            time.sleep(30)

        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ [Phase 2] Timestamp backfill complete")


# ─── Save inventory snapshot ───────────────────────────────────────────────

def save_inventory_snapshot(conn, user_id, skip_phase2=False):
    tag = thread_tag()
    logger.info(f"\n========== INVENTORY SCAN ==========")
    logger.info(f"[inventory_scanner] {tag} [userId {user_id}]")

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT id, "createdAt"
            FROM "InventorySnapshot"
            WHERE "userId" = %s
            ORDER BY "createdAt" DESC
            LIMIT 1
        """, (user_id,))
        latest_snapshot = cur.fetchone()

    full_inventory = scan_full_inventory(str(user_id))
    current_uaid_set = {str(item['user_asset_id']) for item in full_inventory}
    roblox_item_map = {str(item['user_asset_id']): item for item in full_inventory}

    asset_ids = list({item['asset_id'] for item in full_inventory})
    ensure_items_exist(conn, asset_ids)

    today_start, today_end = get_today_bounds_utc()
    now = datetime.now(timezone.utc)

    if not latest_snapshot:
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] FIRST EVER scan — Phase 1: saving snapshot...")

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
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ [Phase 1] FIRST snapshot created (ID: {snapshot_id}, {len(item_rows)} items)")

        uaids_to_backfill = [
            {'user_asset_id': item['user_asset_id'], 'asset_id': item['asset_id']}
            for item in full_inventory
        ]
        if uaids_to_backfill and not skip_phase2:
            parent_cookie = getattr(_thread_local, 'cookie', ROBLOX_COOKIE)
            parent_cookie_index = getattr(_thread_local, 'cookie_index', '?')
            def _run_backfill(cookie, cookie_index, snapshot_id, uaids, uid):
                _thread_local.cookie = cookie
                _thread_local.cookie_index = cookie_index
                backfill_timestamps(get_conn(), snapshot_id, uaids, uid)
            t = threading.Thread(
                target=_run_backfill,
                args=(parent_cookie, parent_cookie_index, snapshot_id, uaids_to_backfill, user_id),
                daemon=True
            )
            t.start()
        return snapshot_id

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT "userAssetId", "assetId", "serialNumber", "scannedAt",
                   "uaidCreatedAt", "uaidUpdatedAt", "isOnHold"
            FROM "InventoryItem"
            WHERE "snapshotId" = %s
        """, (latest_snapshot['id'],))
        prev_items = cur.fetchall()

    prev_uaid_set = {str(row['userAssetId']) for row in prev_items}

    new_uaids = current_uaid_set - prev_uaid_set
    removed_uaids = prev_uaid_set - current_uaid_set

    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] Changes: {len(new_uaids)} new, {len(removed_uaids)} removed")

    all_items = []
    unchanged_count = 0

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

    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] Total items for snapshot: {len(all_items)}")
    total_rap, total_items, unique_items = calculate_snapshot_totals(conn, all_items)

    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM "InventorySnapshot"
            WHERE "userId" = %s AND "createdAt" >= %s AND "createdAt" <= %s
            LIMIT 1
        """, (user_id, today_start, today_end))
        todays_snapshot = cur.fetchone()

    if todays_snapshot:
        snapshot_id = todays_snapshot[0]
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [Phase 1] Updating TODAY'S snapshot (ID: {snapshot_id})...")

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
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ [Phase 1] UPDATED today's snapshot ({len(all_items)} items)")

    else:
        snapshot_id = make_cuid()
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [Phase 1] Creating NEW snapshot for new day (ID: {snapshot_id})...")

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
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ [Phase 1] NEW snapshot created ({len(all_items)} items)")

    uaids_to_backfill = []

    if new_uaids:
        uaids_to_backfill += [
            {'user_asset_id': roblox_item_map[u]['user_asset_id'], 'asset_id': roblox_item_map[u]['asset_id']}
            for u in new_uaids if u in roblox_item_map
        ]

    for item in all_items:
        if str(item['user_asset_id']) not in new_uaids:
            if item.get('uaid_created_at') is None or item.get('uaid_updated_at') is None:
                uaids_to_backfill.append({
                    'user_asset_id': item['user_asset_id'],
                    'asset_id': item['asset_id'],
                })

    if uaids_to_backfill and not skip_phase2:
        parent_cookie = getattr(_thread_local, 'cookie', ROBLOX_COOKIE)
        parent_cookie_index = getattr(_thread_local, 'cookie_index', '?')
        def _run_backfill2(cookie, cookie_index, snapshot_id, uaids, uid):
            _thread_local.cookie = cookie
            _thread_local.cookie_index = cookie_index
            backfill_timestamps(get_conn(), snapshot_id, uaids, uid)
        t = threading.Thread(
            target=_run_backfill2,
            args=(parent_cookie, parent_cookie_index, snapshot_id, uaids_to_backfill, user_id),
            daemon=True
        )
        t.start()

    logger.info("====================================\n")
    return snapshot_id


# ─── Backfill UAID timestamps by UAID only ────────────────────────────────

def backfill_uaid_by_uaid(conn, uaid, created, updated):
    tag = thread_tag()
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
            logger.info(f"[inventory_scanner] {tag} Backfilled null-owner UAID {uaid}: created={created}, updated={updated}")
    except Exception as e:
        conn.rollback()
        logger.warning(f"[inventory_scanner] {tag} Could not backfill UAID {uaid}: {e}")


# ─── Owner scan ────────────────────────────────────────────────────────────

def process_owner_entry(conn, entry, asset_id, job_id):
    owner = entry.get('owner')
    user_id = str(owner.get('id')) if owner else None
    entry_uaid = entry.get('id')
    entry_created = entry.get('created')
    entry_updated = entry.get('updated')
    tag = thread_tag()

    if not user_id:
        if entry_uaid:
            backfill_uaid_by_uaid(conn, entry_uaid, entry_created, entry_updated)
        return 'null'

    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, "createdAt" FROM "InventorySnapshot"
            WHERE "userId" = %s
            ORDER BY "createdAt" DESC
            LIMIT 1
        """, (user_id,))
        existing = cur.fetchone()

    if existing:
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ⏭️ Already scanned — skipping inventory scan")
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
                    user_id,
                    entry_uaid
                ))
            conn.commit()
        return 'skipped'

    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] 📦 New user — fetching info and scanning inventory...")

    user_info = fetch_user_info(user_id)
    headshot = fetch_headshot(user_id)
    avatar = fetch_avatar(user_id)

    username = f'user_{user_id}'
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
            INSERT INTO "User" ("robloxUserId", username, "displayName", "avatarUrl", "avatarFullBodyUrl", description,
                                "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT ("robloxUserId") DO UPDATE SET
                username = EXCLUDED.username,
                "displayName" = EXCLUDED."displayName",
                "avatarUrl" = EXCLUDED."avatarUrl",
                "avatarFullBodyUrl" = EXCLUDED."avatarFullBodyUrl",
                description = EXCLUDED.description,
                "updatedAt" = NOW()
        """, (user_id, username, display_name, avatar_url, avatar, description))
    conn.commit()

    try:
        snapshot_id = save_inventory_snapshot(conn, user_id)

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
        logger.error(f"[inventory_scanner] {tag} [userId {user_id}] ❌ Failed to scan inventory: {e}")
        return 'failed'


# ─── Owner scan job ────────────────────────────────────────────────────────

def run_owners_scan(job):
    conn = get_conn()
    asset_id = job['assetId']
    job_id = job['id']
    tag = thread_tag()

    logger.info(f"\n[inventory_scanner] {tag} 🚀 ========== OWNER SCAN START ==========")
    logger.info(f"[inventory_scanner] {tag} 📦 Asset: {asset_id} | Job: {job_id}")

    base_url = f'https://inventory.roblox.com/v2/assets/{asset_id}/owners?limit=100&sortOrder=Asc'
    cursor = None
    page_num = 0
    processed = 0
    skipped = 0
    failed = 0
    null_count = 0
    total = 0

    logger.info(f"[inventory_scanner] {tag} ⏳ Cold start delay 3s...")
    time.sleep(3)

    while True:
        if is_stop_requested(conn, job_id):
            logger.info(f"[inventory_scanner] {tag} 🛑 Stop requested — halting")
            break

        url = base_url + (f'&cursor={cursor}' if cursor else '')

        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
        except Exception as e:
            logger.error(f"[inventory_scanner] {tag} ❌ Failed to fetch page {page_num + 1}: {e}")
            break

        page_num += 1
        entries = data.get('data', [])
        valid = [e for e in entries if e.get('owner') and e['owner'].get('id')]
        null_entries = [e for e in entries if not (e.get('owner') and e['owner'].get('id'))]

        logger.info(f"[inventory_scanner] {tag} 📄 Page {page_num}: {len(valid)} valid, {len(null_entries)} null")

        total += len(valid)
        update_job(conn, job_id, total=total, pagesFound=page_num)

        for entry in null_entries:
            if entry.get('id'):
                backfill_uaid_by_uaid(conn, entry['id'], entry.get('created'), entry.get('updated'))
                null_count += 1

        stop_inner = False
        for entry in valid:
            if is_stop_requested(conn, job_id):
                stop_inner = True
                break

            user_id = entry['owner']['id']
            logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [{processed + skipped + 1}/{total}]")
            update_job(conn, job_id, currentUser=f'userId:{user_id}', processed=processed + skipped)

            result = process_owner_entry(conn, entry, asset_id, job_id)
            if result == 'processed':
                processed += 1
            elif result == 'skipped':
                skipped += 1
            elif result == 'failed':
                failed += 1

            update_job(conn, job_id, processed=processed + skipped, failed=failed)
            time.sleep(USER_PROCESS_DELAY)

        if stop_inner:
            break

        next_cursor = data.get('nextPageCursor')

        if next_cursor:
            try:
                last_uaid = int(next_cursor.split('_')[0])
                save_cursor(conn, asset_id, cursor, last_uaid, page_num - 1)
            except Exception as e:
                logger.warning(f"[inventory_scanner] {tag} Could not save cursor cache for page {page_num}: {e}")

        cursor = next_cursor
        if not cursor:
            break

        time.sleep(OWNER_PAGE_DELAY)

    final_status = 'stopped' if is_stop_requested(conn, job_id) else 'done'
    update_job(conn, job_id, status=final_status, currentUser=None,
               processed=processed + skipped, failed=failed)
    conn.close()

    logger.info(f"\n[inventory_scanner] {tag} {'🛑 SCAN STOPPED' if final_status == 'stopped' else '🎉 SCAN COMPLETE'} — Asset: {asset_id}")
    logger.info(f"[inventory_scanner] {tag}   ✅ Scanned: {processed} | ⏭️ Skipped: {skipped} | ❌ Failed: {failed} | 🚫 Null: {null_count}")


# ─── Full owner scan job ───────────────────────────────────────────────────

def run_owners_full_scan(job):
    conn = get_conn()
    asset_id = job['assetId']
    job_id = job['id']
    tag = thread_tag()

    logger.info(f"\n[inventory_scanner] {tag} 🚀 ========== FULL OWNER SCAN START ==========")
    logger.info(f"[inventory_scanner] {tag} 📦 Asset: {asset_id} | Job: {job_id}")

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
            logger.info(f"[inventory_scanner] {tag} 🛑 Stop requested — halting")
            break

        url = base_url + (f'&cursor={cursor}' if cursor else '')

        try:
            data = fetch_with_retry(url, max_retries=5, base_delay=3.0)
        except Exception as e:
            logger.error(f"[inventory_scanner] {tag} ❌ Failed to fetch page {page_num + 1}: {e}")
            break

        page_num += 1
        entries = data.get('data', [])
        valid = [e for e in entries if e.get('owner') and e['owner'].get('id')]
        null_entries = [e for e in entries if not (e.get('owner') and e['owner'].get('id'))]

        logger.info(f"[inventory_scanner] {tag} 📄 Page {page_num}: {len(valid)} valid, {len(null_entries)} null")

        total += len(valid)
        update_job(conn, job_id, total=total, pagesFound=page_num)

        for entry in null_entries:
            if entry.get('id'):
                backfill_uaid_by_uaid(conn, entry['id'], entry.get('created'), entry.get('updated'))
                null_count += 1

        stop_inner = False
        for entry in valid:
            if is_stop_requested(conn, job_id):
                stop_inner = True
                break

            user_id = int(entry['owner']['id'])
            entry_uaid = entry.get('id')
            entry_created = entry.get('created')
            entry_updated = entry.get('updated')

            logger.info(f"[inventory_scanner] {tag} [userId {user_id}] [{processed + skipped + 1}/{total}]")
            update_job(conn, job_id, currentUser=f'userId:{user_id}', processed=processed + skipped)

            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id FROM "InventorySnapshot"
                    WHERE "userId" = %s
                    ORDER BY "createdAt" DESC
                    LIMIT 1
                """, (user_id,))
                existing_snapshot = cur.fetchone()

            if existing_snapshot:
                if entry_uaid and (entry_created or entry_updated):
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
                            user_id,
                            entry_uaid
                        ))
                    conn.commit()
                    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ Updated timestamps for existing user")
                else:
                    logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ⏭️ No UAID/timestamps in entry — skipping")
                skipped += 1
            else:
                logger.info(f"[inventory_scanner] {tag} [userId {user_id}] 📦 New user — fetching info and scanning inventory...")

                user_info = fetch_user_info(user_id)
                headshot = fetch_headshot(user_id)
                avatar = fetch_avatar(user_id)

                username = f'user_{user_id}'
                display_name = username
                if user_info:
                    username = user_info.get('name') or username
                    display_name = user_info.get('displayName') or username

                update_job(conn, job_id, currentUser=username)

                with conn.cursor() as cur:
                    cur.execute("""
                    INSERT INTO "User" ("robloxUserId", username, "displayName", "avatarUrl", "avatarFullBodyUrl",
                                    "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT ("robloxUserId") DO UPDATE SET
                        username = EXCLUDED.username,
                        "displayName" = EXCLUDED."displayName",
                        "avatarUrl" = EXCLUDED."avatarUrl",
                        "avatarFullBodyUrl" = EXCLUDED."avatarFullBodyUrl",
                        "updatedAt" = NOW()
                """, (user_id, username, display_name, headshot, avatar))
                conn.commit()

                try:
                    snapshot_id = save_inventory_snapshot(conn, user_id, skip_phase2=True)

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
                        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ Set timestamps for UAID {entry_uaid}")

                    processed += 1
                except Exception as e:
                    logger.error(f"[inventory_scanner] {tag} [userId {user_id}] ❌ Failed to process new user: {e}")
                    failed += 1

            update_job(conn, job_id, processed=processed + skipped, failed=failed)
            time.sleep(USER_PROCESS_DELAY)

        if stop_inner:
            break

        next_cursor = data.get('nextPageCursor')
        if next_cursor:
            try:
                last_uaid = int(next_cursor.split('_')[0])
                save_cursor(conn, asset_id, cursor, last_uaid, page_num - 1)
            except Exception as e:
                logger.warning(f"[inventory_scanner] {tag} Could not save cursor: {e}")

        cursor = next_cursor
        if not cursor:
            break

        time.sleep(OWNER_PAGE_DELAY)

    final_status = 'stopped' if is_stop_requested(conn, job_id) else 'done'
    update_job(conn, job_id, status=final_status, currentUser=None,
               processed=processed + skipped, failed=failed)
    conn.close()

    logger.info(f"\n[inventory_scanner] {tag} {'🛑 SCAN STOPPED' if final_status == 'stopped' else '🎉 FULL SCAN COMPLETE'}")
    logger.info(f"[inventory_scanner] {tag}   ✅ New users: {processed} | ⏭️ Skipped: {skipped} | ❌ Failed: {failed} | 🚫 Null: {null_count}")


# ─── Inventory scan job ────────────────────────────────────────────────────

def run_inventory_scan(job):
    conn = get_conn()
    user_id = job.get('userId')
    job_id = job['id']
    tag = thread_tag()

    if not user_id:
        logger.error(f"[inventory_scanner] {tag} Job {job_id} has no userId — skipping")
        update_job(conn, job_id, status='done')
        conn.close()
        return

    logger.info(f"\n[inventory_scanner] {tag} [userId {user_id}] 📦 INVENTORY SCAN JOB")

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
        save_inventory_snapshot(conn, user_id)
        update_job(conn, job_id, status='done', currentUser=None)
        logger.info(f"[inventory_scanner] {tag} [userId {user_id}] ✅ Inventory scan complete")

    except Exception as e:
        logger.error(f"[inventory_scanner] {tag} [userId {user_id}] ❌ Inventory scan failed: {e}")
        logger.error(traceback.format_exc())
        update_job(conn, job_id, status='done', currentUser=None)
    finally:
        conn.close()


# ─── Main scanner loop ─────────────────────────────────────────────────────

def scanner_loop(cookie: str, cookie_index: int):
    _thread_local.cookie = cookie
    _thread_local.cookie_index = cookie_index
    tag = f"[Cookie {cookie_index}]"
    logger.info(f"[inventory_scanner] {tag} 🚀 Scanner thread started — cookie length: {len(cookie)}")

    if cookie_index == 1:
        try:
            conn = get_conn()
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE "ScanJob" SET status = 'pending', "updatedAt" = NOW()
                    WHERE status = 'running'
                """)
            conn.commit()
            conn.close()
            logger.info(f"[inventory_scanner] {tag} ♻️ Reset stuck 'running' jobs to 'pending'")
        except Exception as e:
            logger.warning(f"[inventory_scanner] {tag} Could not reset stuck jobs: {e}")

    while True:
        try:
            conn = get_conn()
            conn.autocommit = False
            job = claim_next_job(conn)
            conn.close()

            if not job:
                time.sleep(POLL_INTERVAL)
                continue

            job_type = job.get('type', 'owners')
            logger.info(f"[inventory_scanner] {tag} 📋 Claimed job {job['id']} (type: {job_type})")

            if job_type == 'inventory':
                run_inventory_scan(job)
            elif job_type == 'owners':
                run_owners_scan(job)
            elif job_type == 'owners_full':
                run_owners_full_scan(job)
            else:
                logger.warning(f"[inventory_scanner] {tag} Unknown job type: {job_type}")
                conn2 = get_conn()
                update_job(conn2, job['id'], status='done')
                conn2.close()

        except Exception as e:
            logger.error(f"[inventory_scanner] {tag} ❌ Scanner loop error: {e}")
            logger.error(traceback.format_exc())
            time.sleep(5)


def start_inventory_scanner():
    logger.info(f"[inventory_scanner] 🍪 Cookies loaded: {len(ROBLOX_COOKIES)}")
    for i, cookie in enumerate(ROBLOX_COOKIES):
        logger.info(f"[inventory_scanner] Cookie {i+1}: present={bool(cookie)}, length={len(cookie)}, prefix={cookie[:20] if cookie else 'MISSING'}")
        t = threading.Thread(target=scanner_loop, args=(cookie, i+1), daemon=True)
        t.start()
        logger.info(f"[inventory_scanner] ✅ Scanner thread {i+1}/{len(ROBLOX_COOKIES)} started")