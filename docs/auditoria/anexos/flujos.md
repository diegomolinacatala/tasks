# Flujos y conexiones

Auditoría de los flujos que cruzan pantallas (rama `capacitor`, 12/10/2026). Cada flujo se ha seguido por el código desde el toque hasta lo que ve el usuario; las rutas son relativas a `src/` salvo que se diga otra cosa.

## Resumen (5 líneas)

1. La columna vertebral está bien resuelta: casi todo lo destructivo tiene "Deshacer" en un toast (borrar tarea, borrar rutina, borrar las N hechas, pasar a hoy, mover de día, convertir en rutina), lo que viene de fuera (Siri, widget, avisos) es idempotente y los enlaces del widget acaban en la pestaña que toca.
2. El fallo más grave es de **datos**: *Importar copia* sustituye todo el estado nada más elegir el fichero, sin confirmar ni poder deshacer (`SettingsView.tsx:137-145`); *Borrar todo* confirma pero tampoco se deshace.
3. El segundo es **estructural**: los toasts (`z-index: 50`) quedan detrás de cualquier panel (`z-index: 60`), así que el "Deshacer" de *Convertir en rutina* es inalcanzable y los errores que salen dentro de un panel ("Esa hora ya ha pasado", "Sin permiso de ubicación", "Ya hay un lugar llamado…") no se ven nunca.
4. Hay **callejones silenciosos**: tocar un aviso (o un enlace del widget) de una tarea que ya no existe no hace nada; una rutina nueva con 50 ya existentes o un lugar nuevo con 50 se pierden al cerrar el panel sin un solo mensaje; los atajos de aviso siguen saliendo con 20 avisos y no hacen nada.
5. Lo demás es fricción: "Ver" no despliega una sección plegada, lo apuntado con Siri con la app abierta entra sin aviso, cerrar el panel de una rutina o un lugar nuevos los crea aunque se quisiera cancelar, un texto de sección está en español en la interfaz inglesa, y el micrófono de la PWA sin instalar manda a un sitio equivocado.

## Hallazgos

### FL-01 · Importar copia sustituye todo sin confirmar ni deshacer · [CRÍTICO]
- **Flujo**: Ajustes → Datos → *Importar copia* → se abre el selector de ficheros → se toca un `.json` → la app entera cambia al momento.
- **Dónde**: `components/settings/SettingsView.tsx:137-145` (`importBackup` → `dispatch({ type: 'state/import' })` sin paso intermedio), `:206-216` (el `<input type="file">` dispara la importación en `onChange`); `state/reducer.ts:416-427` (`state/import` devuelve el estado de la copia entero).
- **Qué pasa**: con un toque sobre un fichero se pierden todas las tareas, rutinas, secciones y lugares actuales. El único aviso es una nota gris al pie del grupo ("Importar sustituye lo que haya ahora", `:40`). El toast "Copia importada." no ofrece volver atrás. Quien quería *juntar* la copia de la PWA con lo del iPhone, o quien elige por error una copia vieja, se queda sin lo reciente y sin remedio (no hay otra copia salvo que exportara antes).
- **Qué debería pasar**: la importación tiene que ser reversible o, como mínimo, confirmarse diciendo qué se va a perder.
- **Propuesta** (las dos, son baratas):
  1. Guardar el estado anterior en un `useRef` y que el toast sea `Copia importada: 42 tareas, 3 rutinas · Deshacer` / `Backup imported: 42 tasks, 3 routines · Undo`, con `onAction: () => dispatch({ type: 'state/import', state: previous })` (así conserva también los ajustes del dispositivo).
  2. Antes de despachar, si el estado actual tiene algo (`state.tasks.length || state.routines.length`), un `Sheet` pequeño: *«Sustituir lo que hay por la copia del 3 oct (30 tareas, 2 rutinas)? Lo de ahora (42 tareas) se pierde.»* con **Sustituir** y **Cancelar** / *"Replace what's here with the backup from Oct 3 (30 tasks, 2 routines)? What's here now (42 tasks) will be lost."* **Replace** / **Cancel**. El `exportedAt` del fichero (`lib/backup.ts:166`) da la fecha.
- **Esfuerzo**: S (toast con deshacer) / M (con hoja de confirmación).

### FL-02 · Los toasts quedan detrás de los paneles · [ALTO]
- **Flujo**: cualquier toast que salga mientras hay un `Sheet` abierto. Casos concretos:
  - Panel de la tarea → *Convertir en rutina*: se abre el panel de la rutina y a la vez sale el toast "Rutina: X · Deshacer" (`App.tsx:287-303`).
  - Dictar "al pasar por Mercadona…" (lugar nuevo): se abre el editor del lugar (`compose/useAddTasks.ts:22-23`) y sale el toast con "Deshacer" (`App.tsx:322-334`).
  - Dentro del panel de la tarea o de la ficha: *Otra…* con una hora pasada → "Esa hora ya ha pasado." (`task/ReminderPicker.tsx:77-80`).
  - Panel del lugar: "Sin permiso de ubicación. · Ajustes" (`places/PlaceSheet.tsx:169-173`), "No se ha podido abrir el mapa." (`:203`), "Ya hay un lugar llamado X." al cerrar (`:143`, aquí el panel ya baja: se ve a medias), "«x» ya lo usa Y." (`places/PlaceAliases.tsx:54`).
  - Ajustes → *Añadir mis tareas*: "No se pudo crear el calendario «Tasks»." (`settings/CalendarExportSheet.tsx:64`).
  - Un aviso tocado con un panel abierto: "¿Has acabado X?" / "Hecha: X · Deshacer" (`push/useNotificationActions.ts:89-123`).
- **Dónde**: `components/ui/toast.css:7` (`z-index: 50`, posicionado en el borde inferior) frente a `components/ui/sheet.css:5` (`.sheet { z-index: 60 }`) y `:12-19` (el velo cubre toda la pantalla). El panel sube pegado abajo, justo donde vive el toast.
- **Qué pasa**: el toast queda bajo el velo y, casi siempre, tapado del todo por el panel. En *Convertir en rutina* el "Deshacer" existe pero no se puede tocar; los mensajes de error dentro de un panel no se ven nunca (el usuario toca *Usar mi ubicación actual*, no pasa nada y no sabe por qué).
- **Qué debería pasar**: el toast siempre encima de lo que haya, también de un panel; o, para los errores de dentro de un panel, un mensaje en el propio panel.
- **Propuesta**: subir `.toast` a `z-index: 65` (entre el panel y la bienvenida, que va a 80) y, con un panel abierto, anclarlo arriba (`top: calc(var(--safe-t) + 12px)` cuando `document.body.style.overflow === 'hidden'` o con una clase `has-sheet` en `<html>` que ponga el `Sheet` al abrirse). Para los errores de `PlaceSheet` y `ReminderPicker`, además una línea `sheet__note` en rojo bajo el control, como ya hace `search.failed` (`PlaceSheet.tsx:294`).
- **Esfuerzo**: S (z-index y anclaje) / M (mensajes en el panel).

