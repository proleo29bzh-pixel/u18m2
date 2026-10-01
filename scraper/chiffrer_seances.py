"""Chiffre les séances coach (coach-prive/seances.json) vers docs/coach.enc.json.

Le fichier en clair reste sur ce PC (dossier ignoré par git). Seule la version chiffrée
est publiée ; l'appli la déchiffre avec le mot de passe coach (AES-GCM, clé PBKDF2-SHA256).

Usage :  python scraper/chiffrer_seances.py            (le mot de passe est demandé)
         COACH_MDP=... python scraper/chiffrer_seances.py
Dépendance : pip install cryptography
"""
import base64
import getpass
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "coach-prive/seances.json"
CIBLE = ROOT / "docs/coach.enc.json"
ITERATIONS = 310_000


def chiffrer(texte: str, mdp: str) -> dict:
    sel, iv = os.urandom(16), os.urandom(12)
    cle = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sel, iterations=ITERATIONS).derive(mdp.encode("utf-8"))
    data = AESGCM(cle).encrypt(iv, texte.encode("utf-8"), None)  # chiffré + tag, format attendu par WebCrypto
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"v": 1, "iter": ITERATIONS, "sel": b64(sel), "iv": b64(iv), "data": b64(data)}


if __name__ == "__main__":
    contenu = json.loads(SOURCE.read_text(encoding="utf-8"))   # vérifie que le JSON est valide
    mdp = os.environ.get("COACH_MDP") or getpass.getpass("Mot de passe coach : ")
    if len(mdp) < 6:
        raise SystemExit("Mot de passe trop court (6 caractères minimum).")
    CIBLE.write_text(json.dumps(chiffrer(json.dumps(contenu, ensure_ascii=False), mdp)), encoding="utf-8")
    print(f"{len(contenu.get('seances', []))} séance(s) chiffrée(s) -> {CIBLE.relative_to(ROOT)}")
