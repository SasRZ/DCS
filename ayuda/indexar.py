#!/usr/bin/env python3
"""
Indexador de la ayuda con IA de la Biblioteca DCS.

Lee los manuales oficiales de Eagle Dynamics y las guías de Chuck directamente de sus webs (nadie
descarga nada a mano), extrae el texto y lo guarda en un índice de búsqueda. Después solo vuelve a
procesar lo que haya cambiado: para cada PDF pide a la web su ETag (o fecha y tamaño) y lo compara
con el que guardó la última vez.

El texto de los manuales NUNCA va al repositorio: se guarda en la base de datos privada (Cloudflare D1)
o, en pruebas, en un archivo local fuera del repositorio.

Modos:
  - D1 con tu sesión de wrangler (npx wrangler login): --d1 [NOMBRE]. No necesita token.
  - D1 con token de API (para GitHub Actions): con CF_ACCOUNT_ID, CF_D1_ID y CF_API_TOKEN en el entorno.
  - Local (pruebas): sin esas variables, o con --local. Crea indice.db en la carpeta de datos.

Uso:
  python ayuda/indexar.py --listar               ver qué fuentes hay y cuáles están al día
  python ayuda/indexar.py --solo f-16            indexar solo las fuentes cuyo id contiene «f-16»
  python ayuda/indexar.py --d1 --solo f-16       lo mismo, pero subiéndolo a Cloudflare D1
  python ayuda/indexar.py                        indexar (o actualizar) todo
  python ayuda/indexar.py --buscar "ECM pod"     probar una búsqueda en el índice local

Carpeta de datos (por defecto %LOCALAPPDATA%\\BibliotecaDCS-ayuda, fuera del repositorio):
  cambiarla con la variable AYUDA_DIR.
"""

import argparse
import html
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = "BibliotecaDCS-ayuda/1.0 (uso privado del escuadron FOX3)"
ED_LISTA = "https://www.digitalcombatsimulator.com/es/downloads/documentation/"
ED_RAIZ = "https://www.digitalcombatsimulator.com"
CHUCK = "https://chucksguides.com"
PAUSA = 1.5          # segundos entre peticiones a las webs de origen
TROZO_MAX = 1800     # caracteres por fragmento (aprox.)
TROZO_MIN = 80       # páginas con menos texto se ignoran (portadas, separadores)
SQL_MAX = 80_000     # tamaño máximo del SQL de cada petición a D1

RAIZ = Path(__file__).resolve().parent
DATOS = Path(os.environ.get("AYUDA_DIR") or
             Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".local" / "share") / "BibliotecaDCS-ayuda")
CACHE = DATOS / "cache"


# ── HTTP ─────────────────────────────────────────────────────────────────────

def abrir(url, metodo="GET", intentos=4, cabeceras=None, datos=None, timeout=120):
    url = urllib.parse.quote(url, safe=":/?&=%#~+@,;")
    for n in range(1, intentos + 1):
        req = urllib.request.Request(url, method=metodo, data=datos,
                                     headers={"User-Agent": UA, **(cabeceras or {})})
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and n < intentos:
                time.sleep(min(60, 5 * n * n))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if n == intentos:
                raise
            time.sleep(5 * n)


def texto_web(url):
    with abrir(url) as r:
        return r.read().decode("utf-8", "replace")


def limpia_html(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s)).strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ── Descubrir fuentes ────────────────────────────────────────────────────────

def fuentes_oficiales():
    """Manuales de la página de documentación de ED (solo inglés, para no duplicar)."""
    fuentes, paginas, i = {}, [ED_LISTA], 0
    while i < len(paginas):
        pagina = texto_web(paginas[i]); i += 1
        for enlace in re.findall(r'href="([^"]*documentation/\?PAGEN_1=\d+)"', pagina):
            url = urllib.parse.urljoin(ED_RAIZ, html.unescape(enlace))
            if url not in paginas:
                paginas.append(url)
        cortes = [m.start() for m in re.finditer(r"<h3>", pagina)] + [len(pagina)]
        for a, b in zip(cortes, cortes[1:]):
            trozo = pagina[a:b]
            titulo = limpia_html(re.match(r"<h3>(.*?)</h3>", trozo, re.S).group(1))
            pdf = re.search(r'href="([^"]+\.pdf)"', trozo, re.I)
            idioma = re.search(r"Localization:\s*([^<]+)", trozo)
            if not pdf or not (idioma and "ingl" in idioma.group(1).lower() or "english" in trozo.lower()):
                continue
            url = urllib.parse.urljoin(ED_RAIZ, html.unescape(pdf.group(1)))
            fid = "ed-" + slug(titulo.replace("DCS:", ""))
            fuentes[fid] = {"id": fid, "titulo": titulo, "tipo": "oficial", "url": url, "web": ED_LISTA}
        time.sleep(PAUSA)
    return list(fuentes.values())


