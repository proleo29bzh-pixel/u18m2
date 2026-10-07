"""Met à jour docs/data.json et docs/calendrier.ics pour l'appli U18M2.

Sources :
  - scraper/ffbb_saison.json : calendrier officiel FFBB (poule D2C), saisi une fois
  - cjr-basketball.com       : page équipe U18M2, pages match (heure, lieu, score)
                               et convocations (RDV, table, arbitres)
  - config/infos.json        : infos du coach (rassemblement, notes, scores manuels)

Aucune dépendance : python update.py
"""
import html
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CJR = "https://cjr-basketball.com"
EQUIPE_CJR = "U18M2"
PAGE_EQUIPE = f"{CJR}/u18m2-cadets"
UA = "Mozilla/5.0 (appli U18M2 CTC St Renan-Plouarzel)"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def texte(fragment):
    t = re.sub(r"<script.*?</script>", " ", fragment, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def cellules(row):
    """Textes des <td>, une cellule avec colspan=N compte pour N colonnes."""
    out = []
    for attrs, contenu in re.findall(r"<td([^>]*)>(.*?)</td>", row, flags=re.S):
        span = re.search(r'colspan="(\d+)"', attrs)
        out += [texte(contenu)] * (int(span.group(1)) if span else 1)
    return out


def heure(s):
    """'15H30' -> '15:30', sinon None."""
    m = re.search(r"(\d{1,2})\s*H\s*(\d{2})", s or "", flags=re.I)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def logo_local(url):
    """Copie le logo dans docs/logos/ (appli utilisable hors-ligne)."""
    nom = re.sub(r"[^\w.-]", "_", url.rsplit("/", 1)[-1])
    dest = ROOT / "docs/logos" / nom
    if not dest.exists():
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                dest.parent.mkdir(exist_ok=True)
                dest.write_bytes(r.read())
        except Exception:
            return url
    return f"logos/{nom}"


def cle(nom):
    return re.sub(r"[^a-z]", "", nom.lower())


# ---------------------------------------------------------------- CJR

def matchs_equipe():
    """Liste des matchs U18M2 sur la page équipe du CJR."""
    page = get(PAGE_EQUIPE)
    debut = page.find('id="matchs"')
    page = page[debut:] if debut >= 0 else page
    out = []
    for row in re.findall(r"<tr>(.*?)</tr>", page, flags=re.S):
        ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', row, flags=re.S)
        if not ld:
            continue
        ev = json.loads(ld.group(1))
        logos = dict(re.findall(r'class="logo-club (home|away)" src="([^"]+)"', row))
        label = re.search(r'class="label[^"]*">([^<]+)<', row)
        out.append({
            "url": ev["url"],
            "debut": ev.get("startDate"),
            "dom": ev["homeTeam"]["name"],
            "ext": ev["awayTeam"]["name"],
            "type": label.group(1).strip() if label else "",
            "logo_dom": logo_local(CJR + logos["home"]) if "home" in logos else None,
            "logo_ext": logo_local(CJR + logos["away"]) if "away" in logos else None,
        })
    return out


def detail_match(url):
    page = get(url)
    info = {}
    m = re.search(r"Heure du match\s*</span>(.*?)</div>", page, flags=re.S)
    if m:
        info["heure"] = heure(texte(m.group(1)))
    m = re.search(r"<h4>Lieu</h4>.*?panel-body\">(.*?)</div>", page, flags=re.S)
    if m:
        lignes = [texte(x) for x in re.findall(r'<span class="block">(.*?)</span>', m.group(1), flags=re.S)]
        info["lieu"] = [l for l in lignes if l]
    scores = [texte(s) for s in re.findall(r'<h2 class="score">(.*?)</h2>', page, flags=re.S)]
    scores = [int(s) for s in scores if s.isdigit()]
    if len(scores) >= 2:
        info["score"] = scores[:2]
    return info


def convocations(lundi):
    """Ligne U18M2 des convocations de la semaine, indexées par URL du match."""
    page = get(f"{CJR}/convocations?date={lundi.isoformat()}&mode=full")
    out = {}
    for table in page.split('<table class="table table-convocs')[1:]:
        cap = re.search(r"<caption[^>]*>(.*?)</caption>", table, flags=re.S)
        domicile = cap and "domicile" in texte(cap.group(1)).lower()
        salle = None
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.S):
            if "fa-map-pin" in row:
                salle = texte(row)
                continue
            c = cellules(row)
            if not c or c[0] != EQUIPE_CJR:
                continue
            lien = re.search(r'href="([^"]*/matchs/apercu/[^"]+)"', row)
            d = {"domicile": bool(domicile)}
            if len(c) > 3 and "forfait" in c[2].lower():
                d["forfait"] = c[2]
            else:
                d["rdv"] = heure(c[2]) if len(c) > 2 else None
                d["heure"] = heure(c[3]) if len(c) > 3 else None
            if domicile:
                d["salle"] = salle
                if len(c) >= 9:
                    d["table"], d["arbitres"], d["resp_salle"] = c[5] or None, c[6] or None, c[7] or None
            elif len(c) >= 6:
                d["salle"] = c[5] or None
            out[lien.group(1) if lien else f"{lundi}-{len(out)}"] = d
    return out


