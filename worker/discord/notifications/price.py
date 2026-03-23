# worker/discord/notifications/price.py
"""
Sends Discord DMs for price changes and sales (RAP changes).

Respects the per-user watchlist toggles:
  - salesAlerts  → RAP-change notifications  (type == 'price_and_rap_change')
  - priceAlerts  → price-only notifications  (type == 'price_change')
"""

import logging
from ..client import send_dm
from ..embeds  import build_sale_embed, build_price_embed

logger = logging.getLogger(__name__)


def send_price_notifications(cursor, notification_rows: list[tuple]) -> None:
    """
    notification_rows columns (positional):
      0  id
      1  userId
      2  itemId
      3  type          ('price_and_rap_change' | 'price_change')
      4  message
      5  oldValue
      6  newValue
      7  read
      8  createdAt
      9  image_url
      10 item_name
      11 manipulated
    """
    if not notification_rows:
        return

    user_ids = list({int(row[1]) for row in notification_rows})

    cursor.execute(
        '''
        SELECT
            u."robloxUserId",
            u."discordId",
            w."itemId",
            w."priceAlerts",
            w."salesAlerts"
        FROM "User" u
        JOIN "Watchlist" w ON w."userId" = u."robloxUserId"
        WHERE u."robloxUserId" = ANY(%s)
          AND u."discordNotifications" = TRUE
          AND u."discordId" IS NOT NULL
        ''',
        (user_ids,),
    )

    prefs: dict[tuple, dict] = {}
    for row in cursor.fetchall():
        roblox_id, discord_id, item_id, price_alerts, sales_alerts = row
        prefs[(int(roblox_id), int(item_id))] = {
            'discord_id':   discord_id,
            'price_alerts': price_alerts,
            'sales_alerts': sales_alerts,
        }

    if not prefs:
        logger.info('[discord/price] No opted-in users — skipping DMs')
        return

    sent = skipped = failed = 0

    for row in notification_rows:
        user_id     = int(row[1])
        item_id     = int(row[2])
        notif_type  = row[3]
        old_value   = row[5]
        new_value   = row[6]
        created_at  = row[8]
        image_url   = row[9]
        item_name   = row[10]
        manipulated = row[11]

        pref = prefs.get((user_id, item_id))
        if not pref:
            skipped += 1
            continue

        is_sale = notif_type == 'price_and_rap_change'
        if is_sale and not pref['sales_alerts']:
            skipped += 1
            continue
        if not is_sale and not pref['price_alerts']:
            skipped += 1
            continue

        embed = (
            build_sale_embed(item_id, item_name, image_url, manipulated, old_value, new_value, created_at)
            if is_sale else
            build_price_embed(item_id, item_name, image_url, manipulated, old_value, new_value, created_at)
        )

        if send_dm(pref['discord_id'], embed):
            sent += 1
        else:
            failed += 1

    logger.info(f'[discord/price] sent={sent} skipped={skipped} failed={failed}')