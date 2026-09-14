# Tasks

To-do diaria para móvil. PWA instalable y sin cuentas: las tareas viven en el propio
dispositivo. Se publica en GitHub Pages desde este repo público. Un Worker mínimo de
Cloudflare envía los avisos push y solo ve horas y contenido cifrado.

- Producción: https://diegomolinacatala.github.io/tasks/
- Idioma de la interfaz: **español**. Sin textos explicativos ni microcopy de relleno.
- Formato objetivo: **móvil en vertical**. El escritorio no es un caso a optimizar.

## Comandos

```bash
npm run dev        # servidor local en http://localhost:5173/tasks/ (sin service worker)
npm test           # tests unitarios (vitest, entorno node)
npm run coverage   # cobertura de src/lib y src/state
npm run typecheck  # tsc de la app y del service worker (tsconfig.sw.json)
npm run build      # typecheck + build de producción a dist/
npm run icons      # regenera public/icons/* (solo si cambia la marca)

node scripts/vapid-keys.mjs     # par de claves VAPID nuevo (la privada solo a wrangler secret)

cd worker
npm test                        # tests del Worker
npm run dev                     # wrangler dev en :8787 con D1 local (las alarmas también funcionan)
npm run db:init:local           # crea las tablas en la D1 local
npm run db:init:query           # crea las tablas en remoto si --file falla por red ("fetch failed")
npx wrangler tail               # registros en vivo: PUT /v1/schedule, "avisos {...}", "push no enviado"
npm run eval -- --local         # banco de frases dictadas contra el analizador local (gratis)
npm run eval -- cena vuelo      # esos casos contra Workers AI real (EVAL_MODEL=@cf/... para otro modelo)
npm run eval -- --all           # todos: ~9.000 neuronas, casi la cuota gratuita del día (ver Dictado)
```

Para probar avisos en local: `worker/.dev.vars` con la salida de `vapid-keys.mjs` más
`VAPID_SUBJECT` (ignorado por git), `.env.local` con `VITE_PUSH_API=http://localhost:8787`, y `npm run build && npm run preview`
(el service worker solo existe en el build).

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| UI | React 19 + TypeScript + Vite | estándar, estático, build simple |
| Drag & drop | dnd-kit (core + sortable) | sensores táctiles resueltos: pulsación mantenida, auto-scroll, teclado |
| Persistencia | IndexedDB vía `idb-keyval`, con `localStorage` de reserva | offline real, sin servidor |
| PWA | `vite-plugin-pwa` con `injectManifest` (`src/sw.ts`) | instalable, offline y receptor de push |
| Avisos | Cloudflare Worker + D1 + alarma de Durable Object, `@block65/webcrypto-web-push` | iOS solo despierta una PWA cerrada con Web Push desde un servidor |
| Tests | Vitest en entorno node | la lógica pura es lo que se testea |

Sin router (una sola pantalla con dos vistas), sin librería de estado, sin framework CSS,
sin fuentes externas. El bundle debe seguir por debajo de ~120 kB gzip.

## Arquitectura

```
src/
├── types.ts              # Task, Reminder, Section, AppState
├── sw.ts                 # precache + push + notificationclick
├── lib/                  # lógica pura + adaptadores de navegador
│   ├── date.ts           # ISO local YYYY-MM-DD / HH:MM, semana que empieza en lunes
│   ├── order.ts          # scopes y reordenación
│   ├── reminders.ts      # resolver avisos, agenda futura, atajos, posponer
│   ├── parse.ts          # lenguaje natural del compositor ("mañana a las 5")
│   ├── when.ts           # piezas de parse.ts: horas, plazos y días
│   ├── title.ts          # título limpio: muletillas, "tengo que acudir a una cena" → "Cena"
│   ├── interpret.ts      # valida en el móvil las tareas que devuelve la IA del Worker
│   ├── normalize.ts      # minúsculas, sin tildes, números en palabras → dígitos
│   ├── schedule.ts       # agenda de avisos: contenido, resumen diario, badge
│   ├── voice/            # WAV, captura de micrófono, Web Speech API
│   ├── backup.ts         # exportar/importar y saneado (= migración de esquema)
│   ├── persistence.ts    # IndexedDB + fallback
│   ├── transition.ts     # View Transitions API con degradación
│   └── push/             # cifrado, cliente HTTP, suscripción, claves, sincronización
├── state/                # reducer, acciones, selectores, provider
└── components/           # por dominio: shell, views, task, section, compose, push, settings, ui, dnd
worker/                   # Cloudflare Worker de avisos (paquete npm independiente)
├── src/prompt.ts         # reglas, calendario y ejemplos que recibe la IA del dictado
├── src/interpret.ts      # esquema JSON, llamada al modelo y validación de su salida
└── eval/                 # banco de frases dictadas con la respuesta esperada (`npm run eval`)
```

