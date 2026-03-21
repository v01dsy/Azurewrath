# discord_notifications.py

import os
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL')

DISCORD_API = 'https://discord.com/api/v10'

# Custom emojis
EMOJI_GAIN         = '<:gain:1484974786751762483>'
EMOJI_LOSS         = '<:loss:1484974812701917344>'
EMOJI_WATCHLIST    = '<:watchlist:1484974826719281254>'
EMOJI_NOTIFICATION = '<:notification:1484974882088423474>'
EMOJI_MANIPULATED  = '<:manipulated:1484974931526680710>'
EMOJI_SALES        = '<:sales:1484974979715043329>'
EMOJI_ICON         = '<:icon:1484978261959114893>'

APP_URL = os.getenv('NEXT_PUBLIC_APP_URL', 'https://azurewrath.lol')


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


def _send_webhook(embeds: list[dict]) -> bool:
    if not DISCORD_WEBHOOK_URL:
        return False
    try:
        for i in range(0, len(embeds), 10):
            batch = embeds[i:i + 10]
            res = requests.post(DISCORD_WEBHOOK_URL, json={'embeds': batch}, timeout=10)
            if not res.ok:
                logger.warning(f'Webhook send failed: {res.status_code} {res.text}')
                return False
        return True
    except Exception as e:
        logger.error(f'_send_webhook error: {e}')
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

    Embed style (clean, Rolimons-inspired):
      AUTHOR:      <:icon:...> Azurewrath
      TITLE:       Item Name  ← clickable link to item page
      DESCRIPTION: <:watchlist:...> Watchlist Alert
      FIELD 1:     subtype (RAP + Price Change / Price Change)
      FIELD 2:     <gain/loss> old → new R$
      THUMBNAIL:   item image
      FOOTER:      timestamp
    """
    _, user_id, item_id, notif_type, message, old_value, new_value, _, created_at, image_url, item_name, manipulated = row

    went_up = new_value is not None and old_value is not None and new_value > old_value
    colour = 0x57F287 if went_up else 0xED4245
    direction_emoji = EMOJI_GAIN if went_up else EMOJI_LOSS

    if notif_type == 'price_and_rap_change':
        subtype = f'{EMOJI_SALES} RAP + Price Change'
    else:
        subtype = f'{EMOJI_WATCHLIST} Price Change'

    # Item name with manipulated tag if needed
    display_name = item_name or f'Item {item_id}'
    if manipulated:
        display_name = f'{display_name} {EMOJI_MANIPULATED}'

    fields = [
        {
            'name': subtype,
            'value': (
                f'{direction_emoji} **{int(old_value):,}** → **{int(new_value):,}** R$'
                if old_value is not None and new_value is not None
                else 'N/A'
            ),
            'inline': False,
        },
    ]

    embed = {
        'author': {
            'name': 'Azurewrath',
            'icon_url': 'https://azurewrath.lol/Images/icon.webp',
            'url': APP_URL,
        },
        'title': display_name,
        'url': f'{APP_URL}/item/{item_id}',
        'description': f'{EMOJI_WATCHLIST} Watchlist Alert',
        'color': colour,
        'fields': fields,
        'footer': {'text': _format_ts(created_at)},
    }

    if image_url:
        embed['thumbnail'] = {'url': image_url}

    return embed


def _build_summary_embed(rows: list[tuple]) -> dict:
    """Summary embed for multiple item changes."""
    any_down = any(row[6] is not None and row[5] is not None and row[6] < row[5] for row in rows)
    colour = 0xED4245 if any_down else 0x57F287
    ts = _format_ts(rows[0][8] if rows else None)

    fields = []
    for row in rows[:10]:
        _, _, item_id, notif_type, message, old_value, new_value, _, _, image_url, item_name, manipulated = row
        went_up = new_value is not None and old_value is not None and new_value > old_value
        direction_emoji = EMOJI_GAIN if went_up else EMOJI_LOSS
        subtype = f'{EMOJI_SALES} RAP + Price Change' if notif_type == 'price_and_rap_change' else f'{EMOJI_WATCHLIST} Price Change'

        display_name = item_name or f'Item {item_id}'
        if manipulated:
            display_name = f'{display_name} {EMOJI_MANIPULATED}'

        fields.append({
            'name': f'[{display_name}]({APP_URL}/item/{item_id})',
            'value': (
                f'{subtype}\n{direction_emoji} **{int(old_value):,}** → **{int(new_value):,}** R$'
                if old_value is not None and new_value is not None
                else f'{subtype}\n{message}'
            ),
            'inline': False,
        })

    return {
        'author': {
            'name': 'Azurewrath',
            'icon_url': 'https://azurewrath.lol/Images/icon.webp',
            'url': APP_URL,
        },
        'title': f'{EMOJI_WATCHLIST} Watchlist Alert',
        'description': f'**{len(rows)} items** on your watchlist have changed.',
        'color': colour,
        'url': f'{APP_URL}/notifications',
        'fields': fields,
        'footer': {'text': ts},
    }


def send_discord_notifications(cursor, discord_rows: list[tuple]):
    if not discord_rows:
        return

    if not DISCORD_BOT_TOKEN and not DISCORD_WEBHOOK_URL:
        logger.warning('No DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL set — skipping Discord')
        return

    logger.info(f'send_discord_notifications() — {len(discord_rows)} rows')

    # 1. Webhook — deduplicate by item
    if DISCORD_WEBHOOK_URL:
        seen_items: set[int] = set()
        webhook_embeds: list[dict] = []
        for row in discord_rows:
            item_id = int(row[2])
            if item_id not in seen_items:
                seen_items.add(item_id)
                webhook_embeds.append(_build_embed(row))
        if webhook_embeds:
            success = _send_webhook(webhook_embeds)
            if success:
                logger.info(f'Webhook fired — {len(webhook_embeds)} embed(s)')
            else:
                logger.error('Webhook failed — check DISCORD_WEBHOOK_URL in .env')

    # 2. DMs — opted-in users only
    if not DISCORD_BOT_TOKEN:
        logger.info('No bot token — skipping DMs')
        return

    user_ids = list({int(row[1]) for row in discord_rows})
    logger.info(f'Looking up user_ids: {user_ids}')

    if not user_ids:
        return

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
    logger.info(f'opted_in: {opted_in} — {len(opted_in)} user(s)')

    if not opted_in:
        logger.info('No opted-in users with Discord linked — skipping DMs')
        return

    user_rows: dict[int, list[tuple]] = {}
    for row in discord_rows:
        uid = int(row[1])
        if uid in opted_in:
            user_rows.setdefault(uid, []).append(row)

    dm_success = 0
    dm_fail = 0

    for user_id, discord_id in opted_in.items():
        rows = user_rows.get(user_id, [])
        if not rows:
            logger.warning(f'No rows found for opted-in user {user_id} — skipping')
            continue

        logger.info(f'Sending DM to [userId {user_id}] discordId={discord_id}, {len(rows)} notification(s)')

        embed = _build_embed(rows[0]) if len(rows) == 1 else _build_summary_embed(rows)

        if _send_dm(discord_id, embed):
            dm_success += 1
            logger.info(f'DM sent to [userId {user_id}]')
        else:
            dm_fail += 1
            logger.error(f'DM failed for [userId {user_id}]')

    logger.info(f'DMs — {dm_success} sent, {dm_fail} failed')