# ---------------------------------------------------------------- fusion

def construire():
    saison = json.loads((ROOT / "scraper/ffbb_saison.json").read_text(encoding="utf-8"))
    infos = json.loads((ROOT / "config/infos.json").read_text(encoding="utf-8"))
    equipes, salles = saison["equipes"], saison["salles"]
    nous = next(n for n, e in equipes.items() if e.get("nous"))

    erreurs = []
    try:
        cjr = matchs_equipe()
    except Exception as e:  # le site CJR peut être indisponible : on garde le calendrier FFBB
        cjr, erreurs = [], [f"page équipe CJR : {e}"]

    for m in cjr:
        try:
            m.update(detail_match(m["url"]))
        except Exception as e:
            erreurs.append(f"match {m['url']} : {e}")

    # convocations : semaines des matchs à venir (et de la semaine en cours)
    today = date.today()
    jours = {date.fromisoformat(r["date"][:10]) for r in saison["rencontres"]}
    jours |= {date.fromisoformat(m["debut"][:10]) for m in cjr if m.get("debut")}
    lundis = sorted({j - timedelta(days=j.weekday()) for j in jours
                     if today - timedelta(days=7) <= j <= today + timedelta(days=21)})
    convoc = {}
    for l in lundis:
        try:
            convoc.update(convocations(l))
        except Exception as e:
            erreurs.append(f"convocations {l} : {e}")
    for m in cjr:
        base = m["url"].split("?")[0]
        c = next((v for k, v in convoc.items() if k.split("?")[0] == base), None)
        if c:
            m["convoc"] = c

    logos = {}
    for m in cjr:
        for cote in ("dom", "ext"):
            if m.get(f"logo_{cote}"):
                nom = "__nous" if EQUIPE_CJR.lower() in m[cote].lower() else cle(m[cote])
                logos[nom] = m[f"logo_{cote}"]

    def logo(nom_ffbb):
        if nom_ffbb == nous:
            return logos.get("__nous")
        k = cle(nom_ffbb)
        return next((v for c, v in logos.items() if c and (c in k or k in c)), None)

    rencontres, cjr_utilises = [], set()
    for r in saison["rencontres"]:
        jour = r["date"][:10]
        a_nous = nous in (r["dom"], r["ext"])
        if r.get("cjr"):   # match rattaché à sa fiche CJR (utile quand il est reporté)
            m = next((x for x in cjr if f"/apercu/{r['cjr']}/" in x["url"]), None)
        else:
            m = next((x for x in cjr if a_nous and x.get("debut", "")[:10] == jour), None)
        # fiche CJR encore à l'ancienne date : on ne reprend ni son heure ni sa convocation
        cjr_a_jour = bool(m) and m.get("debut", "")[:10] == jour
        if m:
            cjr_utilises.add(m["url"])
        s = salles.get(r["salle"], {})
        h = r["date"][11:16]
        rencontre = {
            "id": r["id"], "journee": r["journee"], "type": "Championnat",
            "date": jour, "heure": None if h == "00:00" else h,
            "dom": {"nom": equipes[r["dom"]]["court"], "nous": r["dom"] == nous, "logo": logo(r["dom"])},
            "ext": {"nom": equipes[r["ext"]]["court"], "nous": r["ext"] == nous, "logo": logo(r["ext"])},
            "salle": dict(s), "nous": a_nous, "score": None,
        }
        if r.get("reporte_de"):
            rencontre["reporte_de"] = r["reporte_de"]
        if m:
            rencontre["cjr"] = m["url"]
            if cjr_a_jour:
                rencontre["heure"] = (m.get("convoc") or {}).get("heure") or m.get("heure") or rencontre["heure"]
            if m.get("score"):
                rencontre["score"] = m["score"]
            if m.get("convoc") and cjr_a_jour:
                rencontre["convoc"] = m["convoc"]
                # la convocation du club fait foi pour la salle (ex. match déplacé de Plouarzel à Bel-Air)
                salle_cv = cle(m["convoc"].get("salle") or "")
                autre = next((v for v in salles.values() if v.get("cjr") and cle(v["cjr"]) in salle_cv), None)
                if autre and autre is not s:
                    rencontre["salle"] = {k: v for k, v in autre.items() if k != "cjr"}
        manuel = infos.get("scores_manuels", {}).get(r["id"])
        if isinstance(manuel, list) and len(manuel) == 2:
            rencontre["score"] = manuel
        rencontres.append(rencontre)

    # matchs CJR hors championnat D2C (plateaux, amicaux, coupe...)
    for m in cjr:
        if m["url"] in cjr_utilises or not m.get("debut"):
            continue
        nous_dom = EQUIPE_CJR.lower() in m["dom"].lower()
        heure_m = (m.get("convoc") or {}).get("heure") or m.get("heure") or (m["debut"][11:16] or None)
        rencontres.append({
            "id": "cjr-" + re.sub(r"\D", "", m["url"].split("/apercu/")[1].split("/")[0]),
            "journee": None, "type": m["type"] or "Match",
            "date": m["debut"][:10], "heure": heure_m,
            "dom": {"nom": infos["club"] if nous_dom else m["dom"].title(), "nous": nous_dom, "logo": m.get("logo_dom")},
            "ext": {"nom": m["ext"].title() if nous_dom else infos["club"], "nous": not nous_dom, "logo": m.get("logo_ext")},
            "salle": {"nom": ", ".join(m.get("lieu") or []) or None},
            "nous": True, "score": m.get("score"), "cjr": m["url"],
            **({"convoc": m["convoc"]} if m.get("convoc") else {}),
        })

    # infos coach par date
    for r in rencontres:
        if r["nous"]:
            note = {k: v for k, v in infos.get("matchs", {}).get(r["date"], {}).items() if v}
            if note:
                r["coach"] = note

    rencontres.sort(key=lambda r: (r["date"], r["heure"] or "99"))
    return {
        "maj": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "competition": saison["competition"],
        "equipe": infos["equipe"], "club": infos["club"], "coachs": infos.get("coachs", []),
        "rassemblement": infos.get("rassemblement_defaut", {}),
        "liens": infos.get("liens", {}),
        "joueurs": infos.get("joueurs", []),
        "familles": infos.get("familles", []),
        "entrainements": infos.get("entrainements", []),
        "seance_jeudi": infos.get("seance_jeudi", {}),
        "etat_esprit": infos.get("etat_esprit", []),
        "annonces": infos.get("annonces", []),
        "maillots_rotation": bool(infos.get("maillots_rotation")),
        "numeros_maillot": infos.get("numeros_maillot", {}),
        "surnoms": infos.get("surnoms", {}),
        "covoiturage": {k: v for k, v in infos.get("covoiturage", {}).items() if not k.startswith("_")},
        "rencontres": rencontres,
        "erreurs": erreurs,
    }


