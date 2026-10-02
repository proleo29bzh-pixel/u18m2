"use strict";
/* Entraînements : horaires de la semaine, séance du jeudi, état d'esprit.
   Utilise les globales de app.js (DATA, $, esc, icon, mapsUrl, show). */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Prochaine occurrence d'un entraînement (aujourd'hui compris tant qu'il n'est pas fini). */
function prochaineSeance(e) {
  const now = new Date();
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  let ecart = (e.jour_num - d.getDay() + 7) % 7;
  const [hf, mf] = e.fin.split(":").map(Number);
  if (ecart === 0 && (now.getHours() * 60 + now.getMinutes()) > hf * 60 + mf) ecart = 7;
  d.setDate(d.getDate() + ecart);
  return { date: d, ecart };
}

const hh = (h) => h.replace(":", "h");
const quand = ({ date, ecart }) => ecart === 0 ? "ce soir" : ecart === 1 ? "demain"
  : new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(date).replace(/\./g, "");

function entrainementsTries() {
  return (DATA.entrainements || []).map((e) => ({ ...e, p: prochaineSeance(e) })).sort((a, b) => a.p.date - b.p.date);
}

/** Rappel compact pour la page d'accueil. */
function rappelEntrainements() {
  const liste = entrainementsTries();
  if (!liste.length) return "";
  return `<button class="rappel-entr" data-show="entrainement">
    <div class="rappel-titre">🏀 Prochains entraînements</div>
    ${liste.map((e) => `<div class="rappel-ligne"><b>${esc(e.jour)}</b> ${hh(e.debut)}–${hh(e.fin)} · ${esc(e.lieu.nom.replace(/^(Complexe sportif|Salle polyvalente du) /, ""))}<span>${esc(quand(e.p))}</span></div>`).join("")}
  </button>`;
}

// ------------------------------------------------------------ présence (même Google Sheet que le covoit)
// Ligne « match » = "entr:AAAA-MM-JJ", ligne « famille » = prénom du joueur.

const isoJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const idSeance = (e) => "entr:" + isoJour(e.p.date);

/** Mode coach (mot de passe coach) : gardé en mémoire seulement, jamais sur l'appareil. */
const ENTR = { coach: false, pour: "" };

/** Seul le joueur répond pour lui-même (c'est lui qui vient, pas ses parents). Le coach peut répondre pour n'importe qui. */
function joueurDuTel() {
  if (ENTR.coach) return ENTR.pour;
  if (typeof cvMoi !== "function") return "";
  const moi = cvMoi();
  return (DATA.joueurs || []).includes(moi) ? moi : "";
}

function blocPresence(e) {
  if (typeof cvApi !== "function" || !cvApi()) return "";
  if (!cvCode()) return "";        // le champ du code est affiché en haut de la page
  if (!CV.charge) return "";
  const id = idSeance(e);
  const rep = Object.fromEntries(CV.reponses.filter((x) => x.match === id).map((x) => [x.famille, x.present]));
  const joueurs = DATA.joueurs || [];
  const oui = joueurs.filter((j) => rep[j] === "oui"), non = joueurs.filter((j) => rep[j] === "non");
  const sans = joueurs.filter((j) => !rep[j]);
  const moi = joueurDuTel();
  const btn = (val, label, cls) => `<button class="seg ${rep[moi] === val ? "on " + cls : ""}" data-entr="${esc(id)}" data-joueur="${esc(moi)}" data-val="${val}">${label}</button>`;
  const groupe = (titre, noms, cls) => `<div class="cvl"><div class="k">${titre} (${noms.length})</div>${noms.length ? noms.map((j) => `<span class="cchip ${cls}">${esc(j)}</span>`).join("") : '<span class="small muted">—</span>'}</div>`;
  return `<div class="presence">
    ${moi ? `<div class="k">${esc(moi)} sera là ?</div><div class="segs">${btn("oui", "✅ Présent", "g")}${btn("non", "❌ Absent", "r")}</div>`
      : ENTR.coach ? `<div class="small muted">Choisissez un joueur en haut pour répondre à sa place.</div>`
      : `<div class="small muted">Ce sont les joueurs qui répondent, avec leur code joueur.</div>`}
    ${groupe("✅ Présents", oui, "ok")}
    ${groupe("❌ Absents", non, "abs")}
    ${groupe("⏳ Pas encore répondu", sans, "wait")}
  </div>`;
}

document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-entr]");
  if (!b) return;
  const id = b.dataset.entr, j = b.dataset.joueur;
  const avant = (CV.reponses.find((x) => x.match === id && x.famille === j) || {}).present || "";
  const envoi = cvEnregistrer(id, j, { present: avant === b.dataset.val ? "" : b.dataset.val });  // re-cliquer annule
  renderEntrainement();          // affichage immédiat
  await envoi;
  renderEntrainement();          // état confirmé par le Google Sheet
});

