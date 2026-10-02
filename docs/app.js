"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = {
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  whistle: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="5"/><path d="M11 11l9-5v5h-7"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/></svg>',
  nav: '<svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13v5M9.5 15.5h5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/></svg>',
};

let DATA = null;

// ------------------------------------------------------------ dates

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const asDate = (r) => new Date(r.date + "T" + (r.heure || "00:00"));
const fmt = (r, opts) => new Intl.DateTimeFormat("fr-FR", opts).format(new Date(r.date + "T12:00"));
const dayLong = (r) => fmt(r, { weekday: "long", day: "numeric", month: "long" });

function countdown(r) {
  const days = Math.round((new Date(r.date + "T00:00") - today()) / 864e5);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days < 0) return "Terminé";
  return `Dans ${days} jours`;
}

// ------------------------------------------------------------ helpers match

const isHome = (r) => r.dom.nous;
const opponent = (r) => (isHome(r) ? r.ext : r.dom);
const isPlayed = (r) => Array.isArray(r.score);

function outcome(r) {
  if (!isPlayed(r)) return null;
  const [a, b] = r.score;
  const nous = isHome(r) ? a : b, eux = isHome(r) ? b : a;
  return { nous, eux, code: nous > eux ? "V" : nous < eux ? "D" : "N" };
}

