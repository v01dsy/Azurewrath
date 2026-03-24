import io
import logging
import requests
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# -- Colors -------------------------------------------------
BG_TRANSPARENT = (5, 5, 6, 255)
BG_CARD        = (13, 13, 15, 255)
BG_HEADER      = (18, 18, 22, 255)
BG_SLOT        = (18, 18, 20, 255)
BG_SLOT_FILLED = (18, 18, 20, 255)   # same as empty slot
BORDER_DIM     = (31, 31, 31, 255)

TEXT_WHITE     = (240, 240, 240, 255)
TEXT_GREY      = (200, 200, 200, 255) # much more white
TEXT_GREEN     = (53, 222, 128, 255)
TEXT_RED       = (248, 113, 113, 255)

GREEN_UP       = (53, 222, 128, 255)
GREEN_UP_BG    = (15, 35, 24, 255)
GREEN_UP_OUT   = (21, 84, 45, 255)
RED_DOWN       = (248, 113, 113, 255)
RED_DOWN_BG    = (40, 19, 21, 255)
RED_DOWN_OUT   = (100, 35, 36, 255)

# -- Dimensions ---------------------------------------------
W, H            = 1100, 280
CARD_PAD        = 10
CARD_RADIUS     = 20
HEADER_HEIGHT   = 58

SLOT_SIZE       = 96
SLOT_GAP        = 12
SIDE_PAD        = 40
CENTER_GAP      = 124
TOP_PAD         = 20
IMG_RADIUS      = 12

# ── Helpers ──────────────────────────────────────────
def _fetch_image(url: str, size: int):
    try:
        r = requests.get(url, timeout=6, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGBA")
        return img.resize((size, size), Image.LANCZOS)
    except Exception as e:
        logger.warning(f"[trade_image] Failed to fetch {url}: {e}")
        return None


def _rounded_rect(draw, xy, radius, fill, outline=None, outline_width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=outline_width)


def _paste_rounded(base, overlay, pos, radius):
    mask = Image.new("L", overlay.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, overlay.width, overlay.height],
        radius=radius,
        fill=255
    )
    base.paste(overlay, pos, mask)


def _fmt(n):
    if not n:
        return "0"
    return f"{int(n):,}"


def _font(size, bold=False):
    try:
        path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold \
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()


