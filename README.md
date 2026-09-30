# Appli U18M2 – CTC St Renan-Plouarzel

Appli installable (Android, Mac, iPhone) : prochain match, rassemblement, planning, scores et classement de la poule D2C.

## Comment ça marche

| Élément | Source | Mise à jour |
|---|---|---|
| Calendrier officiel, salles, adresses GPS | FFBB (`scraper/ffbb_saison.json`) | Saisi une fois. À modifier si la FFBB change une date |
| Heures de match, RDV, lieu, table/arbitres, scores | Site CJR (convocations + page U18M2) | Automatique toutes les heures |
| Point de rassemblement, notes du coach, covoiturage | `config/infos.json` | À la main par le coach |
| Dispos covoiturage des familles | Google Sheet du coach (`apps-script/`) | En direct |
| Scores des autres matchs de la poule | `config/infos.json` → `scores_manuels` | À la main (le CJR ne les connaît pas) |

La FFBB bloque les robots, donc l'appli ne peut pas lire son site toute seule. Le bouton « Classement officiel FFBB » renvoie vers la page.

## Pour le coach : modifier les infos d'un match

Dans `config/infos.json` (on peut l'éditer directement sur github.com, icône crayon) :

```json
"matchs": {
  "2026-10-03": {
    "rdv_lieu": "Parking salle Bel-Air",
    "rdv_heure": "13:15",
    "note": "Covoit : Tom et Lucas prennent leur voiture"
  }
}
```

Après enregistrement, l'appli est mise à jour en 1 à 2 minutes.

## Covoiturage

Onglet « Covoit » : chaque famille indique pour chaque déplacement si son fils joue et si elle peut conduire (et combien de places).
L'appli désigne les chauffeurs en commençant par les familles qui ont le moins conduit, puis celles qui ont conduit il y a le plus longtemps.
Un joueur sans réponse est compté présent. Après la date du match, les réponses sont figées et le trajet est compté.

- Prénoms des joueurs : `config/infos.json` → `joueurs`
- Activer le partage entre familles : suivre `apps-script/LISEZMOI.md` (Google Sheet, gratuit)
- Sans ça, l'onglet fonctionne en mode démo (réponses gardées sur l'appareil)

## Tester en local

```
python scraper/update.py
python -m http.server 8618 --directory docs
```
Puis ouvrir http://localhost:8618

## Mise en ligne (GitHub Pages, gratuit)

1. Créer un dépôt GitHub (ex. `u18m2`) et y envoyer ce dossier.
2. Settings → Pages → Source : branche `main`, dossier `/docs`.
3. Settings → Actions → General → Workflow permissions : « Read and write ».
4. L'appli est dispo sur `https://<compte>.github.io/u18m2/` : envoyer ce lien aux joueurs.

## Nouvelle phase / nouvelle saison

Refaire `scraper/ffbb_saison.json` avec les rencontres de la nouvelle poule.
