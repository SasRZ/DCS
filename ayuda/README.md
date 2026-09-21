# Ayuda con IA (privada, para el escuadrón)

Una caja de preguntas dentro de la web (`#/ayuda`) que contesta dudas de DCS con los **manuales oficiales de
Eagle Dynamics**, las **guías de Chuck** y los documentos de esta biblioteca, y dice de qué página sale cada dato.
Además: preguntas sobre la página abierta en el visor, hojas de consulta en PDF para el kneeboard y novedades de los manuales.

Nada de esto está en la web pública:

| Pieza | Dónde vive | Público |
|---|---|---|
| Pantalla de preguntas | `ayuda.js` y `ayuda.css` en la web | Sí, pero sin código no responde nada |
| Servicio | Cloudflare Worker (`ayuda/worker`) | Solo acepta peticiones con el código del escuadrón |
| Clave de la API de Anthropic | Secreto del Worker | No |
| Texto de manuales y guías | Base de datos Cloudflare D1 | No |
| Índice de pruebas en tu PC | `%LOCALAPPDATA%\BibliotecaDCS-ayuda`, fuera del repo | No |

Mientras `URL_SERVICIO` esté vacía en `ayuda.js`, la ayuda no aparece en la web.

## Cómo funciona

1. `indexar.py` lee la [página de documentación de ED](https://www.digitalcombatsimulator.com/es/downloads/documentation/)
   y las guías de DCS de [Chuck's Guides](https://chucksguides.com), descarga los PDF, saca el texto y lo guarda en el
   índice de búsqueda. **Nadie descarga nada a mano.** Cada semana (o cuando lo lances) vuelve a mirar cada PDF: si su
   ETag (o fecha y tamaño) no ha cambiado, no lo toca.
2. Al preguntar, el Worker usa Claude Haiku para convertir la pregunta a términos técnicos en inglés y elegir las fuentes
   del módulo. Busca en el índice (SQLite FTS5) y pasa los mejores fragmentos a Claude Sonnet, que redacta la respuesta
   solo con ellos. Si no hay nada, lo dice. Enlaza la página exacta de la fuente.
3. Límites por día: 20 preguntas por dispositivo, 40 por IP y 300 en total (se cambian en `worker/wrangler.toml`).
4. **Caché de respuestas.** La primera pregunta de una conversación se guarda en D1 con una clave hecha de sus palabras clave
   normalizadas (sin acentos ni palabras vacías, «F-16» = «f16», sin importar el orden). Si alguien pregunta lo mismo, se
   sirve al instante (0,2 s en vez de unos 13), sin llamar a la IA y sin gastar cupo. Solo se guardan respuestas que citan
   fuentes, nunca las preguntas de seguimiento, y caducan a los 45 días o en cuanto se indexa algo nuevo o cambiado (así
   ninguna sobrevive a un parche). No se guarda quién preguntó. Si cambias los prompts del Worker, sube `VERSION_CACHE`.

   **Preguntas frecuentes:** las (hasta 6) que más se repiten salen en `#/ayuda` como botones (`/frecuentes`), completadas con los
   ejemplos fijos de `ayuda.js`. Son respuestas ya guardadas, así que se contestan al instante y no gastan crédito ni cupo. Para
   poder enseñarlas, la caché guarda el texto de la primera vez que se preguntó (nunca quién) y solo se muestran las que se han
   repetido y siguen vigentes con el índice actual; si lleva enlaces o correos no se guarda.
5. **Documentos de la biblioteca.** Los PDF de `data/documentos.json` con texto también se indexan (ids `bib-…`): así la
   ayuda puede contestar con los SOP, procedimientos, la DCS Threats Guide, etc., y los cita como «de la biblioteca».
   Se leen del disco (no se descargan) y se reindexan solos cuando cambia el archivo: `python ayuda/indexar.py --d1 --solo bib-`.
   Los PDF que son solo imagen (cartas de aeródromos, hojas de armamento) no tienen texto que leer; harían falta OCR.
6. **Preguntar desde el visor (tablet).** En el visor de PDF, el botón **💬 Preguntar** abre un panel para preguntar por la página
   abierta, hablando (dictado del navegador) o escribiendo. La web envía qué documento y qué página es (`contexto`), y el
   servicio pone el texto de esa página el primero. Si la página es una imagen sin texto, la IA lo dice. Esas preguntas no usan la
   caché. El dictado depende del navegador: si no lo permite (por ejemplo, sin servicios de Google), avisa y se usa el micrófono del teclado.
7. **Hojas de consulta.** En `#/ayuda`, «Crear hoja»: el servicio (`/hoja`) prepara con los manuales una hoja de una página
   (secciones, pasos con interruptor y posición, avisos y fuentes) como JSON validado; el navegador (`hoja.js`) la dibuja en un
   canvas A5 y la empaqueta como PDF. Se descarga o se guarda en Mi kneeboard (caché del navegador), donde se abre sin conexión.
   Tope de 6 hojas por dispositivo y día (`LIMITE_HOJAS`); también pasan por la caché de respuestas.
8. **Novedades por parche.** Cada vez que `indexar.py` reindexa una fuente que ya existía (porque ED o Chuck la han actualizado, o
   con `--forzar`), compara las frases del texto anterior y del nuevo (da igual que las páginas se desplacen) y guarda las
   diferencias en la tabla `cambios`. La página `#/novedades` las enseña con un resumen hecho por IA, que se genera la primera
   vez que se abre y se guarda. Si solo hay ruido (cabeceras, números de página), lo marca como «sin cambios relevantes».

## Puesta en marcha (una vez)

1. **Node.js** (necesario para `wrangler`): `winget install OpenJS.NodeJS.LTS`, y abre una terminal nueva.
2. **Cuenta de Cloudflare** (gratuita) y, en la consola de Anthropic, una **clave de API nueva con límite de gasto mensual**.
   No la escribas en ningún archivo ni la pegues en chats: irá a un secreto.
3. En `ayuda/worker`:

   ```bash
   npx wrangler login
   npx wrangler d1 create biblioteca-dcs-ayuda
   ```

   Copia el `database_id` que imprime a `wrangler.toml`. Después:

   ```bash
   npx wrangler d1 execute biblioteca-dcs-ayuda --remote --file=schema.sql
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put CODIGOS
   npx wrangler deploy
   ```

   `CODIGOS` es el código de acceso del escuadrón (varios, separados por comas, si quieres cambiarlo sin cortar a nadie).
   `deploy` imprime la dirección del servicio, `https://biblioteca-dcs-ayuda.<tu-subdominio>.workers.dev`.
4. Pon esa dirección (sin barra final) en `URL_SERVICIO` de `ayuda.js`, haz commit y súbelo. Aparecerá el enlace
   «Ayuda IA» junto a Créditos.
5. **Indexar**. Con la sesión de `wrangler` ya iniciada no hace falta ningún token:

   ```bash
   pip install pymupdf
   python ayuda/indexar.py --d1 --solo f-16      # primero una prueba con el F-16
   python ayuda/indexar.py --d1                  # después, todo
   ```

   El plan gratuito de D1 permite unas 100.000 filas escritas al día: por eso el script se detiene a los 15.000
   fragmentos por ejecución (`--max-trozos`) y lo pendiente se hace en la siguiente. Repítelo uno o dos días, o pasa
   Workers al plan de pago (5 $/mes) y sube el tope.

## Actualización automática

El workflow `.github/workflows/ayuda-indexar.yml` lo hace cada lunes sin que tengas el PC encendido. Para activarlo, en
GitHub → Settings → Secrets and variables → Actions:

- Secretos: `CF_ACCOUNT_ID`, `CF_D1_ID` y `CF_API_TOKEN` (un token de API de Cloudflare con permiso *D1: Edit*; solo se necesita para esto).
- Variable: `AYUDA_ACTIVA` = `true`.

Si los servidores de GitHub no pudieran descargar de ED o de Chuck (a veces bloquean las IP de centros de datos), ejecuta
`python ayuda/indexar.py` desde tu PC con el Programador de tareas de Windows; funciona igual.

## Comandos útiles

```bash
python ayuda/indexar.py --listar               # qué fuentes hay y cuáles están al día
python ayuda/indexar.py --solo a-10c chuck-fa  # solo esas fuentes (por trozo del id)
python ayuda/indexar.py --forzar --solo f-16   # reindexar aunque no hayan cambiado
python ayuda/indexar.py --local --buscar "ALQ-184 ECM pod"   # probar el índice local
npx wrangler tail                              # ver los errores del servicio en directo (en ayuda/worker)
```

## Notas

- Los textos son obra de Eagle Dynamics y de Chuck. Este servicio es una herramienta interna del escuadrón: el texto
  no se publica, las respuestas parafrasean y enlazan a la fuente original. Si algún autor lo pide, se quita: borra sus filas
  con `DELETE FROM trozos WHERE fuente = '…'` y `DELETE FROM fuentes WHERE id = '…'`.
- Para cambiar el código de acceso: `npx wrangler secret put CODIGOS` con el nuevo (y el viejo, mientras dure el cambio).
- Coste orientativo: Sonnet 5 responde con unos 2 céntimos de dólar por pregunta; con el límite de gasto de tu cuenta
  de Anthropic y los topes diarios no puede dispararse.
