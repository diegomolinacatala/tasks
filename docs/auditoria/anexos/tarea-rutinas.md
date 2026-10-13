# Tarea, importancia y rutinas

Auditoría de experiencia (no de código) de la fila de tarea y sus gestos, el panel de la tarea, la importancia (modo "Aa" y escala) y las rutinas (fila, panel, constancia, emoji). Leído entero: CLAUDE.md, `src/components/task/*`, `src/components/importance/*`, `src/components/routines/*`, `ui/PickerChip.tsx`, `ui/Slider.tsx`, `ui/Sheet.tsx` + `sheet.css`, y `lib/{duration,ruler,reminders,routines,emoji,importance,period}.ts`, `state/reducer.ts`, más el contexto que los envuelve (`App.tsx`, `views/Timeline.tsx`, `dnd/dnd.ts`, `push/useNotificationActions.ts`, `compose/ComposeSheet.tsx`, `lib/details.ts`, `styles/base.css`, `styles/tokens.css`).

## Resumen (lo que más chirría)

1. **El panel de la tarea no deja tacharla** (solo cuando se abre desde un aviso): hay que cerrarlo y volver a la fila. Es la acción principal de una tarea y no está.
2. **Dos píldoras "Hasta…" en el mismo panel** con significados distintos: la del plazo (último día) y la de la regla (hora de acabar). Y los avisos se quitan tocando la píldora entera, sin deshacer, mientras la píldora del plazo, con el mismo aspecto, hace lo contrario.
3. **La regla de la duración roba el scroll**: tocarla fija una duración en el mismo instante y la guarda al soltar, así que intentar desplazar el panel con el pulgar sobre ella cambia la tarea sin querer. `RoutineLog` ya resuelve ese mismo conflicto bien; la regla no.
4. **Una rutina nueva se crea al cerrar el panel** (tirar hacia abajo, tocar fuera) si tiene nombre, sin toast ni deshacer, y el botón "Añadir rutina" queda al final del scroll, bajo el teclado, en vez de en el pie fijo que `Sheet` ya ofrece.
5. **Los gestos ocultos no se enseñan**: mantener pulsado para mover no sale en la bienvenida; el modo "Aa" pone un "1" en cada fila sin decir nada; estirar la regla manteniendo el dedo y corregir días tocándolos en Constancia solo se descubren por azar. Nada explica, pero tampoco insinúa.

Modo oscuro: en toda el área no hay un solo color fijo fuera de `tokens.css`. Bien.

## Hallazgos

### TA-01 · Deslizar no deja pista en reposo · MEDIO
- **Dónde**: Bandeja/Agenda › fila (`src/components/task/SwipeRow.tsx:65-88`, `task.css:43-57`)
- **Qué ve/hace el usuario**: una fila normal; solo al arrastrarla asoma el check o la papelera. Lo aprende en la lámina *Gestos* de la bienvenida (`welcome/Welcome.tsx:60`), si no la saltó.
- **Problema**: swipe-clarity. Quien salta la bienvenida (o la ve una vez y pasan semanas) no tiene forma de saber que la fila se desliza. Mail y Things tampoco lo indican, pero Tasks apuesta por el deslizamiento como gesto principal de tachar.
- **Propuesta**: una sola vez por instalación (clave en `localStorage`, como `tasks:notifications-asked`), al pintarse la primera lista con tareas, la primera fila hace un "peek" de 24 px a la derecha y vuelve (reutilizar `is-hint-right` de `welcome.css:638-662`, que ya existe). Sin texto.
- **Esfuerzo**: S

### TA-02 · Mantener pulsado para mover: ni pista ni lámina · MEDIO
- **Dónde**: fila (`src/components/task/TaskShell.tsx:65`, `dnd/dnd.ts:13-14`, `task.css:293-298`); bienvenida (`welcome/Welcome.tsx:41-60`)
- **Qué ve/hace el usuario**: nada indica que una fila se coge manteniéndola 300 ms. Si lo hace por casualidad, la fila se hunde (`is-pressing`) y vibra: bien. Pero la lámina *Gestos* solo enseña deslizar ("A la derecha, hecha. A la izquierda, fuera.").
- **Problema**: discoverability. Se quitó el asa (buzón, 05/10) y no se sustituyó la pista por otra. Quien quiera reordenar no sabe cómo.
- **Propuesta**: en la lámina *Gestos* añadir la tercera frase y una tercera fila de muestra que se hunde sola al cabo de un segundo: es «Mantén pulsada para moverla» · «Hold to move it». Subir `PLATE_SINCE` de *Gestos* para que la vean también quienes actualizan. Alternativa barata: la primera vez que el usuario arrastre, no hacer nada; la primera vez que haga *scroll* con el dedo quieto más de 300 ms sobre una fila… no (falsos positivos). Mejor la lámina.
- **Esfuerzo**: S

### TA-03 · Deslizar a la derecha una tarea hecha enseña un check, pero la desmarca · BAJO
- **Dónde**: `src/components/task/SwipeRow.tsx:68-70`, `task.css:79-81, 98-101`
- **Qué ve/hace el usuario**: en una tarea tachada, deslizar a la derecha enseña el mismo check coñac que al completar; al soltar, la tarea vuelve a pendiente.
- **Problema**: el icono promete una cosa y pasa la contraria.
- **Propuesta**: `SwipeRow` recibe `done` (o lo lee de la clase `is-done`) y en ese caso pinta un círculo hueco (`IconCircle`) o la flecha de deshacer en lugar del check. Misma lógica para `RoutineRow`.
- **Esfuerzo**: S

