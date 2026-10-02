"use strict";
/* Annonces : écrites dans config/infos.json (« annonces »), affichées via un bouton sur l'accueil.
   Pas de code, pas de serveur. Le badge « nouveau » est retenu sur chaque téléphone.
   Utilise les globales de app.js (DATA, $, esc, renderAccueil). */

const ANN = { vuesAvant: null };
const annStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const annVues = () => annStore.get("annonces-vues") || "";
const annListe = () => (DATA?.annonces || []).filter((a) => a.texte).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

function quandAnnonce(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const jours = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
  const h = iso.length > 10 ? " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  if (jours === 0) return "aujourd'hui" + h;
  if (jours === 1) return "hier" + h;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(d).replace(/\./g, "");
}

/** Texte de l'annonce : retours à la ligne et liens cliquables. */
const texteAnnonce = (t) => esc(t).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

function tuileAnnonces() {
  const liste = annListe();
  const n = liste.filter((a) => (a.date || "") > annVues()).length;
  return tuile("annonces", "📢", "Annonces", n ? `${n} nouvelle${n > 1 ? "s" : ""}` : liste.length ? "Rien de neuf" : "Aucune", n > 0);
}

/** Bouton unique sur la page d'accueil (ouvre la page des annonces). */
function annoncesAccueil() {
  const liste = annListe();
  if (!liste.length) {
    return `<button class="ann-bouton" data-show="annonces">
      <div class="ann-bouton-titre">📢 Annonces<span class="ann-fleche">›</span></div>
      <div class="ann-extrait">Pas d'annonce pour l'instant.</div></button>`;
  }
  const nouvelles = liste.filter((a) => (a.date || "") > annVues()).length;
  const der = liste[0];
  const extrait = der.texte.replace(/\s+/g, " ").slice(0, 90) + (der.texte.length > 90 ? "…" : "");
  return `<button class="ann-bouton ${nouvelles ? "nouv" : ""}" data-show="annonces">
    <div class="ann-bouton-titre">📢 Annonces ${nouvelles ? `<span class="tag ann-new">${nouvelles} nouvelle${nouvelles > 1 ? "s" : ""}</span>` : ""}<span class="ann-fleche">›</span></div>
    <div class="ann-extrait">${der.auteur ? `<b>${esc(der.auteur)} :</b> ` : ""}${esc(extrait)}</div>
  </button>`;
}

function renderAnnonces() {
  const el = $("#view-annonces");
  if (!el) return;
  const vues = ANN.vuesAvant ?? annVues();
  const liste = annListe();
  el.innerHTML = `<h2 class="section">Annonces</h2>
    ${!liste.length ? `<div class="empty">Pas d'annonce pour l'instant.</div>` : liste.map((a) => `
      <div class="annonce ${(a.date || "") > vues ? "nouv" : ""}">
        <div class="ann-tete">
          <b>📢 ${esc(a.auteur || "Le staff")}</b>
          ${(a.date || "") > vues ? `<span class="tag ann-new">Nouveau</span>` : ""}
          <span class="ann-date">${esc(quandAnnonce(a.date))}</span>
        </div>
        ${a.titre ? `<div class="ann-titre">${esc(a.titre)}</div>` : ""}
        <div class="ann-texte">${texteAnnonce(a.texte)}</div>
      </div>`).join("")}`;
}

// Ouvrir la page des annonces = tout est lu (le « Nouveau » reste visible sur la page ouverte)
document.addEventListener("click", (e) => {
  if (!e.target.closest('[data-show="annonces"]')) return;
  const liste = annListe();
  if (!liste.length) return;
  ANN.vuesAvant = annVues();
  annStore.set("annonces-vues", liste[0].date || "");
  setTimeout(() => { renderAnnonces(); renderAccueil(); }, 0);
});
