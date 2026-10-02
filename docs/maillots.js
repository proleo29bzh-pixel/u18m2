"use strict";
/* Maillots : où est le sac de maillots, déclaré par la famille qui l'a (ou par le coach).
   Stocké dans le Google Sheet du covoit : ligne match "maillots", famille "etat",
   colonne present = statut, colonne conduit = qui a le sac ("Famille:<joueur>" ou "Coach").
   Utilise les globales de app.js / covoit.js / entrainement.js (DATA, $, esc, store, CV, cvApi, cvCode, cvMoi, cvRole,
   cvEnregistrer, familleDe, estStaff, ENTR, maillotsPour, show, renderAccueil). */

const STATUTS = {
  lavage: { ico: "🧺", txt: (qui) => `Lavage en cours chez ${qui}` },
  jeudi: { ico: "📦", txt: (qui) => `${qui} les rapporte jeudi à l'entraînement` },
  bureau: { ico: "🏢", txt: (qui) => `Déposés au bureau du club par ${qui}` },
  coach: { ico: "✅", txt: () => "Récupérés par le coach" },
};

function etatMaillots() {
  const r = (typeof CV !== "undefined" && CV.reponses || []).find((x) => x.match === "maillots" && x.famille === "etat");
  return r && r.present ? { statut: r.present, chez: r.conduit, maj: r.maj } : null;
}
const nomChez = (id) => id?.startsWith("Famille:") ? (familleDe(id.slice(8))?.libelle || id.slice(8)) : "le coach";
const estCoachTel = () => (typeof ENTR !== "undefined" && ENTR.coach) || estStaff(cvMoi() || "");

/** Famille qui prend les maillots au prochain match (rotation par numéro, si les numéros sont connus). */
function prochaineFamilleMaillots() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const next = DATA.rencontres.find((r) => r.nous && r.type === "Championnat" && new Date(r.date + "T00:00") >= t);
  return next ? { famille: maillotsPour(next), match: next } : null;
}

function tuileMaillots() {
  if (!cvApi()) return "";
  const e = cvCode() && CV.charge ? etatMaillots() : null;
  const court = { lavage: "Chez ", jeudi: "Jeudi · ", bureau: "Au bureau", coach: "Chez le coach" };
  let info = "Où sont-ils ?";
  if (e && court[e.statut] != null) {
    const fam = e.chez?.startsWith("Famille:") ? (familleDe(e.chez.slice(8))?.nom || e.chez.slice(8)) : "";
    info = e.statut === "bureau" || e.statut === "coach" ? court[e.statut] : court[e.statut] + fam;
  }
  return tuile("maillots", "🧺", "Maillots", info);
}

/** Bouton sur la page d'accueil. */
function maillotsAccueil() {
  if (!cvApi()) return "";
  const e = cvCode() && CV.charge ? etatMaillots() : null;
  const st = e && STATUTS[e.statut];
  return `<button class="ann-bouton" data-show="maillots">
    <div class="ann-bouton-titre">🧺 Maillots<span class="ann-fleche">›</span></div>
    <div class="ann-extrait">${st ? `${st.ico} ${esc(st.txt(nomChez(e.chez)))}` : cvCode() ? "Pas encore d'information sur le sac de maillots." : "Où sont les maillots ? Toucher pour voir."}</div>
  </button>`;
}