### TA-04 · El subtítulo va a la derecha del título y no encoge · BAJO
- **Dónde**: `src/components/task/task.css:207-215` (`.row__main` con `align-items: baseline`) y `:251-253` (`.row__meta { flex: none }`); `TaskRow.tsx:63-71`
- **Qué ve/hace el usuario**: la "meta" (campana, pin, "Hasta el jueves · Ayer · 17:30–18:30") va en la misma línea que el título, pegada a la derecha. Con una tarea atrasada con plazo y tramo, en 320–375 px el título queda a una o dos palabras por línea.
- **Problema**: legibilidad en móvil pequeño; la fila de rutina sí pone la meta debajo (`routines.css:82-96`), así que además es incoherente.
- **Propuesta**: `.row__main { flex-wrap: wrap }` y `.row__meta { flex: 0 1 auto; min-width: 0 }` para que, si no cabe, la meta baje a una segunda línea alineada con el título (como en la rutina). Mantener a la derecha cuando cabe.
- **Esfuerzo**: S

### TA-05 · Dos borrados seguidos pierden el primer "Deshacer" · BAJO
- **Dónde**: `src/components/task/useTaskActions.ts:48-62`; `ui/Toast.tsx:26-29` (un toast a la vez)
- **Qué ve/hace el usuario**: desliza y borra dos tareas en tres segundos; el segundo toast sustituye al primero y la primera ya no se puede recuperar.
- **Problema**: undo-support.
- **Propuesta**: en `remove`, acumular lo borrado en los últimos 4,2 s (ref con lista) y que el toast diga «2 tareas borradas · Deshacer» · «2 tasks deleted · Undo», restaurando todas (ya existe el patrón en `InboxView.clearDone`).
- **Esfuerzo**: S

### TA-06 · El modo "Aa" no explica qué es ese "1" que aparece en cada fila · MEDIO
- **Dónde**: botón `app__sizing` (`src/App.tsx:412-422`, `shell/shell.css:78-121`); mando (`importance/ImportanceKnob.tsx:104-123`, `importance.css:2-39`)
- **Qué ve/hace el usuario**: arriba a la derecha, una "A" con una flecha doble. La toca: se pone en marino y en cada fila aparece un circulito con un "1". Nada más. Si toca el "1" pasa a "2" y el título crece un poco: ahí lo entiende… o piensa que es un contador.
- **Problema**: primary-action/affordance. El icono es abstracto (el aria-label «Tamaño según importancia» no se ve) y el mando parece una insignia. Es la única función de la app que exige un modo, y el modo no se presenta.
- **Propuesta**: (a) la primera vez que se activa (clave `tasks:sizing-hinted`), toast sin botón: «Arrastra el número: más arriba, más grande» · «Drag the number: up means bigger»; (b) el mando, mientras no se ha tocado ninguno en esa sesión, lleva la "A" pequeña delante del número («A·1») o la flecha doble tenue del icono, para que se vea que es el mismo concepto; (c) `aria-label` del botón pasa también a `title` para escritorio.
- **Esfuerzo**: S

### TA-07 · Tocar el mando en 10 vuelve al 1 · BAJO
- **Dónde**: `src/lib/importance.ts:36-37`; `ImportanceKnob.tsx:77`
- **Qué ve/hace el usuario**: va subiendo a toques la tarea más importante; al pasar de 10, el título se encoge de golpe a normal.
- **Problema**: sorpresa destructiva (se pierde el ajuste que acaba de hacer).
- **Propuesta**: en 10, el toque no hace nada y vibra `warning` (o baja a 9). Bajar queda para el arrastre hacia abajo, que ya existe y es explícito.
- **Esfuerzo**: S

### TA-08 · En modo "Aa", hacer scroll con el pulgar sobre la columna derecha cambia la importancia · BAJO
- **Dónde**: `src/components/importance/importance.css:9` (`touch-action: none`), `lib/importance.ts:32-33` (`dy` cuenta)
- **Qué ve/hace el usuario**: con el modo activo, desplaza la lista con el pulgar por el borde derecho (donde están los mandos, 40 px) y en vez de scroll sube o baja la importancia de esa fila.
- **Problema**: el mismo conflicto que motivó quitar el asa (buzón 05/10): el borde derecho es zona de scroll de un diestro.
- **Propuesta**: que el mando acepte solo el arrastre horizontal (derecha agranda, izquierda encoge) y deje pasar el vertical al scroll (`touch-action: pan-y`), o que exija 6 px horizontales antes de capturar. Actualizar el texto de CLAUDE.md ("Arrastrarlo hacia arriba o a la derecha").
- **Esfuerzo**: S

### TA-09 · No se puede tachar desde el panel de la tarea · ALTO
- **Dónde**: `src/components/task/TaskSheet.tsx:103-174` (solo `SnoozeBar` lleva "Hecha", y solo `fromNotification`, línea 106)
- **Qué ve/hace el usuario**: abre una tarea para ver sus detalles, decide que ya está, y no hay dónde tacharla: tiene que cerrar el panel y buscar el círculo. Si entró desde un aviso sí tiene "Hecha" (`SnoozeBar.tsx:42-54`), así que además depende de por dónde entró.
- **Problema**: primary-action ausente. Things, Recordatorios y Todoist llevan el círculo en la ficha.
- **Propuesta**: el mismo `row__check` (22 px, zona de 44) a la izquierda del título del panel, con `aria-pressed`, y al tacharla cerrar el panel con el toast de `useNotificationActions.complete` («Hecha: X · Deshacer»). Quitar entonces la píldora "Hecha" de `SnoozeBar` (queda solo Posponer).
- **Esfuerzo**: S

### TA-10 · Importancia va lo primero en el panel y lo último en la ficha del compositor · MEDIO
- **Dónde**: `src/components/task/TaskSheet.tsx:118-119` vs `compose/ComposeSheet.tsx:257-259`
- **Qué ve/hace el usuario**: en el panel, diez números grandes justo debajo del título, antes de Cuándo y Hora; en la ficha al escribir, la escala va al final, tras Sección.
- **Problema**: consistencia y jerarquía: el campo que menos se toca (casi todo es 1) ocupa el sitio más visible y empuja Cuándo/Hora fuera de la primera pantalla.
- **Propuesta**: mismo orden que la ficha: Cuándo, Hora, Duración, Recordatorios, Sección, Importancia, Acciones. Ver además TA-25 (plegarla).
- **Esfuerzo**: S

