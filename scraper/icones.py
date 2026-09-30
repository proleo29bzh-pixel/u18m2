"""Génère les icônes de l'appli (ballon orange sur fond bleu marine)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs/icons"
NAVY, ORANGE, RED, LINE = (11, 31, 77), (255, 122, 26), (227, 6, 19), (40, 20, 10)


def icone(taille, marge_sure=False):
    s = 1024
    im = Image.new("RGB", (s, s), NAVY)
    d = ImageDraw.Draw(im)
    r = 300 if marge_sure else 360
    cx, cy = s // 2, s // 2 - (30 if marge_sure else 40)
    box = (cx - r, cy - r, cx + r, cy + r)
    d.ellipse(box, fill=ORANGE)
    w = 22
    coutures = Image.new("L", (s, s), 0)
    c = ImageDraw.Draw(coutures)
    c.line((cx - r, cy, cx + r, cy), fill=255, width=w)
    c.line((cx, cy - r, cx, cy + r), fill=255, width=w)
    R = int(r * 0.95)
    for sens in (-1, 1):  # coutures courbes gauche et droite
        ox = cx + sens * int(r * 1.3)
        c.ellipse((ox - R, cy - R, ox + R, cy + R), outline=255, width=w)
    masque = Image.new("L", (s, s), 0)
    ImageDraw.Draw(masque).ellipse(box, fill=255)
    from PIL import ImageChops
    im.paste(LINE, mask=ImageChops.multiply(coutures, masque))
    d = ImageDraw.Draw(im)
    # bandeau "U18M2"
    try:
        f = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 170 if marge_sure else 200)
    except OSError:
        f = ImageFont.load_default()
    txt = "U18M2"
    tb = d.textbbox((0, 0), txt, font=f)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    y = cy + r - th // 2 - 20
    pad = 34
    d.rounded_rectangle((cx - tw // 2 - pad, y - 18, cx + tw // 2 + pad, y + th + 40), 36, fill=RED)
    d.text((cx - tw // 2 - tb[0], y - tb[1] + 10), txt, font=f, fill="white")
    return im.resize((taille, taille), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for t in (180, 192, 512):
    icone(t).save(OUT / f"icon-{t}.png")
icone(512, marge_sure=True).save(OUT / "icon-512-maskable.png")
print("ok")