### Estado

Un único `useReducer` con `AppState` inmutable en `src/state/reducer.ts`, expuesto por
`StoreProvider`. Cada cambio se persiste con debounce de 250 ms y se fuerza el guardado en
`pagehide` y `visibilitychange` (el sistema puede matar la pestaña sin avisar).

**Nunca mutar**: todas las operaciones devuelven objetos nuevos. Los tests lo comprueban.
Las acciones que dependen de la hora (`task/snooze`) llevan `now` dentro para que el
reducer siga siendo puro.

Cambiar el esquema = subir `SCHEMA_VERSION` y rellenar los campos nuevos en
`normalizeState` (`src/lib/backup.ts`), que se aplica tanto al cargar como al importar.

### Orden de las tareas (`src/lib/order.ts`)

`Task.order` es relativo a un *scope*:

- tarea con fecha → un scope por `(día, sección)`
- tarea sin fecha → un único scope plano `backlog`

Por eso `tasksOn()` solo garantiza que lo pendiente va antes que lo completado: el orden
entre secciones distintas no es comparable. Cada vista ordena lo que muestra.

### Pantallas

Dos vistas (`ViewId`): `home` y `week`.

**`home`** es la pantalla principal y tiene tres bloques fijos, de arriba abajo:

1. `Atrasadas` — pendientes de días anteriores, en rojo. Se puede sacar de aquí pero no
   soltar dentro: sus tareas conservan la fecha hasta que se mueven a otro bloque.
2. `Hoy` — lista raíz más las secciones del usuario.
3. `Sin fecha` — lo que no tiene día. Es donde caen las tareas nuevas por defecto.

`Atrasadas` y `Sin fecha` se pliegan y ese estado se guarda en `AppState.collapsed`.

### Drag & drop

- **El arrastre solo se activa desde el asa** (`task__grip`, `section__grip`), con
  `touch-action: none` y un umbral de 4 px. El resto de la fila queda libre para el scroll
  vertical y el deslizamiento horizontal, así que los tres gestos no compiten.
- **`home`**: `useHomeBoard` mantiene una copia (`preview`) del tablero durante el gesto y
  confirma todo con una sola acción `board/commit` al soltar. La copia vive además en un
  ref: al soltar hay que leer el estado real del gesto, no el del último render.
  Cada columna del commit lleva su propio destino: `root` y las secciones van a hoy,
  `backlog` va a `null`, y `overdue` se excluye del commit.
- **`week`**: cada día es un `useDroppable`; soltar cambia la fecha y conserva la sección.
  No se reordena dentro del día (el orden es por sección y quedaría ambiguo).
- Ids con prefijo para no colisionar: `col:<clave>` (columna), `sec:<id>` (sección),
  el id pelado de la tarea para las tareas. Ver `src/components/dnd/ids.ts`.

### Gestos de fila (`useSwipe`)

Deslizar a la derecha completa, a la izquierda borra (con deshacer en un toast). El gesto
se bloquea en un eje según el primer movimiento. El desplazamiento se guarda en un ref
además de en el estado: al soltar hay que leer el valor real, no el del render anterior.
El asa detiene la propagación del `pointerdown` para no disparar también el deslizamiento.

### Alta de tareas

El compositor crea **sin fecha** por defecto (Enter o el `+`). `parseTask` reconoce día,
hora y plazos en español ("mañana a las 5", "el lunes", "15/10", "en 30 min"): si detecta
algo lo aplica y enseña una píldora; tocarla deja el texto literal. Con hora → aviso a la
hora; con "en X min/horas" → aviso absoluto. Un número suelto nunca es una hora
("comprar 5 manzanas"). Sin nada detectado aparece el atajo de un toque a hoy —o al día
seleccionado en la vista semana—.

