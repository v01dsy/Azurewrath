"""
worker/snipe_server.py
──────────────────────
A tiny SSE server that runs alongside the worker.
Runs on port 3001 (configurable via SNIPE_SERVER_PORT env var).

Start it in a separate thread from main.py:
    from snipe_server import start_snipe_server
    start_snipe_server()  # call this before your main loop

The Next.js app proxies /api/snipe/stream to this server,
so the browser never talks to it directly.
"""

import json
import logging
import os
import threading
import time
import psycopg2
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv('DATABASE_URL', '')
PORT = int(os.getenv('SNIPE_SERVER_PORT', '3001'))


def get_db_conn():
    return psycopg2.connect(DATABASE_URL)


class SSEHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default access logs — use our logger instead
        logger.debug(f"[snipe_server] {format % args}")

    def do_GET(self):
        parsed = urlparse(self.path)

        # Health check
        if parsed.path == '/health':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
            return

        if parsed.path != '/stream':
            self.send_response(404)
            self.end_headers()
            return

        params = parse_qs(parsed.query)
        user_id_list = params.get('userId', [])
        if not user_id_list:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Missing userId')
            return

        try:
            user_id = int(user_id_list[0])
        except ValueError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Invalid userId')
            return

        # SSE headers
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('X-Accel-Buffering', 'no')
        # CORS — only needed if not proxied
        self.send_header('Access-Control-Allow-Origin', os.getenv('NEXT_PUBLIC_APP_URL', '*'))
        self.end_headers()

        logger.info(f"[snipe_server] User {user_id} connected")

        def send(data: str):
            try:
                self.wfile.write(data.encode('utf-8'))
                self.wfile.flush()
                return True
            except (BrokenPipeError, ConnectionResetError):
                return False

        send(': connected\n\n')

        last_seen_id = None
        conn = None

        try:
            conn = get_db_conn()
            conn.autocommit = True

            while True:
                # Heartbeat
                if not send(': heartbeat\n\n'):
                    break

                try:
                    with conn.cursor() as cur:
                        # Load user's enabled snipe configs
                        cur.execute(
                            '''SELECT "assetId", "minDeal", "minPrice", "maxPrice"
                               FROM "SnipeConfig"
                               WHERE "userId" = %s AND enabled = true''',
                            (user_id,)
                        )
                        configs = cur.fetchall()

                        if configs:
                            # Pull recent deals
                            cutoff = time.time() - 120  # last 2 minutes
                            if last_seen_id:
                                cur.execute(
                                    '''SELECT id, "assetId", name, "imageUrl", price, rap, deal
                                       FROM "SnipeDeal"
                                       WHERE "createdAt" >= to_timestamp(%s)
                                         AND id > %s
                                       ORDER BY "createdAt" ASC
                                       LIMIT 50''',
                                    (cutoff, last_seen_id)
                                )
                            else:
                                cur.execute(
                                    '''SELECT id, "assetId", name, "imageUrl", price, rap, deal
                                       FROM "SnipeDeal"
                                       WHERE "createdAt" >= to_timestamp(%s)
                                       ORDER BY "createdAt" ASC
                                       LIMIT 50''',
                                    (cutoff,)
                                )

                            deals = cur.fetchall()

                            if deals:
                                last_seen_id = deals[-1][0]

                                for deal_row in deals:
                                    _, asset_id, name, image_url, price, rap, deal_pct = deal_row

                                    for cfg in configs:
                                        cfg_asset, cfg_min_deal, cfg_min_price, cfg_max_price = cfg

                                        if cfg_asset is not None and cfg_asset != asset_id:
                                            continue
                                        if deal_pct < cfg_min_deal:
                                            continue
                                        if cfg_min_price is not None and price < cfg_min_price:
                                            continue
                                        if cfg_max_price is not None and price > cfg_max_price:
                                            continue

                                        payload = json.dumps({
                                            'assetId': str(asset_id),
                                            'name': name,
                                            'imageUrl': image_url,
                                            'price': price,
                                            'rap': rap,
                                            'deal': round(deal_pct),
                                        })

                                        if not send(f'data: {payload}\n\n'):
                                            return  # client disconnected

                                        break  # one event per deal

                except psycopg2.OperationalError:
                    # DB hiccup — reconnect and continue
                    try:
                        conn.close()
                    except Exception:
                        pass
                    try:
                        conn = get_db_conn()
                        conn.autocommit = True
                    except Exception:
                        pass

                time.sleep(5)  # poll every 5s — no timeout risk here

        except Exception as e:
            logger.error(f"[snipe_server] Stream error for user {user_id}: {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            logger.info(f"[snipe_server] User {user_id} disconnected")


def start_snipe_server():
    """Start the SSE server in a background daemon thread."""
    server = HTTPServer(('0.0.0.0', PORT), SSEHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info(f"[snipe_server] 🎯 Snipe SSE server running on port {PORT}")
    return server