# Agenda y Bandeja

Auditoría de experiencia (no de código) de las pestañas **Agenda** y **Bandeja** y de la barra de pestañas, rama `capacitor` (12/10/2026). Leído entero `CLAUDE.md`, `src/App.tsx`, `src/components/views/*`, `src/components/section/*`, `src/components/shell/TabBar.tsx` + `shell.css`, `RoutinesBlock.tsx`, y `lib/compose.ts`, `order.ts`, `period.ts`, `timeline.ts`, `date.ts`, más `state/selectors.ts`, `state/reducer.ts`, `useTaskActions.ts`, `dnd/*`, `Composer.tsx` y los CSS implicados. Varios puntos se comprobaron además en `npm run dev` con los datos de ejemplo (390 × 844, español): se indica «comprobado» donde aplica.

## Resumen (lo que más chirría)

1. **Borrar una sección no pide confirmación ni se puede deshacer**, y una sección es global: desaparece de todos los días y sus tareas se dispersan en la raíz de cada uno. Es la única acción destructiva de la app sin «Deshacer».
2. **Las secciones vacías se repiten en cada día** con «Suelta una tarea aquí» (además en español también en inglés): un usuario con cuatro secciones ve cuatro bloques vacíos cada día.
3. **El bloque «Sin hora» miente cuando la raíz está vacía pero las secciones no** («Nada sin hora.» encima de una sección con tareas) y **un día pasado con pendientes con hora** no las enseña en rojo, no ofrece «Pasar a hoy» y dice «11 h 30 libres» de un día que ya pasó.
4. **El + de una sección deja un placeholder («Añadir a Compra») que no cambia al elegir otro destino**, y una rutina creada desde la Agenda no se puede deshacer desde el toast (solo «Ver»).
5. Varios toques por debajo de 44 px donde más se toca (cabeceras de sección, «Pasar a hoy», ⋯, «Hoy»), el asa del mes casi invisible y dos gestos clave (mantener pulsado para arrastrar al muelle o a la tira) sin ninguna pista.

## Hallazgos

### AG-01 · Borrar sección: sin confirmación ni deshacer · [CRÍTICO]
- **Dónde**: Agenda › Sección › ⋯ › «Borrar sección» (`src/components/section/SectionSheet.tsx:68-78`; `src/state/reducer.ts:250-258`).
- **Qué ve/hace el usuario**: en el panel «Editar sección», justo debajo del nombre, una fila en ladrillo «Borrar sección». Un toque la borra y cierra el panel. No hay toast ni «Deshacer».
- **Problema**: `confirmation-dialogs` / `undo-support`. Las secciones son globales (CLAUDE.md «Decisiones cerradas»): la sección desaparece de **todos** los días y cada tarea cae a la raíz de su día (`moveTask … sectionId: null`). Rehacerlo exige crear la sección y abrir cada tarea. Toda otra acción destructiva (borrar tarea, rutina, «Borrar las N hechas») tiene «Deshacer»; esta es la excepción. La nota del panel («vuelven a la lista principal del día», en singular) ni siquiera avisa de que afecta a todos los días.
- **Propuesta**: (a) toast «Sección borrada» · **Deshacer** que restaure la sección con su `id` y `order` y devuelva sus tareas (`placementsOf` de las huérfanas antes de borrar + `tasks/place`); (b) si la sección tiene tareas pendientes en cualquier día, que la fila diga cuántas: «Borrar sección · 7 tareas» y pida un segundo toque («¿Borrar Trabajo? Sus 7 tareas se quedan, sin sección» · **Borrar** / Cancelar); (c) nota en plural: es «Las tareas de la sección pasan a la lista principal de **cada** día.» / «The section’s tasks go back to each day’s main list.»
- **Esfuerzo**: M

### AG-02 · «Suelta una tarea aquí» solo existe en español · [ALTO]
- **Dónde**: Agenda › cualquier sección vacía (`src/components/section/SectionBlock.tsx:96`).
- **Qué ve/hace el usuario**: con la app en inglés, cada sección vacía dice «Suelta una tarea aquí».
- **Problema**: `i18n`. El texto está pegado en el JSX, fuera de la tabla `COPY` del propio componente (líneas 24-35).
- **Propuesta**: llevarlo a `COPY` (`empty: 'Suelta una tarea aquí'` / `'Drop a task here'`). Ver AG-04 para cuándo enseñarlo.
- **Esfuerzo**: S

### AG-03 · «Sin hora» dice «Nada sin hora.» con tareas sin hora debajo · [ALTO]
- **Dónde**: Agenda › bloque Sin hora › lista raíz (`src/components/views/AgendaView.tsx:310`, con `free`/`timedTasks` en 166-167).
- **Qué ve/hace el usuario**: un día cuya raíz está vacía pero con tareas en una sección: cabecera «Sin hora 2», debajo en cursiva «Nada sin hora.» (o «Todo tiene hora.» si hay algo en el horario) y, un poco más abajo, la sección «Trabajo 2» con las dos tareas. Hoy sin raíz pero con secciones: «Día libre.» encima de una sección con pendientes.
- **Problema**: `empty-states` contradictorio. El vacío de la columna raíz se calcula con `dayTasks`, no con lo que hay en la raíz frente a las secciones.
- **Propuesta**: el texto vacío de la raíz solo cuando **todo el bloque** está vacío (`untimedCount === 0`); si hay secciones con tareas, la raíz vacía no pinta nada (sigue siendo zona de soltar por `.column.is-over`). Mantener «Todo tiene hora.» solo si `timedTasks && untimedCount === 0`.
- **Esfuerzo**: S