### FL-03 · Tocar un aviso de una tarea que ya no existe no hace nada · [ALTO]
- **Flujo**: llega el aviso de "Llamar a Ana" → el usuario la tacha o la borra desde la app → el aviso sigue en el centro de notificaciones (solo se cancelan los *pendientes*, `lib/platform/notifications.ts:69-74`) → horas después lo toca. Lo mismo con el enlace `task/<id>` del widget si la foto es anterior al borrado, y con `?task=<id>` en la PWA.
- **Dónde**: `push/useNotificationActions.ts:125-138`: `found` queda vacío y ninguna rama se cumple; no hay `else`. Con la tarea hecha: `complete` (`:89-90`) y `askAgain` (`:120-121`) devuelven sin más. Para el widget, `App.tsx:361` → `openTask(id)` → `TaskSheet.tsx:50-75`: `task` es `null`, `shown` sigue `null`, no se pinta nada.
- **Qué pasa**: la app se abre (o ya estaba abierta) y no ocurre nada. El usuario no sabe si la tarea se borró, se hizo o si el toque falló. En el caso "hecha", tocar un aviso con `?ask=1` tampoco responde.
- **Qué debería pasar**: una línea que cierre el asunto.
- **Propuesta**: al final de `useNotificationOpen(...)` en `useNotificationActions.ts:138`, si `taskIds.length && !found.length` → `toast({ message: pick(TEXT).gone })` con `gone: 'Esa tarea ya no está.'` / `'That task is gone.'`; si `found.length === 1 && first.done` y la acción es `open`/`done`/`again` → `toast({ message: text.alreadyDone(first.title) })` con `'Ya estaba hecha: X'` / `'Already done: X'`. En `App.tsx` `onOpenTask` del widget: comprobar `state.tasks.some(...)` antes de `openTask` y usar el mismo toast.
- **Esfuerzo**: S.

### FL-04 · Rutina nueva desde su panel con 50 rutinas: se pierde en silencio · [ALTO]
- **Flujo**: Bandeja → Rutinas → **+** → se escribe "Estirar" → **Añadir rutina** (o cerrar el panel).
- **Dónde**: `routines/RoutineSheet.tsx:145-152`: `close` despacha `routine/add` y hace `haptic('success')` sin mirar el tope; `state/reducer.ts:313`: con `state.routines.length >= MAX_ROUTINES` devuelve `state` sin más. El tope sí se comprueba en la barra, la ficha y *Convertir en rutina* (`App.tsx:265-269`, `roomForRoutine`), pero el panel no pasa por ahí.
- **Qué pasa**: vibración de éxito, el panel baja y no aparece ninguna rutina. El botón **+** sigue saliendo (`routines/RoutinesBlock.tsx:68`).
- **Qué debería pasar**: lo mismo que en la barra: "Ya hay 50 rutinas: borra alguna para añadir otra." y que lo escrito no se pierda.
- **Propuesta**: en `RoutineSheet.close`, si `routineId === ''` y `state.routines.length >= MAX_ROUTINES`, `toast({ message: copy.limit(MAX_ROUTINES) })` (el mismo texto de `App.tsx:93/104`) y **no** cerrar el panel (el usuario puede volver atrás con el nombre puesto). Además, en `RoutinesBlock`, ocultar el **+** al llegar al tope. Nota: el toast saldría detrás del panel (FL-02); con el panel abierto conviene pintarlo como `sheet__note` bajo el botón.
- **Esfuerzo**: S.

### FL-05 · "Suelta una tarea aquí" sin traducir · [MEDIO]
- **Flujo**: Agenda en inglés → una sección sin tareas ese día.
- **Dónde**: `components/section/SectionBlock.tsx:96`: `empty="Suelta una tarea aquí"` es un literal fuera de `COPY`.
- **Qué pasa**: la interfaz en inglés enseña una frase en español en cada sección vacía (y se ven todas las secciones todos los días, `AgendaView.tsx:314-335`).
- **Qué debería pasar**: texto en el idioma de la app.
- **Propuesta**: añadir a `COPY` `empty: 'Suelta una tarea aquí'` / `'Drop a task here'` y usar `copy.empty`.
- **Esfuerzo**: S.

### FL-06 · Borrar una sección: sin confirmación ni deshacer · [MEDIO]
- **Flujo**: Agenda → ⋯ de una sección → **Borrar sección**.
- **Dónde**: `components/section/SectionSheet.tsx:68-78`: `dispatch({ type: 'section/remove' })` y `onClose()` en el mismo toque; `state/reducer.ts:250-258`: las tareas de la sección (de **todos** los días) pasan a la raíz de su día.
- **Qué pasa**: la sección desaparece y, por ejemplo, las 30 tareas de "Compra" repartidas en varias semanas quedan sueltas en la raíz de cada día. No hay confirmación (el botón está en rojo y la nota lo explica, pero está a un toque) ni toast con "Deshacer". Volver a crearla no recupera la agrupación.
- **Qué debería pasar**: como borrar una tarea o una rutina: toast con "Deshacer".
- **Propuesta**: acción `section/restore { section, taskIds }` (vuelve a meter la sección con su `order` y pone `sectionId` a esas tareas, con `moveTask`), y en `SectionSheet` `toast({ message: copy.removed, actionLabel: copy.undo, onAction })` con `removed: 'Sección borrada'` / `'Section deleted'`. Capturar antes los ids: `state.tasks.filter(t => t.sectionId === section.id).map(t => t.id)`.
- **Esfuerzo**: M.

### FL-07 · Deshacer "Convertir en rutina" deja abierto el panel de una rutina que ya no existe · [MEDIO]
- **Flujo**: panel de la tarea → *Convertir en rutina* → (si se alcanza el toast, ver FL-02) *Deshacer*.
- **Dónde**: `App.tsx:287-303`: `makeRoutine` abre el panel (`openRoutine(id)`) y el deshacer solo hace `routine/remove` + `task/restore`; `routines/RoutineSheet.tsx:91-92`: `routine` pasa a `null` pero `routineId` sigue puesto y `open={routineId !== null}`.
- **Qué pasa**: el panel se queda abierto con el nombre y los días de la rutina borrada, sin *Constancia* ni *Borrar rutina*; tocar los días o la hora despacha `routine/update` sobre un id inexistente (no hace nada) y el usuario no entiende qué está editando.
- **Qué debería pasar**: al deshacer, el panel se cierra (y, si acaso, vuelve a abrirse la tarea).
- **Propuesta**: en el `onAction` de `makeRoutine`, antes de los dos `dispatch`, `setRoutineId(null)` y `openTask(task.id)` (así el usuario vuelve a donde estaba). En `RoutineSheet`, además, si `shownId && !routine && !isNew` → `onClose()` en un efecto, como red.
- **Esfuerzo**: S.

