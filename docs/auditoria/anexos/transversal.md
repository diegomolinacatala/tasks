# Transversal: textos, accesibilidad, toque, oscuro, capas

Auditoría de lo que cruza todas las pantallas, con grep sistemático sobre `src/` (67 tablas de textos, 148 `<button>`, 23 `z-index`, 49 `catch`, 18 ficheros CSS) y cálculo de contraste WCAG sobre `tokens.css`. Rama `capacitor`, 12/10/2026.

## Resumen (5 líneas)

1. **Los textos están muy bien cuidados**: las 67 tablas `COPY/TEXT/WORDS` tienen las mismas claves en `es` y `en`, no hay `...` ni apóstrofos rectos, las mayúsculas son coherentes y solo hay **un literal en español fuera de tabla** (`Suelta una tarea aquí`, que ve también quien usa la app en inglés). Las incoherencias son de vocabulario: "Recordatorios" frente a "Avisos", "Ajustes" para la app y para iOS, "Hasta…" con dos significados en el mismo panel, abreviaturas de duración distintas según el fichero.
2. **Un fallo de persistencia se calla** (`persistence.ts`): si el fichero del iPhone deja de escribirse, el siguiente arranque carga el fichero viejo y todo lo hecho desde entonces desaparece sin que nadie avise. Es el único CRÍTICO.
3. **Accesibilidad**: todos los botones de solo icono llevan `aria-label` y los deslizadores tienen `role="slider"`, pero `button:focus { outline: none }` pisa a `:focus-visible` (más específico), así que **ningún botón enseña el foco con teclado**; los `Sheet` no mueven ni atrapan el foco, y un **toast que sale con un panel abierto queda detrás del scrim** y su botón ("Ajustes", "Deshacer") no se puede tocar.
4. **Áreas de toque**: 24 controles por debajo de 44 px; los que más duelen son el "…" de cada sección (32), "Pasar a hoy" (32), "Hoy" (30), el asa de los paneles (28), el asa de la barra (22), la × y la hora de acabar de la regla (32) y las píldoras de todos los paneles (38).
5. **Modo oscuro y capas**: la paleta está completa en los dos temas (solo dos colores fijos discutibles, el coñac claro del calendario «Tasks» y el scrim claro al 30 %); la escala de `z-index` es limpia salvo el cruce toast/panel. Las zonas seguras y el teclado (`--kb`) están contemplados en todo lo fijo.

## Hallazgos

### TR-01 · Si el fichero de estado deja de escribirse, se pierde lo hecho desde entonces sin aviso · [CRÍTICO]
- **Dónde**: `src/lib/persistence.ts:80-90` (`saveToFile` devuelve `false` y solo hace `console.error`), `:92-99` (`saveState` sigue con IndexedDB como si nada), `:61-63` (`loadState` en el iPhone **prefiere el fichero** y solo cae a IndexedDB si el fichero *falta*, no si es más viejo); `:73-77` (en la web, si IndexedDB y `localStorage` fallan, otro `console.error`).
- **Qué ve/hace el usuario**: sigue añadiendo, tachando y moviendo tareas con normalidad; al abrir la app otro día, todo lo de las últimas horas o días ha desaparecido.
- **Problema**: el comentario de `:86` ("al arrancar se usa si el fichero falta") no cubre el caso real: el fichero existe pero está viejo porque las escrituras fallan (disco lleno, permisos, el plugin de Filesystem caído). `normalizeState(await readStateFile())` lo devuelve y la copia buena de IndexedDB se ignora. Y el usuario no se entera en ningún momento: es el único sitio de la app con `console.error` en lugar de un aviso.
- **Propuesta**: (1) guardar un sello (`savedAt` o un contador) dentro del estado y en `loadState` quedarse con la copia **más reciente** de las dos; (2) si `saveToFile` o `saveToBrowser` fallan dos veces seguidas, un toast persistente: es «No se está guardando. Libera espacio en el iPhone o exporta una copia.» / en «Changes aren’t being saved. Free up space on your iPhone or export a backup.», con acción «Exportar» / «Export»; (3) quitar los `console.error`.
- **Esfuerzo**: M

### TR-02 · Los botones nunca enseñan el foco de teclado: `button:focus` pisa a `:focus-visible` · [ALTO]
- **Dónde**: `src/styles/base.css:47-51` (`input:focus, textarea:focus, button:focus { outline: none }`, especificidad 0,1,1) y `:53-57` (`:focus-visible { outline: 2px solid var(--accent) }`, especificidad 0,1,0).
- **Qué ve/hace el usuario**: con teclado externo, Control por botón o VoiceOver con teclado, al tabular por la app no se ve dónde está el foco en ningún botón, input ni textarea. Solo lo enseñan el interruptor (`calendar.css:78`), la regla (`ruler.css:177`) y el deslizador (`slider.css:76`), que tienen reglas propias más específicas.
- **Problema**: cuando un botón está `:focus-visible` también está `:focus`, y la regla de tipo + pseudoclase gana a la pseudoclase sola. El `:focus-visible` global es papel mojado para el 95 % de los controles.
- **Propuesta**: en `base.css:47-51` cambiar a `input:focus:not(:focus-visible), textarea:focus:not(:focus-visible), button:focus:not(:focus-visible) { outline: none }`. Nada más: el anillo coñac de `:focus-visible` ya está bien.
- **Esfuerzo**: S

### TR-03 · Un toast que sale con un panel abierto queda detrás del scrim y su botón no se puede tocar · [ALTO]
- **Dónde**: `src/components/ui/toast.css:7` (`z-index: 50`) frente a `src/components/ui/sheet.css:2-5` (`.sheet` fijo, `inset: 0`, `z-index: 60`, con el scrim como `<button>` que cierra el panel). Los toasts que se lanzan con un panel abierto: `src/components/places/PlaceSheet.tsx:143` (`clash`), `:169-173` (`noPermission` con acción **Ajustes**), `:203` (`mapFailed`); `src/components/places/PlaceAliases.tsx:54` (`taken`); `src/components/task/ReminderPicker.tsx:78` (`past`, dentro de `TaskSheet` y `ComposeSheet`); `src/components/settings/CalendarExportSheet.tsx:64` (`failed`).
- **Qué ve/hace el usuario**: en el panel de un lugar toca «Usar mi ubicación actual» sin permiso: sale «Sin permiso de ubicación. · Ajustes» atenuado tras el velo; al intentar tocar «Ajustes» lo que toca es el scrim y **se le cierra el panel** (perdiendo lo escrito si era nuevo). En un recordatorio con hora pasada, «Esa hora ya ha pasado.» sale apagado y se lee mal.
- **Problema**: `ToastProvider` vive en `main.tsx:32` (dentro de `#root`) y los `Sheet` se portan a `body` con `z-index` mayor y a pantalla completa: siempre tapan al toast.
- **Propuesta**: subir el toast por encima de los paneles (`toast.css:7` → `z-index: 65`) y, mientras hay un panel abierto, posicionarlo sobre su pie: `bottom: calc(var(--safe-b) + 16px + var(--kb, 0px))` cuando `body` lleve una clase `has-sheet` que ponga `Sheet.tsx` al abrir. Alternativa más simple para `PlaceSheet.tsx:169`: enseñar el aviso como `sheet__note` dentro del panel, como hace `FeedbackSheet.tsx:109` con `role="alert"`.
- **Esfuerzo**: S

### TR-04 · «Suelta una tarea aquí» está en español también en inglés · [ALTO]
- **Dónde**: `src/components/section/SectionBlock.tsx:96` (`empty="Suelta una tarea aquí"`), pintado por `src/components/section/TaskColumn.tsx:26`.
- **Qué ve/hace el usuario**: con la app en inglés, cualquier sección vacía de la Agenda dice «Suelta una tarea aquí».
- **Problema**: es el único texto visible fuera de una tabla `COPY` (el resto de literales que salen del grep son «Tasks» y «·»). Además, el mensaje presupone el arrastre: quien no sabe que se arrastra manteniendo pulsado no entiende qué soltar.
- **Propuesta**: añadir a `COPY` de `SectionBlock.tsx:24`: es `empty: 'Sin tareas'`, en `empty: 'No tasks'` (o, si se quiere invitar: es `'Toca + para añadir una'`, en `'Tap + to add one'`), y `empty={copy.empty}` en `:96`.
- **Esfuerzo**: S

