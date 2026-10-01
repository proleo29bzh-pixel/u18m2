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