### AG-04 · Todas las secciones salen cada día, también vacías · [ALTO]
- **Dónde**: Agenda › Sin hora › secciones (`src/components/views/AgendaView.tsx:314-335`; `src/components/section/SectionBlock.tsx:95-99`; `section.css:159-166`).
- **Qué ve/hace el usuario**: con cuatro secciones (Trabajo, Compra, Casa, Llamadas) y un martes con una sola tarea, el día enseña cuatro cabeceras y cuatro «Suelta una tarea aquí» (comprobado: «COMPRA / Suelta una tarea aquí» en hoy sin tareas de Compra). En un día futuro sin tareas sin hora el bloque ni aparece, así que ni se pueden usar.
- **Problema**: `progressive-disclosure`. Lo vacío pesa tanto como lo lleno; el aviso de soltar se lee aunque no se arrastre nada.
- **Propuesta**: (a) sección vacía = solo su cabecera (nombre + «+»), sin la línea vacía; la frase «Suelta una tarea aquí» solo mientras se arrastra (`.view.is-dragging`, que ya existe en `task.css:28`); (b) en días que no son hoy, las secciones vacías plegadas en una sola línea discreta «3 secciones vacías» (o nada), que se abre al tocarla y siempre durante un arrastre; (c) conservar el «+» de cada sección como vía de alta.
- **Esfuerzo**: M

### AG-05 · Día pasado: lo pendiente con hora ni es rojo ni se puede pasar a hoy, y sobra el «tiempo libre» · [ALTO]
- **Dónde**: Agenda › día anterior (`src/components/views/AgendaView.tsx:166-168, 178, 297-309`; `src/components/views/Timeline.tsx:138-199`; `src/lib/timeline.ts:55-80`).
- **Qué ve/hace el usuario**: comprobado con «Llamar al fontanero», jue 8 oct 11:00, pendiente: el día enseña «Horario 1», la tarea en tinta normal (no ladrillo), «1 h libre» y «11 h 30 libres», y **ningún** «Pasar a hoy», porque el bloque «Sin hora» solo se pinta si hay tareas sin hora (`showUntimed`). En cambio una tarea sin hora de ese día sí sale en rojo y con «Pasar a hoy».
- **Problema**: `consistency` / `primary-action`. La misma situación (pendiente de un día pasado) se enseña de dos formas, y la acción principal depende de si la tarea tenía hora. Un hueco libre de un día que ya pasó no informa de nada.
- **Propuesta**: (a) `TimelineTask` recibe `overdue` (como `SortableTask`) y pinta título y hora en `--danger` cuando `day < today && !done`; (b) el «Pasar a hoy» de un día pasado va en la cabecera del día (p. ej. junto al botón «Hoy» del kicker: «Pasar 2 a hoy») y no en la de «Sin hora»; (c) `buildTimeline` sin filas `gap` cuando `past` (pasar `past` o `now === null && day < today`).
- **Esfuerzo**: M

### AG-06 · El placeholder «Añadir a Compra» no cambia al elegir otro destino · [ALTO]
- **Dónde**: Agenda › sección › «+» › barra de escribir (`src/App.tsx:446` y `372-376`; `src/components/compose/Composer.tsx:115-116, 267-271, 387-400`).
- **Qué ve/hace el usuario**: comprobado: toco el «+» de Compra, la barra dice «Añadir a Compra» y la píldora COMPRA va elegida. Toco «Hoy»: la píldora cambia, pero la barra sigue diciendo «Añadir a Compra». Lo que escriba va a la raíz de hoy, no a Compra.
- **Problema**: `feedback` / estado doble: el placeholder sale de `composeSection` (App) y el destino de `chosen` (Composer).
- **Propuesta**: que el placeholder lo calcule `Composer` a partir de `targetItem` (`addLabel(targetItem.date, today, targetItem.sectionId ? label : undefined)`), o que `choose()` avise a App (`onTarget`) para limpiar `composeSection`. Lo mismo para la píldora del aviso «adónde ha ido».
- **Esfuerzo**: S

### AG-07 · Rutina creada desde la Agenda: «Ver» en vez de «Deshacer» · [ALTO]
- **Dónde**: Agenda › barra › «tomar creatina todos los días a las 10» (`src/App.tsx:272-284`).
- **Qué ve/hace el usuario**: en la Bandeja el toast «Rutina: 💊 Tomar creatina · Cada día · 10:00» ofrece **Deshacer**; en la Agenda ofrece **Ver**, que cambia a la Bandeja. Si el analizador leyó mal («los lunes» cuando quería «el lunes»), desde la Agenda no hay vuelta atrás rápida: ir a la Bandeja, buscar la rutina y deslizarla.
- **Problema**: `undo-support` incoherente entre pestañas; además la rutina con hora ya aparece en el Horario de hoy, así que «Ver» ni siquiera hace falta.
- **Propuesta**: siempre **Deshacer** (`routine/remove`). Si se quiere conservar «Ver», que el toast lleve las dos (el `Toast` solo admite una acción: priorizar Deshacer).
- **Esfuerzo**: S

### AG-08 · Toques de 32 px en cabeceras: plegar, «Pasar a hoy», ⋯ y «+» de rutinas · [MEDIO]
- **Dónde**: `src/components/section/section.css:21-30` (`.section__toggle` 32 px), `94-106` (`.section__action` 32 px), `113-127` (`.section__icon` 32 × 32); usados en `SectionBlock.tsx:72-91`, `BlockHeader.tsx:31`, `AgendaView.tsx:267-269, 304-306`, `RoutinesBlock.tsx:68-70`.
- **Qué ve/hace el usuario**: la cabecera de una sección mide 48 px pero el botón que pliega solo 32; «Pasar a hoy» y «⋯» igual. El «+» de sección sí crece a 44 (`::after`, 131-140), el ⋯ de al lado no.
- **Problema**: `touch-target-size` (< 44 px) en los controles de más uso de la Agenda.
- **Propuesta**: `.section__toggle { min-height: 44px; margin: -6px 0 }` (o llevar el `padding` de `.section__head` al botón); `::after { inset: -6px 0 }` en `.section__action` y `.section__icon` como ya hace `.section__icon--add`.
- **Esfuerzo**: S