function logoHtml(team, cls = "logo") {
  if (team.logo) return `<img class="${cls}" src="${esc(team.logo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls}',textContent:'${esc(initials(team.nom))}'}))">`;
  return `<div class="${cls}">${esc(initials(team.nom))}</div>`;
}
function initials(nom) {
  return nom.replace(/\(.*?\)/g, "").split(/[\s-]+/).filter((w) => w.length > 2 || /^[A-Z]{2,}$/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function mapsUrl(place) {
  if (!place) return null;
  if (place.lat && place.lon) return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
  const q = [place.nom, place.adresse].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}
function wazeUrl(place) {
  if (place?.lat && place?.lon) return `https://waze.com/ul?ll=${place.lat},${place.lon}&navigate=yes`;
  return null;
}

/** Heure et lieu de rassemblement (priorité : coach > convocation CJR > défaut). */
function rassemblement(r) {
  const def = DATA.rassemblement || {};
  const c = r.coach || {}, cv = r.convoc || {};
  const home = isHome(r);
  return {
    heure: c.rdv_heure || cv.rdv || null,
    lieu: c.rdv_lieu || (home ? null : def.exterieur_lieu?.nom) || null,
    lieuPlace: c.rdv_lieu ? { nom: c.rdv_lieu } : home ? null : def.exterieur_lieu,
    texte: home ? def.domicile : def.exterieur,
  };
}

function salleMatch(r) {
  const s = { ...(r.salle || {}) };
  if (!s.nom && r.convoc?.salle) s.nom = r.convoc.salle;
  return s;
}

// ------------------------------------------------------------ vues

function heroHtml(r) {
  const o = outcome(r);
  const home = isHome(r);
  const mid = o ? `<div class="hero-score">${r.score[0]}<span style="opacity:.5"> - </span>${r.score[1]}</div>` : `<div class="vs">VS</div>`;
  return `
  <div class="hero">
    <div class="hero-top">
      <span class="pill ${home ? "dom" : "ext"}">${home ? "Domicile" : "Extérieur"}</span>
      <span class="countdown">${r.journee ? `J${r.journee} · ` : esc(r.type) + " · "}${countdown(r)}</span>
    </div>
    <div class="versus">
      <div class="team ${r.dom.nous ? "us" : ""}">${logoHtml(r.dom)}<div class="team-name">${esc(r.dom.nom)}</div></div>
      ${mid}
      <div class="team ${r.ext.nous ? "us" : ""}">${logoHtml(r.ext)}<div class="team-name">${esc(r.ext.nom)}</div></div>
    </div>
    <div class="hero-date">
      <div class="d">${esc(dayLong(r))}</div>
      <div class="h">${r.heure ? "Coup d'envoi " + r.heure.replace(":", "h") : "Horaire à confirmer"}</div>
      ${r.reporte_de ? `<div class="h report-note">⚠️ Match reporté (prévu initialement le ${esc(dateCourte(r.reporte_de))})</div>` : ""}
    </div>
  </div>`;
}

function detailHtml(r) {
  const rv = rassemblement(r);
  const s = salleMatch(r);
  const cv = r.convoc || {};
  const tbd = '<span class="tbd">à confirmer</span>';
  const gm = mapsUrl(s), wz = wazeUrl(s), rvUrl = mapsUrl(rv.lieuPlace);

  let html = heroHtml(r);

  if (!isPlayed(r)) {
    html += `
    <div class="card">
      <h3>Rassemblement</h3>
      <div class="row"><div class="ico">${icon.clock}</div><div><div class="k">Heure de RDV</div><div class="v big">${rv.heure ? rv.heure.replace(":", "h") : tbd}</div></div></div>
      ${rv.lieu ? `<div class="row"><div class="ico">${icon.car}</div><div><div class="k">Point de rendez-vous</div><div class="v">${esc(rv.lieu)}</div></div></div>` : ""}
      ${rv.texte ? `<div class="row"><div class="ico">${icon.users}</div><div class="small">${esc(rv.texte)}</div></div>` : ""}
      ${typeof covoitResume === "function" ? covoitResume(r) : ""}
      ${r.coach?.note ? `<div class="note">📣 ${esc(r.coach.note)}</div>` : ""}
      ${rvUrl ? `<div class="actions"><a class="btn full" href="${rvUrl}" target="_blank" rel="noopener">${icon.nav} Aller au point de RDV</a></div>` : ""}
    </div>`;
  }

  html += `
    <div class="card">
      <h3>Lieu du match</h3>
      <div class="row"><div class="ico">${icon.pin}</div><div><div class="v">${s.nom ? esc(s.nom) : tbd}</div>${s.adresse ? `<div class="small muted">${esc(s.adresse)}</div>` : ""}</div></div>
      <div class="actions">
        ${gm ? `<a class="btn primary ${wz ? "" : "full"}" href="${gm}" target="_blank" rel="noopener">${icon.nav} Itinéraire</a>` : ""}
        ${wz ? `<a class="btn" href="${wz}" target="_blank" rel="noopener">${icon.car} Waze</a>` : ""}
        ${!isPlayed(r) ? `<button class="btn full" data-ics="${esc(r.id)}">${icon.cal} Ajouter à mon agenda</button>` : ""}
      </div>
    </div>`;

  if (isHome(r) && (cv.table || cv.arbitres || cv.resp_salle)) {
    html += `
    <div class="card">
      <h3>Organisation (domicile)</h3>
      ${cv.table ? `<div class="row"><div class="ico">${icon.flag}</div><div><div class="k">Table de marque</div><div class="v">${esc(cv.table)}</div></div></div>` : ""}
      ${cv.arbitres ? `<div class="row"><div class="ico">${icon.whistle}</div><div><div class="k">Arbitres</div><div class="v">${esc(cv.arbitres)}</div></div></div>` : ""}
      ${cv.resp_salle ? `<div class="row"><div class="ico">${icon.users}</div><div><div class="k">Responsable de salle</div><div class="v">${esc(cv.resp_salle)}</div></div></div>` : ""}
    </div>`;
  }

  const prevoir = DATA.rassemblement?.a_prevoir || [];
  if (!isPlayed(r) && prevoir.length) {
    html += `<div class="card"><h3>À prévoir</h3><ul class="checklist">${prevoir.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  }

  const links = [];
  if (r.cjr) links.push(`<a class="btn" href="${esc(r.cjr)}" target="_blank" rel="noopener">${icon.link} Fiche CJR</a>`);
  if (DATA.liens?.cjr_convocations) links.push(`<a class="btn" href="${esc(DATA.liens.cjr_convocations)}" target="_blank" rel="noopener">${icon.link} Convocations CJR</a>`);
  if (links.length) html += `<div class="actions">${links.join("")}</div>`;
  return html;
}

function renderAccueil() {
  const ours = DATA.rencontres.filter((r) => r.nous);
  const t = today();
  const next = ours.find((r) => new Date(r.date + "T00:00") >= t && !isPlayed(r));
  const last = [...ours].reverse().find((r) => isPlayed(r));
  // matchs reportés : l'avis reste affiché jusqu'au dimanche qui suit la date d'origine, puis disparaît le lundi
  const finAvis = (d) => { const x = new Date(d + "T00:00"); x.setDate(x.getDate() + ((7 - x.getDay()) % 7)); return x; };
  const reportes = ours.filter((r) => r.reporte_de && t <= finAvis(r.reporte_de));
  const avisReport = reportes.map((r) => `
    <button class="avis-report" data-id="${esc(r.id)}">
      <div class="avis-titre">⚠️ Match reporté</div>
      <div><b>${isHome(r) ? "vs" : "@"} ${esc(opponent(r).nom)}</b> du ${esc(dateCourte(r.reporte_de))} est reporté au
        <b>${esc(dateCourte(r.date))}${r.heure ? " à " + r.heure.replace(":", "h") : ""}</b>${isHome(r) ? "" : " (à l'extérieur)"}.</div>
    </button>`).join("");
  let html = (typeof annoncesAccueil === "function" ? annoncesAccueil() : "")
    + (typeof rappelEntrainements === "function" ? rappelEntrainements() : "");
  if (next) {
    html += `<h2 class="section">Prochain match</h2>` + avisReport + detailHtml(next);
  } else {
    html += avisReport + `<div class="empty">Pas de match à venir pour l'instant.</div>`;
  }
  if (last) {
    html += `<h2 class="section">Dernier résultat</h2>` + matchRow(last);
  }
  $("#view-accueil").innerHTML = html;
}

function matchRow(r, isNext = false) {
  const o = outcome(r);
  const home = isHome(r);
  const past = new Date(r.date + "T23:59") < new Date();
  const typeTag = (r.type !== "Championnat" ? `<span class="tag amical">${esc(r.type)}</span>` : `<span>J${r.journee}</span>`)
    + (r.reporte_de ? `<span class="tag report">Reporté du ${esc(fmt({ date: r.reporte_de }, { day: "numeric", month: "short" }))}</span>` : "");
  const right = o
    ? `<div class="s">${o.nous}-${o.eux}</div><span class="wl ${o.code}">${o.code === "V" ? "Victoire" : o.code === "D" ? "Défaite" : "Nul"}</span>`
    : past
    ? `<div class="small muted">Terminé</div>`
    : `<div class="h">${r.heure ? r.heure.replace(":", "h") : "--h--"}</div>`;
  return `
  <button class="match ${past ? "past" : ""} ${isNext ? "next" : ""}" data-id="${esc(r.id)}">
    <div class="datebox">
      <div class="j">${fmt(r, { weekday: "short" }).replace(".", "")}</div>
      <div class="n">${fmt(r, { day: "numeric" })}</div>
      <div class="m">${fmt(r, { month: "short" }).replace(".", "")}</div>
    </div>
    <div>
      <div class="opp">${home ? "vs" : "@"} ${esc(opponent(r).nom)}</div>
      <div class="meta"><span class="tag ${home ? "dom" : "ext"}">${home ? "Dom" : "Ext"}</span>${typeTag}<span>· ${esc(salleMatch(r).nom || "Salle à confirmer")}</span></div>
    </div>
    <div class="result">${right}</div>
  </button>`;
}

const dateCourte = (d) => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long" }).format(new Date(d + "T12:00"));

function ligneReportee(r) {
  const o = r.fantome;
  return `
  <button class="match reporte" data-id="${esc(o.id)}">
    <div class="datebox">
      <div class="j">${fmt(r, { weekday: "short" }).replace(".", "")}</div>
      <div class="n">${fmt(r, { day: "numeric" })}</div>
      <div class="m">${fmt(r, { month: "short" }).replace(".", "")}</div>
    </div>
    <div>
      <div class="opp"><s>${isHome(o) ? "vs" : "@"} ${esc(opponent(o).nom)}</s></div>
      <div class="meta"><span class="tag report">Reporté</span><span>au ${esc(dateCourte(o.date))}${o.heure ? " à " + o.heure.replace(":", "h") : ""}</span></div>
    </div>
    <div class="result"><span class="small muted">→</span></div>
  </button>`;
}

function renderPlanning() {
  const ours = DATA.rencontres.filter((r) => r.nous);
  const t = today();
  const nextId = ours.find((r) => new Date(r.date + "T00:00") >= t && !isPlayed(r))?.id;
  let html = `<h2 class="section">Planning de la saison</h2>`;
  let month = "";
  // un match reporté apparaît aussi, barré, à sa date d'origine
  const lignes = [...ours, ...ours.filter((r) => r.reporte_de).map((r) => ({ ...r, date: r.reporte_de, fantome: r }))]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.heure || "99").localeCompare(b.heure || "99"));
  for (const r of lignes) {
    const m = fmt(r, { month: "long", year: "numeric" });
    if (m !== month) { html += `<div class="month">${m}</div>`; month = m; }
    html += r.fantome ? ligneReportee(r) : matchRow(r, r.id === nextId);
  }
  $("#view-planning").innerHTML = html;
}

