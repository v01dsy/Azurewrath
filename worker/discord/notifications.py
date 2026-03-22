# worker/discord/notifications.py

import os
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
DISCORD_API = 'https://discord.com/api/v10'
APP_URL = os.getenv('NEXT_PUBLIC_APP_URL', 'https://azurewrath.lol')

EMOJI_GAIN      = '<:gain:1484974786751762483>'
EMOJI_LOSS      = '<:loss:1484974812701917344>'
EMOJI_MANIPULATED = '<:manipulated:1484974931526680710>'


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


def _build_embed(row: tuple) -> dict:
    """
    Discord row columns:
    (id, userId, itemId, type, message, oldValue, newValue, read, createdAt, imageUrl, itemName, manipulated)
    """
    _, user_id, item_id, notif_type, message, old_value, new_value, _, created_at, image_url, item_name, manipulated = row

    went_up = new_value is not None and old_value is not None and new_value > old_value
    colour = 0x57F287 if went_up else 0xED4245
    emoji = EMOJI_GAIN if went_up else EMOJI_LOSS

    display_name = item_name or f'Item {item_id}'
    if manipulated:
        display_name = f'{display_name} {EMOJI_MANIPULATED}'

    # Title line
    if notif_type == 'price_and_rap_change':
        title_line = f'{emoji} Item Sold'
    else:
        title_line = f'{emoji} Price Change'

    fields = []

    if notif_type == 'price_and_rap_change':
        # RAP row
        if old_value is not None and new_value is not None:
            fields.append({
                'name': 'Old RAP',
                'value': f'**{int(old_value):,}** R$',
                'inline': True,
            })
            fields.append({
                'name': 'New RAP',
                'value': f'**{int(new_value):,}** R$',
                'inline': True,
            })
    else:
        # Price change only
        if old_value is not None and new_value is not None:
            fields.append({
                'name': 'Old Price',
                'value': f'**{int(old_value):,}** R$',
                'inline': True,
            })
            fields.append({
                'name': 'New Price',
                'value': f'**{int(new_value):,}** R$',
                'inline': True,
            })

    embed = {
        'author': {
            'name': 'Azurewrath',
            'icon_url': 'https://azurewrath.lol/Images/icon.webp',
            'url': APP_URL,
        },
        'title': display_name,
        'url': f'{APP_URL}/item/{item_id}',
        'description': title_line,
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

        embed = _build_embed(row)

        if _send_dm(discord_id, embed):
            dm_success += 1
        else:
            dm_fail += 1

    logger.info(f'DMs — {dm_success} sent, {dm_fail} failed')