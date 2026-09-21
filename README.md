# Biblioteca DCS

Catálogo estático de documentación para DCS World: módulos, mapas, tipos de
misión y general. Sin backend — solo HTML, CSS y JSON.

## Estructura

```
.
├── index.html                    la web entera (maquetación + navegación)
├── data/
│   ├── taxonomia.json            categorías y subcategorías
│   └── documentos.json           catálogo: una ficha por documento
├── docs/                         los archivos reales, en espejo de la taxonomía
│   ├── modulos/f16c/…
│   ├── mapas/caucaso/…
│   └── misiones/sead/…
├── kneeboard.js / kneeboard.css  guardados sin conexión y visor de PDF
├── sw.js, manifest.webmanifest   modo sin conexión y app instalable (+ icons/)
├── vendor/pdfjs/                 PDF.js, el visor de PDF (Apache 2.0)
├── scripts/
│   └── validar_catalogo.py       comprueba duplicados y referencias rotas
└── .github/workflows/paginas.yml valida y publica en GitHub Pages
```

## Añadir un documento

1. Copia el archivo a `docs/<categoría>/<subcategoría>/` (en la carpeta de
   donde "nace" el documento; si sirve para varias categorías, no lo
   dupliques, usa `refs`).
2. Añade una ficha en `data/documentos.json`:

   ```json
   {
     "id": "f18-aar",
     "titulo": "F/A-18C · reabastecimiento en vuelo",
     "tipo": "PDF",
     "nota": "Aproximación a la cesta y al KC-135.",
     "url": "docs/modulos/fa18c/aar.pdf",
     "refs": ["modulos/fa18c", "mapas/golfo"],
     "etiquetas": ["AAR"],
     "autor": "Nombre del creador"
   }
   ```

3. El `id` debe ser único en todo el archivo.
4. `autor` es opcional pero recomendable: aparece en la ficha de la web y
   entra en la búsqueda. Úsalo siempre que el documento no sea propio.
5. `"destacado": true` marca un documento especialmente relevante: en todas las
   categorías donde aparece sale el primero, a todo el ancho, en ámbar y con la
   etiqueta «Destacado».
6. Para enlazar una web en lugar de subir un archivo, pon una dirección
   completa en `url` (`https://…`) y `"tipo": "WEB"`. Se abre en una pestaña
   nueva y el validador no busca ese archivo. Así van las guías de Chuck's
   Guides: siempre se consultan en su web oficial para que estén actualizadas.
7. Si añades un módulo, mapa o tipo de misión que no existe todavía,
   créalo primero en `data/taxonomia.json`.

## Cómo se pintan las categorías (`data/taxonomia.json`)

Todos los campos siguientes son opcionales:

- En un **grupo**: `desc` (línea bajo el título), `color` (`azul`, `ambar`,
  `rojo`, `teal`, `verde` o `lila`) y `"oculto": true`. Un grupo oculto no se
  ve, y tampoco sus documentos en la búsqueda, los recuentos y Créditos, pero no
  se borra nada: quita la marca y vuelve a aparecer.
- En un **apartado**: `rol` (descripción corta), `chip` (etiqueta arriba a la
  derecha, como FC o MOD), `completo` (nombre completo, para los tipos de
  misión) y `modulos` (lista de ids de módulos típicos de ese tipo de misión,
  que se muestran como enlaces cuando ese módulo tiene documentos).
- En **Mapas**, el número de aeródromos y las etiquetas de contenido (CARTAS,
  EN RUTA…) se calculan solos a partir de las fichas.
- La **ficha de cada módulo** (foto y datos clave: servicio, techo, autonomía y
  alcance de sus armas) sale de `data/modulos.json`, con una entrada por id de
  módulo: `foto` (archivo de Wikimedia Commons, autor y licencia), `servicio`,
  `techo`, `autonomia`, `armas` (pares nombre y alcance) y `armas_nota` cuando no
  hay misiles. Las fotos se cargan desde Wikimedia con su crédito debajo. Los
  datos son del tipo de aeronave real, orientativos: el módulo de DCS puede
  modelar otra versión. Un módulo sin entrada simplemente no muestra ficha.
- La ficha de cada **mapa** sale de `data/mapas.json` (región, superficie,
  aeródromos, desarrollador, terreno y acceso, de la ficha oficial de la tienda
  de DCS) y la de cada **tipo de misión** de `data/misiones.json` (objetivos,
  perfil de vuelo, armas, amenazas, con quién se coordina y vocabulario). Ambas
  llevan foto de Wikimedia Commons con su crédito y siguen el mismo formato:
  `foto` y `filas` (pares etiqueta y texto), más `chips` en las misiones. La
  ficha de un mapa añade sola cuántos aeródromos con cartas y documentos hay, y
  la de una misión enlaza los aviones típicos que indica `modulos` en la taxonomía.
- La **portada** sale de `data/portada.json`: para cada categoría, su `color`, el
  texto pequeño de arriba (`kicker`) y la `foto` de fondo (Wikimedia Commons, con
  autor y licencia; su crédito no se ve sobre la tarjeta, sale en la página
  Créditos), más la lista de `busquedas` rápidas que salen como botones
  bajo el buscador. La tecla `/` enfoca el buscador. Los mensajes del final de
  la portada están en `index.html`: el objeto `RETO` («Ponte a prueba») y el
  objeto `FOX3` (el banner grande de invitación al escuadrón, con sus dos
  enlaces).
