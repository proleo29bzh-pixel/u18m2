"use strict";
/* Annonces : publiées par le staff (Espace coach), lues par tous sur l'accueil, réaction 👍.
   Stockées dans le Google Sheet (même script que le covoit). Le script filtre selon le code :
   un joueur ne reçoit jamais une annonce « parents » et inversement.
   Utilise les globales de app.js / covoit.js / coach.js (DATA, $, esc, show, store, cvApi, cvCode, cvMoi, nomDe, COACH). */

const ANN = { liste: null, role: null, erreur: null, envoi: false };

/** Code utilisé : celui du covoit, sinon le mot de passe coach si l'Espace coach est ouvert. */
const annCode = () => cvCode() || (typeof COACH !== "undefined" && COACH.mdp) || "";
const annVues = () => store.get("annonces-vues") || "";
const annLikes = () => { try { return JSON.parse(store.get("annonces-likes") || "[]"); } catch { return []; } };

async function annCharger(code = annCode()) {
  if (!cvApi() || !code) { ANN.liste = null; return; }
  try {
    const res = await fetch(cvApi() + "?action=annonces&code=" + encodeURIComponent(code));
    const j = await res.json();
    if (j.ok && Array.isArray(j.annonces)) { ANN.liste = j.annonces; ANN.role = j.role; ANN.erreur = null; }
    else if (j.ok) { ANN.liste = []; ANN.erreur = null; }   // ancien script : pas encore d'annonces
    else ANN.erreur = j.erreur;
  } catch {
    ANN.erreur = "réseau";
  }
}

async function annEnvoyer(corps, code = annCode()) {
  const res = await fetch(cvApi(), { method: "POST", body: JSON.stringify({ code, ...corps }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.erreur || "erreur");
  ANN.liste = j.annonces; ANN.role = j.role;
}

// ------------------------------------------------------------ affichage

function quandAnnonce(iso) {
  const d = new Date(iso), min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60 && d.getDate() === new Date().getDate()) return `aujourd'hui à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d).replace(/\./g, "");
}

/** Texte de l'annonce : retours à la ligne et liens cliquables. */
const texteAnnonce = (t) => esc(t).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const POUR = { parents: "Parents", joueurs: "Joueurs" };

function carteAnnonce(a, opts = {}) {
  const nouveau = a.date && a.date > (opts.vues ?? annVues());
  const like = annLikes().includes(a.id);
  return `<div class="annonce ${nouveau && !opts.coach ? "nouv" : ""}">
    <div class="ann-tete">
      <b>📢 ${esc(a.auteur)}</b>${a.pour !== "tous" ? `<span class="tag ann-pour">${POUR[a.pour] || a.pour}</span>` : ""}
      ${nouveau && !opts.coach ? `<span class="tag ann-new">Nouveau</span>` : ""}
      <span class="ann-date">${esc(quandAnnonce(a.date))}</span>
    </div>
    <div class="ann-texte">${texteAnnonce(a.texte)}</div>
    <div class="ann-pied">
      ${opts.coach
        ? `<span class="small muted">👍 ${a.likes}${a.qui?.length ? " · " + esc(a.qui.map(nomDe).join(", ")) : ""}</span>
           <button class="btn ann-suppr" data-ann-suppr="${esc(a.id)}">Supprimer</button>`
        : `<button class="ann-like ${like ? "on" : ""}" data-ann-like="${esc(a.id)}">👍 ${a.likes || ""}</button>`}
    </div>
  </div>`;
}

/** Bouton unique sur la page d'accueil (ouvre la page des annonces). */
function annoncesAccueil() {
  if (!cvApi()) return "";
  if (!annCode()) {
    return `<button class="ann-bouton" data-show="covoit">
      <div class="ann-bouton-titre">📢 Annonces de l'équipe</div>
      <div class="small muted">Entrez votre code dans l'onglet Covoiturage pour les voir</div></button>`;
  }
  if (!ANN.liste?.length) return "";
  const nouvelles = ANN.liste.filter((a) => a.date > annVues()).length;
  const der = ANN.liste[0];
  const extrait = der.texte.replace(/\s+/g, " ").slice(0, 90) + (der.texte.length > 90 ? "…" : "");
  return `<button class="ann-bouton ${nouvelles ? "nouv" : ""}" data-show="annonces">
    <div class="ann-bouton-titre">📢 Annonces ${nouvelles ? `<span class="tag ann-new">${nouvelles} nouvelle${nouvelles > 1 ? "s" : ""}</span>` : ""}<span class="ann-fleche">›</span></div>
    <div class="ann-extrait"><b>${esc(der.auteur)} :</b> ${esc(extrait)}</div>
  </button>`;
}