También entiende avisos dentro de la frase ("y recuérdamelo 10 minutos antes", "avísame a
las 9", "el día antes") y números en palabras: `normalize.ts` los pasa a dígitos guardando de
qué parte del original viene cada carácter, para recortar bien el título. Si la frase pide
avisos concretos, no se añade el de "a la hora".

### Dictado

Con la barra vacía aparece el micrófono. Al hablar se crea la tarea sola (`parseSpoken`) y un
toast enseña lo entendido con "Deshacer".

- **Con los avisos activos** graba PCM con un `ScriptProcessor` (`voice/capture.ts`), corta al
  detectar 1,5 s de silencio, lo pasa a WAV de 16 kHz y lo transcribe el Worker con Whisper
  (`POST /v1/transcribe`, Workers AI). Es la única vía que funciona en la app instalada de
  iPhone: allí la Web Speech API existe pero no devuelve nada.
- **Interpretación con IA**: junto al audio va la fecha y hora local del móvil. El Worker pasa
  el texto a Nemotron 3 120B (Workers AI) con salida forzada por esquema JSON. Para cada tarea
  el modelo copia primero los tres fragmentos de la frase (`tema`, `cuando`, `avisos`) y luego
  los convierte en título, día, hora y recordatorios: "bueno, hoy tengo que acudir a una cena a
  las 20:00, me gustaría que me lo recordaras media hora antes" → `Cena`, hoy, 20:00, 30 min antes.
  - `prompt.ts`: reglas del título (evento sin verbo de ir: "Cena", "Boda de Carlos"; acción en
    infinitivo: "Llamar a Miguel"), calendario de tres semanas agrupado por semanas y ejemplos
    resueltos con las fechas del día.
  - Las cuentas las hace el código, no el modelo: `date` es `null` si la frase no dice día (el
    móvil aplica "hoy si la hora no ha pasado, si no mañana") y "en 20 minutos" llega como
    `inMinutes` y el Worker lo pasa a hora local.
  - Se valida en el Worker y otra vez en el móvil (`lib/interpret.ts`). Si la IA falla, tarda más
    de 8 s o no devuelve nada válido, se usa `parseSpoken` sobre el texto.
  - El modelo se eligió con `npm run eval` (66 frases con respuesta esperada) entre los del plan
    gratuito: Nemotron acertó 46/48 con ~1,2 s; Qwen 3.8 y Gemma 4 aciertan parecido pero tardan
    hasta 15–50 s en algunas frases, y Llama 3.3 se quedaba en 37–40/48. Cualquier cambio en el
    prompt se mide con el banco antes y después, y cada fallo nuevo se añade como caso.
  - Cuota: el plan gratuito de Workers AI da 10.000 neuronas al día, compartidas entre la app y
    `npm run eval`. Un dictado gasta ~140 (Whisper + prompt de ~2.000 tokens); si se agota, el
    dictado deja de funcionar hasta las 00:00 UTC.
- **Analizador local** (`parseSpoken`, respaldo y única vía sin avisos): entiende las mismas
  frases salvo varias tareas a la vez. Quita muletillas y verbos de ir (`title.ts`), y reconoce
  "un cuarto de hora antes", "con media hora de antelación", "el día antes a las 8",
  "recuérdamelo por la mañana", "y otra vez a las…", "el 22", "el jueves 24", "la semana que
  viene, el martes", "a primera hora" y "a las 20.00".
- **Sin avisos** usa la Web Speech API del navegador si la hay (`voice/speech.ts`), siempre con
  el analizador local.
- El audio no se guarda ni se registra; el Worker descarta las alucinaciones típicas de
  Whisper con silencio ("Subtítulos realizados por…").

### Recordatorios

`Task.time` es opcional (`HH:MM`, solo cuenta con fecha). `Task.reminders` admite varios:

- `at`: instante absoluto (epoch ms).
- `before`: minutos antes de fecha + hora de la tarea. Sigue a la tarea si cambia de día;
  sin fecha u hora queda inactivo (se pinta atenuado y no se envía).

Posponer (`task/snooze`) descarta los `at` que ya sonaron y añade uno nuevo. Máximo 20 por
tarea.

### Avisos push

```
móvil: estado → upcomingSchedule() → cifra {taskId,title,body,badge,at} (AES-GCM) → PUT /v1/schedule
worker: PUT arma la alarma del DO al aviso más próximo → alarm() envía los vencidos por Web Push
        (payload = texto cifrado), borra y rearma para el siguiente
sw.ts: push → descifra con la clave local → showNotification → tocar abre /tasks/?task=<id>[&action=]
```

- **El móvil es la fuente de verdad.** `useScheduleSync` sube la agenda completa (debounce
  600 ms, huella para no repetir, reintento en `online` y al volver a primer plano). Al pasar
  a segundo plano sube al instante con `keepalive`: iOS congela la página en cuanto sales. Reemplazar
  entera hace que editar, completar, borrar o importar se resuelva solo.
- **El servidor no lee nada.** La clave AES es `CryptoKey` no exportable en IndexedDB,
  compartida con el service worker. Si no se puede descifrar, se muestra "Recordatorio":
  iOS retira el permiso a las webs que reciben push sin enseñar notificación.
- **Sin cuentas.** `POST /v1/devices` devuelve un token de 256 bits; el Worker guarda su
  SHA-256. El Worker solo hace peticiones a hosts de push conocidos (anti-SSRF).
- **Abuso**: límites nativos de Cloudflare (`[[ratelimits]]` en `wrangler.toml`) por IP
  anonimizada con `IP_HASH_SALT` en todas las rutas, por dispositivo en las escrituras y
  10/min para el dictado; altas máximas por IP y hora en D1; cuerpos cortados al
  leer el stream, sin fiarse de `content-length`.
- **Códigos del servicio push**: 404/410 borra el dispositivo; 400/413 descarta ese aviso;
  401/403 es VAPID mal configurado y **nunca** borra nada; el resto se reintenta 3 veces.
- **Por qué alarma y no cron**: los cron triggers de Cloudflare no llegaron a dispararse en
  producción. La alarma del DO `Scheduler` salta a la hora exacta y nunca se solapa consigo
  misma (sin envíos duplicados). El cron queda cada 5 min solo para rearmarla; no envía.
- `VAPID_SUBJECT` tiene que ser `mailto:` o `https://` con dominio real: Apple responde
  403 `BadJwtToken` a `localhost`.
- iOS: push solo con la app instalada en pantalla de inicio (iOS 16.4+) y el permiso se
  pide dentro de un gesto (`Notification.requestPermission` va lo primero en `enablePush`).
- **Contenido** (`lib/schedule.ts`): título = tarea; cuerpo = cuándo toca visto desde la hora
  del aviso ("En 10 min · 17:00", "Para hoy", "Pendiente desde ayer") y la sección.
- **Resumen del día** (opcional, `settings.digest`): un aviso diario a la hora elegida con las
  tareas de ese día y las que estarán atrasadas. Se programa para los próximos 7 días con ids
  `digest-AAAAMMDD` y se recalcula en cada sincronización.
- **Botones** "Hecha" y "+10 min" en la notificación (Android y escritorio; iOS no los
  muestra). El SW no toca el estado: abre la app con `?action=` y `useNotificationActions`
  lo aplica con un toast. Tocar el aviso sin botón abre la tarea con **Posponer**.
- Número en el icono: pendientes de hoy + atrasadas (`badgeCount`), actualizado por la app
  y por cada push.

## Estilo visual

Negro puro, siempre oscuro. Tipografía del sistema, jerarquía por tamaño y peso, un solo
acento (`--accent`, azul lavanda) reservado a lo interactivo y a lo completado.

- Tokens en `src/styles/tokens.css`. **No hardcodear colores, espaciados ni duraciones.**
- `--danger` significa una sola cosa: atrasado. No se usa de adorno.
- CSS por componente, junto al componente. Clases en kebab-case estilo BEM ligero.
- Animar solo `transform` y `opacity`.
- Respetar `prefers-reduced-motion` y las safe areas (`--safe-t`, `--safe-b`, `--kb`).
- Los `inputs` van a 16px para que iOS no haga zoom al enfocar.

## Convenciones

- Ficheros pequeños y por dominio (200–400 líneas; 800 es el techo).
- Comentarios solo donde el *porqué* no se deduce del código, y en español.
- Nada de `console.log` en el código final.
- Los tests cubren `src/lib` y `src/state` (umbral 80%). El pegamento de React y de
  navegador (`push/client.ts`, `push/keystore.ts`, `voice/capture.ts`, `voice/speech.ts`,
  `sw.ts`) se prueba en el dispositivo.
- En `worker/` el acceso a datos va detrás de la interfaz `Store`: los tests usan
  `memoryStore()` y un `Sender` falso; `store.ts`, `push.ts` e `index.ts` son adaptadores.

## Decisiones cerradas

- **Sin cuentas ni login.** El repo es público: nunca añadir claves privadas. Los secrets
  del Worker viven en Cloudflare (`wrangler secret put`) y en GitHub Actions.
- **Backend solo para avisos y dictado**, sin acceso a lo guardado: nada de guardar tareas en
  claro en el servidor. El audio del dictado se transcribe al momento y no se conserva.
- **Sin sincronización entre dispositivos.** El trasvase es manual: exportar/importar JSON
  desde Ajustes.
- **Sin subtareas, notas ni recurrencias** por ahora.
- Las secciones son globales y agrupan dentro del día, no son listas independientes.
- Al completar una tarea baja al final de su bloque; no se oculta.
- Una tarea sin fecha no tiene sección: al mandarla a `Sin fecha` se le quita.
- Lo atrasado y completado no se muestra: es historia, no deuda.

## Despliegue

- **App**: `.github/workflows/deploy.yml` construye y publica en cada push a `main`
  (tests → typecheck → build → Pages). Lee la variable de repo `VITE_PUSH_API`; sin ella la
  app sale igual, sin avisos. La `base` de Vite es `/tasks/`: si el repo se renombra, hay
  que cambiarla en `vite.config.ts` (afecta también a `start_url` y `scope` del manifiesto)
  y en `ALLOWED_ORIGINS` de `worker/wrangler.toml`.
- **Worker**: `.github/workflows/deploy-worker.yml` al tocar `worker/` (typecheck → tests →
  esquema D1 → `wrangler deploy`). Necesita el secret `CLOUDFLARE_API_TOKEN` (y la variable
  `CLOUDFLARE_ACCOUNT_ID` si la cuenta tiene varias); sin él solo valida.
