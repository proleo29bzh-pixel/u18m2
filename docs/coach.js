"use strict";
/* Espace coach : séances du jeudi chiffrées (coach.enc.json), déchiffrées dans le navigateur
   avec le mot de passe coach, + schémas de terrain dessinés en SVG.
   Utilise les globales de app.js (DATA, $, esc, show). */

const COACH = { seances: null, erreur: null, ouverte: 0, mdp: "", notes: [], licences: [], licCle: "", licOuvert: false, licVue: null };
const coachStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
};

// ------------------------------------------------------------ déchiffrement (AES-GCM, clé PBKDF2-SHA256)

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function coachDechiffrer(mdp) {
  const res = await fetch("coach.enc.json?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("absent");
  const enc = await res.json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(mdp), "PBKDF2", false, ["deriveKey"]);
  const cle = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(enc.sel), iterations: enc.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, cle, b64(enc.data));
  return JSON.parse(new TextDecoder().decode(clair));
}

async function coachOuvrir(mdp, memoriser) {
  try {
    const contenu = await coachDechiffrer(mdp);
    COACH.seances = (contenu.seances || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    COACH.notes = contenu.notes_staff || [];
    COACH.licences = contenu.licences || [];
    COACH.licCle = contenu.licences_cle || "";
    COACH.licTexte = contenu.licences_texte || [];
    COACH.erreur = null;
    COACH.mdp = mdp;
    if (memoriser) coachStore.set("coach-mdp", mdp);
  } catch (e) {
    COACH.seances = null;
    COACH.erreur = e.message === "absent" ? "Aucune séance publiée pour l'instant." : "Mot de passe incorrect.";
    coachStore.set("coach-mdp", "");
  }
  renderCoach();
}

// ------------------------------------------------------------ schémas de terrain (SVG)

const COUL = { navy: "#0b1f4d", rouge: "#e30613", vert: "#15803d", orange: "#ff7a1a", gris: "#4b5563", bois: "#ecc995", raquette: "#dcae72", ligne: "#ffffff" };

function schemaSVG(sc) {
  const t = sc.terrain || "demi";
  const L = t === "zone" ? sc.l : 15;
  const H = t === "zone" ? sc.h : t === "complet" ? 28 : 14;
  const S = t === "complet" ? 13 : t === "zone" ? Math.min(320 / L, 300 / H) : 22;   // pixels par mètre
  const M = 10;                                                                     // marge
  const P = (x, y) => [M + x * S, M + y * S];
  const f = (n) => n.toFixed(1);
  const W = L * S + 2 * M, Ht = H * S + 2 * M;
  let o = "";

  // --- sol et lignes
  o += `<rect x="${M}" y="${M}" width="${f(L * S)}" height="${f(H * S)}" rx="4" fill="${COUL.bois}" stroke="${COUL.ligne}" stroke-width="2.5"/>`;
  const demiTerrain = (haut) => {         // haut = true : panier en haut ; false : panier en bas (terrain complet)
    const Y = (y) => haut ? y : 28 - y;
    const [px, py] = P(5.05, haut ? 0 : 28 - 5.8);
    o += `<rect x="${f(px)}" y="${f(py)}" width="${f(4.9 * S)}" height="${f(5.8 * S)}" fill="${COUL.raquette}" stroke="${COUL.ligne}" stroke-width="2"/>`;
    const [cx, cy] = P(7.5, Y(5.8));
    o += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(1.8 * S)}" fill="none" stroke="${COUL.ligne}" stroke-width="2"/>`;
    const [ax, ay] = P(0.9, Y(2.99)), [bx, by] = P(14.1, Y(2.99));
    const [a0x, a0y] = P(0.9, Y(0)), [b0x, b0y] = P(14.1, Y(0));
    o += `<path d="M${f(a0x)} ${f(a0y)} L${f(ax)} ${f(ay)} A${f(6.75 * S)} ${f(6.75 * S)} 0 0 ${haut ? 0 : 1} ${f(bx)} ${f(by)} L${f(b0x)} ${f(b0y)}" fill="none" stroke="${COUL.ligne}" stroke-width="2"/>`;
    const [p1x, p1y] = P(6.6, Y(1.2)), [p2x] = P(8.4, 0);
    o += `<line x1="${f(p1x)}" y1="${f(p1y)}" x2="${f(p2x)}" y2="${f(p1y)}" stroke="#374151" stroke-width="3"/>`;
    const [hx, hy] = P(7.5, Y(1.575));
    o += `<circle cx="${f(hx)}" cy="${f(hy)}" r="${f(0.3 * S)}" fill="none" stroke="${COUL.orange}" stroke-width="2.5"/>`;
  };
  if (t === "demi") {
    demiTerrain(true);
    const [cx, cy] = P(7.5, 14);
    o += `<path d="M${f(cx - 1.8 * S)} ${f(cy)} A${f(1.8 * S)} ${f(1.8 * S)} 0 0 1 ${f(cx + 1.8 * S)} ${f(cy)}" fill="none" stroke="${COUL.ligne}" stroke-width="2"/>`;
  } else if (t === "complet") {
    demiTerrain(true); demiTerrain(false);
    const [lx, ly] = P(0, 14), [rx] = P(15, 0), [cx, cy] = P(7.5, 14);
    o += `<line x1="${f(lx)}" y1="${f(ly)}" x2="${f(rx)}" y2="${f(ly)}" stroke="${COUL.ligne}" stroke-width="2"/>`;
    o += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(1.8 * S)}" fill="none" stroke="${COUL.ligne}" stroke-width="2"/>`;
  } else if (sc.taille) {
    o += `<text x="${f(W - M - 6)}" y="${f(Ht - M - 6)}" text-anchor="end" class="sc-txt">${esc(sc.taille)}</text>`;
  }

  // --- pack line : ligne imaginaire à ~5 m du panier (demi-terrain, panier en haut)
  if (sc.packline && t === "demi") {
    const r = sc.packline === true ? 5 : sc.packline;
    const [g0x, g0y] = P(7.5 - r, 0), [gx, gy] = P(7.5 - r, 1.575), [dx, dy] = P(7.5 + r, 1.575), [d0x, d0y] = P(7.5 + r, 0);
    o += `<path d="M${f(g0x)} ${f(g0y)} L${f(gx)} ${f(gy)} A${f(r * S)} ${f(r * S)} 0 0 0 ${f(dx)} ${f(dy)} L${f(d0x)} ${f(d0y)}" fill="rgba(255,122,26,.13)" stroke="${COUL.orange}" stroke-width="3" stroke-dasharray="9 6"/>`;
  }

  // --- flèches
  const couleurFleche = { course: COUL.navy, passe: COUL.navy, dribble: COUL.navy, tir: COUL.rouge, rotation: COUL.gris, ensuite: COUL.gris };
  const fleche = (e) => {
    const type = e.style === "ensuite" ? "ensuite" : e.type;
    const c = e.def ? COUL.rouge : couleurFleche[type] || COUL.navy;   // def : déplacement d'un défenseur
    const [x1, y1] = P(...e.de), [x2, y2] = P(...e.a);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;                     // normale
    const k = (e.courbe || 0) * S;
    const qx = (x1 + x2) / 2 + nx * k, qy = (y1 + y2) / 2 + ny * k;
    const pt = (u) => [(1 - u) ** 2 * x1 + 2 * (1 - u) * u * qx + u * u * x2, (1 - u) ** 2 * y1 + 2 * (1 - u) * u * qy + u * u * y2];
    let d;
    if (type === "dribble") {                                // ligne ondulée, droite sur la fin pour la pointe
      const n = Math.max(12, Math.round(len / 3)), amp = 0.17 * S, onde = 0.7 * S;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, [px, py] = pt(u), s = u * len;
        const w = u < 1 - 10 / len ? amp * Math.sin((2 * Math.PI * s) / onde) : 0;
        pts.push(`${f(px + nx * w)} ${f(py + ny * w)}`);
      }
      d = "M" + pts.join(" L");
    } else {
      d = `M${f(x1)} ${f(y1)} Q${f(qx)} ${f(qy)} ${f(x2)} ${f(y2)}`;
    }
    const tirets = { passe: "7 5", tir: "2 5", rotation: "9 6", ensuite: "6 6" }[type] || "";
    const epaisseur = type === "rotation" ? 3.5 : 2.2;
    const id = { [COUL.navy]: "n", [COUL.rouge]: "r", [COUL.gris]: "g" }[c];
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${epaisseur}" stroke-linecap="round" ${tirets ? `stroke-dasharray="${tirets}"` : ""}
      marker-end="url(#fl-${id})" ${e.double ? `marker-start="url(#fl-${id}-d)"` : ""} ${type === "rotation" ? 'opacity=".75"' : ""}/>`;
  };

  // --- éléments (zones et tapis d'abord, puis flèches, puis joueurs et plots par-dessus)
  const els = sc.elements || [];
  for (const e of els.filter((x) => x.t === "zone" || x.t === "tapis")) {
    const [x, y] = P(e.x, e.y);
    if (e.t === "zone") {
      o += `<rect x="${f(x)}" y="${f(y)}" width="${f(e.l * S)}" height="${f(e.h * S)}" rx="8" fill="rgba(11,31,77,.12)" stroke="${COUL.navy}" stroke-width="2" stroke-dasharray="6 4"/>`;
      o += `<text x="${f(x + 6)}" y="${f(y + 15)}" class="sc-zone">${esc(e.label || "")}</text>`;
    } else {
      o += `<rect x="${f(x)}" y="${f(y)}" width="${f(e.l * S)}" height="${f(e.h * S)}" rx="5" fill="${COUL.gris}" opacity=".85"/>`;
      o += `<text x="${f(x + (e.l * S) / 2)}" y="${f(y + (e.h * S) / 2 + 4)}" text-anchor="middle" class="sc-tapis">${esc(e.label || "")}</text>`;
    }
  }
  for (const e of els.filter((x) => x.t === "fleche")) o += fleche(e);
  const R = Math.max(9, Math.min(12, 0.55 * S));
  for (const e of els) {
    const [x, y] = P(e.x ?? 0, e.y ?? 0);
    if (e.t === "plot") {
      const r = Math.max(6, 0.32 * S);
      o += `<path d="M${f(x)} ${f(y - r)} L${f(x + r * 0.9)} ${f(y + r * 0.6)} L${f(x - r * 0.9)} ${f(y + r * 0.6)} Z" fill="${COUL.orange}" stroke="#7c2d12" stroke-width="1.5"/>`;
    } else if (e.t === "att" || e.t === "def" || e.t === "coach") {
      const c = e.t === "att" ? COUL.navy : e.t === "def" ? COUL.rouge : COUL.vert;
      const lab = e.label || (e.t === "coach" ? "C" : "");
      o += `<g ${e.passif ? 'opacity=".55"' : ""}><circle cx="${f(x)}" cy="${f(y)}" r="${R}" fill="${c}" stroke="#fff" stroke-width="2"/>
        <text x="${f(x)}" y="${f(y + 4.5)}" text-anchor="middle" class="sc-lab">${esc(lab)}</text></g>`;
      if (e.ballon) o += `<circle cx="${f(x + R * 0.9)}" cy="${f(y + R * 0.9)}" r="${f(R * 0.5)}" fill="${COUL.orange}" stroke="#7c2d12" stroke-width="1.5"/>`;
    } else if (e.t === "texte") {
      o += `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" class="sc-txt">${esc(e.txt)}</text>`;
    }
  }

  const marqueur = (id, c) => `
    <marker id="fl-${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>
    <marker id="fl-${id}-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`;
  return `<svg class="schema" viewBox="0 0 ${f(W)} ${f(Ht)}" role="img" aria-label="Schéma de l'exercice">
    <defs>${marqueur("n", COUL.navy)}${marqueur("r", COUL.rouge)}${marqueur("g", COUL.gris)}</defs>${o}</svg>`;
}