function renderAnnonces() {
  const el = $("#view-annonces");
  if (!el) return;
  el.innerHTML = `<h2 class="section">Annonces</h2>
    ${!annCode() ? `<div class="empty">Entrez votre code dans l'onglet Covoiturage pour voir les annonces.</div>`
      : !ANN.liste?.length ? `<div class="empty">Pas encore d'annonce.</div>`
      : ANN.liste.map((a) => carteAnnonce(a, { vues: ANN.vuesAvant ?? annVues() })).join("")}`;
}

/** Partie « publier » de l'Espace coach. */
function annoncesCoach() {
  if (!cvApi()) return "";
  const coachs = DATA.coachs || [];
  const auteur = store.get("annonce-auteur") || coachs[0]?.nom || "";
  return `<div class="card">
    <div class="exo-titre">📢 Publier une annonce</div>
    <textarea id="ann-texte" class="ann-saisie" rows="4" maxlength="2000" placeholder="Ex. : Entraînement de vendredi annulé, gymnase fermé."></textarea>
    <div class="ann-options">
      <label>De <select id="ann-auteur" class="cvselect">${coachs.map((c) => `<option ${c.nom === auteur ? "selected" : ""}>${esc(c.nom)}</option>`).join("")}</select></label>
      <label>Pour <select id="ann-pour" class="cvselect"><option value="tous">Tout le monde</option><option value="joueurs">Joueurs</option><option value="parents">Parents</option></select></label>
    </div>
    <button class="btn primary full" id="ann-publier" ${ANN.envoi ? "disabled" : ""}>${ANN.envoi ? "Publication…" : "Publier"}</button>
    ${ANN.erreur === "code" || ANN.erreur === "réservé au staff" ? `<div class="note">⚠️ Le script Google ne reconnaît pas encore le mot de passe coach : il faut mettre à jour le script (CODE_COACH).</div>` : ""}
    ${ANN.role === "coach" && ANN.liste?.length ? `<div class="cvl"><div class="k">Annonces publiées</div>${ANN.liste.map((a) => carteAnnonce(a, { coach: true })).join("")}</div>` : ""}
  </div>`;
}

// ------------------------------------------------------------ événements

document.addEventListener("click", async (e) => {
  const lk = e.target.closest("[data-ann-like]");
  if (lk) {
    const qui = cvMoi();
    if (!qui) { alert("Choisissez d'abord qui vous êtes dans l'onglet Covoiturage."); return; }
    const id = lk.dataset.annLike;
    const likes = annLikes();
    store.set("annonces-likes", JSON.stringify(likes.includes(id) ? likes.filter((x) => x !== id) : [...likes, id]));
    lk.disabled = true;
    try { await annEnvoyer({ action: "reaction", annonce: id, qui }); } catch {}
    renderAccueil(); renderAnnonces();
    return;
  }
  if (e.target.id === "ann-publier") {
    const texte = $("#ann-texte").value.trim();
    if (!texte) return;
    store.set("annonce-auteur", $("#ann-auteur").value);
    ANN.envoi = true; renderCoach();
    try {
      await annEnvoyer({ action: "annonce", texte, auteur: $("#ann-auteur").value, pour: $("#ann-pour").value }, COACH.mdp);
      ANN.erreur = null;
    } catch (err) { ANN.erreur = err.message; }
    ANN.envoi = false; renderCoach(); renderAccueil(); renderAnnonces();
    return;
  }
  const sp = e.target.closest("[data-ann-suppr]");
  if (sp && confirm("Supprimer cette annonce ?")) {
    try { await annEnvoyer({ action: "supprimer", id: sp.dataset.annSuppr }, COACH.mdp); } catch (err) { ANN.erreur = err.message; }
    renderCoach(); renderAccueil(); renderAnnonces();
  }
});

// Ouvrir la page des annonces = tout est lu
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-show="annonces"]') && ANN.liste?.length) {
    ANN.vuesAvant = annVues();   // garder le « Nouveau » visible sur la page qu'on ouvre
    store.set("annonces-vues", ANN.liste[0].date);
    setTimeout(() => { renderAnnonces(); renderAccueil(); }, 0);
  }
});
