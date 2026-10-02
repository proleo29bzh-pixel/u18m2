/**
 * Appli U18M2 : covoiturage + annonces, stockés dans ce Google Sheet.
 * À coller dans Extensions > Apps Script du Google Sheet (voir LISEZMOI.md).
 *
 * Trois codes :
 *  - CODE_PARENTS : parents (covoit complet, annonces « tous » et « parents »)
 *  - CODE_JOUEURS : joueurs (leur présence, annonces « tous » et « joueurs »)
 *  - CODE_COACH   : staff (tout voir, publier et supprimer des annonces) = mot de passe de l'Espace coach
 * Tape tes vrais codes ICI, dans Google uniquement (jamais sur GitHub : le dépôt est public).
 */
const CODE_PARENTS = "A_CHANGER_PARENTS";
const CODE_JOUEURS = "A_CHANGER_JOUEURS";
const CODE_COACH = "A_CHANGER_COACH";

const FEUILLES = {
  Reponses: ["match", "famille", "present", "conduit", "places", "maj"],
  Annonces: ["id", "date", "auteur", "texte", "pour", "supprimee"],
  Reactions: ["annonce", "qui", "maj"],
};

function role_(code) {
  if (code && code === CODE_COACH) return "coach";
  if (code && code === CODE_PARENTS) return "parent";
  if (code && code === CODE_JOUEURS) return "joueur";
  return null;
}

/** Un joueur ne peut répondre que sur une ligne joueur (pas parent ou staff). */
function ligneJoueur_(famille) {
  return !/^(Parent:|Ultra:|Coach )/.test(String(famille));
}

function feuille_(nom) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    sh.appendRow(FEUILLES[nom]);
    sh.setFrozenRows(1);
  }
  return sh;
}

const lignes_ = (nom) => feuille_(nom).getDataRange().getValues().slice(1);

function lireReponses_() {
  return lignes_("Reponses").map((l) => ({
    match: String(l[0]), famille: String(l[1]),
    present: String(l[2] || ""), conduit: String(l[3] || ""),
    places: Number(l[4]) || null, maj: l[5] ? new Date(l[5]).toISOString() : null,
  }));
}

/** Annonces visibles pour ce rôle, les plus récentes d'abord, avec leurs 👍. */
function lireAnnonces_(role) {
  const reactions = lignes_("Reactions");
  return lignes_("Annonces")
    .filter((l) => !l[5])
    .filter((l) => role === "coach" || l[4] === "tous" || (role === "parent" && l[4] === "parents") || (role === "joueur" && l[4] === "joueurs"))
    .map((l) => {
      const qui = reactions.filter((r) => String(r[0]) === String(l[0])).map((r) => String(r[1]));
      return {
        id: String(l[0]), date: l[1] ? new Date(l[1]).toISOString() : null,
        auteur: String(l[2]), texte: String(l[3]), pour: String(l[4]),
        likes: qui.length, qui: role === "coach" ? qui : undefined,
      };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function reponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const role = role_(e.parameter.code || "");
  if (!role) return reponse_({ ok: false, erreur: "code" });
  if (e.parameter.action === "annonces") return reponse_({ ok: true, role: role, annonces: lireAnnonces_(role) });
  return reponse_({ ok: true, role: role, reponses: lireReponses_() });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents || "{}");
  const role = role_(d.code);
  if (!role) return reponse_({ ok: false, erreur: "code" });

  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    // --- annonces (staff seulement) ---
    if (d.action === "annonce") {
      if (role !== "coach") return reponse_({ ok: false, erreur: "réservé au staff" });
      const texte = String(d.texte || "").trim().slice(0, 2000);
      if (!texte) return reponse_({ ok: false, erreur: "annonce vide" });
      const pour = ["tous", "parents", "joueurs"].indexOf(d.pour) >= 0 ? d.pour : "tous";
      feuille_("Annonces").appendRow([Utilities.getUuid(), new Date(), String(d.auteur || "Coach").slice(0, 40), texte, pour, ""]);
      return reponse_({ ok: true, role: role, annonces: lireAnnonces_(role) });
    }
    if (d.action === "supprimer") {
      if (role !== "coach") return reponse_({ ok: false, erreur: "réservé au staff" });
      const sh = feuille_("Annonces");
      const v = sh.getDataRange().getValues();
      const i = v.findIndex((l, n) => n > 0 && String(l[0]) === String(d.id));
      if (i > 0) sh.getRange(i + 1, 6).setValue("oui");
      return reponse_({ ok: true, role: role, annonces: lireAnnonces_(role) });
    }
    // --- 👍 sur une annonce (tout le monde, une fois par personne : re-cliquer enlève) ---
    if (d.action === "reaction") {
      if (!d.annonce || !d.qui) return reponse_({ ok: false, erreur: "champs manquants" });
      const sh = feuille_("Reactions");
      const v = sh.getDataRange().getValues();
      const i = v.findIndex((l, n) => n > 0 && String(l[0]) === String(d.annonce) && String(l[1]) === String(d.qui));
      if (i > 0) sh.deleteRow(i + 1);
      else sh.appendRow([String(d.annonce), String(d.qui).slice(0, 60), new Date()]);
      return reponse_({ ok: true, role: role, annonces: lireAnnonces_(role) });
    }

    // --- covoiturage ---
    if (!d.match || !d.famille) return reponse_({ ok: false, erreur: "champs manquants" });
    if (role === "joueur" && !ligneJoueur_(d.famille)) return reponse_({ ok: false, erreur: "réservé aux parents" });
    const sh = feuille_("Reponses");
    const valeurs = sh.getDataRange().getValues();
    const i = valeurs.findIndex((l, n) => n > 0 && String(l[0]) === String(d.match) && String(l[1]) === String(d.famille));
    const avant = i > 0 ? valeurs[i] : ["", "", "", "", "", ""];
    // un joueur ne change que sa présence
    const ligne = role === "joueur"
      ? [String(d.match), String(d.famille), d.present || "", avant[3], avant[4], new Date()]
      : [String(d.match), String(d.famille), d.present || "", d.conduit || "", d.places || "", new Date()];
    if (i > 0) sh.getRange(i + 1, 1, 1, ligne.length).setValues([ligne]);
    else sh.appendRow(ligne);
    return reponse_({ ok: true, role: role, reponses: lireReponses_() });
  } finally {
    verrou.releaseLock();
  }
}