### TR-05 · Los paneles (`Sheet`) no mueven ni atrapan el foco · [ALTO]
- **Dónde**: `src/components/ui/Sheet.tsx:131-167` (`role="dialog" aria-modal="true"`, pero sin `focus()` al abrir, sin devolver el foco al cerrar y sin `inert` en lo de debajo). Compárese con `src/components/welcome/Welcome.tsx:174` y `src/App.tsx:407`, que sí hacen las dos cosas.
- **Qué ve/hace el usuario**: con VoiceOver, al abrir una tarea el cursor sigue en la lista de detrás (`aria-modal` lo mitiga en iOS, pero no mueve el foco); con teclado, Tab recorre la lista que hay debajo del panel; al cerrar, el foco se queda en `body`.
- **Problema**: cada edición de la app pasa por un `Sheet`, así que afecta a todo. El primer elemento tabulable es el scrim («Cerrar»), lo que al menos da una salida.
- **Propuesta**: en `Sheet.tsx`, al montarse abierto: guardar `document.activeElement`, `panel.current.focus({ preventScroll: true })` con `tabIndex={-1}` en `.sheet__panel`; al cerrar, devolver el foco al elemento guardado; y poner `inert` en `#root` mientras `open` (como hace `App.tsx:407` con la bienvenida). Son ~15 líneas.
- **Esfuerzo**: S

### TR-06 · Si los avisos no se programan, solo lo dice una nota en Ajustes · [ALTO]
- **Dónde**: `src/components/push/useNativeSchedule.ts:40-44` (`setFailed(true)` y comentario «se reintenta»), `src/components/push/useScheduleSync.ts:62-69` (igual en la web), y el único sitio que lo enseña: `src/components/settings/NotificationsBlock.tsx:100-103` («Programados 12 · sin sincronizar»).
- **Qué ve/hace el usuario**: pone un aviso «mañana a las 9», la app dice que está puesto y el aviso no suena. Para enterarse tendría que ir a Ajustes → Avisos y leer la coletilla.
- **Problema**: el fallo es silencioso en el sitio donde importa (la fila y el panel de la tarea). En el iPhone `applyPlan` puede fallar por el tope de 64 o por el plugin; en la web, por red.
- **Propuesta**: un toast cuando `failed` pasa a `true` desde `false` (una vez, no en cada reintento): es «No se han podido programar los avisos. Se reintenta solo.» / en «Reminders couldn’t be scheduled. It’ll retry on its own.». Y en el panel de la tarea, bajo «Recordatorios», la misma nota corta en `sheet__note` mientras `syncFailed` sea `true`.
- **Esfuerzo**: S

### TR-07 · «Ajustes» nombra dos cosas: la pestaña de la app y los Ajustes del iPhone · [MEDIO]
- **Dónde**: significa *la pestaña de Tasks* en `src/components/compose/useVoice.ts:40` y `src/components/push/PushProvider.tsx:32` («Activa los avisos en Ajustes para dictar tareas.»); significa *iOS* en `useVoice.ts:36` (acción «Ajustes» del toast de micrófono), `src/components/places/PlaceSheet.tsx:46`, `src/components/settings/CalendarBlock.tsx:21-22` («Sin permiso: abrir Ajustes», «En Ajustes, toca Calendarios…»), `src/components/settings/NotificationsBlock.tsx:16-17`, `src/components/task/ReminderPicker.tsx:38`, `src/components/welcome/CalendarScene.tsx:34`, `src/components/settings/CalendarGuide.tsx:31,56-57`.
- **Qué ve/hace el usuario**: con los avisos apagados, dicta y lee «Activa los avisos en Ajustes»: va a los Ajustes del iPhone, no encuentra nada y vuelve. Al revés con «Sin permiso: abrir Ajustes», que al tocarlo le saca de la app.
- **Problema**: la pestaña se llama exactamente igual que la app del sistema; nada distingue cuándo se sale de Tasks.
- **Propuesta**: para iOS, decir siempre «Ajustes del iPhone» / «iPhone Settings»: `CalendarBlock.tsx:21` → «Sin permiso: abrir Ajustes del iPhone» / «No access: open iPhone Settings»; `NotificationsBlock.tsx:16` → «Bloqueados: abrir Ajustes del iPhone»; `:17` → «Bloqueados. Actívalos en Ajustes del iPhone → Notificaciones → Tasks.»; `ReminderPicker.tsx:38` → «Avisos bloqueados: abrir Ajustes del iPhone»; `useVoice.ts:36` → «Ajustes del iPhone» / «iPhone Settings»; `PlaceSheet.tsx:46` igual; `CalendarScene.tsx:34` igual. Para la pestaña: `useVoice.ts:40` y `PushProvider.tsx:32` → «Activa los avisos en la pestaña Ajustes para dictar.» / «Turn on reminders in the Settings tab to dictate.» (o mejor: que el toast lleve la acción «Activar» que llame a `push.enable()` y no haya que ir a ningún sitio).
- **Esfuerzo**: S

### TR-08 · «Recordatorios» en el panel de la tarea, «Avisos» en todo lo demás · [MEDIO]
- **Dónde**: «Recordatorios»: `src/components/task/ReminderPicker.tsx:27` (título del campo en el panel de la tarea y en la ficha del compositor) y `:28` («Quitar recordatorio X»). «Aviso/Avisos»: `src/components/settings/NotificationsBlock.tsx:13` (grupo de Ajustes), `src/components/compose/ComposeSheet.tsx:66` y `src/components/routines/RoutineSheet.tsx:50` (campo de la rutina), `src/components/welcome/DetailsScene.tsx:29` (la lámina que enseña **el mismo campo** con otro nombre), `src/components/places/PlaceSheet.tsx:63-64,67`, `src/components/task/SnoozeBar.tsx:9`, `src/components/push/useNotificationActions.ts:19`, `src/components/task/ReminderPicker.tsx:36-39` (dentro del propio picker: «Activar avisos…», «Avisos bloqueados…»).
- **Qué ve/hace el usuario**: la bienvenida le enseña una ficha con «Avisos»; al abrir una tarea de verdad, el bloque se llama «Recordatorios» y debajo pone «Activar avisos en este dispositivo».
- **Problema**: dos palabras para una sola cosa, y una de ellas solo aparece en el sitio más visible. En inglés es «Reminders» en todas partes: la incoherencia es solo del español.
- **Propuesta**: `ReminderPicker.tsx:27` → `title: 'Avisos'`; `:28` → `remove: (label) => \`Quitar el aviso ${label}\``. (La sección «Recordatorios» de CLAUDE.md es técnica; no hace falta tocarla.)
- **Esfuerzo**: S

### TR-09 · «Hasta…» significa plazo bajo «Cuándo» y hora de acabar bajo «Duración», en el mismo panel · [MEDIO]
- **Dónde**: `src/components/task/fields.tsx:24` (`until: 'Hasta…'`, píldora del plazo en `WhenField`) y `src/components/task/DurationPicker.tsx:22` (`until: 'Hasta…'`, la hora de acabar en `:183-185`). Los dos a la vista a la vez en `src/components/task/TaskSheet.tsx:121-138` y en `ComposeSheet`.
- **Qué ve/hace el usuario**: en una tarea con hora ve «Hasta…» dos veces, una a tres dedos de la otra; la primera abre una fecha y la segunda una hora.
- **Problema**: misma etiqueta, dos selectores distintos. Con «Hasta el viernes» elegido arriba y «17:00 → Hasta…» abajo se pierde cuál es cuál.
- **Propuesta**: `DurationPicker.tsx:22` → es `until: 'Acaba a las…'`, en `until: 'Ends at…'`. El plazo se queda con «Hasta…» / «Until…».
- **Esfuerzo**: S

