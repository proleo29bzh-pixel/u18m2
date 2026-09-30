"use strict";
/* Covoiturage : dispos des familles + désignation équitable des chauffeurs.
   Utilise les globales de app.js (DATA, $, esc, icon, fmt, isHome, opponent, salleMatch). */

const CV = {
  reponses: [],       // [{match, famille, present, conduit, places}]
  charge: false,
  erreur: null,
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const cvApi = () => DATA?.covoiturage?.api || "";
const cvMoi = () => store.get("covoit-famille") || "";
const cvCode = () => store.get("covoit-code") || "";

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
    if (!j.ok) { CV.erreur = j.erreur === "code" ? "Code équipe incorrect." : j.erreur; store.set("covoit-code", ""); }
    else { CV.reponses = j.reponses; CV.erreur = null; }
  } catch {
    CV.erreur = "Impossible de joindre le serveur du covoiturage.";
  }
  CV.charge = true;
}

async function cvEnregistrer(match, champs) {
  const famille = cvMoi();
  let r = CV.reponses.find((x) => x.match === match && x.famille === famille);
  if (!r) { r = { match, famille, present: "", conduit: "", places: null }; CV.reponses.push(r); }
  Object.assign(r, champs);
  if (r.conduit === "oui" && !r.places) r.places = DATA.covoiturage?.places_defaut || 4;
  renderCovoit();

  if (!cvApi()) { store.set("covoit-demo", JSON.stringify(CV.reponses)); return; }
  try {
    // text/plain : pas de pré-requête CORS avec Google Apps Script
    const res = await fetch(cvApi(), { method: "POST", body: JSON.stringify({ code: cvCode(), ...r }) });
    const j = await res.json();
    if (j.ok) { CV.reponses = j.reponses; CV.erreur = null; }
    else CV.erreur = "Réponse refusée : " + j.erreur;
  } catch {
    CV.erreur = "Pas de réseau : ta réponse n'est pas enregistrée.";
  }
  renderCovoit();
}

// ------------------------------------------------------------ répartition équitable

function cvMatchs() {
  const dom = DATA.covoiturage?.matchs_domicile;
  return DATA.rencontres.filter((r) => r.nous && (dom || !isHome(r)));
}

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

/** Parcourt les matchs dans l'ordre : à chaque match, les familles dispo qui ont
    le moins conduit (puis le plus anciennement) sont désignées jusqu'à avoir assez de places. */
function cvRepartition() {
  const joueurs = DATA.joueurs || [];
  const trajets = Object.fromEntries(joueurs.map((f) => [f, { faits: 0, prevus: 0, dernier: -1 }]));
  const res = {};
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  cvMatchs().forEach((m, idx) => {
    const rep = Object.fromEntries(CV.reponses.filter((x) => x.match === m.id).map((x) => [x.famille, x]));
    const presents = joueurs.filter((f) => rep[f]?.present !== "non");
    const absents = joueurs.filter((f) => rep[f]?.present === "non");
    const sansReponse = joueurs.filter((f) => !rep[f] || (!rep[f].present && !rep[f].conduit));
    const dispo = joueurs.filter((f) => rep[f]?.conduit === "oui")
      .sort((a, b) => trajets[a].faits + trajets[a].prevus - (trajets[b].faits + trajets[b].prevus)
        || trajets[a].dernier - trajets[b].dernier || hash(m.id + a) - hash(m.id + b));
    const besoin = presents.length;
    const chauffeurs = [];
    let places = 0;
    for (const f of dispo) {
      if (places >= besoin) break;
      chauffeurs.push(f);
      places += rep[f].places || DATA.covoiturage?.places_defaut || 4;
    }
    const passe = new Date(m.date + "T00:00") < auj;
    for (const f of chauffeurs) {
      trajets[f][passe ? "faits" : "prevus"]++;
      trajets[f].dernier = idx;
    }
    res[m.id] = { rep, presents, absents, sansReponse, dispo, chauffeurs, reserve: dispo.filter((f) => !chauffeurs.includes(f)), besoin, places, passe };
  });
  return { parMatch: res, trajets };
}

// ------------------------------------------------------------ rendu

function chip(nom, cls = "", extra = "") {
  return `<span class="cchip ${cls}">${esc(nom)}${extra}</span>`;
}