### AG-09 · Botón «Hoy» de la cabecera: 30 px de alto · [MEDIO]
- **Dónde**: Agenda › kicker (`src/components/views/agenda.css:60-71`; `AgendaView.tsx:209-213`).
- **Qué ve/hace el usuario**: al mirar otro día, una píldora «Hoy» pequeña arriba a la derecha.
- **Problema**: `touch-target-size`; es el camino de vuelta más usado tras deslizar semanas.
- **Propuesta**: `position: relative` + `::after { inset: -7px -6px }` como `.agenda__month::after`.
- **Esfuerzo**: S

### AG-10 · El asa del mes casi no se ve · [MEDIO]
- **Dónde**: Agenda › bajo la tira (`src/components/views/agenda.css:255-285`; `WeekStrip.tsx:409-418`).
- **Qué ve/hace el usuario**: una raya de 34 × 4 px en `--line-2` (20 % de opacidad) bajo los días; solo pasa a oro cuando el mes ya está abierto. De las tres formas de desplegar, la única con pista explícita es la flecha de 13 px del mes.
- **Problema**: `affordance`. Un asa que no se ve no invita a tirar; en la captura de hoy pasa desapercibida junto al filete de avance (otra raya, justo debajo).
- **Propuesta**: asa en `--gold-dim` siempre (y `--gold` abierta), o un pelín más larga (44 px); y que la flecha del mes anime un «rebote» la primera vez que se abre la Agenda tras instalar. Alternativa más radical: quitar el asa (menos controles) y dejar tirar de la tira + la flecha del mes.
- **Esfuerzo**: S

### AG-11 · Pasar de mes cambia el día elegido sin tocarlo · [MEDIO]
- **Dónde**: Agenda › mes desplegado › deslizar (`src/components/views/WeekStrip.tsx:238-245`).
- **Qué ve/hace el usuario**: abre el mes para «echar un vistazo» a noviembre, desliza, y el día elegido pasa a ser el 12 de noviembre: la cabecera dice «Jueves 12 noviembre» y la lista de abajo cambia. Al recoger, se queda en noviembre y tiene que tocar «Hoy».
- **Problema**: `nav-state`: mirar y elegir se confunden. En semana es defendible (como Structured), en mes sorprende (Google Calendar no cambia la selección al pasar de mes).
- **Propuesta**: en `layout === 'month'`, pasar de mes solo mueve el mes visible (estado local `viewMonth` en `WeekStrip`, que la cabecera use para el nombre del mes) y el día se elige al tocarlo; recoger sin tocar vuelve a la semana del día que ya estaba elegido.
- **Esfuerzo**: M

### AG-12 · Las tareas del Horario no se pueden arrastrar a otro día · [MEDIO]
- **Dónde**: Agenda › Horario (`src/components/views/Timeline.tsx:152-157`; `AgendaView.tsx:287`; CLAUDE.md «Horario … No se reordena a mano»).
- **Qué ve/hace el usuario**: aprende que mantener pulsada una tarea y soltarla en un día de la tira la mueve; prueba con «Comida con Ana 14:00» y no se coge (solo desliza). Para moverla hay que abrir la tarea y usar «Otro día».
- **Problema**: `consistency` del gesto: la tira es destino de «cualquier tarea», salvo las que tienen hora.
- **Propuesta**: `TimelineTask` como `DraggableTask` (solo arrastrable, no reordenable: `useDraggable` con `type: 'task'`); `scopedCollision` ya limita a días cuando el dedo está encima; en la lista no se recoloca nada (mantiene la hora). Fuera de un día, soltar no hace nada.
- **Esfuerzo**: M

### AG-13 · Nadie sabe que mantener pulsado lleva al muelle o a la tira · [MEDIO]
- **Dónde**: Bandeja › tareas › muelle (`src/components/views/DayDock.tsx:23-36`); Agenda › tira como destino (`StripDay.tsx:42`); `src/components/dnd/dnd.ts:13-14` (300 ms).
- **Qué ve/hace el usuario**: nada indica que una tarea de la Bandeja se planifica arrastrándola; el muelle solo aparece cuando ya se ha cogido. La bienvenida (*Gestos*) enseña deslizar, no mantener pulsado.
- **Problema**: `discoverability`. La alternativa (abrir la tarea › «Otro día») existe, así que no es callejón sin salida, pero la función estrella del muelle queda escondida.
- **Propuesta**: (a) en la lámina *Gestos* de la bienvenida, un tercer paso: mantener pulsado y soltar en «Mañana» (versión nueva en `PLATE_SINCE`); (b) la primera vez que se arrastra en la Bandeja, el muelle entra con un rebote más largo; (c) un toque sin mover tras 300 ms ya hunde la fila (`pressCue`): bien, mantener.
- **Esfuerzo**: M

### AG-14 · Modo «Aa»: un icono sin explicación que cambia todas las filas · [MEDIO]
- **Dónde**: Bandeja/Agenda › arriba a la derecha (`src/App.tsx:412-422`; `src/components/shell/shell.css:78-121`; `ImportanceKnob.tsx`).
- **Qué ve/hace el usuario**: una «A con flecha doble». Al tocarla aparecen números del 1 al 10 en cada fila y el botón se vuelve marino. No hay texto; el `aria-label` («Tamaño según importancia») no lo ve nadie. Arrastrar el número agranda el título: nadie lo deduce del icono.
- **Problema**: `discoverability` / `progressive-disclosure` (un modo global para una acción que también está en el panel de la tarea). 42 × 42 px, un pelo por debajo de 44.
- **Propuesta**: (a) la primera vez que se activa, un toast corto «Arrastra el número para agrandar lo importante» (una vez por dispositivo, `localStorage`); (b) o llevar la importancia solo al panel de la tarea y quitar el modo (menos controles); (c) 44 × 44.
- **Esfuerzo**: S (a, c) / M (b)