### FL-08 · La ficha con una sección plegada: la tarea cae donde no se ve; "Ver" no despliega ni hace scroll · [MEDIO]
- **Flujo**: Agenda → barra → *Detalles* → **Sección: Compra** (plegada) → **Añadir a hoy**. Variante: desde la Bandeja, elegir Hoy + sección Compra → toast "→ Hoy · Ver".
- **Dónde**: `App.tsx:306-319`: `here = draft.date === day` → sin toast cuando es el día que se mira; el "Ver" solo hace `setDay` + `go` (`:314-317`). `AgendaView.tsx:325-329`: solo el **+** de la sección la despliega. `SectionBlock.tsx:95` oculta la columna si `section.collapsed`.
- **Qué pasa**: la barra se vacía, no sale nada en pantalla ni ningún aviso; la tarea está dentro de la sección plegada (solo cambia el número de pendientes de su cabecera). Con "Ver" desde otra pestaña pasa lo mismo, y si el día tiene muchas tareas la nueva (al final de su lista) queda fuera de la pantalla.
- **Qué debería pasar**: lo recién añadido se ve siempre.
- **Propuesta**: en `addTask`, si `draft.sectionId` apunta a una sección con `collapsed`, despachar `section/toggle` antes de `addTasks` (como hace el **+**). Para "Ver": tras `go`, hacer scroll a la fila (`lib/flip.ts` ya localiza filas por `data-flip={task.id}`: un `scrollIntoView({ block: 'center' })` en un `requestAnimationFrame`). Si se prefiere no desplegar, al menos un toast: `Comprar pan → Compra (plegada)` / `Buy bread → Groceries (collapsed)`.
- **Esfuerzo**: S (desplegar) / M (scroll).

### FL-09 · Rutina creada desde la Agenda: sin deshacer · [MEDIO]
- **Flujo**: en la Agenda se escribe o dicta "tomar creatina todos los días a las 10".
- **Dónde**: `App.tsx:272-284`: `actionLabel: tab === 'inbox' ? copy.undo : copy.view`, `onAction` solo `go('inbox')` fuera de la Bandeja.
- **Qué pasa**: en la Bandeja el toast ofrece "Deshacer"; en la Agenda ofrece "Ver" y la única forma de arrepentirse es ir a la Bandeja, encontrar la rutina y borrarla. Dictado un lunes a las 9 con prisa ("gimnasio los lunes" entendido como rutina cuando era una tarea), es dos pantallas de más.
- **Qué debería pasar**: siempre deshacer; "Ver" es secundario (la rutina no está en la Agenda, pero el toast ya dice que es una rutina).
- **Propuesta**: `actionLabel: copy.undo`, `onAction: () => dispatch({ type: 'routine/remove', id })` en los dos casos. Si se quiere conservar "Ver", el toast admite una sola acción: deshacer vale más.
- **Esfuerzo**: S.

### FL-10 · Enlaces del widget y acceso rápido con un panel abierto · [MEDIO]
- **Flujo**: la app está en segundo plano con el panel de una tarea (o el de una rutina, un lugar, la ficha del compositor) abierto → toca el **+** del widget (`://compose`) o el acceso rápido "Nueva tarea", o `://today`, `://routines`, `://task/<id>`.
- **Dónde**: `App.tsx:349-365` (`useNativeActions`): ninguno de los manejadores cierra `taskId`, `sectionId`, `routineId` ni `placeId`. `compose` → `setFocusRequest` → `Composer.tsx:138-142` → `input.focus()` debajo del panel modal (`sheet.css:2-9`, `aria-modal`, sin trampa de foco).
- **Qué pasa**: con `compose`, el teclado sube y la barra se activa **detrás** del panel (el velo lo tapa): lo escrito va a ciegas o el usuario cree que no ha pasado nada. Con `today`/`routines`/`backlog` la pestaña cambia detrás del panel; con `task/<id>` el panel cambia de tarea sin aviso (eso sí es correcto).
- **Qué debería pasar**: un enlace que trae a la app deja la pantalla en el estado que promete: paneles cerrados y, si es `compose`, la barra visible y con el foco.
- **Propuesta**: en `App.tsx` una `closeSheets = () => { setTaskId(null); setSectionId(null); setRoutineId(null); setPlaceId(null) }` y llamarla al principio de `onCompose`, `onToday`, `onWeek`, `onRoutines`, `onBacklog` (en `onOpenTask` no hace falta). En `onCompose`, hacer el `setFocusRequest` tras un `requestAnimationFrame` para que el panel ya no esté.
- **Esfuerzo**: S.

### FL-11 · Siri y Atajos con la app abierta: entran sin aviso; un lugar nuevo queda sin ubicación sin que nada lo diga · [MEDIO]
- **Flujo**: app abierta en la Bandeja → "Oye Siri, apunta en Tasks: llamar a Ana mañana a las 5" (o el atajo con el iPhone en la mano). Variante: "…al llegar a Decathlon" con Decathlon sin guardar.
- **Dónde**: `ios/App/App/QuickAdd.swift:218-223` (`notifyWeb` → acción `inbox`) → `App.tsx:362` → `INBOX_EVENT` → `shell/NativeInbox.tsx:22-43` → `applyInbox(...).actions.forEach(dispatch)` sin ningún `toast`. El lugar nuevo nace con `place/add` sin ubicación (`lib/inbox.ts:170-173`); la web solo abre el editor cuando la tarea viene del compositor o del dictado de la app (`useAddTasks.ts:22-23`), no de la bandeja.
- **Qué pasa**: Siri ya ha dicho "Apuntada…", así que el alta no es un misterio; pero si el usuario está mirando otro día nada cambia en pantalla y no hay "Ver". Con un lugar nuevo, Siri dice "Abre Tasks para decir dónde está Decathlon" (`lib/headless.ts:65`), el usuario abre Tasks… y no hay nada que le lleve al lugar: tiene que ir a Lugares y ver la tarjeta "Sin ubicación: toca para elegirla". El aviso por lugar no sonará mientras tanto.
- **Qué debería pasar**: al aplicar entradas con la app delante, el mismo toast que al dictar dentro de la app ("Llamar a Ana · Mañana 17:00 · Ver"); y si una entrada trae lugares sin ubicación, ofrecer ponerla.
- **Propuesta**: que `NativeInbox` reciba un `onApplied(entries)` (o despache un evento) y `App` haga, si `document.visibilityState === 'visible'`: para una tarea, `toast({ message: \`${title} → ${relativeLabel(date) ?? copy.inbox}\`, actionLabel: copy.view, onAction })`; para `entry.places.length`, `toast({ message: pick({ es: \`¿Dónde está ${name}?\`, en: \`Where is ${name}?\` }), actionLabel: pick({ es: 'Elegir', en: 'Choose' }), onAction: () => openPlace({ placeId }) })`. Y al **arrancar** con entradas aplicadas en `loadState` que traigan lugares sin ubicación, el mismo toast (hoy `withInbox` en `lib/persistence.ts:31-47` no deja rastro).
- **Esfuerzo**: M.

