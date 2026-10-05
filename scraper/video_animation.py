"""Transforme une animation de l'espace coach en vidéo MP4 verticale (format téléphone, pour WhatsApp).

Usage :  python scraper/video_animation.py 2026-10-08            (récap de la séance)
         python scraper/video_animation.py 2026-10-08 "shell"    (animation d'un atelier, par mot du titre)
Lit coach-prive/seances.json (en clair, jamais publié) ; écrit la vidéo dans coach-prive/videos/.
Dépendances : pip install pillow imageio-ffmpeg
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H, FPS = 1080, 1920, 30
K = 66                       # pixels par mètre
OX, OY = (W - 15 * K) // 2, 330  # coin haut gauche du demi-terrain
BOIS, RAQ, LIGNE, ORANGE = (236, 201, 149), (220, 174, 114), (255, 255, 255), (255, 122, 26)
NAVY, ROUGE, FOND, TEXTE, GRIS = (11, 31, 77), (227, 6, 19), (11, 18, 38), (240, 242, 248), (150, 160, 180)


def police(taille, gras=True):
    for nom in (["segoeuib.ttf", "arialbd.ttf"] if gras else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype("C:/Windows/Fonts/" + nom, taille)
        except OSError:
            pass
    return ImageFont.load_default()


def P(x, y):
    return OX + x * K, OY + y * K


def arc_points(cx, cy, r, a0, a1, n=120):
    return [P(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def terrain(packline):
    img = Image.new("RGB", (W, H), FOND)
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle([P(0, 0), P(15, 14)], 10, fill=BOIS, outline=LIGNE, width=5)
    d.rectangle([P(5.05, 0), P(9.95, 5.8)], fill=RAQ, outline=LIGNE, width=4)
    cx, cy = P(7.5, 5.8)
    d.ellipse([cx - 1.8 * K, cy - 1.8 * K, cx + 1.8 * K, cy + 1.8 * K], outline=LIGNE, width=4)
    trois = [P(0.9, 0)] + arc_points(7.5, 1.575, 6.75, 167.9, 12.1)[::-1][::-1] + [P(14.1, 0)]
    d.line(trois, fill=LIGNE, width=4, joint="curve")
    d.line(arc_points(7.5, 14, 1.8, 180, 360), fill=LIGNE, width=4)
    d.line([P(6.6, 1.2), P(8.4, 1.2)], fill=(55, 65, 81), width=7)
    hx, hy = P(7.5, 1.575)
    d.ellipse([hx - 0.3 * K, hy - 0.3 * K, hx + 0.3 * K, hy + 0.3 * K], outline=ORANGE, width=5)
    if packline:
        r = 5
        contour = [P(7.5 - r, 0), P(7.5 - r, 1.575)] + arc_points(7.5, 1.575, r, 180, 0) + [P(7.5 + r, 1.575), P(7.5 + r, 0)]
        d.polygon(contour, fill=(255, 122, 26, 34))
        for i in range(0, len(contour) - 1):          # pointillés
            if (i // 4) % 2 == 0:
                d.line([contour[i], contour[i + 1]], fill=ORANGE, width=6)
        d.line([P(7.5 - r, 0), P(7.5 - r, 1.575)], fill=ORANGE, width=6)
        d.line([P(7.5 + r, 0), P(7.5 + r, 1.575)], fill=ORANGE, width=6)
    return img


def lisse(u):
    return 2 * u * u if u < 0.5 else 1 - (-2 * u + 2) ** 2 / 2


def etat(an, t):
    mv, debut = an.get("mouvement", 1.4), 0
    n = len(an["etapes"])
    for k, e in enumerate(an["etapes"]):
        pause = e.get("pause", 2.6)
        if t < debut + pause or k == n - 1:
            return k, 0
        debut += pause
        if t < debut + mv:
            return k, lisse((t - debut) / mv)
        debut += mv


def duree(an):
    return sum(e.get("pause", 2.6) for e in an["etapes"]) + an.get("mouvement", 1.4) * (len(an["etapes"]) - 1)


def sans_emoji(s):
    return re.sub(r"[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F]", "", s).strip()


def ecrire(d, texte, x, y, larg, f, couleur=TEXTE, inter=1.25):
    mots, ligne, lignes = texte.split(), "", []
    for m in mots:
        essai = (ligne + " " + m).strip()
        if d.textlength(essai, font=f) <= larg:
            ligne = essai
        else:
            lignes.append(ligne)
            ligne = m
    lignes.append(ligne)
    for i, l in enumerate(lignes):
        d.text((x, y + i * f.size * inter), l, font=f, fill=couleur)
    return y + len(lignes) * f.size * inter


def image(an, fond, t, titre, sous_titre):
    img = fond.copy()
    d = ImageDraw.Draw(img, "RGBA")
    k, u = etat(an, t)
    a, b = an["etapes"][k], an["etapes"][min(k + 1, len(an["etapes"]) - 1)]

    def ici(j):
        p, q = a["pos"].get(j), b["pos"].get(j, a["pos"].get(j))
        return P(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u)

    # en-tête
    d.text((60, 70), sans_emoji(titre), font=police(64), fill=TEXTE)
    d.text((60, 160), sous_titre, font=police(36, False), fill=GRIS)
    etape = k + 1 if u > 0 else k
    d.text((60, 230), f"Étape {etape + 1} / {len(an['etapes'])}", font=police(38), fill=ORANGE)

    # joueurs
    R = 0.55 * K
    f = police(30)
    for j in a["pos"]:
        x, y = ici(j)
        c = ROUGE if j.startswith("X") or j == "D" else NAVY
        d.ellipse([x - R, y - R, x + R, y + R], fill=c, outline=LIGNE, width=4)
        d.text((x, y + 1), j, font=f, fill=LIGNE, anchor="mm")

    # ballon : collé au porteur, en vol pendant une passe, vers le panier pour un tir
    def bp(j):
        if j == "panier":
            return P(7.5, 1.575)
        x, y = ici(j)
        return x + 0.45 * K, y + 0.45 * K
    (x1, y1), (x2, y2) = bp(a["ballon"]), bp(b.get("ballon", a["ballon"]))
    bx, by = x1 + (x2 - x1) * u, y1 + (y2 - y1) * u
    d.ellipse([bx - 15, by - 15, bx + 15, by + 15], fill=ORANGE, outline=(124, 45, 18), width=3)

    # texte de l'étape
    y0 = OY + 14 * K + 50
    ecrire(d, sans_emoji(an["etapes"][etape].get("texte", "")), 60, y0, W - 120, police(44, False))

    # légende
    ly = H - 150
    f2 = police(32, False)
    for x, c, txt in ((60, NAVY, "attaquant"), (330, ROUGE, "défenseur")):
        d.ellipse([x, ly, x + 34, ly + 34], fill=c, outline=LIGNE, width=3)
        d.text((x + 48, ly - 2), txt, font=f2, fill=GRIS)
    if an.get("packline"):
        d.line([(610, ly + 17), (680, ly + 17)], fill=ORANGE, width=6)
        d.text((694, ly - 2), "pack line", font=f2, fill=GRIS)
    return img


def main():
    jour = sys.argv[1]
    cle = sys.argv[2].lower() if len(sys.argv) > 2 else ""
    seances = json.loads((ROOT / "coach-prive/seances.json").read_text(encoding="utf-8"))["seances"]
    s = next(x for x in seances if x["date"] == jour)
    if cle:
        at = next(a for a in s["ateliers"] if cle in a["titre"].lower() and a.get("animation"))
        an, titre = at["animation"], at["titre"]
    else:
        an, titre = s["animation"], an_titre if (an_titre := s["animation"].get("titre", "")) else s["titre"]
        titre = re.sub(r"^Récap animé\s*:\s*", "", titre)
        titre = titre[0].upper() + titre[1:]
    sortie = ROOT / "coach-prive/videos" / f"{jour}-{re.sub(r'[^a-z0-9]+', '-', (cle or 'recap'))}.mp4"
    sortie.parent.mkdir(exist_ok=True)

    fond = terrain(an.get("packline"))
    total = duree(an) + 0.6
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23",
           "-movflags", "+faststart", str(sortie)]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(total * FPS)):
        ff.stdin.write(image(an, fond, i / FPS, titre, "U18M2 · CTC St Renan-Plouarzel").tobytes())
    ff.stdin.close()
    ff.wait()
    print(f"{sortie.relative_to(ROOT)}  ({total:.0f} s, {sortie.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
