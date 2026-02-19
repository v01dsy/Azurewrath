import requests
import json
import time
import os
from dotenv import load_dotenv
import logging
import psycopg2
from psycopg2 import pool
from datetime import datetime
import traceback
import re
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
import uuid
from discord_notifications import send_discord_notifications
from snipe_events import fire_snipe_events
from snipe_server import start_snipe_server

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DATABASE_URL = os.getenv('DATABASE_URL')
WORKER_INTERVAL = float(os.getenv('WORKER_INTERVAL_SECONDS', 120))

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

# Connection pool
connection_pool = None

# Global cache for RAP values (persists across cycles)
rap_cache = {}

# Global cache for previous best prices (persists across cycles)
price_cache = {}


def get_current_time():
    """Get current time in UTC as naive datetime"""
    return datetime.utcnow()


def format_time_12hr(dt):
    """Format datetime in 12-hour format with AM/PM"""
    return dt.strftime('%I:%M %p')


def init_connection_pool():
    """Initialize the connection pool"""
    global connection_pool
    try:
        connection_pool = psycopg2.pool.SimpleConnectionPool(
            1,
            10,
            DATABASE_URL
        )
        logger.info("✅ Database connection pool initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize connection pool: {e}")
        raise


def get_db_connection():
    """Get PostgreSQL connection from pool"""
    try:
        conn = connection_pool.getconn()
        return conn
    except Exception as e:
        logger.error(f"❌ Failed to get connection from pool: {e}")
        raise


def return_db_connection(conn):
    """Return connection to pool"""
    try:
        connection_pool.putconn(conn)
    except Exception as e:
        logger.error(f"❌ Failed to return connection to pool: {e}")


