# Tasks

To-do diaria para móvil. PWA instalable, sin backend y sin cuentas: los datos viven en
el propio dispositivo. Se publica en GitHub Pages desde este repo público.

- Producción: https://diegomolinacatala.github.io/tasks/
- Idioma de la interfaz: **español**. Sin textos explicativos ni microcopy de relleno.
- Formato objetivo: **móvil en vertical**. El escritorio no es un caso a optimizar.

## Comandos

```bash
npm run dev        # servidor local en http://localhost:5173/tasks/
npm test           # tests unitarios (vitest, entorno node)
npm run coverage   # cobertura de src/lib y src/state
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + build de producción a dist/
npm run icons      # regenera public/icons/* (solo si cambia la marca)
```

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| UI | React 19 + TypeScript + Vite | estándar, estático, build simple |
| Drag & drop | dnd-kit (core + sortable) | sensores táctiles resueltos: pulsación mantenida, auto-scroll, teclado |
| Persistencia | IndexedDB vía `idb-keyval`, con `localStorage` de reserva | offline real, sin servidor |
| PWA | `vite-plugin-pwa` (`registerType: autoUpdate`) | instalable y offline |
| Tests | Vitest en entorno node | la lógica pura es lo que se testea |

Sin router (una sola pantalla con tres vistas), sin librería de estado, sin framework CSS,
sin fuentes externas. El bundle debe seguir por debajo de ~120 kB gzip.

## Arquitectura

```
src/
├── types.ts              # Task, Section, AppState
├── lib/                  # lógica pura + adaptadores de navegador
│   ├── date.ts           # ISO local YYYY-MM-DD, semana que empieza en lunes
│   ├── order.ts          # scopes y reordenación
│   ├── backup.ts         # exportar/importar y saneado de datos externos
│   ├── persistence.ts    # IndexedDB + fallback
│   └── transition.ts     # View Transitions API con degradación
├── state/                # reducer, acciones, selectores, provider
└── components/           # por dominio: shell, views, task, section, compose, ui, dnd
```

### Estado

Un único `useReducer` con `AppState` inmutable en `src/state/reducer.ts`, expuesto por
`StoreProvider`. Cada cambio se persiste con debounce de 250 ms y se fuerza el guardado en
`pagehide` y `visibilitychange` (el sistema puede matar la pestaña sin avisar).

**Nunca mutar**: todas las operaciones devuelven objetos nuevos. Los tests lo comprueban.

### Orden de las tareas (`src/lib/order.ts`)

`Task.order` es relativo a un *scope*:

- tarea con fecha → un scope por `(día, sección)`
- tarea sin fecha → un único scope plano `backlog`

Por eso `tasksOn()` solo garantiza que lo pendiente va antes que lo completado: el orden
entre secciones distintas no es comparable. Cada vista ordena lo que muestra.

### Drag & drop

- **Hoy**: `useTodayBoard` mantiene una copia (`preview`) del tablero durante el gesto y
  confirma todo con una sola acción `board/commit` al soltar. La copia vive además en un
  ref: al soltar hay que leer el estado real del gesto, no el del último render.
- **Semana**: cada día es un `useDroppable`; soltar cambia la fecha y conserva la sección.
  No se reordena dentro del día (el orden es por sección y quedaría ambiguo).
- **Backlog**: lista `sortable` plana.
- Ids con prefijo para no colisionar: `col:<clave>` (columna), `sec:<id>` (sección),
  el id pelado de la tarea para las tareas. Ver `src/components/dnd/ids.ts`.
- Activación por pulsación mantenida (200 ms, tolerancia 6 px) para no bloquear ni el
  scroll vertical ni el deslizamiento horizontal.

### Gestos de fila (`useSwipe`)

Deslizar a la derecha completa, a la izquierda borra (con deshacer en un toast). El gesto
se bloquea en un eje según el primer movimiento y convive con dnd-kit porque un movimiento
horizontal cancela la activación del arrastre. El desplazamiento se guarda en un ref
además de en el estado: al soltar hay que leer el valor real, no el del render anterior.

## Estilo visual

Negro puro, siempre oscuro. Tipografía del sistema, jerarquía por tamaño y peso, un solo
acento (`--accent`, azul lavanda) reservado a lo interactivo y a lo completado.

- Tokens en `src/styles/tokens.css`. **No hardcodear colores, espaciados ni duraciones.**
- CSS por componente, junto al componente. Clases en kebab-case estilo BEM ligero.
- Animar solo `transform` y `opacity`.
- Respetar `prefers-reduced-motion` y las safe areas (`--safe-t`, `--safe-b`, `--kb`).
- Los `inputs` van a 16px para que iOS no haga zoom al enfocar.

## Convenciones

- Ficheros pequeños y por dominio (200–400 líneas; 800 es el techo).
- Comentarios solo donde el *porqué* no se deduce del código, y en español.
- Nada de `console.log` en el código final.
- Los tests cubren `src/lib` y `src/state` (umbral 80%). El pegamento de React y de
  navegador se prueba en el dispositivo, no en Node.

## Decisiones cerradas

- **Sin backend ni login.** El repo es público: nunca añadir claves ni endpoints propios.
- **Sin sincronización entre dispositivos.** El trasvase es manual: exportar/importar JSON
  desde Ajustes.
- **Sin subtareas, notas, recurrencias ni recordatorios** en el MVP.
- Las secciones son globales y agrupan dentro del día, no son listas independientes.
- Al completar una tarea baja al final de su bloque; no se oculta.

## Despliegue

`.github/workflows/deploy.yml` construye y publica en cada push a `main`
(typecheck → tests → build → Pages). La `base` de Vite es `/tasks/`: si el repo se
renombra, hay que cambiarla en `vite.config.ts` (afecta también a `start_url` y `scope`
del manifiesto).
