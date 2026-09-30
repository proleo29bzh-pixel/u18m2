/**
 * Covoiturage U18M2 : stocke les réponses des familles dans ce Google Sheet.
 * À coller dans Extensions > Apps Script du Google Sheet (voir LISEZMOI.md).
 */

// Code à donner aux familles (le même que celui tapé dans l'appli). Change-le !
const CODE_EQUIPE = "CTC2026";

const FEUILLE = "Reponses";
const COLONNES = ["match", "famille", "present", "conduit", "places", "maj"];

function feuille_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(FEUILLE);
  if (!sh) {
    sh = ss.insertSheet(FEUILLE);
    sh.appendRow(COLONNES);
    sh.setFrozenRows(1);
  }
  return sh;
}

function lire_() {
  const valeurs = feuille_().getDataRange().getValues();
  return valeurs.slice(1).map((l) => ({
    match: String(l[0]), famille: String(l[1]),
    present: String(l[2] || ""), conduit: String(l[3] || ""),
    places: Number(l[4]) || null, maj: l[5] ? new Date(l[5]).toISOString() : null,
  }));
}

function reponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if ((e.parameter.code || "") !== CODE_EQUIPE) return reponse_({ ok: false, erreur: "code" });
  return reponse_({ ok: true, reponses: lire_() });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents || "{}");
  if (d.code !== CODE_EQUIPE) return reponse_({ ok: false, erreur: "code" });
  if (!d.match || !d.famille) return reponse_({ ok: false, erreur: "champs manquants" });

  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const sh = feuille_();
    const valeurs = sh.getDataRange().getValues();
    const ligne = [String(d.match), String(d.famille), d.present || "", d.conduit || "", d.places || "", new Date()];
    const i = valeurs.findIndex((l, n) => n > 0 && String(l[0]) === String(d.match) && String(l[1]) === String(d.famille));
    if (i > 0) sh.getRange(i + 1, 1, 1, ligne.length).setValues([ligne]);
    else sh.appendRow(ligne);
  } finally {
    verrou.releaseLock();
  }
  return reponse_({ ok: true, reponses: lire_() });
}
