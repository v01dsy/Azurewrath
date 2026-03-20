# worker/backfill_descriptions.py
"""
One-time script to fix placeholder descriptions for all items.
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

from pathlib import Path
load_dotenv(Path(__file__).parent.parent / '.env.local')
load_dotenv(Path(__file__).parent.parent / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv('DATABASE_URL', '')
ROBLOX_COOKIE = '_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_CAEaAhADIhwKBGR1aWQSFDEzNDA1MDUzODI3MDUwNDU2ODA3KAM.HfJLpK33_BEzMSa8Hm9zpQelY9o9ARVDK_cvssAvDMwTtMDgmxetgoVVidC3rf5cAyp3Fu5xUK8PwVG1K_M7Lg61bWT6if0xhWBwmVaE4LOJVKTYwoZGZC8WHhrfPGVHUrjUNWkMyFgx57iWR5FynreXNmCg6SH0QhSDNS3lWt3AQ0j591jGtMOoO92_P5pl5RXPbRrbakkCD2dVEDxoHlKl_YrS933gOvV6Ld_I-gbQKYUbe-44KL5bL6zufhWvQIKfngUe9JcOLwtUOL-4QV2TS1ZgRM7R2YePWS76rnW58O-nPHiSvgcaUYe6NbuM5-bNm8PVuHqdfKuAHUtdOpE15z4Lz_A8_TWwpZzFy5Vbh1nLkpzJgNP2i49QmLxav9eBor_1nDJbHlYDLnt-Ijt2W-6GzWhBUKAlan3kY7rZhUSxN3P3K0ZI9OUgYf1Xz9RsEkoKyEzMvg7O4BoeXPebxuFfQGl8tOWc8fGrWIg-vqT9znFxZ2k6xHYdnd9ZO0CUWgeYvwGRy1PsGGGe4XJyPISDTjydvTcfqoureDfzymeKHwOseQzJUTztK_FFPGCpNWEjr625FVsTWPhnAk86FsQqHGQj_tGM51uoV96lGECmrJ94_YZhg785q5WnoGcqO9K-TyxnCEFMb4GVDUwQqbW7e4tI3zQ_9n_I0Pug0Xu6Y2Zn2XjqHf9y_u1DbpCHG5K9SSziUO4ciX8AxvRpBWpOLi1fms7cVf_cMNM3ZTDFMJGXvWZ-P3TNXQJI94pOf3ue2rodUMnZcVAVxlW9p8EAYbwMNavZnJyhAMHlvFJp'

DELAY_S = 0.01
RETRY_DELAY_S = 5
MAX_RETRIES = 10


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def roblox_headers():
    h = {'User-Agent': 'Mozilla/5.0'}
    if ROBLOX_COOKIE:
        h['Cookie'] = f'.ROBLOSECURITY={ROBLOX_COOKIE}'
    return h


def fetch_with_retry(url):
    for attempt in range(MAX_RETRIES):
        try:
            res = requests.get(url, headers=roblox_headers(), timeout=30)
            if res.status_code == 429:
                wait = RETRY_DELAY_S * (2 ** attempt)
                logger.warning(f"429 rate limited — waiting {wait}s (attempt {attempt+1}/{MAX_RETRIES})")
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


def fetch_description(asset_id: str):
    """Fetch description from economy API."""
    data = fetch_with_retry(f'https://economy.roblox.com/v2/assets/{asset_id}/details')
    if not data:
        return None
    return data.get('Description')


def is_placeholder(description: str | None, name: str) -> bool:
    """Check if description is a seed script placeholder."""
    if not description:
        return True
    return 'Asset ID:' in description and description.startswith(name)


def main():
    logger.info('🔄 Starting description backfill...')
    logger.info(f'Cookie present: {bool(ROBLOX_COOKIE)}, length: {len(ROBLOX_COOKIE)}')

    conn = get_conn()

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute('SELECT "assetId", name, description FROM "Item"')
        items = cur.fetchall()

    pending = [i for i in items if is_placeholder(i['description'], i['name'])]
    already_done = len(items) - len(pending)

    logger.info(f'📦 Total items: {len(items)}')
    logger.info(f'⏭️  Already good: {already_done}')
    logger.info(f'🔧 To process: {len(pending)}')

    if not pending:
        logger.info('✅ Nothing to do!')
        conn.close()
        return

    updated = 0
    failed = 0

    for idx, item in enumerate(pending):
        asset_id = str(item['assetId'])
        progress = f'[{idx + 1}/{len(pending)}]'

        description = fetch_description(asset_id)
        time.sleep(DELAY_S)

        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE "Item"
                    SET
                        description = COALESCE(%s, description),
                        "updatedAt" = NOW()
                    WHERE "assetId" = %s
                """, (description, item['assetId']))
            conn.commit()

            status = '✅' if description else '⚠️  no desc'
            logger.info(f'{progress} {status} — {item["name"]}')
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