### FL-12 · El micrófono en la PWA sin instalar manda a un sitio equivocado · [MEDIO]
- **Flujo**: Safari de iPhone, la web sin añadir a la pantalla de inicio → se toca el micrófono de la barra.
- **Dónde**: `compose/useVoice.ts:197-204`: con `push.canTranscribe` falso y sin Web Speech, el toast es `unavailable` solo para `unconfigured`/`unsupported`; para `needs-install` (y `off`, `denied`) sale "Activa los avisos en Ajustes para dictar tareas.". En Ajustes, con `needs-install`, lo que hay es la nota "En iPhone: Compartir → Añadir a pantalla de inicio…" (`settings/NotificationsBlock.tsx:65-67`), sin ningún botón de activar.
- **Qué pasa**: el usuario va a Ajustes a "activar avisos" y no encuentra cómo; el motivo real (instalar la app) solo lo descubre si lee la nota. Con `denied` en la PWA pasa parecido: Ajustes solo dice "Bloqueados…".
- **Qué debería pasar**: el toast dice lo que hay que hacer de verdad.
- **Propuesta**: en `start`, distinguir por `push.status`: `needs-install` → `'Para dictar, añade Tasks a la pantalla de inicio (Compartir → Añadir a pantalla de inicio).'` / `'To dictate, add Tasks to your Home Screen (Share → Add to Home Screen).'`; `denied` → `'Los avisos están bloqueados en el sistema: el dictado los necesita.'` / `'Reminders are blocked in the system settings: dictation needs them.'`; `off` → el texto actual. Mejor aún: el micrófono con `needs-install` podría no salir.
- **Esfuerzo**: S.

### FL-13 · Tope de 20 avisos por tarea: los atajos siguen saliendo y no hacen nada · [MEDIO]
- **Flujo**: panel de la tarea → *Recordatorios* → *+ Añadir* → tocar un atajo con 20 avisos ya puestos.
- **Dónde**: `lib/reminders.ts:55-59` (`withReminder` devuelve la tarea sin cambios) y `lib/details.ts:98-103` (ídem en la ficha); `task/ReminderPicker.tsx:126-150` no mira `MAX_REMINDERS` (no aparece en ningún componente): *+ Añadir*, los atajos y *Otra…* salen igual.
- **Qué pasa**: el chip se toca, se cierra la fila de atajos y no aparece ningún aviso nuevo. Sin mensaje. Es raro llegar a 20, pero posponer varias veces ("+10 min") va sumando `at` (los pasados se descartan al posponer, `reminders.ts:62-65`, así que en la práctica cuesta; con avisos manuales sí se llega).
- **Qué debería pasar**: al tope, no ofrecer más y decir por qué.
- **Propuesta**: en `ReminderPicker`, `const full = task.reminders.length >= MAX_REMINDERS`; con `full`, no pintar *+ Añadir* y poner `<p className="sheet__note">` `'Como mucho 20 avisos por tarea.'` / `'Up to 20 reminders per task.'`.
- **Esfuerzo**: S.

### FL-14 · Tope de 50 lugares: el panel se cierra sin crear nada; al dictar un lugar nuevo se abre un panel vacío · [MEDIO]
- **Flujo**: Lugares → buscador → nombre → cerrar, con 50 lugares. Variante: dictar "comprar pilas al pasar por Leroy" con 50 lugares.
- **Dónde**: `places/PlaceSheet.tsx:149-155` despacha `place/add` y cierra; `state/reducer.ts:274` ignora la acción al llegar a `MAX_PLACES`. Dictado: `lib/inbox.ts:172` (`place/add` ignorado) → `:182` (el aviso de lugar se descarta porque el lugar no existe) → `useAddTasks.ts:22-23` abre `openPlace({ placeId: firstNew.id })` con un id que no existe → `PlaceSheet.tsx:110,126-129`: `place` es `null` y `request.name` no viene, así que se pinta un panel de "Nuevo lugar" con el nombre vacío.
- **Qué pasa**: en el primer caso, nada aparece y nadie lo explica. En el segundo, la tarea se crea **sin** el aviso de lugar y encima sube un panel vacío que no viene a cuento; si el usuario le pone nombre y cierra, tampoco se crea (tope).
- **Qué debería pasar**: decir que hay 50 lugares y no abrir paneles huérfanos.
- **Propuesta**: en `PlaceSheet.close`, si es nuevo y `state.places.length >= MAX_PLACES`, nota en el panel `'Ya hay 50 lugares: borra alguno para añadir otro.'` / `'You already have 50 places: delete one to add another.'` y no cerrar. En `useAddTasks`, comprobar `state.places.length < MAX_PLACES` antes de `openPlace`, y si no cabe, `toast` con el mismo texto (así el usuario entiende por qué la tarea no lleva el pin). En `PlaceSheet`, si `request.placeId` no existe, cerrar en vez de pintar uno nuevo.
- **Esfuerzo**: S.

### FL-15 · Panel de rutina nueva y de lugar nuevo: cerrarlo crea igual, no hay forma de cancelar · [MEDIO]
- **Flujo**: Bandeja → **+** rutinas → se escribe "Estirar" → el usuario se arrepiente y baja el panel por el asa (o toca fuera, o Escape). Igual con Lugares → buscador → "Dentista" → fuera.
- **Dónde**: `routines/RoutineSheet.tsx:145-152` (`close` crea si `routineId === ''` y hay título; `Sheet` usa el mismo `close` para el asa, el velo y Escape, `ui/Sheet.tsx:59-71,110-128,130-141`); `places/PlaceSheet.tsx:137-158` (igual, y además reutiliza un lugar existente por nombre).
- **Qué pasa**: el gesto universal de "cancelar" (bajar el panel) **confirma**. El panel de rutina tiene un botón explícito **Añadir rutina** (`:254-258`), lo que hace esperar que bajar el panel sea lo contrario. Luego hay que borrar la rutina (con deshacer, al menos) o el lugar (con doble toque).
- **Qué debería pasar**: en un panel de "nuevo", bajar el panel descarta; el botón grande crea. Para una rutina/lugar existente, lo de ahora (guardar al cerrar) está bien.
- **Propuesta**: en `RoutineSheet`, que `close` (asa/velo/Escape) solo cree cuando no es nuevo; el botón **Añadir rutina** llama a una `create()` aparte. Si se teme perder lo escrito sin querer, un toast al descartar: `'Rutina descartada · Deshacer'` / `'Routine discarded · Undo'` que la cree. Lo mismo en `PlaceSheet` con un botón **Guardar lugar** en el pie (`footer` del `Sheet`) para los nuevos.
- **Esfuerzo**: M.

### FL-16 · "Borrar todo": confirma, pero no se puede deshacer · [MEDIO]
- **Flujo**: Ajustes → *Borrar todo* → (4 s) *Toca otra vez para borrarlo todo* → toque.
- **Dónde**: `settings/SettingsView.tsx:147-156`; `state/reducer.ts:430-440`.
- **Qué pasa**: el doble toque protege del dedo torpe, pero no del "creía que era otra cosa": el toast "Todo borrado." es definitivo. En el iPhone además se cancelan los avisos y se borran los eventos del calendario «Tasks» al momento (`CalendarExportSync`), y el fichero de estado se reescribe en 250 ms.
- **Qué debería pasar**: lo mismo que FL-01: ventana para volver atrás.
- **Propuesta**: guardar `state` en un ref antes de `state/clear` y `toast({ message: copy.cleared, actionLabel: copy.undo, onAction: () => dispatch({ type: 'state/import', state: previous }) })`. Quizá alargar la vida de ese toast (hoy 4,2 s, `ui/Toast.tsx:5`) con un `durationMs` opcional.
- **Esfuerzo**: S.