### TR-10 · Abreviaturas de horas y minutos distintas según el fichero · [MEDIO]
- **Dónde**: `src/lib/duration.ts:55-61` (es `1 h`, `1 h 30` —sin «min»—; en `1h`, `1h 30m`); `src/lib/reminders.ts:76-77` (es `1 h antes`, `15 min antes`; en `1 hr before`, `15 min before`), `:81-82` (es `En 1 h`, `+1 h`; en `In 1 hr`, `+1 hr`), `:142` (`+10 min` en los dos); `src/lib/schedule.ts:27,43` (`En 5 min`, `In 5 min`); `src/lib/timeline.ts:82-86` (es `1 h 30 libres`, en `1h 30m free`).
- **Qué ve/hace el usuario**: en inglés, en la misma fila lee «5:30–6:30 PM · 1h» y en su aviso «1 hr before»; en el horario «1h 30m free». En español, «1 h 30» parece una hora del reloj a medias (¿1:30?).
- **Problema**: tres convenciones en inglés (`1h`, `1 hr`, `1h 30m`) y una ambigua en español (`1 h 30`).
- **Propuesta**: una sola función `hoursLabel` en `duration.ts` y usarla en `reminders.ts` y `timeline.ts`. Español: `30 min`, `1 h`, `1 h 30 min`, `2 h`. Inglés: `30 min`, `1 hr`, `1 hr 30 min`, `2 hr` (estilo Apple en Reloj y Calendario). Cambios: `duration.ts:60` → `` rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min` ``; `:61` → `` rest === 0 ? `${hours} h` : `${hours} h ${rest} min` ``; `reminders.ts:76` ya encaja con `hr`; `timeline.ts:85` hereda.
- **Esfuerzo**: S

### TR-11 · La barra de pestañas se presenta a VoiceOver como «Secciones» · [MEDIO]
- **Dónde**: `src/components/shell/TabBar.tsx:17,22` (`nav: 'Secciones'` / `'Sections'`, usado como `aria-label` del `<nav>` en `:42`).
- **Qué ve/hace el usuario**: con VoiceOver, al llegar a la barra inferior oye «Secciones, navegación»; «sección» en Tasks es otra cosa (Compra, Trabajo…) y el panel de cada una se llama «Editar sección».
- **Propuesta**: `nav: 'Pestañas'` / `'Tabs'`.
- **Esfuerzo**: S

### TR-12 · El scrim de los paneles en claro es del 30 %, por debajo del 40 % recomendado · [MEDIO]
- **Dónde**: `src/styles/tokens.css:37` (`--scrim: rgba(22, 29, 48, 0.3)`); en oscuro `:145` (`0.55`). Lo usa `src/components/ui/sheet.css:16`.
- **Qué ve/hace el usuario**: con un panel abierto en claro, la lista de detrás sigue casi igual de legible y compite con el panel; de noche el contraste panel/fondo es mucho mayor que de día.
- **Propuesta**: `--scrim: rgba(22, 29, 48, 0.42)` en claro. Comprobar en una captura que el papel marfil del panel sigue separándose del fondo.
- **Esfuerzo**: S

### TR-13 · 24 controles con área de toque por debajo de 44 px · [MEDIO]
- **Dónde**: inventario completo en la tabla «Inventario de áreas de toque < 44 px». Los que más se usan: el «…» de cada sección (`section.css:117-118`, 32×32: solo el «+» lleva `::after`, `:136-140`), «Pasar a hoy» (`section.css:96`, 32 de alto), «Hoy» de la Agenda (`agenda.css:62`, 30), el asa de los paneles (`sheet.css:46,58`: 12+4+12 = 28), el asa de la barra de escribir (`composer.css:32`: 22), la × y la hora de acabar de la regla (`ruler.css:44,57-58`: 32), las píldoras de todos los paneles (`sheet.css:109`: 38), los destinos y botones de la barra (`composer.css:93-94,143,174-175,214,249,332-333`: 36), la acción del toast (`toast.css:34`: 36), las flechas de Constancia (`routines.css:360-361`: 44×36), la chincheta del mapa (`places.css:185-186`: 30), la esquina del mapa de Lugares (`places.css:458-459`: 32, es botón en `PlacesView.tsx:182`).
- **Qué ve/hace el usuario**: en el iPhone el toque falla o cae en el vecino: el «…» de una sección está pegado al «+» (44 de alto, 32 de ancho) y a la cabecera que pliega; «Pasar a hoy» está a 4 px del chevron.
- **Problema**: Apple pide 44×44 pt. La app ya resuelve varios con un `::after` invisible (`row__check`, `tl__node`, `allday__item`, `cal__handle`, `switch`, `routines__time`, `agenda__month`, `fb-dock__close`, `fb-thumb__remove`, `section__icon--add`): es cuestión de aplicar la misma receta al resto.
- **Propuesta**: (1) `section.css:113-122` `.section__icon { position: relative }` + `::after { inset: -6px }` (como `--add`); (2) `.section__action` y `.agenda__today`: `min-height: 36px` + `::after { inset: -4px 0 }`; (3) `sheet.css:46` `.sheet__grab { padding: 16px 0 }` y `composer.css:32` `.composer__grab { height: 30px; margin-bottom: -20px }` (sin mover la línea de texto); (4) `.ruler__clear`, `.ruler__end`, `.chip__clear`, `.routine-log__arrow`, `.map__expand.places__expand`, `.pin`: `::after { inset: -6px }`; (5) `.chip { min-height: 40px }` y `.sheet__chips { gap: 10px }` (el salto de 38 a 44 cambia la densidad de los paneles; con 40 + hueco de 10 la zona efectiva pasa de 44); (6) `.toast__action { min-height: 44px; margin: -4px 0 }`.
- **Esfuerzo**: M

### TR-14 · Un mensaje al usuario habla de «desplegar el Worker» · [MEDIO]
- **Dónde**: `src/components/push/PushProvider.tsx:33` (`outdatedServer: 'El servidor aún no tiene el dictado: vuelve a desplegar el Worker.'`); en inglés `:39` está bien («The server doesn’t support dictation yet.»).
- **Qué ve/hace el usuario**: al dictar, un toast con jerga del desarrollador.
- **Propuesta**: `'El dictado no está disponible ahora mismo. Prueba más tarde.'` / `'Dictation isn’t available right now. Try again later.'`.
- **Esfuerzo**: S

### TR-15 · Lo atenuado con `opacity` baja de 2:1 y 3:1 · [MEDIO]
- **Dónde**: `src/components/ui/sheet.css:222-224` (`.chip.is-muted { opacity: 0.5 }`: un aviso «antes» sin fecha u hora, o uno que ya sonó: texto `--text` sobre `--accent-dim` al 50 % → **1,9:1** en claro, 2,4:1 en oscuro); `src/components/routines/routines.css:110-113` (`.routine.is-off .row__title { opacity: 0.5 }`: rutina que hoy no toca → **3,0:1** claro, 4,4:1 oscuro, con texto de 15 px); `src/components/task/task.css:262-265` (`.is-overdue .row__meta { opacity: 0.8 }` → **4,0:1** claro con 12 px, justo por debajo de 4,5); `src/components/ui/sheet.css:259-261` (`.sheet__primary:disabled { opacity: 0.4 }` → 3,4:1 claro, 2,4:1 oscuro: es el botón «Añadir…» mientras no hay título).
- **Qué ve/hace el usuario**: en el panel de una tarea sin hora, el recordatorio «15 min antes» que quedó inactivo es casi invisible; en la Bandeja, las rutinas que hoy no tocan se leen con esfuerzo a la luz del sol.
- **Problema**: atenuar con `opacity` baja el contraste de todo, incluido el texto. Los tokens en sí cumplen (ver «Lo que está bien»).
- **Propuesta**: `.chip.is-muted`: `opacity: 1; color: var(--text-3); background: transparent; border: 1px dashed var(--line-2)` (sigue pareciendo inactivo, se lee a 5:1); `.routine.is-off .row__title`: `opacity: 1; color: var(--text-3)` (4,65:1) y dejar al 0,5 solo el círculo; `.is-overdue .row__meta`: quitar la `opacity`; `.sheet__primary:disabled`: `opacity: 0.55`.
- **Esfuerzo**: S

### TR-16 · AM/PM del horario en inglés a 9 px · [MEDIO]
- **Dónde**: `src/components/views/agenda.css:542-549` (`.tl__meridiem { font-size: 9px }`).
- **Qué ve/hace el usuario**: en inglés, bajo cada hora del horario, «AM»/«PM» en 9 px: por debajo de cualquier mínimo legible (Apple no baja de 11 pt en texto).
- **Propuesta**: `font-size: var(--fs-micro)` (11 px) y, si no cabe en la columna de 40 px, ensanchar `grid-template-columns` de `.tl` (`agenda.css:360`) a `46px` solo en inglés (`html[lang='en'] .tl`).
- **Esfuerzo**: S

### TR-17 · Textos explicativos fuera de la bienvenida (lo que CLAUDE.md prohíbe) · [MEDIO]
- **Dónde** (ordenado por lo que sobra): `src/components/feedback/FeedbackDock.tsx:8` («Puedes cambiar de pestaña o abrir una tarea.»: redundante con el título «Ve a lo que quieras comentar»); `src/components/settings/CalendarBlock.tsx:30` (`onNote`: repite lo de `promptNote` `:20` una vez conectado); `src/components/settings/CalendarExportSheet.tsx:19` (`ownNote` «Uno solo para tus tareas, aparte de los tuyos.»: lo dice ya el título de la opción) y `:15` (`lead`, dos frases); `src/components/settings/SettingsView.tsx:43` (`suggestNote`, dos frases bajo la fila); `src/components/section/SectionSheet.tsx:15` (`note` del borrado); `src/components/settings/CalendarPicker.tsx:14`; `src/components/update/UpdatePrompt.tsx:25` (`lead`). Justificados y que conviene dejar: `CalendarBlock.tsx:20` (privacidad del permiso), `SettingsView.tsx:40` (`dataNote`: dónde se guardan los datos), `NotificationsBlock.tsx:14` y `ReminderPicker.tsx:37` (sin ellos no hay avisos en la PWA), `DurationPicker.tsx:24` (a qué hora preguntará), `DictationConsent` (lo exige Apple), `CalendarGuide` entero (es un tutorial pedido expresamente).
- **Qué ve/hace el usuario**: Ajustes → Calendario acumula tres notas a la vez cuando está conectado; la tarjeta de sugerencias lleva dos líneas donde basta una.
- **Propuesta**: quitar `FeedbackDock.note`, `CalendarBlock.onNote`, `CalendarExportSheet.ownNote`; dejar `CalendarExportSheet.lead` en una frase («Las tareas con día y hora se añaden como eventos y se quitan al tacharlas.» / «Tasks with a day and time are added as events and removed when you check them off.»); `SettingsView.suggestNote` en una («Rodea lo que cambiarías y cuéntalo.» / «Circle what you’d change and say it.»).
- **Esfuerzo**: S

### TR-18 · Las tareas que no llegan al calendario no avisan · [MEDIO]
- **Dónde**: `src/components/calendar/CalendarExportSync.tsx:29-32` (`syncTasks(...).catch(() => { sent.current = null })`, sin más).
- **Qué ve/hace el usuario**: eligió «Calendario «Tasks»» y el padre del usuario espera verlas en el del trabajo; si EventKit falla (calendario borrado, permiso retirado a «solo añadir»), Ajustes sigue diciendo «Añadir mis tareas · Tasks» y no llega nada.
- **Propuesta**: en el `catch`, un toast una sola vez por sesión: es «No se han podido añadir las tareas al calendario. Revisa Ajustes → Calendario.» / en «Tasks couldn’t be added to the calendar. Check Settings → Calendar.», y en `CalendarBlock` pintar la fila en `--danger` mientras el último `syncTasks` haya fallado.
- **Esfuerzo**: S

### TR-19 · Los mensajes de vacío de «Sin hora» se leen raro bajo su propio título · [BAJO]
- **Dónde**: `src/components/views/AgendaView.tsx:54-55,310` («Todo tiene hora.» cuando el horario tiene tareas y la lista raíz está vacía; «Nada sin hora.» cuando no hay nada en ninguna parte), `src/components/views/InboxView.tsx:40` («Nada sin fecha.»), `src/components/places/PlaceTasksSheet.tsx:10` («No quedan tareas en este lugar.»).
- **Qué ve/hace el usuario**: bajo el titular «Sin hora» lee «Todo tiene hora.»: es cierto, pero es una nota sobre la lista de arriba, no sobre esta. Ninguno de los vacíos sugiere qué hacer, aunque la barra de escribir está siempre a la vista.
- **Propuesta**: en `AgendaView.tsx:310`, cuando `timedTasks` y la raíz está vacía, no pintar nota (`empty={free ? copy.free : timedTasks ? null : copy.noneUntimed}`): el bloque sigue ahí por las secciones y el «+ Sección». «Nada sin fecha.» y «Nada sin hora.» están bien como están (notas al margen, por diseño).
- **Esfuerzo**: S

### TR-20 · «Mañ» no es una abreviatura española · [BAJO]
- **Dónde**: `src/components/views/DayDock.tsx:12` (`tomorrow: 'Mañ'` / `'Tmrw'`), pintado en `:40`.
- **Qué ve/hace el usuario**: al arrastrar una tarea de la Bandeja, el muelle dice «HOY · MAÑ · MIÉ · JUE…».
- **Propuesta**: usar `dayNameShort(date)` para todos los días menos hoy (`'Hoy'` / `'Today'`): «HOY · MAR · MIÉ…». El número de debajo ya dice cuál es mañana. Si se quiere mantener la palabra, cabe «Mañana» a 11 px en columnas de ~62 px (iPhone de 390), pero no en 320.
- **Esfuerzo**: S

### TR-21 · Textos duplicados en varias tablas · [BAJO]
- **Dónde**: «Activa los avisos en Ajustes para dictar tareas.»: `src/components/compose/useVoice.ts:40` y `src/components/push/PushProvider.tsx:32`; «No se ha podido abrir el mapa.»: `src/components/places/PlaceSheet.tsx:61` y `src/components/places/PlacesView.tsx:35`; «Sin permiso: abrir Ajustes»: `src/components/settings/CalendarBlock.tsx:21` y `src/components/welcome/CalendarScene.tsx:34`; `month()`: `src/components/views/AgendaView.tsx:46` y `src/components/welcome/MonthScene.tsx:24`; «Desmarcar «X» de hoy» / «Hecha hoy: «X»»: `src/components/routines/RoutineRow.tsx:16-17` y `src/components/welcome/RoutineScene.tsx:21-22`; «Nueva rutina»: `RoutinesBlock.tsx:17`, `RoutineSheet.tsx:42`, `ComposeSheet.tsx:53`; «Nombre de la sección»: `AgendaView.tsx:57` y `SectionSheet.tsx:13`.
- **Problema**: al corregir uno (TR-07, TR-08) hay que acordarse del otro; ya ha pasado: la bienvenida dice «Avisos» y el panel «Recordatorios».
- **Propuesta**: un `src/lib/copy.ts` con lo compartido (`SETTINGS_IOS`, `OPEN_MAP_FAILED`, `MONTH_TOGGLE`, `ROUTINE_TOGGLE`) importado desde las tablas.
- **Esfuerzo**: S

### TR-22 · El patrón «Sin X» para la ausencia no se cumple siempre · [BAJO]
- **Dónde**: «Sin fecha», «Sin hora», «Sin aviso», «Sin duración», «Sin emoji», «Sin rodear» (fields.tsx:22,27; ComposeSheet.tsx:67; DurationPicker.tsx:20; EmojiPicker.tsx:7; FeedbackDraw.tsx:23) frente a «Ninguna» (`src/components/task/fields.tsx:30`, sección), «No» (`src/components/settings/NotificationsBlock.tsx:22`, resumen; `src/components/settings/CalendarBlock.tsx:27`, exportación), «No se repite» (`ComposeSheet.tsx:64`), «No añadirlas» (`CalendarExportSheet.tsx:16`). En inglés: «No date/time/reminder/duration/emoji» frente a «None», «Off» (×2), «Doesn’t repeat», «Don’t add them».
- **Propuesta**: `fields.tsx:30` → «Sin sección» / «No section»; `CalendarBlock.tsx:27` → «Sin añadir» / «Off» está bien como valor de fila; el resto puede quedarse (son verbos, no estados).
- **Esfuerzo**: S

### TR-23 · El toast cuenta la altura de las pestañas aunque estén ocultas · [BAJO]
- **Dónde**: `src/components/ui/toast.css:5` (`bottom: calc(var(--nav-h) + var(--composer-h) + …)`) frente a `src/components/shell/shell.css:160-163` (`.is-composing .tabs { display: none }`).
- **Qué ve/hace el usuario**: al añadir desde la barra con el teclado fuera, el toast «Rutina: Tomar creatina · Ver» flota 58 px por encima de la barra, separado de ella.
- **Propuesta**: `.app.is-composing ~ .toast`, o mejor una variable `--bar-h` que `.app` ponga a `0` en `is-composing` y que lean `toast.css:5` e `inbox.css:25`.
- **Esfuerzo**: S

### TR-24 · El coñac del calendario «Tasks» es el del tema claro también de noche · [BAJO]
- **Dónde**: `src/components/settings/CalendarExportSheet.tsx:90` (`'#8a5a2c'`), `src/lib/platform/calendarDemo.ts:123` (igual).
- **Qué ve/hace el usuario**: en oscuro, el punto del calendario «Tasks» y sus eventos en el horario salen en el marrón oscuro del tema claro (pasa por `cal-tone` y se apaga, pero no es el camel `#d9b48c` del resto de la app).
- **Propuesta**: en `CalendarExportSheet.tsx:90` pasar `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()` (como hace `FeedbackMode.tsx:51`), o un token `--cal-own` en `tokens.css` con valor por tema y `'var(--cal-own)'` como color (`color-mix` lo admite).
- **Esfuerzo**: S