# ---------------------------------------------------------------- calendrier .ics

def ics(data):
    def esc(s):
        return str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

    lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//U18M2 CTC St Renan-Plouarzel//FR",
              "CALSCALE:GREGORIAN", f"X-WR-CALNAME:{esc(data['equipe'] + ' ' + data['club'])}",
              "X-WR-TIMEZONE:Europe/Paris", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for r in data["rencontres"]:
        if not r["nous"]:
            continue
        adv = r["ext"]["nom"] if r["dom"]["nous"] else r["dom"]["nom"]
        titre = f"🏀 {'vs' if r['dom']['nous'] else '@'} {adv}"
        if r.get("score"):
            titre += f" ({r['score'][0]}-{r['score'][1]})"
        d = r["date"].replace("-", "")
        if r["heure"]:
            h = r["heure"].replace(":", "") + "00"
            fin = (datetime.strptime(d + h, "%Y%m%d%H%M%S") + timedelta(hours=2)).strftime("%Y%m%dT%H%M%S")
            quand = [f"DTSTART;TZID=Europe/Paris:{d}T{h}", f"DTEND;TZID=Europe/Paris:{fin}"]
        else:
            lendemain = (date.fromisoformat(r["date"]) + timedelta(days=1)).strftime("%Y%m%d")
            quand = [f"DTSTART;VALUE=DATE:{d}", f"DTEND;VALUE=DATE:{lendemain}"]
            titre += " (horaire à confirmer)"
        s = r.get("salle") or {}
        desc = [r["type"] + (f" - J{r['journee']}" if r.get("journee") else "")]
        rdv = (r.get("convoc") or {}).get("rdv")
        if rdv:
            desc.append(f"RDV : {rdv}")
        if r.get("coach", {}).get("note"):
            desc.append(r["coach"]["note"])
        lignes += ["BEGIN:VEVENT", f"UID:{r['id']}@u18m2-ctc", f"DTSTAMP:{stamp}", *quand,
                   f"SUMMARY:{esc(titre)}",
                   f"LOCATION:{esc(', '.join(x for x in [s.get('nom'), s.get('adresse')] if x))}",
                   f"DESCRIPTION:{esc(chr(10).join(desc))}", "END:VEVENT"]
    # entraînements : un événement qui se répète chaque semaine jusqu'à la fin de saison
    debut_saison, fin_saison = date(2026, 9, 1), "20270630T235959Z"
    for e in data.get("entrainements", []):
        jour = debut_saison + timedelta(days=(e["jour_num"] - debut_saison.isoweekday()) % 7)
        d = jour.strftime("%Y%m%d")
        lieu = e.get("lieu", {})
        lignes += ["BEGIN:VEVENT", f"UID:entr-{e['jour'].lower()}@u18m2-ctc", f"DTSTAMP:{stamp}",
                   f"DTSTART;TZID=Europe/Paris:{d}T{e['debut'].replace(':', '')}00",
                   f"DTEND;TZID=Europe/Paris:{d}T{e['fin'].replace(':', '')}00",
                   f"RRULE:FREQ=WEEKLY;UNTIL={fin_saison}",
                   f"SUMMARY:{esc('🏀 Entraînement U18M2' + (' (' + e['coach'] + ')' if e.get('coach') else ''))}",
                   f"LOCATION:{esc(lieu.get('adresse') or lieu.get('nom') or '')}",
                   "END:VEVENT"]
    lignes.append("END:VCALENDAR")
    return "\r\n".join(lignes) + "\r\n"