### TA-11 · Dos "Hasta…" en el mismo panel con significados distintos · ALTO
- **Dónde**: Cuándo › `Hasta…` = último día del plazo (`src/components/task/fields.tsx:24, 40, 85-110`); Duración › `Hasta…` = hora de acabar (`DurationPicker.tsx:22, 28, 183-185`; `ruler.css:41-51`)
- **Qué ve/hace el usuario**: una tarea con día y hora enseña, a cuatro dedos de distancia, una píldora "Hasta…" (abre un calendario) y otra "Hasta…" (abre una rueda de horas). Un plazo "Hasta el viernes" y una duración "17:00 → 18:30" se dicen igual.
- **Problema**: i18n/wording y consistencia: la misma etiqueta para dos cosas. CLAUDE.md ya documenta las dos con el mismo nombre.
- **Propuesta**: la regla dice «Acaba a las…» · «Ends at…» (y, con duración, el tramo «17:00 → 18:30» como ahora). El plazo se queda con «Hasta…» · «Until…», que es como se dicta ("hasta el viernes").
- **Esfuerzo**: S

### TA-12 · La regla de la duración se lleva el scroll del panel · ALTO
- **Dónde**: `src/components/task/DurationPicker.tsx:131-137` (`onPointerDown` → `follow` fija el valor), `:139-147` (`finish` lo guarda), `ruler.css:72-79` (`touch-action: none`, 52 px de alto a todo el ancho)
- **Qué ve/hace el usuario**: quiere bajar en el panel y apoya el pulgar en la regla (está en medio y es ancha): en ese instante la duración salta a donde cayó el dedo, el panel no se mueve, y al levantar el dedo queda guardada. El aviso "¿has acabado?" se mueve sin que lo haya pedido. Lo mismo con `Slider` del lugar (`ui/Slider.tsx:48-54`, `slider.css:6-11`), aunque allí el valor se ve encima.
- **Problema**: gesture-conflict / unintended-change. `RoutineLog` resuelve exactamente esto (`RoutineLog.tsx:33-36, 110-125`: `touch-action: pan-y` y solo pinta si el dedo va claramente de lado).
- **Propuesta**: en `ruler__track`, `touch-action: pan-y`; en `pointerdown` no cambiar nada; capturar y empezar a seguir el dedo solo cuando `|dx| > 10 && |dx| > 1,5·|dy|` (o al soltar sin moverse: un toque fija). Igual en `Slider`. Mantener al final para estirar sigue igual (ya hay captura).
- **Esfuerzo**: M

### TA-13 · Estirar la regla manteniendo el dedo no se descubre · MEDIO
- **Dónde**: `src/components/task/DurationPicker.tsx:105-120` (hold), `ruler.css:181-215` (halo solo con `can-stretch`, es decir, ya en el extremo)
- **Qué ve/hace el usuario**: arrastra hasta "2 h" y la regla topa. El halo de oro aparece ahí, pero nada dice "mantén". Quien saltó la lámina *Detalles* (o la vio hace un mes) cree que el máximo son dos horas. La alternativa (tocar la hora de acabar) tampoco se asocia con "más de dos horas".
- **Problema**: discoverability de un gesto con tiempo (hold) sin pista textual ni visual anticipada.
- **Propuesta**: (a) el último rótulo de la regla lleva un indicio: «2 h ›» · «2h ›» (en `rulerTicks`, el `label` del último tick); (b) mientras `can-stretch` y aún no `is-holding`, la nota de debajo cambia de "A las 19:00 te pregunto…" a «Mantén el dedo para alargar» · «Hold to extend» (sustituye, no añade). Con `prefers-reduced-motion`, igual.
- **Esfuerzo**: S

### TA-14 · Quitar la hora no quita la duración (en la ficha del compositor sí) · BAJO
- **Dónde**: `src/components/task/TaskSheet.tsx:99-101`, `state/reducer.ts:104-107` vs `lib/details.ts:83-84`
- **Qué ve/hace el usuario**: pone "Sin hora"; la regla desaparece. Si más tarde vuelve a poner hora, la duración antigua reaparece sin que la haya pedido.
- **Problema**: inconsistencia entre los dos sitios que editan lo mismo; estado fantasma.
- **Propuesta**: en `task/setTime` con `null`, `duration: null` (como `withTime` en `details.ts`). Un test en `reducer.test.ts`.
- **Esfuerzo**: S

### TA-15 · Elegir como hora de acabar la de empezar no hace nada, en silencio · BAJO
- **Dónde**: `src/components/task/DurationPicker.tsx:158-161`
- **Qué ve/hace el usuario**: en la rueda deja 17:00 → 17:00; la píldora sigue diciendo "Hasta…" y no pasa nada.
- **Problema**: feedback.
- **Propuesta**: toast «Tiene que acabar después de empezar» · «It has to end after it starts».
- **Esfuerzo**: S

### TA-16 · Un aviso se quita tocando la píldora entera, sin deshacer; la del plazo, idéntica, hace lo contrario · ALTO
- **Dónde**: `src/components/task/ReminderPicker.tsx:112-123` (la píldora es el botón de quitar) vs `fields.tsx:85-109` (la píldora abre el selector y solo la × anidada quita); estilo común `sheet.css:206-219, 263-275`
- **Qué ve/hace el usuario**: dos píldoras coñac con ×: "Hasta el viernes" y "Mañana 9:00". Toca la segunda para cambiarle la hora y desaparece. Si era un "Otra…" (fecha y hora a mano), tiene que volver a meterlo entero.
- **Problema**: affordance inconsistente y destructive-emphasis sin undo.
- **Propuesta**: en `ReminderPicker`, la × es un botón propio (`chip__clear`, como en el plazo) y el cuerpo de la píldora no hace nada (o, para los `at`, abre un `PickerChip` con su fecha para cambiarla). Al quitar, toast «Aviso quitado · Deshacer» · «Reminder removed · Undo» que vuelve a hacer `reminder/add` con el mismo borrador.
- **Esfuerzo**: S

