"use strict";
/* Covoiturage : chacun choisit qui il est (sa famille, son prénom ou son nom de staff),
   répond sur SA page, et tout le monde voit le bilan.
   Utilise les globales de app.js (DATA, $, esc, icon, fmt, dayLong, isHome, opponent, salleMatch, show, renderAccueil). */

const CV = {
  reponses: [],       // [{match, famille: id de la personne, present, conduit, places}]
  charge: false,
  erreur: null,
  match: null,        // id du match affiché
  code: "",           // code en mémoire seulement (staff : redemandé à chaque ouverture)
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const cvApi = () => DATA?.covoiturage?.api || "";
const cvCode = () => CV.code || store.get("covoit-code") || "";
/** "parent" (familles + staff) ou "joueur" (seulement sa présence). */
const cvRole = () => store.get("covoit-role") === "joueur" ? "joueur" : "parent";
const cvMoi = () => store.get("covoit-moi") || "";
const PLACES = () => DATA.covoiturage?.places_defaut || 4;

/** Staff : le code n'est jamais gardé sur l'appareil, pour pouvoir passer d'un code à l'autre. */
function cvMemoriserCode() {
  if (estStaff(cvMoi())) store.set("covoit-code", "");
  else if (CV.code) store.set("covoit-code", CV.code);
}

// ------------------------------------------------------------ les personnes
// Identifiants dans le Google Sheet (colonne "famille") :
//   joueur -> "Gabin"    staff -> "Coach Léo"    parent -> "Parent:Bastien:Maman"
// Les parents sont rattachés au prénom du joueur (stable même si le nom de famille change).
// Les trajets sont comptés par famille ("Famille:Bastien") pour la rotation.

const ROLES_PARENT = ["Maman", "Papa"];
const cvJoueurs = () => DATA.joueurs || [];
// famille : membre du staff qui est aussi parent (ses trajets comptent pour sa famille) ; voiture: false = toujours passager
const cvStaff = () => (DATA.coachs || []).map((c) => ({ id: "Coach " + c.nom, nom: c.nom, role: c.role, famille: c.famille || "", voiture: c.voiture !== false, presentDefaut: !!c.present_defaut }));
const staffDe = (id) => cvStaff().find((s) => s.id === id);
const cvFamilles = () => (DATA.familles || []).map((f) => ({
  id: "Famille:" + f.enfant, nom: (f.nom || "").toUpperCase(), enfant: f.enfant,
  libelle: f.nom ? "Famille " + f.nom.toUpperCase() : "Parents de " + f.enfant,
}));
const parentId = (f, role) => `Parent:${f.enfant}:${role}`;
const cvParents = () => cvFamilles().flatMap((f) => ROLES_PARENT.map((r) => parentId(f, r)));
const familleDe = (enfant) => cvFamilles().find((f) => f.enfant === enfant);

function estStaff(id) { return id.startsWith("Coach "); }
const estParent = (id) => id.startsWith("Parent:");
const groupe = (id) => estParent(id) ? "Famille:" + id.split(":")[1]
  : staffDe(id)?.famille ? "Famille:" + staffDe(id).famille : id;
function nomDe(id) {
  if (estParent(id)) {
    const [, enfant, role] = id.split(":");
    const f = familleDe(enfant);
    return f?.nom ? `${role} ${f.nom}` : `${role} de ${enfant}`;
  }
  if (id.startsWith("Famille:")) return familleDe(id.slice(8))?.libelle || id.slice(8);
  return estStaff(id) ? id.slice(6) : id;
}

// ------------------------------------------------------------ données (Google Sheet ou démo locale)

async function cvCharger() {
  if (!cvApi()) {
    CV.reponses = JSON.parse(store.get("covoit-demo") || "[]");
    CV.charge = true;
    return;
  }
  if (!cvCode()) { CV.charge = true; return; }
  try {
    const res = await fetch(cvApi() + "?code=" + encodeURIComponent(cvCode()));
    const j = await res.json();
    if (!j.ok) { CV.erreur = j.erreur === "code" ? "Code incorrect." : j.erreur; cvDeconnecter(); }
    else { CV.reponses = j.reponses; CV.erreur = null; store.set("covoit-role", j.role || "parent"); }
  } catch {
    CV.erreur = "Impossible de joindre le serveur du covoiturage.";
  }
  CV.charge = true;
}

function cvDeconnecter() {
  CV.code = "";
  if (typeof ENTR !== "undefined") { ENTR.coach = false; ENTR.pour = ""; }
  store.set("covoit-code", ""); store.set("covoit-role", ""); store.set("covoit-moi", "");
  CV.reponses = [];
}

async function cvEnregistrer(match, qui, champs) {
  let r = CV.reponses.find((x) => x.match === match && x.famille === qui);
  if (!r) { r = { match, famille: qui, present: "", conduit: "", places: null }; CV.reponses.push(r); }
  Object.assign(r, champs);
  if (r.conduit === "oui" && !r.places) r.places = PLACES();
  renderCovoit();

  if (!cvApi()) { store.set("covoit-demo", JSON.stringify(CV.reponses)); return; }
  try {
    // text/plain : pas de pré-requête CORS avec Google Apps Script
    const res = await fetch(cvApi(), { method: "POST", body: JSON.stringify({ code: cvCode(), ...r }) });
    const j = await res.json();
    if (j.ok) { CV.reponses = j.reponses; CV.erreur = null; }
    else CV.erreur = "Réponse refusée : " + j.erreur;
  } catch {
    CV.erreur = "Pas de réseau : la réponse n'est pas enregistrée.";
  }
  renderCovoit();
}

// ------------------------------------------------------------ calcul

function cvMatchs() {
  const dom = DATA.covoiturage?.matchs_domicile;
  return DATA.rencontres.filter((r) => r.nous && (dom || !isHome(r)));
}

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

/** Pour chaque match, dans l'ordre de la saison :
    - passagers : joueurs présents (sans réponse = présent), staff présent sans voiture
      (aucun staff annoncé = 1 place gardée), parents qui viennent sans voiture ;
    - voitures sûres : staff présent qui conduit, parents qui viennent au match avec leur voiture ;
    - s'il manque des places, les parents qui peuvent conduire (sans venir d'eux-mêmes) sont
      désignés à tour de rôle : la famille qui a le moins conduit d'abord. */
function cvRepartition() {
  // le tableau des trajets : les familles + le staff qui a une voiture et n'est pas déjà compté avec sa famille
  const groupes = [...cvFamilles().map((f) => f.id), ...cvStaff().filter((s) => s.voiture && !s.famille).map((s) => s.id)];
  const trajets = Object.fromEntries(groupes.map((g) => [g, { faits: 0, prevus: 0, dernier: -1 }]));
  const T = (id) => trajets[groupe(id)];
  const res = {};
  const auj = new Date(); auj.setHours(0, 0, 0, 0);

  cvMatchs().forEach((m, idx) => {
    const rep = Object.fromEntries(CV.reponses.filter((x) => x.match === m.id).map((x) => [x.famille, x]));
    const R = (id) => rep[id] || {};
    const nb = (id) => R(id).places || PLACES();

    const joueursPresents = cvJoueurs().filter((j) => R(j).present !== "non");
    const staffIds = cvStaff().map((s) => s.id);
    // présent s'il le dit (ou s'il conduit) ; le coach principal est compté présent sauf s'il répond « absent »
    const staffPresents = staffIds.filter((s) => R(s).present === "oui" || (R(s).conduit === "oui" && R(s).present !== "non")
      || (staffDe(s)?.presentDefaut && R(s).present !== "non"));
    const staffAbsents = staffIds.filter((s) => R(s).present === "non");
    const placeCoach = !staffPresents.length && staffAbsents.length < staffIds.length ? (DATA.covoiturage?.places_coach_defaut ?? 1) : 0;
    const staffConduit = staffPresents.filter((s) => R(s).conduit === "oui" && staffDe(s)?.voiture);
    const parentsVoiture = cvParents().filter((p) => R(p).present === "oui" && R(p).conduit === "oui");
    const parentsPassagers = cvParents().filter((p) => R(p).present === "oui" && R(p).conduit !== "oui");

    const surs = [...staffConduit, ...parentsVoiture];
    const besoin = joueursPresents.length + (staffPresents.length - staffConduit.length) + placeCoach + parentsPassagers.length;
    let places = surs.reduce((t, id) => t + nb(id), 0);

    const dispo = cvParents()
      .filter((p) => R(p).conduit === "oui" && R(p).present !== "oui" && R(p).present !== "non")
      .sort((a, b) => T(a).faits + T(a).prevus - (T(b).faits + T(b).prevus)
        || T(a).dernier - T(b).dernier || hash(m.id + a) - hash(m.id + b));
    const designes = [];
    for (const id of dispo) {
      if (places >= besoin) break;
      if (designes.some((d) => groupe(d) === groupe(id))) continue;  // un conducteur désigné par famille
      designes.push(id);
      places += nb(id);
    }

    const passe = new Date(m.date + "T00:00") < auj;
    // trajets saisis à la main (déplacements faits avant l'appli) : infos.json → covoiturage.trajets_faits[id du match]
    const manuels = (DATA.covoiturage?.trajets_faits || {})[m.id];
    const conducteurs = Array.isArray(manuels) ? manuels : [...surs, ...designes];
    const vues = new Set();
    for (const id of conducteurs) {
      if (!T(id) || vues.has(groupe(id))) continue;     // 1 trajet par famille et par match
      vues.add(groupe(id));
      T(id)[passe ? "faits" : "prevus"]++;
      T(id).dernier = idx;
    }

    res[m.id] = {
      rep, passe, besoin, places, conducteurs, designes,
      voitures: conducteurs.length,
      reserve: dispo.filter((id) => !designes.includes(id)),
      joueursPresents, staffPresents, staffConduit, placeCoach, parentsVoiture, parentsPassagers,
    };
  });
  return { parMatch: res, trajets };
}

// ------------------------------------------------------------ rendu : petits morceaux

const pl = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
/** Objectif de trajets par famille sur la saison (infos.json → covoiturage.objectif_trajets). */
const OBJ = () => DATA.covoiturage?.objectif_trajets || 2;
/** « 2/2 ✅ » atteint (trajets faits) · « 2/2 🕓 » atteint en comptant les trajets prévus · sinon « 1/2 ». */
/** Couleur de la ligne : vert objectif atteint, orange en cours, rien (bleu) à zéro. */
const couleurObjectif = (t) => (t.faits + t.prevus >= OBJ() ? "obj-ok" : t.faits + t.prevus > 0 ? "obj-encours" : "");
const objectifTxt = (t) => {
  const n = t.faits + t.prevus;
  return `${n}/${OBJ()}` + (t.faits >= OBJ() ? " ✅" : n >= OBJ() ? " 🕓" : "");
};
function chip(txt, cls = "") { return `<span class="cchip ${cls}">${esc(txt)}</span>`; }

/** Bouton de réponse : `champs` est appliqué ; re-cliquer sur le choix actif l'annule. */
function cvBtn(m, a, qui, champs, label, cls) {
  const r = a.rep[qui] || {};
  const actif = Object.entries(champs).every(([k, v]) => (r[k] || "") === v);
  return `<button class="seg ${actif ? "on " + cls : ""}" data-cv="${esc(m.id)}" data-qui="${esc(qui)}"
    data-set='${esc(JSON.stringify(champs))}' ${a.passe ? "disabled" : ""}>${label}</button>`;
}

function cvStepper(m, a, qui, label) {
  const r = a.rep[qui] || {};
  return `<div class="stepper"><span class="k">${label}</span>
    <div><button data-cvplaces="${esc(m.id)}" data-qui="${esc(qui)}" data-d="-1" ${a.passe ? "disabled" : ""}>−</button><b>${r.places || PLACES()}</b><button data-cvplaces="${esc(m.id)}" data-qui="${esc(qui)}" data-d="1" ${a.passe ? "disabled" : ""}>+</button></div></div>`;
}

const question = (titre, boutons, extra = "") =>
  `<div class="cvq"><div class="k">${titre}</div><div class="segs">${boutons.join("")}</div>${extra}</div>`;

/** Résumé de la réponse d'un parent, pour l'encadré du haut. */
function etatParent(a, id) {
  const r = a.rep[id] || {};
  const vient = r.present === "oui" ? "vient au match" : r.present === "non" ? "ne vient pas" : "";
  const conduit = r.conduit === "oui" ? `peut conduire (${pl(r.places || PLACES(), "place")})` : r.conduit === "non" ? "ne conduit pas" : "";
  const txt = [conduit, vient].filter(Boolean).join(", ");
  const desig = a.designes.includes(id) ? " — 🚗 désigné(e) pour conduire" : a.reserve.includes(id) ? " — en réserve" : "";
  return txt ? txt + desig : "pas encore répondu";
}

// ------------------------------------------------------------ rendu : "ma page"

function pageFamille(m, a, f, trajets) {
  const t = trajets[f.id];
  const recap = ROLES_PARENT.map((role) => `<div><b>${role}</b> : ${esc(etatParent(a, parentId(f, role)))}</div>`).join("");
  return `
  <div class="recap">${recap}</div>
  <p class="small muted">${f.nom ? esc(f.enfant) + " · " : ""}${pl(t.faits + t.prevus, "trajet")} cette saison sur un objectif de ${OBJ()}${t.faits >= OBJ() ? " ✅ Merci !" : "."} Si vous pouvez conduire sans venir voir le match, l'appli vous désigne seulement si besoin, à tour de rôle entre les familles.</p>
  ${ROLES_PARENT.map((role) => {
    const id = parentId(f, role);
    const r = a.rep[id] || {};
    return `<div class="card">
      <h3>${role === "Maman" ? "👩" : "👨"} ${role}</h3>
      ${question("Pouvez-vous conduire ?", [
        cvBtn(m, a, id, { conduit: "oui" }, "🚗 Oui", "g"),
        cvBtn(m, a, id, { conduit: "non" }, "Non", "r"),
      ], r.conduit === "oui" ? cvStepper(m, a, id, "Places passagers") : "")}
      ${question("Venez-vous voir le match ?", [
        cvBtn(m, a, id, { present: "oui" }, "📣 Oui", "g"),
        cvBtn(m, a, id, { present: "non" }, "Non", "r"),
      ])}
    </div>`;
  }).join("")}`;
}

function pageJoueur(m, a, j) {
  const r = a.rep[j] || {};
  const etat = r.present === "oui" ? "✅ Présent" : r.present === "non" ? "❌ Absent" : "Pas encore répondu (compté présent)";
  return `
  <div class="recap ${r.present === "oui" ? "ok" : r.present === "non" ? "ko" : ""}"><div><b>${esc(j)}</b> : ${etat}</div></div>
  <div class="card">${question("Tu seras là ?", [
    cvBtn(m, a, j, { present: "oui" }, "✅ Présent", "g"),
    cvBtn(m, a, j, { present: "non" }, "❌ Absent", "r"),
  ])}</div>`;
}

function pageStaff(m, a, s) {
  const r = a.rep[s.id] || {};
  const etat = [
    r.present === "oui" ? "✅ Présent(e)" : r.present === "non" ? "❌ Absent(e)" : "",
    r.present !== "non" && r.conduit === "oui" ? `conduit (${pl(r.places || PLACES(), "place")})` : r.conduit === "non" ? "passager" : "",
  ].filter(Boolean).join(", ") || (s.presentDefaut ? "✅ Compté présent par défaut (répondez « Absent » si vous ne venez pas)" : "Pas encore répondu");
  return `
  <div class="recap ${r.present === "oui" ? "ok" : r.present === "non" ? "ko" : ""}"><div><b>${esc(s.nom)}</b> (${esc(s.role)}) : ${etat}</div></div>
  <div class="card">
    ${question("Présent(e) au match ?", [
      cvBtn(m, a, s.id, { present: "oui" }, "✅ Présent(e)", "g"),
      cvBtn(m, a, s.id, { present: "non", conduit: "" }, "❌ Absent(e)", "r"),
    ])}
    ${!s.voiture ? `<p class="small muted" style="margin:8px 0 0">Vous êtes comptée comme passagère.</p>` : ""}
    ${r.present !== "non" && s.voiture ? question("Vous prenez votre voiture ?", [
      cvBtn(m, a, s.id, { conduit: "oui" }, "🚗 Oui", "g"),
      cvBtn(m, a, s.id, { conduit: "non" }, "Passager", "r"),
    ], r.conduit === "oui" ? cvStepper(m, a, s.id, "Places passagers") : "") : ""}
  </div>`;
}

// ------------------------------------------------------------ rendu : bilan

function pageBilan(m, a, trajets) {
  const ok = a.places >= a.besoin;
  const R = (id) => a.rep[id] || {};
  const staffPassagers = a.staffPresents.length - a.staffConduit.length + a.placeCoach;
  const voiture = (id, type) => `<div class="row"><div class="ico">${icon.car}</div><div><div class="v">${esc(nomDe(id))}</div><div class="small muted">${type} · ${pl(R(id).places || PLACES(), "place")}</div></div></div>`;
  const presentsDits = cvJoueurs().filter((j) => R(j).present === "oui");
  const absents = cvJoueurs().filter((j) => R(j).present === "non");
  const sansRepJ = cvJoueurs().filter((j) => !R(j).present);
  const famillesSansRep = cvFamilles().filter((f) => ROLES_PARENT.every((r) => { const x = R(parentId(f, r)); return !x.conduit && !x.present; }));
  const etatStaff = (r, s) => r.present === "oui" || (r.conduit === "oui" && r.present !== "non")
    ? "Présent(e) · " + (r.conduit === "oui" ? "conduit" : "passager") : r.present === "non" ? "Absent(e)" : s.presentDefaut ? "Présent (par défaut) · passager" : "Pas encore répondu";

  return `
  <div class="bilan-grid">
    <div class="stat"><b>${a.besoin}</b><span>passagers</span></div>
    <div class="stat"><b>${a.voitures}</b><span>voiture${a.voitures > 1 ? "s" : ""}</span></div>
    <div class="stat ${ok ? "ok" : "ko"}"><b>${a.places}</b><span>places</span></div>
  </div>
  <div class="cvbilan ${ok ? "ok" : "ko"}">
    <div>${pl(a.joueursPresents.length, "joueur")}${staffPassagers ? ` + ${staffPassagers} staff` : ""}${a.parentsPassagers.length ? ` + ${pl(a.parentsPassagers.length, "parent")}` : ""}${a.placeCoach ? " (place gardée pour un coach)" : ""}</div>
    <div>${ok ? "C'est bon ✅" : a.voitures ? `Il manque ${pl(a.besoin - a.places, "place")}` : "Aucun conducteur pour l'instant"}</div>
  </div>
  ${ok && a.places > a.besoin ? `<p class="small muted" style="margin:6px 4px 0">🪑 ${a.places - a.besoin} place${a.places - a.besoin > 1 ? "s libres" : " libre"} pour un accompagnateur en plus.</p>` : ""}

  <div class="card">
    <h3>Voitures</h3>
    ${a.voitures ? [
      ...a.staffConduit.map((id) => voiture(id, "Staff")),
      ...a.parentsVoiture.map((id) => voiture(id, "Vient au match")),
      ...a.designes.map((id) => voiture(id, "Désigné(e) pour conduire")),
    ].join("") : `<p class="small muted" style="margin:0">Personne ne s'est encore proposé pour conduire.</p>`}
    ${a.reserve.length ? `<div class="cvl"><div class="k">En réserve si besoin</div>${a.reserve.map((id) => chip(nomDe(id))).join("")}</div>` : ""}
  </div>

  <div class="card">
    <h3>Joueurs</h3>
    <div class="cvl" style="padding-top:0"><div class="k">Présents (${presentsDits.length})</div>${presentsDits.map((j) => chip(j, "ok")).join("") || '<span class="small muted">—</span>'}</div>
    ${absents.length ? `<div class="cvl"><div class="k">Absents (${absents.length})</div>${absents.map((j) => chip(j, "abs")).join("")}</div>` : ""}
    ${sansRepJ.length ? `<div class="cvl"><div class="k">Pas encore répondu (${sansRepJ.length}) — comptés présents</div>${sansRepJ.map((j) => chip(j, "wait")).join("")}</div>` : ""}
  </div>

  <div class="card">
    <h3>Staff</h3>
    ${cvStaff().map((s) => `<div class="row"><div class="ico">${icon.whistle}</div><div><div class="v">${esc(s.nom)}</div><div class="small muted">${etatStaff(R(s.id), s)}</div></div></div>`).join("")}
    ${a.placeCoach ? `<p class="small muted" style="margin:6px 0 0">Une place est gardée pour un coach tant que personne du staff n'a répondu.</p>` : ""}
  </div>

  ${a.parentsVoiture.length || a.parentsPassagers.length ? `<div class="card"><h3>Parents qui viennent au match</h3>
    ${a.parentsVoiture.map((id) => chip("🚗 " + nomDe(id), "ok")).join("")}${a.parentsPassagers.map((id) => chip("🙋 " + nomDe(id) + " (cherche une place)")).join("")}</div>` : ""}

  ${!a.passe && famillesSansRep.length ? `<div class="card"><h3>Familles qui n'ont pas répondu</h3>${famillesSansRep.map((f) => chip(f.libelle, "wait")).join("")}</div>` : ""}

  <h2 class="section">Trajets par famille</h2>
  <p class="small muted" style="margin:0 4px 8px">🎯 Objectif ${esc(DATA.covoiturage?.objectif_periode || "de la saison")} : <b>${OBJ()} trajet${OBJ() > 1 ? "s" : ""} par famille</b>, pour que ce ne soient pas toujours les mêmes qui conduisent.</p>
  <div class="card" style="padding:6px 10px">
    <table class="standings">
      <thead><tr><th class="t">Conducteur</th><th>Faits</th><th>Prévus</th><th>Objectif</th></tr></thead>
      <tbody>${Object.entries(trajets).sort(([x, t1], [y, t2]) => estStaff(x) - estStaff(y) || t2.faits + t2.prevus - (t1.faits + t1.prevus) || nomDe(x).localeCompare(nomDe(y)))
        .map(([id, t]) => `<tr class="${groupe(cvMoi() || "") === id ? "us" : ""} ${estStaff(id) ? "" : couleurObjectif(t)}"><td class="t">${esc(nomDe(id))}${estStaff(id) ? ' <span class="muted small">(staff)</span>' : ""}</td><td>${t.faits}</td><td>${t.prevus}</td>
          <td>${estStaff(id) ? "—" : objectifTxt(t)}</td></tr>`).join("")}</tbody>
    </table>
  </div>`;
}

// ------------------------------------------------------------ rendu principal

/** Choix possibles dans le menu « Qui êtes-vous ? » selon le code. */
function cvChoix() {
  const joueurs = `<optgroup label="Joueurs">${cvJoueurs().map((j) => `<option value="${esc(j)}">${esc(j)}</option>`).join("")}</optgroup>`;
  const familles = `<optgroup label="Familles">${cvFamilles().map((f) => `<option value="${esc(f.id)}">${esc(f.libelle)}</option>`).join("")}</optgroup>`;
  const staff = `<optgroup label="Staff">${cvStaff().map((s) => `<option value="${esc(s.id)}">${esc(s.nom)} (${esc(s.role)})</option>`).join("")}</optgroup>`;
  if (!cvApi()) return familles + staff + joueurs;        // démo : tout
  return cvRole() === "joueur" ? joueurs : familles + staff;
}

function moiValide(moi) {
  if (!moi) return false;
  const demo = !cvApi();
  if (moi.startsWith("Famille:")) return (demo || cvRole() === "parent") && !!familleDe(moi.slice(8));
  if (estStaff(moi)) return (demo || cvRole() === "parent") && cvStaff().some((s) => s.id === moi);
  return (demo || cvRole() === "joueur") && cvJoueurs().includes(moi);
}

function renderCovoit() {
  const el = $("#view-covoit");
  if (!el || !DATA) return;
  const besoinCode = cvApi() && !cvCode();
  let html = `<h2 class="section">Covoiturage</h2>`;

  if (besoinCode || CV.erreur || !cvApi()) {
    html += `<div class="card">
      ${besoinCode ? `<h3>Code</h3><p class="small muted" style="margin-top:0">Parents et joueurs ont chacun leur code, donné par le coach.</p><div class="cvcode"><input id="cv-code" type="text" autocomplete="off" placeholder="Code"><button class="btn primary" id="cv-code-ok">OK</button></div>` : ""}
      ${!cvApi() ? `<div class="note">Mode démo : les réponses restent sur cet appareil.</div>` : ""}
      ${CV.erreur ? `<div class="note">⚠️ ${esc(CV.erreur)}</div>` : ""}
    </div>`;
  }
  if (besoinCode) { el.innerHTML = html; return; }
  if (!CV.charge) { el.innerHTML = html + `<div class="empty">Chargement…</div>`; return; }

  const moi = moiValide(cvMoi()) ? cvMoi() : "";
  html += `<div class="card qui">
    <h3>Qui êtes-vous ?</h3>
    <select id="cv-moi" class="cvselect"><option value="">${cvRole() === "joueur" && cvApi() ? "Choisis ton prénom…" : "Choisir…"}</option>${cvChoix()}</select>
  </div>`;

  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const avenir = cvMatchs().filter((m) => new Date(m.date + "T00:00") >= auj);
  if (!avenir.length) { el.innerHTML = html + `<div class="empty">Pas de déplacement à venir.</div>`; return selectMoi(moi); }
  if (!avenir.some((m) => m.id === CV.match)) CV.match = avenir[0].id;
  const m = avenir.find((x) => x.id === CV.match);
  const { parMatch, trajets } = cvRepartition();
  const a = parMatch[m.id];
  const page = store.get("covoit-page") === "bilan" || !moi ? "bilan" : "moi";

  html += `<div class="mchips">${avenir.map((x) => `<button class="mchip ${x.id === m.id ? "on" : ""}" data-cvmatch="${esc(x.id)}">
      <b>${fmt(x, { day: "numeric", month: "short" }).replace(".", "")}</b><span>${esc(opponent(x).nom)}</span></button>`).join("")}</div>
    <div class="card mhead">
      <div class="opp">${isHome(m) ? "vs" : "@"} ${esc(opponent(m).nom)}</div>
      <div class="small muted">${esc(dayLong(m))}${m.heure ? " · " + m.heure.replace(":", "h") : ""} · ${esc(salleMatch(m).adresse || salleMatch(m).nom || "")}</div>
    </div>
    <div class="subtabs deux">
      <button class="${page === "moi" ? "on" : ""}" data-cvpage="moi" ${moi ? "" : "disabled"}>Ma réponse</button>
      <button class="${page === "bilan" ? "on" : ""}" data-cvpage="bilan">Bilan</button>
    </div>
    ${moi ? "" : `<p class="small muted" style="margin:6px 4px 0">Choisissez qui vous êtes en haut pour répondre.</p>`}`;

  if (page === "bilan") html += pageBilan(m, a, trajets);
  else if (moi.startsWith("Famille:")) html += pageFamille(m, a, familleDe(moi.slice(8)), trajets);
  else if (estStaff(moi)) html += pageStaff(m, a, cvStaff().find((s) => s.id === moi));
  else html += pageJoueur(m, a, moi);

  if (cvApi()) html += `<p class="foot"><a href="#" id="cv-logout">Changer de code</a> · connecté en ${typeof ENTR !== "undefined" && ENTR.coach ? "coach 🔑" : cvRole() === "joueur" ? "joueur" : "parent / staff"}${estStaff(moi) ? " · code redemandé à chaque ouverture (staff)" : ""}</p>`;
  el.innerHTML = html;
  selectMoi(moi);
}

function selectMoi(moi) {
  const sel = $("#cv-moi");
  if (sel) sel.value = moi;
}

/** Petit résumé covoit dans la fiche d'un match (onglet Prochain). */
function covoitResume(m) {
  if (!cvMatchs().some((x) => x.id === m.id) || (cvApi() && !cvCode()) || !CV.charge) return "";
  const a = cvRepartition().parMatch[m.id];
  if (!a) return "";
  const noms = a.conducteurs.map(nomDe);
  return `<div class="row"><div class="ico">${icon.car}</div><div>
    <div class="k">Covoiturage</div>
    <div class="v">${noms.length ? esc(noms.join(", ")) : '<span class="tbd">aucun conducteur pour l\'instant</span>'}</div>
    <div class="small">${a.places}/${a.besoin} places · <a href="#" data-goto="covoit">répondre</a></div>
  </div></div>`;
}

// ------------------------------------------------------------ événements

// Staff : à l'ouverture de l'appli, le code n'est pas repris.
if (estStaff(cvMoi())) store.set("covoit-code", "");

document.addEventListener("change", (e) => {
  if (e.target.id === "cv-moi") {
    store.set("covoit-moi", e.target.value);
    store.set("covoit-page", e.target.value ? "moi" : "bilan");
    cvMemoriserCode();
    renderCovoit();
  }
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-set]");
  if (b) {
    const champs = JSON.parse(b.dataset.set);
    const r = CV.reponses.find((x) => x.match === b.dataset.cv && x.famille === b.dataset.qui) || {};
    const actif = Object.entries(champs).every(([k, v]) => (r[k] || "") === v);
    // re-cliquer sur le choix actif l'annule
    return cvEnregistrer(b.dataset.cv, b.dataset.qui, actif ? Object.fromEntries(Object.keys(champs).map((k) => [k, ""])) : champs);
  }
  const p = e.target.closest("[data-cvplaces]");
  if (p) {
    const r = CV.reponses.find((x) => x.match === p.dataset.cvplaces && x.famille === p.dataset.qui) || {};
    const n = Math.max(1, Math.min(8, (r.places || PLACES()) + Number(p.dataset.d)));
    return cvEnregistrer(p.dataset.cvplaces, p.dataset.qui, { places: n });
  }
  const mc = e.target.closest("[data-cvmatch]");
  if (mc) { CV.match = mc.dataset.cvmatch; return renderCovoit(); }
  const pg = e.target.closest("[data-cvpage]");
  if (pg && !pg.disabled) { store.set("covoit-page", pg.dataset.cvpage); return renderCovoit(); }
  const g = e.target.closest("[data-goto]");
  if (g) { e.preventDefault(); if ($(".sheet.open")) history.back(); return show(g.dataset.goto); }
  if (e.target.id === "cv-logout") {
    e.preventDefault();
    cvDeconnecter(); CV.erreur = null;
    return renderCovoit();
  }
  if (e.target.id === "cv-code-ok") {
    const v = $("#cv-code").value.trim();
    if (!v) return;
    e.target.disabled = true; e.target.textContent = "…";
    // même connexion que les onglets Entraînement et Maillots : reconnaît aussi le mot de passe coach
    if (typeof connexionCode === "function") return connexionCode(v);
    CV.code = v;
    cvMemoriserCode();
    CV.charge = false; renderCovoit();
    await cvCharger(); renderCovoit(); renderAccueil();
  }
});
