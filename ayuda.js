/* Ayuda con IA: página #/ayuda, donde el escuadrón pregunta dudas de DCS y recibe respuestas basadas en los manuales
   oficiales, en las guías de Chuck y en los documentos de la biblioteca, con la página de donde sale cada dato.
   También crea hojas de consulta en PDF para el kneeboard y enseña las novedades de los manuales (#/novedades).

   La web solo hace de pantalla: el texto de los manuales y la clave de la IA viven en un servicio privado
   (ayuda/worker) que exige el código del escuadrón. Mientras URL_SERVICIO esté vacía, la ayuda no aparece.
   Usa las funciones globales de index.html ($, esc) y, para las hojas, hoja.js y kneeboard.js. */
const AYUDA = (() => {
  /* Dirección del servicio privado, la que imprime `wrangler deploy`, sin barra final. Vacía = ayuda desactivada. */
  const URL_SERVICIO = "https://biblioteca-dcs-ayuda.nando91cs.workers.dev";

  const CLAVE_CODIGO = "dcs-ayuda-codigo", CLAVE_DISP = "dcs-ayuda-dispositivo";
  const EJEMPLOS = ["¿Cómo activo el pod ECM del F-16?", "¿Cómo se alinea el INS del F/A-18C?", "¿Cómo lanzo un HARM en modo TOO con el F/A-18C?", "¿Cómo repostar en vuelo con el A-10C?"];
  const EJEMPLOS_HOJA = ["arranque en frío del F-16", "alineación del INS del F/A-18C", "repostaje en vuelo del A-10C"];
  const guarda = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const lee = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  const dispositivo = () => {
    let d = lee(CLAVE_DISP);
    if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); guarda(CLAVE_DISP, d); }
    return d;
  };

  let mensajes = [];       // {rol: "user" | "assistant", texto, fuentes?, guardada?}
  let espera = false, restantes = null, aviso = "";
  let hojas = [], creando = false, avisoHoja = "";     // hojas de consulta creadas en esta sesión
  let frecuentes = null;                               // preguntas más repetidas que da el servicio (null = aún sin pedir)

  /* Llamada al servicio: añade el código y el identificador del dispositivo. Un 401 borra el código guardado. */
  async function api(ruta, cuerpo) {
    const r = await fetch(URL_SERVICIO + ruta, {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Codigo": lee(CLAVE_CODIGO) || ""},
      body: JSON.stringify({...cuerpo, dispositivo: dispositivo()})
    });
    const datos = await r.json().catch(() => ({}));
    if (r.status === 401) guarda(CLAVE_CODIGO, null);
    return {estado: r.status, ok: r.ok, datos};
  }

  const sinRed = () => navigator.onLine === false ? "Sin conexión: la ayuda con IA necesita internet." : "No se ha podido contactar con la ayuda. Inténtalo de nuevo.";

  /* Texto de la respuesta -> HTML: títulos, negritas, listas numeradas o de guiones, y las citas [n] como enlaces a la fuente */
  function formato(texto, fuentes) {
    const cita = t => t.replace(/\[(\d{1,2})\]/g, (m, n) => {
      const f = (fuentes || []).find(x => String(x.n) === n);
      return f && f.url ? '<a class="ay-cita" href="' + esc(f.url) + '" target="_blank" rel="noopener" title="' + esc(f.titulo + ", p. " + f.pagina) + '">' + n + '</a>' : m;
    });
    const linea = t => cita(esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>"));
    let html = "", lista = null, tabla = null;
    const cierraTabla = () => {
      if (!tabla) return;
      const filas = tabla.filter(f => !f.every(c => /^:?-{2,}:?$/.test(c)));          // fuera la fila de guiones
      html += '<div class="ay-tabla"><table>' + filas.map((f, i) => "<tr>" + f.map(c => (i ? "<td>" : "<th>") + linea(c) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</table></div>";
      tabla = null;
    };
    const cierra = () => { cierraTabla(); if (lista) { html += "</" + lista + ">"; lista = null; } };
    for (const l of texto.split(/\n/)) {
      const num = l.match(/^\s*\d+[.)]\s+(.*)/), gui = l.match(/^\s*[-•*]\s+(.*)/), tit = l.match(/^\s*#{1,4}\s+(.*)/), fil = l.match(/^\s*\|(.+)\|?\s*$/);
      if (fil) { if (lista) cierra(); (tabla = tabla || []).push(fil[1].replace(/\|\s*$/, "").split("|").map(c => c.trim())); }
      else if (tit) { cierra(); html += "<h4>" + linea(tit[1]) + "</h4>"; }
      else if (num || gui) {
        const tipo = num ? "ol" : "ul";
        if (lista !== tipo) { cierra(); html += "<" + tipo + ">"; lista = tipo; }
        html += "<li>" + linea((num || gui)[1]) + "</li>";
      } else { cierra(); if (l.trim()) html += "<p>" + linea(l) + "</p>"; }
    }
    cierra();
    return html;
  }

  const listaFuentes = fuentes => (fuentes || []).map(f => '<a href="' + esc(f.url || "#") + '" target="_blank" rel="noopener"><b>' + f.n + '</b> ' +
    esc(f.titulo) + ' · p. ' + f.pagina + ' ↗</a>').join("");

  function burbuja(m) {
    if (m.rol === "user") return '<div class="ay-msg ay-yo">' + esc(m.texto) + '</div>';
    const fuentes = listaFuentes(m.fuentes);
    const fecha = m.guardada ? m.guardada.slice(0, 10).split("-").reverse().join("/") : "";
    return '<div class="ay-msg ay-ia">' + formato(m.texto, m.fuentes) + (fuentes ? '<div class="ay-fuentes">' + fuentes + '</div>' : '') +
      (fecha ? '<div class="ay-guardada">⚡ Respuesta guardada del ' + fecha + ': los manuales no han cambiado desde entonces.</div>' : '') + '</div>';
  }

  /* ── Preguntas frecuentes ──
     Las que más se repiten salen como botones. Ya están en la caché del servicio, así que se contestan al instante y sin gastar
     crédito ni cupo. Si aún hay pocas, se completan con los ejemplos fijos (hasta 6). */
  async function cargarFrecuentes() {
    if (frecuentes !== null || !lee(CLAVE_CODIGO)) return;
    frecuentes = [];
    try { const r = await api("/frecuentes", {}); if (r.ok) frecuentes = r.datos.frecuentes || []; } catch (e) {}
    repinta();
  }
  const chipsFrecuentes = () => [...new Set([...(frecuentes || []).map(f => f.texto), ...EJEMPLOS])].slice(0, 6);

  /* ── Hojas de consulta ── */
  const nombreArchivo = t => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "hoja";

  function tarjetaHoja(h, i) {
    const kb = typeof KB !== "undefined" && KB.activo
      ? (h.idKb ? '<a class="bt" href="#/leer/' + esc(h.idKb) + '">Abrir en el visor</a>'
        : '<button type="button" class="bt" data-ay="hoja-kb" data-i="' + i + '">Guardar en Mi kneeboard</button>') : '';
    return '<div class="ay-hoja"><a href="' + h.imagen + '" target="_blank" rel="noopener"><img src="' + h.imagen + '" alt="Vista previa de la hoja «' + esc(h.titulo) + '»"></a>' +
      '<div class="ay-hoja-acc"><b>' + esc(h.titulo) + '</b><a class="bt on" href="' + h.urlPdf + '" download="' + nombreArchivo(h.titulo) + '.pdf">Descargar PDF</a>' + kb +
      (h.idKb ? '<span class="ay-guardada">Guardada en Mi kneeboard: se abre sin conexión.</span>' : '') + '</div></div>';
  }

  const seccionHojas = () => '<section class="ay-hojas"><h3 class="subt">Hojas de consulta para el kneeboard</h3>' +
    '<p class="intro">Pide una hoja de una página con los pasos de un procedimiento: la IA la prepara con los manuales y guías, y te dice de qué páginas sale. ' +
    'La descargas en PDF o la guardas en Mi kneeboard para abrirla sin conexión.</p>' +
    '<form class="ay-form" id="ay-hoja-form"><div class="ay-fila"><input id="ay-hoja-tema" type="text" maxlength="200" placeholder="¿De qué? Por ejemplo: arranque en frío del F-16"' + (creando ? ' disabled' : '') + ' required>' +
    '<button class="bt on" type="submit"' + (creando ? ' disabled' : '') + '>' + (creando ? 'Preparando… (unos 25 s)' : 'Crear hoja') + '</button></div></form>' +
    '<div class="ay-ejemplos ay-ej-hoja">' + EJEMPLOS_HOJA.map(e => '<button type="button" class="ay-chip" data-ay="ej-hoja">' + esc(e) + '</button>').join("") + '</div>' +
    (avisoHoja ? '<p class="ay-error">' + esc(avisoHoja) + '</p>' : '') +
    '<div class="ay-hojas-lista">' + hojas.map(tarjetaHoja).join("") + '</div></section>';

  async function crearHoja(tema) {
    tema = tema.trim();
    if (tema.length < 5 || creando) return;
    avisoHoja = ""; creando = true; repinta();
    try {
      const r = await api("/hoja", {tema});
      if (r.estado === 401) avisoHoja = "El código no es correcto.";
      else if (!r.ok) avisoHoja = r.datos.error || "No se ha podido crear la hoja.";
      else {
        if (typeof HOJA === "undefined") await new Promise((ok, ko) => {
          const s = document.createElement("script"); s.src = "hoja.js"; s.onload = ok;
          s.onerror = () => ko(new Error("No se ha podido cargar el generador de hojas")); document.head.appendChild(s);
        });
        const h = await HOJA.crear(r.datos.hoja, r.datos.fuentes);
        hojas.unshift({...h, urlPdf: URL.createObjectURL(h.pdf), fuentes: r.datos.fuentes});
      }
    } catch (e) { avisoHoja = String(e && e.message || "").startsWith("No se ha podido cargar") ? e.message : sinRed(); }
    creando = false; repinta();
  }

  async function hojaAKb(i) {
    const h = hojas[i]; if (!h || typeof KB === "undefined") return;
    try { h.idKb = await KB.guardarHoja({titulo: h.titulo, blob: h.pdf, fuentes: h.fuentes}); }
    catch (e) { avisoHoja = "No se ha podido guardar en esta tablet (¿poco espacio?)."; }
    repinta();
  }

  /* ── Página de la ayuda ── */
  function pagina() {
    const entra = !lee(CLAVE_CODIGO);
    const cab = '<h2>Ayuda con IA</h2><p class="intro">Pregunta dudas de DCS: sistemas, armamento, procedimientos… Responde con los manuales oficiales de ' +
      'Eagle Dynamics, las guías de Chuck y los documentos de esta biblioteca, y te dice de qué página sale cada dato. Solo para el escuadrón. ' +
      '<a class="ay-enlace" href="#/novedades">Novedades en los manuales →</a></p>';
    if (entra) return cab + '<form class="ay-form ay-codigo" id="ay-codigo"><label for="ay-cod">Código del escuadrón</label>' +
      '<div class="ay-fila"><input id="ay-cod" type="password" autocomplete="off" required><button class="bt" type="submit">Entrar</button></div>' +
      (aviso ? '<p class="ay-error">' + esc(aviso) + '</p>' : '') + '</form>';
    setTimeout(cargarFrecuentes, 0);
    return cab + '<div class="ay-frec"><span class="ay-ej">⚡ Preguntas frecuentes: respuesta al instante y no gastan tu cupo</span><div class="ay-ejemplos">' +
      chipsFrecuentes().map(e => '<button type="button" class="ay-chip" data-ay="ejemplo">' + esc(e) + '</button>').join("") + '</div></div>' +
      '<div class="ay-chat" id="ay-chat">' + mensajes.map(burbuja).join("") +
      (espera ? '<div class="ay-msg ay-ia ay-espera">Buscando en los manuales…</div>' : '') + '</div>' +
      (aviso ? '<p class="ay-error">' + esc(aviso) + '</p>' : '') +
      '<form class="ay-form" id="ay-form"><textarea id="ay-txt" rows="2" maxlength="600" placeholder="Escribe tu duda…  (Enter para enviar)"' + (espera ? ' disabled' : '') + '></textarea>' +
      '<div class="ay-fila"><button class="bt on" type="submit"' + (espera ? ' disabled' : '') + '>Preguntar</button>' +
      '<button class="bt" type="button" data-ay="nueva">Nueva conversación</button><button class="bt" type="button" data-ay="codigo">Cambiar código</button>' +
      '<span class="ay-resto">' + (restantes != null ? 'Te quedan ' + restantes + ' preguntas hoy' : '') + '</span></div></form>' +
      '<p class="ay-nota">Las respuestas se generan con IA a partir de los fragmentos que encuentra; compruébalas en la fuente si es importante. DCS cambia con los parches.</p>' +
      seccionHojas();
  }

  const repinta = () => {
    if (location.hash !== "#/ayuda") return;
    const t0 = $("ay-txt"), h0 = $("ay-hoja-tema"), enHoja = h0 && document.activeElement === h0, valorHoja = h0 ? h0.value : "";
    $("vista").innerHTML = pagina();
    if (valorHoja && $("ay-hoja-tema")) $("ay-hoja-tema").value = valorHoja;
    const c = $("ay-chat"); if (c && mensajes.length && !creando) c.lastElementChild.scrollIntoView({block: "nearest"});
    const t = $("ay-txt"); if (t && !espera && !creando && !enHoja && t0 !== undefined) t.focus({preventScroll: true});
  };

  async function preguntar(texto) {
    texto = texto.trim();
    if (!texto || espera) return;
    aviso = "";
    const historial = mensajes.slice(-4).map(m => ({rol: m.rol, texto: m.texto}));
    mensajes.push({rol: "user", texto}); espera = true; repinta();
    try {
      const r = await api("/preguntar", {pregunta: texto, historial});
      if (r.estado === 401) { mensajes.pop(); aviso = "El código no es correcto."; }
      else if (!r.ok) { mensajes.pop(); aviso = r.datos.error || "La ayuda no está disponible ahora mismo."; }
      else { mensajes.push({rol: "assistant", texto: r.datos.respuesta, fuentes: r.datos.fuentes, guardada: r.datos.cache ? r.datos.guardada : ""}); if (r.datos.restantes != null) restantes = r.datos.restantes; }
    } catch (e) { mensajes.pop(); aviso = sinRed(); }
    espera = false; repinta();
  }

  /* ── Novedades: cambios detectados en los manuales ── */
  const paginaNovedades = () => '<h2>Novedades en los manuales</h2><p class="intro">Cambios detectados cuando Eagle Dynamics o Chuck actualizan un manual o una guía: qué se ha añadido o quitado, ' +
    'resumido con IA. <a class="ay-enlace" href="#/ayuda">← Ayuda con IA</a></p><div id="nv-lista"><p class="vacio">Cargando…</p></div>';

  function tarjetaNovedad(n) {
    const nada = !n.resumen || /^sin cambios relevantes/i.test(n.resumen.trim());
    return '<article class="nv' + (nada ? ' nv-nada' : '') + '"><div class="nv-cab"><h3>' + esc(n.titulo) + '</h3><span>' + esc((n.fecha || "").slice(0, 10).split("-").reverse().join("/")) + '</span></div>' +
      (nada ? '<p>' + (n.resumen ? 'Solo cambios de formato o de maquetación: nada relevante para el juego.' : 'Resumen pendiente: se generará al volver a abrir esta página.') + '</p>' : formato(n.resumen, [])) +
      (n.url ? '<a class="ay-enlace" href="' + esc(n.url) + '" target="_blank" rel="noopener">Abrir el documento ↗</a>' : '') + '</article>';
  }

  async function cargarNovedades() {
    const c = $("nv-lista"); if (!c) return;
    if (!lee(CLAVE_CODIGO)) { c.innerHTML = '<p class="vacio">Entra primero con el código del escuadrón en <a class="ay-enlace" href="#/ayuda">Ayuda con IA</a>.</p>'; return; }
    let r;
    try { r = await api("/novedades", {}); } catch (e) { if ($("nv-lista")) $("nv-lista").innerHTML = '<p class="ay-error">' + esc(sinRed()) + '</p>'; return; }
    if (!$("nv-lista")) return;                                         // se ha cambiado de página mientras cargaba
    if (r.estado === 401) { $("nv-lista").innerHTML = '<p class="vacio">El código ya no es válido: entra de nuevo en <a class="ay-enlace" href="#/ayuda">Ayuda con IA</a>.</p>'; return; }
    if (!r.ok) { $("nv-lista").innerHTML = '<p class="ay-error">' + esc(r.datos.error || "No se han podido cargar las novedades.") + '</p>'; return; }
    const lista = r.datos.novedades || [];
    $("nv-lista").innerHTML = lista.length ? lista.map(tarjetaNovedad).join("")
      : '<p class="vacio">Todavía no hay cambios registrados. Aparecerán aquí cuando Eagle Dynamics o Chuck actualicen un manual o una guía que ya esté en la biblioteca.</p>';
  }

  /* ── Eventos ── */
  document.addEventListener("submit", e => {
    if (e.target.id === "ay-codigo") { e.preventDefault(); guarda(CLAVE_CODIGO, $("ay-cod").value.trim()); aviso = ""; repinta(); }
    else if (e.target.id === "ay-form") { e.preventDefault(); const t = $("ay-txt"), v = t.value; t.value = ""; preguntar(v); }
    else if (e.target.id === "ay-hoja-form") { e.preventDefault(); crearHoja($("ay-hoja-tema").value); }
  });
  document.addEventListener("keydown", e => {
    if (e.target.id === "ay-txt" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("ay-form").requestSubmit(); }
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-ay]"); if (!b) return;
    const a = b.dataset.ay;
    if (a === "ejemplo") preguntar(b.textContent);
    else if (a === "ej-hoja") { $("ay-hoja-tema").value = b.textContent; $("ay-hoja-form").requestSubmit(); }
    else if (a === "hoja-kb") hojaAKb(+b.dataset.i);
    else if (a === "nueva") { mensajes = []; aviso = ""; repinta(); }
    else if (a === "codigo") { guarda(CLAVE_CODIGO, null); aviso = ""; repinta(); }
  });

  /* el enlace de la cabecera solo existe si el servicio está configurado */
  document.addEventListener("DOMContentLoaded", () => { const a = $("ayudanav"); if (a) a.hidden = !URL_SERVICIO; });

  return {activa: !!URL_SERVICIO, pagina, paginaNovedades, cargarNovedades, api, formato, listaFuentes,
    tieneCodigo: () => !!lee(CLAVE_CODIGO), guardarCodigo: v => guarda(CLAVE_CODIGO, String(v || "").trim()), sinRed};
})();
