"""Vidéo de toute une séance (pour le coach) : un petit coach animé explique chaque étape dans une bulle.

Usage :  python scraper/video_seance.py 2026-10-08
Lit coach-prive/seances.json (privé) ; écrit coach-prive/videos/<date>-seance.mp4.
Réutilise le dessin du terrain et des joueurs de video_animation.py.
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import video_animation as va  # noqa: E402

ROOT = va.ROOT
W, H, FPS = va.W, va.H, 24
NAVY, ORANGE, TEXTE, GRIS, FOND = va.NAVY, va.ORANGE, va.TEXTE, va.GRIS, va.FOND
CREME = (246, 234, 214)
P = va.police
txt = va.sans_emoji


# ------------------------------------------------------------ petits dessins

def bonhomme(fig, larg):
    """Bonhomme de l'espace coach (cadre 160 × 120) dessiné à la largeur demandée."""
    k = larg / 160
    im = Image.new("RGB", (larg, int(120 * k)), CREME)
    d = ImageDraw.Draw(im)
    s = lambda p: (p[0] * k, p[1] * k)
    d.line([s((6, 111)), s((154, 111))], fill=(200, 190, 175), width=max(2, int(2 * k)))
    if fig.get("mur"):
        d.line([s((fig["mur"], 10)), s((fig["mur"], 111))], fill=(150, 150, 150), width=int(4 * k))
    for pts in fig.get("decor", []):
        d.line([s(p) for p in pts], fill=(140, 140, 140), width=int(3 * k), joint="curve")
    for pts in fig["traits"]:
        d.line([s(p) for p in pts], fill=NAVY, width=int(5 * k), joint="curve")
        for p in pts:                                   # bouts arrondis
            x, y = s(p)
            r = 2.5 * k
            d.ellipse([x - r, y - r, x + r, y + r], fill=NAVY)
    x, y = s(fig["tete"])
    r = 8 * k
    d.ellipse([x - r, y - r, x + r, y + r], fill=ORANGE, outline=NAVY, width=int(2.5 * k))
    return im


def coach(d, x0, y0, t, taille=1.0):
    """Le petit coach qui parle : il se balance un peu et fait des gestes vers la bulle."""
    k = taille
    b = 6 * math.sin(t * 2.2)                           # balancement
    geste = math.sin(t * 5.5)
    hx, hy = x0 + 110 * k, y0 + 70 * k + b
    w = int(12 * k)
    # jambes, corps, bras
    hanche = (x0 + 110 * k, y0 + 240 * k + b * 0.5)
    d.line([(hx, hy + 30 * k), hanche], fill=TEXTE, width=w)
    d.line([hanche, (x0 + 72 * k, y0 + 380 * k)], fill=TEXTE, width=w)
    d.line([hanche, (x0 + 148 * k, y0 + 380 * k)], fill=TEXTE, width=w)
    epaule = (hx, hy + 70 * k)
    d.line([epaule, (x0 + 70 * k, y0 + 190 * k + b), (x0 + 92 * k, y0 + 236 * k + b)], fill=TEXTE, width=w, joint="curve")   # main sur la hanche
    coude = (x0 + 175 * k, y0 + 120 * k + b + 6 * geste)
    main = (x0 + 222 * k, y0 + 70 * k + b + 18 * geste)
    d.line([epaule, coude, main], fill=TEXTE, width=w, joint="curve")
    d.ellipse([main[0] - 10 * k, main[1] - 10 * k, main[0] + 10 * k, main[1] + 10 * k], fill=TEXTE)
    # tête, casquette, visage, sifflet
    r = 36 * k
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=ORANGE, outline=TEXTE, width=int(5 * k))
    d.chord([hx - r - 2, hy - r - 4, hx + r + 2, hy + r * 0.6], 180, 360, fill=va.ROUGE)
    d.rectangle([hx, hy - 10 * k, hx + r + 22 * k, hy - 2 * k], fill=va.ROUGE)
    for ex in (-12, 12):
        d.ellipse([hx + ex * k - 4 * k, hy + 6 * k, hx + ex * k + 4 * k, hy + 14 * k], fill=NAVY)
    ouvre = 4 + 5 * abs(math.sin(t * 9))                # la bouche bouge : il parle
    d.ellipse([hx - 9 * k, hy + 20 * k, hx + 9 * k, hy + (20 + ouvre) * k], fill=NAVY)
    d.line([(hx - 6 * k, hy + 34 * k), (hx + 18 * k, hy + 58 * k)], fill=GRIS, width=int(3 * k))
    d.ellipse([hx + 12 * k, hy + 54 * k, hx + 26 * k, hy + 66 * k], fill=(200, 200, 205))


