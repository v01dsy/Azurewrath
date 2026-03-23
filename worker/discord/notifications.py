# worker/discord/notifications.py

import os
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
DISCORD_API = 'https://discord.com/api/v10'
APP_URL = os.getenv('NEXT_PUBLIC_APP_URL', 'https://azurewrath.lol')

EMOJI_GAIN        = '<:gain:1484974786751762483>'
EMOJI_LOSS        = '<:loss:1484974812701917344>'
EMOJI_MANIPULATED = '<:manipulated:1484974931526680710>'
EMOJI_WATCHLIST   = '<:watchlist:1484974826719281254>'

_trade_last_run: datetime = datetime.now(timezone.utc)


def _bot_headers():
    return {
        'Authorization': f'Bot {DISCORD_BOT_TOKEN}',
        'Content-Type': 'application/json',
    }


def _open_dm(discord_id: str) -> str | None:
    try:
        res = requests.post(
            f'{DISCORD_API}/users/@me/channels',
            headers=_bot_headers(),
            json={'recipient_id': discord_id},
            timeout=10,
        )
        if res.ok:
            return res.json()['id']
        logger.warning(f'Could not open DM with {discord_id}: {res.status_code} {res.text}')
        return None
    except Exception as e:
        logger.error(f'_open_dm error: {e}')
        return None


def _send_dm(discord_id: str, embed: dict) -> bool:
    channel_id = _open_dm(discord_id)
    if not channel_id:
        return False
    try:
        res = requests.post(
            f'{DISCORD_API}/channels/{channel_id}/messages',
            headers=_bot_headers(),
            json={'embeds': [embed]},
            timeout=10,
        )
        if res.ok:
            return True
        logger.warning(f'DM send failed for {discord_id}: {res.status_code} {res.text}')
        return False
    except Exception as e:
        logger.error(f'_send_dm error: {e}')
        return False


def _format_ts(created_at) -> str:
    if created_at:
        if isinstance(created_at, str):
            return created_at
        return created_at.strftime('%Y-%m-%d at %H:%M:%S UTC')
    return datetime.now(timezone.utc).strftime('%Y-%m-%d at %H:%M:%S UTC')


def _build_sale_embed(row: tuple) -> dict:
    _, user_id, item_id, notif_type, message, old_rap, new_rap, _, created_at, image_url, item_name, manipulated = row

    went_up = new_rap is not None and old_rap is not None and new_rap > old_rap
    colour = 0x57F287 if went_up else 0xED4245
    emoji = EMOJI_GAIN if went_up else EMOJI_LOSS

    display_name = item_name or f'Item {item_id}'
    if manipulated:
        display_name = f'{display_name} {EMOJI_MANIPULATED}'

    rap_diff = int(new_rap - old_rap) if (old_rap is not None and new_rap is not None) else 0
    estimated_sale = int(old_rap + ((new_rap - old_rap) * 10)) if (old_rap is not None and new_rap is not None) else None

    fields = []
    if old_rap is not None:
        fields.append({'name': 'Old RAP', 'value': f'{int(old_rap):,}', 'inline': True})
    if new_rap is not None:
        fields.append({'name': 'New RAP', 'value': f'{int(new_rap):,}', 'inline': True})
    if estimated_sale is not None:
        fields.append({'name': 'Sale Price', 'value': f'{estimated_sale:,}', 'inline': True})

    embed = {
        'author': {'name': 'Azurewrath', 'icon_url': f'{APP_URL}/Images/icon.webp', 'url': APP_URL},
        'title': display_name,
        'url': f'{APP_URL}/item/{item_id}',
        'description': f'RAP change **{("+" if rap_diff >= 0 else "")}{rap_diff:,}** {emoji}',
        'color': colour,
        'fields': fields,
        'footer': {'text': _format_ts(created_at)},
    }
    if image_url:
        embed['thumbnail'] = {'url': image_url}
    return embed


def _build_price_embed(row: tuple) -> dict:
    _, user_id, item_id, notif_type, message, old_price, new_price, _, created_at, image_url, item_name, manipulated = row

    went_up = new_price is not None and old_price is not None and new_price > old_price
    colour = 0x57F287 if went_up else 0xED4245
    emoji = EMOJI_GAIN if went_up else EMOJI_LOSS

    display_name = item_name or f'Item {item_id}'
    if manipulated:
        display_name = f'{display_name} {EMOJI_MANIPULATED}'

    fields = []
    if old_price is not None:
        fields.append({'name': 'Old Price', 'value': f'{int(old_price):,}', 'inline': True})
    if new_price is not None:
        fields.append({'name': 'New Price', 'value': f'{int(new_price):,}', 'inline': True})

    embed = {
        'author': {'name': 'Azurewrath', 'icon_url': f'{APP_URL}/Images/icon.webp', 'url': APP_URL},
        'title': display_name,
        'url': f'{APP_URL}/item/{item_id}',
        'description': f'{emoji} Price Change',
        'color': colour,
        'fields': fields,
        'footer': {'text': _format_ts(created_at)},
    }
    if image_url:
        embed['thumbnail'] = {'url': image_url}
    return embed