### TR-25 · La tira de la semana en un iPhone de 320 px deja 43 px por día · [BAJO]
- **Dónde**: `src/components/views/agenda.css:82-89,131-135` (`.cal { margin: 0 -18px }`, `.strip__week` en 7 columnas: (320 − 16) / 7 = 43,4 px de ancho; alto 46).
- **Qué ve/hace el usuario**: en un iPhone SE de primera generación los días quedan 1 px por debajo de 44 de ancho. En 375 son 51 px.
- **Propuesta**: `.strip__panel { padding: 0 6px }` (`agenda.css:128`) en pantallas de 320 (`@media (max-width: 330px)`) → 44 px.
- **Esfuerzo**: S

### TR-26 · Las celdas de Constancia no dicen el mes · [BAJO]
- **Dónde**: `src/components/routines/RoutineLog.tsx:208` (`aria-label={\`${dayNameLong(day)} ${dayNumber(day)}\`}`), con 35 días por página (`:199`).
- **Qué ve/hace el usuario**: con VoiceOver, en una página que cruza dos meses oye «miércoles 1» dos veces (1 de octubre y 1 de noviembre) sin saber cuál es cuál; las flechas tampoco anuncian el rango.
- **Propuesta**: `aria-label={fullLabel(day)}` («miércoles, 1 oct»), ya existe en `lib/date.ts:105`.
- **Esfuerzo**: S