def bulle(d, texte, x, y, larg, haut_max, pointe):
    """Bulle de BD avec le texte ; taille de police réduite si le texte est long."""
    for taille in (44, 40, 36, 32, 29):
        f = P(taille, False)
        lignes = decouper(d, texte, larg - 70, f)
        h = len(lignes) * taille * 1.3 + 60
        if h <= haut_max:
            break
    d.rounded_rectangle([x, y, x + larg, y + h], 34, fill=CREME)
    px, py = pointe
    d.polygon([(x + 40, y + h - 40), (x + 40, y + h - 110), (px, py)], fill=CREME)
    for i, l in enumerate(lignes):
        d.text((x + 35, y + 30 + i * taille * 1.3), l, font=f, fill=NAVY)
    return y + h


def decouper(d, texte, larg, f):
    lignes = []
    for para in texte.split("\n"):
        ligne = ""
        for m in para.split():
            essai = (ligne + " " + m).strip()
            if d.textlength(essai, font=f) <= larg:
                ligne = essai
            else:
                lignes.append(ligne)
                ligne = m
        lignes.append(ligne)
    return lignes


def entete(d, rubrique, titre):
    d.text((60, 52), rubrique.upper(), font=P(34), fill=ORANGE)
    y = 100
    for l in decouper(d, txt(titre), W - 120, P(60)):
        d.text((60, y), l, font=P(60), fill=TEXTE)
        y += 74
    return y


def barre(d, avancement):
    d.rectangle([0, 0, W, 12], fill=(30, 40, 66))
    d.rectangle([0, 0, W * avancement, 12], fill=ORANGE)


# ------------------------------------------------------------ segments

