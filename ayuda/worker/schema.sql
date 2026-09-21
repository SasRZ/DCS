-- Esquema de la base de datos de la ayuda con IA (Cloudflare D1, que es SQLite).
-- El mismo archivo lo usa el indexador para crear el índice local de pruebas.

-- Una fila por documento fuente (manual oficial o guía de Chuck).
-- "firma" es el ETag (o fecha y tamaño) del PDF cuando se indexó: sirve para saber si ha cambiado.
CREATE TABLE IF NOT EXISTS fuentes (
  id          TEXT PRIMARY KEY,
  titulo      TEXT NOT NULL,
  tipo        TEXT NOT NULL,      -- 'oficial' | 'chuck'
  url         TEXT NOT NULL,      -- PDF original (para abrirlo en la página citada)
  web         TEXT,               -- página web de la guía, si la hay
  firma       TEXT,               -- NULL mientras se está (re)indexando
  paginas     INTEGER,
  fragmentos  INTEGER,
  actualizada TEXT
);

-- Los fragmentos de texto, con búsqueda de texto completo (FTS5, ranking BM25).
-- porter: agrupa formas de una misma palabra; remove_diacritics: "tambien" encuentra "también".
CREATE VIRTUAL TABLE IF NOT EXISTS trozos USING fts5(
  texto,
  fuente UNINDEXED,
  pagina UNINDEXED,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- Contadores para los límites de uso (por día y por clave: global, dispositivo o IP).
CREATE TABLE IF NOT EXISTS uso (
  dia   TEXT NOT NULL,
  clave TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, clave)
);

-- Caché de respuestas: una primera pregunta ya contestada se sirve sin llamar a la IA.
-- "pregunta" guarda solo las palabras clave normalizadas (nunca quién preguntó); "indice" es la versión del índice con la que se generó.
CREATE TABLE IF NOT EXISTS cache_respuestas (
  clave     TEXT PRIMARY KEY,
  pregunta  TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  fuentes   TEXT NOT NULL,
  indice    TEXT NOT NULL,
  creada    TEXT NOT NULL,
  usos      INTEGER NOT NULL DEFAULT 0
);