def fuentes_chuck():
    """Guías de DCS de Chuck: cada una tiene su botón «Download PDF»."""
    indice = texto_web(CHUCK + "/")
    slugs = sorted(set(re.findall(r'href="/aircraft/dcs/([^"#?/]+)"', indice)))
    fuentes = []
    for s in slugs:
        time.sleep(PAUSA)
        web = f"{CHUCK}/aircraft/dcs/{s}"
        try:
            pagina = texto_web(web)
        except urllib.error.URLError as e:
            print(f"  ! no se pudo leer {web}: {e}", file=sys.stderr)
            continue
        pdf = re.search(r'href="(https://assets\.chucksguides\.com/pdf/[^"]+\.pdf)"', pagina)
        if not pdf:
            print(f"  ! {web}: sin enlace a PDF", file=sys.stderr)
            continue
        t = re.search(r'<a class="l" href="#pf1"[^>]*>(.*?)</a>', pagina, re.S)
        titulo = limpia_html(t.group(1)) if t else s
        fuentes.append({"id": "chuck-" + s, "titulo": "Chuck's Guide · " + re.sub(r"^DCS Guide\s*-\s*", "", titulo),
                        "tipo": "chuck", "url": html.unescape(pdf.group(1)), "web": web})
    return fuentes


def firma_remota(url):
    with abrir(url, "HEAD") as r:
        h = r.headers
        return h.get("ETag") or f"{h.get('Last-Modified', '')}|{h.get('Content-Length', '')}"


# ── Extraer texto ────────────────────────────────────────────────────────────

def normaliza(t):
    t = t.replace("\x00", "").replace("­", "")
    t = re.sub(r"-\n(?=[a-záéíóúñ])", "", t)         # palabras partidas a final de línea
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" ?\n ?", "\n", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def trocear(t):
    if len(t) <= TROZO_MAX + 300:
        return [t]
    partes, actual = [], ""
    for parrafo in re.split(r"\n\n+|(?<=[.!?])\n", t):
        if actual and len(actual) + len(parrafo) > TROZO_MAX:
            partes.append(actual); actual = ""
        while len(parrafo) > TROZO_MAX + 300:            # párrafo enorme: partir por frases
            corte = parrafo.rfind(". ", 0, TROZO_MAX)
            corte = corte + 1 if corte > 300 else TROZO_MAX
            partes.append(parrafo[:corte].strip()); parrafo = parrafo[corte:].strip()
        actual = (actual + "\n" + parrafo).strip()
    if actual:
        partes.append(actual)
    return partes


def extraer(ruta):
    """Devuelve (número de páginas, [(página, texto), ...])."""
    import pymupdf
    doc = pymupdf.open(ruta)
    trozos = []
    for n, pag in enumerate(doc, 1):
        t = normaliza(pag.get_text("text"))
        if len(t) >= TROZO_MIN:
            trozos += [(n, p) for p in trocear(t)]
    paginas = doc.page_count
    doc.close()
    return paginas, trozos


def descargar(url, destino):
    destino.parent.mkdir(parents=True, exist_ok=True)
    with abrir(url) as r, open(destino, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0); leido = 0; marca = 0
        while chunk := r.read(1 << 20):
            f.write(chunk); leido += len(chunk)
            if total and leido - marca > total // 5:
                marca = leido
                print(f"    {leido * 100 // total} %", flush=True)


# ── Almacenes: índice local (pruebas) y Cloudflare D1 (producción) ───────────

def lit(v):
    """Literal SQL seguro para texto o número."""
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("\x00", "").replace("'", "''") + "'"


class Local:
    nombre = "índice local"

    def __init__(self):
        DATOS.mkdir(parents=True, exist_ok=True)
        self.ruta = DATOS / "indice.db"
        self.con = sqlite3.connect(self.ruta)
        self.con.executescript((RAIZ / "worker" / "schema.sql").read_text(encoding="utf-8"))

    def ejecutar(self, sql):
        self.con.executescript(sql)

    def consultar(self, sql):
        cur = self.con.execute(sql)
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, fila)) for fila in cur.fetchall()]

    presupuesto = None


