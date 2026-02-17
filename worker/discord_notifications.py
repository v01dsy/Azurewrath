# discord_notifications.py
# Drop this file alongside your worker.py and import it.
#
# Requires in your .env:
#   DISCORD_BOT_TOKEN=Bot your_bot_token_here
#   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
#
# The bot needs the "Send Messages" permission in the target channel,
# and the user must have DMs open from server members (or share a server).

import os
import json
import logging
import traceback
import requests

logger = logging.getLogger(__name__)

DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL')

DISCORD_API = 'https://discord.com/api/v10'

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _bot_headers():
    return {
        'Authorization': f'Bot {DISCORD_BOT_TOKEN}',
        'Content-Type': 'application/json',
    }


def _open_dm(discord_id: str) -> str | None:
    """Create (or fetch) a DM channel with a Discord user. Returns channel ID."""
    try:
        res = requests.post(
            f'{DISCORD_API}/users/@me/channels',
            headers=_bot_headers(),
            json={'recipient_id': discord_id},
            timeout=10,
        )
        if res.ok:
            return res.json()['id']
        logger.warning(f'⚠️  Could not open DM with {discord_id}: {res.status_code} {res.text}')
        return None
    except Exception as e:
        logger.error(f'❌ _open_dm error: {e}')
        return None


def _send_dm(discord_id: str, embed: dict) -> bool:
    """Open a DM channel then send an embed."""
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
        logger.warning(f'⚠️  DM send failed for {discord_id}: {res.status_code} {res.text}')
        return False
    except Exception as e:
        logger.error(f'❌ _send_dm error: {e}')
        return False


def _send_webhook(embeds: list[dict]) -> bool:
    """Fire embeds at the configured webhook."""
    if not DISCORD_WEBHOOK_URL:
        return False
    try:
        # Discord allows up to 10 embeds per webhook call
        for i in range(0, len(embeds), 10):
            batch = embeds[i:i + 10]
            res = requests.post(
                DISCORD_WEBHOOK_URL,
                json={'embeds': batch},
                timeout=10,
            )
            if not res.ok:
                logger.warning(f'⚠️  Webhook send failed: {res.status_code} {res.text}')
        return True
    except Exception as e:
        logger.error(f'❌ _send_webhook error: {e}')
        return False


def _build_embed(notification_row: tuple, app_url: str) -> dict:
    """
    Build a Discord embed from a notification row.
    Row columns: (id, userId, itemId, type, message, oldValue, newValue, read, createdAt)
    """
    _, user_id, item_id, notif_type, message, old_value, new_value, _, created_at = notification_row

    # Pick colour based on direction
    colour = 0x57F287  # green = good (price drop / deal)
    if notif_type == 'rap_change':
        colour = 0x5865F2  # blurple = RAP changed
    elif notif_type == 'price_and_rap_change':
        colour = 0xFEE75C  # yellow = both changed

    embed = {
        'title': '🔔 Watchlist Alert',
        'description': message,
        'color': colour,
        'url': f'{app_url}/item/{item_id}',
        'footer': {'text': 'Azurewrath · azurewrath.lol'},
    }

    if old_value is not None and new_value is not None:
        direction = '📈' if new_value > old_value else '📉'
        embed['fields'] = [
            {
                'name': 'Change',
                'value': f'{direction} **{int(old_value):,}** → **{int(new_value):,}** R$',
                'inline': True,
            }
        ]

    return embed


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point — call this from send_push_notifications() in your worker
# ─────────────────────────────────────────────────────────────────────────────

def send_discord_notifications(cursor, notification_rows: list[tuple]):
    """
    For each notification row, send:
      1. A webhook message to the configured channel (one embed per unique item change)
      2. A DM to any user who has opted in to Discord notifications

    Call this right after send_push_notifications() inside save_results_to_db().

    Usage in worker.py:
        from discord_notifications import send_discord_notifications
        ...
        send_discord_notifications(cursor, notification_rows)
    """
    if not notification_rows:
        return

    if not DISCORD_BOT_TOKEN and not DISCORD_WEBHOOK_URL:
        logger.warning('⚠️  No DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL set — skipping Discord')
        return

    logger.info(f'💬 send_discord_notifications() — {len(notification_rows)} rows')

    APP_URL = os.getenv('NEXT_PUBLIC_APP_URL', 'https://azurewrath.lol')

    # ── 1. Webhook: deduplicate by item so we don't spam one embed per watcher ──
    if DISCORD_WEBHOOK_URL:
        seen_items: set[int] = set()
        webhook_embeds: list[dict] = []

        for row in notification_rows:
            item_id = row[2]
            if item_id not in seen_items:
                seen_items.add(item_id)
                webhook_embeds.append(_build_embed(row, APP_URL))

        if webhook_embeds:
            _send_webhook(webhook_embeds)
            logger.info(f'✅ Webhook fired — {len(webhook_embeds)} embed(s)')

    # ── 2. DMs: only for users who opted in and have Discord linked ──
    if not DISCORD_BOT_TOKEN:
        logger.info('ℹ️  No bot token — skipping DMs')
        return

    # Get unique user IDs from the notification rows
    user_ids = list({row[1] for row in notification_rows})

    if not user_ids:
        return

    # Fetch opted-in users who have Discord linked
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
    opted_in = {row[0]: row[1] for row in cursor.fetchall()}

    if not opted_in:
        logger.info('ℹ️  No opted-in users with Discord linked — skipping DMs')
        return

    logger.info(f'📨 Sending DMs to {len(opted_in)} opted-in user(s)')

    # Group notification rows by user so we can send a combined message
    user_rows: dict[int, list[tuple]] = {}
    for row in notification_rows:
        uid = row[1]
        if uid in opted_in:
            user_rows.setdefault(uid, []).append(row)

    dm_success = 0
    dm_fail = 0

    for roblox_user_id, discord_id in opted_in.items():
        rows = user_rows.get(roblox_user_id, [])
        if not rows:
            continue

        if len(rows) == 1:
            embed = _build_embed(rows[0], APP_URL)
        else:
            # Multiple changes for this user — send a summary embed
            embed = {
                'title': '🔔 Watchlist Alert',
                'description': f'**{len(rows)} items** on your watchlist have changed.',
                'color': 0x5865F2,
                'url': f'{APP_URL}/notifications',
                'fields': [
                    {
                        'name': row[3].replace('_', ' ').title(),
                        'value': row[4],
                        'inline': False,
                    }
                    for row in rows[:10]  # cap at 10 fields (Discord limit)
                ],
                'footer': {'text': 'Azurewrath · azurewrath.lol'},
            }

        if _send_dm(discord_id, embed):
            dm_success += 1
        else:
            dm_fail += 1

    logger.info(f'✅ DMs — {dm_success} sent, {dm_fail} failed')