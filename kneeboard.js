/* Modo kneeboard: documentos guardados en el dispositivo para leerlos sin conexión, y visor de PDF a pantalla completa.
   Se carga antes que el script de index.html y usa sus variables globales ($, esc, todos, idx) cuando ya están cargadas.

   - Lo guardado (PDF) vive en la caché del navegador «kneeboard-pdf»; la lista, la última página de cada documento y las
     preferencias, en localStorage (clave «dcs-kneeboard»). Todo queda en el dispositivo: no hay cuenta ni servidor.
   - El visor usa PDF.js (vendor/pdfjs), porque los navegadores de Android no enseñan PDF dentro de la página. */
const KB = (() => {
  const CLAVE = "dcs-kneeboard", CACHE = "kneeboard-pdf";
  const PDFJS = "vendor/pdfjs/pdf.min.js", WORKER = "vendor/pdfjs/pdf.worker.min.js";

  /* ── Estado ── */
  const est = {pins: [], bytes: {}, pos: {}, noche: false, pantalla: true};
  try { Object.assign(est, JSON.parse(localStorage.getItem(CLAVE) || "{}")); } catch (e) {}
  const guardarEstado = () => { try { localStorage.setItem(CLAVE, JSON.stringify(est)); } catch (e) {} };

  const ficha = id => todos.find(d => d.id === id);
  const abs = d => new URL(d.url, location.href).href;
  const esPdf = d => !!d && d.tipo === "PDF" && !/^https?:\/\//i.test(d.url);
  const guardado = id => est.pins.includes(id);
  const tam = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";
  const limita = (v, a, b) => Math.min(b, Math.max(a, v));

  let tAviso;
  function aviso(t){
    const e = $("toast"); e.textContent = t; e.classList.add("ver");
    clearTimeout(tAviso); tAviso = setTimeout(() => e.classList.remove("ver"), 3800);
  }

  /* ── Guardar y quitar (caché del navegador) ── */
  const abrirCache = () => "caches" in window ? caches.open(CACHE) : Promise.reject(new Error("Este navegador no permite guardar sin conexión"));

  async function descargar(d, alProgreso, recarga){
    const r = await fetch(abs(d), recarga ? {cache: "reload"} : undefined);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const total = +r.headers.get("content-length") || 0, partes = [];
    let leido = 0;
    if (r.body && r.body.getReader) {
      const rd = r.body.getReader();
      for (;;) {
        const {done, value} = await rd.read();
        if (done) break;
        partes.push(value); leido += value.length;
        if (alProgreso) alProgreso(total ? Math.min(1, leido / total) : 0);
      }
    } else { const b = await r.arrayBuffer(); partes.push(new Uint8Array(b)); leido = b.byteLength; }
    return {blob: new Blob(partes, {type: "application/pdf"}), bytes: leido};
  }

  async function fijar(id, alProgreso, recarga){
    const d = ficha(id), {blob, bytes} = await descargar(d, alProgreso, recarga);
    const c = await abrirCache();
    await c.put(abs(d), new Response(blob, {headers: {"Content-Type": "application/pdf"}}));
    if (!guardado(id)) est.pins.push(id);
    est.bytes[id] = bytes; guardarEstado();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  }

  async function quitar(id){
    try { const c = await abrirCache(); await c.delete(abs(ficha(id))); } catch (e) {}
    est.pins = est.pins.filter(x => x !== id); delete est.bytes[id]; guardarEstado();
  }

  const errorGuardar = e => navigator.onLine === false ? "Sin conexión: ahora no se puede guardar"
    : /quota/i.test(String(e && (e.name || e))) ? "No hay espacio en la tablet para guardarlo" : "No se ha podido guardar (" + (e && e.message || e) + ")";

  /* ── Botones de las filas ── */
  const rotulo = id => guardado(id) ? "★ Guardado" : "☆ Guardar";

  function botones(d){
    if (!esPdf(d)) return "";
    return '<span class="acc"><button type="button" class="bt kb-fijar' + (guardado(d.id) ? ' on' : '') + '" data-kb="fijar" data-id="' + esc(d.id) +
      '" aria-pressed="' + guardado(d.id) + '">' + rotulo(d.id) + '</button>' +
      '<a class="bt" href="#/leer/' + encodeURIComponent(d.id) + '">Leer</a></span>';
  }

  function refrescar(id){
    document.querySelectorAll('[data-kb="fijar"][data-id="' + CSS.escape(id) + '"]').forEach(b => {
      b.textContent = rotulo(id); b.classList.toggle("on", guardado(id)); b.setAttribute("aria-pressed", guardado(id)); b.disabled = false;
      const fila = b.closest(".doc"); if (fila) fila.classList.toggle("gd", guardado(id));
    });
    refrescarNav();
  }

  function refrescarNav(){
    const e = $("kbnav"); if (e) e.textContent = "Mi kneeboard" + (est.pins.length ? " · " + est.pins.length : "");
  }

  async function alternar(btn){
    const id = btn.dataset.id;
    if (guardado(id)) { await quitar(id); refrescar(id); aviso("Quitado de Mi kneeboard"); return; }
    btn.disabled = true; btn.textContent = "Guardando…";
    try {
      await fijar(id, f => { btn.textContent = "Guardando " + Math.round(f * 100) + " %"; });
      aviso("Guardado en Mi kneeboard: " + ficha(id).titulo);
    } catch (e) { aviso(errorGuardar(e)); }
    refrescar(id);
  }

  /* ── Mi kneeboard ── */
  let instalar = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); instalar = e; const b = $("kb-instalar"); if (b) b.hidden = false; });

  function filaKb(d){
    const otras = (d.refs || []).filter(r => idx[r]).map(r => esc(idx[r])).join(" · ");
    const url = "#/leer/" + encodeURIComponent(d.id);
    return '<div class="doc gd" data-id="' + esc(d.id) + '"><a class="tit" href="' + url + '">' + esc(d.titulo) + '</a>' +
      '<span class="tipo" data-tam>' + tam(est.bytes[d.id] || 0) + '</span>' +
      (d.nota ? '<span class="nota">' + esc(d.nota) + '</span>' : '') +
      '<span class="meta">' + (otras ? esc(otras) : '') + '<span class="falta" data-falta hidden> · No está en la tablet: vuelve a guardarlo</span></span>' +
      '<span class="acc"><a class="bt" href="' + url + '">Leer</a>' +
      '<button type="button" class="bt peligro" data-kb="quitar" data-id="' + esc(d.id) + '">Quitar</button></span></div>';
  }

  function pagina(){
    setTimeout(verificar, 0);
    const ds = est.pins.map(ficha).filter(Boolean);
    const total = ds.reduce((t, d) => t + (est.bytes[d.id] || 0), 0);
    const cab = '<div class="kbcab"><span class="kbinfo" id="kb-info">' + (ds.length ? ds.length + (ds.length === 1 ? ' documento' : ' documentos') +
      ' · ' + tam(total) : '') + '</span>' +
      (ds.length ? '<button type="button" class="bt" data-kb="actualizar">Actualizar todo</button>' : '') +
      '<button type="button" class="bt" data-kb="copiar">Copiar lista</button><button type="button" class="bt" data-kb="pegar">Pegar lista</button>' +
      (ds.length ? '<button type="button" class="bt peligro" data-kb="borrar">Borrar todo</button>' : '') +
      '<button type="button" class="bt" id="kb-instalar" data-kb="instalar"' + (instalar ? '' : ' hidden') + '>Instalar app</button></div>';
    const ayuda = '<div class="kbaviso">' + (ds.length ? '' :
      '<p>Aún no has guardado nada. Busca un documento y pulsa <b>☆ Guardar</b>: se descarga a esta tablet y queda disponible sin conexión ' +
      '(en el tren, en el avión…). Guarda con Wi‑Fi antes de salir; los PDF grandes ocupan decenas de MB, así que guarda solo los que uses.</p>') +
      '<details><summary>Instalarla como app</summary><ul><li>Abre esta web en el navegador de la tablet y, en su menú (⋮ o ☰), elige ' +
      '<b>Añadir a la pantalla de inicio</b> o <b>Instalar aplicación</b>.</li>' +
      '<li>Aunque no la instales, todo lo guardado se puede leer sin conexión desde el navegador.</li>' +
      '<li>La lista de guardados es de cada dispositivo. Con <b>Copiar lista</b> y <b>Pegar lista</b> la llevas de uno a otro.</li></ul></details>' +
      '<p id="kb-espacio"></p></div>';
    return '<h2>Mi kneeboard</h2>' + cab + ayuda + (ds.length ? '<div id="kb-lista">' + ds.map(filaKb).join('') + '</div>' : '');
  }

  async function verificar(){
    if (!$("kb-lista") && !$("kb-espacio")) return;
    try {
      const c = await abrirCache();
      for (const f of document.querySelectorAll("#kb-lista .doc")) {
        const d = ficha(f.dataset.id); if (!d) continue;
        const hay = await c.match(abs(d));
        f.querySelector("[data-falta]").hidden = !!hay;
      }
    } catch (e) {}
    try {
      const {usage, quota} = await navigator.storage.estimate(), e = $("kb-espacio");
      if (e && quota) e.textContent = "Espacio usado por la biblioteca en este dispositivo: " + tam(usage) + " de unos " + tam(quota) + " disponibles.";
    } catch (e) {}
  }

  async function actualizarTodo(){
    if (navigator.onLine === false) { aviso("Sin conexión: conéctate a internet para actualizar"); return; }
    const ids = est.pins.filter(id => ficha(id));
    let n = 0;
    for (const id of ids) {
      aviso("Actualizando " + (++n) + " de " + ids.length + "…");
      try { await fijar(id, null, true); } catch (e) { aviso(errorGuardar(e)); return; }
    }
    aviso("Guardados al día");
    if (location.hash === "#/kneeboard") $("vista").innerHTML = pagina();
  }

  async function borrarTodo(){
    if (!confirm("¿Borrar de esta tablet todos los documentos guardados?")) return;
    try { await caches.delete(CACHE); } catch (e) {}
    est.pins = []; est.bytes = {}; guardarEstado();
    $("vista").innerHTML = pagina(); refrescarNav(); aviso("Guardados borrados");
  }

  async function copiarLista(){
    const t = JSON.stringify(est.pins);
    try { await navigator.clipboard.writeText(t); aviso("Lista copiada: pégala en el otro dispositivo"); }
    catch (e) { prompt("Copia esta lista:", t); }
  }

  async function pegarLista(){
    const t = prompt("Pega la lista copiada en otro dispositivo:");
    if (!t) return;
    let ids;
    try { ids = JSON.parse(t); } catch (e) { aviso("Eso no parece una lista válida"); return; }
    ids = (Array.isArray(ids) ? ids : []).filter(id => esPdf(ficha(id)) && !guardado(id));
    if (!ids.length) { aviso("No hay nada nuevo que guardar"); return; }
    let n = 0;
    for (const id of ids) {
      aviso("Guardando " + (++n) + " de " + ids.length + "…");
      try { await fijar(id); } catch (e) { aviso(errorGuardar(e)); break; }
    }
    $("vista").innerHTML = pagina(); refrescarNav();
  }

  /* ── Visor ── */
  const L = {id: null, pdf: null, p: 1, n: 0, z: 1, modo: "pagina", tok: 0, rtok: 0, tarea: null, abierto: false, base: false};
  let cerrojo = null, tPos = null, elLector = null;

  function crearLector(){
    if (elLector) return elLector;
    elLector = document.createElement("div");
    elLector.id = "lector"; elLector.hidden = true;
    elLector.innerHTML =
      '<div class="lbar"><button type="button" class="bt" data-l="cerrar" aria-label="Cerrar visor">✕ Cerrar</button>' +
      '<span class="ltit"></span><select class="lsel" aria-label="Cambiar de documento" hidden></select>' +
      '<span class="lgrp"><button type="button" class="bt" data-l="menos" aria-label="Alejar">−</button><span class="lz">100 %</span>' +
      '<button type="button" class="bt" data-l="mas" aria-label="Acercar">+</button>' +
      '<button type="button" class="bt" data-l="ajuste" title="Ajustar a la página o al ancho">Página</button></span>' +
      '<button type="button" class="bt" data-l="noche" title="Modo noche">◐ Noche</button>' +
      '<button type="button" class="bt" data-l="pantalla" title="Mantener la pantalla encendida">☀ Pantalla</button>' +
      '<button type="button" class="bt" data-l="fs" title="Pantalla completa">⛶</button>' +
      '<button type="button" class="bt kb-fijar" data-l="fijar"></button></div>' +
      '<div class="lesc"><div class="lhoja"></div><div class="lmsg" role="status"></div></div>' +
      '<div class="lpie"><button type="button" class="bt" data-l="ant" aria-label="Página anterior">‹ Anterior</button>' +
      '<span class="lpag"><input type="number" min="1" inputmode="numeric" aria-label="Página"> / <span class="ltot">–</span></span>' +
      '<button type="button" class="bt" data-l="sig" aria-label="Página siguiente">Siguiente ›</button></div>';
    document.body.appendChild(elLector);
    const q = s => elLector.querySelector(s);
    if (!("wakeLock" in navigator)) q('[data-l="pantalla"]').hidden = true;
    if (!document.documentElement.requestFullscreen) q('[data-l="fs"]').hidden = true;

    elLector.addEventListener("click", e => {
      const b = e.target.closest("[data-l]"); if (b) { accionLector(b.dataset.l); return; }
      if (e.target.closest(".lbar,.lpie")) return;
      /* toque en la hoja: bordes = pasar página; centro = mostrar u ocultar las barras */
      const r = q(".lesc").getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
      if (haySobreancho() || (f >= .25 && f <= .75)) { elLector.classList.toggle("sinbarra"); repintar(); }
      else ir(L.p + (f < .25 ? -1 : 1));
    });
    q(".lsel").onchange = e => location.replace("#/leer/" + encodeURIComponent(e.target.value));
    q(".lpag input").onchange = e => ir(parseInt(e.target.value, 10) || L.p);

    /* gestos: arrastrar con un dedo (pasar página si no se puede desplazar en horizontal) y pellizcar para acercar */
    const escena = q(".lesc"), hoja = q(".lhoja");
    let toque = null, pinza = null;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    escena.addEventListener("touchstart", e => {
      if (e.touches.length === 2) {
        const r = hoja.getBoundingClientRect(), er = escena.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        pinza = {d: dist(e.touches), z: L.z, r: 1, mx: mx - er.left, my: my - er.top};
        hoja.style.transformOrigin = (mx - r.left) + "px " + (my - r.top) + "px";
        toque = null;
      } else if (e.touches.length === 1 && !pinza) toque = {x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now()};
    }, {passive: true});
    escena.addEventListener("touchmove", e => {
      if (pinza && e.touches.length === 2) {
        pinza.r = limita(pinza.z * dist(e.touches) / pinza.d, .5, 6) / pinza.z;
        hoja.style.transform = "scale(" + pinza.r + ")";
      }
    }, {passive: true});
    escena.addEventListener("touchend", e => {
      if (pinza) {
        if (e.touches.length < 2) {
          const p = pinza; pinza = null; hoja.style.transform = ""; hoja.style.transformOrigin = "";
          if (Math.abs(p.r - 1) > .03) zoom(p.z * p.r, p.mx, p.my);
        }
        return;
      }
      if (!toque || e.touches.length) return;
      const t = e.changedTouches[0], dx = t.clientX - toque.x, dy = t.clientY - toque.y, rapido = Date.now() - toque.t < 700;
      toque = null;
      if (rapido && Math.abs(dx) > 70 && Math.abs(dx) > 1.6 * Math.abs(dy) && !haySobreancho()) ir(L.p + (dx < 0 ? 1 : -1));
    }, {passive: true});

    addEventListener("keydown", e => {
      if (!L.abierto || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      const k = e.key;
      if (k === "ArrowRight" || k === "PageDown") { e.preventDefault(); ir(L.p + 1); }
      else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); ir(L.p - 1); }
      else if (k === "+" || k === "=") zoom(L.z * 1.25);
      else if (k === "-") zoom(L.z / 1.25);
      else if (k === "n" || k === "N") accionLector("noche");
      else if (k === "Escape") accionLector("cerrar");
    });
    let tRes; addEventListener("resize", () => { if (L.abierto) { clearTimeout(tRes); tRes = setTimeout(repintar, 200); } });
    document.addEventListener("visibilitychange", () => { if (L.abierto && document.visibilityState === "visible" && !cerrojo) pedirPantalla(); });
    return elLector;
  }

  const q = s => elLector.querySelector(s);
  const haySobreancho = () => { const e = q(".lesc"); return e.scrollWidth > e.clientWidth + 2; };
  const mensaje = t => { q(".lmsg").innerHTML = t || ""; };

  function accionLector(a){
    if (a === "cerrar") { L.base ? history.back() : location.replace("#/kneeboard"); }
    else if (a === "menos") zoom(L.z / 1.25);
    else if (a === "mas") zoom(L.z * 1.25);
    else if (a === "ajuste") { L.modo = L.modo === "pagina" ? "ancho" : "pagina"; L.z = 1; guardarPos(); etiquetas(); repintar(); }
    else if (a === "noche") { est.noche = !est.noche; guardarEstado(); etiquetas(); }
    else if (a === "pantalla") { est.pantalla = !est.pantalla; guardarEstado(); est.pantalla ? pedirPantalla() : soltarPantalla(); etiquetas(); }
    else if (a === "fs") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
    else if (a === "ant") ir(L.p - 1);
    else if (a === "sig") ir(L.p + 1);
    else if (a === "fijar") alternarLector();
  }

  async function alternarLector(){
    const id = L.id, b = q('[data-l="fijar"]');
    if (guardado(id)) { await quitar(id); refrescar(id); etiquetas(); aviso("Quitado de Mi kneeboard"); return; }
    b.disabled = true; b.textContent = "Guardando…";
    try { await fijar(id, f => { b.textContent = "Guardando " + Math.round(f * 100) + " %"; }); aviso("Guardado en Mi kneeboard"); }
    catch (e) { aviso(errorGuardar(e)); }
    refrescar(id); etiquetas();
  }

  function etiquetas(){
    if (!elLector) return;
    elLector.classList.toggle("noche", est.noche);
    q('[data-l="noche"]').classList.toggle("on", est.noche);
    q('[data-l="pantalla"]').classList.toggle("on", est.pantalla);
    q('[data-l="ajuste"]').textContent = L.modo === "ancho" ? "Ancho" : "Página";
    q(".lz").textContent = Math.round(L.z * 100) + " %";
    const f = q('[data-l="fijar"]'); f.textContent = rotulo(L.id); f.classList.toggle("on", guardado(L.id)); f.disabled = false;
    q(".lpag input").value = L.p; q(".ltot").textContent = L.n || "–";
    const d = ficha(L.id), ids = est.pins.filter(x => ficha(x)); if (d && !ids.includes(d.id)) ids.unshift(d.id);
    const sel = q(".lsel"), tit = q(".ltit");
    tit.textContent = d ? d.titulo : ""; tit.title = tit.textContent;
    sel.hidden = ids.length < 2; tit.hidden = !sel.hidden;
    if (!sel.hidden) { sel.innerHTML = ids.map(x => '<option value="' + esc(x) + '">' + esc(ficha(x).titulo) + '</option>').join(""); sel.value = L.id; }
  }

  /* Wake Lock: la pantalla no se apaga mientras lees (donde el navegador lo permita) */
  async function pedirPantalla(){
    if (!est.pantalla || !("wakeLock" in navigator) || !L.abierto) return;
    try { cerrojo = await navigator.wakeLock.request("screen"); cerrojo.addEventListener("release", () => { cerrojo = null; }); } catch (e) {}
  }
  function soltarPantalla(){ if (cerrojo) { cerrojo.release().catch(() => {}); cerrojo = null; } }

  const guardarPos = () => {
    est.pos[L.id] = {p: L.p, z: L.z, m: L.modo};
    clearTimeout(tPos); tPos = setTimeout(guardarEstado, 400);
  };

  async function cargarPdfjs(){
    if (window.pdfjsLib) return;
    await new Promise((ok, ko) => {
      const s = document.createElement("script"); s.src = PDFJS; s.onload = ok;
      s.onerror = () => ko(new Error("No se ha podido cargar el visor de PDF")); document.head.appendChild(s);
    });
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(WORKER, location.href).href;
  }

  async function leerBytes(d, alProgreso){
    try {
      const c = await abrirCache(), r = await c.match(abs(d));
      if (r) return new Uint8Array(await r.arrayBuffer());
    } catch (e) {}
    if (navigator.onLine === false) throw new Error("sinred");
    const {blob} = await descargar(d, alProgreso);
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function abrir(id, habiaVista){
    crearLector();
    if (!L.abierto) { L.base = !!habiaVista; L.abierto = true; }
    elLector.hidden = false; document.body.classList.add("leyendo"); pedirPantalla();
    if (L.id === id && L.pdf) { etiquetas(); return; }
    const tok = ++L.tok, d = ficha(id);
    cerrarPdf(); L.id = id; L.n = 0;
    etiquetas(); q(".lhoja").replaceChildren();
    if (!esPdf(d)) { mensaje("No se encuentra este documento, o no es un PDF."); return; }
    mensaje("Abriendo…");
    try {
      await cargarPdfjs();
      const datos = await leerBytes(d, f => { if (tok === L.tok) mensaje("Descargando " + Math.round(f * 100) + " %"); });
      if (tok !== L.tok) return;
      const pdf = await pdfjsLib.getDocument({data: datos, isEvalSupported: false}).promise;
      if (tok !== L.tok) { pdf.destroy(); return; }
      const g = est.pos[id] || {};
      L.pdf = pdf; L.n = pdf.numPages; L.p = limita(g.p || 1, 1, L.n); L.z = limita(g.z || 1, .5, 6); L.modo = g.m === "ancho" ? "ancho" : "pagina";
      mensaje(""); etiquetas(); await pintarPagina();
    } catch (e) {
      if (tok !== L.tok) return;
      mensaje(e && e.message === "sinred"
        ? "<span><b>Este documento no está guardado en la tablet</b><br>y ahora no hay conexión.<br>Guárdalo con «☆ Guardar» cuando tengas Wi‑Fi.</span>"
        : "No se ha podido abrir el documento.<br>" + esc(String(e && e.message || e)));
    }
  }

  function cerrarPdf(){
    L.rtok++;
    if (L.tarea) { try { L.tarea.cancel(); } catch (e) {} L.tarea = null; }
    if (L.pdf) { try { L.pdf.destroy(); } catch (e) {} L.pdf = null; }
  }

  function cerrar(){
    if (!L.abierto) return;
    L.abierto = false; L.tok++; cerrarPdf(); L.id = null;
    soltarPantalla();
    elLector.hidden = true; document.body.classList.remove("leyendo");
  }

  async function pintarPagina(ajuste){
    if (!L.pdf) return;
    const tok = ++L.rtok;
    if (L.tarea) { try { L.tarea.cancel(); } catch (e) {} }
    const pdf = L.pdf, pg = await pdf.getPage(L.p);
    if (tok !== L.rtok) return;
    const escena = q(".lesc"), W = escena.clientWidth, H = escena.clientHeight, v1 = pg.getViewport({scale: 1});
    const base = L.modo === "ancho" ? W / v1.width : Math.min(W / v1.width, H / v1.height), css = base * L.z;
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = v1.width * css, h = v1.height * css;
    if (w * h * dpr * dpr > 16e6) dpr = Math.sqrt(16e6 / (w * h));     /* tope de memoria del canvas */
    const vp = pg.getViewport({scale: css * dpr}), cv = document.createElement("canvas");
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    cv.style.width = Math.floor(w) + "px"; cv.style.height = Math.floor(h) + "px";
    const tarea = pg.render({canvasContext: cv.getContext("2d"), viewport: vp});
    L.tarea = tarea;
    try { await tarea.promise; } catch (e) { if (e && e.name === "RenderingCancelledException") return; throw e; }
    if (tok !== L.rtok) return;
    q(".lhoja").replaceChildren(cv);
    if (ajuste) { escena.scrollLeft = ajuste.sl; escena.scrollTop = ajuste.st; }
    etiquetas();
  }

  const repintar = () => pintarPagina().catch(() => {});

  function ir(p){
    if (!L.pdf) return;
    p = limita(p, 1, L.n); if (p === L.p) { etiquetas(); return; }
    L.p = p; guardarPos();
    const escena = q(".lesc"); escena.scrollTop = 0; escena.scrollLeft = 0;
    pintarPagina().catch(() => {});
  }

  /* cx, cy: punto fijo (en la ventana del visor) alrededor del que se acerca; por defecto, el centro */
  function zoom(nz, cx, cy){
    if (!L.pdf) return;
    nz = limita(nz, .5, 6); if (Math.abs(nz - L.z) < .001) return;
    const escena = q(".lesc"), r = nz / L.z;
    if (cx === undefined) { cx = escena.clientWidth / 2; cy = escena.clientHeight / 2; }
    const ajuste = {sl: (escena.scrollLeft + cx) * r - cx, st: (escena.scrollTop + cy) * r - cy};
    L.z = nz; guardarPos(); etiquetas();
    pintarPagina(ajuste).catch(() => {});
  }

  /* ── Clics de toda la página: botones «Guardar», los de Mi kneeboard y los enlaces de PDF sin conexión ── */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-kb]");
    if (b) {
      const a = b.dataset.kb;
      if (a === "fijar") alternar(b);
      else if (a === "quitar") quitar(b.dataset.id).then(() => { $("vista").innerHTML = pagina(); refrescarNav(); });
      else if (a === "actualizar") actualizarTodo();
      else if (a === "borrar") borrarTodo();
      else if (a === "copiar") copiarLista();
      else if (a === "pegar") pegarLista();
      else if (a === "instalar" && instalar) { instalar.prompt(); instalar = null; b.hidden = true; }
      return;
    }
    const t = e.target.closest(".doc:not(.gd) a.tit[target]");
    if (t && navigator.onLine === false) { e.preventDefault(); aviso("Sin conexión: este documento no está guardado en Mi kneeboard"); }
  });

  function actualizarRed(){
    const off = navigator.onLine === false;
    document.body.classList.toggle("offline", off);
    const e = $("sinred"); if (e) e.hidden = !off;
  }
  addEventListener("online", actualizarRed); addEventListener("offline", actualizarRed);
  document.addEventListener("DOMContentLoaded", () => { actualizarRed(); refrescarNav(); });

  return {botones, guardado, pagina, abrir, cerrar, refrescarNav, abierto: () => L.abierto};
})();