function standings() {
  const champ = DATA.rencontres.filter((r) => r.type === "Championnat");
  const tab = {};
  const team = (t) => (tab[t.nom] ??= { nom: t.nom, nous: t.nous, j: 0, v: 0, d: 0, pp: 0, pc: 0, pts: 0 });
  for (const r of champ) {
    const a = team(r.dom), b = team(r.ext);
    if (!isPlayed(r)) continue;
    const [sa, sb] = r.score;
    a.j++; b.j++; a.pp += sa; a.pc += sb; b.pp += sb; b.pc += sa;
    if (sa > sb) { a.v++; b.d++; a.pts += 2; b.pts += 1; }
    else if (sb > sa) { b.v++; a.d++; b.pts += 2; a.pts += 1; }
  }
  return Object.values(tab).sort((x, y) => y.pts - x.pts || (y.pp - y.pc) - (x.pp - x.pc) || y.pp - x.pp || x.nom.localeCompare(y.nom));
}

function renderClassement() {
  const rows = standings();
  const champ = DATA.rencontres.filter((r) => r.type === "Championnat");
  const missing = champ.filter((r) => !isPlayed(r) && new Date(r.date + "T23:59") < new Date()).length;
  let html = `<h2 class="section">Classement</h2>
  <div class="card" style="padding:6px 10px">
    <table class="standings">
      <thead><tr><th class="t">Équipe</th><th>J</th><th>V</th><th>D</th><th>+/-</th><th>Pts</th></tr></thead>
      <tbody>${rows.map((t, i) => `
        <tr class="${t.nous ? "us" : ""}">
          <td class="t"><span class="rank">${i + 1}</span>${esc(t.nom)}</td>
          <td>${t.j}</td><td>${t.v}</td><td>${t.d}</td>
          <td>${t.pp - t.pc > 0 ? "+" : ""}${t.pp - t.pc}</td><td class="pts">${t.pts}</td>
        </tr>`).join("")}</tbody>
    </table>
  </div>
  <p class="small muted">${esc(DATA.competition)} · Victoire 2 pts, défaite 1 pt.${missing ? ` ${missing} score(s) pas encore connu(s) : le classement peut être incomplet.` : ""}</p>
  <h2 class="section">Tous les matchs de la poule</h2>
  <div class="card others">`;
  let j = 0;
  for (const r of [...champ].sort((x, y) => x.journee - y.journee || x.date.localeCompare(y.date))) {
    if (r.journee !== j) {
      j = r.journee;
      const dates = [...new Set(champ.filter((x) => x.journee === j).map((x) => fmt(x, { day: "numeric", month: "long" })))];
      html += `<div class="month" style="margin:12px 0 0">Journée ${j} · ${dates.join(" / ")}</div>`;
    }
    html += `<div class="o"><div class="a" style="${r.dom.nous ? "color:var(--red)" : ""}">${esc(r.dom.nom)}</div>
      <div class="sc ${isPlayed(r) ? "" : "tbd muted"}">${isPlayed(r) ? `${r.score[0]} - ${r.score[1]}` : r.reporte_de ? "reporté" : r.heure ? r.heure.replace(":", "h") : "—"}</div>
      <div class="b" style="${r.ext.nous ? "color:var(--red)" : ""}">${esc(r.ext.nom)}</div></div>`;
  }
  html += `</div>`;
  $("#view-classement").innerHTML = html;
}