### TA-17 · "Al llegar"/"Al salir" es una píldora que cambia de texto · MEDIO
- **Dónde**: `src/components/task/ReminderPicker.tsx:155-162`
- **Qué ve/hace el usuario**: en la fila de lugares aparece "Al llegar" sin resaltar junto a "Casa", "Mercadona". Parece una opción más: la toca pensando que añade algo y cambia a "Al salir" en marino macizo, el estilo de "elegido". Ahora no sabe si ha puesto un aviso.
- **Problema**: control ambiguo (toggle disfrazado de opción) y el estado activo solo en uno de los dos valores.
- **Propuesta**: dos píldoras fijas, «Al llegar» | «Al salir» · «Arriving» | «Leaving», la elegida en marino (`is-active`), las dos con `aria-pressed`. Y las píldoras de lugar dicen la frase entera: «Al llegar a Casa» · «Arriving at Home» (`placeTriggerLabel` ya existe en `lib/places.ts`).
- **Esfuerzo**: S

### TA-18 · "+ Añadir" no se puede plegar y sigue ofreciendo avisos en una tarea hecha · BAJO
- **Dónde**: `src/components/task/ReminderPicker.tsx:126-150`
- **Qué ve/hace el usuario**: toca "+ Añadir", salen cinco o seis atajos y la fila de lugares; se arrepiente y no hay forma de recogerlos salvo cerrar el panel. En una tarea tachada se sigue ofreciendo "En 1 h", que nunca sonará (`isPending` devuelve `false` con `done`).
- **Problema**: progressive-disclosure sin vuelta atrás; opciones inútiles.
- **Propuesta**: con `adding`, la primera píldora pasa a ser «Listo» · «Done» (vuelve a "+ Añadir"); con `task.done`, no pintar "+ Añadir".
- **Esfuerzo**: S

### TA-19 · Un aviso "antes" atenuado no dice por qué · BAJO
- **Dónde**: `src/components/task/ReminderPicker.tsx:95-98`, `sheet.css:221-224`
- **Qué ve/hace el usuario**: quita la hora y "15 min antes" se queda al 50 %. No sabe si está roto, si sonará o si lo tiene que borrar.
- **Problema**: estado sin explicación.
- **Propuesta**: la píldora atenuada añade un sufijo corto: «15 min antes · sin hora» · «15 min before · no time»; o si ya sonó, «· pasado» · «· past». Sin nota aparte.
- **Esfuerzo**: S

### TA-20 · "+ Nueva" sección: iOS hace zoom y, al perder el foco, se pierde lo escrito · MEDIO
- **Dónde**: `src/components/task/fields.tsx:179-196`; `.chip` fija 13 px (`sheet.css:114`) y pisa los 16 px de `input` (`styles/base.css:37-45`)
- **Qué ve/hace el usuario**: toca "+ Nueva", el campo recibe el foco y Safari hace zoom a la pantalla (fuente < 16 px). Escribe "Compra", toca fuera o "OK" en la barra del teclado: el campo desaparece y no se crea nada.
- **Problema**: data-loss por `onBlur={() => setDraft(null)}`; y la regla de CLAUDE.md ("Los inputs van a 16px").
- **Propuesta**: `.sheet__chips input.chip { font-size: 16px }`; en `onBlur`, crear si hay texto (como `RoutineSheet.commitTitle` guarda el nombre al salir) y solo cancelar con Escape o vacío.
- **Esfuerzo**: S

### TA-21 · Cambiar Cuándo desde el panel saca la tarea de la vista sin decir adónde · MEDIO
- **Dónde**: `src/components/task/TaskSheet.tsx:91-93` (`moveTo`), sin toast; contraste con `App.tsx:305-319` (al añadir sí: «X → Mañana · Ver»)
- **Qué ve/hace el usuario**: mirando el lunes, abre una tarea, toca "Sin fecha" o "Mañana", cierra… y la fila ya no está. No hay "Ver" ni "Deshacer". Con "Sin fecha", además, pierde la sección sin aviso (`reducer.ts:58`).
- **Problema**: orientación entre pantallas (el usuario no sabe adónde ha ido lo que hizo).
- **Propuesta**: al cerrar el panel, si `task.date` cambió respecto al día o pestaña visible, el mismo toast que al añadir: «X → Bandeja · Ver» / «X → Mañana · Ver» (y «· sin sección» si tenía). Reutilizar `addTask`'s toast moviéndolo a un helper.
- **Esfuerzo**: S

### TA-22 · Con un plazo en curso, el panel marca el día en que empezó como si fuera "su día" · BAJO
- **Dónde**: `src/components/task/fields.tsx:68-84`; `lib/period.ts:29-33`
- **Qué ve/hace el usuario**: una tarea "del lunes al viernes" se ve hoy (miércoles) con "Hasta el viernes". Abre el panel: Cuándo muestra "lun 6 oct" en activo y "Hasta el viernes". Parece que es del lunes y está atrasada.
- **Problema**: el panel y la fila cuentan cosas distintas.
- **Propuesta**: con `hasPeriod`, en vez de "Otro día" activo, una píldora «Del 6 al 10 oct» · «Oct 6 – 10» (`periodLabel`) activa que abre el selector del primer día; "Hasta…" sigue para el último.
- **Esfuerzo**: S

### TA-23 · El panel no tiene título visible ni cierre explícito; el asa mide 28 px · BAJO
- **Dónde**: `src/components/ui/Sheet.tsx:131, 151-163`; `sheet.css:44-62`
- **Qué ve/hace el usuario**: una hoja que sube con una rayita; "Editar tarea"/"Rutina" solo existe para VoiceOver. Para cerrar: tirar de la raya (zona de 28 px), tocar fuera o Escape.
- **Problema**: touch-target-size del asa; en los paneles largos (tarea con todo, rutina con constancia) tocar fuera obliga a volver arriba.
- **Propuesta**: `sheet__grab { padding: 20px 0 }` (44 px); y un título visible en versalitas junto al asa es opcional: el panel ya se entiende por el campo de título. No añadir botón "Cerrar".
- **Esfuerzo**: S

