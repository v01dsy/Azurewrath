import requests
import json
import hashlib
import hmac
import time
import os
from dotenv import load_dotenv
from typing import Dict, List, Any
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BASE_URL = os.getenv('WORKER_BASE_URL', 'http://localhost:3000')
AZURE_SECRET_KEY = os.getenv('AZURE_SECRET_KEY', 'dev-secret')
WORKER_INTERVAL = int(os.getenv('WORKER_INTERVAL_SECONDS', 120))

ROBLOX_CATALOG = os.getenv('ROBLOX_CATALOG_URL', 'https://catalog.roblox.com')
ROBLOX_API = os.getenv('ROBLOX_API_URL', 'https://apis.roblox.com')

# Local cache for price comparisons
price_cache: Dict[str, float] = {}


def sign_request(payload: str) -> str:
    """Sign request with HMAC-SHA256"""
    signature = hmac.new(
        AZURE_SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature


def fetch_catalog_items() -> List[Dict[str, Any]]:
    """
    Scrape Roblox catalog for Limited items
    Returns list of items with price, rap, etc.
    """
    try:
        logger.info("📡 Fetching Roblox catalog...")
        # Placeholder: In production, this would hit catalog.roblox.com
        # with proper parsing of RAP, Lowest Resale, Sales Volume
        
        # Mock data for demonstration
        mock_items = [
            {
                'assetId': '1365767',
                'name': 'Dominus Empyreus',
                'imageUrl': 'https://t0.rbxcdn.com/1365767-png',
                'price': 2_500_000,
                'rap': 2_480_000,
                'lowestResale': 2_490_000,
                'salesVolume': 8,
            },
            {
                'assetId': '1031341',
                'name': 'Dominus Infernus',
                'imageUrl': 'https://t0.rbxcdn.com/1031341-png',
                'price': 1_850_000,
                'rap': 1_820_000,
                'lowestResale': 1_840_000,
                'salesVolume': 5,
            },
        ]
        
        logger.info(f"✅ Fetched {len(mock_items)} items")
        return mock_items
    except Exception as e:
        logger.error(f"❌ Catalog fetch failed: {e}")
        return []


def compare_and_filter(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Compare new data against cache, return only changed items
    """
    global price_cache
    changed_items = []
    
    for item in items:
        asset_id = item['assetId']
        current_price = item['price']
        
        if asset_id not in price_cache or price_cache[asset_id] != current_price:
            changed_items.append(item)
            price_cache[asset_id] = current_price
            logger.info(f"📊 Price change detected: {item['name']} → ᴿ{current_price:,}")
    
    return changed_items


def dispatch_webhook(items: List[Dict[str, Any]]) -> bool:
    """
    Send signed POST request to /api/ingest with price updates
    """
    if not items:
        logger.info("No price changes to report")
        return True
    
    try:
        ingest_url = f"{BASE_URL}/api/ingest"
        payload = json.dumps({'items': items})
        signature = sign_request(payload)
        
        headers = {
            'Content-Type': 'application/json',
            'X-Signature': signature,
        }
        
        logger.info(f"📤 Dispatching {len(items)} items to {ingest_url}")
        response = requests.post(
            ingest_url,
            data=payload,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info(f"✅ Ingest successful: {result['updated']} items updated")
            return True
        else:
            logger.error(f"❌ Ingest failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Webhook dispatch failed: {e}")
        return False


def worker_loop():
    """
    Main worker loop: fetch → compare → dispatch
    Runs every WORKER_INTERVAL seconds
    """
    logger.info(f"🚀 Starting Azurewrath data worker (interval: {WORKER_INTERVAL}s)")
    
    iteration = 0
    while True:
        try:
            iteration += 1
            logger.info(f"\n[Iteration {iteration}] Starting data sync...")
            
            # Fetch latest data
            items = fetch_catalog_items()
            if not items:
                logger.warning("No items fetched, retrying next cycle...")
                time.sleep(WORKER_INTERVAL)
                continue
            
            # Compare against cache
            changed = compare_and_filter(items)
            logger.info(f"📈 {len(changed)} items changed out of {len(items)} total")
            
            # Dispatch webhook
            if changed:
                success = dispatch_webhook(changed)
                if not success:
                    logger.warning("Webhook failed, will retry next cycle")
            
            logger.info(f"⏱️  Next sync in {WORKER_INTERVAL} seconds...")
            time.sleep(WORKER_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("\n🛑 Worker stopped by user")
            break
        except Exception as e:
            logger.error(f"❌ Critical error in worker loop: {e}")
            time.sleep(WORKER_INTERVAL)


if __name__ == '__main__':
    worker_loop()