### FL-17 · El resumen diario tocado sin botón, y "Pasar atrasadas a hoy" desde otra pestaña, no llevan a hoy · [MEDIO]
- **Flujo**: 8:30, llega "3 tareas para hoy · 2 atrasadas" → se toca (sin botón) con la app en la Bandeja o mirando el jueves que viene. Variante: botón *Pasar atrasadas a hoy* con la app en la Bandeja.
- **Dónde**: `push/useNotificationActions.ts:125-138`: sin `taskIds` y sin `placeId`, solo `action === 'today'` hace algo (`moveToToday`), y nada cambia de pestaña ni de día. `App.tsx:255-262` no pasa `go`/`setDay` al hook.
- **Qué pasa**: con el toque simple, la app se abre (o se trae) y se queda donde estaba: nada dice "aquí tienes tu día". Con el botón, el toast "2 tareas pasadas a hoy · Deshacer" sale, pero el usuario sigue viendo la Bandeja o el jueves, sin las tareas delante.
- **Qué debería pasar**: el resumen del día lleva a hoy en la Agenda; pasar a hoy, también.
- **Propuesta**: añadir `onOpenToday: () => { setDay(today); go('agenda') }` a los handlers del hook y llamarlo (a) cuando `!taskIds.length && !placeId && !routine` con acción `open`, y (b) tras `moveToToday` cuando `!taskIds.length` (el resumen). Mantener el toast con Deshacer.
- **Esfuerzo**: S.

### FL-18 · Mover una tarea con plazo fuera del plazo: el toast no dice que pierde el plazo · [BAJO]
- **Flujo**: "Informe · Hasta el viernes" → se arrastra a la tira, al lunes siguiente.
- **Dónde**: `views/AgendaView.tsx:102-112` (toast `X → lun 20 oct`); `lib/order.ts:73` (`cleanUntil` lo quita si no acaba después del día nuevo). Deshacer sí lo devuelve (`:110`, `until: task.until`).
- **Qué pasa**: la tarea pasa a ser solo del lunes y la fila deja de decir "Hasta el…"; el usuario quizá pensaba "la aparco al lunes y sigue valiendo toda esa semana".
- **Propuesta**: si `task.until && date > task.until`, mensaje `X → lun 20 oct (sin plazo)` / `X → Mon, Oct 20 (no time frame)`.
- **Esfuerzo**: S.

### FL-19 · "Sin fecha" conserva hora y duración ocultas · [BAJO]
- **Flujo**: "Reunión 17:00–18:00" → panel → *Sin fecha* → días después se arrastra desde la Bandeja al martes.
- **Dónde**: `state/reducer.ts:180-192` y `lib/order.ts:64-74`: `task/move` cambia `date`, `until` y `sectionId`; `time`, `duration` y los avisos `before` se quedan (inactivos: `ReminderPicker.tsx:95-98` los pinta atenuados).
- **Qué pasa**: en la Bandeja la fila no enseña hora (`TaskRow.tsx:35`, `timeRange` exige fecha). Al volver a darle día, reaparecen las 17:00, la duración, el aviso "a la hora" y la pregunta de cierre, sin que nadie lo haya pedido. Según el caso es un regalo o una sorpresa.
- **Propuesta**: dejarlo así pero decirlo: en el toast de `InboxView.schedule` (`:81-89`), si `task.time`, `X → Martes 17:00`; y en el panel, con fecha `null` y `time`, una nota `'Tiene hora (17:00): vuelve con el día.'` / `'Has a time (5:00 PM): it comes back with the day.'`.
- **Esfuerzo**: S.

### FL-20 · Un id de tarea inexistente se queda guardado y el panel se abre solo más tarde · [BAJO]
- **Flujo**: FL-03 (aviso o enlace de una tarea borrada) → luego *Deshacer* de ese borrado en la lista.
- **Dónde**: `App.tsx:232-235,256-259` guardan `taskId` sin comprobar; `task/TaskSheet.tsx:55-63`: cuando `task` deja de ser `null`, el efecto abre el panel.
- **Qué pasa**: al restaurar la tarea (o al crear otra con el mismo id vía bandeja), el panel de esa tarea sube sin que se haya tocado nada.
- **Propuesta**: con FL-03, no guardar el id si no existe; o en `TaskSheet`, un efecto que haga `onClose()` cuando `taskId && !task`.
- **Esfuerzo**: S.

### FL-21 · "+10 min" en el aviso de una tarea ya hecha · [BAJO]
- **Flujo**: Android/escritorio (o iOS con mantener pulsado): la tarea se hizo desde la app; su aviso sigue en el centro de notificaciones → botón *+10 min*.
- **Dónde**: `push/useNotificationActions.ts:101-107`: `snooze` no mira `task.done`; `lib/reminders.ts:62-65` añade un `at`.
- **Qué pasa**: toast "Aviso: Hoy 9:40" para una tarea hecha; el aviso no sonará (`isPending` lo excluye), pero el recordatorio queda en el panel de la tarea.
- **Propuesta**: en `snooze`, `if (task.done) return toast({ message: text.alreadyDone(task.title) })` (ver FL-03).
- **Esfuerzo**: S.

### FL-22 · Las filas memorizadas no cambian a medianoche · [BAJO]
- **Flujo**: la app abierta de 23:50 a 0:10 en la Agenda con "Informe · Hasta el jueves" (hoy jueves ya).
- **Dónde**: `task/TaskRow.tsx:37-39` y `views/Timeline.tsx:145-148` calculan `periodTag`/`reminding` con `todayIso()` en el render; `task/TaskShell.tsx:42` y `views/Timeline.tsx:138` están `memo`izados y sus props no cambian con la fecha (`AgendaView.tsx:170-183` pasa la misma `task`).
- **Qué pasa**: `useToday` (`hooks/useToday.ts`) sí cambia y mueve `day` a hoy, pero la fila sigue diciendo "Hasta el jueves" en vez de "Último día", y la campana de "próximo aviso" puede quedarse. Se arregla con cualquier toque o al cambiar de día.
- **Propuesta**: pasar `today` como prop a `SortableTask`/`TaskShell`/`TimelineTask` (ya lo tienen a mano en `AgendaView`), o leer un contexto `TodayContext` desde `TaskRow`.
- **Esfuerzo**: S.

### FL-23 · Ajustes → *Programados* no dice cuándo iOS se ha quedado sin hueco · [BAJO]
- **Flujo**: muchas rutinas con hora y tareas con avisos; Ajustes → Avisos → "Programados 64".
- **Dónde**: `settings/NotificationsBlock.tsx:57-59` cuenta `nativePlan(...).timed` (ya recortado a 64 menos regiones, `lib/nativeSchedule.ts:112-114`); `fitSchedule` deja fuera lo más lejano y, con `ROUTINE_SHARE`, hasta dos tercios de las rutinas.
- **Qué pasa**: el número sale redondo y el usuario no sabe que el aviso del próximo martes no está programado hasta que vuelva a abrir la app.
- **Propuesta**: comparar con `upcomingSchedule(state, now).length` y enseñar `64 de 80 · el resto, al abrir la app` / `64 of 80 · the rest when you open the app` con una nota corta.
- **Esfuerzo**: S.