### TA-24 · Intro en el título de la tarea mete un salto de línea · BAJO
- **Dónde**: `src/components/task/TaskSheet.tsx:108-116` (vs `RoutineSheet.tsx:183`, que lo sustituye por espacio)
- **Qué ve/hace el usuario**: pulsa Intro para "terminar" y el título crece una línea; se guarda como espacio al cerrar, pero hasta entonces parece que admite varias líneas.
- **Propuesta**: Intro = `blur()` (guarda y suelta el teclado) y `replace(/\n/g, ' ')` como en la rutina.
- **Esfuerzo**: S

### TA-25 · Escala 1–10: diez botones de ~33 px de ancho, sin arrastre, y visible también en lo hecho · MEDIO
- **Dónde**: `src/components/importance/ImportanceScale.tsx:17-39`, `importance.css:53-88`
- **Qué ve/hace el usuario**: diez números en una fila de 350 px; dar al 6 queriendo el 7 es fácil. En una tarea tachada la escala sigue a la vista aunque no cambie nada (`TaskRow.tsx:42`: hecha → tamaño normal).
- **Problema**: touch-target-size (33 px de ancho) y ruido en lo hecho.
- **Propuesta**: aceptar el arrastre por la escala (captura de puntero como `Slider`, vibración en cada paso: un gesto perdona el dedo gordo) y, con `done`, atenuar la escala o plegarla. Y plegarla en general: una fila «Importancia · 3» · «Importance · 3» que al tocarla despliega la escala (ver TA-26).
- **Esfuerzo**: M

### TA-26 · El panel enseña ~25 controles de golpe · MEDIO
- **Dónde**: `src/components/task/TaskSheet.tsx:118-173`
- **Qué ve/hace el usuario**: para una tarea con día y hora: título, 10 de importancia, 5 de Cuándo, 2 de Hora, la regla con cabecera y nota, los avisos con "+ Añadir", N+2 de Sección y 2 filas de acciones. Hay que hacer scroll para llegar a Borrar.
- **Problema**: progressive-disclosure. Lo condicional ya está bien hecho (Hora solo con día, Duración solo con hora, Sección solo con día); lo que sobra a la vista es lo que casi nunca se cambia.
- **Propuesta**: Importancia y Sección como filas compactas (`sheet__row`) con el valor actual («Sección · Compra ›», «Importancia · 1 ›») que despliegan sus píldoras al tocarlas; abiertas de serie solo si ya tienen valor distinto del normal. Acciones puede quedarse como está (dos filas).
- **Esfuerzo**: M

### TA-27 · Deshacer "Convertir en rutina" deja abierto el panel de una rutina que ya no existe · MEDIO
- **Dónde**: `src/App.tsx:287-303` (abre `RoutineSheet` y el toast borra la rutina); `routines/RoutineSheet.tsx:92, 115-122` (`routine` null → nada guarda, no hay Borrar ni Añadir)
- **Qué ve/hace el usuario**: convierte, se abre el panel de la rutina, toca "Deshacer" en el toast: la tarea vuelve, pero el panel sigue ahí con nombre, días y hora editables que no van a ninguna parte. Callejón sin salida hasta que lo cierra.
- **Problema**: dead-end.
- **Propuesta**: en `onAction` del toast, además `setRoutineId(null)`. Y como red: `RoutineSheet` se cierra solo si `shownId` no es `''` y la rutina desaparece del estado.
- **Esfuerzo**: S

### TA-28 · "Convertir en rutina" nace "cada día" aunque la tarea fuera de un martes, y pierde avisos y sección sin decirlo · BAJO
- **Dónde**: `src/App.tsx:290`
- **Qué ve/hace el usuario**: "Entrenar" del martes a las 19:00 pasa a ser diaria; tiene que ir a los días y quitar seis.
- **Propuesta**: si la tarea tiene fecha, `weeklyPreset([], task.date)` (ese día de la semana); si no, todos. El toast ya tiene Deshacer; añadir «· cada día» o «· los martes» al mensaje para que vea lo que ha salido.
- **Esfuerzo**: S

### TA-29 · SnoozeBar: "Hecha" con estilo de "elegido" y posponer sin deshacer · BAJO
- **Dónde**: `src/components/task/SnoozeBar.tsx:28-54`
- **Qué ve/hace el usuario**: tres píldoras de contorno discontinuo ("+10 min", "+1 h", "Mañana 9:00") y una marina maciza "Hecha", que en el resto del panel significa "esto es lo que está elegido". Posponer cierra el panel con un toast informativo sin acción.
- **Propuesta**: si se adopta TA-09, quitar "Hecha" de aquí; si no, `chip--reminder`. El toast de posponer con «Deshacer» (`reminder/remove` del aviso recién creado).
- **Esfuerzo**: S

### TA-30 · Una rutina nueva se crea al cerrar el panel, sin toast ni deshacer; "Añadir rutina" va al final del scroll · ALTO
- **Dónde**: `src/components/routines/RoutineSheet.tsx:145-152` (crea en `close`), `:254-258` (botón dentro del `sheet__body`, no en `footer`); `ui/Sheet.tsx:21-22` ofrece `footer` fijo
- **Qué ve/hace el usuario**: toca "+", escribe "Correr", decide que no y tira del panel hacia abajo (o toca fuera): la rutina se crea igual, en silencio (vibra `success`, sin toast). Si sí quiere crearla, el botón "Añadir rutina" está debajo de Días y Aviso, tapado por el teclado que ha subido solo (`autoFocus`).
- **Problema**: cerrar = cancelar en cualquier panel de iOS; aquí cerrar = guardar. Y la acción principal no está a mano.
- **Propuesta**: `footer={<button className="sheet__primary" disabled={!title}>Añadir rutina</button>}` (siempre visible, también con teclado: `sheet__foot` ya lo contempla). Si se quiere conservar "cerrar también crea" (CLAUDE.md lo da por diseño), al menos el toast de `addRoutine` (`App.tsx:278-282`): «Rutina: 🏃 Correr · Cada día · Deshacer». Mi recomendación: cerrar cancela; el pie crea.
- **Esfuerzo**: S