def garder_infos_cjr(data, ancien):
    """Site CJR en panne (erreurs) : on reprend la dernière version connue de ce qui vient du CJR
    (heure, convocation, salle de la convocation, score, logos, plateaux) au lieu de l'effacer."""
    if not data["erreurs"] or not ancien:
        return
    avant = {r["id"]: r for r in ancien.get("rencontres", [])}
    for r in data["rencontres"]:
        o = avant.get(r["id"])
        if not o:
            continue
        for k in ("heure", "cjr", "score"):
            if not r.get(k) and o.get(k):
                r[k] = o[k]
        if not r.get("convoc") and o.get("convoc"):
            r["convoc"], r["salle"] = o["convoc"], o.get("salle", r["salle"])
        for cote in ("dom", "ext"):
            if not r[cote].get("logo") and o.get(cote, {}).get("logo"):
                r[cote]["logo"] = o[cote]["logo"]
    if any(e.startswith("page équipe CJR") for e in data["erreurs"]):   # plateaux, amicaux : seulement connus du CJR
        ids = {r["id"] for r in data["rencontres"]}
        data["rencontres"] += [o for i, o in avant.items() if i not in ids]
        data["rencontres"].sort(key=lambda r: (r["date"], r.get("heure") or "99"))


if __name__ == "__main__":
    data = construire()
    try:
        ancien = json.loads((ROOT / "docs/data.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        ancien = None
    garder_infos_cjr(data, ancien)
    (ROOT / "docs/data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "docs/calendrier.ics").write_text(ics(data), encoding="utf-8", newline="")
    nb = sum(r["nous"] for r in data["rencontres"])
    print(f"{nb} matchs U18M2, {len(data['rencontres'])} rencontres au total")
    for e in data["erreurs"]:
        print("ATTENTION", e, file=sys.stderr)
