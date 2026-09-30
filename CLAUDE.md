# Tasks

To-do diaria para móvil y sin cuentas: las tareas viven en el propio dispositivo. Un mismo
código se publica de dos formas: PWA en GitHub Pages desde este repo público y app de iPhone
con Capacitor (TestFlight / App Store). Un Worker mínimo de Cloudflare envía los avisos push de
la PWA (solo ve horas y contenido cifrado) y transcribe el dictado.

- Producción web: https://diegomolinacatala.github.io/tasks/
- App de iPhone: `io.github.diegomolinacatala.tasks`, en la App Store desde el 27/09/2026:
  https://apps.apple.com/es/app/tasks-tareas-y-lugares/id6812776586. Pasos de TestFlight, ficha de
  la App Store y cómo publicar una actualización en `docs/app-store.md`.
- Idioma de la interfaz: **español**. Sin textos explicativos ni microcopy de relleno.
- Formato objetivo: **móvil en vertical**. El escritorio no es un caso a optimizar.

## Estado actual (28/09/2026)

**Hecho**

- App de iPhone completa: avisos locales, lugares, Siri, accesos rápidos, vibración, fichero de
  estado, widget, acción "Nueva tarea" de Atajos, CI hacia TestFlight, política de privacidad y
  ficha de la App Store. Tests: 516 de la app y 146 del Worker; la PWA probada en el navegador sin
  cambios de comportamiento.
- `capacitor` unida a `main` por tercera vez (fast-forward) el 21/09/2026: la web pública y el
  Worker llevan ya todo lo de abajo. Cada push a cualquiera de las dos que toque la app sube una
  compilación a TestFlight.
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
- **Apuntar sin abrir la app** (18/09/2026, TestFlight 12, sin probar aún en el iPhone): Siri y la
  acción "Añadir tarea" de Atajos ya no abren la app (ver "Apuntar sin abrir la app"). Endpoint
  `POST /v1/interpret` en el Worker, desplegado el 21/09/2026.
- TestFlight 13 (18/09/2026): los avisos por hora del iPhone suenan (antes llegaban en silencio).
- **Pasar a hoy e importancia** (20/09/2026, TestFlight 14, sin probar aún en el iPhone): ver
  "Pasar a hoy" e "Importancia". Probado en el navegador (PWA): mover, deshacer, la vista semana,
  el modo "Aa" con arrastre y la escala del panel.
- **Duración y aviso de cierre** (20/09/2026, TestFlight 15, sin probar aún en el iPhone): ver
  "Duración y aviso de cierre". Probado en el navegador (PWA): la píldora del compositor con el
  tramo, el panel de Duración con atajos y "Hasta…", el tramo en la fila, tocar el aviso (`?ask=1`)
  y tachar desde su toast, y "Todavía no" (`?action=again`) alargando la tarea.
- **Banco del dictado con la IA real** tras el prompt de duraciones, en dos mitades para no agotar
  la cuota del día (21 y 22/09/2026): **73/75**, duración 75/75 (las 4 de duración bien y ninguna
  inventada en las demás). Fallos:
  - `presupuesto` ("en una hora" sin "avísame") falla igual con el prompt anterior: las reglas de
    AVISOS piden que el aviso se pida expresamente y las de HORA dicen que "en X" es un aviso con
    `inMinutes`. Arreglarlo toca AVISOS y pide el banco entero.
  - `abuelos` ("al mediodía", "el sábado por la noche") salió 12:00 y 20:00 una vez; repetido con
    el mismo prompt pasa dos de dos, y con el anterior, una de una. Es variación del modelo, no una
    regla que falle: si vuelve a salir, mirar las franjas del prompt.
  Local: 72/75, los 3 fallos de siempre.
- TestFlight 16 (21/09/2026): la primera desde `main` con todo lo anterior. La 17 (`capacitor`) y la
  18 (`main`), el mismo commit, traen además el tramo con franja ("de 9 a 11 de la noche"). La 18
  es la que hay que instalar para probar y la que se envía a revisión.
- **Capturas de la App Store** (21/09/2026) en `docs/capturas/`: siete a 1320 × 2868, en orden de
  subida, generadas con la app real y `scripts/app-store-shots.mjs`.
- **Enviada a revisión** (21/09/2026, 23:29): la 1.0 con la compilación 18 y publicación manual.
  Ficha, privacidad, precio (gratis, 175 países) y capturas de 6,9" puestas en App Store Connect.
- **Rechazada** (22/09/2026) con *2.1 Information Needed*, lo habitual en una cuenta nueva: Apple
  pide un vídeo en un iPhone y seis respuestas (propósito, cómo probar, servicios externos e IA,
  regiones…). Antes de responder se añadió el **permiso del dictado** (ver "Dictado"), por la norma
  5.1.2(i) sobre compartir datos con una IA de terceros. Respuesta, notas en inglés y guion del vídeo
  en `docs/app-store.md` §5 y §7.
- **Rechazada otra vez** (23/09/2026, compilación 20) por dos cosas concretas, ya corregidas el
  24/09/2026: **5.1.1(iv)**, el panel del dictado pedía permiso por su cuenta (*Permitir* / *Ahora
  no*) antes del del micrófono: ahora solo tiene **Continuar** y lleva siempre al de iOS; y **1.5**,
  GitHub Issues no vale como URL de soporte: ahora es `public/soporte.html`, con el correo
  `diegomolinacatala+tasks@gmail.com`. Pasos y respuesta en `docs/app-store.md` §8.
- **Reenviada** (25/09/2026, 13:30) con la compilación 24 (`main`), la URL de soporte nueva, las
  notas del §5 y la respuesta del §8.2: *Esperando revisión*.
- **Aprobada y publicada** (27/09/2026, 17:29): la 1.0 (compilación 24) está en la App Store, gratis,
  también en la UE (el estado de comerciante está bien: sale en España, Francia y Alemania).
  `MARKETING_VERSION` subido a 1.1 el 28/09/2026, porque la 1.0 ya no admite compilaciones nuevas.
- **La 1.1 ya figura como aprobada** en App Store Connect (el CI del 30/09/2026 lo dijo al subir:
  *train version '1.1' is closed*): `MARKETING_VERSION` subido a **1.2**. Comprobar en App Store
  Connect qué hay publicado.
- **Rediseño "old money"** (28/09/2026, commit `a49c254`): papel marfil, tinta azul marino, coñac y
  oro viejo; fechas y titulares en New York (serif del sistema); icono nuevo; arranque en frío sin
  saltos (ver "Arranque"); filas que se deslizan al reordenarse. Además, **arreglado** que al elegir
  una hora a mano se guardara otra (`PickerChip`: la rueda de iOS lanza `input` en cada giro).
- **Estructura nueva** (29/09/2026, sin commitear ni probar aún en el iPhone; Swift sin compilar):
  cuatro pestañas (**Bandeja**, **Agenda**, **Lugares**, **Ajustes**, ver "Pantallas"); la Agenda al
  estilo de Structured (día arriba, tira de la semana deslizable, horario con cápsulas por duración,
  tiempo libre y la marca de ahora); **rutinas** (lo que se repite, con racha y widget de la pantalla
  de bloqueo que las tacha de un toque, ver "Rutinas"); **modo oscuro** (Ajustes → Apariencia: claro,
  oscuro o automático, ver "Estilo visual"); Lugares con mapa de Apple Maps y deslizador de radio;
  Ajustes como página; deslizar filas sin pasar por React (se "rallaba" en móviles modestos, ver
  "Gestos de fila") y filas memorizadas. **Arreglado** también que el widget de la pantalla de inicio
  forzaba la paleta de noche (texto marfil sobre marfil en modo claro), y que al hacer scroll el
  contenido pasara por detrás del reloj (ahora un velo de papel bajo la barra de estado). Probado en
  el navegador (PWA y `npm run dev`), en claro y en oscuro. **Capturas nuevas** en `docs/capturas/`:
  ocho (agenda, rutinas con el widget de bloqueo, lugares, "¿has acabado?", escribir, importancia,
  modo oscuro y widgets), con el reloj de la página fijado a las 11:20.