### FL-24 · En la PWA, los avisos de lugar de una copia importada parecen activos · [BAJO]
- **Flujo**: exportar desde el iPhone → importar en la PWA → abrir una tarea con "Al llegar a Casa".
- **Dónde**: `task/ReminderPicker.tsx:95-98`: para `place`, `isActive` solo mira `done` y que el lugar tenga `location`; no mira `isNative`. `TaskRow.tsx:40` pinta el pin igual.
- **Qué pasa**: el chip sale en color de activo aunque en la web nunca sonará; la pestaña Lugares sí explica que es cosa del iPhone.
- **Propuesta**: `isActive` para `place`: `isNative && …`, y los chips atenuados en la PWA.
- **Esfuerzo**: S.

### FL-25 · "+ Nueva" sección en la ficha del compositor se queda aunque se quite la ficha · [BAJO]
- **Flujo**: barra → *Detalles* → *Sección* → *+ Nueva* "Regalos" → × de la barra (o vaciar el texto).
- **Dónde**: `task/fields.tsx:154-160`: `create` despacha `section/add` al momento; `Composer.tsx:245-250` (`clearDetails`) no deshace nada.
- **Qué pasa**: queda una sección vacía "Regalos" en todos los días. Es coherente con el panel de la tarea (allí la sección también se crea al vuelo), pero en la ficha el usuario aún no ha añadido nada.
- **Propuesta**: aceptar como está (es un caso raro) o, en `clearDetails`, si `details.sectionId` apunta a una sección creada en esta ficha y sin tareas, `section/remove`.
- **Esfuerzo**: S.

### FL-26 · Cambiar de idioma con texto en la barra · [BAJO]
- **Flujo**: Agenda, barra con "comprar pan mañana" → Ajustes → English → volver a la Agenda.
- **Dónde**: `Composer.tsx:127-128`: `routine`/`parsed` memorizados por `[value, ready, places]`, no por el idioma; la Agenda se conserva con `<Activity>` (`App.tsx:390-402`), así que el estado de la barra sobrevive.
- **Qué pasa**: la píldora sigue diciendo "Mañana" y el texto entendido se queda en español hasta teclear algo.
- **Propuesta**: añadir `language` (de `useLanguage()`) a las dependencias de esos dos `useMemo`.
- **Esfuerzo**: S.

### FL-27 · "No añadirlas" borra también los eventos editados a mano · [BAJO]
- **Flujo**: Ajustes → Calendario → *Añadir mis tareas* → «Tasks» → el usuario añade notas o invitados a algún evento en Calendario → vuelve y elige *No añadirlas*.
- **Dónde**: `settings/CalendarExportSheet.tsx:52-55` despacha al momento; `calendar/CalendarExportSync.tsx:22-35` manda la lista vacía 800 ms después; `ios/App/App/CalendarExport.swift:81-87` borra todo lo enlazado.
- **Qué pasa**: coherente con lo documentado, pero sin aviso. Elegir otro calendario también mueve (borra y crea) los eventos.
- **Propuesta**: nota en el panel bajo *No añadirlas*: `'Quita de tu calendario los eventos que había añadido.'` / `'Removes the events it had added from your calendar.'`.
- **Esfuerzo**: S.

### FL-28 · Panel de una tarea con plazo: "Cuándo" enseña el primer día, no el día en que se ve · [BAJO]
- **Flujo**: "Informe · Esta semana" creada el lunes; el miércoles se abre desde la Agenda (donde sale en hoy).
- **Dónde**: `task/TaskSheet.tsx:121-127`: `date={shown.date}` (el lunes) y `until`; la fila la pinta en hoy por `shownDay` (`lib/period.ts:29-33`).
- **Qué pasa**: la píldora *Otro día* dice "lun 13 oct" mientras la tarea está en el miércoles; "Hasta el domingo" sí sale. Correcto pero desconcertante.
- **Propuesta**: en `WhenField`, con plazo y pendiente, enseñar `Del 13 al 19 oct` como píldora única (ya existe `periodLabel`) en lugar de "Otro día" + "Hasta…".
- **Esfuerzo**: S.

### FL-29 · Cambiar la hora de inicio del día de las rutinas, de madrugada · [BAJO]
- **Flujo**: 01:00, el usuario tacha "Estirar" (cuenta para hoy, 00:00) y después pone *Se renuevan a las* 04:00.
- **Dónde**: `routines/RoutinesBlock.tsx:92-99` → `settings/dayStart`; `hooks/useToday.ts:30` recalcula `routineDay` → pasa a ser **ayer**.
- **Qué pasa**: la rutina aparece sin tachar (lo tachado quedó en la fecha de hoy, que ahora es "mañana" para las rutinas) y el 2/3 de la cabecera baja. Nada se pierde, pero parece que se ha deshecho.
- **Propuesta**: aceptar; o al cambiar `dayStart`, si `routineDay` retrocede un día, mover las marcas de "hoy" a "ayer" para las rutinas tachadas en las últimas horas. No merece la complejidad: dejarlo documentado.
- **Esfuerzo**: — (o M).

### FL-30 · Dictar una rutina con 50 ya: lo dictado se pierde · [BAJO]
- **Flujo**: micrófono → "estirar todos los días" con 50 rutinas.
- **Dónde**: `App.tsx:338-344`: `addRoutine` devuelve `false` (toast del tope) y `addFromVoice` no hace nada más; la barra se vacía al terminar el dictado.
- **Qué pasa**: sale "Ya hay 50 rutinas…" y la frase no queda en ningún sitio. Al escribirla sí se conserva (`Composer.tsx:203-206`).
- **Propuesta**: si `addRoutine` devuelve `false` en `addFromVoice`, crear la tarea con `addSpoken([parseSpoken(text, …)])` (una tarea de hoy "Estirar") para que no se pierda lo dicho.
- **Esfuerzo**: S.

### FL-31 · Títulos recortados a 500 caracteres en silencio · [BAJO]
- **Dónde**: `state/reducer.ts:41-43` (`clean` → `slice(0, 500)`); la barra no tiene `maxLength`.
- **Qué pasa**: algo pegado largo se corta sin aviso. Raro.
- **Propuesta**: `maxLength={500}` en `Composer.tsx:317-331` y en los `textarea` de título.
- **Esfuerzo**: S.

## Tabla de deshacer/confirmar