### AG-15 · «2 hechas»: el pliegue no dice que son de otros días · [MEDIO]
- **Dónde**: Bandeja › Tareas (`src/components/views/InboxView.tsx:42, 53, 155-166`; `src/state/selectors.ts:33-37`).
- **Qué ve/hace el usuario**: comprobado: «Tareas 4» con sus filas, y debajo una línea «✓ 2 hechas ⌄». Si además hay tachadas hoy, se ven arriba en la lista y la línea sigue diciendo «2 hechas»: parece un total que no cuadra.
- **Problema**: `labeling`. La regla (lo de hoy a la vista, lo de otros días plegado) es buena pero no se lee.
- **Propuesta**: «2 hechas otros días» / «2 done earlier»; en inglés `earlier(1)` → «1 done earlier». Y el botón de borrar, cuando el pliegue está abierto y hay hechas de hoy, que diga lo que borra: «Borrar las 3 hechas» ya suma las dos listas (correcto), basta con que el pliegue no confunda.
- **Esfuerzo**: S

### AG-16 · Anuncios del arrastre solo en español · [MEDIO]
- **Dónde**: `src/components/dnd/dnd.ts:70-75` (usado en `AgendaView.tsx:225` e `InboxView.tsx:143`).
- **Qué ve/hace el usuario**: con VoiceOver en inglés, al coger una tarea oye «Elemento cogido.» / «Elemento soltado.».
- **Problema**: `i18n` en accesibilidad.
- **Propuesta**: `announcements` como función con `pick({ es, en })` («Item picked up.», «Item dropped.», «Move cancelled.») y, ya puestos, decir qué se cogió (`active.id` → título).
- **Esfuerzo**: S

### AG-17 · El «+» de una sección manda la tarea con hora al Horario sin avisar · [MEDIO]
- **Dónde**: Agenda › sección › «+» › «presupuesto a las 12» (`src/App.tsx:306-319`; `AgendaView.tsx:160-162, 321`; `Timeline.tsx:149`).
- **Qué ve/hace el usuario**: escribe en «Añadir a Trabajo» algo con hora; la tarea aparece en el Horario (con «· Trabajo» en pequeño) y no en la sección, cuyo contador no la cuenta («Trabajo 1» con dos tareas suyas ese día). Como `here` es verdadero no hay toast.
- **Problema**: `feedback` / `where-did-it-go`: el aviso «adónde ha ido» solo cubre otros días, no otro bloque del mismo día.
- **Propuesta**: si el destino era una sección y la tarea lleva hora, toast «Presupuesto → Horario · 12:00» (sin acción, o **Deshacer**). Opcional: contador de sección que sume también las de hora («1 + 1 en el horario» es mucho; mejor solo el toast).
- **Esfuerzo**: S

### AG-18 · «Ver» del toast deja el velo y el teclado encima del destino · [MEDIO]
- **Dónde**: `src/App.tsx:306-319` (toast con **Ver**), `438` (velo), `shell.css:47-62` y `160-163`; `Composer.tsx:261-265` (solo suelta al perder el foco).
- **Qué ve/hace el usuario**: en la Bandeja escribe «mañana dentista», sale «Dentista → Mañana · Ver». Toca **Ver**: cambia a la Agenda de mañana, pero la barra sigue con el foco (en iOS tocar un botón no mueve el foco), así que el día se ve tras el velo al 68 % y con el teclado fuera; hay que tocar el velo para verlo.
- **Problema**: `error-recovery` / flujo que cruza pestañas sin cerrar el estado anterior. **Comprobar en el iPhone** (en escritorio el botón del toast roba el foco y no pasa).
- **Propuesta**: en `onAction` de ese toast llamar a `stopComposing()` antes de `go()`.
- **Esfuerzo**: S

### AG-19 · El bloque de rutinas vacío encabeza la Bandeja para siempre · [MEDIO]
- **Dónde**: Bandeja › Rutinas (`src/components/routines/RoutinesBlock.tsx:56-79`; `routines.css:16-39`).
- **Qué ve/hace el usuario**: sin rutinas, la Bandeja empieza con la cabecera «Rutinas», un «+» y una caja punteada «Nueva rutina», y solo después «Tareas». Dos controles para lo mismo (el «+» y la caja), y el bloque no se puede plegar mientras está vacío (`onToggle` solo con rutinas).
- **Problema**: `progressive-disclosure` / `redundancy`: una llamada permanente a una función que quizá no se use, por encima de lo que la pestaña es.
- **Propuesta**: sin rutinas, una sola línea discreta al final de la Bandeja o bajo la cabecera: «Rutinas · Nueva» (el `routines__empty` sin cabecera ni «+»); con rutinas, como ahora. Y quitar el «+» de la cabecera cuando `!routines.length`.
- **Esfuerzo**: S

### AG-20 · Plegar una sección la pliega en todos los días · [BAJO]
- **Dónde**: `src/state/reducer.ts:242-248`; `SectionBlock.tsx:70-82`.
- **Qué ve/hace el usuario**: pliega «Compra» el lunes porque está vacía; el martes, con tres tareas, sigue plegada (con el «3» al lado, eso sí).
- **Problema**: `consistency` con lo esperado de un pliegue «de hoy». Es coherente con que la sección sea global, pero sorprende.
- **Propuesta**: dejarlo (AG-04 ya quita el motivo principal de plegar vacías) y, plegada con pendientes ese día, el contador en `--accent` para que se note. Alternativa: pliegue por día (`collapsedOn: IsoDate[]`), más complejo y poco valor.
- **Esfuerzo**: S