**Pendiente, en este orden**

1. Subir a TestFlight (push a `main`) y **comprobar que el CI compila el Swift nuevo** (widget de
   rutinas, `ToggleRoutineIntent`, `setAppearance`, `mapSnapshot`, `NotificationResponder`). Probar en
   el iPhone: las cuatro pestañas; deslizar filas y la tira de la semana; el modo oscuro (también la
   pantalla de carga, la rueda de la hora y el teclado); una rutina con hora ("tomar creatina todos
   los días a las 10") y su aviso con **Hecha** sin abrir la app; el widget **Rutinas** en la
   pantalla de bloqueo (tocarlo la tacha; al día siguiente amanece sin tachar); el mapa de Lugares;
   el widget de hoy en claro y en oscuro. Después, subir las ocho capturas de `docs/capturas/` y
   enviar la 1.2 (`docs/app-store.md` §3 y §9; la ficha puede mencionar rutinas, modo oscuro y el
   widget de la pantalla de bloqueo). iOS guarda en caché la pantalla de carga: si sale la antigua,
   reiniciar el iPhone.
2. Probar en el iPhone lo de `docs/app-store.md` §2 "Apuntar sin abrir la app" (el usuario crea el
   atajo *Dictar tarea* con los pasos de §2.1), "Pasar a hoy", "Importancia" y el aviso de cierre.
   Lo más delicado: el botón **A hoy** del widget corre en el proceso de la app
   (`LiveActivityIntent`); si no hiciera nada, ver "Pasar a hoy". Del aviso de cierre, mirar si
   **Sí, hecha** y **Todavía no** salen al mantener pulsada la notificación (la categoría
   `task-ask` se registra al abrir la app: hay que abrirla una vez tras instalar) y, desde la
   compilación con `NotificationResponder`, que respondan **sin abrir la app**, también con el
   iPhone bloqueado. Si no hicieran nada, sospechar del delegado (que Capacitor lo recoloque).
3. Concretar qué falla en el iPhone («medio decente») y confirmar lo que queda del checklist de
   `docs/app-store.md` §2: aviso al llegar a un lugar, tocar avisos con la app cerrada y que las
   tareas sigan ahí tras forzar el cierre.

Cualquier cambio de la app llega a la App Store con una versión nueva: `docs/app-store.md` §9. En
cuanto Apple apruebe una, subir `MARKETING_VERSION` (1.2 → 1.3…) antes del siguiente push que toque
la app: App Store Connect rechaza compilaciones de una versión aprobada (también fallaría la
ejecución programada).

**Ideas aplazadas**: sincronización por iCloud (CloudKit), refresco en segundo plano para
reprogramar avisos, rutinas desde Siri y el dictado con IA (hoy solo el analizador local reconoce
"todos los días") y un mapa interactivo en Lugares (hoy es una foto de Apple Maps).

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
npm run build:native  # typecheck + web para la app (dist-native/) + headless.js + cap sync ios
npm run build:headless  # solo dist-native/headless.js, comprobado sin navegador (scripts/check-headless.mjs)
npm run icons      # regenera public/icons/*, los iconos de iOS (claro y oscuro) y la señal de carga (Edge sin ventana)
node scripts/app-store-shots.mjs  # capturas de la App Store en docs/capturas/ (compila con --mode shots en dist-shots/)

node scripts/vapid-keys.mjs     # par de claves VAPID nuevo (la privada solo a wrangler secret)

cd worker
npm test                        # tests del Worker
npm run dev                     # wrangler dev en :8787 con D1 local (las alarmas también funcionan)
npm run db:init:local           # crea las tablas en la D1 local
npm run db:init:query           # crea las tablas en remoto si --file falla por red ("fetch failed")
npx wrangler tail               # registros en vivo: PUT /v1/schedule, "avisos {...}", "push no enviado"
npm run eval -- --local         # banco de frases dictadas contra el analizador local (gratis)
npm run eval -- cena vuelo      # esos casos contra Workers AI real (EVAL_MODEL=@cf/... para otro modelo)
npm run eval -- --all           # todos: ~10.500 neuronas, más que la cuota gratuita de un día: mejor en dos mitades, una tras las 00:00 UTC (ver Dictado)
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
| Siri sin abrir la app | JavaScriptCore con `headless.js` | la misma lógica TypeScript fuera del WebView, sin reescribirla en Swift |
| Tests | Vitest en entorno node | la lógica pura es lo que se testea |

Sin router (cuatro pestañas en una sola pantalla), sin librería de estado, sin framework CSS,
sin fuentes externas (la serif es la del sistema). El JS principal de la PWA debe seguir en ~125 kB
gzip (126 el 29/09/2026, con la Agenda, las rutinas y el tema; 118 antes): lo que solo existe en el
iPhone (adaptadores de `lib/platform`, `NativePushProvider`, `inboxFile.ts`) y lo que se abre poco
(Lugares, Ajustes, el panel de la rutina, el mando del modo "Aa") se carga con `import()` o `lazy`.
La Bandeja y los paneles de tarea y sección van en su propio trozo, pedido nada más pintar la Agenda
(`loadSheets` en `App.tsx`): no esperan al toque.

## Arquitectura

```
src/
├── types.ts              # Task, Reminder, Section, Place, Routine, Theme, TabId, AppState
├── sw.ts                 # precache + push + notificationclick
├── headless.ts           # entrada de headless.js (JavaScriptCore): Siri sin abrir la app
├── lib/                  # lógica pura + adaptadores de navegador
│   ├── date.ts           # ISO local YYYY-MM-DD / HH:MM, semana que empieza en lunes
│   ├── order.ts          # scopes, reordenación, pasar a otro día (`rescheduled`) y deshacerlo
│   ├── importance.ts     # escala 1–10: tamaño del título, arrastre del mando
│   ├── duration.ts       # cuánto dura, cuándo acaba y cuánto se alarga al decir "todavía no"
│   ├── routines.ts       # rutinas: qué días tocan, diario de hechos, racha, constancia, puntos
│   ├── repeat.ts         # "todos los días a las 10", "los lunes y jueves" → rutina
│   ├── timeline.ts       # horario de un día: lo que tiene hora, tiempo libre y "ahora"
│   ├── theme.ts          # apariencia: claro, oscuro o del sistema; cambio con un círculo de tinta
│   ├── mapFrame.ts       # dónde van las chinchetas en el plano dibujado (sin Apple Maps)
│   ├── reminders.ts      # resolver avisos, agenda futura, atajos, posponer
│   ├── parse.ts          # lenguaje natural del compositor ("mañana a las 5")
│   ├── when.ts           # piezas de parse.ts: horas, plazos y días
│   ├── title.ts          # título limpio: muletillas, "tengo que acudir a una cena" → "Cena"
│   ├── interpret.ts      # valida en el móvil las tareas que devuelve la IA del Worker
│   ├── normalize.ts      # minúsculas, sin tildes, números en palabras → dígitos
│   ├── schedule.ts       # agenda de avisos: contenido, resumen diario, aviso de cierre, rutinas, badge
│   ├── places.ts         # lugares: nombres, saneado, distancia y regiones a vigilar
│   ├── placePhrase.ts    # "al pasar por Mercadona", "cuando salga de casa" (lo usa parse.ts)
│   ├── nativeSchedule.ts # plan de notificaciones del iPhone: 64 pendientes, 20 regiones, ids
│   ├── nativeEvents.ts   # valida lo que llega de Siri, accesos rápidos, avisos y el widget
│   ├── widget.ts         # foto de tareas y rutinas para los widgets y cambios hechos desde ellos
│   ├── inbox.ts          # bandeja de lo hecho fuera de la web (altas, pasar a hoy) y cómo aplicarlo
│   ├── inboxFile.ts      # el fichero de la bandeja (solo iPhone): validarlo y cuándo vaciarlo
│   ├── headless.ts       # apuntar o pasar a hoy sin abrir la app: bandeja, avisos, icono y widget
│   ├── platform/         # adaptadores de Capacitor (solo iPhone): avisos, fichero, vibración…
│   ├── voice/            # WAV, captura de micrófono, Web Speech API
│   ├── backup.ts         # exportar/importar y saneado (= migración de esquema)
│   ├── persistence.ts    # IndexedDB + fallback; en iPhone, además un fichero; escrituras en serie
│   ├── transition.ts     # View Transitions API con degradación
│   ├── boot.ts           # funde el arranque (#boot de index.html) y hace entrar la app
│   ├── flip.ts           # filas que se deslizan a su sitio al completar, añadir, borrar o pasar a hoy
│   └── push/             # cifrado, cliente HTTP, suscripción, claves, sincronización
├── state/                # reducer, acciones, selectores, provider
└── components/           # por dominio:
    ├── shell/            # TabBar (pestañas), teclado, acciones nativas, bandeja de Siri
    ├── views/            # AgendaView (+ WeekStrip, Timeline, useDayBoard), InboxView (+ DayDock)
    ├── routines/         # RoutinesBlock, RoutineRow (puntos de la semana), RoutineSheet (constancia)
    ├── task/             # SwipeRow + useSwipe (gesto), TaskShell, TaskRow, TaskSheet, rowActions
    ├── places/           # PlacesView (mapa + tarjetas), MapSnapshot, PlaceSheet (radio con deslizador)
    ├── settings/         # SettingsView (página), AppearancePicker, avisos, dictado
    └── ui/ …             # Sheet, Slider, Toast, PickerChip, iconos; importance, section, compose, push, dnd
ios/App/App/              # proyecto de Xcode: TasksNativePlugin.swift, AppIntents.swift, Info.plist…
                          # QuickAdd, HeadlessCore, InboxStore, DictationServer, NotificationPlan: Siri sin abrir la app
ios/App/TasksWidget/      # widgets Hoy y Rutinas; WidgetStore y MoveOverdueWidgetIntent se compilan también en la app
docs/app-store.md         # TestFlight, secretos, ficha, privacidad y pasos para publicar
docs/capturas/            # capturas de la App Store (1320 × 2868), en orden de subida
public/privacidad.html    # política de privacidad (URL que pide la App Store)
public/soporte.html       # página de soporte con correo de contacto (URL de soporte de la App Store)
scripts/xcodebuild.sh     # xcodebuild con log completo y errores como anotaciones del CI
scripts/sign-archive.sh   # firma ad hoc del archivo con los entitlements antes de exportar
scripts/brand.mjs         # la marca (señal a pluma) en SVG: icono, favicon, pantalla de carga y #boot
scripts/edge.mjs          # Edge sin ventana por CDP y PNG sin dependencias (iconos y capturas)
scripts/app-store-shots.mjs # capturas de la App Store; plantillas en store-frames.mjs y store-widgets.mjs
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

Cuatro pestañas (`TabId`) en la barra inferior, con un filete de oro que se desliza bajo la elegida
(`TabBar`). Cada una se monta la primera vez que se abre y después se conserva con `<Activity>` de
React (su estado y su scroll, que `App` guarda al salir). Tocar la pestaña en la que ya estás vuelve
arriba y, en la Agenda, a hoy. Se abre en la **Agenda**.

- **Bandeja** (`InboxView`): lo que no tiene día. Arriba, **Rutinas** (ver "Rutinas"); debajo,
  **Tareas** sin fecha, ordenables con el asa. Al arrastrar una sube un **muelle** con los próximos
  siete días (`DayDock`): soltarla en uno la planifica. Con más de una hecha, "Borrar las N hechas".
- **Agenda** (`AgendaView`), como Structured: el mes arriba, el día elegido en grande ("Hoy martes
  29", "Mañana miércoles 30", "Jueves 1 octubre") y la **tira de la semana** (`WeekStrip`): letra,
  número y un anillo que se cierra con lo hecho; lo pasado con pendientes, en ladrillo. Se desliza
  a los lados para cambiar de semana (conserva el día de la semana) y cada día es un sitio donde
  soltar una tarea arrastrada. Debajo, el filete con el avance del día y:
  1. `Atrasadas` (solo hoy), en rojo, con **Pasar a hoy**. Se puede sacar de aquí pero no soltar
     dentro: sus tareas conservan la fecha hasta que se mueven.
  2. `Horario` (`Timeline`, `lib/timeline.ts`): lo que tiene hora (tareas y rutinas) a lo largo de
     una línea. Cada tarea es una cápsula tan alta como lo que dura, que se rellena al completarla y,
     si está en curso, se va llenando; entre medias, "1 h 30 libres" (desde ahora, si el hueco ya
     empezó); hoy, una marca de coñac con la hora actual. No se reordena a mano (manda la hora).
  3. `Sin hora`: lista raíz más las secciones del usuario, con arrastre. Un día pasado con
     pendientes lleva **Pasar a hoy**. Un día sin tareas dice "Día libre." (las rutinas no cuentan).
  El compositor añade al día elegido ("Añadir al jueves 2"); su atajo, **Sin fecha**, a la Bandeja.
- **Lugares** (`PlacesView`, ver "Lugares").
- **Ajustes** (`SettingsView`): página con grupos a lo iOS: Apariencia, Avisos, Dictado, Datos y
  Tasks (valorar, soporte, privacidad, versión).

`Atrasadas`, `Rutinas` y las secciones se pliegan y ese estado se guarda (`AppState.collapsed`,
`Section.collapsed`). Si algo añadido cae fuera de lo que se ve (una tarea para mañana escrita en
hoy), un aviso dice adónde ha ido y ofrece **Ver**.

Arriba a la derecha, en la Bandeja y la Agenda, el modo importancia: una **A con una flecha doble**
(se desliza para agrandar), que al activarse sube y baja una vez.

### Arranque

Los primeros segundos no deben saltar: cada relevo es invisible y la entrada, suave.

1. **Pantalla de carga nativa** (`LaunchScreen.storyboard`): papel marfil y la señal
   (`LaunchMark`, 92 pt, @1x/@2x/@3x) en el centro exacto de la pantalla, con restricciones de
   Auto Layout. Antes era una imagen de 2732 px escalada con *aspect fill*: de ahí el logo "bugueado".
   El plugin SplashScreen la mantiene encima del WebView (`launchAutoHide: false`).
2. **`#boot` en `index.html`**: la misma pantalla, pintada antes que el JS (CSS en línea, la señal
   inyectada desde `brand.mjs` por el plugin `tasks-boot-mark` de `vite.config.ts`). Un script en
   línea quita la carga nativa en cuanto `#boot` está pintado (`Capacitor.nativePromise`), sin
   esperar al paquete: como son iguales al píxel, no se nota. `showApp` la quita igualmente por si
   acaso.
