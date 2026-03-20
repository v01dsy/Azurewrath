# worker/backfill_descriptions.py
"""
One-time script to fix placeholder descriptions and missing images for all items.
Run with: python backfill_descriptions.py
Delete after use!
"""

import os
import time
import logging
import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv('DATABASE_URL', '')
ROBLOX_COOKIE = os.getenv('ROBLOX_SECURITY_COOKIE', '').strip('"').strip("'")

DELAY_S = 1.2
RETRY_DELAY_S = 10.0
MAX_RETRIES = 3
THUMBNAIL_BATCH = 100


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def roblox_headers():
    h = {'User-Agent': 'Mozilla/5.0'}
    if ROBLOX_COOKIE:
        h['Cookie'] = f'.ROBLOSECURITY={ROBLOX_COOKIE}'
    return h


def fetch_with_retry(url, max_retries=MAX_RETRIES):
    for attempt in range(max_retries):
        try:
            res = requests.get(url, headers=roblox_headers(), timeout=30)
            if res.status_code == 429:
                wait = RETRY_DELAY_S * (2 ** attempt)
                logger.warning(f"429 rate limited — waiting {wait}s (attempt {attempt+1}/{max_retries})")
                time.sleep(wait)
                continue
            if res.status_code in (400, 404):
                return None
            if not res.ok:
                time.sleep(RETRY_DELAY_S)
                continue
            return res.json()
        except requests.RequestException as e:
            logger.warning(f"Network error (attempt {attempt+1}): {e}")
            time.sleep(RETRY_DELAY_S)
    return None


def fetch_item_details(asset_id: str):
    """Fetch name + description from economy API."""
    data = fetch_with_retry(f'https://economy.roblox.com/v2/assets/{asset_id}/details')
    if not data:
        return None, None
    return data.get('Name'), data.get('Description')


def fetch_thumbnails_bulk(asset_ids: list) -> dict:
    """Fetch thumbnails for up to 100 asset IDs at once."""
    result = {}
    for i in range(0, len(asset_ids), THUMBNAIL_BATCH):
        batch = asset_ids[i:i + THUMBNAIL_BATCH]
        url = f'https://thumbnails.roblox.com/v1/assets?assetIds={",".join(batch)}&size=420x420&format=Webp&isCircular=false'
        data = fetch_with_retry(url)
        if data and data.get('data'):
            for item in data['data']:
                if item.get('assetId') and item.get('imageUrl'):
                    result[str(item['assetId'])] = item['imageUrl']
        time.sleep(1.0)
    return result


def is_placeholder(description: str | None, name: str) -> bool:
    """Check if description is a seed script placeholder."""
    if not description:
        return True
    return 'Asset ID:' in description and description.startswith(name)


def main():
    logger.info('🔄 Starting description + image backfill...')
    logger.info(f'Cookie present: {bool(ROBLOX_COOKIE)}, length: {len(ROBLOX_COOKIE)}')

    conn = get_conn()

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute('SELECT "assetId", name, description, "imageUrl" FROM "Item"')
        items = cur.fetchall()

    pending = [
        i for i in items
        if is_placeholder(i['description'], i['name']) or not i['imageUrl']
    ]
    already_done = len(items) - len(pending)

    logger.info(f'📦 Total items: {len(items)}')
    logger.info(f'⏭️  Already good: {already_done}')
    logger.info(f'🔧 To process: {len(pending)}')

    if not pending:
        logger.info('✅ Nothing to do!')
        conn.close()
        return

    # Bulk fetch thumbnails first
    logger.info('🖼️  Fetching thumbnails in bulk...')
    asset_id_strings = [str(i['assetId']) for i in pending]
    thumbnail_map = fetch_thumbnails_bulk(asset_id_strings)
    logger.info(f'✅ Got {len(thumbnail_map)} thumbnails')

    updated = 0
    skipped = 0
    failed = 0

    for idx, item in enumerate(pending):
        asset_id = str(item['assetId'])
        progress = f'[{idx + 1}/{len(pending)}]'

        needs_description = is_placeholder(item['description'], item['name'])
        needs_image = not item['imageUrl']

        new_name = item['name']
        new_description = item['description']
        new_image_url = item['imageUrl']

        # Fetch description if needed
        if needs_description:
            name, description = fetch_item_details(asset_id)
            if name:
                new_name = name
            if description is not None:
                new_description = description
            # If description came back None, keep existing rather than nulling it
            time.sleep(DELAY_S)

        # Use bulk-fetched thumbnail
        if needs_image and asset_id in thumbnail_map:
            new_image_url = thumbnail_map[asset_id]

        # Update DB
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE "Item"
                    SET
                        name = %s,
                        description = %s,
                        "imageUrl" = COALESCE(%s, "imageUrl"),
                        "updatedAt" = NOW()
                    WHERE "assetId" = %s
                """, (new_name, new_description, new_image_url, item['assetId']))
            conn.commit()

            desc_status = '✅ desc' if needs_description and new_description else ('⏭️ desc ok' if not needs_description else '⚠️ no desc')
            img_status = '✅ img' if needs_image and new_image_url else ('⏭️ img ok' if not needs_image else '⚠️ no img')
            logger.info(f'{progress} {desc_status} | {img_status} — {new_name}')
            updated += 1

        except Exception as e:
            conn.rollback()
            logger.error(f'{progress} ❌ DB update failed for {item["name"]}: {e}')
            failed += 1

    logger.info('========== DONE ==========')
    logger.info(f'✅ Updated:  {updated}')
    logger.info(f'⏭️  Skipped:  {already_done}')
    logger.info(f'❌ Failed:   {failed}')

    conn.close()


if __name__ == '__main__':
    main()