### TR-27 · «Mark» no dice qué hay que hacer · [BAJO]
- **Dónde**: `src/components/feedback/FeedbackDock.tsx:15` (`mark: 'Mark'`; es `'Señalar'`), seguido de la pista «Circle with your finger…» (`FeedbackDraw.tsx:24`) y «Circle again» (`FeedbackSheet.tsx:23`).
- **Propuesta**: en inglés `mark: 'Circle it'`; en español «Señalar» funciona, pero «Rodear» enlazaría con «Rodear otra vez».
- **Esfuerzo**: S

### TR-28 · Comillas: «Ya hay un lugar llamado X.» sin «» · [BAJO]
- **Dónde**: `src/components/places/PlaceSheet.tsx:44` (`clash`) frente a `src/components/places/PlaceAliases.tsx:15` (`«${alias}» ya lo usa ${place}.`) y el resto de la app, que entrecomilla siempre lo escrito por el usuario (`«${title}»`, `“${title}”`).
- **Propuesta**: `` `Ya hay un lugar llamado «${name}».` `` / `` `There’s already a place called “${name}”.` ``.
- **Esfuerzo**: S

### TR-29 · El mapa de Lugares es un `div` tocable sin rol · [BAJO]
- **Dónde**: `src/components/places/PlacesView.tsx:150` (`<div className="places__map" onClick>`); hay botón alternativo en `:182-192` (la esquina, con `aria-label`), así que con teclado y VoiceOver se puede.
- **Propuesta**: dejarlo (el botón cubre la accesibilidad), pero añadir `aria-hidden="true"` al `div` o `role="presentation"` para que VoiceOver no anuncie el mapa como grupo vacío.
- **Esfuerzo**: S

### TR-30 · Si el analizador en inglés no carga, lo escrito se queda literal sin decir nada · [BAJO]
- **Dónde**: `src/state/LanguageProvider.tsx:31` (`loadEnglish().catch(() => undefined)`).
- **Qué ve/hace el usuario**: en inglés sin red la primera vez (trozo aparte no cacheado todavía), escribe «call mom tomorrow at 5pm» y se guarda tal cual, sin píldora ni explicación.
- **Propuesta**: reintentar al recuperar `online` y, si falla, un toast una vez: «Couldn’t load the English parser. Dates and times will be taken literally until it loads.».
- **Esfuerzo**: S

### TR-31 · El halo de «mantener para estirar» de la regla no sirve con movimiento reducido · [BAJO]
- **Dónde**: `src/components/task/ruler.css:213-221` (`ruler-hold` rellena el halo en `--hold-ms`), anulado por `src/styles/base.css:101-109` (`animation-duration: 0.01ms`); el temporizador de JS sigue siendo de 480 ms.
- **Qué ve/hace el usuario**: con «Reducir movimiento», el halo se llena al instante y la regla no se estira hasta medio segundo después: parece que no responde.
- **Propuesta**: en `ruler.css:251`, bajo `prefers-reduced-motion`, en vez de anular: `.ruler.is-holding .ruler__more::after { animation: none; transform: scale(1); opacity: 0.6 }` y que `is-holding` cambie el color del sello; o acortar `HOLD_MS` cuando `matchMedia` lo diga.
- **Esfuerzo**: S

### TR-32 · Zonas seguras laterales (si el iPhone gira) · [BAJO]
- **Dónde**: ningún `env(safe-area-inset-left/right)` en `src/**/*.css`; `src/components/shell/shell.css:38` (`padding: 0 18px`), `src/components/feedback/feedback.css:6-7` (`left/right: 12px`), `src/components/ui/toast.css:11`.
- **Qué ve/hace el usuario**: solo si la app admite apaisado (CLAUDE.md dice «móvil en vertical»): la lista entraría bajo la isla dinámica.
- **Propuesta**: si `Info.plist` solo permite vertical, nada. Si no, `--safe-l/--safe-r` en `tokens.css` y sumarlos en `.app__scroll`, `.fb-dock` y `.toast`.
- **Esfuerzo**: S

## Inventario de términos (concepto · es (dónde) · en (dónde) · coherente)