function renderInfos() {
  const base = new URL(".", location.href);
  const icsUrl = new URL("calendrier.ics", base).href;
  const webcal = icsUrl.replace(/^https?:/, "webcal:");
  const coachs = DATA.coachs || [];
  const maj = new Date(DATA.maj);
  $("#view-infos").innerHTML = `
  <h2 class="section">Infos équipe</h2>
  ${coachs.length ? `<div class="card"><h3>Staff</h3>
    ${coachs.map((c, i) => `<div class="row"><div class="ico">${i === 0 ? icon.whistle : icon.users}</div><div style="flex:1"><div class="k">${esc(c.role)}</div><div class="v">${esc(c.nom)}</div></div>
      ${c.tel ? `<a class="btn" href="tel:${esc(c.tel.replace(/\s/g, ""))}" aria-label="Appeler ${esc(c.nom)}">${icon.phone}</a>` : ""}</div>`).join("")}
  </div>` : ""}
  <div class="card">
    <h3>Calendrier automatique</h3>
    <p class="small" style="margin-top:0">Un seul clic : tous les matchs s'ajoutent dans l'agenda de ton téléphone ou de ton Mac et se mettent à jour tout seuls. <b>C'est gratuit</b>, rien à payer.</p>
    <div class="actions">
      <a class="btn primary full" href="${esc(webcal)}">${icon.cal} Ajouter les matchs à mon agenda (iPhone / Mac)</a>
      <a class="btn full" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">${icon.cal} Ajouter les matchs à Google Agenda (Android)</a>
    </div>
  </div>
  <div class="card">
    <h3>Liens utiles</h3>
    <div class="actions">
      <a class="btn full" href="${esc(DATA.liens?.cjr_convocations)}" target="_blank" rel="noopener">${icon.link} Convocations CJR</a>
      <a class="btn full" href="${esc(DATA.liens?.cjr_equipe)}" target="_blank" rel="noopener">${icon.link} Page U18M2 du CJR</a>
    </div>
  </div>
  <div class="card">
    <h3>Installer l'appli</h3>
    <div class="row"><div class="ico">${icon.bag}</div><div class="small"><b>Android</b> : ouvre ce lien dans Chrome, menu ⋮ puis « Installer l'application ».</div></div>
    <div class="row"><div class="ico">${icon.bag}</div><div class="small"><b>Mac</b> : dans Safari, menu Fichier puis « Ajouter au Dock ». Avec Chrome : icône d'installation dans la barre d'adresse.</div></div>
    <div class="row"><div class="ico">${icon.bag}</div><div class="small"><b>iPhone</b> : dans Safari, bouton Partager puis « Sur l'écran d'accueil ».</div></div>
  </div>
  <div class="actions"><button class="btn full" data-show="coach">🔒 Espace coach</button></div>
  <p class="foot">Dernière modification des données : le ${maj.toLocaleDateString("fr-FR")} à ${maj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}<br>Sources : FFBB · cjr-basketball.com</p>`;
}

