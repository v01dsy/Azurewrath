# worker/discord/notifications.py

import os
import uuid
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


def _build_trade_ad_embed(row: tuple) -> dict:
    # message format: "username|side|trade_ad_id"
    # oldValue stores the trade_ad_id as a float
    _, user_id, item_id, notif_type, message, trade_ad_id, _, _, created_at, image_url, item_name, manipulated = row

    parts = message.split('|')
    poster_username = parts[0] if len(parts) > 0 else 'Someone'
    side = parts[1] if len(parts) > 1 else 'offer'
    ad_id = int(trade_ad_id) if trade_ad_id else 0

    side_label = 'requesting' if side == 'request' else 'offering'
    color = 0xED4245 if side == 'request' else 0x57F287

    embed = {
        'author': {'name': 'Azurewrath', 'icon_url': f'{APP_URL}/Images/icon.webp', 'url': APP_URL},
        'title': item_name or f'Item {item_id}',
        'url': f'{APP_URL}/trade/{ad_id}',
        'description': f'{EMOJI_WATCHLIST} **{poster_username}** posted a trade ad {side_label} this item',
        'color': color,
        'fields': [
            {'name': 'Side', 'value': side_label.capitalize(), 'inline': True},
            {'name': 'View Ad', 'value': f'[Open]({APP_URL}/trade/{ad_id})', 'inline': True},
        ],
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
        if notif_type == 'price_and_rap_change':
            embed = _build_sale_embed(row)
        elif notif_type == 'trade_ad':
            embed = _build_trade_ad_embed(row)
        else:
            embed = _build_price_embed(row)

        if _send_dm(discord_id, embed):
            dm_success += 1
        else:
            dm_fail += 1

    logger.info(f'DMs — {dm_success} sent, {dm_fail} failed')