| Acción | Dónde | Confirma antes | Deshacer después | Veredicto |
|---|---|---|---|---|
| Completar / desmarcar tarea | fila, panel, horario, widget | No | No (tocar otra vez) | OK |
| Completar desde aviso (*Hecha*, *Sí, hecha*, "Sí") | `useNotificationActions.ts:89-99` | No | Toast *Deshacer* | OK (FL-02 si hay panel) |
| Borrar tarea (deslizar, panel) | `useTaskActions.ts:48-62` | No | Toast *Deshacer* (`task/restore`) | OK |
| Borrar las N hechas (Bandeja) | `InboxView.tsx:108-116` | No | Toast *Deshacer* (todas) | OK |
| Borrar sección con tareas | `SectionSheet.tsx:68-78` | No (botón rojo) | No | REVISAR (FL-06) |
| Borrar lugar con avisos | `PlaceSheet.tsx:209-219` | Doble toque (4 s) | No | OK (confirma; enseña "Avisos aquí") |
| Borrar rutina (deslizar, panel) | `useTaskActions.ts:109-123` | No | Toast *Deshacer* (con diario) | OK |
| Pasar a hoy (bloque, día pasado, aviso, Siri) | `useTaskActions.ts:68-91`, `inbox.ts:199-202` | No | Toast *Deshacer* (día, sección, puesto y plazo) | OK |
| Mover a otro día (tira, mes, muelle) | `AgendaView.tsx:102-112`, `InboxView.tsx:81-89` | No | Toast *Deshacer* | OK (FL-18) |
| Mover a *Sin fecha* (panel) | `TaskSheet.tsx:91-93` | No | No (panel abierto; pierde sección) | OK-ish (FL-19) |
| Reordenar / cambiar de sección arrastrando | `useDayBoard.ts:91-109` | No | No | OK |
| Convertir en rutina | `App.tsx:287-303` | No | Toast *Deshacer* (inalcanzable) | REVISAR (FL-02, FL-07) |
| Quitar plazo (×) | `fields.tsx:94-108` | No | No (un toque para reponerlo) | OK |
| Quitar un aviso (chip ×) | `ReminderPicker.tsx:109-124` | No | No | OK |
| Quitar un otro nombre | `PlaceAliases.tsx:67-78` | No | No (se guarda al cerrar) | OK |
| Cambiar días / hora de una rutina | `RoutineSheet.tsx:115-122` | No | No (reversible a mano; el diario no se toca) | OK |
| Corregir el historial de una rutina | `RoutineLog.tsx:84-88` | No | No (tocar otra vez) | OK |
| Importar copia | `SettingsView.tsx:137-145` | No | No | **REVISAR (FL-01)** |
| Borrar todo | `SettingsView.tsx:147-156` | Doble toque (4 s) | No | REVISAR (FL-16) |
| Cambiar idioma / apariencia | Ajustes | No | Reversible | OK |
| Retirar permiso del dictado | `DictationBlock.tsx` | No | Reversible | OK |
| Apagar "En la Agenda" (calendario) | `CalendarBlock.tsx:134-141` | No | Reversible (no toca el export) | OK |
| "No añadirlas" / cambiar calendario de export | `CalendarExportSheet.tsx:52-55` | No | Reversible (recrea; pierde ediciones a mano) | OK-ish (FL-27) |
| Posponer desde aviso | `useNotificationActions.ts:101-107` | No | No (se quita en el panel) | OK (FL-21) |
| Dictado → tarea(s) | `App.tsx:322-334` | No | Toast *Deshacer* (no borra el lugar nuevo) | OK |
| Rutina desde barra/dictado | `App.tsx:272-284` | No | Solo en la Bandeja | REVISAR (FL-09) |

## Tabla de flujos seguidos

| # | Flujo | Resultado | Veredicto |
|---|---|---|---|
| 1a | Barra en Agenda, día elegido, texto sin fecha | `literalDraft(target)` → `task/add` en ese día; sin toast (está a la vista) | OK |
| 1b | Barra en Bandeja, texto sin fecha | `date: null` → Bandeja, sin toast | OK |
| 1c | Destino *Mañana* / *Sin fecha* / `<otro día>` | `chosen` → `targetItem.date`; toast "X → Mañana · Ver" si no es lo que se mira; *Ver* cambia pestaña y día | OK (no despliega ni hace scroll: FL-08) |
| 1d | **+** de una sección (plegada o no) | la despliega, foco en el mismo toque, destino = sección; sin toast | OK |
| 1e | Ficha con sección e importancia | `toTaskDraft` → `task/add` con `sectionId`/`importance`; sección plegada → invisible | REVISAR (FL-08) |
| 1f | Texto con fecha/hora/plazo ("mañana a las 5", "esta semana") | `parseTask` manda; toast con `relativeLabel`/`periodLabel` + *Ver* | OK |
| 1g | Dictado (IA o local) | `addSpoken`: toast "X · Mañana 17:00 · Deshacer"; lugar nuevo abre su editor (toast detrás) | OK (FL-02) |
| 1h | Siri / bandeja nativa con la app cerrada | `loadState` → `withInbox` antes de pintar; Siri lo dice; sin rastro en la app | OK-ish (FL-11) |
| 1i | Siri con la app abierta | `inbox` → `NativeInbox.pull` → aparece sin toast | REVISAR (FL-11) |
| 1j | `compose` (widget, acceso rápido) | Agenda (o Bandeja con `/inbox`) + foco; con panel abierto, foco detrás | REVISAR (FL-10) |
| 2a | `?task=<id>` existente, sin acción (PWA y nativo) | `TaskSheet` con *Posponer* arriba y chip *Hecha* | OK |
| 2b | `?task=<id>` borrada / hecha | nada (ni toast) | **REVISAR (FL-03)** |
| 2c | `?action=done` / `snooze` / `again` | tacha con *Deshacer* / "Aviso: …" / "Vuelvo a preguntar a las…" | OK (FL-21) |
| 2d | `?action=today` del resumen diario | `toToday()` con *Deshacer*; no cambia de pestaña | OK-ish (FL-17) |
| 2e | `?ask=1` | toast "¿Has acabado X? · Sí" | OK |
| 2f | Resumen diario tocado sin botón | abre la app, nada más | REVISAR (FL-17) |
| 2g | Aviso de rutina (*Hecha* / toque) | nativo: `WidgetStore.setRoutine` + `widget` → `routine/set`; toque: Bandeja + "¿Hecha: X? · Sí" | OK |
| 2h | Aviso de lugar con varias tareas | `PlaceTasksSheet`; con una → panel de la tarea; con ninguna viva → nada | OK (FL-03) |
| 3 | Inventario de deshacer | ver tabla | 4 por revisar |
| 4a | Crear sección (Agenda *+ Sección*, *+ Nueva* en paneles) | `section/add` global; vale para todos los días | OK |
| 4b | Renombrar | `onBlur` → `section/rename` | OK |
| 4c | Plegar | `section/toggle` persistido (global, no por día) | OK |
| 4d | Borrar con tareas | a la raíz de su día; sin deshacer | REVISAR (FL-06) |
| 4e | Tarea a *Sin fecha* pierde sección | `sectionFor(null, …)` → `null`; `task/add`/`board/commit` igual | OK (coherente) |
| 4f | Sección vacía en un día | se ve con "Suelta una tarea aquí" (en español siempre) | REVISAR (FL-05) |
| 4g | **+** con la sección plegada | se despliega antes de enfocar | OK |
| 5a | "esta semana" → días siguientes → último día → pasado | `shownDay` la lleva a hoy; "Último día"; luego `Atrasadas` por `lastDay` | OK |
| 5b | Pasar a hoy una con plazo acabado → deshacer | pierde el plazo; `Placement.until` lo devuelve | OK |
| 5c | Mover dentro / fuera del plazo (tira, arrastre) | dentro lo conserva; fuera lo quita (toast no lo dice) | OK (FL-18) |
| 5d | Plazo u hora en la Bandeja | no ofrecido (`WhenField` exige fecha); lo escrito con plazo va a la Agenda con toast | OK |
| 6a | Rutina desde barra / ficha / tarea / panel | `routine/add`; tope comprobado salvo en el panel | REVISAR (FL-04) |
| 6b | Tachar / destachar hoy | `routine/toggle`; widget y avisos al día | OK |
| 6c | Borrar | toast *Deshacer* con el diario intacto | OK |
| 6d | Cambiar días | racha recalculada; marcas de días que ya no tocan se ignoran | OK |
| 6e | `dayStart` | `routineDay` en Bandeja, avisos y widget; horario sigue el calendario | OK (FL-29) |
| 7a | "al pasar por Mercadona" en PWA / nativo | PWA literal; nativo crea el lugar y abre su editor buscando el nombre | OK |
| 7b | Borrar lugar con tareas | doble toque; quita sus avisos; tareas quedan | OK |
| 7c | Renombrar lugar | `place/update`; alias se conservan; las frases casan por nombre actual; avisos por id | OK |
| 7d | Lugar nuevo con 50 | panel huérfano / nada | REVISAR (FL-14) |
| 8a | Exportar | `tasks-AAAA-MM-DD.json`; web descarga; iPhone hoja de compartir (cancelar no es error) | OK |
| 8b | Importar inválido / otra versión | toast con el motivo; `normalizeState` migra lo antiguo | OK |
| 8c | Importar válido | sustituye todo, conserva dictado/tema/idioma/calendario/bienvenida; sin confirmar | **REVISAR (FL-01)** |
| 8d | Borrar todo | doble toque; conserva tema/idioma/calendario/bienvenida; pierde el permiso del dictado (vuelve a preguntar) | OK-ish (FL-16) |
| 9a | Cambiar idioma con barra/panel abiertos | no se puede (Ajustes no tiene barra; los paneles son modales); texto restante en la barra no se reinterpreta | OK (FL-26) |
| 9b | Cambiar tema con panel abierto | no se puede (modal) | OK |
| 9c | Medianoche con la app abierta | `useToday` cada 60 s: `day`→hoy si se miraba hoy, tira, Atrasadas, rutinas (`useRoutineDay`), resumen re-sincronizado | OK (FL-22 en filas memoizadas) |
| 9d | Volver de segundo plano | hoy, "ahora", bandeja de Siri, widget, calendario, permiso de avisos, plan de avisos, versión nueva: todo se refresca en `visibilitychange` | OK |
| 10 | Controles de la PWA que no funcionan | Lugares (explicado + App Store); dictado sin API (toast "no disponible"); dictado sin instalar (toast equivocado); Sugerir (oculto); avisos de lugar en panel (ocultos; importados parecen activos); Calendario (oculto); Actualizar (oculto) | OK salvo FL-12, FL-24 |
| 11 | `today`, `compose`, `compose/inbox`, `routines`, `backlog`, `task/<id>`, `open` | pestaña correcta; no cierran paneles; tarea inexistente → nada | REVISAR (FL-10, FL-03) |
| 12 | Topes | 20 avisos: silencio (FL-13); 50 rutinas: toast salvo panel (FL-04); 50 lugares: silencio (FL-14); 8 alias: el + desaparece (OK); 40 widget: "+N" (OK); 64 iOS: recorte silencioso (FL-23); 400 días: celdas y flechas deshabilitadas (OK); 200 bandeja: Siri lo dice (OK); 500 caracteres: recorte (FL-31) | mixto |