// ------------------------------------------------------------ feuille de détail

function openSheet(id) {
  const r = DATA.rencontres.find((x) => x.id === id);
  if (!r) return;
  let bg = $(".sheet-bg"), sh = $(".sheet");
  if (!sh) {
    bg = Object.assign(document.createElement("div"), { className: "sheet-bg" });
    sh = Object.assign(document.createElement("div"), { className: "sheet" });
    document.body.append(bg, sh);
    bg.onclick = () => history.back();
  }
  sh.innerHTML = `<div class="grab"></div><button class="close" aria-label="Fermer">✕</button>` + detailHtml(r);
  $(".close", sh).onclick = () => history.back();
  sh.scrollTop = 0;
  bg.classList.add("open");
  requestAnimationFrame(() => sh.classList.add("open"));
  history.pushState({ sheet: id }, "");
}
function closeSheet() {
  $(".sheet")?.classList.remove("open");
  $(".sheet-bg")?.classList.remove("open");
}
window.addEventListener("popstate", closeSheet);

// ------------------------------------------------------------ agenda (1 match)

function downloadIcs(id) {
  const r = DATA.rencontres.find((x) => x.id === id);
  const s = salleMatch(r);
  const d = r.date.replace(/-/g, "");
  const title = `🏀 ${isHome(r) ? "vs" : "@"} ${opponent(r).nom}`;
  let when;
  if (r.heure) {
    const start = new Date(r.date + "T" + r.heure), end = new Date(start.getTime() + 2 * 36e5);
    const f = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}T${String(x.getHours()).padStart(2, "0")}${String(x.getMinutes()).padStart(2, "0")}00`;
    when = [`DTSTART:${f(start)}`, `DTEND:${f(end)}`];
  } else {
    const n = new Date(r.date + "T12:00"); n.setDate(n.getDate() + 1);
    when = [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${n.toISOString().slice(0, 10).replace(/-/g, "")}`];
  }
  const rv = rassemblement(r);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//U18M2//FR", "BEGIN:VEVENT",
    `UID:${r.id}@u18m2-ctc`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, ...when,
    `SUMMARY:${title}`, `LOCATION:${[s.nom, s.adresse].filter(Boolean).join(" - ")}`,
    `DESCRIPTION:${rv.heure ? "RDV " + rv.heure + (rv.lieu ? " - " + rv.lieu : "") : "Horaire de RDV à confirmer"}`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })),
    download: `match-${r.date}.ics`,
  });
  a.click();
}