| Concepto | es (dónde) | en (dónde) | Coherente |
|---|---|---|---|
| Pestaña 1 | Bandeja (TabBar.tsx:16, InboxView.tsx:37, App.tsx:97, ComposeSheet.tsx:51, DetailsScene.tsx:27) | Inbox (TabBar.tsx:21, InboxView.tsx:48, App.tsx:108) | sí |
| Pestaña 2 | Agenda (TabBar.tsx:16, CalendarBlock.tsx:19,23) | Agenda (TabBar.tsx:21) | sí |
| Pestaña 3 | Lugares (TabBar.tsx:16, PlacesView.tsx:25) | Places | sí |
| Pestaña 4 / iOS | Ajustes (TabBar.tsx:16, SettingsView.tsx:27) **y** Ajustes = iOS (CalendarBlock.tsx:21, NotificationsBlock.tsx:16-17, ReminderPicker.tsx:38, useVoice.ts:36, PlaceSheet.tsx:46) | Settings (ambos) | **no** (TR-07) |
| Barra de pestañas (aria) | Secciones (TabBar.tsx:17) | Sections | **no** (TR-11) |
| Sin fecha | Sin fecha (App.tsx:98, fields.tsx:22, InboxView.tsx:36, compose.ts:18, schedule.ts:30, details.ts:198) | No date (App.tsx:109, fields.tsx:38, InboxView.tsx:47, compose.ts:19, schedule.ts:46, details.ts:197) | sí |
| Sin hora | Sin hora (fields.tsx:27, AgendaView.tsx:53) | No time (fields.tsx:43, AgendaView.tsx:68) | sí |
| Hoy / Mañana | Hoy, Mañana (fields.tsx:20-21, compose.ts:18, date.ts:164, AgendaView.tsx:47, DayDock.tsx:12) | Today, Tomorrow (…); «Tmrw» (DayDock.tsx:12) | sí (salvo «Mañ»/«Tmrw», TR-20) |
| Otro día | Otro día (fields.tsx:23) | Other day (fields.tsx:39) | sí |
| Plazo | Hasta… (fields.tsx:24), «Quitar el plazo» (fields.tsx:25), Hasta el viernes / Último día (period.ts:67-73) | Until…, «Remove the time frame» (fields.tsx:40-41), Until Friday / Last day (period.ts:80-84) | sí, pero choca con Duración (TR-09) |
| Hora de acabar | Hasta… (DurationPicker.tsx:22) | Until… (DurationPicker.tsx:29) | **no** (TR-09) |
| Duración | Duración / Sin duración / Quitar la duración (DurationPicker.tsx:20-23) | Duration / No duration / Remove the duration | sí |
| Avisos (campo de la tarea) | **Recordatorios** (ReminderPicker.tsx:27), «Quitar recordatorio» (:28) | Reminders (ReminderPicker.tsx:43) | **no** (TR-08) |
| Avisos (resto) | Avisos (NotificationsBlock.tsx:13, DetailsScene.tsx:29, PlaceSheet.tsx:63-64), Aviso (ComposeSheet.tsx:66, RoutineSheet.tsx:50, SnoozeBar.tsx:9), Sin aviso (ComposeSheet.tsx:67, RoutineSheet.tsx:51) | Reminders / Reminder / No reminder | sí entre ellos |
| Hecha | Hecha (SnoozeBar.tsx:9, RoutineScene.tsx:24), «Hecha: X» (useNotificationActions.ts:15, Timeline.tsx:38, headless.ts:73), hechas (InboxView.tsx:38-42, StripDay.tsx:33), Sí, hecha (schedule) | Done (SnoozeBar.tsx:10, Welcome.tsx:131 «Listo»), «Done: X», done | sí («Done» sirve para Hecha y Listo en inglés: aceptable) |
| Completar / Desmarcar (aria) | Completar «X» / Marcar «X» como pendiente (TaskRow.tsx:13-14, Timeline.tsx:35-36); Desmarcar «X» (RoutineRow.tsx:16, Timeline.tsx:37) | Complete / Mark as pending; Unmark; «check off» (RoutineScene.tsx:34) | sí |
| Pasar a hoy | Pasar a hoy (AgendaView.tsx:49), «A hoy: X» / «N tareas pasadas a hoy» (useTaskActions.ts:15-16), «1 tarea pasada a hoy.» (headless.ts:69) | Move to today, «To today: X», «N tasks moved to today» | sí |
| Atrasadas | Atrasadas (AgendaView.tsx:48), «Hay tareas atrasadas» (TabBar.tsx:18), atrasada(s) (schedule.ts:35) | Overdue, «There are overdue tasks», «N overdue» | sí |
| Horario | Horario (AgendaView.tsx:50, Timeline.tsx:33) | Schedule | sí |
| Sección | Sección (fields.tsx:29, AgendaView.tsx:56), Editar/Borrar sección (SectionSheet.tsx:11,14), Ninguna (fields.tsx:30) | Section, Edit/Delete section, None | sí (salvo «Ninguna», TR-22) |
| Rutina | Rutina / Nueva rutina / Crear rutina / Convertir en rutina / Borrar rutina (RoutineSheet.tsx:42-43,55; ComposeSheet.tsx:52-53; TaskSheet.tsx:23) | Routine / New routine / Create routine / Turn into a routine / Delete routine | sí |
| Borrar (entidad) vs Quitar (atributo) | Borrar tarea/rutina/sección/lugar/todo; Quitar el aviso/la duración/el plazo/el nombre/los detalles | Delete …; Remove … | sí |
| Lugar | Lugar / Nuevo lugar / Otro lugar… / Lugar… (PlaceSheet.tsx:47-48, ReminderPicker.tsx:33-34) | Place / New place / Other place… / Place… | sí |
| Al llegar / Al salir | Al llegar (a) / Al salir (de) (ReminderPicker.tsx:31-32, ComposeSheet.tsx:61-62) | Arriving (at) / Leaving | sí |
| Copia de seguridad | Exportar/Importar copia, Copia importada (SettingsView.tsx:24,36-37) | Export/Import backup, Backup imported | sí |
| Resumen diario | Resumen del día, No / Cada mañana / Cada día a las X (NotificationsBlock.tsx:21-24) | Daily summary, Off / Every morning / Every day at X | sí |
| Sugerencia | Sugerir una mejora (SettingsView.tsx:42), Sugerencia (FeedbackSheet.tsx:8), Señalar (FeedbackDock.tsx:9), Rodear otra vez (FeedbackSheet.tsx:12) | Suggest an improvement, Suggestion, **Mark**, Circle again | casi (TR-27) |
| Dictado | Dictar tarea / Dictado / Cancelar dictado (Composer.tsx:55,58; DictationConsent.tsx:20) | Dictate a task / Dictation / Cancel dictation | sí |
| Importancia | Importancia (ImportanceScale.tsx:15, TaskSheet.tsx:21, ComposeSheet.tsx:68), «Tamaño según importancia» (App.tsx:100) | Importance, «Size by importance» | sí |
| Calendario | Calendario / Calendarios / Calendario «Tasks» (CalendarBlock.tsx:18,24; CalendarExportSheet.tsx:17) | Calendar / Calendars / “Tasks” calendar | sí |
| Horas y minutos | 30 min, 1 h, **1 h 30**, 15 min antes, 1 h antes, En 1 h, +1 h, +10 min | 30 min, **1h**, **1h 30m**, 15 min before, **1 hr** before, In **1 hr**, +1 hr, +10 min | **no** (TR-10) |
| Evento sin título | Evento (AllDayEvents.tsx:15, Timeline.tsx:39) | Event | sí |
| Deshacer | Deshacer (App.tsx:95, AgendaView.tsx:45, InboxView.tsx:34, useTaskActions.ts:14, useNotificationActions.ts:16) | Undo | sí |
| Comillas | «X» (TaskRow, RoutineRow, Timeline, PlaceAliases, CalendarExportSheet, CalendarGuide); sin comillas en PlaceSheet.tsx:44 | “X” | sí salvo TR-28 |

