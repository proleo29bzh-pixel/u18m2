"use strict";
/* Covoiturage en 4 pages (Parents, Joueurs, Staff, Ultras) + un bilan.
   Chacun répond sur la ligne à son prénom ; l'appli calcule le minimum de voitures
   et désigne les conducteurs à tour de rôle.
   Utilise les globales de app.js (DATA, $, esc, icon, fmt, dayLong, isHome, opponent, salleMatch). */

const CV = {
  reponses: [],       // [{match, famille: id de la personne, present, conduit, places}]
  charge: false,
  erreur: null,
  match: null,        // id du match affiché
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const cvApi = () => DATA?.covoiturage?.api || "";
const cvCode = () => store.get("covoit-code") || "";
/** "parent" (parents, staff, ultras : tout le covoit) ou "joueur" (seulement sa présence). */
const cvRole = () => store.get("covoit-role") === "joueur" ? "joueur" : "parent";
const PLACES = () => DATA.covoiturage?.places_defaut || 4;

// ------------------------------------------------------------ les personnes
// Identifiants stockés dans le Google Sheet (colonne "famille") :
//   joueur  -> "Gabin"            staff -> "Coach Léo"
//   parent  -> "Parent:Guillou:Maman"    ultra -> "Ultra:Jean"
// Les trajets sont comptés par famille ("Famille:Guillou") pour la rotation.

const cvJoueurs = () => DATA.joueurs || [];
const cvStaff = () => (DATA.coachs || []).map((c) => ({ id: "Coach " + c.nom, nom: c.nom, role: c.role }));
const cvFamilles = () => (DATA.familles || []).map((f) => ({ id: "Famille:" + f.nom, nom: f.nom, enfant: f.enfant }));
const ROLES_PARENT = ["Maman", "Papa"];
const cvParents = () => cvFamilles().flatMap((f) => ROLES_PARENT.map((r) => ({ id: `Parent:${f.nom}:${r}`, famille: f, role: r })));
const cvUltras = () => (DATA.ultras || []).map((u) => ({ id: "Ultra:" + u, nom: u }));

const estStaff = (id) => id.startsWith("Coach ");
/** Qui compte pour la rotation : la famille pour un parent, la personne pour le staff. */
const groupe = (id) => id.startsWith("Parent:") ? "Famille:" + id.split(":")[1] : id;
function nomDe(id) {
  if (id.startsWith("Parent:")) { const [, fam, role] = id.split(":"); return `${role} ${fam}`; }
  if (id.startsWith("Famille:")) return "Famille " + id.slice(8);
  if (id.startsWith("Ultra:")) return id.slice(6);
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
    if (!j.ok) { CV.erreur = j.erreur === "code" ? "Code incorrect." : j.erreur; store.set("covoit-code", ""); store.set("covoit-role", ""); }
    else { CV.reponses = j.reponses; CV.erreur = null; store.set("covoit-role", j.role || "parent"); }
  } catch {
    CV.erreur = "Impossible de joindre le serveur du covoiturage.";
  }
  CV.charge = true;
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
    - à transporter : joueurs présents (sans réponse = présent) + staff présent
      (aucun staff annoncé = 1 place gardée) + ultras qui cherchent une place ;
    - les ultras qui viennent avec leur voiture apportent leurs places ;
    - puis parents et staff dispo sont désignés à tour de rôle (le moins de trajets d'abord)
      jusqu'à avoir assez de places. Un membre du staff au volant n'a pas besoin de place passager. */
function cvRepartition() {
  const conducteurs = [...cvParents().map((p) => p.id), ...cvStaff().map((s) => s.id)];
  const groupes = [...cvFamilles().map((f) => f.id), ...cvStaff().map((s) => s.id)];
  const trajets = Object.fromEntries(groupes.map((g) => [g, { faits: 0, prevus: 0, dernier: -1 }]));
  const T = (id) => trajets[groupe(id)];
  const res = {};
  const auj = new Date(); auj.setHours(0, 0, 0, 0);

  cvMatchs().forEach((m, idx) => {
    const rep = Object.fromEntries(CV.reponses.filter((x) => x.match === m.id).map((x) => [x.famille, x]));
    const R = (id) => rep[id] || {};

    const joueursPresents = cvJoueurs().filter((j) => R(j).present !== "non");
    const joueursAbsents = cvJoueurs().filter((j) => R(j).present === "non");
    const staffIds = cvStaff().map((s) => s.id);
    const staffPresents = staffIds.filter((s) => R(s).present === "oui" || (R(s).conduit === "oui" && R(s).present !== "non"));
    const staffAbsents = staffIds.filter((s) => R(s).present === "non");
    const placeCoach = !staffPresents.length && staffAbsents.length < staffIds.length ? (DATA.covoiturage?.places_coach_defaut ?? 1) : 0;
    const ultrasVoiture = cvUltras().map((u) => u.id).filter((u) => R(u).present === "oui" && R(u).conduit === "oui");
    const ultrasPlace = cvUltras().map((u) => u.id).filter((u) => R(u).present === "oui" && R(u).conduit !== "oui");

    const passagers = joueursPresents.length + staffPresents.length + placeCoach + ultrasPlace.length;
    const besoinAvec = (ch) => passagers - ch.filter(estStaff).length;

    const dispo = conducteurs
      .filter((id) => R(id).conduit === "oui" && R(id).present !== "non")
      .sort((a, b) => T(a).faits + T(a).prevus - (T(b).faits + T(b).prevus)
        || T(a).dernier - T(b).dernier || hash(m.id + a) - hash(m.id + b));

    let places = ultrasVoiture.reduce((t, u) => t + (R(u).places || PLACES()), 0);
    const chauffeurs = [];
    for (const id of dispo) {
      if (places >= besoinAvec(chauffeurs)) break;
      chauffeurs.push(id);
      places += R(id).places || PLACES();
    }
    const besoin = besoinAvec(chauffeurs);
    const passe = new Date(m.date + "T00:00") < auj;
    for (const id of chauffeurs) {
      T(id)[passe ? "faits" : "prevus"]++;
      T(id).dernier = idx;
    }

    res[m.id] = {
      rep, passe, besoin, places,
      voitures: chauffeurs.length + ultrasVoiture.length,
      chauffeurs, ultrasVoiture, reserve: dispo.filter((id) => !chauffeurs.includes(id)),
      joueursPresents, joueursAbsents, staffPresents, placeCoach, ultrasPlace,
      staffPassagers: staffPresents.filter((s) => !chauffeurs.includes(s)).length + placeCoach,
      sansReponse: {
        parents: cvFamilles().filter((f) => ROLES_PARENT.every((r) => !R(`Parent:${f.nom}:${r}`).conduit)).length,
        joueurs: cvJoueurs().filter((j) => !R(j).present).length,
        staff: staffIds.filter((s) => !R(s).present && !R(s).conduit).length,
        ultras: cvUltras().filter((u) => !R(u.id).present).length,
      },
    };
  });
  return { parMatch: res, trajets };
}

// ------------------------------------------------------------ rendu

const PAGES = [
  ["bilan", "Bilan"], ["parents", "Parents"], ["joueurs", "Joueurs"], ["staff", "Staff"], ["ultras", "Ultras"],
];

function chip(txt, cls = "") { return `<span class="cchip ${cls}">${esc(txt)}</span>`; }
const pl = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

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

function ligne(nom, sous, boutons, extra = "") {
  return `<div class="prow">
    <div class="pname">${esc(nom)}${sous ? `<small>${esc(sous)}</small>` : ""}</div>
    <div class="segs ${boutons.length === 3 ? "trois" : ""}">${boutons.join("")}</div>
    ${extra}
  </div>`;
}

function badgeDesig(a, id) {
  return a.chauffeurs.includes(id) ? `<span class="badge drv">🚗 Désigné pour conduire</span>`
    : a.reserve.includes(id) ? `<span class="badge">En réserve si besoin</span>` : "";
}

function pageParents(m, a, trajets) {
  if (!cvFamilles().length) return `<div class="empty">Pas encore de familles enregistrées.</div>`;
  return `<p class="small muted">Trouvez votre nom de famille, puis répondez sur la ligne Maman ou Papa. L'appli désigne à tour de rôle juste ce qu'il faut de voitures.</p>
  ${cvFamilles().map((f) => {
    const t = trajets[f.id];
    return `<div class="card plist">
      <div class="fhead"><b>Famille ${esc(f.nom)}</b><span>${esc(f.enfant)} · ${pl(t.faits + t.prevus, "trajet")}</span></div>
      ${ROLES_PARENT.map((role) => {
        const id = `Parent:${f.nom}:${role}`;
        const r = a.rep[id] || {};
        return ligne((role === "Maman" ? "👩 " : "👨 ") + role, "", [
          cvBtn(m, a, id, { conduit: "oui" }, "🚗 Je conduis", "g"),
          cvBtn(m, a, id, { conduit: "non" }, "Pas dispo", "r"),
        ], (r.conduit === "oui" ? cvStepper(m, a, id, "Places passagers") : "") + badgeDesig(a, id));
      }).join("")}
    </div>`;
  }).join("")}`;
}

function pageJoueurs(m, a) {
  return `<p class="small muted">${cvRole() === "joueur" ? "Trouve ton prénom et dis si tu seras là. " : ""}Sans réponse, un joueur est compté présent.</p>
  <div class="card plist">${cvJoueurs().map((j) => ligne(j, "", [
    cvBtn(m, a, j, { present: "oui" }, "✅ Présent", "g"),
    cvBtn(m, a, j, { present: "non" }, "❌ Absent", "r"),
  ])).join("")}</div>`;
}

function pageStaff(m, a) {
  return `<p class="small muted">Tant que personne du staff n'a répondu, une place est gardée pour un coach.</p>
  <div class="card plist">${cvStaff().map((s) => {
    const r = a.rep[s.id] || {};
    return ligne(s.nom, s.role, [
      cvBtn(m, a, s.id, { present: "oui" }, "✅ Présent", "g"),
      cvBtn(m, a, s.id, { present: "non", conduit: "" }, "❌ Absent", "r"),
    ], r.present !== "non" ? `<div class="pdrive">
        <div class="segs">${cvBtn(m, a, s.id, { conduit: "oui" }, "🚗 Je peux conduire", "g")}${cvBtn(m, a, s.id, { conduit: "non" }, "Passager", "r")}</div>
        ${r.conduit === "oui" ? cvStepper(m, a, s.id, "Places passagers") : ""}${badgeDesig(a, s.id)}
      </div>` : "");
  }).join("")}</div>`;
}

function pageUltras(m, a) {
  if (!cvUltras().length) return `<div class="empty">Pas encore d'accompagnateurs enregistrés.</div>`;
  return `<p class="small muted">Vous venez avec votre voiture (et pouvez prendre des passagers) ou vous cherchez une place.</p>
  <div class="card plist">${cvUltras().map((u) => {
    const r = a.rep[u.id] || {};
    return ligne(u.nom, "", [
      cvBtn(m, a, u.id, { present: "oui", conduit: "oui" }, "🚗 Avec ma voiture", "g"),
      cvBtn(m, a, u.id, { present: "oui", conduit: "non" }, "🙋 Je cherche une place", "g"),
      cvBtn(m, a, u.id, { present: "non", conduit: "" }, "Je ne viens pas", "r"),
    ], r.present === "oui" && r.conduit === "oui" ? cvStepper(m, a, u.id, "Places passagers") : "");
  }).join("")}</div>`;
}

function pageBilan(m, a, trajets) {
  const ok = a.places >= a.besoin;
  const sr = a.sansReponse;
  const attente = [
    sr.parents && pl(sr.parents, "famille"), sr.joueurs && pl(sr.joueurs, "joueur"),
    sr.staff && `${sr.staff} du staff`, sr.ultras && pl(sr.ultras, "ultra"),
  ].filter(Boolean);
  const lignesT = Object.keys(trajets).map((id) => ({ id, ...trajets[id] }))
    .sort((x, y) => y.faits + y.prevus - (x.faits + x.prevus) || nomDe(x.id).localeCompare(nomDe(y.id)));
  const voiture = (id, type) => `<div class="row"><div class="ico">${icon.car}</div><div><div class="v">${esc(nomDe(id))}</div><div class="small muted">${type} · ${pl((a.rep[id] || {}).places || PLACES(), "place")}</div></div></div>`;

  return `
  <div class="bilan-grid">
    <div class="stat"><b>${a.besoin}</b><span>à transporter</span></div>
    <div class="stat"><b>${a.voitures}</b><span>voiture${a.voitures > 1 ? "s" : ""}</span></div>
    <div class="stat ${ok ? "ok" : "ko"}"><b>${a.places}</b><span>places</span></div>
  </div>
  <div class="cvbilan ${ok ? "ok" : "ko"}">
    <div>${pl(a.joueursPresents.length, "joueur")}${a.staffPassagers ? ` + ${a.staffPassagers} staff` : ""}${a.ultrasPlace.length ? ` + ${pl(a.ultrasPlace.length, "ultra")}` : ""}${a.placeCoach ? " (place gardée pour un coach)" : ""}</div>
    <div>${ok ? "C'est bon ✅" : a.voitures ? `Il manque ${pl(a.besoin - a.places, "place")}` : "Aucun conducteur pour l'instant"}</div>
  </div>
  ${ok && a.places > a.besoin ? `<p class="small muted" style="margin:6px 4px 0">🪑 ${a.places - a.besoin} place${a.places - a.besoin > 1 ? "s libres" : " libre"} pour un accompagnateur ou un coach en plus.</p>` : ""}

  <div class="card">
    <h3>Voitures</h3>
    ${a.chauffeurs.length || a.ultrasVoiture.length ? [
      ...a.chauffeurs.map((id) => voiture(id, estStaff(id) ? "Staff" : "Parent")),
      ...a.ultrasVoiture.map((id) => voiture(id, "Ultra du CJR")),
    ].join("") : `<p class="small muted" style="margin:0">Personne ne s'est encore proposé pour conduire.</p>`}
    ${a.reserve.length ? `<div class="cvl"><div class="k">En réserve si besoin</div>${a.reserve.map((id) => chip(nomDe(id))).join("")}</div>` : ""}
  </div>

  ${a.joueursAbsents.length ? `<div class="card"><h3>Joueurs absents</h3>${a.joueursAbsents.map((j) => chip(j, "abs")).join("")}</div>` : ""}
  ${!a.passe && attente.length ? `<div class="card"><h3>Pas encore répondu</h3><p class="small" style="margin:0">${esc(attente.join(" · "))}</p></div>` : ""}

  <h2 class="section">Trajets par conducteur</h2>
  <div class="card" style="padding:6px 10px">
    <table class="standings">
      <thead><tr><th class="t">Conducteur</th><th>Faits</th><th>Prévus</th><th>Total</th></tr></thead>
      <tbody>${lignesT.map((l) => `<tr><td class="t">${esc(nomDe(l.id))}${estStaff(l.id) ? ' <span class="muted small">(staff)</span>' : ""}</td><td>${l.faits}</td><td>${l.prevus}</td><td class="pts">${l.faits + l.prevus}</td></tr>`).join("")}</tbody>
    </table>
  </div>`;
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

  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const avenir = cvMatchs().filter((m) => new Date(m.date + "T00:00") >= auj);
  if (!avenir.length) { el.innerHTML = html + `<div class="empty">Pas de déplacement à venir.</div>`; return; }
  if (!avenir.some((m) => m.id === CV.match)) CV.match = avenir[0].id;
  const m = avenir.find((x) => x.id === CV.match);
  const joueur = cvRole() === "joueur";
  const page = joueur ? "joueurs" : PAGES.some(([k]) => k === store.get("covoit-page")) ? store.get("covoit-page") : "bilan";
  const { parMatch, trajets } = cvRepartition();
  const a = parMatch[m.id];

  html += `<div class="mchips">${avenir.map((x) => `<button class="mchip ${x.id === m.id ? "on" : ""}" data-cvmatch="${esc(x.id)}">
      <b>${fmt(x, { day: "numeric", month: "short" }).replace(".", "")}</b><span>${esc(opponent(x).nom)}</span></button>`).join("")}</div>
    <div class="card mhead">
      <div class="opp">${isHome(m) ? "vs" : "@"} ${esc(opponent(m).nom)}</div>
      <div class="small muted">${esc(dayLong(m))}${m.heure ? " · " + m.heure.replace(":", "h") : ""} · ${esc(salleMatch(m).adresse || salleMatch(m).nom || "")}</div>
    </div>
    ${joueur ? "" : `<div class="subtabs">${PAGES.map(([k, l]) => `<button class="${k === page ? "on" : ""}" data-cvpage="${k}">${l}</button>`).join("")}</div>`}`;

  html += page === "parents" ? pageParents(m, a, trajets)
    : page === "joueurs" ? pageJoueurs(m, a)
    : page === "staff" ? pageStaff(m, a)
    : page === "ultras" ? pageUltras(m, a)
    : pageBilan(m, a, trajets);
  if (cvApi()) html += `<p class="foot"><a href="#" id="cv-logout">Changer de code</a> · connecté en ${joueur ? "joueur" : "parent / staff"}</p>`;
  el.innerHTML = html;
}

/** Petit résumé covoit dans la fiche d'un match (onglet Prochain). */
function covoitResume(m) {
  if (!cvMatchs().some((x) => x.id === m.id) || (cvApi() && !cvCode()) || !CV.charge) return "";
  const a = cvRepartition().parMatch[m.id];
  if (!a) return "";
  const noms = [...a.chauffeurs, ...a.ultrasVoiture].map(nomDe);
  return `<div class="row"><div class="ico">${icon.car}</div><div>
    <div class="k">Covoiturage</div>
    <div class="v">${noms.length ? esc(noms.join(", ")) : '<span class="tbd">aucun conducteur pour l\'instant</span>'}</div>
    <div class="small">${a.places}/${a.besoin} places · <a href="#" data-goto="covoit">répondre</a></div>
  </div></div>`;
}

// ------------------------------------------------------------ événements

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
  if (pg) { store.set("covoit-page", pg.dataset.cvpage); return renderCovoit(); }
  const g = e.target.closest("[data-goto]");
  if (g) { e.preventDefault(); if ($(".sheet.open")) history.back(); return show(g.dataset.goto); }
  if (e.target.id === "cv-logout") {
    e.preventDefault();
    store.set("covoit-code", ""); store.set("covoit-role", "");
    CV.reponses = []; CV.erreur = null;
    return renderCovoit();
  }
  if (e.target.id === "cv-code-ok") {
    const v = $("#cv-code").value.trim();
    if (!v) return;
    store.set("covoit-code", v);
    CV.charge = false; renderCovoit();
    await cvCharger(); renderCovoit(); renderAccueil();
  }
});