class Carte:
    """Écran fixe : en-tête + contenu (tuiles de bonshommes ou liste) + coach qui parle dans sa bulle."""

    def __init__(self, rubrique, titre, parole, tuiles=None, liste=None):
        self.parole = txt(parole)
        self.duree = max(5.0, min(11.0, 3.0 + len(self.parole) / 17))
        self.fond = Image.new("RGB", (W, H), FOND)
        d = ImageDraw.Draw(self.fond)
        y = entete(d, rubrique, titre) + 30
        if tuiles:                                       # bonshommes avec leur nom
            n = len(tuiles)
            col = 3 if n > 4 else 2
            tl = (W - 120 - (col - 1) * 30) // col
            for i, (fig, nom, info) in enumerate(tuiles):
                cx, cy = 60 + (i % col) * (tl + 30), y + (i // col) * (int(tl * 0.75) + 130)
                self.fond.paste(bonhomme(fig, tl), (int(cx), int(cy)))
                d.text((cx, cy + tl * 0.75 + 10), txt(nom), font=P(32 if col == 2 else 27), fill=TEXTE)
                if info:
                    d.text((cx, cy + tl * 0.75 + 54), txt(info), font=P(28, False), fill=GRIS)
        if liste:
            f = P(36, False)
            for l in liste:
                for i, ligne in enumerate(decouper(d, txt(l), W - 160, f)):
                    d.text((100 if i else 60, y), ("• " if i == 0 else "") + ligne, font=f, fill=TEXTE if i == 0 else GRIS)
                    y += 48
                y += 14

    def image(self, t):
        im = self.fond.copy()
        d = ImageDraw.Draw(im)
        bulle(d, self.parole, 290, 1180, 750, 520, (250, 1530))
        coach(d, 30, 1480, t)
        return im


class Terrain:
    """Animation d'un exercice sur le demi-terrain, le coach lit l'étape en cours."""

    def __init__(self, rubrique, titre, an):
        self.an, self.rubrique, self.titre = an, rubrique, titre
        self.duree = va.duree(an) + 1.0
        self.fond = va.terrain(an.get("packline"))
        d = ImageDraw.Draw(self.fond)
        d.rectangle([0, 0, W, va.OY - 10], fill=FOND)
        entete(d, rubrique, titre)

    def image(self, t):
        an = self.an
        im = self.fond.copy()
        d = ImageDraw.Draw(im, "RGBA")
        k, u = va.etat(an, t)
        a, b = an["etapes"][k], an["etapes"][min(k + 1, len(an["etapes"]) - 1)]
        K = va.K

        def ici(j):
            p, q = a["pos"].get(j), b["pos"].get(j, a["pos"].get(j))
            return va.P(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u)
        R, f = 0.55 * K, P(30)
        for j in a["pos"]:
            x, y = ici(j)
            c = va.ROUGE if j.startswith("X") or j == "D" else NAVY
            d.ellipse([x - R, y - R, x + R, y + R], fill=c, outline=(255, 255, 255), width=4)
            d.text((x, y + 1), j, font=f, fill=(255, 255, 255), anchor="mm")

        def bp(j):
            if j == "panier":
                return va.P(7.5, 1.575)
            x, y = ici(j)
            return x + 0.45 * K, y + 0.45 * K
        (x1, y1), (x2, y2) = bp(a["ballon"]), bp(b.get("ballon", a["ballon"]))
        bx, by = x1 + (x2 - x1) * u, y1 + (y2 - y1) * u
        d.ellipse([bx - 15, by - 15, bx + 15, by + 15], fill=ORANGE, outline=(124, 45, 18), width=3)
        etape = k + 1 if u > 0 else k
        d.text((W - 60, va.OY - 50), f"Étape {etape + 1}/{len(an['etapes'])}", font=P(34), fill=ORANGE, anchor="ra")
        bulle(d, txt(an["etapes"][etape].get("texte", "")), 290, va.OY + 14 * K + 30, 750, 400, (250, 1640))
        coach(d, 40, 1560, t, 0.82)
        return im


def etirements_js():
    """Relit la liste ETIREMENTS de coach.js (une seule source pour l'appli et la vidéo)."""
    js = (ROOT / "docs/coach.js").read_text(encoding="utf-8")
    bloc = js.split("const ETIREMENTS = [", 1)[1].split("];", 1)[0]
    bloc = re.sub(r"(\b\w+):", r'"\1":', bloc)
    bloc = re.sub(r",\s*([\]}])", r"\1", bloc).strip().rstrip(",")
    return json.loads("[" + bloc + "]")


def segments(s):
    seg = []
    jour = s["date"]
    seg.append(Carte("Ce soir · 19h00 – 20h30", s["titre"],
                     f"Salut coach ! Voici la séance de ce soir, étape par étape. {s.get('resume', '')}"))
    seg.append(Carte("Le programme", "Déroulé de la séance",
                     "On enchaîne vite : une consigne, 30 secondes de démo, et on joue. Les corrections se font en jouant.",
                     liste=[o.replace(" (bloc ci-dessous)", "").replace(" avec le schéma ci-dessus", "")
                            for o in s.get("organisation", []) if o[:2].isdigit()]))
    mots = [o for o in s.get("organisation", []) if not o[:2].isdigit()]
    if mots:
        seg.append(Carte("Toute la séance", "Les règles à répéter", " ".join(mots)))

    ech = s.get("echauffement")
    if ech:
        parties, cur = [], None
        for e in ech["exos"]:
            if e.get("partie") or cur is None:
                cur = {"titre": e.get("partie", ech["titre"]), "exos": []}
                parties.append(cur)
            cur["exos"].append(e)
        for p in parties:
            parole = "\n".join(f"{e['nom']} : {e['txt'].split('. ')[0].rstrip('.')}." for e in p["exos"])
            seg.append(Carte(f"Échauffement · {ech.get('duree', '')}", p["titre"].split("—")[0].strip(), parole,
                             tuiles=[(e["fig"], e["nom"], e.get("series")) for e in p["exos"]]))

    if s.get("animation"):
        premier = dict(s["animation"])
        premier["etapes"] = premier["etapes"][:1]
        expl = [o for o in s.get("organisation", []) if "explication" in o.lower()]
        seg.append(Terrain("Explication · 5 min", "Le principe : la Pack Line",
                           {**premier, "etapes": [{**premier["etapes"][0], "pause": 8,
                                                    "texte": (expl[0].split(":", 1)[-1].strip() if expl else "") + " " + premier["etapes"][0]["texte"]}]}))

    for a in s.get("ateliers", []):
        num = a.get("num", "")
        seg.append(Carte(f"Exercice {num} · {a.get('duree', '')}", a["titre"],
                         a.get("but", ""), liste=a.get("consignes", [])[:4]))
        if a.get("animation"):
            seg.append(Terrain(f"Exercice {num} · en images", a["titre"], a["animation"]))

    if s.get("animation"):
        seg.append(Terrain("Récap de la séance", "Toute la Pack Line", s["animation"]))
    et = etirements_js()
    seg.append(Carte("Fin de séance · 5 min", "Étirements",
                     "Pour finir, au calme : on tient chaque position 30 secondes, sans à-coups, en respirant.",
                     tuiles=[(e["fig"], e["nom"], e["duree"]) for e in et]))
    seg.append(Carte("C'est parti", "Bon entraînement !",
                     "Sois à fond et à la voix : s'ils t'entendent parler, ils parleront aussi. Bon entraînement coach !"))
    return seg


def main():
    jour = sys.argv[1]
    s = next(x for x in json.loads((ROOT / "coach-prive/seances.json").read_text(encoding="utf-8"))["seances"] if x["date"] == jour)
    seg = segments(s)
    total = sum(x.duree for x in seg)
    sortie = ROOT / f"coach-prive/videos/{jour}-seance.mp4"
    sortie.parent.mkdir(exist_ok=True)
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24",
           "-movflags", "+faststart", str(sortie)]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    debut = 0.0
    for x in seg:
        for i in range(int(x.duree * FPS)):
            t = i / FPS
            im = x.image(t)
            barre(ImageDraw.Draw(im), (debut + t) / total)
            ff.stdin.write(im.tobytes())
        debut += x.duree
    ff.stdin.close()
    ff.wait()
    print(f"{sortie.relative_to(ROOT)} : {len(seg)} écrans, {total / 60:.1f} min, {sortie.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
