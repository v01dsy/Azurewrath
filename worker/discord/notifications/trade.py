# worker/discord/notifications/trade.py
import logging
from datetime import datetime, timezone
from ..client import send_dm
from ..embeds  import build_trade_ad_embed
 
logger = logging.getLogger(__name__)
 
_last_run: datetime = datetime.now(timezone.utc)
 
 
def send_trade_notifications(cursor) -> None:
    global _last_run
    since     = _last_run
    _last_run = datetime.now(timezone.utc)
 
    # 1. Fetch new trade ads + all their items since last cycle
    cursor.execute(
        """
        SELECT
            ta.id,
            ta."userId",
            ta."offerRobux",
            ta."requestRobux",
            u.username,
            u."avatarUrl",
            tai."assetId",
            tai.side,
            i.name       AS item_name,
            i."imageUrl" AS item_image,
            COALESCE(ph.rap, 0) AS rap
        FROM "TradeAd"     ta
        JOIN "User"         u   ON u."robloxUserId" = ta."userId"
        JOIN "TradeAdItem"  tai ON tai."tradeAdId"  = ta.id
        JOIN "Item"         i   ON i."assetId"      = tai."assetId"
        LEFT JOIN LATERAL (
            SELECT rap FROM "PriceHistory"
            WHERE "itemId" = tai."assetId"
            ORDER BY timestamp DESC LIMIT 1
        ) ph ON true
        WHERE ta."createdAt" > %s
          AND ta.active       = true
          AND ta."deletedAt" IS NULL
        ORDER BY ta.id ASC
        """,
        (since,),
    )
    rows = cursor.fetchall()
    if not rows:
        return
 
    # 2. Group by trade ad
    ads: dict[int, dict] = {}
    for (ad_id, poster_id, offer_robux, request_robux,
         username, avatar_url, asset_id, side,
         item_name, item_image, rap) in rows:
        if ad_id not in ads:
            ads[ad_id] = {
                'poster_id':     poster_id,
                'username':      username,
                'avatar_url':    avatar_url,
                'offer_robux':   offer_robux,
                'request_robux': request_robux,
                'offer_items':   [],
                'request_items': [],
                'items':         [],
            }
        item_entry = {
            'asset_id':   asset_id,
            'side':       side,
            'item_name':  item_name,
            'item_image': item_image,
            'rap':        float(rap),
            'name':       item_name,
        }
        ads[ad_id]['items'].append(item_entry)
        if side == 'offer':
            ads[ad_id]['offer_items'].append({'name': item_name, 'rap': float(rap)})
        else:
            ads[ad_id]['request_items'].append({'name': item_name, 'rap': float(rap)})
 
    logger.info(f'[discord/trade] {len(ads)} new trade ad(s) since last cycle')
 
    # 3. For each ad, find watchlist users and send DMs
    for ad_id, ad in ads.items():
        asset_ids = [item['asset_id'] for item in ad['items']]
 
        cursor.execute(
            """
            SELECT w."userId", w."itemId", w."tradeAlertType", u."discordId"
            FROM "Watchlist" w
            JOIN "User" u ON u."robloxUserId" = w."userId"
            WHERE w."itemId"               = ANY(%s)
              AND w."tradeAlerts"          = true
              AND u."discordNotifications" = true
              AND u."discordId"           IS NOT NULL
              AND w."userId"              != %s
            """,
            (asset_ids, ad['poster_id']),
        )
        watchers = cursor.fetchall()
        if not watchers:
            continue
 
        notified: set = set()
 
        for watcher_user_id, item_id, alert_type, discord_id in watchers:
            if watcher_user_id in notified:
                continue
 
            matching = next((i for i in ad['items'] if i['asset_id'] == item_id), None)
            if not matching:
                continue
 
            side = matching['side']
 
            if alert_type == 'requesting' and side != 'request':
                continue
            if alert_type == 'offering' and side != 'offer':
                continue
 
            embed = build_trade_ad_embed(
                ad_id,
                ad['username'],
                matching['item_name'],
                matching['item_image'],
                side,
                alert_type,
                offer_items=ad['offer_items'],
                request_items=ad['request_items'],
                offer_robux=ad['offer_robux'],
                request_robux=ad['request_robux'],
                poster_avatar=ad['avatar_url'],
            )
 
            if send_dm(discord_id, embed):
                notified.add(watcher_user_id)
                logger.info(f'[discord/trade] ✅ notified userId={watcher_user_id} for ad={ad_id} item={item_id}')
            else:
                logger.warning(f'[discord/trade] ❌ DM failed userId={watcher_user_id} ad={ad_id} item={item_id}')
