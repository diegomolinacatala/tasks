# Tasks

To-do diaria para móvil y sin cuentas: las tareas viven en el propio dispositivo. Un mismo
código se publica de dos formas: PWA en GitHub Pages desde este repo público y app de iPhone
con Capacitor (TestFlight / App Store). Un Worker mínimo de Cloudflare envía los avisos push de
la PWA (solo ve horas y contenido cifrado) y transcribe el dictado.

- Producción web: https://diegomolinacatala.github.io/tasks/
- App de iPhone: `io.github.diegomolinacatala.tasks`. Pasos de TestFlight y ficha de la App Store en `docs/app-store.md`.
- Idioma de la interfaz: **español**. Sin textos explicativos ni microcopy de relleno.
- Formato objetivo: **móvil en vertical**. El escritorio no es un caso a optimizar.

## Estado actual (17/09/2026)

**Hecho**

- App de iPhone completa: avisos locales, lugares, Siri, accesos rápidos, vibración, fichero de
  estado, widget, acción "Nueva tarea" de Atajos, CI hacia TestFlight, política de privacidad y
  ficha de la App Store. Tests: 380 de la app y 130 del Worker; la PWA probada en el navegador sin
  cambios de comportamiento.
- `capacitor` unida a `main` por segunda vez (fast-forward) el 17/09/2026. Cada push a cualquiera
  de las dos que toque la app sube una compilación a TestFlight.
- **El CI despliega el Worker** desde `main`: secreto `CLOUDFLARE_API_TOKEN` y variable
  `CLOUDFLARE_ACCOUNT_ID` configurados y comprobados con "Run workflow" el 17/09/2026. A mano sigue
  valiendo `npm --prefix worker run deploy` desde `main` (wrangler está autenticado en el portátil).
- Apple Developer Program activo (cuenta individual de Diego Molina Catalá, Team ID
  `APD54YM4F3`). En App Store Connect existe la app **Tasks: tareas y lugares** (Apple ID
  `6812776586`, SKU `tasks-ios`, bundle id `io.github.diegomolinacatala.tasks`). App Group e
  identificador del widget registrados en developer.apple.com.
- Secretos de GitHub configurados: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` y la variable
  `APPLE_TEAM_ID`.
- TestFlight: la 8 fue la primera desde `main`, la 9 trae el widget y la 10 la acción de Atajos.
  El usuario la tiene instalada en su iPhone.
- Probado en el iPhone (17/09/2026): la app a grandes rasgos («funciona medio decente», sin lista
  de fallos), el widget, Siri ("añade una tarea en Tasks"), los tres toques atrás y el aviso al
  salir de un lugar con la app cerrada a la fuerza. Todo funciona.

**Pendiente, en este orden**

1. Concretar qué falla en el iPhone («medio decente») y confirmar lo que queda del checklist de
   `docs/app-store.md` §2: aviso al llegar a un lugar, tocar avisos con la app cerrada y que las
   tareas sigan ahí tras forzar el cierre.
2. Capturas para la App Store: iPhone de 6,9" (1320 × 2868, 1290 × 2796 o 1260 × 2736) o 6,5"
   (1284 × 2778 o 1242 × 2688). No se sabe qué iPhone tiene el usuario; si no es de esos tamaños,
   redimensionarlas con un script.
3. Enviar a revisión siguiendo `docs/app-store.md` §6, con la última compilación desde `main`.

**Ideas aplazadas**: sincronización por iCloud (CloudKit) y refresco en segundo plano para
reprogramar avisos.

## Trabajar en este repo

- **Sin Mac.** El usuario solo tiene un portátil Windows y un iPhone. Lo nativo se compila en
  GitHub Actions y se prueba en su iPhone con TestFlight. Guíale con pasos exactos, clic a clic.
- **No hay `gh`** en esta máquina. Para seguir el CI: API pública sin autenticar (60 peticiones
  por hora: sondear cada 60 s como poco), `/actions/runs?branch=…&head_sha=…`, `/runs/<id>/jobs`
  y los errores en `/check-runs/<job>/annotations` (`scripts/xcodebuild.sh` los emite como
  anotaciones). Si se agota el límite, leer la página de Actions con WebFetch.
- **Antes de commitear**: `npm test && npm run typecheck && npm run build` encadenado con `&&`.
  Un `;` en la cadena llegó a subir un commit que no compilaba.
- **Editar con Edit/Write** o con un script en un fichero. `node -e` dentro de bash rompe los
  textos con backticks o `${…}`.
- El usuario escribe en español y quiere respuestas en español.

## Comandos

```bash
npm run dev        # servidor local en http://localhost:5173/tasks/ (sin service worker)
npm test           # tests unitarios (vitest, entorno node)
npm run coverage   # cobertura de src/lib y src/state
npm run typecheck  # tsc de la app y del service worker (tsconfig.sw.json)
npm run build      # typecheck + build de producción a dist/
npm run build:native  # typecheck + web para la app (dist-native/) + cap sync ios
npm run icons      # regenera public/icons/* y el icono y la pantalla de carga de iOS

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
| App de iPhone | Capacitor 8 con Swift Package Manager + plugin propio `TasksNative` | mismo código que la PWA; lo que la web no puede (avisos por lugar, notificaciones locales, Siri) |
| Tests | Vitest en entorno node | la lógica pura es lo que se testea |