### TA-31 · El "+" de Rutinas mide 32×32 · BAJO
- **Dónde**: `src/components/routines/RoutinesBlock.tsx:68-70` usa `section__icon` (`section/section.css:113-122`); el + de las secciones sí crece a 44 (`section__icon--add::after`, `:131-140`)
- **Propuesta**: `className="section__icon section__icon--add"`.
- **Esfuerzo**: S

### TA-32 · "A una hora" se lee como "en una hora"; la ficha del compositor dice "Elegir hora" · MEDIO
- **Dónde**: `src/components/routines/RoutineSheet.tsx:53, 70, 225-232` vs `compose/ComposeSheet.tsx:254` + `task/fields.tsx:119-139` (`TimeField` ya admite `title="Aviso"` y `noneLabel="Sin aviso"` precisamente para rutinas)
- **Qué ve/hace el usuario**: en el panel de la rutina, bajo "Aviso": "Sin aviso" | "A una hora". En inglés, "At a time". En la ficha al escribir "todos los días…": "Sin aviso" | "Elegir hora".
- **Problema**: i18n (ambigüedad en español, calco en inglés) y dos textos para el mismo control.
- **Propuesta**: `RoutineSheet` usa `<TimeField title={copy.reminder} noneLabel={copy.noReminder} …/>` y borra sus píldoras propias; queda «Elegir hora» · «Pick a time» y, elegida, «10:00» · «10:00 AM» (sin "A las": la cabecera ya dice Aviso).
- **Esfuerzo**: S

### TA-33 · Quitar el último día no hace nada y no lo dice · BAJO
- **Dónde**: `src/components/routines/RoutineSheet.tsx:133-139`
- **Propuesta**: `haptic('warning')` y una sacudida corta del círculo (`transform` 2 × 3 px); `aria-disabled` cuando es el último.
- **Esfuerzo**: S

### TA-34 · Constancia: nada indica que los días se tocan y se pintan · MEDIO
- **Dónde**: `src/components/routines/RoutineLog.tsx:185-229`, `routines.css:375-447`
- **Qué ve/hace el usuario**: una cuadrícula de cinco semanas con números; los hechos en coñac. Parece un calendario de solo lectura. Que un toque marque y que pasar el dedo pinte varios (la razón de ser: rehacer una rutina borrada) no se descubre; no hay lámina en la bienvenida.
- **Problema**: discoverability de una función que existe para un caso de rescate.
- **Propuesta**: una línea `sheet__note` bajo la cuadrícula, solo esta vez con texto: «Toca un día para corregirlo» · «Tap a day to fix it». O mejor, sin texto: los días pasados que tocaban y no se hicieron llevan el aro hueco un punto más marcado (`--line-2` → `--accent-line`) y al abrir el panel el día de hoy hace el mismo `log-ink` de rebote.
- **Esfuerzo**: S

### TA-35 · "30 días" como rótulo de un porcentaje · BAJO
- **Dónde**: `src/components/routines/RoutineLog.tsx:16, 25, 157-160`
- **Qué ve/hace el usuario**: tres cifras: "12 Racha", "20 Mejor", "73 % 30 días". La tercera hay que pensarla.
- **Propuesta**: «Último mes» · «Last 30 days» (cabe en dos líneas con `fs-micro`).
- **Esfuerzo**: S

### TA-36 · "Otro" emoji: teclear letras no hace nada y nadie dice que haga falta el teclado de emojis · BAJO
- **Dónde**: `src/components/routines/EmojiPicker.tsx:49-61`
- **Qué ve/hace el usuario**: toca el hueco "Otro", sale el teclado normal, escribe "p" y no pasa nada (el campo se queda vacío).
- **Propuesta**: placeholder «😊 Otro» · «😊 Other» (el emoji del placeholder ya sugiere el teclado), y si llega un carácter que no es emoji, toast corto «Usa el teclado de emojis» · «Use the emoji keyboard» (una vez por apertura).
- **Esfuerzo**: S

### TA-37 · Se puede tachar hoy una rutina que hoy no toca · BAJO
- **Dónde**: `src/components/routines/RoutineRow.tsx:57, 61-68` (el círculo y deslizar funcionan en `is-off`)
- **Qué ve/hace el usuario**: la fila va al 50 %, pero el círculo responde; queda "hecha" un lunes una rutina de domingos. No rompe la racha ni el %, así que es inocuo; solo desconcierta si fue sin querer.
- **Propuesta**: mantenerlo (es "la hice aunque no tocaba"), pero con `haptic('tap')` en vez de `success` y sin el relleno de rebote; o pedir el deslizamiento completo (no el toque) en `is-off`. Decisión del dueño.
- **Esfuerzo**: S

### TA-38 · Los puntos de la semana son de 7 px y "no tocaba" una raya de 1,5 px · BAJO
- **Dónde**: `src/components/routines/routines.css:124-137`
- **Qué ve/hace el usuario**: siete puntitos a la derecha de cada rutina; distinguir hueco, lleno y raya exige mirar de cerca; no hay leyenda (solo `aria-label`).
- **Propuesta**: 9 px con `gap: 5px`; "no tocaba" como punto hueco más pequeño (5 px) en vez de raya. Nada de leyenda.
- **Esfuerzo**: S

### TA-39 · Las rutinas sin hora no se pueden reordenar · BAJO
- **Dónde**: `src/lib/routines.ts:170-171` (`order` solo se asigna al crear); `RoutineRow.tsx` sin `hold`
- **Qué ve/hace el usuario**: las tareas se cogen manteniéndolas; las rutinas no, y el orden es el de creación.
- **Propuesta**: aplazable. Si se hace, el mismo `SortableTask`-like con `scope/reorder` para rutinas.
- **Esfuerzo**: M

