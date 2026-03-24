# worker/discord/embeds.py
"""
Embed builders for Discord DMs.
Each function takes raw data and returns a Discord embed dict.

Roblox CDN URLs (thumbnails.roblox.com) are blocked by Discord's embed
image fetcher. To show item thumbnails you must either:
  a) Pass the image as a file attachment and use attachment://filename.png
  b) Use a publicly accessible proxy URL

For price/sale embeds we receive the raw Roblox URL — we pass it through
as a thumbnail and also expose it so the caller can optionally attach it.
The embed builder sets thumbnail to the raw URL; if the caller wants to
force an attachment instead, they can overwrite embed['thumbnail'] after.

For trade embeds the full trade card is already a generated PNG attachment,
so has_image=True always takes priority.
"""

from datetime import datetime, timezone

APP_URL = __import__('os').getenv('NEXT_PUBLIC_APP_URL', 'https://azurewrath.lol')

EMOJI_GAIN        = '<:gain:1484974786751762483>'
EMOJI_LOSS        = '<:loss:1484974812701917344>'
EMOJI_MANIPULATED = '<:manipulated:1484974931526680710>'
EMOJI_WATCHLIST   = '<:watchlist:1484974826719281254>'


def _format_ts(created_at) -> str:
    if not created_at:
        return datetime.now(timezone.utc).strftime('%Y-%m-%d at %H:%M:%S UTC')
    if isinstance(created_at, str):
        return created_at
    return created_at.strftime('%Y-%m-%d at %H:%M:%S UTC')


def _author_block() -> dict:
    return {
        'name': 'Azurewrath',
        'icon_url': f'{APP_URL}/Images/icon.webp',
        'url': APP_URL,
    }


def build_sale_embed(
    item_id: int,
    item_name: str,
    image_url: str | None,
    manipulated: bool,
    old_rap: float | None,
    new_rap: float | None,
    created_at=None,
) -> dict:
    """Embed for a sale (RAP change)."""
    went_up = new_rap is not None and old_rap is not None and new_rap > old_rap
    colour  = 0x57F287 if went_up else 0xED4245
    emoji   = EMOJI_GAIN if went_up else EMOJI_LOSS

    display_name = item_name or f'Item {item_id}'
    if manipulated:
        display_name = f'{display_name} {EMOJI_MANIPULATED}'

    rap_diff       = int(new_rap - old_rap) if (old_rap is not None and new_rap is not None) else 0
    estimated_sale = int(old_rap + ((new_rap - old_rap) * 10)) if (old_rap and new_rap) else None

    fields = []
    if old_rap is not None:
        fields.append({'name': 'Old RAP',    'value': f'{int(old_rap):,}',  'inline': True})
    if new_rap is not None:
        fields.append({'name': 'New RAP',    'value': f'{int(new_rap):,}',  'inline': True})
    if estimated_sale is not None:
        fields.append({'name': 'Sale Price', 'value': f'{estimated_sale:,}', 'inline': True})

    embed = {
        'author':      _author_block(),
        'title':       display_name,
        'url':         f'{APP_URL}/item/{item_id}',
        'description': f'RAP change **{("+" if rap_diff >= 0 else "")}{rap_diff:,}** {emoji}',
        'color':       colour,
        'fields':      fields,
        'footer':      {'text': _format_ts(created_at)},
    }

    if image_url:
        embed['thumbnail'] = {'url': image_url}
    return embed


def build_price_embed(
    item_id: int,
    item_name: str,
    image_url: str | None,
    manipulated: bool,
    old_price: float | None,
    new_price: float | None,
    created_at=None,
) -> dict:
    """Embed for a best-price change."""
    went_up = new_price is not None and old_price is not None and new_price > old_price
    colour  = 0x57F287 if went_up else 0xED4245
    emoji   = EMOJI_GAIN if went_up else EMOJI_LOSS

    display_name = item_name or f'Item {item_id}'
    if manipulated:
        display_name = f'{display_name} {EMOJI_MANIPULATED}'

    fields = []
    if old_price is not None:
        fields.append({'name': 'Old Price', 'value': f'{int(old_price):,}', 'inline': True})
    if new_price is not None:
        fields.append({'name': 'New Price', 'value': f'{int(new_price):,}', 'inline': True})

    embed = {
        'author':      _author_block(),
        'title':       display_name,
        'url':         f'{APP_URL}/item/{item_id}',
        'description': f'{emoji} Price Change',
        'color':       colour,
        'fields':      fields,
        'footer':      {'text': _format_ts(created_at)},
    }

    if image_url:
        embed['thumbnail'] = {'url': image_url}

    return embed


# REPLACE the entire build_trade_ad_embed function:
def build_trade_ad_embed(
    ad_id: int,
    poster_username: str,
    item_name: str,
    item_image: str | None,
    side: str,
    alert_type: str,
    offer_items: list | None = None,
    request_items: list | None = None,
    offer_robux: int = 0,
    request_robux: int = 0,
    poster_avatar: str | None = None,
    has_image: bool = False,
    note: str | None = None,
) -> dict:
    side_label = 'requesting' if side == 'request' else 'offering'
    colour     = 0xED4245 if side == 'request' else 0x57F287

    description = (
        f'{EMOJI_WATCHLIST} **{poster_username}** posted a trade ad '
        f'**{side_label}** **{item_name}**'
    )
    if note and note.strip():
        description += f'\n\n> {note.strip()}'

    description += f'\n\n[**View Trade Ad →**]({APP_URL}/trade/{ad_id})'

    embed = {
        'author': {
            'name':     'Azurewrath',
            'icon_url': f'{APP_URL}/Images/icon.webp',
            'url':      APP_URL,
        },
        'description': description,
        'color':  colour,
        'footer': {'text': 'Azurewrath Trade Alerts'},
    }

    if has_image:
        embed['image'] = {'url': 'attachment://trade.png'}
    elif item_image:
        embed['thumbnail'] = {'url': item_image}

    return embed