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

/** Joueur pour qui ce téléphone répond : le joueur lui-même, ou l'enfant de la famille choisie. */
function joueurDuTel() {
  if (typeof cvMoi !== "function") return "";
  const moi = cvMoi();
  if (moi.startsWith("Famille:")) return moi.slice(8);
  return (DATA.joueurs || []).includes(moi) ? moi : "";
}

function blocPresence(e) {
  if (typeof cvApi !== "function" || !cvApi()) return "";
  if (!cvCode()) return `<div class="presence"><button class="btn full" data-show="covoit">Entrez votre code (onglet Covoiturage) pour dire si vous venez</button></div>`;
  if (!CV.charge) return "";
  const id = idSeance(e);
  const rep = Object.fromEntries(CV.reponses.filter((x) => x.match === id).map((x) => [x.famille, x.present]));
  const joueurs = DATA.joueurs || [];
  const oui = joueurs.filter((j) => rep[j] === "oui"), non = joueurs.filter((j) => rep[j] === "non");
  const sans = joueurs.filter((j) => !rep[j]);
  const moi = joueurDuTel();
  const btn = (val, label, cls) => `<button class="seg ${rep[moi] === val ? "on " + cls : ""}" data-entr="${esc(id)}" data-joueur="${esc(moi)}" data-val="${val}">${label}</button>`;
  return `<div class="presence">
    ${moi ? `<div class="k">${esc(moi)} sera là ?</div><div class="segs">${btn("oui", "✅ Présent", "g")}${btn("non", "❌ Absent", "r")}</div>`
      : `<div class="small muted">Choisissez qui vous êtes dans l'onglet Covoiturage pour répondre.</div>`}
    <div class="presence-bilan"><b>✅ ${oui.length}</b> présent${oui.length > 1 ? "s" : ""} · <b>❌ ${non.length}</b> absent${non.length > 1 ? "s" : ""} · ${sans.length} sans réponse</div>
    ${oui.length ? `<div class="cvl"><div class="k">Présents</div>${oui.map((j) => `<span class="cchip ok">${esc(j)}</span>`).join("")}</div>` : ""}
    ${non.length ? `<div class="cvl"><div class="k">Absents</div>${non.map((j) => `<span class="cchip abs">${esc(j)}</span>`).join("")}</div>` : ""}
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

function renderEntrainement() {
  const el = $("#view-entrainement");
  if (!el || !DATA) return;
  const s = DATA.seance_jeudi || {};
  const jeudi = (DATA.entrainements || []).find((e) => e.jour_num === 4);
  const dateSeance = s.date ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(s.date + "T12:00")) : "";
  const liste = (items) => `<ul class="puces">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

  el.innerHTML = `
  <h2 class="section">Entraînements</h2>
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
