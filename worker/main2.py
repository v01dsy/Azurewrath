import requests
import json
import time
import os
from dotenv import load_dotenv
import logging
import psycopg2
from psycopg2 import pool
from datetime import datetime
import traceback

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DATABASE_URL = os.getenv('DATABASE_URL')
WORKER_INTERVAL = int(os.getenv('WORKER_INTERVAL_SECONDS', 300))  # 5 minutes between full cycles
REQUEST_DELAY = 2  # 2 seconds between each Roblox API call (conservative rate limiting)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
}

# Connection pool
connection_pool = None

def init_connection_pool():
    """Initialize the connection pool"""
    global connection_pool
    try:
        connection_pool = psycopg2.pool.SimpleConnectionPool(
            1, 
            10,
            DATABASE_URL
        )
        logger.info("✅ Database connection pool initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize connection pool: {e}")
        raise

def get_db_connection():
    """Get PostgreSQL connection from pool"""
    try:
        conn = connection_pool.getconn()
        logger.debug("Got connection from pool")
        return conn
    except Exception as e:
        logger.error(f"❌ Failed to get connection from pool: {e}")
        raise

def return_db_connection(conn):
    """Return connection to pool"""
    try:
        connection_pool.putconn(conn)
        logger.debug("Returned connection to pool")
    except Exception as e:
        logger.error(f"❌ Failed to return connection to pool: {e}")