### AG-21 · Tocar la pestaña Agenda vuelve a hoy pero deja el mes abierto · [BAJO]
- **Dónde**: `src/App.tsx:227-230`; `WeekStrip.tsx:247-252` (`pick` sí recoge).
- **Qué ve/hace el usuario**: con el mes desplegado en diciembre, toca «Agenda»: salta a hoy (octubre) con el mes aún abierto.
- **Problema**: `nav-state-active`: «volver a hoy» debería ser el estado de partida (semana).
- **Propuesta**: `reselect('agenda')` también `setMonthOpen(false)` (subir `monthOpen` a App o pasar un `resetKey`).
- **Esfuerzo**: S

### AG-22 · «Día libre.» debajo de un Horario con rutinas · [BAJO]
- **Dónde**: `src/components/views/AgendaView.tsx:166, 291-296, 310`.
- **Qué ve/hace el usuario**: un sábado sin tareas pero con «Gimnasio 19:00» en el Horario y, bajo él, la pluma y «Día libre.».
- **Problema**: `empty-states`: el código lo decide a propósito (las rutinas no cuentan), pero visualmente se contradice.
- **Propuesta**: si `rows.length > 0`, cambiar el texto a «Sin tareas.» / «No tasks.» (y mantener «Día libre.» solo cuando no hay nada de nada).
- **Esfuerzo**: S

### AG-23 · El bloque «Tareas» de la Bandeja no se pliega aunque el estado lo prevé · [BAJO]
- **Dónde**: `src/components/views/InboxView.tsx:149`; `src/types.ts:123` (`BlockId` incluye `backlog`); `reducer.ts:362-366`.
- **Qué ve/hace el usuario**: «Rutinas» tiene flecha y se pliega; «Tareas», no. Con muchas rutinas y pocas tareas da igual; al revés, no hay forma de centrarse en las rutinas.
- **Problema**: `consistency`.
- **Propuesta**: `BlockHeader` con `collapsed={collapsed.backlog}` y `onToggle` (ya existe `block/toggle`), o quitar `backlog` del tipo si no se quiere.
- **Esfuerzo**: S

### AG-24 · Texto del toast «Hecha borrada» · [BAJO]
- **Dónde**: `src/components/views/InboxView.tsx:35`.
- **Qué ve/hace el usuario**: tras «Borrar las N hechas» con una sola: «Hecha borrada» (suena a error de concordancia).
- **Problema**: `copy`.
- **Propuesta**: «Tarea hecha borrada» / «1 done task deleted»; en plural «3 tareas hechas borradas».
- **Esfuerzo**: S

### AG-25 · La barra de pestañas se llama «Secciones» · [BAJO]
- **Dónde**: `src/components/shell/TabBar.tsx:17, 22` (`aria-label` del `nav`).
- **Qué ve/hace el usuario**: con VoiceOver, «Secciones, navegación», cuando la app llama «secciones» a los grupos de tareas.
- **Problema**: `a11y wording` / colisión de términos.
- **Propuesta**: «Pestañas» / «Tabs».
- **Esfuerzo**: S

### AG-26 · «Mañ» en el muelle · [BAJO]
- **Dónde**: `src/components/views/DayDock.tsx:12, 30`; `inbox.css:41-69`.
- **Qué ve/hace el usuario**: los siete días del muelle: «Hoy 12», «Mañ 13», «mié 14»… «Mañ» es una abreviatura que no existe; en inglés «Tmrw».
- **Problema**: `labeling`. A 11 px, «Mañana» (~44 px) cabe en una celda de ~60 px.
- **Propuesta**: «Mañana» / «Tmrw» → «Tomorrow» con `font-size: 10px` si hiciera falta; o quitar la etiqueta y dejar «Hoy» en acento y los demás con la inicial del día (`L M X…`), como la tira.
- **Esfuerzo**: S

### AG-27 · «Ver» lleva al día pero no a la tarea · [BAJO]
- **Dónde**: `src/App.tsx:313-317`.
- **Qué ve/hace el usuario**: en un día con 15 tareas y tres secciones, «Ver» cambia de día y ya está: la tarea nueva puede quedar bajo el pliegue de la pantalla.
- **Problema**: `where-did-it-go`.
- **Propuesta**: tras `go`, `scrollIntoView` de `[data-flip="<id>"]` y un destello (`flip` ya conoce el id); o abrirla (`openTask(id)`), como hace el aviso.
- **Esfuerzo**: S

### AG-28 · Un día pasado también admite soltar: la tarea queda atrasada sin decirlo · [BAJO]
- **Dónde**: `src/components/views/AgendaView.tsx:102-112`; `StripDay.tsx:42`.
- **Qué ve/hace el usuario**: suelta una tarea sobre el «8» (ya pasado); toast «Comprar pan → jue 8 oct». Al volver a hoy, aparece en Atrasadas en rojo.
- **Problema**: `feedback`: legítimo (apuntar algo que se hizo tal día) pero sorprende.
- **Propuesta**: si `date < today`, toast «Comprar pan → jue 8 oct (atrasada)» con **Deshacer**; o no aceptar la suelta en días pasados (`droppable={!past}`), más simple.
- **Esfuerzo**: S

### AG-29 · Una «hecha» plegada se puede arrastrar a un día y queda hecha con fecha · [BAJO]
- **Dónde**: `src/components/views/InboxView.tsx:81-89, 167-172` (`DraggableTask` en `inbox__earlier`).
- **Qué ve/hace el usuario**: abre «2 hechas», arrastra una al muelle sin querer: desaparece de la Bandeja y aparece tachada en ese día.
- **Problema**: `error-prevention`: nada útil sale de ello.
- **Propuesta**: en `inbox__earlier`, filas no arrastrables (`TaskShell` sin `listeners`), o `schedule()` ignora `task.done`.
- **Esfuerzo**: S