class D1:
    nombre = "Cloudflare D1"

    def __init__(self, cuenta, bd, token, presupuesto):
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{cuenta}/d1/database/{bd}/query"
        self.token = token
        self.presupuesto = presupuesto

    def _peticion(self, sql):
        cuerpo = json.dumps({"sql": sql}).encode()
        cab = {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}
        try:
            with abrir(self.url, "POST", cabeceras=cab, datos=cuerpo) as r:
                res = json.load(r)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"D1 respondió {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")
        if not res.get("success"):
            raise RuntimeError("D1: " + json.dumps(res.get("errors"))[:400])
        return res["result"]

    def ejecutar(self, sql):
        self._peticion(sql)

    def consultar(self, sql):
        return self._peticion(sql)[0].get("results", [])


class Wrangler:
    """D1 a través de `wrangler`, con la sesión que ya tengas iniciada (npx wrangler login): no hace falta token de API."""
    nombre = "Cloudflare D1 (con tu sesión de wrangler)"
    sql_max = 1_500_000      # wrangler admite archivos grandes: menos ejecuciones, más rápido

    def __init__(self, bd, presupuesto):
        self.bd, self.presupuesto = bd, presupuesto
        self.npx = shutil.which("npx.cmd") or shutil.which("npx")
        if not self.npx:
            raise SystemExit("No encuentro npx: instala Node.js (winget install OpenJS.NodeJS.LTS) y abre una terminal nueva.")

    def _run(self, args):
        r = subprocess.run([self.npx, "--yes", "wrangler", "d1", "execute", self.bd, "--remote", *args], cwd=RAIZ / "worker",
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode:
            raise RuntimeError("wrangler falló: " + (r.stderr or r.stdout)[-600:])
        return r.stdout

    def ejecutar(self, sql):
        # El archivo temporal va en ayuda/worker (ignorado por Git y borrado siempre al terminar): el Python de la
        # Microsoft Store redirige las escrituras en AppData y wrangler no vería el archivo.
        tmp = RAIZ / "worker" / "lote.tmp.sql"
        tmp.write_text(sql, encoding="utf-8")
        try:
            self._run(["--file", tmp.name, "--yes"])
        finally:
            tmp.unlink(missing_ok=True)

    def consultar(self, sql):
        salida = self._run(["--command", sql, "--json"])
        return json.loads(salida[salida.index("["):])[0].get("results", [])


def preparar_d1(almacen):
    if isinstance(almacen, D1):
        almacen.ejecutar((RAIZ / "worker" / "schema.sql").read_text(encoding="utf-8"))


def guardar(almacen, f, paginas, trozos):
    """Sustituye en el índice todo lo de una fuente. La firma se pone al final: si se corta a medias, se rehace."""
    almacen.ejecutar(
        f"DELETE FROM trozos WHERE fuente = {lit(f['id'])};"
        f"INSERT INTO fuentes(id,titulo,tipo,url,web,firma,paginas,fragmentos,actualizada) VALUES "
        f"({lit(f['id'])},{lit(f['titulo'])},{lit(f['tipo'])},{lit(f['url'])},{lit(f['web'])},NULL,{paginas},{len(trozos)},NULL) "
        f"ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo,tipo=excluded.tipo,url=excluded.url,web=excluded.web,"
        f"firma=NULL,paginas=excluded.paginas,fragmentos=excluded.fragmentos;")
    lote, largo = [], 0
    for pagina, texto in trozos:
        s = f"INSERT INTO trozos(texto,fuente,pagina) VALUES ({lit(texto)},{lit(f['id'])},{pagina});"
        if lote and largo + len(s) > getattr(almacen, 'sql_max', SQL_MAX):
            almacen.ejecutar("".join(lote)); lote, largo = [], 0
            time.sleep(0.3)
        lote.append(s); largo += len(s)
    if lote:
        almacen.ejecutar("".join(lote))
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    almacen.ejecutar(f"UPDATE fuentes SET firma={lit(f['firma'])}, actualizada={lit(ahora)} WHERE id={lit(f['id'])};")


# ── Programa ─────────────────────────────────────────────────────────────────

def buscar(almacen, consulta, n=6):
    terminos = " OR ".join('"' + t.replace('"', "") + '"' for t in re.findall(r"[\w\-\.]+", consulta))
    filas = almacen.consultar(
        f"SELECT f.titulo, trozos.pagina, bm25(trozos) AS puntos, substr(trozos.texto,1,260) AS ini "
        f"FROM trozos JOIN fuentes f ON f.id = trozos.fuente WHERE trozos MATCH {lit(terminos)} "
        f"ORDER BY bm25(trozos) LIMIT {n}")
    for fila in filas:
        print(f"[{fila['puntos']:.1f}] {fila['titulo']} · p. {fila['pagina']}\n    " + fila["ini"].replace("\n", " ") + "\n")
    if not filas:
        print("Sin resultados.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--listar", action="store_true", help="solo lista las fuentes y su estado")
    ap.add_argument("--solo", nargs="+", metavar="TEXTO", help="solo fuentes cuyo id contenga alguno de estos textos")
    ap.add_argument("--local", action="store_true", help="usar el índice local aunque haya credenciales de D1")
    ap.add_argument("--d1", nargs="?", const="biblioteca-dcs-ayuda", metavar="NOMBRE",
                    help="subir a Cloudflare D1 con tu sesión de wrangler (sin token de API); NOMBRE = base de datos")
    ap.add_argument("--forzar", action="store_true", help="reindexar aunque no hayan cambiado")
    ap.add_argument("--conservar", action="store_true", help="no borrar los PDF descargados")
    ap.add_argument("--max-trozos", type=int, default=15000,
                    help="tope de fragmentos por ejecución en D1 (plan gratuito: unas 100.000 filas escritas al día)")
    ap.add_argument("--buscar", metavar="CONSULTA", help="probar una búsqueda en el índice local y salir")
    a = ap.parse_args()

    cuenta, bd, token = (os.environ.get(k) for k in ("CF_ACCOUNT_ID", "CF_D1_ID", "CF_API_TOKEN"))
    if a.buscar:
        buscar(Local(), a.buscar); return
    if a.d1 and not a.local:
        almacen = Wrangler(a.d1, a.max_trozos)
    elif cuenta and bd and token and not a.local:
        almacen = D1(cuenta, bd, token, a.max_trozos)
    else:
        almacen = Local()
    print(f"Destino: {almacen.nombre}" + (f" ({almacen.ruta})" if isinstance(almacen, Local) else ""))
    preparar_d1(almacen)

    print("Buscando fuentes…")
    fuentes = fuentes_oficiales() + fuentes_chuck()
    if a.solo:
        fuentes = [f for f in fuentes if any(t.lower() in f["id"] for t in a.solo)]
    estado = {r["id"]: r["firma"] for r in almacen.consultar("SELECT id, firma FROM fuentes")}
    print(f"{len(fuentes)} fuentes ({sum(f['tipo'] == 'oficial' for f in fuentes)} oficiales, "
          f"{sum(f['tipo'] == 'chuck' for f in fuentes)} de Chuck)\n")

    gastados, pendientes, hechas = 0, [], 0
    for f in fuentes:
        time.sleep(PAUSA)
        try:
            f["firma"] = firma_remota(f["url"])
        except urllib.error.URLError as e:
            print(f"! {f['id']}: no se pudo consultar ({e})"); continue
        al_dia = estado.get(f["id"]) == f["firma"]
        if a.listar:
            print(f"{'al día   ' if al_dia else 'PENDIENTE'}  {f['id']:44} {f['titulo']}"); continue
        if al_dia and not a.forzar:
            print(f"= {f['id']}: al día"); continue
        if almacen.presupuesto is not None and gastados >= almacen.presupuesto:
            pendientes.append(f["id"]); continue
        print(f"↓ {f['id']}: {f['titulo']}")
        ruta = CACHE / (f["id"] + ".pdf")
        try:
            descargar(f["url"], ruta)
            paginas, trozos = extraer(ruta)
        except Exception as e:
            print(f"! {f['id']}: falló la descarga o la lectura ({e})"); continue
        if almacen.presupuesto is not None and gastados + len(trozos) > almacen.presupuesto and gastados:
            pendientes.append(f["id"]); continue        # no cabe hoy: se deja entera para la próxima ejecución
        try:
            guardar(almacen, f, paginas, trozos)
        except Exception as e:
            print(f"! {f['id']}: falló la subida ({e}); el PDF queda en la caché para reintentarlo"); continue
        if not a.conservar:
            ruta.unlink(missing_ok=True)                # solo se borra cuando ya está subido
        gastados += len(trozos); hechas += 1
        print(f"  ✓ {paginas} páginas, {len(trozos)} fragmentos")

    if not a.listar:
        print(f"\nListo: {hechas} fuentes indexadas o actualizadas, {gastados} fragmentos.")
        if pendientes:
            print(f"Quedan {len(pendientes)} pendientes por el tope diario; se harán en la próxima ejecución:")
            print("  " + ", ".join(pendientes))


if __name__ == "__main__":
    main()
