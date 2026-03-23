# worker/discord/client.py
"""
Low-level Discord API helpers.
Supports plain embeds and embeds with a PNG file attachment.
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
    }


def open_dm(discord_id: str) -> str | None:
    """Open (or retrieve) a DM channel with a user. Returns channel_id or None."""
    try:
        res = requests.post(
            f'{DISCORD_API}/users/@me/channels',
            headers={**_bot_headers(), 'Content-Type': 'application/json'},
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
    """Send an embed as a DM (no attachment). Returns True on success."""
    if not DISCORD_BOT_TOKEN:
        logger.warning('[discord] DISCORD_BOT_TOKEN not set — skipping DM')
        return False

    channel_id = open_dm(discord_id)
    if not channel_id:
        return False

    try:
        res = requests.post(
            f'{DISCORD_API}/channels/{channel_id}/messages',
            headers={**_bot_headers(), 'Content-Type': 'application/json'},
            json={'embeds': [embed]},
            timeout=10,
        )
        if res.ok:
            return True
        logger.warning(f'[discord] DM send failed for {discord_id}: {res.status_code} {res.text}')
    except Exception as e:
        logger.error(f'[discord] send_dm error: {e}')
    return False


def send_dm_with_image(discord_id: str, embed: dict, image_bytes: bytes, filename: str = 'trade.png') -> bool:
    """
    Send an embed with an attached PNG image.
    The embed's image field should reference 'attachment://<filename>'.
    Returns True on success.

    Discord multipart rules:
    - 'payload_json' must be a plain string field (no content-type tuple).
    - The file field key must be 'files[0]' and include (filename, bytes, mimetype).
    """
    if not DISCORD_BOT_TOKEN:
        logger.warning('[discord] DISCORD_BOT_TOKEN not set — skipping DM')
        return False

    channel_id = open_dm(discord_id)
    if not channel_id:
        return False

    try:
        import json as _json
        payload = _json.dumps({'embeds': [embed]})

        res = requests.post(
            f'{DISCORD_API}/channels/{channel_id}/messages',
            headers=_bot_headers(),
            files={
                # payload_json must be a plain string field — no (name, data, content_type) tuple
                'payload_json': (None, payload),
                # file must include filename and mimetype so Discord recognises it as an image
                'files[0]':     (filename, image_bytes, 'image/png'),
            },
            timeout=20,
        )
        if res.ok:
            return True
        logger.warning(f'[discord] DM+image send failed for {discord_id}: {res.status_code} {res.text}')
    except Exception as e:
        logger.error(f'[discord] send_dm_with_image error: {e}')
    return False