### AG-30 · Toast de 4,2 s para deshacer un borrado en bloque · [BAJO]
- **Dónde**: `src/components/ui/Toast.tsx:5`; `InboxView.tsx:108-116`.
- **Qué ve/hace el usuario**: «Borrar las 12 hechas» → «12 hechas borradas · Deshacer» desaparece en 4 s.
- **Problema**: `undo-support` justo: Gmail y Mail dan 5-10 s a lo irreversible.
- **Propuesta**: `toast({ …, duration: 7000 })` opcional en `ToastRequest`, usado en borrados en bloque y en AG-01.
- **Esfuerzo**: S

### AG-31 · Los huecos del Horario miden la noche entera · [BAJO]
- **Dónde**: `src/lib/timeline.ts:55-80`, `MIN_GAP = 45`.
- **Qué ve/hace el usuario**: comprobado: entre la comida (14:00-15:30) y el gimnasio (19:00) «3 h 30 libres» tiene sentido; entre el gimnasio y «Leer 20 minutos» a las 22:30, otras «3 h 30 libres»; y con una sola cosa por la mañana y otra a las 22:30, «11 h 30 libres». La nota pierde valor cuanto más grande.
- **Problema**: `signal-to-noise`. CLAUDE.md deja claro que la duración no es para planificar el día; los huecos enormes solo decoran.
- **Propuesta**: tope (p. ej. no decir huecos ≥ 6 h, o decirlo sin cifra: «Tarde libre»), y nunca en días pasados (AG-05).
- **Esfuerzo**: S

### AG-32 · Sección nueva: se crea al perder el foco, sin aviso, al final de todos los días · [BAJO]
- **Dónde**: `src/components/views/AgendaView.tsx:188-191, 337-355`.
- **Qué ve/hace el usuario**: toca «+ Sección», escribe «Casa», toca fuera: se crea (bien). Si escribe y luego cambia de idea y toca fuera, también se crea. Aparece la última, en todos los días, sin toast. En el iPhone, comprobar que `autoFocus` saca el teclado (React enfoca en el mismo evento, debería).
- **Problema**: `confirmation` al revés: una creación silenciosa. Y es redundante con el campo «Sección» del panel de la tarea (`task/fields.tsx:157`), que también crea.
- **Propuesta**: Intro crea, **Escape o tocar fuera cancela** (como un campo de búsqueda); o mantener el blur pero con toast «Sección Casa · Deshacer». Y valorar esconder «+ Sección» tras el «⋯» de una sección existente o dejarlo solo en el panel de la tarea.
- **Esfuerzo**: S

### AG-33 · «Horario» y «Sin hora» no se pliegan; «Atrasadas» y «Rutinas» sí · [BAJO]
- **Dónde**: `src/components/views/AgendaView.tsx:286, 299-309`; `BlockHeader.tsx:20-24`.
- **Qué ve/hace el usuario**: dos titulares con chevron y dos sin; con el calendario conectado el Horario puede ser largo y no se puede recoger.
- **Problema**: `consistency`.
- **Propuesta**: o todos plegables (`collapsed.schedule`, `collapsed.untimed`), o ninguno salvo Atrasadas (que es un aviso). Si solo Atrasadas se pliega, que su chevron se note más que el de las secciones.
- **Esfuerzo**: S

### AG-34 · Atrasadas plegado se queda plegado aunque entren más · [BAJO]
- **Dónde**: `src/components/views/AgendaView.tsx:258-272`; `reducer.ts:362-366`.
- **Qué ve/hace el usuario**: plegó Atrasadas un día con una; semanas después tiene nueve, en una cabecera roja con «9» y «Pasar a hoy», sin ver cuáles.
- **Problema**: `attention`: lo que se pliega para quitar ruido acaba escondiendo deuda.
- **Propuesta**: desplegar solo (`block/toggle`) cuando el número de atrasadas suba respecto a la última vez que se plegó (guardar `collapsedOverdueAt: count`), o no persistir el pliegue entre sesiones.
- **Esfuerzo**: S

### AG-35 · Sin vibración al cambiar de pestaña · [BAJO]
- **Dónde**: `src/App.tsx:210-219` (`go`), `TabBar.tsx:52`.
- **Qué ve/hace el usuario**: todo lo demás vibra (completar, deslizar, pasar de semana, elegir destino); la barra no.
- **Problema**: `consistency` táctil.
- **Propuesta**: `haptic('selection')` en `go` (no en `reselect`).
- **Esfuerzo**: S

### AG-36 · El «+3» de todo el día no se vuelve a plegar · [BAJO]
- **Dónde**: `src/components/views/AllDayEvents.tsx:34-36, 55-61`.
- **Qué ve/hace el usuario**: toca «+3» y aparecen cinco cintas; no hay forma de recogerlas hasta cambiar de día.
- **Problema**: `reversibility` menor.
- **Propuesta**: desplegado, la última cinta es «Menos» (`setExpanded(false)`); o que tocar fuera de las cintas las recoja.
- **Esfuerzo**: S

### AG-37 · Rutinas en el Horario con el día de calendario, no con `dayStart` · [BAJO]
- **Dónde**: `src/components/views/AgendaView.tsx:123` (`routinesOn(…, shown)`), `Timeline.tsx:207-250` (`toggleRoutine(id, day)`), frente a `InboxView.tsx:135` (`routineDay`).
- **Qué ve/hace el usuario**: con «Se renuevan a las 04:00», a la 1:00 de la madrugada la Bandeja aún enseña «ayer» (0/3) y la Agenda, el horario de hoy; tachar «Leer» en el Horario la marca para hoy y en la Bandeja sigue pendiente la de ayer.
- **Problema**: `consistency` entre pestañas en una franja de horas; solo afecta a quien cambia la hora. CLAUDE.md lo asume («El horario de la Agenda sigue el calendario»).
- **Propuesta**: en el Horario de hoy, tachar con `routineDay` (pasarlo a `Timeline` como `routineDay`), y dejar el calendario para el resto de días.
- **Esfuerzo**: S