3. Si la app tarda más de 450 ms, la señal cede el sitio a un **esqueleto** de la pantalla (cabecera,
   filas y barra que laten).
4. Con el estado pintado, `finishBoot` (`lib/boot.ts`) funde `#boot` y la app entra escalonada
   (`.is-entering` en `shell.css`: cabecera, bloques y barra suben unos píxeles). Se puede tocar
   desde el primer momento.

En un iPhone normal la señal da paso a la app en unos 200 ms y el esqueleto no llega a verse. Una
pestaña que se abre antes de cargarse su trozo enseña su propio esqueleto (`Skeleton`).

**Con el modo oscuro**: la apariencia se copia en `localStorage` (`tasks:theme`) y un script en
`<head>` pone `data-theme` antes de pintar, así que `#boot` (con variables `--boot-*`) ya sale en su
tema. La pantalla de carga nativa usa el color `LaunchBackground` y la señal `LaunchMark` con
variante oscura (Assets.xcassets), y `SceneDelegate` fija la apariencia guardada
(`TasksNative.setAppearance`, en `UserDefaults`) antes de crear la vista: con "Oscuro" o "Claro"
distinto del iPhone, la pantalla del sistema sale un instante en el tema del iPhone.

### Pasar a hoy

Lo que queda sin hacer de días anteriores pasa a hoy de un toque (como el *Reschedule* de Todoist
o el *Postpone* de TickTick). Cada tarea va **arriba de su sección** de hoy, en el orden en que
estaba en `Atrasadas` (lo más antiguo primero): la lista apenas se mueve bajo el dedo, solo deja de
estar en rojo. Conserva la hora; lo hecho no se mueve (es historia).