/** En haut de l'onglet : code joueur puis prénom, pour pouvoir répondre « présent / absent ». */
function blocIdentiteEntr() {
  if (typeof cvApi !== "function" || !cvApi()) return "";
  if (!cvCode()) {
    return `<div class="card">
      <h3>Tu viens à l'entraînement ?</h3>
      <p class="small muted" style="margin-top:0">Entrez votre code joueur pour dire si vous venez.</p>
      <div class="cvcode"><input id="entr-code" type="text" autocomplete="off" placeholder="Code joueur"><button class="btn primary" id="entr-code-ok">OK</button></div>
      ${CV.erreur ? `<div class="note">⚠️ ${esc(CV.erreur)}</div>` : ""}
    </div>`;
  }
  if (!CV.charge) return `<div class="empty">Chargement…</div>`;
  if (ENTR.coach) {
    return `<div class="card">
      <h3>🔑 Mode coach</h3>
      <p class="small muted" style="margin-top:0">Vous voyez toutes les réponses et pouvez répondre à la place d'un joueur (pour tester ou corriger).</p>
      <select id="entr-pour" class="cvselect"><option value="">Répondre pour…</option>
        ${(DATA.joueurs || []).map((j) => `<option ${j === ENTR.pour ? "selected" : ""}>${esc(j)}</option>`).join("")}</select>
      <p class="small" style="margin:10px 0 0"><a href="#" id="entr-sortir">Quitter le mode coach</a></p>
    </div>`;
  }
  if (cvRole() === "joueur" && joueurDuTel()) {
    return `<p class="small muted" style="margin:0 4px 6px">Connecté en tant que <b>${esc(joueurDuTel())}</b> · <a href="#" id="entr-changer">Pas toi ? Changer</a></p>`;
  }
  if (cvRole() === "joueur" && !joueurDuTel()) {
    return `<div class="card">
      <h3>Qui es-tu ?</h3>
      <select id="entr-moi" class="cvselect"><option value="">Choisis ton prénom…</option>
        ${(DATA.joueurs || []).map((j) => `<option>${esc(j)}</option>`).join("")}</select>
    </div>`;
  }
  return "";
}

document.addEventListener("click", async (ev) => {
  if (ev.target.id !== "entr-code-ok") return;
  const v = $("#entr-code").value.trim();
  if (!v) return;
  ev.target.disabled = true; ev.target.textContent = "…";
  // Mot de passe coach ? Il ouvre le fichier chiffré de l'Espace coach, qui contient le code d'accès aux réponses.
  let codeCoach = "";
  try { codeCoach = (await coachDechiffrer(v)).acces?.code_parents || ""; } catch {}
  if (codeCoach) {
    ENTR.coach = true; ENTR.pour = "";
    CV.code = codeCoach;                    // en mémoire seulement
    store.set("covoit-code", "");
  } else {
    CV.code = v;
    cvMemoriserCode();
  }
  CV.charge = false; renderEntrainement();
  await cvCharger();
  renderAll();
});
document.addEventListener("click", (ev) => {
  if (ev.target.id === "entr-changer") { ev.preventDefault(); store.set("covoit-moi", ""); renderAll(); }
  if (ev.target.id === "entr-sortir") {
    ev.preventDefault();
    ENTR.coach = false; ENTR.pour = ""; CV.code = ""; CV.reponses = [];
    store.set("covoit-code", ""); store.set("covoit-role", "");
    renderAll();
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.id === "entr-code") $("#entr-code-ok").click();
});
document.addEventListener("change", (ev) => {
  if (ev.target.id === "entr-moi") { store.set("covoit-moi", ev.target.value); renderAll(); }
  if (ev.target.id === "entr-pour") { ENTR.pour = ev.target.value; renderEntrainement(); }
});

function renderEntrainement() {
  const el = $("#view-entrainement");
  if (!el || !DATA) return;
  const s = DATA.seance_jeudi || {};
  const jeudi = (DATA.entrainements || []).find((e) => e.jour_num === 4);
  const dateSeance = s.date ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(s.date + "T12:00")) : "";
  const liste = (items) => `<ul class="puces">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

  el.innerHTML = `
  <h2 class="section">Entraînements</h2>
  ${blocIdentiteEntr()}
  ${entrainementsTries().map((e) => {
    const url = mapsUrl(e.lieu);
    return `<div class="card entr">
      <div class="entr-head"><div class="entr-jour">${esc(e.jour)}</div><div class="entr-quand">${esc(quand(e.p))}</div></div>
      <div class="row"><div class="ico">${icon.clock}</div><div><div class="v big">${hh(e.debut)} – ${hh(e.fin)}</div></div></div>
      <div class="row"><div class="ico">${icon.pin}</div><div><div class="v">${esc(e.lieu.nom)}</div><div class="small muted">${esc(e.lieu.adresse || "")}</div></div></div>
      ${e.coach ? `<div class="row"><div class="ico">${icon.whistle}</div><div><div class="k">Coach</div><div class="v">${esc(e.coach)}</div></div></div>` : ""}
      ${url ? `<div class="actions"><a class="btn full" href="${url}" target="_blank" rel="noopener">${icon.nav} Itinéraire</a></div>` : ""}
      ${blocPresence(e)}
    </div>`;
  }).join("")}

  ${s.theme ? `
  <h2 class="section">Séance du jeudi</h2>
  <div class="card seance">
    ${s.theme ? `
      ${dateSeance ? `<div class="small muted">${esc(dateSeance)}${jeudi?.coach ? " · avec " + esc(jeudi.coach) : ""}</div>` : ""}
      <div class="seance-theme">${esc(s.theme)}</div>
      ${s.objectifs?.length ? `<h3>Ce qu'on travaille</h3>${liste(s.objectifs)}` : ""}
      ${s.pourquoi ? `<h3>Pourquoi, à quoi ça sert</h3><p>${esc(s.pourquoi)}</p>` : ""}
      ${s.deroule?.length ? `<h3>Déroulé</h3><ol class="deroule">${s.deroule.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    ` : ""}
  </div>` : ""}

  ${DATA.etat_esprit?.length ? `
  <h2 class="section">L'état d'esprit</h2>
  <div class="card esprit">
    <p style="margin-top:0">Pour progresser ensemble et que les séances se passent bien, on compte sur le sérieux de chacun :</p>
    ${liste(DATA.etat_esprit)}
  </div>` : ""}`;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-show]");
  if (b) { e.preventDefault(); show(b.dataset.show); }
});