### AG-38 · Tres nombres para el mismo sitio: «Sin fecha», «Bandeja», «la bandeja» · [BAJO]
- **Dónde**: `InboxView.tsx:36-37` (kicker «Sin fecha», título «Bandeja»), `compose.ts:18` (destino «Sin fecha»), `compose.ts:54` («Añadir a la bandeja»), `App.tsx:97` (toast «→ Bandeja»), `TabBar.tsx:16` («Bandeja»).
- **Qué ve/hace el usuario**: el destino de la barra se llama «Sin fecha» y el toast dice «→ Bandeja»; la pestaña, «Bandeja».
- **Problema**: `labeling` ligero: «Sin fecha» describe la propiedad y «Bandeja» el sitio, y los dos valen, pero el destino de la barra y el toast deberían coincidir.
- **Propuesta**: destino «Bandeja» / «Inbox» en `composeTargets` (y mantener «Sin fecha» como kicker de la pestaña).
- **Esfuerzo**: S

### AG-39 · El número de la cabecera de la Bandeja no dice qué cuenta · [BAJO]
- **Dónde**: `src/components/views/InboxView.tsx:126-130`; `views.css:49-56`.
- **Qué ve/hace el usuario**: «Bandeja 4» en serif grande. ¿Cuatro pendientes? ¿Cuatro en total? (Son pendientes; lo dice solo el `aria-label`.) Además «Tareas 4» justo debajo repite la cifra.
- **Problema**: `labeling` / `redundancy`.
- **Propuesta**: quitar el número de la cabecera (ya está en «Tareas 4» y en el icono de la app) o convertirlo en «4 pendientes» pequeño bajo el título.
- **Esfuerzo**: S

### AG-40 · Deslizar sobre la tira nunca hace scroll (y con el mes abierto es un tercio de la pantalla) · [BAJO]
- **Dónde**: `src/components/views/agenda.css:82-89` (`touch-action: none`), `WeekStrip.tsx:273-290` (modo `ignore`).
- **Qué ve/hace el usuario**: con el mes desplegado (~310 px), un gesto hacia abajo sobre los días no hace nada y hacia arriba lo recoge; para bajar por la lista hay que empezar el gesto por debajo del asa.
- **Problema**: `gesture-conflict` conocido y asumido (Google Calendar hace lo mismo). Lo dejo anotado porque en un iPhone pequeño (375 × 667) queda poco sitio para la lista.
- **Propuesta**: nada, o en 667 px de alto recoger el mes automáticamente al elegir día (ya lo hace) y empezar siempre en semana (ya lo hace).
- **Esfuerzo**: —

### AG-41 · Intro en el nombre de la sección no cierra el panel · [BAJO]
- **Dónde**: `src/components/section/SectionSheet.tsx:59-67`.
- **Qué ve/hace el usuario**: renombra «Trabajo» → «Oficina», pulsa Intro/«Listo» en el teclado: el teclado se va, el nombre se guarda, pero el panel sigue abierto (hay que tocar fuera).
- **Problema**: `expectation`: en un panel con un solo campo, Intro es «hecho».
- **Propuesta**: `onKeyDown` Intro → `close()`.
- **Esfuerzo**: S

## Lo que está bien (para no tocarlo)

- La estructura de la Agenda (día grande, tira, Atrasadas › Horario › Sin hora) se entiende sola, y el «Hoy» de la cabecera más tocar la pestaña activa dan dos caminos de vuelta coherentes.
- Casi todo lo destructivo o que mueve cosas tiene **Deshacer** con el sitio exacto: borrar fila, pasar a hoy (devuelve día, sección y puesto), soltar en un día, «Borrar las N hechas», borrar rutina. Solo AG-01 se queda fuera.
- El aviso «adónde ha ido» (`Dentista → Mañana · Ver`) cubre bien el cruce Bandeja ↔ Agenda, también con plazos («→ Esta semana»).
- Toques de 44 px bien resueltos con `::after` sin cambiar el diseño: el mes, el asa, el círculo de completar, las cápsulas del Horario, las cintas de todo el día, el «+» de sección, la hora de «Se renuevan a las».
- Todos los controles solo-icono llevan `aria-label` con el título de la tarea («Completar «Comida con Ana»»); los días de la tira dicen «Hoy, lunes, 12 oct, 2 de 9 hechas»; el punto rojo de la pestaña tiene `role="img"`.
- Las tablas `COPY` es/en dicen lo mismo y con el mismo tono en todos los ficheros del área (salvo AG-02 y AG-16, que están fuera de las tablas).
- Modo oscuro: ningún color fuera de `tokens.css` en `views/*.css`, `section.css`, `shell.css`, `inbox.css`, `routines.css` y `task.css`; los eventos usan `--cal-ink` mezclado con el papel.
- Atrasadas solo en hoy, en ladrillo, con la fecha de cada una («Ayer», «jue 8 oct · 11:00») y el pliegue que se recuerda; soltar una atrasada en la lista de hoy la pasa a hoy (lo hace `board/commit` sin código aparte).
- La nota «Se renuevan a las 00:00» es exactamente el nivel de disclosure correcto: una línea, un solo punto tocable, sin ajuste aparte.
- El muelle de la Bandeja y la tira como destino con `scopedCollision`: reordenar cerca de los días no se lleva la tarea a otro día.
- El pliegue «N hechas» en la Bandeja y «Borrar las N hechas» solo cuando se ve lo que se borra.

## Inventario de controles

