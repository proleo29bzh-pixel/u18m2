/**
 * Appli U18M2 : réponses (covoiturage, présences, maillots) stockées dans ce Google Sheet.
 * À coller dans Extensions > Apps Script du Google Sheet (voir LISEZMOI.md).
 *
 * Deux codes :
 *  - CODE_PARENTS : parents, staff -> accès à toutes les pages du covoit
 *  - CODE_JOUEURS : joueurs -> peuvent seulement dire s'ils sont présents
 * Tape tes vrais codes ICI, dans Google uniquement (jamais sur GitHub : le dépôt est public).
 */
const CODE_PARENTS = "A_CHANGER_PARENTS";
const CODE_JOUEURS = "A_CHANGER_JOUEURS";

const FEUILLE = "Reponses";
// Colonnes A à F : utilisées par l'appli (ne pas modifier). Colonnes G à J : la même chose en clair, pour lire le tableau.
const ENTETES = [
  "⚙️ match (code appli)", "⚙️ personne (code appli)", "⚙️ présent", "⚙️ conduit", "⚙️ places", "⚙️ mis à jour le",
  "📅 Date", "🏀 Match / séance", "👤 Qui", "📝 Réponse en clair",
];

function role_(code) {
  if (code && code === CODE_PARENTS) return "parent";
  if (code && code === CODE_JOUEURS) return "joueur";
  return null;
}

/** Un joueur ne peut répondre que sur une ligne joueur (pas parent ou staff). */
function ligneJoueur_(famille) {
  return !/^(Parent:|Ultra:|Coach )/.test(String(famille));
}

function feuille_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(FEUILLE);
  if (!sh) sh = ss.insertSheet(FEUILLE);
  // titres toujours à jour + mise en forme légère
  sh.getRange(1, 1, 1, ENTETES.length).setValues([ENTETES]).setFontWeight("bold");
  sh.getRange(1, 1, 1, 6).setBackground("#e5e7eb").setFontColor("#6b7280");
  sh.getRange(1, 7, 1, 4).setBackground("#0b1f4d").setFontColor("#ffffff");
  sh.setFrozenRows(1);
  return sh;
}

function lire_() {
  const valeurs = feuille_().getDataRange().getValues();
  return valeurs.slice(1).filter((l) => l[0] !== "").map((l) => ({
    match: String(l[0]), famille: String(l[1]),
    present: String(l[2] || ""), conduit: String(l[3] || ""),
    places: Number(l[4]) || null, maj: l[5] ? new Date(l[5]).toISOString() : null,
  }));
}

function reponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // aperçu public en lecture seule (sans code) : réponses sans les dates de modification, aucune écriture possible
  if (e.parameter.action === "apercu") {
    return reponse_({ ok: true, reponses: lire_().map((r) => ({ match: r.match, famille: r.famille, present: r.present, conduit: r.conduit, places: r.places })) });
  }
  const role = role_(e.parameter.code || "");
  if (!role) return reponse_({ ok: false, erreur: "code" });
  return reponse_({ ok: true, role: role, reponses: lire_() });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents || "{}");
  const role = role_(d.code);
  if (!role) return reponse_({ ok: false, erreur: "code" });
  if (!d.match || !d.famille) return reponse_({ ok: false, erreur: "champs manquants" });
  if (role === "joueur" && !ligneJoueur_(d.famille)) return reponse_({ ok: false, erreur: "réservé aux parents" });

  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const sh = feuille_();
    const valeurs = sh.getDataRange().getValues();
    const i = valeurs.findIndex((l, n) => n > 0 && String(l[0]) === String(d.match) && String(l[1]) === String(d.famille));
    const avant = i > 0 ? valeurs[i] : ["", "", "", "", "", ""];
    const clair = [String(d.date_txt || ""), String(d.match_txt || ""), String(d.qui_txt || ""), String(d.clair || "")];
    // un joueur ne change que sa présence
    const ligne = role === "joueur"
      ? [String(d.match), String(d.famille), d.present || "", avant[3], avant[4], new Date(), ...clair]
      : [String(d.match), String(d.famille), d.present || "", d.conduit || "", d.places || "", new Date(), ...clair];
    if (i > 0) sh.getRange(i + 1, 1, 1, ligne.length).setValues([ligne]);
    else sh.appendRow(ligne);
  } finally {
    verrou.releaseLock();
  }
  return reponse_({ ok: true, role: role, reponses: lire_() });
}
