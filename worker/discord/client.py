# worker/discord/client.py
"""
Low-level Discord API helpers.
Only responsible for opening DM channels and sending messages.
"""

import os
import logging
import requests

logger = logging.getLogger(__name__)

DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
DISCORD_API       = 'https://discord.com/api/v10'


def _bot_headers() -> dict:
    return {
        'Authorization': f'Bot {DISCORD_BOT_TOKEN}',
        'Content-Type':  'application/json',
    }


def open_dm(discord_id: str) -> str | None:
    """Open (or retrieve) a DM channel with a user. Returns channel_id or None."""
    try:
        res = requests.post(
            f'{DISCORD_API}/users/@me/channels',
            headers=_bot_headers(),
            json={'recipient_id': discord_id},
            timeout=10,
        )
        if res.ok:
            return res.json()['id']
        logger.warning(f'[discord] Could not open DM with {discord_id}: {res.status_code} {res.text}')
    except Exception as e:
        logger.error(f'[discord] open_dm error: {e}')
    return None


def send_dm(discord_id: str, embed: dict) -> bool:
    """Send an embed as a DM. Returns True on success."""
    if not DISCORD_BOT_TOKEN:
        logger.warning('[discord] DISCORD_BOT_TOKEN not set — skipping DM')
        return False

    channel_id = open_dm(discord_id)
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
        logger.warning(f'[discord] DM send failed for {discord_id}: {res.status_code} {res.text}')
    except Exception as e:
        logger.error(f'[discord] send_dm error: {e}')
    return False