- `tasks/reschedule { ids, date }` (`rescheduled` en `order.ts`) ignora lo hecho y lo que ya es de
  ese día, así que repetirlo no cambia nada. "Deshacer" (toast) es `tasks/place` con los sitios de
  antes (`placementsOf`): cada tarea vuelve a su día, su sección y su puesto.
- Dónde está: la cabecera de `Atrasadas`; la de `Sin hora` de un día pasado con pendientes en la
  Agenda (solo los de ese día); los avisos (el resumen diario con algo atrasado trae *Pasar atrasadas a hoy*, y el aviso
  de una tarea cuyo día ya pasó, *Pasar a hoy* entre *Hecha* y *+10 min*: `ScheduleEntry.overdue`,
  categorías `task-overdue` y `digest-overdue`); Siri y Atajos (*«Pasa lo atrasado a hoy en
  Tasks»*, `MoveOverdueIntent`, sin abrir la app; sirve para una automatización cada mañana,
  `docs/app-store.md` §2.2); y el botón **A hoy** del widget.
- Fuera de la web es una entrada de la bandeja con `move: { date, taskIds }` que calcula
  `moveOverdue` (`headless.js`) con lo atrasado del fichero de estado, la bandeja y lo marcado en el
  widget. Queda resuelta cuando lo guardado ya las tiene en ese día (`entryInState`).
- El botón del widget (`WidgetMoveOverdueIntent`) es un `LiveActivityIntent`: así iOS lo ejecuta en
  el proceso de la app (arrancándola en segundo plano) y no en el del widget, que no tiene el
  fichero de estado ni `headless.js`. Se compila en los dos objetivos; en el widget, `OverdueMover`
  es un hueco que no llega a correr. Si en el iPhone no hiciera nada, la alternativa es la de
  `ToggleTaskIntent`: apuntarlo en `widget-changes.json` y que la web lo aplique al volver (los
  avisos de esas tareas se programarían al abrir la app).

### Importancia

`Task.importance`, del 1 (normal) al 10, se ve como **tamaño del título**: sin etiquetas, colores
ni "urgente". Más importante = más grande, con más peso y más apretado, hasta el doble
(`--fs-task-max`); la progresión es geométrica (`importanceScale`) para que cada punto se note
igual. No reordena nada.

- **Modo "Aa"** (arriba): cada fila cambia el asa de mover por su mando, un número del 1 al 10.
  Arrastrarlo hacia arriba o a la derecha agranda y hacia abajo o a la izquierda encoge (18 px por
  punto, vibra en cada uno, el título cambia en vivo); tocarlo sube uno y pasado el 10 vuelve al 1.
  En el modo no se reordena (no hay asa). El estado del modo no se guarda.
- **Panel de la tarea**: la escala del 1 al 10 bajo el título, cada número del tamaño que dará.
- Lo **hecho** vuelve al tamaño normal (se conserva el valor por si se desmarca) y no lleva mando.
- Donde no hay sitio para tamaños, la importancia elige: el widget de la pantalla de bloqueo enseña
  las dos pendientes más importantes y el resumen diario adelanta las más importantes en su vista
  previa. En el resto del widget los títulos crecen poco (las filas son de alto fijo).
- Lo que llega sin importancia (copias antiguas, Siri, la bandeja) es normal (`normalizeImportance`).

### Rutinas

Lo que se repite ("tomar creatina", cada día a las 10:00) no es una tarea: es una `Routine`
(`AppState.routines`, `lib/routines.ts`) con los días de la semana en que toca (1 = lunes … 7 =
domingo), una hora opcional y un **diario** de días hechos (`done`, los 400 más recientes). No hay
nada que reiniciar a medianoche: "hecha hoy" es que el diario tenga hoy, así que cada día amanece
pendiente él solo (en la app, en los avisos y en el widget).

- **Dónde**: bloque `Rutinas` de la Bandeja (las que tocan hoy arriba, lo hecho después y las que hoy
  no tocan, atenuadas), con "2/3" de hoy y **+**. Las que tienen hora salen también en el horario
  de la Agenda de cada día que tocan (cápsula de trazo discontinuo con el icono de repetir).
- **Fila** (`RoutineRow`): el círculo o deslizar a la derecha la tacha hoy; a la izquierda, borra (con
  deshacer). A la derecha, **los últimos siete días**: punto lleno, hecha; hueco, no; raya, no tocaba
  (antes de crearla tampoco). Debajo del título, la hora, los días y "racha de N" (desde 2).
- **Panel** (`RoutineSheet`): nombre, días (L M X J V S D y atajos: cada día, entre semana, fines de
  semana), aviso a una hora, y **Constancia**: racha, mejor racha, % de los últimos 30 días y las
  últimas cinco semanas día a día. Una nueva se crea al cerrar si tiene nombre ("Añadir rutina").
- **Escribiendo**: `parseRoutine` (`lib/repeat.ts`) reconoce "todos los días", "cada día", "a
  diario", "entre semana", "de lunes a viernes", "los fines de semana", "los lunes y jueves", "cada
  martes", "todas las mañanas" (09:00)… La hora sale del analizador de siempre ("a las 7" es 19:00,
  como en las tareas). La píldora dice "Cada día · 10:00" con el icono de repetir; tocarla la deja
  como tarea. También al dictar (antes de la IA). "El lunes" es un día; "los lunes", todos.