function cvCarte(m, a, trajets) {
  const moi = cvMoi();
  const r = a.rep[moi] || {};
  const home = isHome(m);
  const ok = a.places >= a.besoin;
  const verrou = a.passe;
  const places = r.places || DATA.covoiturage?.places_defaut || 4;
  const btn = (champ, val, label, cls = "") =>
    `<button class="seg ${r[champ] === val ? "on " + cls : ""}" data-cv="${esc(m.id)}" data-champ="${champ}" data-val="${val}" ${verrou ? "disabled" : ""}>${label}</button>`;

  return `
  <div class="card cvcard ${verrou ? "past" : ""}">
    <div class="cvhead">
      <div class="datebox"><div class="j">${fmt(m, { weekday: "short" }).replace(".", "")}</div><div class="n">${fmt(m, { day: "numeric" })}</div><div class="m">${fmt(m, { month: "short" }).replace(".", "")}</div></div>
      <div>
        <div class="opp">${home ? "vs" : "@"} ${esc(opponent(m).nom)}</div>
        <div class="meta">${esc(salleMatch(m).adresse || salleMatch(m).nom || "")}</div>
      </div>
    </div>

    ${moi ? `
    <div class="cvq">
      <div class="k">${esc(moi)} joue ?</div>
      <div class="segs">${btn("present", "oui", "✅ Présent", "g")}${btn("present", "non", "❌ Absent", "r")}</div>
    </div>
    <div class="cvq">
      <div class="k">Vous pouvez conduire ?</div>
      <div class="segs">${btn("conduit", "oui", "🚗 Oui", "g")}${btn("conduit", "non", "Non", "r")}</div>
      ${r.conduit === "oui" ? `
      <div class="stepper">
        <span class="k">Places pour les joueurs (le vôtre compris)</span>
        <div><button data-cvplaces="${esc(m.id)}" data-d="-1" ${verrou ? "disabled" : ""}>−</button><b>${places}</b><button data-cvplaces="${esc(m.id)}" data-d="1" ${verrou ? "disabled" : ""}>+</button></div>
      </div>` : ""}
    </div>` : ""}

    <div class="cvbilan ${ok ? "ok" : "ko"}">
      <div><b>${a.places}</b> place${a.places > 1 ? "s" : ""} pour <b>${a.besoin}</b> joueur${a.besoin > 1 ? "s" : ""}</div>
      <div>${ok ? "C'est bon ✅" : a.dispo.length ? `Il manque ${a.besoin - a.places} place${a.besoin - a.places > 1 ? "s" : ""}` : "Aucun chauffeur pour l'instant"}</div>
    </div>

    ${a.chauffeurs.length ? `<div class="cvl"><div class="k">🚗 Chauffeurs ${verrou ? "" : "désignés"}</div>${a.chauffeurs.map((f) => chip(f, "drv" + (f === moi ? " me" : ""), ` · ${a.rep[f].places || 4} pl.`)).join("")}</div>` : ""}
    ${a.reserve.length ? `<div class="cvl"><div class="k">En réserve si besoin</div>${a.reserve.map((f) => chip(f, f === moi ? "me" : "")).join("")}</div>` : ""}
    ${a.absents.length ? `<div class="cvl"><div class="k">Absents</div>${a.absents.map((f) => chip(f, "abs")).join("")}</div>` : ""}
    ${!verrou && a.sansReponse.length ? `<div class="cvl"><div class="k">Pas encore répondu (${a.sansReponse.length})</div>${a.sansReponse.map((f) => chip(f, "wait" + (f === moi ? " me" : ""))).join("")}</div>` : ""}
  </div>`;
}