- Los apartados sin documentos no se ven. Para revisarlos todos, junto con los
  grupos ocultos, abre la web con `?todo` (por ejemplo
  `http://localhost:8080/?todo`).

## Modo kneeboard (tablet, sin conexión)

La web es también una app instalable pensada para usarla de kneeboard en una tablet.
**Solo aparece en tablet y móvil** (dispositivos con pantalla táctil como puntero principal);
en escritorio la web se ve limpia, sin botones, sin enlace y sin opción de instalarla. Para verla
igualmente (por ejemplo, para probarla), abre la web con `?kneeboard`; con `?kneeboard=0` se
vuelve a ocultar. Se recuerda en ese navegador.

- **☆ Guardar** en cualquier PDF lo descarga al dispositivo. Los guardados salen en
  **Mi kneeboard** (enlace junto al buscador) y se abren sin conexión.
- **Leer** abre el PDF en un visor a pantalla completa: pasar página con un
  toque en los bordes o deslizando, zoom con pellizco o con +/−, ajuste a página o
  a ancho, modo noche, pantalla siempre encendida, cambio rápido entre los documentos
  guardados y recuerda la última página de cada uno.
- Lo guardado y las preferencias quedan **en el dispositivo** (caché del navegador y
  `localStorage`), sin cuenta ni servidor. Cuando se sube algo nuevo al repositorio, la
  web se actualiza sola al abrirla con conexión; los PDF guardados se renuevan con
  **Actualizar todo**. **Copiar lista** / **Pegar lista** lleva la lista de un dispositivo a otro.
- Piezas: `manifest.webmanifest` e `icons/` (la app instalable), `sw.js` (service worker:
  deja web y JSON disponibles sin conexión), `kneeboard.js` y `kneeboard.css` (guardados y
  visor) y `vendor/pdfjs/` (PDF.js 3.11.174, licencia Apache 2.0, sin dependencia de internet).
- Si añades un archivo que la web necesite para arrancar sin conexión, añádelo a `PRECACHE` en
  `sw.js` (el validador comprueba que todos existan). Si cambias esa lista, sube `VERSION`.
- Se instala desde el menú del navegador → «Añadir a la pantalla de inicio» / «Instalar aplicación».
  Necesita HTTPS, que da GitHub Pages; en local solo funciona en `localhost`.

## Ayuda con IA (privada)

`ayuda.js`, `ayuda.css` y la carpeta `ayuda/` forman una caja de preguntas que contesta con los manuales
oficiales de ED y las guías de Chuck. Es privada: el texto de los manuales vive en Cloudflare, nunca en este
repositorio, y el servicio exige un código del escuadrón. No aparece en la web hasta que se configura
`URL_SERVICIO` en `ayuda.js`. Instrucciones completas en [`ayuda/README.md`](ayuda/README.md).

## Validar antes de subir

```bash
python3 scripts/validar_catalogo.py
```

Comprueba: JSON bien formado, ids únicos, urls únicas (mismo archivo
referenciado dos veces), títulos duplicados, referencias a categorías
inexistentes, documentos sin ninguna categoría, y archivos locales que
no existen en el repositorio. Sale con código de error si hay problemas,
así que también sirve como filtro automático antes de publicar.

## Probarlo en local

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080`. No abras `index.html` con doble clic: el
navegador bloquea las peticiones `fetch` a los JSON en `file://`.

## Publicar en GitHub Pages

1. Sube este repositorio a GitHub (repositorio nuevo, público o privado).
2. En **Settings → Pages**, en "Source" elige **GitHub Actions**
   (no "Deploy from a branch").
3. Cada `push` a `main` dispara el workflow `.github/workflows/paginas.yml`:
   primero valida el catálogo y, solo si pasa, publica el sitio.
   Si hay un error (por ejemplo un id duplicado), el despliegue no llega
   a ejecutarse y lo ves marcado en rojo en la pestaña **Actions**.
4. La URL de publicación aparece en Settings → Pages y también en el
   resumen del workflow, con forma `https://tu-usuario.github.io/repo/`.

## Créditos

La web tiene una página **Créditos** (enlace junto al buscador). Se genera sola:

- `data/creditos.json` guarda los autores (nombre, enlace opcional y una
  descripción corta).
- La lista de documentos de cada autor sale del campo `autor` de las fichas de
  `data/documentos.json`.
- Un `autor` que no esté en `creditos.json` aparece igualmente, sin enlace ni
  descripción, y el validador lo avisa.

Es una recopilación de consulta personal: todos los derechos son de sus autores.

## Conectar tu dominio de Hostinger

1. En hPanel → DNS del dominio, crea un registro **CNAME** apuntando a
   `tu-usuario.github.io`.
2. En GitHub, Settings → Pages → "Custom domain", escribe tu dominio.
3. GitHub emite el certificado SSL automáticamente en unos minutos.
