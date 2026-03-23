# worker/discord/embeds.py
"""
Embed builders for Discord DMs.
Each function takes raw data and returns a Discord embed dict.
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
        fields.append({'name': 'Old RAP',   'value': f'{int(old_rap):,}',  'inline': True})
    if new_rap is not None:
        fields.append({'name': 'New RAP',   'value': f'{int(new_rap):,}',  'inline': True})
    if estimated_sale is not None:
        fields.append({'name': 'Sale Price','value': f'{estimated_sale:,}','inline': True})

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
) -> dict:
    """Embed for a new trade ad that matches a watchlist entry."""
    side_label = 'requesting' if side == 'request' else 'offering'
    colour     = 0xED4245 if side == 'request' else 0x57F287
 
    offer_items   = offer_items   or []
    request_items = request_items or []
 
    def fmt_items(items: list, robux: int) -> str:
        lines = [f'• {i["name"]} — {int(i["rap"]):,} R$' for i in items if i.get('name')]
        if robux > 0:
            lines.append(f'• {robux:,} Robux')
        return '\n'.join(lines) if lines else '—'
 
    def total_val(items: list, robux: int) -> int:
        rap_sum = sum(int(i.get('rap') or 0) for i in items)
        return rap_sum + round(robux * 0.7)
 
    offer_total   = total_val(offer_items,   offer_robux)
    request_total = total_val(request_items, request_robux)
    diff          = offer_total - request_total
 
    fields = []
 
    if offer_items or offer_robux:
        fields.append({
            'name':   '📦 Offering',
            'value':  fmt_items(offer_items, offer_robux),
            'inline': True,
        })
 
    if request_items or request_robux:
        fields.append({
            'name':   '🔍 Requesting',
            'value':  fmt_items(request_items, request_robux),
            'inline': True,
        })
 
    if offer_total and request_total:
        arrow  = '▲' if diff >= 0 else '▼'
        sign   = '+' if diff >= 0 else ''
        pct    = round((diff / request_total) * 100) if request_total else 0
        fields.append({
            'name':   'Value Difference',
            'value':  f'{arrow} {sign}{diff:,} R$ ({sign}{pct}%)',
            'inline': False,
        })
 
    fields.append({
        'name':   'View Ad',
        'value':  f'[Open on Azurewrath]({APP_URL}/trade/{ad_id})',
        'inline': False,
    })
 
    embed = {
        'author': {
            'name':     f'{poster_username}',
            'icon_url': poster_avatar or f'{APP_URL}/Images/icon.webp',
            'url':      f'{APP_URL}/trade/{ad_id}',
        },
        'title':       f'{item_name}',
        'url':         f'{APP_URL}/trade/{ad_id}',
        'description': f'{EMOJI_WATCHLIST} **{poster_username}** posted a trade ad **{side_label}** this item',
        'color':       colour,
        'fields':      fields,
        'footer':      {'text': 'Azurewrath Trade Alerts'},
    }
    if item_image:
        embed['thumbnail'] = {'url': item_image}
    return embed