## Lo que está bien

- **Deshacer donde más duele**: borrar tarea/rutina (con diario), borrar las N hechas, pasar a hoy (devuelve día, sección, puesto y plazo con `placementsOf`), mover de día desde la tira o el muelle, y lo dictado. Todo con un solo toast y 4 s.
- **Idempotencia de lo externo**: la bandeja de Siri se aplica por id y no duplica aunque se relea (`inbox.ts:177`, `entryInState`); lo marcado en el widget se concilia con `widgetToggles`/`routineSettles` (solo lo que de verdad cambia); el "Hecha" del aviso de una rutina va por el mismo camino que el widget y llega a la app abierta por `WIDGET_EVENT`.
- **Lo que se crea se ve o se dice adónde fue**: la barra avisa con "X → Mañana · Ver" cuando la tarea cae fuera de lo que se mira (`App.tsx:306-319`), con el plazo entero si lo hay; el **+** de una sección plegada la despliega antes de enfocar.
- **Avisos coherentes en los dos lados**: un recordatorio tocado abre la tarea con *Posponer* y *Hecha* a mano; los botones aplican y confirman con deshacer; el aviso de cierre repite la pregunta en un toast de un toque; en el iPhone, *Sí, hecha* y *Todavía no* se resuelven sin abrir la app y la web lo recoge después con la misma lógica (`answerAsk` ↔ `applyInbox`).
- **Plazos sin reescribir nada**: `shownDay`/`lastDay` hacen que una tarea "esta semana" vaya con hoy en la Agenda, el widget, el resumen y los avisos sin tocar el estado; "Último día" y el paso a atrasada salen solos.
- **Secciones**: las tareas huérfanas de una sección borrada vuelven a la raíz de su día (y `task/add` con una sección ya borrada cae en la raíz); una tarea sin fecha nunca lleva sección, en todos los caminos (`sectionFor`).
- **Lugares**: nombre único por `placeKey` con artículo fuera, alias que no chocan, coincidencia tolerante en lo dictado, y el panel reutiliza un lugar que ya exista con ese nombre en vez de duplicarlo. Borrar un lugar enseña antes "Avisos aquí".
- **Importar sanea y migra** (`normalizeState`): ids repetidos, secciones y lugares inexistentes, versiones anteriores sin `until`, `duration`, `routines`, `emoji`, `language`… y conserva lo que es del dispositivo (dictado, tema, idioma, calendario, bienvenida).
- **Contexto que cambia solo**: medianoche y volver de segundo plano refrescan hoy, "ahora", la bandeja de Siri, el widget, el calendario, el permiso de avisos y el plan; el día elegido salta a hoy solo si se estaba mirando hoy.
- **La PWA esconde lo que no puede hacer** (Sugerir, Calendario, Actualizar, avisos de lugar en el panel, Valorar) y explica Lugares con un enlace a la App Store.
- **Los enlaces del widget** (`today`, `compose`, `compose/inbox`, `routines`, `backlog`, `task/<id>`) y los accesos rápidos llegan aunque la web aún no escuche (`retainUntilConsumed`, `NativeActions`) y acaban en la pestaña que prometen.
- **Los topes que sí se dicen**: 50 rutinas desde la barra, la ficha y *Convertir en rutina* (y la ficha no se cierra); 8 otros nombres (el + se va); la bandeja llena (Siri: "Abre Tasks para seguir apuntando").
