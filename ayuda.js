/* Ayuda con IA: página #/ayuda, donde el escuadrón pregunta dudas de DCS y recibe respuestas basadas en los manuales
   oficiales y en las guías de Chuck, con la página de donde sale cada dato.

   La web solo hace de pantalla: el texto de los manuales y la clave de la IA viven en un servicio privado
   (ayuda/worker) que exige el código del escuadrón. Mientras URL_SERVICIO esté vacía, la ayuda no aparece.
   Usa las funciones globales de index.html ($, esc). */
const AYUDA = (() => {
  /* Dirección del servicio privado, la que imprime `wrangler deploy`, sin barra final. Vacía = ayuda desactivada. */
  const URL_SERVICIO = "https://biblioteca-dcs-ayuda.nando91cs.workers.dev";

  const CLAVE_CODIGO = "dcs-ayuda-codigo", CLAVE_DISP = "dcs-ayuda-dispositivo";
  const EJEMPLOS = ["¿Cómo activo el pod ECM del F-16?", "¿Cómo se alinea el INS del F/A-18C?", "¿Cómo lanzo un HARM en modo TOO con el F/A-18C?", "¿Cómo repostar en vuelo con el A-10C?"];
  const guarda = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const lee = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  const dispositivo = () => {
    let d = lee(CLAVE_DISP);
    if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); guarda(CLAVE_DISP, d); }
    return d;
  };

  let mensajes = [];       // {rol: "user" | "assistant", texto, fuentes?}
  let espera = false, restantes = null, aviso = "";

  /* Texto de la respuesta -> HTML: negritas, listas numeradas o de guiones, y las citas [n] como enlaces a la fuente */
  function formato(texto, fuentes) {
    const cita = t => t.replace(/\[(\d{1,2})\]/g, (m, n) => {
      const f = (fuentes || []).find(x => String(x.n) === n);
      return f && f.url ? '<a class="ay-cita" href="' + esc(f.url) + '" target="_blank" rel="noopener" title="' + esc(f.titulo + ", p. " + f.pagina) + '">' + n + '</a>' : m;
    });
    const linea = t => cita(esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>"));
    let html = "", lista = null;
    const cierra = () => { if (lista) { html += "</" + lista + ">"; lista = null; } };
    for (const l of texto.split(/\n/)) {
      const num = l.match(/^\s*\d+[.)]\s+(.*)/), gui = l.match(/^\s*[-•*]\s+(.*)/), tit = l.match(/^\s*#{1,4}\s+(.*)/);
      if (tit) { cierra(); html += "<h4>" + linea(tit[1]) + "</h4>"; }
      else if (num || gui) {
        const tipo = num ? "ol" : "ul";
        if (lista !== tipo) { cierra(); html += "<" + tipo + ">"; lista = tipo; }
        html += "<li>" + linea((num || gui)[1]) + "</li>";
      } else { cierra(); if (l.trim()) html += "<p>" + linea(l) + "</p>"; }
    }
    cierra();
    return html;
  }

  function burbuja(m) {
    if (m.rol === "user") return '<div class="ay-msg ay-yo">' + esc(m.texto) + '</div>';
    const fuentes = (m.fuentes || []).map(f => '<a href="' + esc(f.url || "#") + '" target="_blank" rel="noopener"><b>' + f.n + '</b> ' +
      esc(f.titulo) + ' · p. ' + f.pagina + ' ↗</a>').join("");
    const fecha = m.guardada ? m.guardada.slice(0, 10).split("-").reverse().join("/") : "";
    return '<div class="ay-msg ay-ia">' + formato(m.texto, m.fuentes) + (fuentes ? '<div class="ay-fuentes">' + fuentes + '</div>' : '') +
      (fecha ? '<div class="ay-guardada">⚡ Respuesta guardada del ' + fecha + ': los manuales no han cambiado desde entonces.</div>' : '') + '</div>';
  }

  function pagina() {
    const entra = !lee(CLAVE_CODIGO);
    const cab = '<h2>Ayuda con IA</h2><p class="intro">Pregunta dudas de DCS: sistemas, armamento, procedimientos… Responde con los manuales oficiales de ' +
      'Eagle Dynamics y las guías de Chuck, y te dice de qué página sale cada dato. Solo para el escuadrón.</p>';
    if (entra) return cab + '<form class="ay-form ay-codigo" id="ay-codigo"><label for="ay-cod">Código del escuadrón</label>' +
      '<div class="ay-fila"><input id="ay-cod" type="password" autocomplete="off" required><button class="bt" type="submit">Entrar</button></div>' +
      (aviso ? '<p class="ay-error">' + esc(aviso) + '</p>' : '') + '</form>';
    return cab + '<div class="ay-chat" id="ay-chat">' +
      (mensajes.length ? mensajes.map(burbuja).join("") :
        '<p class="ay-ej">Prueba con:</p><div class="ay-ejemplos">' + EJEMPLOS.map(e => '<button type="button" class="ay-chip" data-ay="ejemplo">' + esc(e) + '</button>').join("") + '</div>') +
      (espera ? '<div class="ay-msg ay-ia ay-espera">Buscando en los manuales…</div>' : '') + '</div>' +
      (aviso ? '<p class="ay-error">' + esc(aviso) + '</p>' : '') +
      '<form class="ay-form" id="ay-form"><textarea id="ay-txt" rows="2" maxlength="600" placeholder="Escribe tu duda…  (Enter para enviar)"' + (espera ? ' disabled' : '') + '></textarea>' +
      '<div class="ay-fila"><button class="bt on" type="submit"' + (espera ? ' disabled' : '') + '>Preguntar</button>' +
      '<button class="bt" type="button" data-ay="nueva">Nueva conversación</button><button class="bt" type="button" data-ay="codigo">Cambiar código</button>' +
      '<span class="ay-resto">' + (restantes != null ? 'Te quedan ' + restantes + ' preguntas hoy' : '') + '</span></div></form>' +
      '<p class="ay-nota">Las respuestas se generan con IA a partir de los fragmentos que encuentra; compruébalas en la fuente si es importante. DCS cambia con los parches.</p>';
  }

  const repinta = () => {
    if (location.hash !== "#/ayuda") return;
    $("vista").innerHTML = pagina();
    const c = $("ay-chat"); if (c && mensajes.length) c.lastElementChild.scrollIntoView({block: "nearest"});
    const t = $("ay-txt"); if (t && !espera) t.focus({preventScroll: true});
  };

  async function preguntar(texto) {
    texto = texto.trim();
    if (!texto || espera) return;
    aviso = "";
    const historial = mensajes.slice(-4).map(m => ({rol: m.rol, texto: m.texto}));
    mensajes.push({rol: "user", texto}); espera = true; repinta();
    try {
      const r = await fetch(URL_SERVICIO + "/preguntar", {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-Codigo": lee(CLAVE_CODIGO) || ""},
        body: JSON.stringify({pregunta: texto, dispositivo: dispositivo(), historial})
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { guarda(CLAVE_CODIGO, null); mensajes.pop(); aviso = "El código no es correcto."; }
      else if (!r.ok) { mensajes.pop(); aviso = d.error || "La ayuda no está disponible ahora mismo."; }
      else { mensajes.push({rol: "assistant", texto: d.respuesta, fuentes: d.fuentes, guardada: d.cache ? d.guardada : ""}); if (d.restantes != null) restantes = d.restantes; }
    } catch (e) {
      mensajes.pop();
      aviso = navigator.onLine === false ? "Sin conexión: la ayuda con IA necesita internet." : "No se ha podido contactar con la ayuda. Inténtalo de nuevo.";
    }
    espera = false; repinta();
  }

  document.addEventListener("submit", e => {
    if (e.target.id === "ay-codigo") { e.preventDefault(); guarda(CLAVE_CODIGO, $("ay-cod").value.trim()); aviso = ""; repinta(); }
    else if (e.target.id === "ay-form") { e.preventDefault(); const t = $("ay-txt"), v = t.value; t.value = ""; preguntar(v); }
  });
  document.addEventListener("keydown", e => {
    if (e.target.id === "ay-txt" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("ay-form").requestSubmit(); }
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-ay]"); if (!b) return;
    if (b.dataset.ay === "ejemplo") preguntar(b.textContent);
    else if (b.dataset.ay === "nueva") { mensajes = []; aviso = ""; repinta(); }
    else if (b.dataset.ay === "codigo") { guarda(CLAVE_CODIGO, null); aviso = ""; repinta(); }
  });

  /* el enlace de la cabecera solo existe si el servicio está configurado */
  document.addEventListener("DOMContentLoaded", () => { const a = $("ayudanav"); if (a) a.hidden = !URL_SERVICIO; });

  return {activa: !!URL_SERVICIO, pagina};
})();
