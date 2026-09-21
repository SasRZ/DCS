/* Hojas de consulta para el kneeboard: recibe la hoja estructurada que prepara el servicio (título, secciones con pasos, avisos y
   fuentes), la dibuja en un canvas del tamaño de una hoja A5 y la empaqueta como PDF de una página.

   Se dibuja en el navegador (no en el servidor) para usar las mismas fuentes de la web y no depender de tablas de medidas de tipografías.
   El PDF es una imagen: se ve igual en cualquier visor, incluido el de Mi kneeboard, y el modo noche lo invierte bien. */
const HOJA = (() => {
  const W = 1240, H = 1754, M = 64;                   // A5 a unos 212 ppp
  const COLORES = ["#1F5D6B", "#8A5A12", "#2F4F86", "#3F6B2E"];   // secciones: verde azulado, ámbar oscuro, azul, verde
  const TIT = '"Barlow Condensed","Arial Narrow",Arial,sans-serif', CUERPO = 'Barlow,Arial,Helvetica,sans-serif';

  /* Reparte un texto en líneas que caben en `ancho` con la fuente actual del contexto */
  function lineas(ctx, texto, ancho) {
    const res = []; let actual = "";
    for (const palabra of String(texto).split(/\s+/)) {
      const prueba = actual ? actual + " " + palabra : palabra;
      if (actual && ctx.measureText(prueba).width > ancho) { res.push(actual); actual = palabra; } else actual = prueba;
    }
    if (actual) res.push(actual);
    return res.length ? res : [""];
  }

  /* Coloca (y dibuja, si `pintar`) toda la hoja con un factor de escala `s`; devuelve dónde acaba el contenido */
  function componer(ctx, h, s, pintar, altoPie) {
    const ancho = W - 2 * M, fi = 31 * s, ft = 33 * s, fn = 26 * s, alto = fi * 1.32;
    let y = 196 + 26;                                                         // bajo la cabecera
    const texto = (t, x, yy, fuente, color, alinea) => { if (!pintar) return; ctx.font = fuente; ctx.fillStyle = color; ctx.textAlign = alinea || "left"; ctx.fillText(t, x, yy); };

    h.secciones.forEach((sec, k) => {
      const color = COLORES[k % COLORES.length];
      if (pintar) { ctx.fillStyle = color; ctx.fillRect(M, y, ancho, ft * 1.55); }
      texto(sec.titulo.toUpperCase(), M + 16, y + ft * 1.1, `600 ${ft}px ${TIT}`, "#fff");
      y += ft * 1.55;
      sec.pasos.forEach((p, n) => {
        ctx.font = `500 ${fi}px ${CUERPO}`;
        const izq = lineas(ctx, p.i, p.a ? ancho * 0.60 : ancho - 28);
        ctx.font = `600 ${fi}px ${CUERPO}`;
        const der = p.a ? lineas(ctx, p.a, ancho * 0.36) : [];
        const filas = Math.max(izq.length, der.length), hFila = filas * alto + 12 * s;
        if (pintar) {
          if (n % 2) { ctx.fillStyle = "#EEF2F4"; ctx.fillRect(M, y, ancho, hFila); }
          ctx.fillStyle = "#C9D2D8"; ctx.fillRect(M, y + hFila - 1, ancho, 1);
        }
        izq.forEach((l, i) => texto(l, M + 14, y + alto * (i + 0.85) + 6 * s, `500 ${fi}px ${CUERPO}`, "#151C23"));
        der.forEach((l, i) => texto(l, M + ancho * 0.64, y + alto * (i + 0.85) + 6 * s, `600 ${fi}px ${CUERPO}`, color));
        y += hFila;
      });
      sec.notas.forEach(nota => {
        ctx.font = `italic 500 ${fn}px ${CUERPO}`;
        lineas(ctx, "▸ " + nota, ancho - 28).forEach((l, i) => { texto(l, M + 14, y + fn * 1.4 * (i + 1), `italic 500 ${fn}px ${CUERPO}`, "#4A5A64"); y += fn * 1.4; });
        y += fn * 0.5;
      });
      y += 20 * s;
    });

    if (h.avisos.length) {                                                       // caja de avisos
      ctx.font = `500 ${fn}px ${CUERPO}`;
      const ls = h.avisos.flatMap(a => lineas(ctx, "⚠ " + a, ancho - 40)), hCaja = ls.length * fn * 1.4 + 34 * s;
      if (pintar) { ctx.fillStyle = "#FFF4DA"; ctx.fillRect(M, y, ancho, hCaja); ctx.strokeStyle = "#E0A73C"; ctx.lineWidth = 4; ctx.strokeRect(M + 2, y + 2, ancho - 4, hCaja - 4); }
      ls.forEach((l, i) => texto(l, M + 20, y + 20 * s + fn * 1.4 * (i + 0.85), `500 ${fn}px ${CUERPO}`, "#5A3D00"));
      y += hCaja + 16 * s;
    }
    return y;
  }

  async function cargarFuentes() {
    try { await Promise.all(['600 60px "Barlow Condensed"', "500 30px Barlow", "600 30px Barlow", "italic 500 26px Barlow"].map(f => document.fonts.load(f))); } catch (e) {}
  }

  /* Empaqueta un JPEG como PDF de una página A5 (sin librerías: cinco objetos y la tabla de referencias) */
  function pdfDeJpeg(jpeg, ancho, alto) {
    const enc = new TextEncoder(), partes = [], pos = [];
    let n = 0;
    const add = d => { const b = typeof d === "string" ? enc.encode(d) : d; partes.push(b); n += b.length; };
    const obj = (i, cuerpo) => { pos[i] = n; add(i + " 0 obj\n" + cuerpo + "\nendobj\n"); };
    const pw = 419.53, ph = 595.28, cont = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    add("%PDF-1.4\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    pos[4] = n;
    add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${ancho} /Height ${alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    add(jpeg); add("\nendstream\nendobj\n");
    obj(5, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
    const xref = n;
    add("xref\n0 6\n0000000000 65535 f \n" + [1, 2, 3, 4, 5].map(i => String(pos[i]).padStart(10, "0") + " 00000 n \n").join(""));
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(partes, {type: "application/pdf"});
  }

  /* h: hoja del servicio ({titulo, subtitulo, secciones, avisos}); fuentes: [{titulo, pagina}]. Devuelve {pdf, imagen (URL del JPEG), titulo} */
  async function crear(h, fuentes) {
    await cargarFuentes();
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

    /* pie: fuentes y aviso */
    const pie = [];
    ctx.font = `500 21px ${CUERPO}`;
    const agrupadas = {};
    (fuentes || []).forEach(f => { (agrupadas[f.titulo] = agrupadas[f.titulo] || []).push(f.pagina); });
    Object.entries(agrupadas).forEach(([t, ps]) => pie.push(...lineas(ctx, `${t} · p. ${[...new Set(ps)].sort((a, b) => a - b).join(", ")}`, W - 2 * M)));
    const altoPie = pie.length * 28 + 76;

    /* la escala baja hasta que todo cabe en una página */
    let s = 1;
    while (s > 0.5 && componer(ctx, h, s, false, altoPie) > H - altoPie - 24) s -= 0.04;
    componer(ctx, h, s, true, altoPie);

    /* cabecera */
    ctx.fillStyle = "#151C23"; ctx.fillRect(0, 0, W, 196);
    ctx.fillStyle = "#E0A73C"; ctx.fillRect(0, 196, W, 8);
    let tam = 74;
    do { ctx.font = `600 ${tam}px ${TIT}`; tam -= 2; } while (ctx.measureText(h.titulo).width > W - 2 * M && tam > 36);
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(h.titulo, M, 96);
    if (h.subtitulo) { ctx.font = `500 32px ${CUERPO}`; ctx.fillStyle = "#E0A73C"; ctx.fillText(h.subtitulo.slice(0, 90), M, 150); }

    /* pie */
    ctx.fillStyle = "#C9D2D8"; ctx.fillRect(M, H - altoPie, W - 2 * M, 2);
    ctx.font = `500 21px ${CUERPO}`; ctx.fillStyle = "#4A5A64";
    pie.forEach((l, i) => ctx.fillText(l, M, H - altoPie + 36 + i * 28));
    ctx.font = `italic 500 20px ${CUERPO}`; ctx.fillStyle = "#7A8A94";
    ctx.fillText("Hoja generada con IA a partir de los manuales y guías citados · Biblioteca DCS, Escuadrón FOX3 · compruébala en el simulador", M, H - 24);

    const jpeg = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.92));
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    return {pdf: pdfDeJpeg(bytes, W, H), imagen: URL.createObjectURL(jpeg), titulo: h.titulo};
  }

  return {crear};
})();
