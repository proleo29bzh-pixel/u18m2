// Thème Noël : s'allume tout seul du 1er décembre au 4 janvier.
// Pour tester avant : ouvrir l'appli avec ?noel=1 (mémorisé sur ce téléphone), ?noel=0 pour l'enlever.
(function () {
  const q = new URLSearchParams(location.search).get("noel");
  let test = false;
  try {
    if (q === "1") localStorage.setItem("noel-test", "1");
    if (q === "0") localStorage.removeItem("noel-test");
    test = localStorage.getItem("noel-test") === "1";
  } catch (e) { test = q === "1"; }
  const d = new Date(), periode = d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 4);
  if (!(test || periode)) return;
  document.body.classList.add("noel");
  const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- bonnet sur le logo
  const brand = document.querySelector(".brand");
  if (brand && !brand.querySelector(".bonnet")) {
    brand.insertAdjacentHTML("afterbegin",
      '<svg class="bonnet" viewBox="0 0 40 34" aria-hidden="true">' +
      '<path d="M5 25 C8 12 16 3 27 4 C33 5 36 11 35 17 C31 12 27 11 24 12 C30 15 31 21 31 25 Z" fill="#d6202a"/>' +
      '<path d="M24 12 C27 13 30 17 31 25 L27 25 C27 19 26 15 24 12 Z" fill="#a8141c"/>' +
      '<rect x="2" y="23" width="32" height="8" rx="4" fill="#fff"/>' +
      '<circle cx="35" cy="18" r="4.2" fill="#fff"/></svg>');
  }

  // --- guirlande lumineuse sous la barre du haut
  const top = document.querySelector(".top");
  const COUL = ["#ff3b3b", "#ffd23f", "#2ecc71", "#4fc3ff"];
  function guirlande() {
    let g = top.querySelector(".guirlande");
    if (!g) { g = document.createElement("div"); g.className = "guirlande"; g.setAttribute("aria-hidden", "true"); top.appendChild(g); }
    const w = top.clientWidth, nSeg = Math.max(3, Math.round(w / 110)), seg = w / nSeg;
    let path = "M0 0", html = "", k = 0;
    for (let s = 0; s < nSeg; s++) {
      const x0 = s * seg;
      path += ` Q${x0 + seg / 2} 16 ${x0 + seg} 0`;
      for (const f of [0.22, 0.5, 0.78]) {
        const x = x0 + f * seg, y = 32 * f * (1 - f);
        html += `<i style="left:${x - 4}px;top:${y + 1}px;--c:${COUL[k % 4]};animation-delay:${(k % 3) * 0.55}s"></i>`;
        k++;
      }
    }
    g.innerHTML = `<svg width="${w}" height="12" viewBox="0 0 ${w} 12"><path d="${path}" fill="none" stroke="#1d3326" stroke-width="1.6"/></svg>` + html;
  }
  guirlande();
  addEventListener("resize", guirlande);

  // --- neige légère derrière les cartes
  const c = document.createElement("canvas");
  c.className = "neige"; c.setAttribute("aria-hidden", "true");
  document.body.prepend(c);
  const ctx = c.getContext("2d"), sombre = matchMedia("(prefers-color-scheme: dark)");
  let W, H, flocons = [];
  function taille() {
    const r = devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    c.width = W * r; c.height = H * r; ctx.setTransform(r, 0, 0, r, 0, 0);
    const n = Math.min(70, Math.round(W * H / 16000));
    while (flocons.length < n) flocons.push(nouveau(true));
    flocons.length = n;
  }
  function nouveau(partout) {
    return { x: Math.random() * W, y: partout ? Math.random() * H : -6, r: 1 + Math.random() * 2.4,
             v: 0.25 + Math.random() * 0.6, a: Math.random() * 6.28, o: 0.4 + Math.random() * 0.5 };
  }
  function dessine() {
    ctx.clearRect(0, 0, W, H);
    const base = sombre.matches ? "255,255,255" : "140,165,205";
    for (const f of flocons) {
      ctx.globalAlpha = f.o;
      ctx.fillStyle = `rgb(${base})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
    }
  }
  function boucle() {
    if (!document.hidden) {
      for (const f of flocons) {
        f.a += 0.01; f.y += f.v; f.x += Math.sin(f.a) * 0.35;
        if (f.y > H + 6) Object.assign(f, nouveau(false));
      }
      dessine();
    }
    requestAnimationFrame(boucle);
  }
  taille();
  addEventListener("resize", taille);
  if (calme) dessine(); else requestAnimationFrame(boucle);
})();
