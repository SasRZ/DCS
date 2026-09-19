#!/usr/bin/env python3
"""
Valida data/taxonomia.json y data/documentos.json antes de publicar.

Comprueba:
  - JSON bien formado en ambos archivos
  - ids de documento únicos
  - urls de documento únicas (evita subir el mismo PDF dos veces con dos fichas)
  - títulos duplicados (aviso, no bloquea)
  - cada "ref" de un documento existe en la taxonomía
  - cada documento tiene al menos una "ref"
  - los archivos locales referenciados (docs/...) existen de verdad en el repo

Uso:
  python3 scripts/validar_catalogo.py

Sale con código 1 si hay errores (bloquea el deploy en GitHub Actions).
Los avisos no bloquean, solo se muestran.
"""

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TAXONOMIA = RAIZ / "data" / "taxonomia.json"
DOCUMENTOS = RAIZ / "data" / "documentos.json"

errores = []
avisos = []


def cargar_json(ruta):
    if not ruta.exists():
        errores.append(f"No existe el archivo {ruta.relative_to(RAIZ)}")
        return None
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errores.append(f"{ruta.relative_to(RAIZ)} no es JSON válido: {e}")
        return None


def indice_taxonomia(arbol):
    """Devuelve el conjunto de referencias válidas, p.ej. 'modulos/f16c'."""
    refs_validas = set()
    for cat_id, cat in arbol.items():
        for grupo in cat.get("grupos", []):
            for item in grupo.get("items", []):
                refs_validas.add(f"{cat_id}/{item['id']}")
    return refs_validas


def validar(arbol, documentos):
    refs_validas = indice_taxonomia(arbol)

    ids_vistos = {}
    urls_vistas = {}
    titulos_vistos = {}

    for i, doc in enumerate(documentos):
        etiqueta = doc.get("id") or doc.get("titulo") or f"documento #{i}"

        doc_id = doc.get("id")
        if not doc_id:
            errores.append(f"[{etiqueta}] no tiene campo 'id'")
        elif doc_id in ids_vistos:
            errores.append(f"Id repetido: '{doc_id}' (usado también en '{ids_vistos[doc_id]}')")
        else:
            ids_vistos[doc_id] = etiqueta

        url = (doc.get("url") or "").strip()
        if url:
            clave = url.lower()
            if clave in urls_vistas:
                errores.append(
                    f"El archivo '{url}' está referenciado por dos fichas distintas: "
                    f"'{urls_vistas[clave]}' y '{doc_id}'. Usa una sola ficha con varias 'refs'."
                )
            else:
                urls_vistas[clave] = doc_id

            if not url.startswith(("http://", "https://")):
                ruta_local = RAIZ / url
                if not ruta_local.exists():
                    errores.append(f"[{doc_id}] apunta a '{url}', que no existe en el repositorio")
        else:
            errores.append(f"[{doc_id}] no tiene 'url'")

        titulo = (doc.get("titulo") or "").strip().lower()
        if titulo:
            if titulo in titulos_vistos and titulos_vistos[titulo] != doc_id:
                avisos.append(f"Títulos idénticos: '{doc_id}' y '{titulos_vistos[titulo]}'")
            else:
                titulos_vistos[titulo] = doc_id

        refs = doc.get("refs") or []
        if not refs:
            errores.append(f"[{doc_id}] no tiene ninguna 'ref' (no aparecerá en ninguna categoría)")

        vistas = set()
        for ref in refs:
            if ref not in refs_validas:
                errores.append(f"[{doc_id}] referencia '{ref}', que no existe en taxonomia.json")
            if ref in vistas:
                avisos.append(f"[{doc_id}] repite la referencia '{ref}'")
            vistas.add(ref)


def main():
    arbol = cargar_json(TAXONOMIA)
    documentos = cargar_json(DOCUMENTOS)

    if arbol is not None and documentos is not None:
        validar(arbol, documentos)

    if avisos:
        print(f"⚠  {len(avisos)} aviso(s):")
        for a in avisos:
            print(f"   - {a}")

    if errores:
        print(f"\n✗ {len(errores)} error(es) en el catálogo:")
        for e in errores:
            print(f"   - {e}")
        print(f"\nTotal documentos revisados: {len(documentos) if documentos else 0}")
        sys.exit(1)

    print(f"✓ Catálogo correcto: {len(documentos)} documentos, sin duplicados ni referencias rotas.")
    sys.exit(0)


if __name__ == "__main__":
    main()