Sin router (una sola pantalla con dos vistas), sin librería de estado, sin framework CSS,
sin fuentes externas. El bundle de la PWA debe seguir por debajo de ~120 kB gzip: lo que solo
existe en el iPhone (adaptadores de `lib/platform`, `NativePushProvider`, editor de lugares) se
carga con `import()` o `lazy`.

## Arquitectura

```
src/
├── types.ts              # Task, Reminder, Section, Place, AppState
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
│   ├── places.ts         # lugares: nombres, saneado, distancia y regiones a vigilar
│   ├── placePhrase.ts    # "al pasar por Mercadona", "cuando salga de casa" (lo usa parse.ts)
│   ├── nativeSchedule.ts # plan de notificaciones del iPhone: 64 pendientes, 20 regiones, ids
│   ├── nativeEvents.ts   # valida lo que llega de Siri, accesos rápidos, avisos y el widget
│   ├── widget.ts         # foto de las tareas para el widget y cambios hechos desde él
│   ├── platform/         # adaptadores de Capacitor (solo iPhone): avisos, fichero, vibración…
│   ├── voice/            # WAV, captura de micrófono, Web Speech API
│   ├── backup.ts         # exportar/importar y saneado (= migración de esquema)
│   ├── persistence.ts    # IndexedDB + fallback; en iPhone, además un fichero; escrituras en serie
│   ├── transition.ts     # View Transitions API con degradación
│   └── push/             # cifrado, cliente HTTP, suscripción, claves, sincronización
├── state/                # reducer, acciones, selectores, provider
└── components/           # por dominio: shell, views, task, section, compose, push, places, settings, ui, dnd
ios/App/App/              # proyecto de Xcode: TasksNativePlugin.swift, AppIntents.swift, Info.plist…
ios/App/TasksWidget/      # extensión del widget; WidgetStore.swift se compila también en la app
docs/app-store.md         # TestFlight, secretos, ficha, privacidad y pasos para publicar
public/privacidad.html    # política de privacidad (URL que pide la App Store)
scripts/xcodebuild.sh     # xcodebuild con log completo y errores como anotaciones del CI
scripts/sign-archive.sh   # firma ad hoc del archivo con los entitlements antes de exportar
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
  - Lugar: el modelo copia también el fragmento `lugar` y devuelve solo el nombre dicho
    (`placeName`, `placeOn`). El móvil lo empareja con sus lugares guardados: la lista nunca
    se envía al servidor.
  - El modelo se eligió con `npm run eval` (66 frases, ahora 71 con las de lugar) entre los del plan
    gratuito: Nemotron acertó 46/48 con ~1,2 s; Qwen 3.8 y Gemma 4 aciertan parecido pero tardan
    hasta 15–50 s en algunas frases, y Llama 3.3 se quedaba en 37–40/48. Cualquier cambio en el
    prompt se mide con el banco antes y después, y cada fallo nuevo se añade como caso.
  - Cuota: el plan gratuito de Workers AI da 10.000 neuronas al día, compartidas entre la app y
    `npm run eval`. Un dictado gasta ~140 (Whisper + prompt de ~2.000 tokens); si se agota, el
    dictado deja de funcionar hasta las 00:00 UTC. Workers AI lo indica con el error `4006`: el
    Worker responde 503 y la app avisa de a qué hora vuelve.
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

- `place`: al llegar a un lugar guardado o al salir (solo en la app de iPhone). No tiene
  instante: suena cada vez que se cruza el radio mientras la tarea siga pendiente y su día haya
  llegado (una tarea para mañana no avisa hoy).

Posponer (`task/snooze`) descarta los `at` que ya sonaron y añade uno nuevo. Máximo 20 por
tarea.

### Lugares

`AppState.places`: globales como las secciones, con nombre único (sin tildes ni artículo:
`placeKey`), ubicación (`null` hasta elegirla) y radio (100–1000 m). Borrar un lugar quita sus
avisos de las tareas.

- **Alta**: Ajustes → Lugares, o al escribir o dictar un sitio nuevo ("al pasar por Mercadona"):
  `parseTask` devuelve `newPlace`, `useAddTasks` crea el lugar y abre su editor buscando ese
  nombre en Apple Maps (ordenado por cercanía) o con la ubicación actual.
- **Frases**: `placePhrase.ts` reconoce "al llegar a / al pasar por / cuando esté en / al salir
  de". Un nombre sin guardar se queda con la primera palabra y las siguientes en mayúscula ("El
  Corte Inglés"). `parseTask(texto, ahora, null)` desactiva los lugares: así funciona la PWA, que
  no puede avisar por lugar y deja esas frases literales.
- **Regiones**: `placeAlerts` hace un aviso por lugar y sentido con todas sus tareas en el
  cuerpo; iOS vigila como mucho 20, con prioridad para lo de hoy o atrasado. Un aviso con varias
  tareas abre `PlaceTasksSheet`.

### App de iPhone

Capacitor carga `dist-native/` (build con `--mode native`: rutas relativas, sin service worker)
desde `capacitor://localhost`. `isNative` (`lib/platform`) decide el adaptador; la lógica pura es
la misma.

