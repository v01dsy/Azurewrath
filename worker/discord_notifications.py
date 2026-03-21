# discord_notifications.py
# Drop this file alongside your worker.py and import it.
#
# Requires in your .env:
#   DISCORD_BOT_TOKEN=Bot your_bot_token_here
#   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

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
            res = requests.post(
                DISCORD_WEBHOOK_URL,
                json={'embeds': batch},
                timeout=10,
            )
            if not res.ok:
                logger.warning(f'Webhook send failed: {res.status_code} {res.text}')
                return False
        return True
    except Exception as e:
        logger.error(f'_send_webhook error: {e}')
        return False


def _build_embed(notification_row: tuple, app_url: str) -> dict:
    """
    Row columns: (id, userId, itemId, type, message, oldValue, newValue, read, createdAt)

    Embed structure:
      TITLE:       <:icon:...> Azurewrath
      DESCRIPTION: <:watchlist:...> Watchlist Alert
      FIELD 1:     subtype — RAP + Price Change / Price Change  (bold)
      FIELD 2:     the full message with gain/loss emoji
      FIELD 3:     Change  (bold header)
      FIELD 4:     <gain/loss> old → new R$
      FOOTER:      -# timestamp with seconds
    """
    _, user_id, item_id, notif_type, message, old_value, new_value, _, created_at = notification_row

    went_up = (new_value is not None and old_value is not None and new_value > old_value)
    colour = 0x57F287 if went_up else 0xED4245
    direction_emoji = EMOJI_GAIN if went_up else EMOJI_LOSS

    # Subtype label
    if notif_type == 'price_and_rap_change':
        subtype = f'{EMOJI_SALES} RAP + Price Change'
    else:
        subtype = f'{EMOJI_WATCHLIST} Price Change'

    # Timestamp
    if created_at:
        if isinstance(created_at, str):
            ts = created_at
        else:
            ts = created_at.strftime('%Y-%m-%d at %H:%M:%S UTC')
    else:
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d at %H:%M:%S UTC')

    fields = [
        {
            'name': subtype,
            'value': f'{direction_emoji} {message}',
            'inline': False,
        },
        {
            'name': 'Change',
            'value': (
                f'{direction_emoji} **{int(old_value):,}** → **{int(new_value):,}** R$'
                if old_value is not None and new_value is not None
                else 'N/A'
            ),
            'inline': False,
        },
    ]

    return {
        'title': f'{EMOJI_ICON} Azurewrath',
        'description': f'{EMOJI_WATCHLIST} Watchlist Alert',
        'color': colour,
        'url': f'{app_url}/item/{item_id}',
        'fields': fields,
        'footer': {'text': f'-# {ts}'},
    }


def _build_summary_embed(rows: list[tuple], app_url: str) -> dict:
    """Build a summary embed when multiple items changed for one user."""
    any_down = any(
        row[6] is not None and row[5] is not None and row[6] < row[5]
        for row in rows
    )
    colour = 0xED4245 if any_down else 0x57F287

    created_at = rows[0][8] if rows else None
    if created_at:
        if isinstance(created_at, str):
            ts = created_at
        else:
            ts = created_at.strftime('%Y-%m-%d at %H:%M:%S UTC')
    else:
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d at %H:%M:%S UTC')

    fields = []
    for row in rows[:10]:
        _, _, item_id, notif_type, message, old_value, new_value, _, _ = row
        went_up = new_value is not None and old_value is not None and new_value > old_value
        direction_emoji = EMOJI_GAIN if went_up else EMOJI_LOSS

        subtype = f'{EMOJI_SALES} RAP + Price Change' if notif_type == 'price_and_rap_change' else f'{EMOJI_WATCHLIST} Price Change'

        fields.append({
            'name': subtype,
            'value': (
                f'{direction_emoji} **{int(old_value):,}** → **{int(new_value):,}** R$\n'
                f'{message}'
            ) if old_value is not None and new_value is not None else message,
            'inline': False,
        })

    return {
        'title': f'{EMOJI_ICON} Azurewrath',
        'description': f'{EMOJI_WATCHLIST} Watchlist Alert — **{len(rows)} items** changed',
        'color': colour,
        'url': f'{app_url}/notifications',
        'fields': fields,
        'footer': {'text': f'-# {ts}'},
    }


def send_discord_notifications(cursor, notification_rows: list[tuple]):
    if not notification_rows:
        return

    if not DISCORD_BOT_TOKEN and not DISCORD_WEBHOOK_URL:
        logger.warning('No DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL set — skipping Discord')
        return

    logger.info(f'send_discord_notifications() — {len(notification_rows)} rows')

    APP_URL = os.getenv('NEXT_PUBLIC_APP_URL', 'https://azurewrath.lol')

    # 1. Webhook — deduplicate by item
    if DISCORD_WEBHOOK_URL:
        seen_items: set[int] = set()
        webhook_embeds: list[dict] = []

        for row in notification_rows:
            item_id = int(row[2])
            if item_id not in seen_items:
                seen_items.add(item_id)
                webhook_embeds.append(_build_embed(row, APP_URL))

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

    user_ids = list({int(row[1]) for row in notification_rows})
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
    logger.info(f'opted_in result: {opted_in}')
    logger.info(f'Total opted-in users found: {len(opted_in)}')

    if not opted_in:
        logger.info('No opted-in users with Discord linked — skipping DMs')
        return

    logger.info(f'Sending DMs to {len(opted_in)} opted-in user(s)')

    user_rows: dict[int, list[tuple]] = {}
    for row in notification_rows:
        uid = int(row[1])
        if uid in opted_in:
            user_rows.setdefault(uid, []).append(row)

    dm_success = 0
    dm_fail = 0

    for roblox_user_id, discord_id in opted_in.items():
        rows = user_rows.get(roblox_user_id, [])
        if not rows:
            logger.warning(f'No rows found for opted-in user {roblox_user_id} — skipping')
            continue

        logger.info(f'Sending DM to robloxUserId={roblox_user_id}, discordId={discord_id}, {len(rows)} notification(s)')

        if len(rows) == 1:
            embed = _build_embed(rows[0], APP_URL)
        else:
            embed = _build_summary_embed(rows, APP_URL)

        if _send_dm(discord_id, embed):
            dm_success += 1
            logger.info(f'DM sent to discordId={discord_id}')
        else:
            dm_fail += 1
            logger.error(f'DM failed for discordId={discord_id}')

    logger.info(f'DMs — {dm_success} sent, {dm_fail} failed')