def create_indexes():
    """Create performance indexes if they don't exist"""
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        logger.info("Creating database indexes for optimal performance...")

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_pricehistory_itemid_timestamp
            ON "PriceHistory"("itemId", timestamp DESC)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_pricehistory_timestamp
            ON "PriceHistory"(timestamp)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_item_assetid
            ON "Item"("assetId")
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_watchlist_itemid
            ON "Watchlist"("itemId")
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_notification_userid_read
            ON "Notification"("userId", read)
        ''')

        conn.commit()
        logger.info("✅ Database indexes created/verified")

    except psycopg2.Error as e:
        logger.warning(f"⚠️ Index creation warning: {e}")
        if conn:
            conn.rollback()
    except Exception as e:
        logger.error(f"❌ Error creating indexes: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            return_db_connection(conn)


def fetch_rolimons_data():
    """Fetch all item data from Rolimons deals page (includes best price)"""
    try:
        logger.info("📡 Fetching item data from Rolimons deals page...")
        response = requests.get(
            'https://www.rolimons.com/deals',
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
            timeout=30
        )

        logger.info(f"Response status code: {response.status_code}")

        if response.status_code == 200:
            html = response.text

            pattern = r'var item_details = ({.+?});'
            match = re.search(pattern, html, re.DOTALL)

            if match:
                item_details_str = match.group(1)
                items_data = json.loads(item_details_str)
                logger.info(f"✅ Successfully parsed {len(items_data)} items from Rolimons")
                return items_data
            else:
                logger.error("❌ Could not find item_details variable in page source")
                return {}
        else:
            logger.error(f"❌ Rolimons page returned status {response.status_code}")
            return {}

    except requests.exceptions.Timeout:
        logger.error("❌ Request to Rolimons timed out after 30 seconds")
        return {}
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Request error: {e}")
        return {}
    except json.JSONDecodeError as e:
        logger.error(f"❌ Failed to parse JSON: {e}")
        return {}
    except Exception as e:
        logger.error(f"❌ Unexpected error fetching from Rolimons: {e}")
        logger.error(traceback.format_exc())
        return {}


def process_items_batch(items_batch, rolimons_data, previous_raps, previous_prices):
    """Process a batch of items (designed for parallel execution)"""
    results = []
    stats = {
        'processed': 0,
        'skipped_no_data': 0,
        'skipped_no_rap': 0,
        'with_price': 0,
        'deals_found': 0
    }

    for asset_id, name in items_batch:
        stats['processed'] += 1

        item_data = rolimons_data.get(str(asset_id))

        if not item_data or not isinstance(item_data, list):
            stats['skipped_no_data'] += 1
            continue

        best_price = item_data[1] if len(item_data) > 1 and item_data[1] else None
        current_rap = item_data[2] if len(item_data) > 2 and item_data[2] else None

        if current_rap is None:
            stats['skipped_no_rap'] += 1
            continue

        if best_price:
            stats['with_price'] += 1

        previous_rap = previous_raps.get(asset_id)
        rap_changed = previous_rap is not None and previous_rap != current_rap
        old_rap = previous_rap if rap_changed else None
        new_rap = current_rap if rap_changed else None

        if rap_changed:
            logger.info(f"📈 RAP Change: {name} - {old_rap} → {new_rap}")

        previous_price = previous_prices.get(asset_id)
        price_changed = best_price is not None and previous_price is not None and previous_price != best_price
        old_price = previous_price if price_changed else None
        new_price_val = best_price if price_changed else None

        if price_changed:
            logger.info(f"💰 Price Change: {name} - {old_price} → {new_price_val}")

        # First-time seen item (not in cache yet) — always write initial record
        is_first_seen = previous_rap is None and previous_price is None

        if best_price and current_rap and best_price < current_rap:
            discount = ((current_rap - best_price) / current_rap) * 100
            if discount > 5:
                stats['deals_found'] += 1

        results.append({
            'asset_id': asset_id,
            'name': name,
            'price': best_price,
            'rap': current_rap,
            'rap_changed': rap_changed,
            'old_rap': old_rap,
            'new_rap': new_rap,
            'price_changed': price_changed,
            'old_price': old_price,
            'new_price': new_price_val,
            'is_first_seen': is_first_seen,
        })

    return results, stats


def process_items_data(items_from_db, rolimons_data, previous_raps, previous_prices):
    """Process all fetched data using parallel batches"""
    logger.info(f"Processing {len(items_from_db)} items from database...")

    batch_size = max(100, len(items_from_db) // 4)
    item_batches = [items_from_db[i:i+batch_size] for i in range(0, len(items_from_db), batch_size)]

    logger.info(f"Split into {len(item_batches)} batches for parallel processing")

    all_results = []
    combined_stats = {
        'processed': 0,
        'skipped_no_data': 0,
        'skipped_no_rap': 0,
        'with_price': 0,
        'deals_found': 0
    }

    with ThreadPoolExecutor(max_workers=min(4, len(item_batches))) as executor:
        futures = [
            executor.submit(process_items_batch, batch, rolimons_data, previous_raps, previous_prices)
            for batch in item_batches
        ]

        for future in futures:
            results, stats = future.result()
            all_results.extend(results)

            for key in combined_stats:
                combined_stats[key] += stats[key]

    logger.info(f"✅ Processing complete:")
    logger.info(f"   - Items in DB: {len(items_from_db)}")
    logger.info(f"   - Items processed: {combined_stats['processed']}")
    logger.info(f"   - Items with valid data: {len(all_results)}")
    logger.info(f"   - Items with price: {combined_stats['with_price']}")
    logger.info(f"   - Deals found: {combined_stats['deals_found']}")
    logger.info(f"   - Items skipped (no Rolimons data): {combined_stats['skipped_no_data']}")
    logger.info(f"   - Items skipped (no RAP): {combined_stats['skipped_no_rap']}")

    return all_results


def bulk_insert_with_copy(cursor, data, table_name, columns):
    """Use PostgreSQL COPY for ultra-fast bulk inserts"""
    if not data:
        return

    buffer = StringIO()
    for row in data:
        converted_row = []
        for val in row:
            if val is None:
                converted_row.append('\\N')
            elif isinstance(val, bool):
                converted_row.append('true' if val else 'false')
            elif isinstance(val, int):
                converted_row.append(str(val))
            elif isinstance(val, float):
                converted_row.append(str(val))
            else:
                converted_row.append(str(val))

        line = '\t'.join(converted_row)
        buffer.write(line + '\n')

    buffer.seek(0)

    cursor.copy_from(
        buffer,
        table_name,
        columns=columns,
        null='\\N'
    )


def load_watchlist_map(cursor, asset_ids):
    """
    Given a list of asset IDs, return a dict mapping
    asset_id -> [userId, userId, ...] for all watchers.
    """
    if not asset_ids:
        return {}

    placeholders = ','.join(['%s'] * len(asset_ids))
    cursor.execute(
        f'SELECT "itemId", "userId" FROM "Watchlist" WHERE "itemId" IN ({placeholders})',
        asset_ids
    )

    watchlist_map = {}
    for item_id, user_id in cursor.fetchall():
        watchlist_map.setdefault(item_id, []).append(user_id)

    return watchlist_map


def send_push_notifications(cursor, notification_rows):
    """Send browser push notifications to subscribed users."""
    logger.info("🔔 send_push_notifications() CALLED")
    logger.info(f"   Received {len(notification_rows)} notification rows")

    try:
        from pywebpush import webpush, WebPushException
        logger.info("✅ pywebpush imported successfully")
    except ImportError:
        logger.warning("⚠️ pywebpush not installed - skipping browser push.")
        return

    VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY')
    VAPID_SUBJECT = os.getenv('VAPID_SUBJECT', 'mailto:admin@azurewrath.com')

    if not VAPID_PRIVATE_KEY:
        logger.warning("⚠️ VAPID_PRIVATE_KEY not set - skipping browser push")
        return

    user_ids = list(set(row[1] for row in notification_rows))
    logger.info(f"👥 User IDs to notify: {user_ids}")

    if not user_ids:
        return

    cursor.execute('''
        SELECT id, "userId", endpoint, p256dh, auth
        FROM "PushSubscription"
        WHERE "userId" = ANY(%s)
    ''', (user_ids,))
    subscriptions = cursor.fetchall()

    logger.info(f"📋 Found {len(subscriptions)} push subscription(s)")

    if not subscriptions:
        return

    user_messages = {}
    for row in notification_rows:
        user_id = row[1]
        message = row[4]
        item_id = row[2]
        if user_id not in user_messages:
            user_messages[user_id] = {'message': message, 'item_id': item_id, 'count': 1}
        else:
            user_messages[user_id]['count'] += 1

    expired_endpoints = []

    for sub_id, user_id, endpoint, p256dh, auth in subscriptions:
        if user_id not in user_messages:
            continue

        info = user_messages[user_id]
        count = info['count']
        body = info['message'] if count == 1 else f"{count} price changes on your watchlist"

        payload = json.dumps({
            'title': 'Azurewrath',
            'body': body,
            'icon': '/Images/icon.png',
            'url': f"/item/{info['item_id']}" if count == 1 else '/notifications',
        })

        try:
            webpush(
                subscription_info={
                    'endpoint': endpoint,
                    'keys': {'p256dh': p256dh, 'auth': auth}
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={'sub': VAPID_SUBJECT},
            )
            logger.info(f"✅ Push sent successfully to user {user_id}")
        except WebPushException as e:
            status = e.response.status_code if e.response else None
            if status in (404, 410):
                expired_endpoints.append(endpoint)
                logger.info(f"🗑️ Expired push subscription removed for user {user_id}")
            else:
                logger.warning(f"⚠️ Push failed for user {user_id}: {e}")
        except Exception as e:
            logger.error(f"❌ Unexpected push error for user {user_id}: {e}")
            logger.error(traceback.format_exc())

    if expired_endpoints:
        cursor.execute(
            'DELETE FROM "PushSubscription" WHERE endpoint = ANY(%s)',
            (expired_endpoints,)
        )
        logger.info(f"✅ Removed {len(expired_endpoints)} expired subscriptions")

    send_discord_notifications(cursor, notification_rows)

    logger.info("🔔 send_push_notifications() COMPLETE")


def build_notifications(results, watchlist_map, current_time):
    """
    For every result that has a price or RAP change, generate Notification
    rows for each watcher of that item.
    """
    notification_rows = []
    user_item_notifications = {}

    for result in results:
        asset_id = result['asset_id']
        watchers = watchlist_map.get(asset_id)
        if not watchers:
            continue

        name = result['name']
        rap_changed = result['rap_changed'] and result['old_rap'] is not None and result['new_rap'] is not None
        price_changed = result['price_changed'] and result['old_price'] is not None and result['new_price'] is not None

        if not (rap_changed or price_changed):
            continue

        messages = []
        if rap_changed:
            direction = "📈 increased" if result['new_rap'] > result['old_rap'] else "📉 decreased"
            messages.append(
                f"RAP {direction} from "
                f"{int(result['old_rap']):,} to {int(result['new_rap']):,} Robux"
            )

        if price_changed:
            direction = "📉 dropped" if result['new_price'] < result['old_price'] else "📈 rose"
            messages.append(
                f"best price {direction} from "
                f"{int(result['old_price']):,} to {int(result['new_price']):,} Robux"
            )

        combined_message = f"{name} " + " and ".join(messages)

        if rap_changed and price_changed:
            notif_type = "price_and_rap_change"
        elif rap_changed:
            notif_type = "rap_change"
        else:
            notif_type = "price_change"

        old_value = result['old_rap'] if rap_changed else result['old_price']
        new_value = result['new_rap'] if rap_changed else result['new_price']

        for user_id in watchers:
            key = (user_id, asset_id)
            if key in user_item_notifications:
                continue
            user_item_notifications[key] = True

            notification_rows.append((
                str(uuid.uuid4()),  # id
                user_id,            # userId
                asset_id,           # itemId
                notif_type,         # type
                combined_message,   # message
                old_value,          # oldValue
                new_value,          # newValue
                False,              # read
                current_time,       # createdAt (UTC)
            ))

    return notification_rows


def save_results_to_db(results, current_time):
    """
    Save results to database.
    - Only insert a new PriceHistory row when price or RAP actually changed,
      OR when the item is seen for the first time.
    - Timestamp is always the real current UTC time (no bucketing).
    """
    if not results:
        logger.warning("⚠️ No results to save")
        return

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # ── 1. PriceHistory: only insert rows for actual changes ──────────
        price_history_data = []
        for result in results:
            if result['price'] is None:
                continue

            should_write = (
                result['is_first_seen']
                or result['price_changed']
                or result['rap_changed']
            )

            if not should_write:
                continue

            price_history_data.append((
                str(uuid.uuid4()),   # id
                result['asset_id'],  # itemId
                result['price'],     # price
                result['rap'],       # rap
                None,                # salesVolume
                current_time,        # timestamp — real UTC now
            ))

        if price_history_data:
            bulk_insert_with_copy(
                cursor,
                price_history_data,
                'PriceHistory',
                ('id', 'itemId', 'price', 'rap', 'salesVolume', 'timestamp')
            )
            logger.info(f"✅ Inserted {len(price_history_data)} PriceHistory records")
        else:
            logger.info("✅ No PriceHistory changes this cycle — skipping insert")

        # ── 2. Sales (RAP changes) ─────────────────────────────────────────
        sale_data = []
        for result in results:
            if result['rap_changed'] and result['old_rap'] is not None and result['new_rap'] is not None:
                sale_data.append((
                    str(uuid.uuid4()),
                    result['asset_id'],
                    result['old_rap'],
                    result['new_rap'],
                    current_time,
                ))

        if sale_data:
            logger.info(f"Inserting {len(sale_data)} Sale records...")
            bulk_insert_with_copy(
                cursor,
                sale_data,
                'Sale',
                ('id', 'itemId', 'oldRap', 'newRap', 'saleDate')
            )
            logger.info(f"✅ Inserted {len(sale_data)} Sale records")

        # ── 3. Notifications ───────────────────────────────────────────────
        changed_asset_ids = [
            r['asset_id'] for r in results
            if r['rap_changed'] or r['price_changed']
        ]

        if changed_asset_ids:
            watchlist_map = load_watchlist_map(cursor, changed_asset_ids)

            if watchlist_map:
                notification_rows = build_notifications(results, watchlist_map, current_time)

                if notification_rows:
                    logger.info(f"🔔 Inserting {len(notification_rows)} Notification records...")
                    bulk_insert_with_copy(
                        cursor,
                        notification_rows,
                        'Notification',
                        ('id', 'userId', 'itemId', 'type', 'message', 'oldValue', 'newValue', 'read', 'createdAt')
                    )
                    logger.info(f"✅ Inserted {len(notification_rows)} Notifications")
                    send_push_notifications(cursor, notification_rows)
                else:
                    logger.info("✅ No notifications to send")
            else:
                logger.info("✅ No watchers for changed items")
        else:
            logger.info("✅ No price/RAP changes — skipping notifications")

        # ── 4. Snipe events ────────────────────────────────────────────────
        fire_snipe_events(cursor, results)

        conn.commit()
        logger.info(f"💾 Database commit successful!")

        # ── 5. Update caches ───────────────────────────────────────────────
        global rap_cache, price_cache
        for result in results:
            if result['rap'] is not None:
                rap_cache[result['asset_id']] = result['rap']
            if result['price'] is not None:
                price_cache[result['asset_id']] = result['price']

    except psycopg2.Error as e:
        logger.error(f"❌ PostgreSQL error: {e}")
        logger.error(f"Error code: {e.pgcode}")
        if conn:
            conn.rollback()
    except Exception as e:
        logger.error(f"❌ Unexpected database error: {e}")
        logger.error(traceback.format_exc())
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            return_db_connection(conn)


def load_rap_cache():
    """Load previous RAP values into memory cache"""
    global rap_cache

    if rap_cache:
        logger.info(f"Using cached RAP values ({len(rap_cache)} items)")
        return rap_cache

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        logger.info("Loading previous RAP values from database...")

        cursor.execute('''
            WITH ranked AS (
                SELECT "itemId", rap,
                       ROW_NUMBER() OVER (PARTITION BY "itemId" ORDER BY timestamp DESC) as rn
                FROM "PriceHistory"
                WHERE rap IS NOT NULL
            )
            SELECT "itemId", rap FROM ranked WHERE rn = 1
        ''')

        rap_cache = {row[0]: row[1] for row in cursor.fetchall()}
        logger.info(f"✅ Loaded {len(rap_cache)} RAP values into cache")

        return rap_cache

    except Exception as e:
        logger.error(f"❌ Error loading RAP cache: {e}")
        return {}
    finally:
        if cursor:
            cursor.close()
        if conn:
            return_db_connection(conn)


def load_price_cache():
    """Load previous best-price values into memory cache"""
    global price_cache

    if price_cache:
        logger.info(f"Using cached price values ({len(price_cache)} items)")
        return price_cache

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        logger.info("Loading previous price values from database...")

        cursor.execute('''
            WITH ranked AS (
                SELECT "itemId", price,
                       ROW_NUMBER() OVER (PARTITION BY "itemId" ORDER BY timestamp DESC) as rn
                FROM "PriceHistory"
                WHERE price IS NOT NULL
            )
            SELECT "itemId", price FROM ranked WHERE rn = 1
        ''')

        price_cache = {row[0]: row[1] for row in cursor.fetchall()}
        logger.info(f"✅ Loaded {len(price_cache)} price values into cache")

        return price_cache

    except Exception as e:
        logger.error(f"❌ Error loading price cache: {e}")
        return {}
    finally:
        if cursor:
            cursor.close()
        if conn:
            return_db_connection(conn)


def update_item_prices():
    """Main update logic"""
    conn = None
    cursor = None

    try:
        logger.info("=" * 80)
        logger.info("Starting price update cycle")
        logger.info("=" * 80)

        current_time = get_current_time()

        conn = get_db_connection()
        cursor = conn.cursor()

        logger.info("Fetching items from database...")
        cursor.execute('SELECT "assetId", name FROM "Item"')
        items = cursor.fetchall()

        if not items:
            logger.warning("⚠️ No items found in database!")
            return

        logger.info(f"📊 Found {len(items)} items in database")

        cursor.close()
        return_db_connection(conn)
        conn = None
        cursor = None

        previous_raps = load_rap_cache()
        previous_prices = load_price_cache()

        rolimons_data = fetch_rolimons_data()

        if not rolimons_data:
            logger.error("❌ Failed to fetch data from Rolimons - skipping this cycle")
            return

        results = process_items_data(items, rolimons_data, previous_raps, previous_prices)

        save_results_to_db(results, current_time)

        logger.info("=" * 80)
        logger.info("✅ Price update cycle complete!")
        logger.info("=" * 80)

    except Exception as e:
        logger.error(f"❌ Critical error in update_item_prices: {e}")
        logger.error(traceback.format_exc())
    finally:
        if cursor:
            cursor.close()
        if conn:
            return_db_connection(conn)


def main():
    """Main worker loop"""
    logger.info("=" * 80)
    logger.info("🚀 Azurewrath Worker Starting")
    logger.info("=" * 80)
    logger.info(f"Update interval: {WORKER_INTERVAL} seconds")
    logger.info(f"Timestamps: real UTC (no bucketing)")
    logger.info(f"Database: {DATABASE_URL[:30]}..." if DATABASE_URL else "No database URL!")
    logger.info("=" * 80)

    try:
        init_connection_pool()
    except Exception as e:
        logger.error(f"❌ Failed to initialize - exiting")
        return

    create_indexes()

    start_snipe_server()

    cycle_count = 0

    while True:
        try:
            cycle_count += 1
            logger.info(f"\n🔄 Starting cycle #{cycle_count}")

            start_time = time.time()
            update_item_prices()
            elapsed = time.time() - start_time

            logger.info(f"⏱️  Cycle #{cycle_count} took {elapsed:.2f} seconds")
            logger.info(f"😴 Sleeping for {WORKER_INTERVAL} seconds...")
            logger.info("")

            time.sleep(WORKER_INTERVAL)

        except KeyboardInterrupt:
            logger.info("\n" + "=" * 80)
            logger.info("👋 Worker stopped by user (Ctrl+C)")
            logger.info("=" * 80)
            break
        except Exception as e:
            logger.error(f"❌ Unexpected error in main loop: {e}")
            logger.error(traceback.format_exc())
            logger.info("⏳ Waiting 30 seconds before retry...")
            time.sleep(30)


if __name__ == "__main__":
    main()