- **Desde una tarea**: panel → **Convertir en rutina** (cada día, con su hora; deshacer).
- **Avisos**: `routineEntries` (`schedule.ts`) programa uno a su hora cada día que toca en los
  próximos 7, mientras no esté hecha (id `routine-<id>-AAAAMMDD`). No cuentan para el número del
  icono. En el iPhone, si no cabe todo en los 64 avisos, las rutinas se llevan como mucho un tercio
  del hueco (`fitSchedule`, `ROUTINE_SHARE`): lo que falte se programa al volver a abrir la app. En el iPhone llevan **Hecha** (categoría `routine`), que la tacha **sin abrir la app**:
  `NotificationResponder` lo apunta en el App Group como el widget y la web lo aplica al volver
  (o al momento si está delante: acción `widget`). Tocar el aviso sin botón abre la Bandeja y pregunta
  "¿Hecha?". En la PWA no llevan botones.
- **Widget Rutinas** (pantalla de bloqueo redonda y rectangular, y pequeño de inicio): ver "App de
  iPhone".

### Duración y aviso de cierre

Tachar una tarea obliga a abrir la app, y esa es la fricción que sobra. Con `Task.duration`
(minutos, `lib/duration.ts`), al acabar llega un aviso que lo pregunta: **«Reunión con Jorge /
¿Has acabado? · 17:30–18:30»**, con **Sí, hecha** y **Todavía no**. Así se tacha desde la propia
notificación, sin entrar.

- **El aviso no se guarda**: sale de la duración (`checkInEntries` en `schedule.ts`, id `ask-<id>`),
  así que quitar la duración lo quita y cambiar la hora o la duración lo mueve. No cuenta para el
  tope de 20 recordatorios ni aparece en la lista de avisos de la tarea.
- **Solo con fecha y hora**, como la hora solo cuenta con fecha. De 5 min a 12 h (`MAX_DURATION`):
  más de medio día deja de ser un rato acotado y preguntar no dice nada. Con hora y duración
  siguen siendo dos avisos: el de "a la hora" al empezar y la pregunta al acabar (como Structured).
- **«Todavía no» alarga la tarea** (`task/extend`, `extendedDuration`): el final pasa a 15 min
  desde *ahora*, no desde el final previsto, así que responder tarde no deja la siguiente pregunta
  en el pasado. Como efecto, el tramo guardado acaba reflejando lo que de verdad duró.
- **Tocar el aviso sin botón** abre la app y repite la pregunta en un toast con **Sí**: en iOS los
  botones de una notificación piden mantener pulsado, y así la salida sigue siendo un toque. La
  marca viaja en `extra.ask` (nativo) y en `?ask=1` (web).
