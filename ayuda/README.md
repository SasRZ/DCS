# Ayuda con IA (privada, para el escuadrón)

Una caja de preguntas dentro de la web (`#/ayuda`) que contesta dudas de DCS con los **manuales oficiales de
Eagle Dynamics** y las **guías de Chuck**, y dice de qué página sale cada dato.

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
5. **Indexar**. Crea un token de API de Cloudflare con permiso *D1: Edit* y apunta tu ID de cuenta y el `database_id`:

   ```powershell
   $env:CF_ACCOUNT_ID = "…"; $env:CF_D1_ID = "…"; $env:CF_API_TOKEN = "…"
   python ayuda/indexar.py --solo f-16      # primero una prueba con el F-16
   python ayuda/indexar.py                  # después, todo
   ```

   Necesita `pip install pymupdf`. El plan gratuito de D1 permite unas 100.000 filas escritas al día: por eso el
   script se detiene a los 15.000 fragmentos (`--max-trozos`) y lo pendiente se hace en la siguiente ejecución. Repítelo
   uno o dos días, o pasa Workers al plan de pago (5 $/mes) y sube el tope.

## Actualización automática

El workflow `.github/workflows/ayuda-indexar.yml` lo hace cada lunes sin que tengas el PC encendido. Para activarlo, en
GitHub → Settings → Secrets and variables → Actions:

- Secretos: `CF_ACCOUNT_ID`, `CF_D1_ID` y `CF_API_TOKEN`.
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
