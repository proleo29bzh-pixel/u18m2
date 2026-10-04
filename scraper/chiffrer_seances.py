"""Chiffre les séances coach (coach-prive/seances.json) vers docs/coach.enc.json,
et les licences (coach-prive/licences/<Prénom>.jpg|png|pdf) vers docs/licences/*.bin.

Le fichier en clair reste sur ce PC (dossier ignoré par git). Seule la version chiffrée
est publiée ; l'appli la déchiffre avec le mot de passe coach (AES-GCM, clé PBKDF2-SHA256).
Les licences sont chiffrées avec une clé aléatoire (coach-prive/licences.cle) rangée
dans coach.enc.json : sans le mot de passe coach, ni la clé ni la liste des noms ne sont lisibles.

Usage :  python scraper/chiffrer_seances.py            (le mot de passe est demandé)
         COACH_MDP=... python scraper/chiffrer_seances.py
Dépendance : pip install cryptography
"""
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "coach-prive/seances.json"
CIBLE = ROOT / "docs/coach.enc.json"
LICENCES = ROOT / "coach-prive/licences"
CLE_LICENCES = ROOT / "coach-prive/licences.cle"
CIBLE_LICENCES = ROOT / "docs/licences"
TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf"}
ITERATIONS = 310_000


def chiffrer(texte: str, mdp: str) -> dict:
    sel, iv = os.urandom(16), os.urandom(12)
    cle = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sel, iterations=ITERATIONS).derive(mdp.encode("utf-8"))
    data = AESGCM(cle).encrypt(iv, texte.encode("utf-8"), None)  # chiffré + tag, format attendu par WebCrypto
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"v": 1, "iter": ITERATIONS, "sel": b64(sel), "iv": b64(iv), "data": b64(data)}


def chiffrer_licences(contenu: dict) -> int:
    """Chiffre chaque fichier de coach-prive/licences ; le nom publié ne révèle pas le prénom."""
    fichiers = sorted(f for f in LICENCES.glob("*") if f.suffix.lower() in TYPES) if LICENCES.exists() else []
    CIBLE_LICENCES.mkdir(exist_ok=True)
    if not fichiers:
        contenu.pop("licences", None)
        for vieux in CIBLE_LICENCES.glob("*.bin"):
            vieux.unlink()
        return 0
    if not CLE_LICENCES.exists():
        CLE_LICENCES.write_text(base64.b64encode(os.urandom(32)).decode("ascii"), encoding="ascii")
    cle = base64.b64decode(CLE_LICENCES.read_text(encoding="ascii").strip())
    liste, gardes = [], set()
    for f in fichiers:
        nom_publie = hashlib.sha256(cle + f.name.encode("utf-8")).hexdigest()[:20] + ".bin"
        iv = os.urandom(12)
        (CIBLE_LICENCES / nom_publie).write_bytes(iv + AESGCM(cle).encrypt(iv, f.read_bytes(), None))
        liste.append({"nom": f.stem, "f": "licences/" + nom_publie, "type": TYPES[f.suffix.lower()]})
        gardes.add(nom_publie)
    for vieux in CIBLE_LICENCES.glob("*.bin"):
        if vieux.name not in gardes:
            vieux.unlink()
    contenu["licences"] = liste
    contenu["licences_cle"] = base64.b64encode(cle).decode("ascii")
    return len(liste)


if __name__ == "__main__":
    contenu = json.loads(SOURCE.read_text(encoding="utf-8"))   # vérifie que le JSON est valide
    mdp = os.environ.get("COACH_MDP") or getpass.getpass("Mot de passe coach : ")
    if len(mdp) < 6:
        raise SystemExit("Mot de passe trop court (6 caractères minimum).")
    nb_lic = chiffrer_licences(contenu)
    CIBLE.write_text(json.dumps(chiffrer(json.dumps(contenu, ensure_ascii=False), mdp)), encoding="utf-8")
    print(f"{len(contenu.get('seances', []))} séance(s), {nb_lic} licence(s) chiffrée(s) -> {CIBLE.relative_to(ROOT)}")