def send_discord_notifications(cursor, discord_rows: list[tuple]):
    if not discord_rows:
        return

    if not DISCORD_BOT_TOKEN:
        logger.warning('No DISCORD_BOT_TOKEN set — skipping Discord DMs')
        return

    logger.info(f'send_discord_notifications() — {len(discord_rows)} rows')

    user_ids = list({int(row[1]) for row in discord_rows})
    cursor.execute(
        '''
        SELECT "robloxUserId", "discordId"
        FROM "User"
        WHERE "robloxUserId" = ANY(%s)
          AND "discordNotifications" = TRUE
          AND "discordId" IS NOT NULL
        ''',
        (user_ids,),
    )
    opted_in = {int(row[0]): row[1] for row in cursor.fetchall()}

    if not opted_in:
        logger.info('No opted-in users with Discord linked — skipping DMs')
        return

    dm_success = 0
    dm_fail = 0

    for row in discord_rows:
        user_id = int(row[1])
        discord_id = opted_in.get(user_id)
        if not discord_id:
            continue

        notif_type = row[3]
        embed = _build_sale_embed(row) if notif_type == 'price_and_rap_change' else _build_price_embed(row)

        if _send_dm(discord_id, embed):
            dm_success += 1
        else:
            dm_fail += 1

    logger.info(f'DMs — {dm_success} sent, {dm_fail} failed')


def send_trade_ad_notifications(cursor):
    global _trade_last_run
    since = _trade_last_run
    _trade_last_run = datetime.now(timezone.utc)

    if not DISCORD_BOT_TOKEN:
        return

    cursor.execute("""
        SELECT
            ta.id,
            ta."userId",
            u.username,
            tai."assetId",
            tai.side,
            i.name        AS item_name,
            i."imageUrl"  AS item_image
        FROM "TradeAd" ta
        JOIN "User" u          ON u."robloxUserId" = ta."userId"
        JOIN "TradeAdItem" tai  ON tai."tradeAdId" = ta.id
        JOIN "Item" i           ON i."assetId" = tai."assetId"
        WHERE ta."createdAt" > %s
          AND ta.active = true
          AND ta."deletedAt" IS NULL
        ORDER BY ta.id ASC
    """, (since,))
    rows = cursor.fetchall()

    if not rows:
        return

    ads: dict[int, dict] = {}
    for ad_id, poster_id, username, asset_id, side, item_name, item_image in rows:
        if ad_id not in ads:
            ads[ad_id] = {'poster_id': poster_id, 'username': username, 'items': []}
        ads[ad_id]['items'].append({
            'asset_id': asset_id,
            'side': side,
            'item_name': item_name,
            'item_image': item_image,
        })

    logger.info(f'[trade_notify] {len(ads)} new trade ad(s) since last cycle')

    for ad_id, ad in ads.items():
        asset_ids = [item['asset_id'] for item in ad['items']]

        cursor.execute("""
            SELECT w."userId", w."itemId", w."tradeAlertType", u."discordId"
            FROM "Watchlist" w
            JOIN "User" u ON u."robloxUserId" = w."userId"
            WHERE w."itemId" = ANY(%s)
              AND w."tradeAlerts" = true
              AND u."discordNotifications" = true
              AND u."discordId" IS NOT NULL
              AND w."userId" != %s
        """, (asset_ids, ad['poster_id']))
        watchers = cursor.fetchall()

        if not watchers:
            continue

        notified: set = set()

        for watcher_user_id, item_id, alert_type, discord_id in watchers:
            if watcher_user_id in notified:
                continue

            matching = next((i for i in ad['items'] if i['asset_id'] == item_id), None)
            if not matching:
                continue

            side = matching['side']
            if alert_type == 'requesting' and side != 'request':
                continue
            if alert_type == 'offering' and side != 'offer':
                continue

            side_label = 'requesting' if side == 'request' else 'offering'
            color = 0xED4245 if side == 'request' else 0x57F287

            embed = {
                'author': {'name': 'Azurewrath', 'icon_url': f'{APP_URL}/Images/icon.webp', 'url': APP_URL},
                'title': matching['item_name'],
                'url': f'{APP_URL}/trade/{ad_id}',
                'description': f'{EMOJI_WATCHLIST} **{ad["username"]}** posted a trade ad {side_label} this item',
                'color': color,
                'fields': [
                    {'name': 'Side', 'value': side_label.capitalize(), 'inline': True},
                    {'name': 'View Ad', 'value': f'[Open]({APP_URL}/trade/{ad_id})', 'inline': True},
                ],
                'footer': {'text': 'Azurewrath Trade Alerts'},
            }
            if matching['item_image']:
                embed['thumbnail'] = {'url': matching['item_image']}

            if _send_dm(discord_id, embed):
                notified.add(watcher_user_id)
                logger.info(f'[trade_notify] ✅ Notified userId {watcher_user_id} for trade ad {ad_id}')
            else:
                logger.warning(f'[trade_notify] ❌ DM failed for userId {watcher_user_id}')