### TA-40 · "Otro día" no avisa de que abre un selector; en inglés suena raro · BAJO
- **Dónde**: `src/components/task/fields.tsx:23, 39`
- **Qué ve/hace el usuario**: "Hoy", "Mañana", "Sin fecha" conmutan; "Otro día" abre un calendario, con el mismo aspecto. Las demás píldoras que abren algo llevan puntos suspensivos ("Elegir hora" no, "Otra…", "Hasta…" sí).
- **Propuesta**: «Otro día…» · «Pick a day…»; «Elegir hora…» · «Pick a time…». Regla: puntos suspensivos = abre algo.
- **Esfuerzo**: S

### TA-41 · Píldoras de 38 px y las × de 32 px · MEDIO
- **Dónde**: `.chip` (`src/components/ui/sheet.css:105-119`, `min-height: 38px`), `.chip__clear` (`:268-275`, 32 px), `.ruler__clear` (`task/ruler.css:53-64`, 32 px), `.emoji-picker__cell` (`routines.css:229-238`, 38 px), `.routine-log__arrow` (`:357-365`, 44×36)
- **Qué ve/hace el usuario**: casi todo lo que se toca en los paneles está por debajo de los 44 pt de iOS; en los paneles el dedo va deprisa.
- **Propuesta**: `.chip { min-height: 42px }` (o `::after { inset: -3px 0 }` sin cambiar el aspecto); `.chip__clear`, `.ruler__clear` con `::after { inset: -6px }`.
- **Esfuerzo**: S

### TA-42 · En el panel abierto desde un aviso de una tarea atrasada falta "Pasar a hoy" · BAJO
- **Dónde**: `src/components/task/TaskSheet.tsx:121-127`; la notificación sí lo ofrece (`schedule.ts`, `useNotificationActions.ts:132`)
- **Qué ve/hace el usuario**: toca el aviso de "Pendiente desde ayer", se abre el panel con Posponer; "Hoy" en Cuándo lo mueve, pero sin el toast «A hoy: X · Deshacer» que tiene el botón de Atrasadas.
- **Propuesta**: con `overdue`, la píldora "Hoy" de Cuándo usa `actions.toToday([task.id])` (mismo toast y deshacer).
- **Esfuerzo**: S

### TA-43 · Se pueden añadir avisos y plazo a una tarea en el pasado · BAJO
- **Dónde**: `src/components/task/fields.tsx:85-92` (`min = date + 1` aunque `date` sea de hace una semana)
- **Qué ve/hace el usuario**: en una tarea atrasada, "Hasta…" permite elegir un día ya pasado: el plazo nace acabado y la tarea sigue atrasada, sin que nada lo diga.
- **Propuesta**: `min = max(addDays(date, 1), today)`.
- **Esfuerzo**: S

## Lo que está bien (para no tocarlo)

- **Deslizar**: umbral de 84 px más golpe rápido (`useSwipe.ts:14-19, 211-212`), vibración al armar, resistencia en el lado sin acción (horario de rutinas), el `click` posterior descartado, el borrado siempre con «Deshacer» (`useTaskActions.ts:48-62, 109-123`).
- **Mantener pulsado**: 300 ms con tolerancia 8 px, la fila se hunde (`is-pressing`) y vibra al cogerse; no compite con deslizar ni con scroll. El menú contextual del sistema anulado.
- **Campos condicionales del panel**: Hora solo con día, Duración solo con hora, Sección solo con día, la nota de la pregunta solo si no está hecha. Es progressive disclosure bien hecha.
- **`PickerChip`**: guardar al cerrar y no en cada giro (arregla el fallo de iOS), guarda al desmontar, `min` en el plazo, `showPicker` solo con ratón.
- **Avisos**: atajos filtrados (solo futuros y no repetidos), "Esa hora ya ha pasado" al elegir a mano, `PushHint` con estados *off / needs-install / denied* y botón con `disabled` mientras trabaja; «Elegir dónde está X» cuando un lugar no tiene ubicación; "Otro lugar…" abre el editor encima y vuelve con el aviso puesto.
- **Regla**: `role="slider"` con teclado, `aria-valuetext`, la hora de acabar como atajo exacto, la vuelta al tramo holgado al soltar.
- **Constancia**: el gesto de pintar respeta el scroll (`PAINT_SLOP`, `PAINT_SLANT`, `touch-action: pan-y`), rellena los días saltados en un barrido, flechas con `disabled`, futuro bloqueado.
- **Rutinas**: orden "tocan hoy sin hacer → hechas → no tocan", emoji sugerido en vivo con rebote, "sin emoji" como opción, racha solo desde 2, la nota "Se renuevan a las 00:00" discreta y con la hora como único sitio tocable (zona de 44 px), «Deshacer» al borrar.
- **Accesibilidad**: todos los iconos solos llevan `aria-label`; círculos con `aria-pressed`; la semana como `role="img"` con "Últimos 7 días: 5 de 6"; `role="radiogroup"` en la escala; botón "Mover" para teclado.
- **Modo oscuro**: ni un color fijo en toda el área; todo sale de `tokens.css`.
- **Idiomas**: las tablas `COPY` dicen lo mismo con el mismo tono en los dos; fechas y horas en formato de cada idioma (`relativeLabel`, `shortTime`, `durationLabel`). Las únicas pegas están en TA-11, TA-32, TA-35 y TA-40.

## Inventario de controles

