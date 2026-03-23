# worker/discord/trade_image.py
"""
Generates a trade card image using Pillow.
Returns bytes (PNG) or None on failure.
"""

import io
import logging
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter

logger = logging.getLogger(__name__)

# ── Colours (matching the dark UI) ──────────────────────────────────────────
BG_DARK      = (13,  13,  15)       # #0d0d0f
BG_CARD      = (22,  22,  26)       # cards
BG_SLOT      = (30,  30,  36)       # empty slot
BORDER_DIM   = (60,  60,  70)       # dim border
BORDER_OFFER = (139, 92, 246)       # purple  – offer side
BORDER_REQ   = (139, 92, 246)       # same purple
TEXT_WHITE   = (255, 255, 255)
TEXT_GREY    = (148, 163, 184)      # slate-400
TEXT_GREEN   = (67,  233, 123)      # RAP green
TEXT_PURPLE  = (196, 181, 253)      # purple-300
GREEN_UP     = (74,  222, 128)
RED_DOWN     = (248, 113, 113)

# ── Dimensions ────────────────────────────────────────────────────────────────
W, H         = 860, 320
SLOT_SIZE    = 96
SLOT_GAP     = 10
SIDE_PAD     = 28
TOP_PAD      = 24
ARROW_W      = 60
LABEL_H      = 22
IMG_RADIUS   = 10


def _fetch_image(url: str, size: int) -> Image.Image | None:
    try:
        r = requests.get(url, timeout=6)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGBA")
        img = img.resize((size, size), Image.LANCZOS)
        return img
    except Exception as e:
        logger.warning(f"[trade_image] Failed to fetch {url}: {e}")
        return None


def _rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: int, fill, outline=None, outline_width=1):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill,
                           outline=outline, width=outline_width)


def _paste_rounded(base: Image.Image, overlay: Image.Image, pos, radius: int):
    """Paste overlay onto base with rounded corners mask."""
    mask = Image.new("L", overlay.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, overlay.width, overlay.height], radius=radius, fill=255)
    base.paste(overlay, pos, mask)


def _fmt(n: float | int | None) -> str:
    if n is None:
        return "—"
    return f"{int(n):,}"