| Control | Pantalla | Qué hace | Veredicto |
|---|---|---|---|
| Mes de la cabecera (botón con flecha) | Agenda | Despliega/recoge el mes; `aria-expanded` | OK (AG-10 pista) |
| «Hoy» (píldora del kicker) | Agenda, otro día | Vuelve a hoy | REVISAR (AG-09, 30 px) |
| Botón «Aa» | Agenda, Bandeja | Modo importancia en todas las filas | REVISAR (AG-14) |
| Tira: tocar un día | Agenda | Elige el día; con el mes abierto lo recoge | OK |
| Tira: deslizar a los lados | Agenda | Semana/mes anterior o siguiente, cambia el día | REVISAR (AG-11 en mes) |
| Tira: tirar hacia abajo / arriba | Agenda | Despliega / recoge el mes | OK |
| Asa bajo la tira | Agenda | Igual que tirar | REVISAR (AG-10, visibilidad) |
| Día de la tira / del mes como destino de soltar | Agenda | Mueve la tarea a ese día, con Deshacer | OK (AG-28 días pasados) |
| Filete de avance | Agenda | Decorativo (hechas/total) | OK |
| Cintas de todo el día, «+N» | Agenda | Abre la ficha de Calendario; despliega | OK (AG-36) |
| Cabecera «Atrasadas» (toggle) | Agenda, hoy | Pliega, se recuerda | REVISAR (AG-08 32 px, AG-34) |
| «Pasar a hoy» (Atrasadas) | Agenda, hoy | Todo lo atrasado arriba de su sección de hoy, Deshacer | REVISAR (AG-08 32 px) |
| «Pasar a hoy» (Sin hora, día pasado) | Agenda, pasado | Lo pendiente de ese día, Deshacer | REVISAR (AG-05: no sale si todo tiene hora) |
| Fila atrasada (deslizar, círculo, tocar, arrastrar) | Agenda | Completar / borrar / abrir / mover | OK |
| Cabecera «Horario» | Agenda | Solo titular con contador | OK (AG-33) |
| Cápsula del Horario | Agenda | Completa (tarea) o tacha (rutina) | OK |
| Cuerpo de fila del Horario | Agenda | Abre tarea / rutina / evento de Calendario | OK (AG-12 no arrastra, AG-05 pasado) |
| Deslizar fila del Horario | Agenda | Derecha completa, izquierda borra (rutina: solo completa) | OK |
| Hueco «1 h 30 libres» | Agenda | Informativo | REVISAR (AG-31, AG-05) |
| Marca «ahora» | Agenda, hoy | Informativa | OK |
| Cabecera «Sin hora» | Agenda | Titular con pendientes | OK (AG-03 vacío) |
| Fila sin hora (deslizar, círculo, tocar, mantener) | Agenda | Completar / borrar / abrir / arrastrar | OK |
| Cabecera de sección (tocar) | Agenda | Pliega (global) | REVISAR (AG-08, AG-20) |
| Cabecera de sección (mantener) | Agenda | Reordena secciones | OK |
| «+» de sección | Agenda | Abre la barra con la sección como destino | REVISAR (AG-06, AG-17) |
| «⋯» de sección | Agenda | Panel Editar sección | REVISAR (AG-08 32 px) |
| Panel sección: nombre | Agenda | Renombra al salir del campo | OK (AG-41) |
| Panel sección: «Borrar sección» | Agenda | Borra en todos los días, sin confirmar ni deshacer | **REVISAR (AG-01)** |
| «+ Sección» / campo de nombre | Agenda | Crea al Intro o al perder el foco | REVISAR (AG-32) |
| «Suelta una tarea aquí» | Agenda | Texto vacío de sección | REVISAR (AG-02, AG-04) |
| Estado vacío «Día libre.» / «Nada pendiente.» | Agenda | Informativo | OK (AG-22) |
| Barra de escribir y destinos | Ambas | Añade donde se mira; píldoras de destino | OK salvo AG-06 |
| Toast «→ Mañana · Ver» | Ambas | Va al día / a la Bandeja | REVISAR (AG-18, AG-27) |
| Toast «Rutina: … · Ver/Deshacer» | Ambas | Deshacer en Bandeja, Ver en Agenda | REVISAR (AG-07) |
| Cabecera «Rutinas» (toggle, «2/3», «+») | Bandeja | Pliega; progreso; nueva rutina | REVISAR (AG-19, AG-08) |
| Caja «Nueva rutina» (vacío) | Bandeja | Nueva rutina | REVISAR (AG-19, redundante con «+») |
| Fila de rutina | Bandeja | Tachar hoy / borrar / abrir | OK (lo audita otro agente) |
| «Se renuevan a las 00:00» (hora tocable) | Bandeja | Cambia `dayStart` con la rueda | OK |
| Cabecera «Tareas» | Bandeja | Titular con pendientes | OK (AG-23 no pliega) |
| Fila sin fecha (mantener → muelle) | Bandeja | Reordena o planifica en 7 días | REVISAR (AG-13 descubribilidad) |
| Muelle «Hoy, Mañ, mié…» | Bandeja | Destinos al arrastrar | REVISAR (AG-26 etiqueta) |
| Pliegue «N hechas» | Bandeja | Muestra lo tachado otros días | REVISAR (AG-15 texto) |
| Filas del pliegue (arrastrables) | Bandeja | Arrastrar a un día | REVISAR (AG-29) |
| «Borrar las N hechas» | Bandeja | Borra todas las hechas, Deshacer | OK (AG-30 duración) |
| Estado vacío «Nada sin fecha.» | Bandeja | Informativo | OK |
| Número junto a «Bandeja» | Bandeja | Pendientes | REVISAR (AG-39) |
| Pestañas (tocar otra) | Barra | Cambia; se conserva scroll y estado | OK (AG-35 sin vibración) |
| Pestaña activa (volver a tocar) | Barra | Arriba y, en Agenda, a hoy | OK (AG-21 mes abierto) |
| Punto rojo en Agenda | Barra | Hay atrasadas | OK |
| Pestañas ocultas al escribir | Barra | Dejan sitio a los destinos | OK |
| Velo al escribir | Ambas | Tocarlo suelta el teclado | OK |