## Inventario de colores hardcodeados (fuera de tokens.css)

| fichero:línea | valor | rompe oscuro |
|---|---|---|
| `src/components/compose/composer.css:134` | `#000` en `mask-image` | no (es una máscara, no un color visible) |
| `src/components/settings/calendar.css:70` | `rgba(0,0,0,.18)`, `rgba(0,0,0,.06)` sombra del botón del interruptor | no (sombra negra vale en los dos) |
| `src/components/settings/settings.css:194` | `#f4efe6` (miniatura «Claro») | no, a propósito (la tarjeta enseña su tema) |
| `src/components/settings/settings.css:198` | `#121828` (miniatura «Oscuro») | no, a propósito |
| `src/components/settings/settings.css:215` | `rgba(27,37,64,.22)` líneas de la miniatura clara | no, a propósito |
| `src/components/settings/settings.css:219` | `rgba(236,228,212,.24)` líneas de la miniatura oscura | no, a propósito |
| `src/components/settings/settings.css:226` | `#1b2540` título de la miniatura clara | no, a propósito |
| `src/components/settings/settings.css:230` | `#ece4d4` título de la miniatura oscura | no, a propósito |
| `src/components/feedback/composeShot.ts:38` | `rgba(255,255,255,.8)` halo del trazo sobre la foto | no (va sobre la captura, no sobre la UI) |
| `src/components/feedback/FeedbackMode.tsx:51` | `'#8a5a2c'` reserva si no se lee `--accent` | no (solo si falla `getComputedStyle`) |
| `src/components/settings/CalendarExportSheet.tsx:90` | `'#8a5a2c'` color del calendario «Tasks» | **sí, parcial**: de noche es el coñac claro, no el camel (TR-24) |
| `src/lib/platform/calendarDemo.ts:123` | `'#8a5a2c'` ídem en el demo | solo `npm run dev` (TR-24) |
| `src/components/welcome/CalendarScene.tsx:26,28,40,42` | `#1a73e8`, `#34c759` calendarios de muestra | no (son colores de calendario; pasan por `.cal-tone`) |
| `src/lib/calendar.ts:58` | `#8c7b66` `FALLBACK_COLOR` | no (pasa por `.cal-tone`) |
| `src/lib/platform/calendarDemo.ts:17-24,58,66,70` | colores de calendarios demo, `#888888` | solo `npm run dev` |
| `src/lib/theme.ts:17` | `PAPER` `#f4efe6` / `#121828` | no (uno por tema, para `theme-color` y la barra de estado) |
| `index.html:7` | `theme-color #f4efe6` | no (`theme.ts:30` lo actualiza al arrancar) |
| `index.html:35-48` | `--boot-*` | no (definidos para los dos temas) |
| `src/styles/tokens.css:39,57-60` | `--flash: #fff`, `--lock-*` | no, a propósito (destello de iOS; pantalla de bloqueo siempre de noche) |

Comprobado además: `--emoji-tone` definido en los dos temas (`tokens.css:54,157`); sombras (`--shadow-*`) redefinidas de noche (`:147-150`); `--edge-light` (`:46,151`); mapa (`--map-*`, `:49-51,153-155`); velo de escribir con `color-mix` sobre `--bg` (`shell.css:52`); scrim `--scrim` 0,3 claro / 0,55 oscuro (`:37,145`, TR-12).

## Inventario de áreas de toque < 44 px

| selector | fichero:línea | tamaño | propuesta |
|---|---|---|---|
| `.section__icon` («…» de cada sección) | `section.css:117-118` | 32×32 (sin `::after`; el `--add` sí lo tiene en `:136-140`) | `position: relative` + `::after { inset: -6px }` → 44 |
| `.section__action` («Pasar a hoy») | `section.css:96` | 32 alto | `min-height: 36px` + `::after { inset: -4px 0 }` |
| `.agenda__today` («Hoy») | `agenda.css:62` | 30 alto | `min-height: 36px` + `::after { inset: -4px 0 }` |
| `.sheet__grab` (asa de los paneles) | `sheet.css:46,58` | 28 alto (12+4+12) | `padding: 16px 0` → 36; o `::after { inset: -8px 0 }` |
| `.composer__grab` (asa de la barra) | `composer.css:32` | 22 alto | `height: 30px; margin-bottom: -20px` + `::after { inset: -7px 0 0 }` |
| `.chip` (todas las píldoras de los paneles) | `sheet.css:109` | 38 alto | `min-height: 40px` y `gap: 10px` en `.sheet__chips` |
| `.chip__clear` (× del plazo) | `sheet.css:271-272` | 32×32 | `::after { inset: -6px }` |
| `.ruler__clear` (× de la duración) | `ruler.css:57-58` | 32×32 | `::after { inset: -6px }` |
| `.ruler__end` (hora de acabar) | `ruler.css:44` | 32 alto | `min-height: 36px` + `::after` |
| `.composer__send` | `composer.css:93-94` | 36×36 | `::after { inset: -4px }` |
| `.composer__mic` | `composer.css:293-294` | 40×40 | `::after { inset: -2px }` |
| `.composer__voice-btn` (×, ✓ del dictado) | `composer.css:332-333` | 36×36 | `::after { inset: -4px }` |
| `.composer__clear` | `composer.css:174-175` | 36×36 | `::after { inset: -4px }` |
| `.composer__more` («Detalles») | `composer.css:143` | 36 alto | `min-height: 40px` |
| `.composer__target` / `.composer__parsed` (destinos y píldora entendida) | `composer.css:214,249` | 36 alto | `min-height: 40px` (la fila `composer__foot` lo admite) |
| `.toast__action` («Deshacer», «Ver», «Sí») | `toast.css:34` | 36 alto | `min-height: 44px; margin: -4px 0` |
| `.sheet__hint` («Activar avisos…», «Elegir dónde está X») | `sheet.css:235` | 36 alto | `min-height: 44px` |
| `.routine-log__arrow` (flechas de Constancia) | `routines.css:360-361` | 44×36 | `height: 44px` |
| `.routine-history__cell` (días de Constancia) | `routines.css:398` | 40 alto × ~44 ancho | `height: 44px` |
| `.emoji-picker__cell` | `routines.css:233` | 38 (aspect 1, ~40 en 390 px) | `min-height: 42px` y `gap: 1px` |
| `.emoji-picker__other` | `routines.css:258` | 34 alto | `height: 40px` |
| `.days-picker__day` (L M X J V S D) | `routines.css:283-285` | ~40 en 375 px (aspect 1, `max-height: 46`) | `gap: 4px` → ~43; o `::after { inset: -3px }` |
| `.segmented__option` (Dictado: No enviar / Permitido) | `settings.css:135` | 40 alto | `min-height: 44px` |
| `.app__sizing` («Aa») | `shell.css:86-87` | 42×42 | `width/height: 44px` |
| `.map__expand.places__expand` (esquina del mapa de Lugares) | `places.css:458-459` | 32×32 | `::after { inset: -6px }` |
| `.pin` / `.pin__head` (chincheta del mapa) | `places.css:185-186` | 30×30 (+ etiqueta debajo) | `::after { inset: -7px }` en `.pin` |
| `.scene__note-send` (bienvenida, «Enviar») | `welcome.css:597-599` | 32 alto | `min-height: 40px` |
| `.scene__sheet .chip` (bienvenida, Detalles) | `welcome.css:456-458` | 34 alto | 38 como los de verdad |
| `.strip__day` en 320 px de ancho | `agenda.css:131-135` | 43 ancho × 46 alto | `padding: 0 6px` en `.strip__panel` bajo 330 px (TR-25) |

