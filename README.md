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
     "etiquetas": ["AAR"]
   }
   ```

3. El `id` debe ser único en todo el archivo.
4. Si añades un módulo, mapa o tipo de misión que no existe todavía,
   créalo primero en `data/taxonomia.json`.

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

## Conectar tu dominio de Hostinger

1. En hPanel → DNS del dominio, crea un registro **CNAME** apuntando a
   `tu-usuario.github.io`.
2. En GitHub, Settings → Pages → "Custom domain", escribe tu dominio.
3. GitHub emite el certificado SSL automáticamente en unos minutos.
