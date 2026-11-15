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
  // Interrupteur caché (utile dans l'appli installée) : toucher 5 fois le logo en haut à gauche.
  let taps = [];
  document.querySelector(".brand-logo")?.addEventListener("click", () => {
    const t = Date.now(); taps = taps.filter((x) => t - x < 2500).concat(t);
    if (taps.length < 5) return;
    try { test ? localStorage.removeItem("noel-test") : localStorage.setItem("noel-test", "1"); } catch (e) {}
    location.reload();
  });
  const d = new Date(), periode = d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 4);
  if (!(test || periode)) return;
  document.body.classList.add("noel");
  const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // police élégante, chargée seulement pendant le thème
  const police = document.createElement("link");
  police.rel = "stylesheet";
  police.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,600&display=swap";
  document.head.appendChild(police);

  // --- bonnet sur le logo
  const brand = document.querySelector(".brand");
  if (brand && !brand.querySelector(".bonnet")) {
    brand.insertAdjacentHTML("afterbegin",
      '<svg class="bonnet" viewBox="0 0 40 34" aria-hidden="true"><defs>' +
      '<linearGradient id="bn-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2303a"/><stop offset="1" stop-color="#8e0f17"/></linearGradient>' +
      '<linearGradient id="bn-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9dee8"/></linearGradient></defs>' +
      '<path d="M5 25 C8 12 16 3 27 4 C33 5 36 11 35 17 C31 12 27 11 24 12 C30 15 31 21 31 25 Z" fill="url(#bn-r)"/>' +
      '<rect x="2" y="23" width="32" height="8" rx="4" fill="url(#bn-f)"/>' +
      '<circle cx="35" cy="18" r="4.2" fill="url(#bn-f)"/></svg>');
  }

  // --- guirlande : petites lumières chaudes sur un fil fin
  const top = document.querySelector(".top");
  function guirlande() {
    let g = top.querySelector(".guirlande");
    if (!g) { g = document.createElement("div"); g.className = "guirlande"; g.setAttribute("aria-hidden", "true"); top.appendChild(g); }
    const w = top.clientWidth, nSeg = Math.max(3, Math.round(w / 95)), seg = w / nSeg;
    let path = "M0 0", html = "", k = 0;
    for (let s = 0; s < nSeg; s++) {
      const x0 = s * seg;
      path += ` Q${x0 + seg / 2} 18 ${x0 + seg} 0`;
      for (const f of [0.12, 0.3, 0.5, 0.7, 0.88]) {
        const x = x0 + f * seg, y = 36 * f * (1 - f);
        html += `<i style="left:${x - 2.5}px;top:${y - 1.5}px;animation-delay:${((k * 7) % 11) * -0.23}s"></i>`;
        k++;
      }
    }
    g.innerHTML = `<svg width="${w}" height="12" viewBox="0 0 ${w} 12"><path d="${path}" fill="none" stroke="#9c7a35" stroke-opacity=".7" stroke-width="1"/></svg>` + html;
  }
  guirlande();
  addEventListener("resize", guirlande);

  // --- carte de vœux (visible sur « Prochain »)
  const boule = (cls, r, fil, corps) =>
    `<svg class="nv-boule ${cls}" width="${r * 2 + 4}" height="${fil + r * 2 + 6}" viewBox="${-r - 2} 0 ${r * 2 + 4} ${fil + r * 2 + 6}" aria-hidden="true">` +
    `<path d="M0 0V${fil}" stroke="#d9b46a" stroke-width="1"/><rect x="-3.5" y="${fil}" width="7" height="5" rx="1" fill="#c9a058"/>` +
    `<g transform="translate(0 ${fil + 4 + r})">${corps(r)}</g></svg>`;
  const ballon = (r) => `<circle r="${r}" fill="url(#nv-o)"/><g fill="none" stroke="#3a1a08" stroke-width="1.1" stroke-opacity=".75">` +
    `<path d="M${-r} 0H${r}M0 ${-r}V${r}"/><path d="M${-r * .7} ${-r * .7}C${-r * .2} ${-r * .3} ${-r * .2} ${r * .3} ${-r * .7} ${r * .7}"/>` +
    `<path d="M${r * .7} ${-r * .7}C${r * .2} ${-r * .3} ${r * .2} ${r * .3} ${r * .7} ${r * .7}"/></g>` +
    `<ellipse cx="${-r * .35}" cy="${-r * .4}" rx="${r * .28}" ry="${r * .18}" fill="#fff" opacity=".35"/>`;
  const doree = (r) => `<circle r="${r}" fill="url(#nv-g)"/><path d="M${-r} 0Q0 ${r * .35} ${r} 0" stroke="#fff4d6" stroke-opacity=".5" fill="none"/>` +
    `<ellipse cx="${-r * .35}" cy="${-r * .4}" rx="${r * .28}" ry="${r * .18}" fill="#fff" opacity=".45"/>`;
  const rouge = (r) => `<circle r="${r}" fill="url(#nv-r)"/><ellipse cx="${-r * .35}" cy="${-r * .4}" rx="${r * .28}" ry="${r * .18}" fill="#fff" opacity=".35"/>`;
  const main = document.querySelector("main");
  if (main && !main.querySelector(".noel-voeux")) {
    main.insertAdjacentHTML("afterbegin",
      '<div class="noel-voeux"><svg width="0" height="0" style="position:absolute"><defs>' +
      '<radialGradient id="nv-o" cx=".35" cy=".3"><stop offset="0" stop-color="#ffb066"/><stop offset=".6" stop-color="#e8701e"/><stop offset="1" stop-color="#9a3f0a"/></radialGradient>' +
      '<radialGradient id="nv-g" cx=".35" cy=".3"><stop offset="0" stop-color="#fff1c4"/><stop offset=".55" stop-color="#d9b46a"/><stop offset="1" stop-color="#7d5a1f"/></radialGradient>' +
      '<radialGradient id="nv-r" cx=".35" cy=".3"><stop offset="0" stop-color="#ff6b70"/><stop offset=".6" stop-color="#c3141f"/><stop offset="1" stop-color="#5e060c"/></radialGradient>' +
      '</defs></svg>' +
      boule("g", 15, 26, ballon) + boule("d2", 8, 12, rouge) + boule("d", 11, 34, doree) +
      '<div class="nv-eyebrow">CTC St Renan-Plouarzel</div>' +
      '<div class="nv-titre">Joyeuses fêtes</div>' +
      '<div class="nv-sous"><b>✦</b>U18 Masculins 2<b>✦</b></div></div>');
  }

  // --- neige : flocons fins + quelques grosses lueurs floues
  const c = document.createElement("canvas");
  c.className = "neige"; c.setAttribute("aria-hidden", "true");
  document.body.prepend(c);
  const ctx = c.getContext("2d"), sombre = matchMedia("(prefers-color-scheme: dark)");
  let W, H, flocons = [];
  function taille() {
    const r = devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    c.width = W * r; c.height = H * r; ctx.setTransform(r, 0, 0, r, 0, 0);
    const n = Math.min(60, Math.round(W * H / 18000));
    while (flocons.length < n) flocons.push(nouveau(true));
    flocons.length = n;
  }
  function nouveau(partout) {
    const flou = Math.random() < 0.12;
    return { x: Math.random() * W, y: partout ? Math.random() * H : -10, flou,
             r: flou ? 5 + Math.random() * 6 : 0.8 + Math.random() * 1.8,
             v: flou ? 0.15 + Math.random() * 0.2 : 0.3 + Math.random() * 0.5,
             a: Math.random() * 6.28, o: flou ? 0.12 + Math.random() * 0.1 : 0.45 + Math.random() * 0.45 };
  }
  function dessine() {
    ctx.clearRect(0, 0, W, H);
    const base = sombre.matches ? "255,255,255" : "130,155,200";
    for (const f of flocons) {
      if (f.flou) {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(${base},${f.o})`); g.addColorStop(1, `rgba(${base},0)`);
        ctx.fillStyle = g;
      } else ctx.fillStyle = `rgba(${base},${f.o})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
    }
  }
  function boucle() {
    if (!document.hidden) {
      for (const f of flocons) {
        f.a += 0.008; f.y += f.v; f.x += Math.sin(f.a) * 0.3;
        if (f.y > H + 12) Object.assign(f, nouveau(false));
      }
      dessine();
    }
    requestAnimationFrame(boucle);
  }
  taille();
  addEventListener("resize", taille);
  if (calme) dessine(); else requestAnimationFrame(boucle);
})();