def _try_font(size: int, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def generate_trade_image(
    poster_username: str,
    poster_avatar_url: str | None,
    offer_items: list[dict],   # [{name, imageUrl, rap}, ...]
    request_items: list[dict],
    offer_robux: int = 0,
    request_robux: int = 0,
) -> bytes | None:
    try:
        # ── Canvas ────────────────────────────────────────────────────────
        img = Image.new("RGBA", (W, H), BG_DARK)
        draw = ImageDraw.Draw(img)

        # Fonts
        f_label  = _try_font(11, bold=True)
        f_name   = _try_font(11)
        f_rap    = _try_font(11, bold=True)
        f_total  = _try_font(12, bold=True)
        f_diff   = _try_font(14, bold=True)
        f_header = _try_font(13, bold=True)

        # ── Header bar ────────────────────────────────────────────────────
        header_h = 44
        _rounded_rect(draw, [0, 0, W, header_h], radius=0,
                      fill=(18, 18, 22))

        # Avatar
        avatar_size = 30
        if poster_avatar_url:
            av = _fetch_image(poster_avatar_url, avatar_size)
            if av:
                _paste_rounded(img, av, (SIDE_PAD, 7), radius=15)

        ax = SIDE_PAD + avatar_size + 10
        draw.text((ax, 8),  poster_username, font=f_header, fill=TEXT_WHITE)
        draw.text((ax, 26), f"@{poster_username}", font=f_name, fill=TEXT_GREY)

        # ── Section layout ────────────────────────────────────────────────
        # Offer section: left
        # Arrow:         center
        # Request:       right

        section_y    = header_h + 14
        label_y      = section_y
        slot_y       = label_y + LABEL_H + 6
        total_y      = slot_y + SLOT_SIZE + 8

        # Center arrow x
        arrow_x      = W // 2 - ARROW_W // 2

        # Offer section spans from SIDE_PAD to arrow_x - gap
        offer_right  = arrow_x - 12
        offer_left   = SIDE_PAD
        offer_width  = offer_right - offer_left

        # Request section spans from arrow_x + ARROW_W + gap to W - SIDE_PAD
        req_left     = arrow_x + ARROW_W + 12
        req_right    = W - SIDE_PAD
        req_width    = req_right - req_left

        # ── Draw label ────────────────────────────────────────────────────
        draw.text((offer_left, label_y), "OFFERING", font=f_label, fill=TEXT_GREY)
        draw.text((req_left,   label_y), "REQUESTING", font=f_label, fill=TEXT_GREY)

        # ── Draw 4 slots ─────────────────────────────────────────────────
        def draw_slots(items, x_start, section_width):
            slot_total = SLOT_SIZE * 4 + SLOT_GAP * 3
            # Clamp to section width
            actual_size = min(SLOT_SIZE, (section_width - SLOT_GAP * 3) // 4)
            slot_total  = actual_size * 4 + SLOT_GAP * 3
            x_off = x_start + max(0, (section_width - slot_total) // 2)

            total_rap = 0
            for i in range(4):
                sx = x_off + i * (actual_size + SLOT_GAP)
                sy = slot_y
                item = items[i] if i < len(items) else None

                # Slot bg
                _rounded_rect(draw,
                               [sx, sy, sx + actual_size, sy + actual_size],
                               radius=IMG_RADIUS,
                               fill=BG_SLOT,
                               outline=BORDER_DIM if not item else (80, 60, 120),
                               outline_width=1)

                if item:
                    # Item thumbnail
                    thumb_url = item.get("imageUrl") or item.get("image_url")
                    if thumb_url:
                        thumb = _fetch_image(thumb_url, actual_size - 4)
                        if thumb:
                            _paste_rounded(img, thumb,
                                          (sx + 2, sy + 2),
                                          radius=IMG_RADIUS - 2)

                    # RAP label under slot
                    rap = item.get("rap", 0) or 0
                    total_rap += rap
                    rap_str = f"{_fmt(rap)} R$" if rap else ""
                    if rap_str:
                        tw = draw.textlength(rap_str, font=f_rap)
                        draw.text((sx + (actual_size - tw) / 2,
                                   sy + actual_size + 3),
                                  rap_str, font=f_rap, fill=TEXT_GREEN)

            return total_rap, x_off, actual_size

        offer_rap,  offer_x0, offer_slot = draw_slots(offer_items,   offer_left, offer_width)
        req_rap,    req_x0,   req_slot   = draw_slots(request_items, req_left,   req_width)

        # ── Robux pills ───────────────────────────────────────────────────
        rob_y = total_y + 2
        def draw_robux(robux, x_start, slot_size):
            if robux <= 0:
                return
            pill_txt = f"R$ {robux:,} Robux"
            tw = draw.textlength(pill_txt, font=f_name)
            px = x_start
            py = rob_y
            pw = tw + 16
            ph = 18
            _rounded_rect(draw, [px, py, px + pw, py + ph],
                          radius=9, fill=(40, 20, 80),
                          outline=(100, 60, 180), outline_width=1)
            draw.text((px + 8, py + 3), pill_txt, font=f_name, fill=TEXT_PURPLE)

        draw_robux(offer_robux,   offer_x0, offer_slot)
        draw_robux(request_robux, req_x0,   req_slot)

        # ── Totals ────────────────────────────────────────────────────────
        rob_70_offer = round(offer_robux   * 0.7)
        rob_70_req   = round(request_robux * 0.7)
        offer_total  = offer_rap  + rob_70_offer
        req_total    = req_rap    + rob_70_req

        tot_y = rob_y + (22 if (offer_robux or request_robux) else 0)

        if offer_total:
            t = f"Total: {_fmt(offer_total)} R$"
            draw.text((offer_x0, tot_y), t, font=f_total, fill=TEXT_GREEN)
        if req_total:
            t = f"Total: {_fmt(req_total)} R$"
            draw.text((req_x0, tot_y), t, font=f_total, fill=TEXT_GREEN)

        # ── Centre arrow + diff badge ──────────────────────────────────────
        ax_cx = W // 2
        ay_cy = slot_y + SLOT_SIZE // 2

        # Circle
        r = 18
        draw.ellipse([ax_cx - r, ay_cy - r, ax_cx + r, ay_cy + r],
                     fill=(30, 30, 40), outline=(80, 80, 100), width=1)
        sym = "⇄"
        sw = draw.textlength(sym, font=f_label)
        draw.text((ax_cx - sw // 2, ay_cy - 7), sym, font=f_label, fill=TEXT_GREY)

        # Diff badge
        if offer_total and req_total:
            diff = offer_total - req_total
            pct  = round((diff / req_total) * 100) if req_total else 0
            sign = "+" if diff >= 0 else ""
            arrow = "▲" if diff >= 0 else "▼"
            diff_txt = f"{arrow} {sign}{_fmt(diff)} ({sign}{pct}%)"
            diff_col = GREEN_UP if diff >= 0 else RED_DOWN
            diff_bg  = (20, 50, 30) if diff >= 0 else (50, 20, 20)
            diff_brd = (34, 120, 60) if diff >= 0 else (120, 40, 40)

            tw = draw.textlength(diff_txt, font=f_diff)
            bw, bh = tw + 20, 24
            bx = ax_cx - bw // 2
            by = ay_cy + r + 6
            _rounded_rect(draw, [bx, by, bx + bw, by + bh],
                          radius=8, fill=diff_bg, outline=diff_brd, outline_width=1)
            draw.text((bx + 10, by + 4), diff_txt, font=f_diff, fill=diff_col)

        # ── Crop to content height ─────────────────────────────────────────
        final_h = max(tot_y + 28, 260)
        img = img.crop((0, 0, W, min(final_h, H)))

        # ── Output ────────────────────────────────────────────────────────
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    except Exception as e:
        logger.error(f"[trade_image] Generation failed: {e}", exc_info=True)
        return None