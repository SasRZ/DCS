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
5. Para enlazar una web en lugar de subir un archivo, pon una dirección
   completa en `url` (`https://…`) y `"tipo": "WEB"`. Se abre en una pestaña
   nueva y el validador no busca ese archivo. Así van las guías de Chuck's
   Guides: siempre se consultan en su web oficial para que estén actualizadas.
6. Si añades un módulo, mapa o tipo de misión que no existe todavía,
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
- Los apartados sin documentos no se ven. Para revisarlos todos, junto con los
  grupos ocultos, abre la web con `?todo` (por ejemplo
  `http://localhost:8080/?todo`).

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