// ------------------------------------------------------------ navigation + chargement

function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  window.scrollTo({ top: 0 });
  try { localStorage.setItem("vue", view); } catch {}
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tabs button");
  if (tab) return show(tab.dataset.view);
  const ics = e.target.closest("[data-ics]");
  if (ics) return downloadIcs(ics.dataset.ics);
  const m = e.target.closest(".match[data-id], .avis-report[data-id]");
  if (m) return openSheet(m.dataset.id);
});

function renderAll() {
  renderAccueil();
  renderPlanning();
  renderClassement();
  renderInfos();
  if (typeof renderEntrainement === "function") renderEntrainement();
  if (typeof renderCoach === "function") renderCoach();
  if (typeof renderAnnonces === "function") renderAnnonces();
  if (typeof renderCovoit === "function") renderCovoit();
}

async function load() {
  const btn = $("#refresh");
  btn.classList.add("spin");
  try {
    const res = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
    DATA = await res.json();
    renderAll();
    if (typeof cvCharger === "function") { await cvCharger(); renderAll(); }
  } catch (err) {
    if (!DATA) $("#view-accueil").innerHTML = `<div class="empty">Impossible de charger les données. Vérifie ta connexion.</div>`;
  } finally {
    btn.classList.remove("spin");
  }
}

$("#refresh").addEventListener("click", load);
try { const v = localStorage.getItem("vue"); if (v) show(v); } catch {}
load();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