function renderCovoit() {
  const el = $("#view-covoit");
  if (!el || !DATA) return;
  const joueurs = DATA.joueurs || [];
  const moi = cvMoi();
  const besoinCode = cvApi() && !cvCode();

  let html = `<h2 class="section">Covoiturage</h2>`;

  html += `<div class="card">
    <h3>Qui êtes-vous ?</h3>
    <select id="cv-moi" class="cvselect">
      <option value="">Choisir le joueur…</option>
      ${joueurs.map((f) => `<option ${f === moi ? "selected" : ""}>${esc(f)}</option>`).join("")}
    </select>
    ${besoinCode ? `<div class="cvcode"><input id="cv-code" type="text" inputmode="text" autocomplete="off" placeholder="Code équipe (donné par le coach)"><button class="btn primary" id="cv-code-ok">OK</button></div>` : ""}
    ${!cvApi() ? `<div class="note">Mode démo : les réponses restent sur cet appareil. Le partage entre familles s'active quand le coach branche le Google Sheet.</div>` : ""}
    ${CV.erreur ? `<div class="note">⚠️ ${esc(CV.erreur)}</div>` : ""}
  </div>`;

  if (besoinCode) { el.innerHTML = html; return; }
  if (!CV.charge) { el.innerHTML = html + `<div class="empty">Chargement…</div>`; return; }

  const { parMatch, trajets } = cvRepartition();
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const avenir = cvMatchs().filter((m) => new Date(m.date + "T00:00") >= auj);

  html += `<p class="small muted">Les chauffeurs sont choisis automatiquement parmi les familles disponibles : celles qui ont le moins conduit passent en premier. Un joueur qui n'a pas répondu est compté présent.</p>`;
  html += avenir.length ? avenir.map((m) => cvCarte(m, parMatch[m.id], trajets)).join("") : `<div class="empty">Pas de déplacement à venir.</div>`;

  const lignes = joueurs.map((f) => ({ f, ...trajets[f] })).sort((a, b) => b.faits + b.prevus - (a.faits + a.prevus) || a.f.localeCompare(b.f));
  html += `<h2 class="section">Trajets par famille</h2>
  <div class="card" style="padding:6px 10px">
    <table class="standings">
      <thead><tr><th class="t">Famille</th><th>Faits</th><th>Prévus</th><th>Total</th></tr></thead>
      <tbody>${lignes.map((l) => `<tr class="${l.f === moi ? "us" : ""}"><td class="t">${esc(l.f)}</td><td>${l.faits}</td><td>${l.prevus}</td><td class="pts">${l.faits + l.prevus}</td></tr>`).join("")}</tbody>
    </table>
  </div>`;
  el.innerHTML = html;
}

/** Petit résumé covoit dans la fiche d'un match (onglet Prochain). */
function covoitResume(m) {
  if (!DATA?.joueurs?.length || !cvMatchs().some((x) => x.id === m.id) || (cvApi() && !cvCode())) return "";
  const a = cvRepartition().parMatch[m.id];
  if (!a) return "";
  const ok = a.places >= a.besoin;
  return `<div class="row"><div class="ico">${icon.car}</div><div>
    <div class="k">Covoiturage</div>
    <div class="v">${a.chauffeurs.length ? esc(a.chauffeurs.join(", ")) : '<span class="tbd">aucun chauffeur pour l\'instant</span>'}</div>
    <div class="small ${ok ? "" : "muted"}">${a.places}/${a.besoin} places · <a href="#" data-goto="covoit">répondre</a></div>
  </div></div>`;
}

// ------------------------------------------------------------ événements

document.addEventListener("change", (e) => {
  if (e.target.id === "cv-moi") { store.set("covoit-famille", e.target.value); renderCovoit(); renderAccueil(); }
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-cv]");
  if (b) {
    const r = CV.reponses.find((x) => x.match === b.dataset.cv && x.famille === cvMoi()) || {};
    const val = r[b.dataset.champ] === b.dataset.val ? "" : b.dataset.val; // re-cliquer annule
    return cvEnregistrer(b.dataset.cv, { [b.dataset.champ]: val });
  }
  const p = e.target.closest("[data-cvplaces]");
  if (p) {
    const r = CV.reponses.find((x) => x.match === p.dataset.cvplaces && x.famille === cvMoi()) || {};
    const n = Math.max(1, Math.min(8, (r.places || 4) + Number(p.dataset.d)));
    return cvEnregistrer(p.dataset.cvplaces, { places: n });
  }
  const g = e.target.closest("[data-goto]");
  if (g) { e.preventDefault(); if ($(".sheet.open")) history.back(); return show(g.dataset.goto); }
  if (e.target.id === "cv-code-ok") {
    const v = $("#cv-code").value.trim();
    if (!v) return;
    store.set("covoit-code", v);
    CV.charge = false; renderCovoit();
    await cvCharger(); renderCovoit(); renderAccueil();
  }
});