| Control | Pantalla | Qué hace | Veredicto |
|---|---|---|---|
| Círculo `row__check` | Fila (Bandeja/Agenda) | Tacha o destacha; 44 px; `aria-pressed` | OK |
| Cuerpo `row__main` | Fila | Abre el panel de la tarea | OK |
| Deslizar → | Fila | Tachar (o destachar) con vibración | REVISAR (TA-01, TA-03) |
| Deslizar ← | Fila | Borrar con «Deshacer» | REVISAR (TA-01, TA-05) |
| Mantener pulsado | Fila | Coger para reordenar o soltar en un día | REVISAR (TA-02) |
| Botón "Mover" (sr-only) | Fila | Arrastre con teclado | OK |
| Mando de importancia | Fila, modo "Aa" | Arrastrar cambia 1–10; toque +1 (10→1) | REVISAR (TA-06, TA-07, TA-08) |
| Botón "Aa" | Bandeja/Agenda, arriba dcha. | Entra/sale del modo importancia; 42 px | REVISAR (TA-06) |
| Cápsula `tl__node` | Horario | Tachar; 44 px | OK |
| Cuerpo `tl__body` | Horario | Abre la tarea / la rutina | OK |
| Deslizar fila del horario | Horario | Tarea: tachar/borrar; rutina: solo tachar (resistencia a la izq.) | OK |
| Título (textarea) | Panel tarea | Renombra al salir del campo o cerrar | REVISAR (TA-24) |
| Escala 1–10 | Panel tarea | Importancia | REVISAR (TA-10, TA-25, TA-26) |
| Hoy / Mañana / Sin fecha | Panel tarea › Cuándo | Mueve la tarea de día | REVISAR (TA-21) |
| Otro día (PickerChip) | Panel tarea › Cuándo | Calendario nativo | REVISAR (TA-22, TA-40) |
| Hasta… / «Hasta el viernes» + × | Panel tarea › Cuándo | Plazo; la × lo quita | REVISAR (TA-11, TA-43) |
| Sin hora / Elegir hora | Panel tarea › Hora | Hora de la tarea | REVISAR (TA-14, TA-40) |
| Regla (pista) | Panel tarea › Duración | Arrastrar/tocar fija; mantener al final estira | REVISAR (TA-12, TA-13) |
| Hora de acabar (PickerChip) | Regla | Rueda de hora exacta | REVISAR (TA-11, TA-15) |
| × de la regla | Regla | Quita la duración; 32 px | REVISAR (TA-41) |
| Píldora de aviso + × | Panel tarea › Recordatorios | Tocar = quitar, sin deshacer | REVISAR (TA-16) |
| + Añadir | Recordatorios | Despliega atajos y lugares | REVISAR (TA-18) |
| Atajos (A la hora, 15 min antes, En 1 h…) | Recordatorios | Añaden un aviso | OK |
| Otra… | Recordatorios | Fecha y hora a mano; rechaza pasado | OK |
| Al llegar / Al salir | Recordatorios (iPhone) | Conmuta el sentido del aviso de lugar | REVISAR (TA-17) |
| Píldoras de lugar / Otro lugar… | Recordatorios (iPhone) | Añaden aviso de lugar / abren el editor | OK |
| «Elegir dónde está X» | Recordatorios | Abre el lugar sin ubicación | OK |
| «Activar avisos…» / notas de push | Recordatorios | Estado del permiso; `disabled` mientras trabaja | OK |
| Ninguna / secciones / + Nueva | Panel tarea › Sección | Cambia la sección; crea una | REVISAR (TA-20, TA-26) |
| Convertir en rutina | Panel tarea › Acciones | Crea rutina diaria, borra la tarea, abre su panel, «Deshacer» | REVISAR (TA-27, TA-28) |
| Borrar tarea | Panel tarea › Acciones | Borra con «Deshacer» | OK |
| (falta) Hecha | Panel tarea | — | REVISAR (TA-09) |
| +10 min / +1 h / Mañana 9:00 | Panel desde aviso › Posponer | Pospone y cierra; toast sin acción | REVISAR (TA-29) |
| Hecha | Panel desde aviso | Tacha y cierra | REVISAR (TA-09, TA-29) |
| Asa / tocar fuera / Escape | Cualquier panel | Cierra | REVISAR (TA-23) |
| Cabecera Rutinas (plegar) | Bandeja | Pliega el bloque; "2/3" | OK |
| + Rutinas | Bandeja | Panel de rutina nueva; 32 px | REVISAR (TA-31) |
| «Nueva rutina» (vacío) | Bandeja | Panel de rutina nueva | OK |
| Hora de «Se renuevan a las» | Bandeja | Rueda; `settings/dayStart`; 44 px | OK |
| Círculo de rutina | Fila de rutina | Tacha hoy (también si no toca) | REVISAR (TA-37) |
| Cuerpo de rutina | Fila de rutina | Abre el panel | OK |
| Puntos de la semana | Fila de rutina | Solo informa | REVISAR (TA-38) |
| Deslizar fila de rutina | Fila de rutina | → tacha hoy; ← borra con «Deshacer» | OK |
| Sello de emoji | Panel rutina | Abre/cierra la lámina de emojis | OK |
| Lámina de emojis / Sin emoji / Otro | Panel rutina | Elige; "Otro" teclea uno | REVISAR (TA-36) |
| Nombre (textarea) | Panel rutina | Guarda al salir del campo; sugiere emoji | OK |
| L M X J V S D | Panel rutina › Días | Conmutan; el último no se quita | REVISAR (TA-33) |
| Cada día / Entre semana / Fines de semana / Los martes | Panel rutina › Días | Atajos | OK |
| Sin aviso / A una hora | Panel rutina › Aviso | Hora del aviso diario | REVISAR (TA-32) |
| Racha / Mejor / 30 días | Panel rutina › Constancia | Cifras | REVISAR (TA-35) |
| ← → semanas | Constancia | Páginas de 5 semanas, `disabled` en los topes; 44×36 | OK |
| Días de la cuadrícula | Constancia | Toque marca/desmarca; pasar el dedo pinta | REVISAR (TA-34) |
| Borrar rutina | Panel rutina › Acciones | Borra con «Deshacer» | OK |
| Añadir rutina | Panel rutina nueva | Crea; `disabled` sin nombre; al final del scroll | REVISAR (TA-30) |
| Cerrar el panel de rutina nueva | Panel rutina nueva | También crea si hay nombre | REVISAR (TA-30) |
| Slider de radio | Panel de lugar | Arrastre con burbuja y vibración | REVISAR (TA-12, mismo conflicto) |