- Se escribe hablando o tecleando: "durante una hora", "que dura media hora", "una reunión de dos
  horas", "de 17:30 a 18:30", "de las 5 a las 7", "hasta las 19:00". Un tramo fija hora y duración
  a la vez, y la franja del final vale para el inicio si el tramo sigue hacia delante ("de 9 a 11
  de la noche" es 21:00–23:00; "de 10 a 2 de la tarde", 10:00–14:00). Lo que no se dice no dura:
  nunca se supone.
- En el panel, **Duración** va debajo de Hora: atajos (15 min, 30 min, 1 h, 2 h), `Hasta…` para la
  hora exacta de acabar, y una línea que dice a qué hora será la pregunta. La fila enseña el tramo
  (`17:30–18:30`) en lugar de la hora suelta.
- Categoría de botones `task-ask` en el iPhone; en la PWA, acciones `done` y `again` del push.
- **En el iPhone los botones no abren la app** ni piden desbloquear (sin `foreground`): iOS la arranca
  en segundo plano, sin WebView, y `NotificationResponder.swift` (delegado de notificaciones, puesto
  en `AppDelegate` y recolocado delante del de Capacitor al cargar) lo resuelve con `QuickAdd.answer`
  → `answerAsk` de `headless.js` → entrada `ask` en la bandeja (`{ taskId, reply: 'done' }` o
  `{ reply: 'again', duration }` con la duración ya alargada, para que releerla no sume otro rato),
  más avisos, icono y widget al día; "Todavía no" deja así programada la siguiente pregunta. El resto
  de toques pasa al `NotificationRouter` de Capacitor (los que llegan antes de que exista, se
  guardan). Sin `headless.js`, "Sí, hecha" se apunta igual y quita sus avisos, y "Todavía no" repite
  el mismo aviso a los 15 min.

### Drag & drop

- **El arrastre solo se activa desde el asa** (`task__grip`, `section__grip`), con
  `touch-action: none` y un umbral de 4 px. El resto de la fila queda libre para el scroll
  vertical y el deslizamiento horizontal, así que los tres gestos no compiten.
- **Agenda** (`useDayBoard`): mantiene una copia (`preview`) del tablero del día elegido durante el
  gesto y confirma todo con una sola acción `board/commit` al soltar. La copia vive además en un
  ref: al soltar hay que leer el estado real del gesto, no el del último render. Cada columna del
  commit lleva su propio destino: `root` y las secciones van al día elegido, y `overdue` (solo hoy)
  se excluye del commit. Solo entra lo que no tiene hora: lo que la tiene va al horario y no se
  arrastra. Los días de la tira son `useDroppable` (`type: 'day'`): soltar ahí lleva la tarea a ese
  día con su sección y su hora, con deshacer.
- **Bandeja**: una sola lista (`scope/reorder` en `backlog`); los días del muelle (`DayDock`) son
  droppables como los de la tira. Como el muelle sube al empezar el arrastre, su `DndContext` mide
  los droppables siempre (`MeasuringStrategy.Always`).
- `scopedCollision` (`dnd.ts`): un día solo cuenta si el dedo está encima (`pointerWithin`); si no,
  `closestCorners` entre lo demás. Así reordenar cerca de la tira no se lleva la tarea a otro día.
- Ids con prefijo para no colisionar: `col:<clave>` (columna), `sec:<id>` (sección), `day:<fecha>`
  (día), el id pelado de la tarea para las tareas. Ver `src/components/dnd/ids.ts`.

### Gestos de fila (`SwipeRow` + `useSwipe`)

Deslizar a la derecha completa, a la izquierda borra (con deshacer en un toast), como en Mail. El
gesto se bloquea en un eje según el primer movimiento. **No pasa por React**: cada `pointermove`
escribe el `transform` de la superficie en el siguiente fotograma y `--swipe` (0 a 1) en la fila, que
hace crecer el icono de detrás; antes era un render por evento y en móviles modestos iba a saltos.
Al pasar el umbral (84 px) el icono se rellena, da un saltito y vibra; al soltar cuenta también la
velocidad (un golpe rápido de 36 px basta). Hacia un lado sin acción solo ofrece resistencia. El
`click` que llega tras deslizar se descarta. El asa detiene la propagación del `pointerdown` para no
disparar también el deslizamiento.

Las filas están **memorizadas** (`TaskShell`, `SortableTask`, las del horario y las rutinas): las
acciones llegan por contexto (`RowActionsContext`) y no cambian entre renders (`useTaskActions` lee
el estado de un ref), así que tachar una tarea solo repinta esa fila.

Los paneles (`Sheet`) se arrastran por el asa igual: el panel sigue al dedo sin renders, el fondo se
aclara a la vez, un tirón corto (por velocidad) lo cierra y sigue bajando desde donde se soltó; hacia
arriba solo cede con resistencia. El deslizador (`Slider`) se coge desde cualquier punto de la pista,
enseña el valor encima del dedo y vibra en cada paso.

### Alta de tareas

El compositor crea donde se está mirando (Enter o el `+`): **sin fecha** en la Bandeja y **en el
día elegido** en la Agenda; su atajo de un toque lleva al otro sitio ("Hoy" o "Sin fecha"). Si dice
que se repite, es una rutina (ver "Rutinas"). `parseTask` reconoce día,
hora, plazos y duración en español ("mañana a las 5", "el lunes", "15/10", "en 30 min",
"durante una hora", "de las 5 a las 7"): si detecta algo lo aplica y enseña una píldora; tocarla
deja el texto literal. Con hora → aviso a la hora; con "en X min/horas" → aviso absoluto. Un número
suelto nunca es una hora ("comprar 5 manzanas") ni una duración ("comprar de 5 a 7 manzanas": un
tramo necesita "las" o minutos).

También entiende avisos dentro de la frase ("y recuérdamelo 10 minutos antes", "avísame a
las 9", "el día antes") y números en palabras: `normalize.ts` los pasa a dígitos guardando de
qué parte del original viene cada carácter, para recortar bien el título. Si la frase pide
avisos concretos, no se añade el de "a la hora".

### Elegir fecha u hora a mano (`PickerChip`)

Las píldoras de fecha y hora (Otro día, Elegir hora, Hasta…, Otra…, el resumen diario) abren el
selector nativo con un `<input>` oculto. **Nunca guardar en `onChange`**: iOS lanza `input` con
cada giro de la rueda, y guardar ahí fijaba valores de paso (un recordatorio con la primera hora por
la que pasaba; un "Hasta…" anterior al inicio que se recortaba a 12 h y hacía saltar la rueda). Lo
elegido queda en borrador y se guarda al cerrar el selector (`blur`, o al desmontar).

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
  los convierte en título, día, hora, duración y recordatorios: "bueno, hoy tengo que acudir a una
  cena a las 20:00, me gustaría que me lo recordaras media hora antes" → `Cena`, hoy, 20:00, 30 min
  antes; "el jueves tengo reunión con Jorge de 17:30 a 18:30" → `Reunión con Jorge`, jueves, 17:30,
  60 min (`durationMinutes`), que es lo que hace saltar la pregunta al acabar.
  - `prompt.ts`: reglas del título (evento sin verbo de ir: "Cena", "Boda de Carlos"; acción en
    infinitivo: "Llamar a Miguel"), calendario de tres semanas agrupado por semanas y ejemplos
    resueltos con las fechas del día.
  - Las cuentas las hace el código, no el modelo: `date` es `null` si la frase no dice día (el
    móvil aplica "hoy si la hora no ha pasado, si no mañana") y "en 20 minutos" llega como
    `inMinutes` y el Worker lo pasa a hora local.
  - Se valida en el Worker y otra vez en el móvil (`lib/interpret.ts`). Si la IA falla, tarda más
    de 8 s o no devuelve nada válido, se usa `parseSpoken` sobre el texto.
  - **Permiso**: nada dicho sale del dispositivo sin `settings.dictation` (App Store, norma
    5.1.2(i): IA de terceros). La primera vez que se toca el micrófono, `DictationConsent` (trozo
    aparte) dice adónde va el audio con un solo botón, **Continuar**, que graba en ese mismo toque
    (iOS solo abre el audio dentro de un gesto) y así lanza el permiso del micrófono. El panel no se
    cierra de otra forma: Apple (norma 5.1.1(iv)) rechaza un aviso previo que pida permiso por su
    cuenta ("Permitir") o deje aplazar el del sistema ("Ahora no"). `settings.dictation` se guarda
    cuando iOS concede el micrófono; si lo niega, un toast lleva a Ajustes y el panel vuelve la
    próxima vez. Siri sin permiso usa el analizador local (`sharesDictation`, que
    `QuickAdd` consulta antes de llamar al servidor). Se retira en Ajustes → *Dictado*. Es del
    dispositivo: importar una copia (`state/import`) no lo trae ni lo quita.
  - Lugar: el modelo copia también el fragmento `lugar` y devuelve solo el nombre dicho
    (`placeName`, `placeOn`). El móvil lo empareja con sus lugares guardados: la lista nunca
    se envía al servidor.
  - El modelo se eligió con `npm run eval` (66 frases, ahora 75 con las de lugar y duración) entre
    los del plan gratuito: Nemotron acertó 46/48 con ~1,2 s; Qwen 3.8 y Gemma 4 aciertan parecido pero tardan
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
  viene, el martes", "a primera hora", "a las 20.00" y las duraciones ("durante una hora",
  "que dura media hora", "de las 5 a las 7", "hasta las 19:00").
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
tarea. Aparte de estos, una tarea con duración tiene su aviso al acabar, que no se guarda:
ver "Duración y aviso de cierre".

### Lugares

`AppState.places`: globales como las secciones, con nombre único (sin tildes ni artículo:
`placeKey`), ubicación (`null` hasta elegirla) y radio (100–1000 m). Borrar un lugar quita sus
avisos de las tareas.

- **Pestaña Lugares** (`PlacesView`), al estilo de Google Maps: arriba un **mapa** de Apple Maps con
  tus sitios (`MapSnapshot`: `TasksNative.mapSnapshot` hace una foto con `MKMapSnapshotter`, estilo
  apagado y sin comercios, en el tema de la app, y devuelve dónde cae cada punto); encima, en HTML,
  una chincheta por lugar con el número de tareas pendientes allí, que lo abre. Mientras llega la
  foto, o si falla, un plano dibujado con los puntos en su sitio relativo (`lib/mapFrame.ts`). Un
  buscador flota sobre el borde ("Buscar o añadir un lugar") y debajo va una tarjeta por lugar:
  nombre, dirección, **distancia** (solo si ya hay permiso de ubicación: abrir la pestaña no lo
  pide), radio y sus tareas pendientes. En la PWA la pestaña dice que es cosa del iPhone y lleva a
  la App Store (en `npm run dev` enseña la de verdad, con el plano dibujado, para poder probarla).
- **Panel del lugar** (`PlaceSheet`): mapa centrado con el radio a escala, buscar en Apple Maps o
  usar la ubicación actual, **deslizador de radio** (100 m–1 km, de 50 en 50, el círculo lo sigue en
  vivo), las tareas con aviso allí y borrar.
- **Alta**: el buscador de la pestaña, o al escribir o dictar un sitio nuevo ("al pasar por
  Mercadona"): `parseTask` devuelve `newPlace`, `useAddTasks` crea el lugar y abre su editor
  buscando ese nombre en Apple Maps (ordenado por cercanía) o con la ubicación actual.
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
- **Sonido**: el plugin de notificaciones programa en silencio si no recibe `sound`; `applyPlan`
  pasa `'default'` (un nombre sin fichero = sonido del sistema). Los de lugar y los que programa
  Siri (`NotificationPlanner`) usan `.default`.
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
- **Siri y accesos rápidos**: "Añadir tarea" ("Apunta en Tasks") y "Pasar atrasadas a hoy" ("Pasa
  lo atrasado a hoy en Tasks") no abren la app: ver "Apuntar sin abrir la app" y "Pasar a hoy". "Mi
  semana en Tasks", "Nueva tarea" y `UIApplicationShortcutItems` sí la abren y
  pasan por `NativeActions`, que guarda la acción hasta que la web escucha (`retainUntilConsumed`).
  La web la valida con `parseNativeAction`.
- **Tres toques atrás**: las apps no pueden detectarlos, solo lanzar un atajo. Para dictar, el atajo
  *Dictar tarea* ("Dictar texto" + "Añadir tarea"). Para escribir, `ComposeTaskIntent` ("Nueva
  tarea", sin frase de Siri para no chocar con la de añadir), que abre la app con el teclado: envía
  `compose`, igual que el acceso rápido del icono.
- **Vibración** (`haptic`) al completar, borrar, elegir sitio, pasar el umbral al deslizar, cambiar
  de semana y en cada paso de los deslizadores.
- **Apariencia**: `lib/theme.ts` llama a `TasksNative.setAppearance` (fija
  `overrideUserInterfaceStyle` de las ventanas, así la rueda de la hora, el teclado y los menús van
  en el mismo tema; `auto` lo deja al sistema, y se guarda en `UserDefaults` para el próximo
  arranque) y pone la barra de estado con la tinta que toca (`Style.Light` de día, `Style.Dark` de
  noche). `Info.plist` ya no fuerza el modo claro y su `UIStatusBarStyle` es el del sistema. La
  pantalla de carga, en "Arranque".
- **Widget Hoy** (`ios/App/TasksWidget`, pequeño, mediano, grande y dos de pantalla de bloqueo): el
  bloque Hoy con lo atrasado en rojo y el número del icono. Con algo atrasado, **A hoy** (ver "Pasar
  a hoy"). Los títulos crecen con la importancia (`RowStyle.titleFont`). Mismos colores que
  `tokens.css` (`Palette`) y la cifra en New York; en la pantalla de inicio sigue el modo del iPhone
  (azul noche en oscuro); en la de bloqueo va siempre con la paleta de noche, porque iOS pinta por
  luminosidad y la tinta marino desaparecería. Datos por el App Group, con un fichero para cada lado:
  - La app escribe `widget-snapshot.json` con `widgetSnapshot` (`NativeWidget`, debounce 400 ms y
    al instante al pasar a segundo plano) y pide recargar. La foto trae lo atrasado y 7 días por
    delante: el widget tiene una entrada por medianoche y cambia de día sin abrir la app.
  - Tocar el círculo ejecuta `ToggleTaskIntent` en la extensión: apunta el cambio en
    `widget-changes.json`, quita los avisos pendientes de esa tarea y pone el número del icono. La
    web no corre ahí, así que al volver a primer plano `widgetChanges()` devuelve lo apuntado (y lo
    vacía), la web lo aplica con `task/toggle` y, si el widget quitó avisos, lanza
    `RESCHEDULE_EVENT` para reprogramar aunque la huella del plan no haya cambiado.
  - Enlaces `io.github.diegomolinacatala.tasks://today|compose|routines|task/<id>` (`WidgetLink`,
    `CFBundleURLTypes`) llegan a la web como acciones `today`, `compose`, `routines` y `open`.
  - Sin App Group (compilación sin firmar) el widget dice "Abre Tasks" y la web ignora el error.
- **Widget Rutinas** (`RoutinesWidget` en `TasksWidget.swift`, vistas en `TasksWidgetViews.swift`):
  pantalla de bloqueo redonda (anillo con lo hecho hoy y la inicial de la rutina, o la marca) y
  rectangular (la rutina, su hora y "1 de 3 hoy"), y pequeño de inicio (las de hoy con su círculo).
  **Un toque la tacha** sin abrir la app, también bloqueado (`ToggleRoutineIntent`, en
  `ToggleTaskIntent.swift`, `authenticationPolicy = .alwaysAllowed`). Se configura
  (`AppIntentConfiguration` + `RoutineWidgetIntent`, `RoutineEntity`/`RoutineQuery` leen la foto): una
  rutina concreta o "la siguiente que queda por hacer". Una entrada por medianoche: cada día amanece
  sin tachar sin abrir la app.
  - La foto (`widgetSnapshot`) lleva `routines` (días que tocan y diario de la última semana).
    Tacharla apunta `routines[id][día]` en `widget-changes.json` (`WidgetStore.setRoutine`), quita su
    aviso de hoy (pendiente y ya entregado) y, si se destacha, pide reprogramar. La web lo recoge con
    `widgetChanges()` (en la misma lista que las tareas: `{ routineId, date, done }`,
    `parseRoutineChanges`) y aplica `routine/set`. `headless.js` también lo cuenta (`projected`).
  - `WidgetChanges` se lee con `decodeIfPresent`: un fichero de una versión anterior no trae
    `routines` y no debe perder lo marcado.
- **Permisos**: el de notificaciones se pide solo la primera vez que hay algún recordatorio
  (`tasks:notifications-asked` en localStorage); después manda Ajustes de iOS. El de ubicación, al
  buscar un sitio o usar la ubicación actual (`LocationRequester.swift`). La pestaña Lugares avisa
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

### Apuntar sin abrir la app

Siri ("Apunta en Tasks") y la acción "Añadir tarea" de Atajos crean la tarea en segundo plano,
también con el iPhone bloqueado (`authenticationPolicy = .alwaysAllowed`). Pasar lo atrasado a hoy
(Siri, Atajos y el widget) va por el mismo camino: `QuickAdd.moveOverdue` → `moveOverdue` de
`headless.js` → entrada `move` en la bandeja, con avisos, icono y widget al día. Van en la misma cola
que las altas.

- **Escucha el sistema, no la app.** iOS no deja activar el micrófono desde segundo plano (Apple,
  DTS: *privacy block*); `AudioRecordingIntent` solo sirve si la sesión de audio ya se abrió con la
  app delante. Por eso no hay botón propio que grabe: el atajo *Dictar tarea* ("Dictar texto" +
  "Añadir tarea") hace de botón en tocar atrás, botón de acción, pantalla de bloqueo, centro de
  control y widget de Atajos (pasos en `docs/app-store.md` §2.1).
- **Flujo** (`QuickAdd.swift`): el intent corre en el proceso de la app, sin WebView →
  `HeadlessCore` carga `public/headless.js` en JavaScriptCore → con el permiso del dictado,
  `DictationServer` pide la interpretación a la IA (`POST /v1/interpret`, 6 s como mucho; sin
  permiso o si no responde, el analizador local) →
  `addFromText` (`src/lib/headless.ts`) con el fichero de estado, la bandeja y lo marcado en el
  widget → la entrada va a la bandeja y se aplican el plan de avisos (`NotificationPlanner`, con el
  mismo formato que el plugin de notificaciones para que los toques lleguen a la web), el número
  del icono y la foto del widget. Siri dice el mensaje: "Apuntada: Cena, hoy 20:00, 30 min antes".
- **La web sigue siendo la única que escribe el estado.** La bandeja (`Library/tasks-inbox.json`,
  `InboxStore.swift`, `src/lib/inbox.ts`) se aplica al cargar (`loadState`, antes de pintar: tocar
  el aviso de una de esas tareas ya la encuentra) y, con la app viva, al volver a primer plano o con
  la acción `inbox` (`NativeInbox`). Aplicar es idempotente por id: el reducer ignora un `task/add`
  con un id que ya existe. Una entrada sale de la bandeja cuando un estado que la contiene se ha
  escrito en el fichero (`settleInbox`, tras `writeStateFile`).
- **Sin fichero de estado** (la app aún no se ha abierto) solo se apunta: sin estado no se sabe qué
  avisos hay, y aplicar un plan vacío los borraría todos.
- **Si `headless.js` falla**, se guarda solo el texto y la web lo interpreta al aplicarlo, con la
  hora a la que se dijo e ids derivados del de la entrada (releerla no duplica).
- `headless.js` se construye aparte (`vite.headless.config.ts`, IIFE `TasksHeadless`) y
  `scripts/check-headless.mjs` lo ejecuta sin navegador: en lo que importe `src/lib/headless.ts` no
  puede haber `window`, `fetch`, `console` ni `setTimeout`. El contrato lleva `version` en los dos
  lados (4 desde que existe `answer`).
- Swift se da de alta solo para el dictado (token en el llavero, distinto del de la web) y la URL
  del servidor la lleva `headless.js` (`VITE_PUSH_API` al compilar).
- Un lugar nuevo dicho a Siri nace sin ubicación; el mensaje pide abrir Tasks para ubicarlo.

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
  muestra), más "Pasar a hoy" si la tarea ya es de un día anterior; el resumen diario con algo
  atrasado lleva "Pasar atrasadas a hoy" (`?action=today` sin tarea), y el aviso de cierre,
  "Sí, hecha" y "Todavía no" (`done` y `again`). El SW no toca el estado: abre la app con
  `?action=` y `useNotificationActions` lo aplica con un toast. Tocar el aviso sin botón abre la
  tarea con **Posponer**, salvo el de cierre (`?ask=1`), que repite la pregunta en un toast.
- Número en el icono: pendientes de hoy + atrasadas (`badgeCount`), actualizado por la app
  y por cada push.

## Estilo visual

"Old money": papelería de casa antigua. Papel marfil (`--bg`), tinta azul marino
(`--text`), coñac (`--accent`) para lo interactivo y lo completado, azul marino macizo
(`--primary`) para lo elegido y la acción principal, y oro viejo (`--gold`) solo para filetes.

**Modo oscuro** ("noche de biblioteca"), en Ajustes → Apariencia: **Claro**, **Oscuro** o
**Automático** (sigue al iPhone; es lo que trae una instalación nueva o una copia antigua). Azul
medianoche en vez de papel (`#121828`), tinta marfil (14:1), y los mismos acentos en pastel: camel
(9:1), rosa terracota para lo atrasado, oro pálido; lo elegido pasa a marfil macizo con tinta de
noche. Son los mismos tokens redefinidos en `:root[data-theme='dark']` (`tokens.css`): ningún
componente sabe en qué tema está (salvo las miniaturas de Ajustes, que enseñan cada uno a propósito).
Cambiar de tema extiende el nuevo en un círculo desde el dedo (View Transitions, `switchTheme`). La
apariencia es del dispositivo: importar una copia o borrarlo todo no la cambia.

- Letra: fechas, bloques (Atrasadas, Horario, Sin hora, Rutinas), títulos de panel, nombres de lugar
  y vacíos en **New York**
  (`--font-serif`: `ui-serif`, la serif del sistema, sin descargar nada); el resto, San Francisco.
  Secciones y etiquetas en versalitas espaciadas.
- Tokens en `src/styles/tokens.css`. **No hardcodear colores, espaciados ni duraciones.** Contrastes
  comprobados: tinta 13:1, secundario 6,5:1, terciario 4,6:1, coñac 5:1 sobre el papel; de noche,
  tinta 14:1, secundario 8:1, terciario 5,7:1, camel 9:1. Cualquier color nuevo, en los dos temas.
- `--danger` (ladrillo) significa una sola cosa: atrasado (o borrar). No se usa de adorno.
- Movimiento: completar rellena el círculo con rebote (`--ease-pop`), dibuja la marca y tacha a
  pluma; las filas se deslizan a su sitio (`lib/flip.ts`, solo las que se ven); los paneles suben
  con la curva de iOS y bajan más deprisa; los avisos entran y salen; el filete de oro de las
  pestañas se desliza; el día nuevo entra por el lado hacia el que se va; la marca de "ahora" late.
- La marca (señal a pluma en tinta, doble filete de oro en el icono) sale de `scripts/brand.mjs`:
  cambiarla ahí y `npm run icons`.
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
  `isNative` y no cambia el comportamiento de la web. Lo que Swift necesite de la lógica (Siri sin
  abrir la app) se ejecuta con JavaScriptCore, no se reescribe en Swift.
- **La web es la única que escribe el estado.** Lo que nace fuera (widget, Siri) se apunta aparte y
  la web lo aplica al cargar o al volver a primer plano.
- **El Worker sirve a todas las versiones instaladas.** Se despliega al momento y la gente no
  actualiza a la vez: sus rutas y respuestas cambian solo de forma compatible hacia atrás.
- **Backend solo para avisos y dictado**, sin acceso a lo guardado: nada de guardar tareas en
  claro en el servidor. El audio del dictado se transcribe al momento y no se conserva.
- **Sin sincronización entre dispositivos.** El trasvase es manual: exportar/importar JSON
  desde Ajustes.
- **Sin subtareas ni notas** por ahora. Lo que se repite no son tareas recurrentes sino **rutinas**:
  no generan copias por día ni se "reinician"; cada día se tachan en su diario.
- Las secciones son globales y agrupan dentro del día, no son listas independientes.
- Al completar una tarea baja al final de su bloque; no se oculta.
- La importancia es tamaño, no orden ni etiqueta: nada se reordena solo por ser importante.
- La duración existe para poder preguntar al acabar, no para planificar el día: no hay calendario,
  ni bloques de tiempo, ni se avisa de solapes. Lo que no se dice no dura.
- Pasar a hoy nunca es automático dentro de la app: lo decide el usuario (o su automatización de
  Atajos).
- Una tarea sin fecha no tiene sección: al mandarla a `Sin fecha` se le quita.
- Lo atrasado y completado no se muestra: es historia, no deuda.
- Modo oscuro sí, pero con la misma identidad: colores apagados y pastel, nada chillón. El papel
  marfil sigue siendo la cara de la app (icono, capturas).
- Cuatro pestañas y ninguna más (Bandeja, Agenda, Lugares, Ajustes). Lo que no es de primer nivel
  va en paneles.

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
  - Número de compilación = `github.run_number`; versión = `MARKETING_VERSION` del proyecto (1.2,
    cuatro veces en `project.pbxproj`: app y widget, Debug y Release). Tiene que ser mayor que la
    última aprobada, o la subida falla (`ITMS-90186`/`ITMS-90062`): tras cada aprobación se sube.
    Pasos de una actualización en `docs/app-store.md` §9.
  - Tras subir, Apple procesa 5–30 min y avisa por correo de problemas del binario (`ITMS-…`).
- **Worker**: `.github/workflows/deploy-worker.yml` al tocar `worker/` (typecheck → tests →
  esquema D1 → `wrangler deploy`). Usa el secret `CLOUDFLARE_API_TOKEN` (plantilla *Edit Cloudflare
  Workers* más *Account → D1 → Edit*) y la variable `CLOUDFLARE_ACCOUNT_ID`; sin el token solo
  valida. Para relanzarlo sin cambios: Actions → Deploy worker → Run workflow.