const LEGENDE = `<div class="legende">
  <span><i class="lg att"></i>attaquant</span><span><i class="lg def"></i>défenseur</span><span><i class="lg coach"></i>coach</span>
  <span><i class="lg plot"></i>plot</span><span><i class="lg ballon"></i>ballon</span>
  <span><i class="lg trait"></i>course</span><span><i class="lg tirets"></i>passe</span><span><i class="lg onde">∿</i>dribble</span><span><i class="lg points"></i>tir</span>
  <span><i class="lg trait" style="border-color:#e30613"></i>course défenseur</span><span><i class="lg tirets" style="border-color:#ff7a1a;border-top-width:3px"></i>pack line</span>
</div>`;

// ------------------------------------------------------------ rendu de la page

function blocExercice(titre, duree, but, schema, consignes, points, num) {
  return `<div class="card exo">
    <div class="exo-head">${num ? `<span class="exo-num">${num}</span>` : ""}<div><div class="exo-titre">${esc(titre)}</div>${duree ? `<div class="small muted">⏱ ${esc(duree)}</div>` : ""}</div></div>
    ${but ? `<p class="exo-but">🎯 ${esc(but)}</p>` : ""}
    ${schema ? schemaSVG(schema) : ""}
    ${consignes?.length ? `<ul class="puces">${consignes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    ${points?.length ? `<div class="exo-points">${points.map((p) => `<span class="cchip">✔ ${esc(p)}</span>`).join("")}</div>` : ""}
  </div>`;
}

/** Notes privées du staff (chiffrées avec les séances : invisibles pour les parents et les joueurs). */
function notesStaff() {
  if (!COACH.notes?.length) return "";
  // repliée par défaut, en bas de page : il faut l'ouvrir volontairement
  return `<details class="card notes-staff"><summary>📝 Notes de Léo</summary>
    ${COACH.notes.map((n) => `<div class="note-staff">
      ${n.date ? `<div class="small muted">${esc(new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(n.date + "T12:00")))}</div>` : ""}
      ${n.titre ? `<b>${esc(n.titre)}</b>` : ""}
      <div>${esc(n.texte)}</div>
    </div>`).join("")}
  </details>`;
}

// ------------------------------------------------------------ licences (fichiers chiffrés, clé dans coach.enc.json)

async function licenceOuvrir(i) {
  const l = COACH.licences[i];
  if (COACH.licVue?.url) URL.revokeObjectURL(COACH.licVue.url);
  COACH.licVue = { i, url: "", erreur: "" };
  renderCoach();
  try {
    const res = await fetch(l.f, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const brut = new Uint8Array(await res.arrayBuffer());
    const cle = await crypto.subtle.importKey("raw", b64(COACH.licCle), "AES-GCM", false, ["decrypt"]);
    const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: brut.slice(0, 12) }, cle, brut.slice(12));
    COACH.licVue = { i, url: URL.createObjectURL(new Blob([clair], { type: l.type })), erreur: "" };
  } catch {
    COACH.licVue = { i, url: "", erreur: "Impossible d'ouvrir cette licence (réseau ?)." };
  }
  renderCoach();
}

function blocLicences() {
  if (!COACH.licOuvert) return "";
  const v = COACH.licVue;
  const l = v ? COACH.licences[v.i] : null;
  const vue = !v ? "" : v.erreur ? `<div class="note">⚠️ ${esc(v.erreur)}</div>`
    : !v.url ? `<p class="small muted">Ouverture…</p>`
    : l.type === "application/pdf" ? `<a class="btn primary" href="${v.url}" target="_blank" rel="noopener">📄 Ouvrir la licence de ${esc(l.nom)}</a>`
    : `<a href="${v.url}" target="_blank" rel="noopener"><img src="${v.url}" alt="Licence de ${esc(l.nom)}" style="width:100%;border-radius:10px;display:block"></a>
       <p class="small muted" style="margin:6px 0 0;text-align:center">Touchez l'image pour l'agrandir</p>`;
  const fiches = COACH.licTexte || [];
  const date = (d) => d ? d.split("-").reverse().join("/") : "";
  // fiches texte (dictées par le coach) : joueurs par ordre alphabétique, staff en dernier
  const blocFiches = fiches.length ? `<div class="lic-liste">${fiches.slice().sort((a, b) => !!a.staff - !!b.staff || a.nom.localeCompare(b.nom)).map((f) => `
    <details class="lic-fiche"><summary><span>${f.staff ? "🎽" : "🏀"} ${esc(f.nom)}${f.surnom ? ` <span class="muted small">(${esc(f.surnom)})</span>` : ""}</span><b>${esc(f.numero)}</b></summary>
      <div class="lic-detail">
        ${f.type ? `<div><span class="k">Licence</span>${esc(f.type)}</div>` : ""}
        ${f.fonction ? `<div><span class="k">Fonction</span>${esc(f.fonction)}</div>` : ""}
        ${f.naissance ? `<div><span class="k">Né le</span>${date(f.naissance)}</div>` : ""}
        ${f.assurance ? `<div><span class="k">Assurance</span>Formule ${esc(f.assurance)}</div>` : ""}
        ${f.qualification ? `<div><span class="k">Qualifié le</span>${date(f.qualification)}</div>` : ""}
      </div></details>`).join("")}</div>` : "";
  return `<div class="card">
    <h3>🪪 Licences${fiches.length ? ` <span class="muted small">(${fiches.length})</span>` : ""}</h3>
    ${blocFiches}
    ${COACH.licences.length ? `<div class="segs" style="flex-wrap:wrap;margin-top:${fiches.length ? 12 : 0}px">${COACH.licences.map((x, i) =>
      `<button class="seg ${v?.i === i ? "on g" : ""}" data-licence="${i}">📎 ${esc(x.nom)}</button>`).join("")}</div>` : ""}
    ${!fiches.length && !COACH.licences.length ? `<p class="small muted" style="margin:0">Aucune licence pour l'instant.</p>` : ""}
    ${vue ? `<div style="margin-top:12px">${vue}</div>` : ""}
  </div>`;
}

function renderCoach() {
  const el = $("#view-coach");
  if (!el) return;
  if (!COACH.seances) {
    el.innerHTML = `<h2 class="section">Espace coach 🔒</h2>
      <div class="card">
        <p class="small muted" style="margin-top:0">Séances du jeudi, réservées au coach.</p>
        <div class="cvcode"><input id="coach-mdp" type="password" autocomplete="current-password" placeholder="Mot de passe coach"><button class="btn primary" id="coach-ok">Ouvrir</button></div>
        <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="coach-memo"> Rester connecté sur cet appareil</label>
        ${COACH.erreur ? `<div class="note">⚠️ ${esc(COACH.erreur)}</div>` : ""}
      </div>`;
    return;
  }
  const liste = COACH.seances;
  const ouvertes = COACH.ouvertes || (COACH.ouvertes = new Set());
  // une séance = un bloc repliable (la plus récente en haut) : on garde l'historique de tous les entraînements
  const blocSeance = (s, i) => {
    const dateS = s.date ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(s.date + "T12:00")).replace(/ 1 /, " 1er ") : "";
    return `<details class="card seance-pli" data-seance="${i}" ${ouvertes.has(i) ? "open" : ""}>
      <summary>🏀 ${esc(dateS ? dateS.charAt(0).toUpperCase() + dateS.slice(1) : "Séance")} · ${esc(s.titre || "")}</summary>
      ${s.resume ? `<p style="margin:10px 0 0">${esc(s.resume)}</p>` : ""}
      ${s.bilan ? `<div class="note" style="margin-top:10px">📋 ${esc(s.bilan)}</div>` : ""}
      ${LEGENDE}
      ${s.organisation?.length || s.plan ? `<div class="card exo"><div class="exo-titre">Organisation</div>
        ${s.plan ? schemaSVG(s.plan) : ""}${s.plan?.legende ? `<p class="small muted" style="margin:4px 0 0;text-align:center">${esc(s.plan.legende)}</p>` : ""}
        ${s.organisation?.length ? `<ul class="puces">${s.organisation.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}</div>` : ""}
      ${(s.ateliers || []).map((a) => blocExercice(a.titre, a.duree, a.but, a.schema, a.consignes, a.points_cles, a.num)).join("")}
      ${s.bonus ? blocExercice(s.bonus.titre, s.bonus.duree, s.bonus.but, s.bonus.schema, s.bonus.consignes, s.bonus.points_cles, "+") : ""}
      ${s.etirements ? `<div class="card exo"><div class="exo-titre">🧘 Étirements de fin</div><p style="margin:8px 0 0">${esc(s.etirements)}</p></div>` : ""}
    </details>`;
  };

  el.innerHTML = `<h2 class="section">Espace coach</h2>
    <button class="btn ${COACH.licOuvert ? "primary" : ""}" id="coach-licences" style="width:100%;margin-bottom:12px">🪪 Licences ${COACH.licOuvert ? "▴" : "▾"}</button>
    ${blocLicences()}
    <h3 class="seances-titre">Séances du jeudi</h3>
    ${liste.length ? liste.map(blocSeance).join("") : `<div class="empty">Aucune séance pour l'instant.</div>`}
    ${notesStaff()}
    <p class="foot"><a href="#" id="coach-lock">🔒 Verrouiller</a></p>`;
}

// ------------------------------------------------------------ événements

document.addEventListener("click", async (e) => {
  if (e.target.id === "coach-ok") {
    const mdp = $("#coach-mdp").value;
    if (!mdp) return;
    e.target.disabled = true; e.target.textContent = "…";
    return coachOuvrir(mdp, $("#coach-memo").checked);
  }
  if (e.target.id === "coach-licences") { COACH.licOuvert = !COACH.licOuvert; return renderCoach(); }
  const lb = e.target.closest("[data-licence]");
  if (lb) return licenceOuvrir(+lb.dataset.licence);
  if (e.target.id === "coach-lock") {
    e.preventDefault();
    if (COACH.licVue?.url) URL.revokeObjectURL(COACH.licVue.url);
    COACH.seances = null; COACH.erreur = null; COACH.mdp = ""; coachStore.set("coach-mdp", "");
    COACH.licences = []; COACH.licCle = ""; COACH.licTexte = []; COACH.licOuvert = false; COACH.licVue = null;
    return renderCoach();
  }
  const sb = e.target.closest("[data-coach-seance]");
  if (sb) { COACH.ouverte = Number(sb.dataset.coachSeance); renderCoach(); window.scrollTo({ top: 0 }); }
});
document.addEventListener("toggle", (e) => {
  const d = e.target.closest?.("[data-seance]");
  if (!d) return;
  const i = Number(d.dataset.seance);
  COACH.ouvertes = COACH.ouvertes || new Set();
  d.open ? COACH.ouvertes.add(i) : COACH.ouvertes.delete(i);
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "coach-mdp") $("#coach-ok").click();
});

// session mémorisée sur cet appareil
if (coachStore.get("coach-mdp")) coachOuvrir(coachStore.get("coach-mdp"), true);