function renderMaillots() {
  const el = $("#view-maillots");
  if (!el || !DATA) return;
  let html = `<h2 class="section">Maillots</h2>`;
  if (!cvApi()) { el.innerHTML = html + `<div class="empty">Indisponible pour l'instant.</div>`; return; }
  if (!cvCode()) {
    el.innerHTML = html + `<div class="card"><p class="small muted" style="margin-top:0">Entrez votre code pour voir et indiquer où sont les maillots.</p>
      <div class="cvcode"><input id="mail-code" type="text" autocomplete="off" placeholder="Code"><button class="btn primary" data-code-de="mail-code">OK</button></div>
      ${CV.erreur ? `<div class="note">⚠️ ${esc(CV.erreur)}</div>` : ""}</div>`;
    return;
  }
  if (!CV.charge) { el.innerHTML = html + `<div class="empty">Chargement…</div>`; return; }

  const e = etatMaillots();
  const st = e && STATUTS[e.statut];
  const moi = cvMoi();
  const maFamille = moi.startsWith("Famille:") ? moi : "";
  const coach = estCoachTel();
  const prochaine = prochaineFamilleMaillots();

  html += `<div class="card">
    <h3>Où sont les maillots ?</h3>
    ${st ? `<div class="mail-etat">${st.ico} ${esc(st.txt(nomChez(e.chez)))}</div>
      ${e.maj ? `<div class="small muted">Mis à jour ${esc(new Date(e.maj).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</div>` : ""}`
      : `<p class="muted" style="margin:0">Pas encore d'information.</p>`}
  </div>`;

  if (prochaine?.famille) {
    html += `<div class="card"><h3>Prochain match</h3><div class="row"><div class="ico">🧺</div><div>
      <div class="v">${esc(prochaine.famille)}</div>
      <div class="small muted">récupère le sac après le match du ${esc(dateCourte(prochaine.match.date))}, le lave et le rapporte.</div></div></div></div>`;
  }

  // --- famille : déclarer où en sont les maillots
  if (maFamille && !coach) {
    html += `<p class="small muted" style="margin:0 4px 6px">Vous êtes <b>${esc(familleDe(maFamille.slice(8))?.libelle || "")}</b> · <a href="#" id="mail-changer">Changer</a></p>`;
    const nous = e?.chez === maFamille;
    const b = (statut, label) => `<button class="seg ${nous && e.statut === statut ? "on g" : ""}" data-mail="${statut}" data-chez="${esc(maFamille)}">${label}</button>`;
    html += `<div class="card"><h3>${esc(familleDe(maFamille.slice(8))?.libelle || "Votre famille")}</h3>
      <div class="mail-actions">
        ${b("lavage", "🧺 On a les maillots (lavage en cours)")}
        ${b("jeudi", "📦 Je les rapporte jeudi à l'entraînement")}
        ${b("bureau", "🏢 Je les dépose au bureau du club")}
      </div></div>`;
  } else if (!coach && cvRole() !== "joueur") {
    html += `<div class="card"><h3>Votre famille</h3>
      <p class="small muted" style="margin-top:0">Choisissez votre famille pour indiquer que vous avez les maillots.</p>
      <select id="mail-famille" class="cvselect"><option value="">Choisir…</option>
        ${(DATA.familles || []).map((f) => `<option value="Famille:${esc(f.enfant)}">${esc(f.nom ? "Famille " + f.nom.toUpperCase() : "Parents de " + f.enfant)}</option>`).join("")}
      </select></div>`;
  }

  // --- coach : dire qui a le sac, ou qu'il est récupéré
  if (coach) {
    html += `<div class="card"><h3>🔑 Coach</h3>
      <label class="small" style="font-weight:800;color:var(--muted)">Le sac est chez
        <select id="mail-chez" class="cvselect" style="margin-top:4px"><option value="">Choisir une famille…</option>
          ${(DATA.familles || []).map((f) => `<option value="Famille:${esc(f.enfant)}" ${e?.chez === "Famille:" + f.enfant ? "selected" : ""}>${esc(f.nom ? "Famille " + f.nom.toUpperCase() : "Parents de " + f.enfant)}</option>`).join("")}
        </select></label>
      <div class="mail-actions" style="margin-top:10px">
        <button class="seg ${e?.statut === "coach" ? "on g" : ""}" data-mail="coach" data-chez="Coach">✅ Récupérés par le coach</button>
      </div></div>`;
  }
  el.innerHTML = html;
}

document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-mail]");
  if (!b) return;
  const envoi = cvEnregistrer("maillots", "etat", { present: b.dataset.mail, conduit: b.dataset.chez, places: "" });
  renderMaillots(); renderAccueil();
  await envoi;
  renderMaillots(); renderAccueil();
});
document.addEventListener("change", async (ev) => {
  if (ev.target.id !== "mail-chez" || !ev.target.value) return;
  const envoi = cvEnregistrer("maillots", "etat", { present: "lavage", conduit: ev.target.value, places: "" });
  renderMaillots(); renderAccueil();
  await envoi;
  renderMaillots(); renderAccueil();
});
document.addEventListener("change", (ev) => {
  if (ev.target.id !== "mail-famille" || !ev.target.value) return;
  store.set("covoit-moi", ev.target.value);
  renderAll();
});
document.addEventListener("click", (ev) => {
  if (ev.target.id !== "mail-changer") return;
  ev.preventDefault();
  store.set("covoit-moi", "");
  renderAll();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.id === "mail-code") $('[data-code-de="mail-code"]').click();
});