- **Avisos**: notificaciones locales, sin servidor. `useNativeSchedule` calcula `nativePlan` y lo
  aplica entero tras cada cambio y al volver a primer plano (huella para no repetir). iOS guarda
  como mucho **64 pendientes** entre hora y lugar: las regiones restan del hueco y se programan
  los avisos por hora más próximos. Ids numéricos estables (FNV-1a): por debajo de
  `PLACE_ID_BASE` hora, por encima lugar, para que cada lado limpie solo lo suyo.
- **Avisos por lugar**: `TasksNativePlugin.syncPlaceAlerts` crea `UNLocationNotificationTrigger`
  con `repeats: true` y permiso de ubicación **solo mientras se usa** (la región la vigila iOS).
  No re-añade los que no han cambiado: hacerlo estando dentro podría repetir el aviso. Se crean
  con id numérico y `userInfo.cap_extra` para que el plugin de notificaciones entregue el toque
  a la web como cualquier otro aviso.
- **Botones** "Hecha" y "+10 min" con `foreground: true`: el estado vive en la web y con la app
  en segundo plano iOS no garantiza que el WebView ejecute nada.
- **Almacenamiento**: fichero `tasks-state.json` en Library (entra en las copias de iCloud del
  dispositivo y iOS no lo borra al liberar espacio) más IndexedDB de respaldo. No comparte datos
  con la PWA: se pasa con Exportar/Importar.
- **Dictado**: igual que la PWA, pero el dispositivo se da de alta solo para dictar
  (`POST /v1/devices { voice: true }`, sin suscripción push); si el servidor lo olvida (401) se
  da de alta otra vez y se reintenta.
