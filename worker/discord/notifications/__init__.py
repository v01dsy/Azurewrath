# worker/discord/notifications/__init__.py
from .price import send_price_notifications
from .trade import send_trade_notifications


def send_notifications(cursor, discord_rows: list) -> None:
    """
    Single entry point called once per worker cycle.
    Handles both price/sale Discord DMs and trade ad Discord DMs.
    """
    send_price_notifications(cursor, discord_rows)
    send_trade_notifications(cursor)