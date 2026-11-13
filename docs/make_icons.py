"""Draws RiRi's app icons (the ember ring on graphite) as PNGs for phones: python docs/make_icons.py"""
import math
import pathlib

from PIL import Image, ImageDraw, ImageFilter

OUT = pathlib.Path(__file__).resolve().parent.parent / "app" / "web"


def icon(size, maskable=False):
    s = size * 4  # draw large, scale down for smooth edges
    img = Image.new("RGB", (s, s), (15, 16, 19))
    # warm glow from below-right
    glow = Image.new("RGB", (s, s), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((s * .25, s * .3, s * 1.15, s * 1.2), fill=(120, 45, 15))
    glow = glow.filter(ImageFilter.GaussianBlur(s * .12))
    img = Image.blend(img, glow, .55)
    d = ImageDraw.Draw(img)
    scale = .62 if maskable else .74  # maskable icons keep the art inside the safe zone
    r = s * scale / 2
    cx = cy = s / 2
    w = max(2, int(s * .045))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(48, 50, 56), width=max(1, w // 3))
    # the ember arc, three quarters of the ring, shaded from peach to red
    steps = 270
    for i in range(steps):
        t = i / steps
        a0, a1 = -90 + i, -90 + i + 1.6
        col = (255, int(178 - 80 * t), int(122 - 80 * t))
        d.arc((cx - r, cy - r, cx + r, cy + r), a0, a1, fill=col, width=w)
    # rounded caps
    for ang in (-90, 180):
        x = cx + r * math.cos(math.radians(ang)) - 0
        y = cy + r * math.sin(math.radians(ang))
        c = (255, 178, 122) if ang == -90 else (255, 98, 42)
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=c)
    core = s * .045
    d.ellipse((cx - core, cy - core, cx + core, cy + core), fill=(255, 107, 44))
    return img.resize((size, size), Image.LANCZOS)


icon(180).save(OUT / "apple-touch-icon.png")
icon(192).save(OUT / "icon-192.png")
icon(512).save(OUT / "icon-512.png")
icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
print("icons written to", OUT)