# ── Main ─────────────────────────────────────────────
def generate_trade_image(
    poster_username,
    poster_avatar_url,
    offer_items,
    request_items,
    offer_robux=0,
    request_robux=0,
):
    try:
        img = Image.new("RGBA", (W, H), BG_TRANSPARENT)
        draw = ImageDraw.Draw(img)

        card_left = CARD_PAD
        card_top = CARD_PAD
        card_right = W - CARD_PAD
        card_bottom = H - CARD_PAD

        # Main card + full-width header strip
        _rounded_rect(draw, [card_left, card_top, card_right, card_bottom], CARD_RADIUS, BG_CARD)
        _rounded_rect(
            draw,
            [card_left, card_top, card_right, card_top + HEADER_HEIGHT],
            CARD_RADIUS,
            BG_HEADER,
        )
        # Square off the lower edge so only the top corners remain rounded
        draw.rectangle([card_left, card_top + CARD_RADIUS, card_right, card_top + HEADER_HEIGHT], fill=BG_HEADER)

        # Fonts
        f_user = _font(16, True)
        f_sub = _font(12)
        f_label = _font(12, True)
        f_rap = _font(12)
        f_total = _font(13, True)
        f_diff = _font(13, True)

        # -- Header ------------------------------------------
        avatar_size = 36
        if poster_avatar_url:
            av = _fetch_image(poster_avatar_url, avatar_size)
            if av:
                _paste_rounded(img, av, (SIDE_PAD, TOP_PAD), 18)

        ax = SIDE_PAD + avatar_size + 10
        draw.text((ax, TOP_PAD + 2), poster_username, font=f_user, fill=TEXT_WHITE)
        draw.text((ax, TOP_PAD + 22), f"@{poster_username}", font=f_sub, fill=TEXT_GREY)

        # -- Body layout -------------------------------------
        section_y = card_top + HEADER_HEIGHT + 12

        offer_left = SIDE_PAD
        offer_right = W//2 - CENTER_GAP//2

        req_left = W//2 + CENTER_GAP//2
        req_right = W - SIDE_PAD

        slot_strip_w = SLOT_SIZE * 4 + SLOT_GAP * 3

        def draw_side(items, x_start, x_end, label):
            width = x_end - x_start
            area_center_x = x_start + width / 2

            # label
            draw.text((x_start, section_y), label, font=f_label, fill=TEXT_GREY)

            slot_y = section_y + 20
            slots_x = int(x_start + max(0, (width - slot_strip_w) / 2))

            total_rap = 0

            for i in range(4):
                sx = slots_x + i * (SLOT_SIZE + SLOT_GAP)
                sy = slot_y

                item = items[i] if i < len(items) else None

                # slot bg
                _rounded_rect(
                    draw,
                    [sx, sy, sx + SLOT_SIZE, sy + SLOT_SIZE],
                    IMG_RADIUS,
                    BG_SLOT,
                    outline=BORDER_DIM
                )

                if item:
                    thumb = _fetch_image(item.get("imageUrl"), SLOT_SIZE - 12)
                    if thumb:
                        # Create a white-backed composite so transparent PNGs
                        # don't bleed through to the card background
                        bg = Image.new("RGBA", thumb.size, (18, 18, 20, 255))
                        bg.paste(thumb, (0, 0), thumb)
                        _paste_rounded(img, bg, (sx+6, sy+6), IMG_RADIUS-4)

                    rap = item.get("rap", 0)
                    total_rap += rap

                    if rap:
                        txt = f"{_fmt(rap)} R$"
                        tw = draw.textlength(txt, font=f_rap)
                        draw.text(
                            (sx + (SLOT_SIZE - tw)/2, sy + SLOT_SIZE + 4),
                            txt,
                            font=f_rap,
                            fill=TEXT_GREY
                        )

            # totals
            robux70 = round((offer_robux if label=="OFFERING" else request_robux) * 0.7)
            total = total_rap + robux70

            base_y = slot_y + SLOT_SIZE + 30

            rap_txt = f"{_fmt(total_rap)} RAP"
            tw = draw.textlength(rap_txt, font=f_rap)
            draw.text(
                (area_center_x - tw / 2, base_y),
                rap_txt,
                font=f_rap,
                fill=TEXT_GREY
            )

            tot_txt = f"Total: {_fmt(total)} R$"
            tw = draw.textlength(tot_txt, font=f_total)
            draw.text(
                (area_center_x - tw / 2, base_y + 16),
                tot_txt,
                font=f_total,
                fill=TEXT_GREEN
            )

            return total

        offer_total = draw_side(offer_items, offer_left, offer_right, "OFFERING")
        req_total   = draw_side(request_items, req_left, req_right, "REQUESTING")

        # -- Center diff -------------------------------------
        cx = W // 2
        cy = section_y + 56

        draw.ellipse([cx-18, cy-18, cx+18, cy+18], fill=(22, 22, 24, 255), outline=(46, 46, 48, 255))
        draw.text((cx-4, cy-8), "⇄", font=f_label, fill=TEXT_GREY)

        if offer_total and req_total:
            diff = offer_total - req_total
            pct  = round((diff / req_total) * 100) if req_total else 0

            up = diff >= 0
            col = GREEN_UP if up else RED_DOWN
            bg  = GREEN_UP_BG if up else RED_DOWN_BG

            txt = f"{'+' if up else ''}{_fmt(diff)} ({'+' if up else ''}{pct}%)"

            tw = draw.textlength(txt, font=f_diff)
            bw = tw + 20

            bx = cx - bw//2
            by = cy + 28

            _rounded_rect(draw, [bx, by, bx+bw, by+24], 10, bg, outline=GREEN_UP_OUT if up else RED_DOWN_OUT)
            draw.text((bx+10, by+4), txt, font=f_diff, fill=col)

        # output
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    except Exception as e:
        logger.error(f"[trade_image] Generation failed: {e}", exc_info=True)
        return None