def fetch_roblox_resale_data(asset_id):
    """
    Fetch resale data from Roblox API for a single asset
    Returns: {rap: int, price: int, sales: int} or None if failed
    """
    try:
        url = f"https://economy.roblox.com/v1/assets/{asset_id}/resale-data"
        response = requests.get(url, headers=HEADERS, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            # Example response: {"assetStock": 0, "sales": 123, "numberRemaining": 0, 
            #                    "recentAveragePrice": 5000, "originalPrice": null, "priceDataPoints": [...]}
            return {
                'rap': data.get('recentAveragePrice'),
                'sales': data.get('sales'),
                'original_price': data.get('originalPrice')
            }
        elif response.status_code == 429:
            logger.warning(f"⚠️ Rate limited on asset {asset_id} - waiting 10 seconds...")
            time.sleep(10)
            return None
        else:
            logger.debug(f"Asset {asset_id} returned status {response.status_code}")
            return None
            
    except requests.exceptions.Timeout:
        logger.warning(f"⚠️ Timeout fetching asset {asset_id}")
        return None
    except Exception as e:
        logger.error(f"❌ Error fetching asset {asset_id}: {e}")
        return None

def fetch_roblox_resellers(asset_id, limit=10):
    """
    Fetch current resellers (listings) for an asset
    Returns: list of {price: int, seller: dict} or None
    """
    try:
        url = f"https://economy.roblox.com/v1/assets/{asset_id}/resellers"
        params = {'limit': limit}
        response = requests.get(url, headers=HEADERS, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            # Example: {"data": [{"userAssetId": 123, "seller": {...}, "price": 1000, "serialNumber": 1}, ...]}
            listings = data.get('data', [])
            if listings:
                # Get the lowest price from current listings
                lowest = min(listings, key=lambda x: x.get('price', float('inf')))
                return {
                    'lowest_price': lowest.get('price'),
                    'total_listings': len(listings)
                }
            return None
        elif response.status_code == 429:
            logger.warning(f"⚠️ Rate limited on resellers for {asset_id}")
            time.sleep(10)
            return None
        else:
            return None
            
    except Exception as e:
        logger.debug(f"Error fetching resellers for {asset_id}: {e}")
        return None

def process_single_item(item_id, asset_id, name, previous_rap):
    """
    Fetch and process data for a single item from Roblox
    Returns: dict with item data or None
    """
    logger.debug(f"Processing {name} (asset_id: {asset_id})")
    
    # Fetch resale data (RAP, sales volume)
    resale_data = fetch_roblox_resale_data(asset_id)
    
    if not resale_data or resale_data['rap'] is None:
        logger.debug(f"No RAP data for {name}")
        return None
    
    # Small delay to avoid rate limits
    time.sleep(REQUEST_DELAY)
    
    # Fetch current resellers (lowest price)
    reseller_data = fetch_roblox_resellers(asset_id)
    
    rap = resale_data['rap']
    lowest_resale = reseller_data['lowest_price'] if reseller_data else None
    
    # Use lowest resale as price if available, otherwise use RAP
    price = lowest_resale if lowest_resale else rap
    
    # Check if RAP changed
    rap_changed = False
    if previous_rap is not None and rap != previous_rap:
        rap_changed = True
        logger.info(f"📈 RAP Change: {name} - {previous_rap} → {rap}")
    
    # Log good deals
    if lowest_resale and rap and lowest_resale < rap:
        discount = ((rap - lowest_resale) / rap) * 100
        if discount > 5:
            logger.info(f"💰 Deal Found: {name} - {lowest_resale} Robux (RAP: {rap}) - {discount:.1f}% off")
    
    return {
        'item_id': item_id,
        'name': name,
        'price': price,
        'rap': rap,
        'lowest_resale': lowest_resale,
        'sales_volume': resale_data.get('sales'),
        'rap_changed': rap_changed
    }

def save_results_to_db(results):
    """Batch save all results to database"""
    if not results:
        logger.warning("⚠️ No results to save")
        return
    
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        price_history_data = []
        sale_data = []
        
        logger.info(f"Preparing database updates for {len(results)} items...")
        
        for result in results:
            # PriceHistory insert
            price_history_data.append((
                result['item_id'],
                result['price'],
                result['rap'],
                result['lowest_resale'],
                result['sales_volume'],
                datetime.now()
            ))
            
            # Sale insert only if RAP changed
            if result['rap_changed']:
                sale_data.append((
                    result['item_id'],
                    result['rap'],
                    None,  # sellerUsername
                    None,  # buyerUsername
                    None,  # serialNumber
                    datetime.now()
                ))
        
        logger.info(f"Database operations planned:")
        logger.info(f"   - PriceHistory inserts: {len(price_history_data)}")
        logger.info(f"   - Sale inserts: {len(sale_data)}")
        
        # Batch insert PriceHistory
        if price_history_data:
            logger.info("Inserting into PriceHistory...")
            cursor.executemany('''
                INSERT INTO "PriceHistory" 
                (id, "itemId", price, rap, "lowestResale", "salesVolume", timestamp)
                VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s)
            ''', price_history_data)
            logger.info(f"✅ Inserted {len(price_history_data)} PriceHistory records")
        
        # Batch insert Sales
        if sale_data:
            logger.info("Inserting into Sale...")
            cursor.executemany('''
                INSERT INTO "Sale" 
                (id, "itemId", "salePrice", "sellerUsername", "buyerUsername", "serialNumber", "saleDate")
                VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s)
            ''', sale_data)
            logger.info(f"✅ Inserted {len(sale_data)} Sale records")
        
        conn.commit()
        logger.info(f"💾 Database commit successful!")
        
    except psycopg2.Error as e:
        logger.error(f"❌ PostgreSQL error: {e}")
        if conn:
            conn.rollback()
    except Exception as e:
        logger.error(f"❌ Unexpected database error: {e}")
        logger.error(traceback.format_exc())
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            return_db_connection(conn)

def update_item_prices():
    """Main update logic using Roblox APIs directly"""
    conn = None
    cursor = None
    
    try:
        logger.info("=" * 80)
        logger.info("Starting price update cycle (Roblox API)")
        logger.info("=" * 80)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get all items from database
        logger.info("Fetching items from database...")
        cursor.execute('SELECT id, "assetId", name FROM "Item"')
        items = cursor.fetchall()
        
        if not items:
            logger.warning("⚠️ No items found in database!")
            return
        
        logger.info(f"📊 Found {len(items)} items in database")
        
        # Load previous RAPs
        logger.info("Loading previous RAP values...")
        cursor.execute('''
            SELECT DISTINCT ON ("itemId") "itemId", rap
            FROM "PriceHistory"
            ORDER BY "itemId", timestamp DESC
        ''')
        previous_raps = {row[0]: row[1] for row in cursor.fetchall()}
        logger.info(f"Loaded {len(previous_raps)} previous RAP values")
        
        # Close connection before processing
        cursor.close()
        return_db_connection(conn)
        conn = None
        cursor = None
        
        # Process each item one by one
        results = []
        total_items = len(items)
        
        logger.info(f"Processing items with {REQUEST_DELAY}s delay between requests...")
        
        for idx, (item_id, asset_id, name) in enumerate(items, 1):
            logger.info(f"[{idx}/{total_items}] Processing: {name}")
            
            previous_rap = previous_raps.get(item_id)
            result = process_single_item(item_id, asset_id, name, previous_rap)
            
            if result:
                results.append(result)
            
            # Progress update every 10 items
            if idx % 10 == 0:
                logger.info(f"Progress: {idx}/{total_items} items processed ({len(results)} with data)")
        
        logger.info(f"✅ Processing complete: {len(results)} items with valid data")
        
        # Save to database
        save_results_to_db(results)
        
        logger.info("=" * 80)
        logger.info("✅ Price update cycle complete!")
        logger.info("=" * 80)
        
    except Exception as e:
        logger.error(f"❌ Critical error in update_item_prices: {e}")
        logger.error(traceback.format_exc())
    finally:
        if cursor:
            cursor.close()
        if conn:
            return_db_connection(conn)

def main():
    """Main worker loop"""
    logger.info("=" * 80)
    logger.info("🚀 Azurewrath Worker Starting (Roblox API Mode)")
    logger.info("=" * 80)
    logger.info(f"Update interval: {WORKER_INTERVAL} seconds")
    logger.info(f"Request delay: {REQUEST_DELAY} seconds")
    logger.info(f"Database: {DATABASE_URL[:30]}..." if DATABASE_URL else "No database URL!")
    logger.info("=" * 80)
    
    # Initialize connection pool
    try:
        init_connection_pool()
    except Exception as e:
        logger.error(f"❌ Failed to initialize - exiting")
        return
    
    cycle_count = 0
    
    while True:
        try:
            cycle_count += 1
            logger.info(f"\n🔄 Starting cycle #{cycle_count}")
            
            start_time = time.time()
            update_item_prices()
            elapsed = time.time() - start_time
            
            logger.info(f"⏱️  Cycle #{cycle_count} took {elapsed:.2f} seconds ({elapsed/60:.2f} minutes)")
            logger.info(f"😴 Sleeping for {WORKER_INTERVAL} seconds...")
            logger.info("")
            
            time.sleep(WORKER_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("\n" + "=" * 80)
            logger.info("👋 Worker stopped by user (Ctrl+C)")
            logger.info("=" * 80)
            break
        except Exception as e:
            logger.error(f"❌ Unexpected error in main loop: {e}")
            logger.error(traceback.format_exc())
            logger.info("⏳ Waiting 30 seconds before retry...")
            time.sleep(30)

if __name__ == "__main__":
    main()