Ya resueltos con `::after` (bien): `.row__check` (`task.css:159-163`), `.tl__node` (`agenda.css:442-446`), `.allday__item` (`:673-677`), `.cal__handle` (`:264-268`), `.agenda__month` (`:30-34`), `.switch` (`calendar.css:51-55`), `.routines__time` (`routines.css:68-72`), `.section__icon--add` (`section.css:136-140`), `.fb-dock__close` (`feedback.css:89-93`), `.fb-thumb__remove` (`:348-352`). Con alto ≥ 44 de serie: `.tabs__tab` (58), `.group__row` (52), `.sheet__row` (50), `.sheet__primary` (50), `.inbox__fold`/`.inbox__clear`/`.view__add-section` (44), `.places__search` (52), `.place-card`, `.compose-head__fold` (44), `.welcome__back`/`.welcome__skip` (44), `.update__later` (44), `.fb-dock__mark` (48), `.scale__step` (48), `.slider__track` (44), `.ruler__track` (52), `.lock__ring` (56), `.scene__connect` (44), `.places__store` (44).

## Inventario de z-index

| componente | fichero:línea | valor |
|---|---|---|
| `#boot` (pantalla de arranque) | `index.html:58` | 100 |
| `.sheet.fb-sheet` (panel de la sugerencia) | `feedback.css:303` | 95 |
| `.fb-draw` (capa para rodear) | `feedback.css:123` | 90 |
| `.welcome` (bienvenida) | `welcome.css:6` | 80 |
| `.fb-dock` (tarjeta «Señalar») | `feedback.css:10` | 70 |
| `.sheet` (todos los paneles) | `sheet.css:5` | 60 |
| `.toast` | `toast.css:7` | 50 (**queda bajo `.sheet`: TR-03**) |
| `.app__bar` (barra de escribir + pestañas) | `shell.css:126` | 40 |
| `.dock` (muelle de días de la Bandeja, portal a `body`) | `inbox.css:26` | 40 |
| `.app__veil` (velo al escribir) | `shell.css:50` | 30 |
| `.app__sizing` («Aa») | `shell.css:82` | 20 (bajo el velo al escribir: correcto) |
| `.app__views::before` (papel bajo la barra de estado) | `shell.css:24` | 10 |
| Locales (dentro de su contenedor): `.composer__grab` 1 (`composer.css:29`), `.tl__node` 1 (`agenda.css:411`), `.tl__now-dot` 1 (`:566`), `.map__pin` 1 (`places.css:164`), `.places__expand` 2 (`:235`), `.places__search` 2 (`:261`), `.fb-draw` internos 1-3 (`feedback.css:149,169,188,208,226`), `::view-transition-new` 1 (`base.css:124`) | | |

Escala coherente (10 → 100 en saltos de 10) y sin solapes raros salvo el toast. `FeedbackDock` (70) por encima de los paneles es intencionado (se rodea también dentro de uno). `.dock` y `.app__bar` comparten 40 pero no se solapan (el muelle sube 6 px por encima de la barra).

## Lo que está bien

- **Paridad es/en al 100 %**: las 67 tablas tienen exactamente las mismas claves en los dos idiomas (comprobado con script); las 16 llamadas `pick({ es, en })` sueltas también. Un solo literal fuera de tabla (TR-04).
- **Tipografía de los textos**: ningún `...` (todo `…`); apóstrofos curvos en todo el inglés (`don’t`, `couldn’t`, `What’s`; los rectos solo en las expresiones regulares de `parseEn.ts`, que es lo correcto); comillas «» en español y “” en inglés; español con solo la primera mayúscula en botones; inglés en *sentence case* coherente (las únicas mayúsculas internas son nombres de Apple: «Home Screen», «Lock Screen», «On My iPhone», «App Store»).
- **Botones de solo icono**: los 21 que no tienen texto visible llevan `aria-label` (Composer ×/✓/enviar/mic/quitar/Detalles, plegar la ficha, cerrar la tarjeta de sugerencias, quitar captura, mapa del lugar, esquina del mapa, + de rutinas, sello del emoji, + y «…» de sección, × de duración, flechas de Constancia, «+N» de todo el día, asa del mes, atrás de la bienvenida, mes de la Agenda). Los iconos SVG llevan `aria-hidden` y `focusable="false"` de serie (`Icons.tsx:15-16`).
- **Semántica ARIA**: `role="slider"` con `aria-valuemin/max/now/text` y teclado en la regla (`DurationPicker.tsx:194-209`), el deslizador (`Slider.tsx:77-92`) y el mando de importancia (`ImportanceKnob.tsx:105-119`); `role="radio"`/`radiogroup` en apariencia, idioma, dictado, calendario de exportación y pestañas de la guía; `aria-pressed`, `aria-expanded`, `aria-current="page"/"date"`, `aria-haspopup`; `role="switch"`; `aria-modal` en paneles y bienvenida; botones `sr-only` «Mover «X»» para arrastrar con teclado (`TaskShell.tsx:92`, `SectionBlock.tsx:92`); anuncios de dnd-kit (`accessibility={{ announcements }}`); los días de Constancia distinguen clic de teclado/VoiceOver del gesto (`RoutineLog.tsx:212-223`).
- **Avisos en vivo**: el toast es `role="status"` (`Toast.tsx:43`), la barra de dictado también (`Composer.tsx:275`), el error de la sugerencia es `role="alert"` (`FeedbackSheet.tsx:109`), la nota de la lámina de sugerencias `aria-live="polite"`.
- **Bienvenida**: `inert` en la app de debajo (`App.tsx:407`), foco al abrir (`Welcome.tsx:174`), Escape, `role="dialog"`.
- **Idioma del documento**: `document.documentElement.lang` se actualiza al cambiar (`LanguageProvider.tsx:29`); el selector marca cada opción con su `lang` (`LanguagePicker.tsx:49`); Siri y los widgets siguen el idioma de la app.
- **Movimiento reducido**: regla global que anula animaciones y transiciones (`base.css:101-109`), más comprobaciones en JS para lo que no es CSS (`flip.ts:49`, `theme.ts:73`, `transition.ts:10`, `welcome/motion.ts:3`) y medias específicas en 9 ficheros que además enseñan el resultado final (la vuelta de muestra ya dibujada, el dedo oculto).
- **Inputs a 16 px**: regla global (`base.css:44`) y explícita donde hace falta (`places.css:31`, `feedback.css:396`); el título del panel a 22/26 px. iOS no hace zoom.
- **Contraste de los tokens** (calculado): claro, tinta 13,2:1, secundario 6,5:1, terciario 4,65:1 (4,3 sobre `--bg-elev-2`, solo para iconos), coñac 5,1:1, ladrillo 5,9:1, acción del toast 7,5:1; oscuro, tinta 14:1, secundario 8,3:1, terciario 5,7:1, camel 9,2:1, terracota 8,6:1, acción del toast 5,4:1. Todos por encima de 4,5:1 donde hay texto. El oro (2,4:1 en claro) solo se usa en filetes, como dice CLAUDE.md. Lo que no cumple es lo atenuado con `opacity` (TR-15).
- **Zonas seguras y teclado**: todo lo fijo respeta `--safe-t` / `--safe-b` (barra, dock, toast, muelle, tarjeta y barra de sugerencias, bienvenida, cabeceras, esqueleto, `#boot`) y `--kb` donde hay teclado (barra, scroll, paneles y su pie, toast).
- **Modo oscuro**: todos los tokens redefinidos, incluidas sombras, canto de los paneles, mapa dibujado, tono de los emojis y `color-scheme`; `theme-color` y la barra de estado nativa siguen al tema; `#boot` ya sale en su tema antes del JS (`index.html:16-26`). Las miniaturas de Apariencia son el único sitio con colores fijos, y a propósito.
- **Errores**: de los 49 `catch`, los que afectan a algo que el usuario pidió avisan con toast o texto en el panel (dictado, lugares, mapa, avisos web, exportar/importar, sugerencias, calendario «Tasks»); los silenciosos son de cosas accesorias con reintento (widget, bandeja de Siri, captura de puntero, `showPicker`, aviso de versión, tema en `localStorage`). Quedan tres que sí deberían hablar: la persistencia (TR-01), la programación de avisos (TR-06) y la exportación al calendario (TR-18).