- **Siri y accesos rápidos**: `AppIntents.swift` ("Añade una tarea en Tasks", "Mi semana en
  Tasks") y `UIApplicationShortcutItems` pasan por `NativeActions`, que guarda la acción hasta que
  la web escucha (`retainUntilConsumed`). La web la valida con `parseNativeAction`.
- **Tres toques atrás**: las apps no pueden detectarlos. `ComposeTaskIntent` ("Nueva tarea", sin
  frase de Siri para no chocar con la de añadir) aparece como acción en Atajos; el usuario crea un
  atajo con ella y lo asigna en Accesibilidad → Tocar → Tocar atrás. Envía `compose`, igual que el
  acceso rápido del icono.
- **Vibración** (`haptic`) al completar, borrar y elegir sitio. Barra de estado clara y pantalla
  de carga que la web oculta al pintar.
- **Widget** (`ios/App/TasksWidget`, pequeño, mediano, grande y dos de pantalla de bloqueo): el
  bloque Hoy con lo atrasado en rojo y el número del icono. Mismos colores que `tokens.css`
  (`Palette`). Datos por el App Group, con un fichero para cada lado:
  - La app escribe `widget-snapshot.json` con `widgetSnapshot` (`NativeWidget`, debounce 400 ms y
    al instante al pasar a segundo plano) y pide recargar. La foto trae lo atrasado y 7 días por
    delante: el widget tiene una entrada por medianoche y cambia de día sin abrir la app.
  - Tocar el círculo ejecuta `ToggleTaskIntent` en la extensión: apunta el cambio en
    `widget-changes.json`, quita los avisos pendientes de esa tarea y pone el número del icono. La
    web no corre ahí, así que al volver a primer plano `widgetChanges()` devuelve lo apuntado (y lo
    vacía), la web lo aplica con `task/toggle` y, si el widget quitó avisos, lanza
    `RESCHEDULE_EVENT` para reprogramar aunque la huella del plan no haya cambiado.
  - Enlaces `io.github.diegomolinacatala.tasks://today|compose|task/<id>` (`WidgetLink`,
    `CFBundleURLTypes`) llegan a la web como acciones `today`, `compose` y `open`.
  - Sin App Group (compilación sin firmar) el widget dice "Abre Tasks" y la web ignora el error.
- **Permisos**: el de notificaciones se pide solo la primera vez que hay algún recordatorio
  (`tasks:notifications-asked` en localStorage); después manda Ajustes de iOS. El de ubicación, al
  buscar un sitio o usar la ubicación actual (`LocationRequester.swift`). Ajustes → Lugares avisa
  si está bloqueado.
- **Plugins**: app, filesystem, haptics, local-notifications, share, splash-screen y status-bar.
  **No** usar `@capacitor/geolocation`: la ubicación va por el plugin propio y su presencia
  provocó ITMS-90683. `Info.plist` lleva igualmente `NSLocationAlwaysAndWhenInUseUsageDescription`
  (Apple la exige si cualquier librería menciona esa API), aunque nunca se pide "siempre".
- **Privacidad**: `PrivacyInfo.xcprivacy` declara solo el identificador de dispositivo del
  dictado (sin vínculo ni rastreo). Tiene que coincidir con las respuestas de App Store Connect.
- **Sin Mac**: se compila en GitHub Actions (`macos-26`, gratis en repo público). No hay
  simulador ni Safari Web Inspector: lo nativo se prueba en el iPhone vía TestFlight. Los errores
  de compilación salen como anotaciones del workflow.
- **Cambios en Swift**: el compilado lo valida el CI en unos 2 minutos, pero cualquier cambio de
  comportamiento hay que pedir al usuario que lo pruebe en el iPhone.
- Swift nuevo = añadirlo a mano en `project.pbxproj` (PBXBuildFile, PBXFileReference, grupo y
  fase Sources) con ids de 24 hex únicos. Lo compartido con el widget lleva un PBXBuildFile en cada
  fase Sources.

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
  del Worker viven en Cloudflare (`wrangler secret put`) y en GitHub Actions, igual que la clave
  de App Store Connect.
- **Un solo código para PWA y app de iPhone.** La PWA sigue publicándose; lo nativo va detrás de
  `isNative` y no cambia el comportamiento de la web.
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
- **App de iPhone**: `.github/workflows/ios.yml` en `macos-26` al tocar la app (`src`, `ios`,
  `public`, dependencias…) en `main` o `capacitor`. Sin secretos solo compila; con ellos firma y
  sube a TestFlight en `main`, `capacitor`, a mano y en la ejecución programada.
  - Se archiva **sin firmar** y la firma de distribución la pone `-exportArchive` con el
    certificado que Apple gestiona en la nube. Firmar al archivar usa el modo desarrollo, que exige
    iPhones registrados en la cuenta ("Your team has no devices").
  - La exportación copia los entitlements de la firma que ya tiene cada binario: por eso
    `scripts/sign-archive.sh` firma el archivo ad hoc con `App.entitlements` y
    `TasksWidget.entitlements` antes de exportar. Sin eso, el App Group no llega a TestFlight. El
    paso "Comprobar la firma subida" lee `DistributionSummary.plist`, pero al exportar con
    `destination: upload` no aparece y solo avisa: la prueba real es que el widget vea las tareas.
  - El App Group y el identificador `io.github.diegomolinacatala.tasks.widget` tienen que existir en
    developer.apple.com con el grupo asignado a los dos identificadores (`docs/app-store.md` §1.7).
  - "Run workflow" solo aparece cuando el workflow está en `main`.
  - Se relanza el día 1 de cada dos meses (solo desde `main`) porque TestFlight caduca a los 90 días.
  - Número de compilación = `github.run_number`; versión = `MARKETING_VERSION` del proyecto (1.0).
    Para publicar una versión nueva en la App Store hay que subir `MARKETING_VERSION` en
    `project.pbxproj`.
  - Tras subir, Apple procesa 5–30 min y avisa por correo de problemas del binario (`ITMS-…`).
- **Worker**: `.github/workflows/deploy-worker.yml` al tocar `worker/` (typecheck → tests →
  esquema D1 → `wrangler deploy`). Usa el secret `CLOUDFLARE_API_TOKEN` (plantilla *Edit Cloudflare
  Workers* más *Account → D1 → Edit*) y la variable `CLOUDFLARE_ACCOUNT_ID`; sin el token solo
  valida. Para relanzarlo sin cambios: Actions → Deploy worker → Run workflow.
